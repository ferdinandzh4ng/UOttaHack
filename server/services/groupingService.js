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
   * Convert a combo object to an agentCombo string identifier
   * Matches the format used in surveyMonkeyService.buildAgentComboString
   * Format: "provider:model+provider:model" (e.g., "google:gemini-2.5-flash+openai:gpt-5-image-mini")
   * @param {Object} combo - Combo object with model info
   * @param {String} taskType - 'Lesson' or 'Quiz'
   * @returns {String} Agent combo string
   */
  comboToAgentComboString(combo, taskType) {
    if (taskType === 'Lesson') {
      const script = combo.scriptModel;
      const image = combo.imageModel;
      
      // Build combo with full model names (matching surveyMonkeyService format)
      const scriptCombo = script?.model 
        ? `${script.provider || 'unknown'}:${script.model}`
        : script?.provider || null;
      
      const imageCombo = image?.model
        ? `${image.provider || 'unknown'}:${image.model}`
        : image?.provider || null;
      
      if (scriptCombo && imageCombo) {
        return `${scriptCombo}+${imageCombo}`;
      }
      if (scriptCombo) {
        return scriptCombo;
      }
      if (imageCombo) {
        return imageCombo;
      }
      return 'unknown';
    } else {
      const questions = combo.quizQuestionsModel;
      const prompt = combo.quizPromptModel;
      
      // Build combo with full model names (matching surveyMonkeyService format)
      const questionsCombo = questions?.model
        ? `${questions.provider || 'unknown'}:${questions.model}`
        : questions?.provider || null;
      
      const promptCombo = prompt?.model
        ? `${prompt.provider || 'unknown'}:${prompt.model}`
        : prompt?.provider || null;
      
      if (questionsCombo && promptCombo) {
        return `${questionsCombo}+${promptCombo}`;
      }
      if (questionsCombo) {
        return questionsCombo;
      }
      if (promptCombo) {
        return promptCombo;
      }
      return 'unknown';
    }
  }

  /**
   * Weighted random selection based on performance scores
   * Uses exponential weighting to create smooth probability distribution
   * @param {Array} combos - Array of combo objects with performance scores
   * @returns {Object} Selected combo
   */
  weightedRandomSelect(combos) {
    if (combos.length === 0) return null;
    if (combos.length === 1) return combos[0].combo;

    // Extract scores and apply exponential weighting (temperature = 0.5)
    // Higher temperature = more uniform distribution, lower = more focused on top performers
    // Temperature 0.5 gives good balance: 0.8 vs 0.7 score ≈ 60/40 probability split
    const temperature = 0.5;
    const weights = combos.map(item => {
      // Use performance score, default to 0.5 if no data
      const score = item.performanceScore || 0.5;
      // Apply exponential weighting: e^(score/temperature)
      // This ensures smooth distribution (0.8 vs 0.7 won't be 99/1 but more like 60/40)
      return Math.exp(score / temperature);
    });

    // Normalize weights to probabilities
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const probabilities = weights.map(w => w / totalWeight);

    // Create cumulative distribution
    const cumulative = [];
    let sum = 0;
    for (let i = 0; i < probabilities.length; i++) {
      sum += probabilities[i];
      cumulative.push(sum);
    }

    // Random selection
    const random = Math.random();
    for (let i = 0; i < cumulative.length; i++) {
      if (random <= cumulative[i]) {
        return combos[i].combo;
      }
    }

    // Fallback to last item
    return combos[combos.length - 1].combo;
  }

  /**
   * Get performance scores for available combos
   * @param {Array} combos - Available combo objects
   * @param {String} taskType - 'Lesson' or 'Quiz'
   * @param {Object} taskContext - Task context (topic, gradeLevel, subject, etc.)
   * @returns {Promise<Array>} Array of {combo, performanceScore, agentComboString}
   */
  async getComboPerformanceScores(combos, taskType, taskContext) {
    try {
      const AgentPerformance = (await import('../models/AgentPerformance.js')).default;
      
      // Map each combo to its agentCombo string
      const comboMappings = combos.map(combo => ({
        combo,
        agentComboString: this.comboToAgentComboString(combo, taskType)
      }));

      // Query performance data for matching combos
      const agentComboStrings = comboMappings.map(m => m.agentComboString);
      
      const performanceProfiles = await AgentPerformance.find({
        agentCombo: { $in: agentComboStrings },
        taskType: taskType,
        gradeLevel: taskContext.gradeLevel,
        subject: taskContext.subject,
        status: 'active',
        sessionCount: { $gte: 1 } // At least 1 session for some data
      });

      // Create a map of agentCombo -> performanceScore
      const performanceMap = {};
      performanceProfiles.forEach(profile => {
        // If we have multiple profiles for same combo, use the best one
        if (!performanceMap[profile.agentCombo] || 
            profile.performanceScore > performanceMap[profile.agentCombo]) {
          performanceMap[profile.agentCombo] = profile.performanceScore;
        }
      });

      // Return combos with their performance scores
      return comboMappings.map(mapping => ({
        combo: mapping.combo,
        performanceScore: performanceMap[mapping.agentComboString] || null,
        agentComboString: mapping.agentComboString,
        hasData: performanceMap[mapping.agentComboString] !== undefined
      }));
    } catch (error) {
      console.error('[Grouping] Error getting combo performance scores:', error);
      // Return combos with no performance data
      return combos.map(combo => ({
        combo,
        performanceScore: null,
        agentComboString: this.comboToAgentComboString(combo, taskType),
        hasData: false
      }));
    }
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

      // Get task info for context
      const Task = (await import('../models/Task.js')).default;
      const task = await Task.findById(taskId);
      
      const taskContext = {
        topic: task?.topic || 'unknown',
        taskType: taskType,
        gradeLevel: classData.gradeLevel,
        subject: classData.subject,
        purpose: taskType === 'Lesson' ? 'Conceptual' : 'Assessment',
        length: 'Unknown'
      };

      // Get performance scores for all available combos
      let comboPerformanceData = [];
      try {
        comboPerformanceData = await this.getComboPerformanceScores(combos, taskType, taskContext);
        console.log(`[Grouping] Found performance data for ${comboPerformanceData.filter(d => d.hasData).length}/${comboPerformanceData.length} combos`);
      } catch (error) {
        console.error('[Grouping] Error getting combo performance scores:', error);
        // Fallback: create data without performance scores
        comboPerformanceData = combos.map(combo => ({
          combo,
          performanceScore: null,
          agentComboString: this.comboToAgentComboString(combo, taskType),
          hasData: false
        }));
      }

      // Normalize performance scores: assign default score (0.5) to combos without data
      // This ensures all combos are included in weighted selection, but those without data get lower weight
      const normalizedComboData = comboPerformanceData.map(item => ({
        combo: item.combo,
        performanceScore: item.performanceScore !== null ? item.performanceScore : 0.5,
        agentComboString: item.agentComboString,
        hasData: item.hasData
      }));

      // Create StudentGroup records with assigned AI combos
      const createdGroups = [];
      
      for (let i = 0; i < studentGroups.length; i++) {
        const group = studentGroups[i];
        
        // Use weighted random selection based on performance scores
        // All combos are included, but those with better scores get higher probability
        const combo = this.weightedRandomSelect(normalizedComboData);
        const selectedData = normalizedComboData.find(d => d.combo === combo);
        
        if (selectedData.hasData) {
          console.log(`[Grouping] Group ${i + 1}: Weighted selection - ${selectedData.agentComboString} (score: ${selectedData.performanceScore.toFixed(3)})`);
        } else {
          console.log(`[Grouping] Group ${i + 1}: Weighted selection - ${selectedData.agentComboString} (no data, using default weight)`);
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

