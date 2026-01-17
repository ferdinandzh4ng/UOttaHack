import Enrollment from '../models/Enrollment.js';
import StudentGroup from '../models/StudentGroup.js';

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
      lesson: [
        {
          scriptModel: { provider: 'google', model: 'google/gemini-pro', name: 'Google Gemini Pro' },
          imageModel: { provider: 'google', model: 'google/nano-banana-pro', name: 'Google Nano Banana Pro' }
        },
        {
          scriptModel: { provider: 'openai', model: 'openai/gpt-3.5-turbo', name: 'OpenAI GPT-3.5 Turbo' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image-mini', name: 'OpenAI GPT-5 Image Mini' }
        },
        {
          scriptModel: { provider: 'openai', model: 'openai/gpt-4', name: 'OpenAI GPT-4' },
          imageModel: { provider: 'openai', model: 'openai/gpt-5-image', name: 'OpenAI GPT-5 Image' }
        },
        {
          scriptModel: { provider: 'anthropic', model: 'anthropic/claude-3-sonnet', name: 'Anthropic Claude 3 Sonnet' },
          imageModel: { provider: 'minimax', model: 'minimax/minimax-01', name: 'MiniMax MiniMax-01' }
        },
        {
          scriptModel: { provider: 'anthropic', model: 'anthropic/claude-3-opus', name: 'Anthropic Claude 3 Opus' },
          imageModel: { provider: 'minimax', model: 'minimax/minimax-m2.1', name: 'MiniMax M2.1' }
        },
        {
          scriptModel: { provider: 'openrouter', model: 'mistralai/mistral-7b-instruct', name: 'Mistral 7B' },
          imageModel: { provider: 'prime-intellect', model: 'prime-intellect/intellect-3', name: 'Prime Intellect INTELLECT-3' }
        }
      ],
      // For Quiz tasks (quiz prompt + quiz questions)
      quiz: [
        {
          quizPromptModel: { provider: 'google', model: 'google/gemini-pro', name: 'Google Gemini Pro' },
          quizQuestionsModel: { provider: 'google', model: 'google/gemini-pro', name: 'Google Gemini Pro' }
        },
        {
          quizPromptModel: { provider: 'openai', model: 'openai/gpt-3.5-turbo', name: 'OpenAI GPT-3.5 Turbo' },
          quizQuestionsModel: { provider: 'openai', model: 'openai/gpt-3.5-turbo', name: 'OpenAI GPT-3.5 Turbo' }
        },
        {
          quizPromptModel: { provider: 'openai', model: 'openai/gpt-4', name: 'OpenAI GPT-4' },
          quizQuestionsModel: { provider: 'openai', model: 'openai/gpt-4', name: 'OpenAI GPT-4' }
        },
        {
          quizPromptModel: { provider: 'anthropic', model: 'anthropic/claude-3-sonnet', name: 'Anthropic Claude 3 Sonnet' },
          quizQuestionsModel: { provider: 'anthropic', model: 'anthropic/claude-3-sonnet', name: 'Anthropic Claude 3 Sonnet' }
        },
        {
          quizPromptModel: { provider: 'anthropic', model: 'anthropic/claude-3-opus', name: 'Anthropic Claude 3 Opus' },
          quizQuestionsModel: { provider: 'anthropic', model: 'anthropic/claude-3-opus', name: 'Anthropic Claude 3 Opus' }
        },
        {
          quizPromptModel: { provider: 'openrouter', model: 'mistralai/mistral-7b-instruct', name: 'Mistral 7B' },
          quizQuestionsModel: { provider: 'openrouter', model: 'mistralai/mistral-7b-instruct', name: 'Mistral 7B' }
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
   */
  async createGroupsForTask(taskId, classId, taskType) {
    try {
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

      // Get available AI combos for this task type
      const combos = this.getAICombos()[taskType.toLowerCase()];
      if (!combos || combos.length === 0) {
        throw new Error(`No AI combos available for task type: ${taskType}`);
      }

      // Create StudentGroup records with assigned AI combos
      const createdGroups = [];
      
      for (let i = 0; i < studentGroups.length; i++) {
        const group = studentGroups[i];
        // Cycle through available combos (if more groups than combos, reuse)
        const combo = combos[i % combos.length];

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

