import Enrollment from '../models/Enrollment.js';
import StudentGroup from '../models/StudentGroup.js';
import Class from '../models/Class.js';
import modelRecommendationService from './modelRecommendationService.js';
import agentSelectionService from './agentSelectionService.js';

/**
 * Service for grouping students and assigning AI model combinations
 */
class GroupingService {
  /**
   * Get available AI model combinations
   * Returns different combos for script, image, and quiz tasks
   */
  getAICombos() {
    return {
      // For Lesson tasks (script + image)
      // Models are from OpenRouter API
      // Gemini available for script generation, OpenAI for images
      lesson: [
        {
          scriptModel: { provider: 'google', model: 'google/gemini-2.5-flash-lite', name: 'Google Gemini 2.5 Flash Lite' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image-mini', name: 'OpenAI GPT-5 Image Mini' }
        },
        {
          scriptModel: { provider: 'google', model: 'google/gemini-2.5-flash', name: 'Google Gemini 2.5 Flash' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image-mini', name: 'OpenAI GPT-5 Image Mini' }
        },
        {
          scriptModel: { provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet-20241022', name: 'Anthropic Claude 3.5 Sonnet' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image-mini', name: 'OpenAI GPT-5 Image Mini' }
        },
        {
          scriptModel: { provider: 'openai', model: 'openai/gpt-4o', name: 'OpenAI GPT-4o' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image-mini', name: 'OpenAI GPT-5 Image Mini' }
        },
        {
          scriptModel: { provider: 'google', model: 'google/gemini-2.5-pro', name: 'Google Gemini 2.5 Pro' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image', name: 'OpenAI GPT-5 Image' }
        },
        {
          scriptModel: { provider: 'openai', model: 'openai/gpt-5', name: 'OpenAI GPT-5' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image', name: 'OpenAI GPT-5 Image' }
        },
        {
          scriptModel: { provider: 'openai', model: 'openai/gpt-5-mini', name: 'OpenAI GPT-5 Mini' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image', name: 'OpenAI GPT-5 Image' }
        },
        {
          scriptModel: { provider: 'anthropic', model: 'anthropic/claude-3-7-sonnet-20250219', name: 'Anthropic Claude 3.7 Sonnet' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image-mini', name: 'OpenAI GPT-5 Image Mini' }
        }
      ],
      // For Quiz tasks (quiz prompt + quiz questions)
      // Models are from OpenRouter API
      // Removed Google/Gemini models - using Claude and GPT only
      quiz: [
        {
          quizPromptModel: { provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet-20241022', name: 'Anthropic Claude 3.5 Sonnet' },
          quizQuestionsModel: { provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet-20241022', name: 'Anthropic Claude 3.5 Sonnet' }
        },
        {
          quizPromptModel: { provider: 'anthropic', model: 'anthropic/claude-3-7-sonnet-20250219', name: 'Anthropic Claude 3.7 Sonnet' },
          quizQuestionsModel: { provider: 'anthropic', model: 'anthropic/claude-3-7-sonnet-20250219', name: 'Anthropic Claude 3.7 Sonnet' }
        },
        {
          quizPromptModel: { provider: 'openai', model: 'openai/gpt-4o', name: 'OpenAI GPT-4o' },
          quizQuestionsModel: { provider: 'openai', model: 'openai/gpt-4o', name: 'OpenAI GPT-4o' }
        },
        {
          quizPromptModel: { provider: 'openai', model: 'openai/gpt-5', name: 'OpenAI GPT-5' },
          quizQuestionsModel: { provider: 'openai', model: 'openai/gpt-5', name: 'OpenAI GPT-5' }
        },
        {
          quizPromptModel: { provider: 'openai', model: 'openai/gpt-5-mini', name: 'OpenAI GPT-5 Mini' },
          quizQuestionsModel: { provider: 'openai', model: 'openai/gpt-5-mini', name: 'OpenAI GPT-5 Mini' }
        },
        {
          quizPromptModel: { provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet-20241022', name: 'Anthropic Claude 3.5 Sonnet' },
          quizQuestionsModel: { provider: 'openai', model: 'openai/gpt-4o', name: 'OpenAI GPT-4o' }
        },
        {
          quizPromptModel: { provider: 'openai', model: 'openai/gpt-5-mini', name: 'OpenAI GPT-5 Mini' },
          quizQuestionsModel: { provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet-20241022', name: 'Anthropic Claude 3.5 Sonnet' }
        }
      ]
    };
  }

  /**
   * Randomly shuffle array (Fisher-Yates algorithm)
   */
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Group students into groups of 6 (best effort)
   * Returns array of groups, each with up to 6 students
   */
  groupStudents(students, groupSize = 6) {
    if (!students || students.length === 0) {
      return [];
    }

    // Shuffle students randomly
    const shuffled = this.shuffleArray(students);
    const groups = [];

    // Create groups of 6
    for (let i = 0; i < shuffled.length; i += groupSize) {
      groups.push(shuffled.slice(i, i + groupSize));
    }

    return groups;
  }

  /**
   * Create student groups for a task and assign AI combos
   * Uses model recommendations to assign best models per student
   */
  async createGroupsForTask(taskId, classId, taskType) {
    try {
      // Get class info for grade level and subject
      const classData = await Class.findById(classId);
      if (!classData) {
        throw new Error('Class not found');
      }

      // Get all enrolled students in the class
      const enrollments = await Enrollment.find({ class: classId })
        .populate('student', 'username');
      
      if (enrollments.length === 0) {
        return { groups: [], message: 'No students enrolled in this class' };
      }

      const students = enrollments.map(e => e.student._id);

      // Group students into groups of 6
      const studentGroups = this.groupStudents(students, 6);

      if (studentGroups.length === 0) {
        return { groups: [], message: 'No students to group' };
      }

      // Get available AI combos for this task type (fallback)
      const combos = this.getAICombos()[taskType.toLowerCase()];
      if (!combos || combos.length === 0) {
        throw new Error(`No AI combos available for task type: ${taskType}`);
      }

      // Create StudentGroup records with assigned AI combos
      const createdGroups = [];
      
      for (let i = 0; i < studentGroups.length; i++) {
        const group = studentGroups[i];
        
        // A/B Testing: Use feedback-based agent selection
        // Try to get top performing combos from feedback data
        let combo = null;
        
        try {
          // Get task info for context
          const Task = (await import('../models/Task.js')).default;
          const task = await Task.findById(taskId);
          
          // Use agent selection service to get top combos
          const topCombos = await agentSelectionService.getTopAgentCombos({
            topic: task?.topic || 'unknown',
            taskType: taskType,
            gradeLevel: classData.gradeLevel,
            subject: classData.subject,
            purpose: taskType === 'Lesson' ? 'Conceptual' : 'Assessment',
            length: 'Unknown' // Could be enhanced to use actual task length
          }, 5);

          // If we have feedback-based recommendations, use them
          if (topCombos.length > 0) {
            // Select combo based on group index (round-robin through top performers)
            const selectedCombo = topCombos[i % topCombos.length];
            const comboString = selectedCombo.agentCombo?.primary?.provider || 
                               (typeof selectedCombo.agentCombo === 'string' ? selectedCombo.agentCombo : null);
            
            if (comboString) {
              // Find matching combo from available combos
              const providers = comboString.split('+');
              const matchingCombo = combos.find(c => {
                if (taskType === 'Lesson') {
                  return providers.includes(c.scriptModel?.provider) || 
                         providers.includes(c.imageModel?.provider);
                } else {
                  return providers.includes(c.quizQuestionsModel?.provider) || 
                         providers.includes(c.quizPromptModel?.provider);
                }
              });
              
              if (matchingCombo) {
                combo = matchingCombo;
                console.log(`[Grouping] Using feedback-based combo for group ${i + 1}: ${comboString} (score: ${selectedCombo.performance?.score?.toFixed(2) || 'N/A'})`);
              }
            }
          }
        } catch (error) {
          console.error('[Grouping] Error getting feedback-based combos:', error);
        }

        // Fallback: Try student-specific recommendations
        if (!combo) {
          // Get recommendations for each student and find the most common best model
          const recommendations = await Promise.all(
            group.map(async (studentId) => {
              try {
                const rec = await modelRecommendationService.getBestModelForStudent(
                  studentId,
                  taskType,
                  classData.gradeLevel,
                  classData.subject
                );
                return rec;
              } catch (error) {
                console.error(`Error getting recommendation for student ${studentId}:`, error);
                return null;
              }
            })
          );

          // Count model occurrences
          const modelCounts = {};
          recommendations.forEach(rec => {
            if (rec && rec.model) {
              const key = `${rec.provider}/${rec.model}`;
              modelCounts[key] = (modelCounts[key] || 0) + 1;
            }
          });

          // Find the most recommended model for this group
          let bestModelKey = null;
          let maxCount = 0;
          for (const [key, count] of Object.entries(modelCounts)) {
            if (count > maxCount) {
              maxCount = count;
              bestModelKey = key;
            }
          }

          // If we have a recommendation, try to match it to a combo
          if (bestModelKey && maxCount > 0) {
            const [provider, model] = bestModelKey.split('/');
            const recommendedCombo = combos.find(c => {
              if (taskType === 'Lesson') {
                return c.scriptModel?.provider === provider && 
                       (c.scriptModel?.model === model || c.scriptModel?.model?.includes(model));
              } else {
                return c.quizQuestionsModel?.provider === provider && 
                       (c.quizQuestionsModel?.model === model || c.quizQuestionsModel?.model?.includes(model));
              }
            });

            if (recommendedCombo) {
              combo = recommendedCombo;
              console.log(`[Grouping] Using recommended model for group ${i + 1}: ${bestModelKey} (${maxCount}/${group.length} students)`);
            }
          }
        }

        // Final fallback: cycle through available combos (ensures A/B testing diversity)
        if (!combo) {
          combo = combos[i % combos.length];
          console.log(`[Grouping] Using fallback combo for group ${i + 1} (A/B testing)`);
        }

        const studentGroup = new StudentGroup({
          task: taskId,
          class: classId,
          groupNumber: i + 1,
          students: group,
          aiCombo: combo
        });

        await studentGroup.save();
        createdGroups.push(studentGroup);
      }

      return {
        groups: createdGroups,
        message: `Created ${createdGroups.length} groups with ${studentGroups.reduce((sum, g) => sum + g.length, 0)} total students`
      };
    } catch (error) {
      console.error('Error creating student groups:', error);
      throw error;
    }
  }

  /**
   * Get groups for a task
   */
  async getGroupsForTask(taskId) {
    try {
      const groups = await StudentGroup.find({ task: taskId })
        .populate('students', 'username')
        .sort({ groupNumber: 1 });

      return groups;
    } catch (error) {
      console.error('Error fetching groups:', error);
      throw error;
    }
  }
}

export default new GroupingService();

