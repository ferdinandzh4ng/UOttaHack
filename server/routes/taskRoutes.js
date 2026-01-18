import express from 'express';
import Task from '../models/Task.js';
import aiRouterService from '../services/aiRouterService.js';
import groupingService from '../services/groupingService.js';

const router = express.Router();

// Create a new task
router.post('/create', async (req, res) => {
  try {
    const { type, topic, classId, length, questionType, numQuestions } = req.body;

    if (!type || !topic || !classId) {
      return res.status(400).json({ error: 'Type, topic, and class ID are required' });
    }

    if (type !== 'Lesson' && type !== 'Quiz') {
      return res.status(400).json({ error: 'Type must be either Lesson or Quiz' });
    }

    // Validate lesson-specific fields
    if (type === 'Lesson' && (!length || length < 1)) {
      return res.status(400).json({ error: 'Length is required for Lesson tasks (minimum 1 minute)' });
    }

    // Validate quiz-specific fields
    if (type === 'Quiz') {
      const validQuestionTypes = ['MCQ', 'True/False', 'Short Answer', 'Mixed'];
      if (questionType && !validQuestionTypes.includes(questionType)) {
        return res.status(400).json({ error: `Question type must be one of: ${validQuestionTypes.join(', ')}` });
      }
    }

    // Create new task with pending status
    const newTask = new Task({
      type,
      topic,
      class: classId,
      length: type === 'Lesson' ? length : undefined,
      lessonData: type === 'Lesson' ? { status: 'pending' } : undefined,
      quizData: type === 'Quiz' ? {
        questionType: questionType || 'MCQ',
        numQuestions: numQuestions || 5,
        status: 'pending'
      } : undefined
    });

    await newTask.save();

    // Create student groups and assign AI combos
    const groupingResult = await groupingService.createGroupsForTask(
      newTask._id,
      classId,
      type
    );

    // Start async generation for each group with different AI combos
    if (type === 'Lesson') {
      generateLessonVariants(newTask._id, topic, length, groupingResult.groups).catch(err => {
        console.error('Lesson generation error:', err);
      });
    } else if (type === 'Quiz') {
      generateQuizVariants(newTask._id, topic, questionType || 'MCQ', numQuestions || 5, groupingResult.groups).catch(err => {
        console.error('Quiz generation error:', err);
      });
    }

    res.status(201).json({
      message: 'Task created successfully. Generation in progress...',
      task: {
        id: newTask._id,
        type: newTask.type,
        topic: newTask.topic,
        class: newTask.class,
        length: newTask.length,
        status: type === 'Lesson' ? newTask.lessonData?.status : newTask.quizData?.status,
        createdAt: newTask.createdAt
      },
      groups: groupingResult.groups.length,
      message: groupingResult.message
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server error during task creation' });
  }
});

// Generate lesson variants for each group with different AI combos
async function generateLessonVariants(parentTaskId, topic, lengthMinutes, groups) {
  try {
    const parentTask = await Task.findById(parentTaskId);
    if (!parentTask) return;

    // Update parent task status to generating
    parentTask.lessonData.status = 'generating';
    await parentTask.save();

    // Generate a variant for each group
    const variantPromises = groups.map(async (group) => {
      try {
        // Create a task variant for this group
        const variantTask = new Task({
          type: 'Lesson',
          topic,
          class: parentTask.class,
          length: lengthMinutes,
          lessonData: { status: 'generating' },
          parentTask: parentTaskId,
          assignedGroup: group._id,
          aiModels: {
            scriptModel: group.aiCombo.scriptModel,
            imageModel: group.aiCombo.imageModel
          }
        });
        await variantTask.save();

        // Update group with variant reference
        group.taskVariantId = variantTask._id;
        await group.save();

        // Generate lesson with specific AI combo
        await generateLesson(
          variantTask._id,
          topic,
          lengthMinutes,
          group.aiCombo.scriptModel,
          group.aiCombo.imageModel
        );
      } catch (error) {
        console.error(`Error generating variant for group ${group.groupNumber}:`, error);
      }
    });

    await Promise.all(variantPromises);

    // Update parent task status based on variant results
    const updatedParentTask = await Task.findById(parentTaskId);
    if (updatedParentTask) {
      // Check all variant tasks
      const variantTasks = await Task.find({ parentTask: parentTaskId });
      const allCompleted = variantTasks.length > 0 && variantTasks.every(vt => 
        vt.lessonData?.status === 'completed'
      );
      const anyFailed = variantTasks.some(vt => 
        vt.lessonData?.status === 'failed'
      );

      if (allCompleted) {
        updatedParentTask.lessonData.status = 'completed';
        // Copy slides from the first completed variant to parent task for display
        const firstCompletedVariant = variantTasks.find(vt => 
          vt.lessonData?.status === 'completed' && vt.lessonData?.slides?.length > 0
        );
        if (firstCompletedVariant && firstCompletedVariant.lessonData?.slides) {
          updatedParentTask.lessonData.slides = firstCompletedVariant.lessonData.slides;
          updatedParentTask.lessonData.script = firstCompletedVariant.lessonData.script || '';
          console.log(`✅ Copied ${firstCompletedVariant.lessonData.slides.length} slides from variant to parent task ${parentTaskId}`);
        }
      } else if (anyFailed) {
        // If some failed but not all completed, check if any are still generating
        const anyGenerating = variantTasks.some(vt => 
          vt.lessonData?.status === 'generating'
        );
        if (!anyGenerating) {
          updatedParentTask.lessonData.status = 'failed';
        }
      }
      await updatedParentTask.save();
    }
  } catch (error) {
    console.error('Error generating lesson variants:', error);
    // Mark parent task as failed on error
    try {
      const parentTask = await Task.findById(parentTaskId);
      if (parentTask) {
        parentTask.lessonData.status = 'failed';
        await parentTask.save();
      }
    } catch (saveError) {
      console.error('Error updating parent task status:', saveError);
    }
  }
}

// Async function to generate lesson content with specific AI models
async function generateLesson(taskId, topic, lengthMinutes, scriptModel, imageModel) {
  try {
    const task = await Task.findById(taskId);
    if (!task) return;

    task.lessonData.status = 'generating';
    await task.save();

    // Step 1: Generate script with slides (routed through SAM with specific model)
    const scriptResult = await aiRouterService.executeTask('script.lesson', {
      topic,
      lengthMinutes,
      provider: scriptModel.provider,
      model: scriptModel.model
    });
    const scriptData = scriptResult;
    task.lessonData.script = scriptData.script || '';
    
    // Step 2: Generate images for each slide (routed through SAM with specific model)
    const slides = scriptData.slides || [];
    const imagePromises = slides.map((slide, index) =>
      aiRouterService.executeTask('image.slide', {
        slideScript: slide.script,
        slideNumber: slide.slideNumber || index + 1,
        topic,
        provider: imageModel.provider,
        model: imageModel.model
      }).catch(error => {
        console.error(`[Image ${index + 1}] Generation failed:`, error);
        return null; // Return null on error so we can continue with other slides
      })
    );
    const imageResults = await Promise.all(imagePromises);
    // Extract imageUrl from response objects (SAM bridge returns objects with _metadata)
    // Response can be: string URL, {imageUrl: "url"}, or {success: true, data: "url" or {imageUrl: "url"}}
    const imageUrls = imageResults.map((result, index) => {
      if (result === null || result === undefined) {
        console.warn(`[Image ${index + 1}] Result is null/undefined`);
        return '';
      }
      
      console.log(`[Image ${index + 1}] Raw result type:`, typeof result);
      console.log(`[Image ${index + 1}] Raw result:`, JSON.stringify(result).substring(0, 200));
      
      if (typeof result === 'string') {
        // Direct URL string
        console.log(`[Image ${index + 1}] Extracted URL (string):`, result.substring(0, 100));
        return result;
      } else if (result && typeof result === 'object') {
        // Check for nested data structure
        if (result.data) {
          // Response wrapped in {success: true, data: ...}
          const data = result.data;
          if (typeof data === 'string') {
            console.log(`[Image ${index + 1}] Extracted URL (data string):`, data.substring(0, 100));
            return data;
          } else if (data && typeof data === 'object') {
            const url = data.imageUrl || data.image_url || '';
            console.log(`[Image ${index + 1}] Extracted URL (data object):`, url.substring(0, 100));
            return url;
          }
        }
        // Direct object with imageUrl
        const url = result.imageUrl || result.image_url || result.url || '';
        console.log(`[Image ${index + 1}] Extracted URL (direct object):`, url.substring(0, 100));
        return url;
      }
      console.warn(`[Image ${index + 1}] Unexpected result type:`, typeof result, result);
      return '';
    });
    
    // Step 3: Generate speech for each slide (routed through SAM)
    // Strip markdown formatting from scripts before generating speech
    const stripMarkdown = (text) => {
      if (!text) return '';
      return text
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold **text**
        .replace(/\*(.*?)\*/g, '$1') // Remove italic *text*
        .replace(/__(.*?)__/g, '$1') // Remove bold __text__
        .replace(/_(.*?)_/g, '$1') // Remove italic _text_
        .replace(/`(.*?)`/g, '$1') // Remove inline code `code`
        .replace(/#{1,6}\s+/g, '') // Remove markdown headers
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links, keep text
        .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
        .trim();
    };
    
    const speechPromises = slides.map(slide =>
      aiRouterService.executeTask('speech.slide', {
        text: stripMarkdown(slide.script)
      })
    );
    const speechResults = await Promise.all(speechPromises);
    // Extract speechUrl from response objects (SAM bridge returns objects with _metadata)
    // Response can be: string URL, {speechUrl: "url"}, or {success: true, data: "url" or {speechUrl: "url"}}
    const speechUrls = speechResults.map((result, index) => {
      console.log(`[Speech ${index + 1}] Raw result:`, typeof result, result);
      
      if (typeof result === 'string') {
        // Direct URL string
        return result;
      } else if (result && typeof result === 'object') {
        // Check for nested data structure
        if (result.data) {
          // Response wrapped in {success: true, data: ...}
          const data = result.data;
          if (typeof data === 'string') {
            return data;
          } else if (data && typeof data === 'object') {
            return data.speechUrl || data.speech_url || '';
          }
        }
        // Direct object with speechUrl
        return result.speechUrl || result.speech_url || result.url || '';
      }
      console.warn(`[Speech ${index + 1}] Unexpected result type:`, result);
      return '';
    });

    // Combine slides with images and speech
    // Only set URLs if they're non-empty strings (not empty strings or null)
    task.lessonData.slides = slides.map((slide, index) => {
      const imageUrl = imageUrls[index];
      const speechUrl = speechUrls[index];
      
      console.log(`[Slide ${index + 1}] Final URLs - imageUrl: ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'EMPTY'}, speechUrl: ${speechUrl ? speechUrl.substring(0, 50) + '...' : 'EMPTY'}`);
      
      return {
        slideNumber: slide.slideNumber || index + 1,
        script: slide.script || '',
        imageUrl: (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') ? imageUrl : undefined,
        speechUrl: (speechUrl && typeof speechUrl === 'string' && speechUrl.trim() !== '') ? speechUrl : undefined
      };
    });

    task.lessonData.status = 'completed';
    await task.save();
    
    // Success message
    console.log(`✅ Lesson generation completed successfully!`);
    console.log(`   Task ID: ${taskId}`);
    console.log(`   Topic: ${topic}`);
    console.log(`   Slides generated: ${slides.length}`);
    console.log(`   Images generated: ${imageUrls.filter(url => url).length}/${imageUrls.length}`);
    console.log(`   Speech files generated: ${speechUrls.filter(url => url).length}/${speechUrls.length}`);
    console.log(`   Script model: ${scriptModel.provider}/${scriptModel.model}`);
    console.log(`   Image model: ${imageModel.provider}/${imageModel.model}`);
  } catch (error) {
    console.error('❌ Lesson generation error:', error);
    const task = await Task.findById(taskId);
    if (task) {
      task.lessonData.status = 'failed';
      await task.save();
      console.error(`   Task ID: ${taskId} marked as failed`);
    }
  }
}

// Generate quiz variants for each group with different AI combos
async function generateQuizVariants(parentTaskId, topic, questionType, numQuestions, groups) {
  try {
    const parentTask = await Task.findById(parentTaskId);
    if (!parentTask) return;

    // Update parent task status to generating
    parentTask.quizData.status = 'generating';
    await parentTask.save();

    // Generate a variant for each group
    const variantPromises = groups.map(async (group) => {
      try {
        // Create a task variant for this group
        const variantTask = new Task({
          type: 'Quiz',
          topic,
          class: parentTask.class,
          quizData: {
            questionType,
            numQuestions,
            status: 'generating'
          },
          parentTask: parentTaskId,
          assignedGroup: group._id,
          aiModels: {
            quizPromptModel: group.aiCombo.quizPromptModel,
            quizQuestionsModel: group.aiCombo.quizQuestionsModel
          }
        });
        await variantTask.save();

        // Update group with variant reference
        group.taskVariantId = variantTask._id;
        await group.save();

        // Generate quiz with specific AI combo
        await generateQuiz(
          variantTask._id,
          topic,
          questionType,
          numQuestions,
          group.aiCombo.quizPromptModel,
          group.aiCombo.quizQuestionsModel
        );
      } catch (error) {
        console.error(`Error generating variant for group ${group.groupNumber}:`, error);
      }
    });

    await Promise.all(variantPromises);

    // Update parent task status based on variant results
    const updatedParentTask = await Task.findById(parentTaskId);
    if (updatedParentTask) {
      // Check all variant tasks
      const variantTasks = await Task.find({ parentTask: parentTaskId });
      const allCompleted = variantTasks.length > 0 && variantTasks.every(vt => 
        vt.quizData?.status === 'completed'
      );
      const anyFailed = variantTasks.some(vt => 
        vt.quizData?.status === 'failed'
      );

      if (allCompleted) {
        updatedParentTask.quizData.status = 'completed';
      } else if (anyFailed) {
        // If some failed but not all completed, check if any are still generating
        const anyGenerating = variantTasks.some(vt => 
          vt.quizData?.status === 'generating'
        );
        if (!anyGenerating) {
          updatedParentTask.quizData.status = 'failed';
        }
      }
      await updatedParentTask.save();
    }
  } catch (error) {
    console.error('Error generating quiz variants:', error);
    // Mark parent task as failed on error
    try {
      const parentTask = await Task.findById(parentTaskId);
      if (parentTask) {
        parentTask.quizData.status = 'failed';
        await parentTask.save();
      }
    } catch (saveError) {
      console.error('Error updating parent task status:', saveError);
    }
  }
}

// Async function to generate quiz content with specific AI models
async function generateQuiz(taskId, topic, questionType, numQuestions, promptModel, questionsModel) {
  try {
    const task = await Task.findById(taskId);
    if (!task) return;

    task.quizData.status = 'generating';
    await task.save();

    // Step 1: Generate quiz prompt (routed through SAM with specific model)
    const promptResult = await aiRouterService.executeTask('quiz.prompt', {
      topic,
      questionType,
      numQuestions,
      provider: promptModel.provider,
      model: promptModel.model
    });
    const quizPrompt = typeof promptResult === 'string' ? promptResult : promptResult.text || promptResult;
    task.quizData.prompt = typeof quizPrompt === 'string' ? quizPrompt : quizPrompt.text || JSON.stringify(quizPrompt);

    // Step 2: Generate questions and answers (routed through SAM with specific model)
    const questionsResult = await aiRouterService.executeTask('quiz.questions', {
      quizPrompt: task.quizData.prompt,
      topic,
      questionType,
      numQuestions,
      provider: questionsModel.provider,
      model: questionsModel.model
    });
    const questionsData = questionsResult;

    // Parse and format questions
    console.log('[Generate Quiz] Questions result:', JSON.stringify(questionsData, null, 2));
    
    // Helper function to get valid question type
    const getValidQuestionType = (questionType, fallbackType) => {
      // If question has its own type, use it if valid, otherwise use fallback
      if (questionType && ['MCQ', 'True/False', 'Short Answer'].includes(questionType)) {
        return questionType;
      }
      // If fallback is 'Mixed', default to 'MCQ' since 'Mixed' is not valid for individual questions
      if (fallbackType === 'Mixed') {
        return 'MCQ';
      }
      // Otherwise use fallback if it's valid
      if (fallbackType && ['MCQ', 'True/False', 'Short Answer'].includes(fallbackType)) {
        return fallbackType;
      }
      // Final fallback
      return 'MCQ';
    };

    if (questionsData.questions && Array.isArray(questionsData.questions)) {
      task.quizData.questions = questionsData.questions.map((q, index) => ({
        questionNumber: index + 1,
        question: q.question || '',
        type: getValidQuestionType(q.type, questionType),
        options: q.options || [],
        correctAnswer: q.correctAnswer || '',
        explanation: q.explanation || ''
      }));
      console.log(`[Generate Quiz] Saved ${task.quizData.questions.length} questions to task ${taskId}`);
    } else if (Array.isArray(questionsData)) {
      // Handle case where questionsData is directly an array
      task.quizData.questions = questionsData.map((q, index) => ({
        questionNumber: index + 1,
        question: q.question || '',
        type: getValidQuestionType(q.type, questionType),
        options: q.options || [],
        correctAnswer: q.correctAnswer || '',
        explanation: q.explanation || ''
      }));
      console.log(`[Generate Quiz] Saved ${task.quizData.questions.length} questions (from array) to task ${taskId}`);
    } else {
      // Fallback if structure is different
      console.warn('[Generate Quiz] Unexpected questions data structure:', typeof questionsData, questionsData);
      task.quizData.questions = [];
    }

    task.quizData.status = 'completed';
    await task.save();
  } catch (error) {
    console.error('Quiz generation error:', error);
    const task = await Task.findById(taskId);
    if (task) {
      task.quizData.status = 'failed';
      await task.save();
    }
  }
}

// Get all tasks for a class (parent tasks only, not variants)
router.get('/class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;

    const tasks = await Task.find({ 
      class: classId,
      parentTask: null // Only get parent tasks, not variants
    })
      .sort({ createdAt: -1 })
      .allowDiskUse(true); // Allow disk-based sorting to prevent memory limit errors

    // Convert _id to id for consistency and include all relevant data
    const formattedTasks = await Promise.all(tasks.map(async (task) => {
      // Count variants for each parent task
      const variantCount = await Task.countDocuments({ parentTask: task._id });
      
      return {
        id: task._id,
        type: task.type,
        topic: task.topic,
        class: task.class,
        length: task.length,
        lessonData: task.lessonData,
        quizData: task.quizData,
        variantCount: variantCount,
        createdAt: task.createdAt
      };
    }));

    res.json({ tasks: formattedTasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Server error fetching tasks' });
  }
});

// Get groups and their task variants for a task
router.get('/:taskId/groups', async (req, res) => {
  try {
    const { taskId } = req.params;
    const groups = await groupingService.getGroupsForTask(taskId);
    
    // Populate task variants
    const groupsWithVariants = await Promise.all(
      groups.map(async (group) => {
        const variant = group.taskVariantId 
          ? await Task.findById(group.taskVariantId)
          : null;
        
        return {
          groupNumber: group.groupNumber,
          students: group.students,
          aiCombo: group.aiCombo,
          taskVariant: variant ? {
            id: variant._id,
            status: variant.type === 'Lesson' 
              ? variant.lessonData?.status 
              : variant.quizData?.status,
            lessonData: variant.lessonData,
            quizData: variant.quizData
          } : null
        };
      })
    );

    res.json({ groups: groupsWithVariants });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Server error fetching groups' });
  }
});

// Fix parent task statuses based on their variant tasks (helper endpoint)
router.post('/fix-statuses', async (req, res) => {
  try {
    // Find all parent tasks (tasks without a parentTask)
    const parentTasks = await Task.find({ parentTask: null });
    let fixed = 0;

    for (const parentTask of parentTasks) {
      // Find all variant tasks for this parent
      const variantTasks = await Task.find({ parentTask: parentTask._id });
      
      if (variantTasks.length === 0) {
        continue; // No variants, skip
      }

      // Check variant statuses
      const allCompleted = variantTasks.every(vt => {
        if (parentTask.type === 'Lesson') {
          return vt.lessonData?.status === 'completed';
        } else {
          return vt.quizData?.status === 'completed';
        }
      });

      const anyFailed = variantTasks.some(vt => {
        if (parentTask.type === 'Lesson') {
          return vt.lessonData?.status === 'failed';
        } else {
          return vt.quizData?.status === 'failed';
        }
      });

      const anyGenerating = variantTasks.some(vt => {
        if (parentTask.type === 'Lesson') {
          return vt.lessonData?.status === 'generating';
        } else {
          return vt.quizData?.status === 'generating';
        }
      });

      // Update parent task status
      let shouldUpdate = false;
      if (parentTask.type === 'Lesson') {
        if (allCompleted && parentTask.lessonData?.status !== 'completed') {
          parentTask.lessonData.status = 'completed';
          // Copy slides from first completed variant if parent doesn't have them
          if (!parentTask.lessonData.slides || parentTask.lessonData.slides.length === 0) {
            const firstCompletedVariant = variantTasks.find(vt => 
              vt.lessonData?.status === 'completed' && vt.lessonData?.slides?.length > 0
            );
            if (firstCompletedVariant && firstCompletedVariant.lessonData?.slides) {
              parentTask.lessonData.slides = firstCompletedVariant.lessonData.slides;
              parentTask.lessonData.script = firstCompletedVariant.lessonData.script || '';
              console.log(`[Fix] Copied ${firstCompletedVariant.lessonData.slides.length} slides to parent task ${parentTask._id}`);
            }
          }
          shouldUpdate = true;
        } else if (anyFailed && !anyGenerating && parentTask.lessonData?.status !== 'failed') {
          parentTask.lessonData.status = 'failed';
          shouldUpdate = true;
        } else if (anyGenerating && parentTask.lessonData?.status !== 'generating') {
          parentTask.lessonData.status = 'generating';
          shouldUpdate = true;
        }
      } else {
        if (allCompleted && parentTask.quizData?.status !== 'completed') {
          parentTask.quizData.status = 'completed';
          // Copy quiz data from first completed variant if parent doesn't have it
          if (!parentTask.quizData.questions || parentTask.quizData.questions.length === 0) {
            const firstCompletedVariant = variantTasks.find(vt => 
              vt.quizData?.status === 'completed' && vt.quizData?.questions?.length > 0
            );
            if (firstCompletedVariant && firstCompletedVariant.quizData) {
              parentTask.quizData.questions = firstCompletedVariant.quizData.questions || [];
              parentTask.quizData.prompt = firstCompletedVariant.quizData.prompt || '';
              console.log(`[Fix] Copied ${firstCompletedVariant.quizData.questions.length} questions to parent task ${parentTask._id}`);
            }
          }
          shouldUpdate = true;
        } else if (anyFailed && !anyGenerating && parentTask.quizData?.status !== 'failed') {
          parentTask.quizData.status = 'failed';
          shouldUpdate = true;
        } else if (anyGenerating && parentTask.quizData?.status !== 'generating') {
          parentTask.quizData.status = 'generating';
          shouldUpdate = true;
        }
      }

      if (shouldUpdate) {
        await parentTask.save();
        fixed++;
      }
    }

    res.json({ 
      message: `Fixed ${fixed} parent task statuses`,
      fixed 
    });
  } catch (error) {
    console.error('Error fixing task statuses:', error);
    res.status(500).json({ error: 'Server error fixing task statuses' });
  }
});

// Get a single task by ID (includes variants if it's a parent task)
router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const taskData = {
      id: task._id,
      type: task.type,
      topic: task.topic,
      class: task.class,
      length: task.length,
      lessonData: task.lessonData,
      quizData: task.quizData,
      aiModels: task.aiModels,
      parentTask: task.parentTask,
      assignedGroup: task.assignedGroup,
      createdAt: task.createdAt
    };

    // If this is a parent task, include all its variants
    if (!task.parentTask) {
      const variants = await Task.find({ parentTask: taskId })
        .sort({ createdAt: 1 })
        .allowDiskUse(true) // Allow disk-based sorting to prevent memory limit errors
        .lean();
      
      taskData.variants = variants.map(variant => {
        // Debug logging for variant data
        console.log(`[Get Task] Variant ${variant._id}:`, {
          type: variant.type,
          hasQuizData: !!variant.quizData,
          quizStatus: variant.quizData?.status,
          questionsCount: variant.quizData?.questions?.length || 0,
          questions: variant.quizData?.questions
        });
        
        return {
          id: variant._id,
          type: variant.type,
          topic: variant.topic,
          lessonData: variant.lessonData,
          quizData: variant.quizData, // Make sure quizData is included
          aiModels: variant.aiModels,
          assignedGroup: variant.assignedGroup,
          createdAt: variant.createdAt
        };
      });
    }

    res.json(taskData);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Server error fetching task' });
  }
});

// Get task variant assigned to a specific student
router.get('/:taskId/student/:studentId', async (req, res) => {
  try {
    const { taskId, studentId } = req.params;

    // Find the group this student belongs to for this task
    const StudentGroup = (await import('../models/StudentGroup.js')).default;
    const group = await StudentGroup.findOne({
      task: taskId,
      students: studentId
    });

    if (!group) {
      return res.status(404).json({ 
        error: 'Student not assigned to any group for this task' 
      });
    }

    // Get the task variant for this group
    const taskVariant = group.taskVariantId 
      ? await Task.findById(group.taskVariantId)
      : null;

    if (!taskVariant) {
      return res.status(404).json({ 
        error: 'Task variant not yet generated for this group',
        groupNumber: group.groupNumber,
        aiCombo: group.aiCombo
      });
    }

    res.json({
      id: taskVariant._id,
      type: taskVariant.type,
      topic: taskVariant.topic,
      class: taskVariant.class,
      length: taskVariant.length,
      lessonData: taskVariant.lessonData,
      quizData: taskVariant.quizData,
      aiModels: taskVariant.aiModels,
      groupNumber: group.groupNumber,
      createdAt: taskVariant.createdAt
    });
  } catch (error) {
    console.error('Get student task error:', error);
    res.status(500).json({ error: 'Server error fetching student task' });
  }
});

// Get all tasks for a student (across all their enrolled classes)
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    // Import required models
    const Enrollment = (await import('../models/Enrollment.js')).default;
    const StudentGroup = (await import('../models/StudentGroup.js')).default;

    // Get all classes the student is enrolled in
    const enrollments = await Enrollment.find({ student: studentId })
      .populate('class', 'gradeLevel subject classCode');
    
    if (enrollments.length === 0) {
      return res.json({ tasks: [] });
    }

    const classIds = enrollments.map(e => e.class._id);

    // Get all parent tasks for these classes
    const parentTasks = await Task.find({
      class: { $in: classIds },
      parentTask: null // Only get parent tasks, not variants
    }).sort({ createdAt: -1 });

    // For each parent task, find the student's group and their assigned variant
    const tasksWithVariants = await Promise.all(
      parentTasks.map(async (parentTask) => {
        // Find the group this student belongs to for this task
        const group = await StudentGroup.findOne({
          task: parentTask._id,
          students: studentId
        });

        // Find the enrollment for this class
        const enrollment = enrollments.find(e => {
          const classId = e.class._id ? e.class._id.toString() : e.class.toString();
          return classId === parentTask.class.toString();
        });
        const classInfo = enrollment?.class || null;

        if (!group) {
          // Student not in any group yet (shouldn't happen, but handle gracefully)
          return {
            id: parentTask._id,
            type: parentTask.type,
            topic: parentTask.topic,
            class: {
              id: classInfo?._id || parentTask.class,
              gradeLevel: classInfo?.gradeLevel || 'Unknown',
              subject: classInfo?.subject || 'Unknown',
              classCode: classInfo?.classCode || 'N/A'
            },
            status: parentTask.type === 'Lesson' 
              ? (parentTask.lessonData?.status || 'pending')
              : (parentTask.quizData?.status || 'pending'),
            variantStatus: 'not_assigned',
            createdAt: parentTask.createdAt
          };
        }

        // Get the task variant assigned to this group
        const taskVariant = group.taskVariantId 
          ? await Task.findById(group.taskVariantId)
          : null;

        const status = parentTask.type === 'Lesson' 
          ? (parentTask.lessonData?.status || 'pending')
          : (parentTask.quizData?.status || 'pending');

        const variantStatus = taskVariant
          ? (parentTask.type === 'Lesson'
              ? (taskVariant.lessonData?.status || 'pending')
              : (taskVariant.quizData?.status || 'pending'))
          : 'generating';

        return {
          id: taskVariant ? taskVariant._id : parentTask._id,
          parentTaskId: parentTask._id,
          type: parentTask.type,
          topic: parentTask.topic,
          class: {
            id: classInfo?._id || parentTask.class,
            gradeLevel: classInfo?.gradeLevel || 'Unknown',
            subject: classInfo?.subject || 'Unknown',
            classCode: classInfo?.classCode || 'N/A'
          },
          status: variantStatus,
          groupNumber: group.groupNumber,
          lessonData: taskVariant?.lessonData || parentTask.lessonData,
          quizData: taskVariant?.quizData || parentTask.quizData,
          createdAt: parentTask.createdAt
        };
      })
    );

    res.json({ tasks: tasksWithVariants });
  } catch (error) {
    console.error('Get student tasks error:', error);
    res.status(500).json({ error: 'Server error fetching student tasks' });
  }
});

// Submit quiz answers
router.post('/submit-quiz', async (req, res) => {
  try {
    const { taskId, studentId, answers } = req.body;

    if (!taskId || !studentId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Task ID, student ID, and answers array are required' });
    }

    // Get the task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.type !== 'Quiz') {
      return res.status(400).json({ error: 'Task is not a quiz' });
    }

    // Get class info
    const Class = (await import('../models/Class.js')).default;
    const classData = await Class.findById(task.class);
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Find or create StudentTaskSession
    const StudentTaskSession = (await import('../models/StudentTaskSession.js')).default;
    let session = await StudentTaskSession.findOne({
      student: studentId,
      task: taskId,
      status: 'active'
    });

    if (!session) {
      // Create new session if it doesn't exist
      session = new StudentTaskSession({
        student: studentId,
        task: taskId,
        class: task.class,
        taskType: 'Quiz',
        gradeLevel: classData.gradeLevel,
        subject: classData.subject,
        aiModels: task.aiModels || {},
        startTime: new Date(),
        status: 'active'
      });
    }

    // Store quiz answers
    session.quizAnswers = answers.map(ans => ({
      questionNumber: ans.questionNumber,
      answer: ans.answer,
      submittedAt: new Date()
    }));

    // Mark session as completed
    session.endTime = new Date();
    session.duration = Math.floor((session.endTime - session.startTime) / 1000);
    session.status = 'completed';

    await session.save();

    res.json({
      success: true,
      message: 'Quiz submitted successfully',
      sessionId: session._id
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ error: 'Server error submitting quiz' });
  }
});

export default router;

