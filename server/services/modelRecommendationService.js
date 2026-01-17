import StudentTaskSession from '../models/StudentTaskSession.js';
import Task from '../models/Task.js';

class ModelRecommendationService {
  /**
   * Get the best performing AI model for a specific student and task type
   * @param {string} studentId - Student ID
   * @param {string} taskType - 'Lesson' or 'Quiz'
   * @param {string} gradeLevel - Grade level
   * @param {string} subject - Subject
   * @returns {Promise<Object|null>} Best model recommendation or null if no data
   */
  async getBestModelForStudent(studentId, taskType, gradeLevel, subject) {
    try {
      // Query completed sessions for this student with same task type, grade level, and subject
      const sessions = await StudentTaskSession.find({
        student: studentId,
        taskType: taskType,
        gradeLevel: gradeLevel,
        subject: subject,
        status: 'completed',
        'aggregatedMetrics.averageFocusScore': { $gt: 0 } // Only sessions with valid metrics
      })
        .sort({ createdAt: -1 })
        .limit(50); // Look at last 50 sessions

      if (sessions.length === 0) {
        return null;
      }

      // Group by AI model and calculate average performance
      const modelPerformance = {};

      sessions.forEach(session => {
        let modelKey = null;
        let modelInfo = null;

        if (taskType === 'Lesson') {
          modelKey = session.aiModels?.scriptModel?.model;
          modelInfo = session.aiModels?.scriptModel;
        } else if (taskType === 'Quiz') {
          modelKey = session.aiModels?.quizQuestionsModel?.model;
          modelInfo = session.aiModels?.quizQuestionsModel;
        }

        if (!modelKey || !modelInfo) return;

        if (!modelPerformance[modelKey]) {
          modelPerformance[modelKey] = {
            model: modelInfo,
            totalSessions: 0,
            totalFocusScore: 0,
            totalEngagementScore: 0,
            totalThinkingIntensity: 0,
            averageFocusScore: 0,
            averageEngagementScore: 0,
            averageThinkingIntensity: 0
          };
        }

        const perf = modelPerformance[modelKey];
        perf.totalSessions++;
        perf.totalFocusScore += session.aggregatedMetrics?.averageFocusScore || 0;
        perf.totalEngagementScore += session.aggregatedMetrics?.averageEngagementScore || 0;
        perf.totalThinkingIntensity += session.aggregatedMetrics?.averageThinkingIntensity || 0;
      });

      // Calculate averages and find best model
      let bestModel = null;
      let bestScore = -1;

      for (const [modelKey, perf] of Object.entries(modelPerformance)) {
        perf.averageFocusScore = perf.totalFocusScore / perf.totalSessions;
        perf.averageEngagementScore = perf.totalEngagementScore / perf.totalSessions;
        perf.averageThinkingIntensity = perf.totalThinkingIntensity / perf.totalSessions;

        // Combined score: weighted average (focus 40%, engagement 40%, thinking 20%)
        const combinedScore = 
          (perf.averageFocusScore * 0.4) +
          (perf.averageEngagementScore * 0.4) +
          (perf.averageThinkingIntensity * 0.2);

        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestModel = {
            provider: perf.model.provider,
            model: modelKey,
            name: perf.model.name,
            performance: {
              focusScore: perf.averageFocusScore,
              engagementScore: perf.averageEngagementScore,
              thinkingIntensity: perf.averageThinkingIntensity,
              combinedScore: combinedScore,
              sessions: perf.totalSessions
            }
          };
        }
      }

      return bestModel;
    } catch (error) {
      console.error('[ModelRecommendationService] Error getting best model:', error);
      return null;
    }
  }

  /**
   * Get the best performing AI model globally (for unknown students)
   * @param {string} taskType - 'Lesson' or 'Quiz'
   * @param {string} gradeLevel - Grade level
   * @param {string} subject - Subject
   * @returns {Promise<Object|null>} Best model recommendation or null if no data
   */
  async getBestModelGlobal(taskType, gradeLevel, subject) {
    try {
      // Query all completed sessions with same task type, grade level, and subject
      const sessions = await StudentTaskSession.find({
        taskType: taskType,
        gradeLevel: gradeLevel,
        subject: subject,
        status: 'completed',
        'aggregatedMetrics.averageFocusScore': { $gt: 0 }
      })
        .sort({ createdAt: -1 })
        .limit(200); // Look at last 200 sessions across all students

      if (sessions.length === 0) {
        return null;
      }

      // Group by AI model and calculate average performance
      const modelPerformance = {};

      sessions.forEach(session => {
        let modelKey = null;
        let modelInfo = null;

        if (taskType === 'Lesson') {
          modelKey = session.aiModels?.scriptModel?.model;
          modelInfo = session.aiModels?.scriptModel;
        } else if (taskType === 'Quiz') {
          modelKey = session.aiModels?.quizQuestionsModel?.model;
          modelInfo = session.aiModels?.quizQuestionsModel;
        }

        if (!modelKey || !modelInfo) return;

        if (!modelPerformance[modelKey]) {
          modelPerformance[modelKey] = {
            model: modelInfo,
            totalSessions: 0,
            totalFocusScore: 0,
            totalEngagementScore: 0,
            totalThinkingIntensity: 0
          };
        }

        const perf = modelPerformance[modelKey];
        perf.totalSessions++;
        perf.totalFocusScore += session.aggregatedMetrics?.averageFocusScore || 0;
        perf.totalEngagementScore += session.aggregatedMetrics?.averageEngagementScore || 0;
        perf.totalThinkingIntensity += session.aggregatedMetrics?.averageThinkingIntensity || 0;
      });

      // Calculate averages and find best model
      let bestModel = null;
      let bestScore = -1;

      for (const [modelKey, perf] of Object.entries(modelPerformance)) {
        const avgFocus = perf.totalFocusScore / perf.totalSessions;
        const avgEngagement = perf.totalEngagementScore / perf.totalSessions;
        const avgThinking = perf.totalThinkingIntensity / perf.totalSessions;

        // Combined score: weighted average
        const combinedScore = (avgFocus * 0.4) + (avgEngagement * 0.4) + (avgThinking * 0.2);

        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestModel = {
            provider: perf.model.provider,
            model: modelKey,
            name: perf.model.name,
            performance: {
              focusScore: avgFocus,
              engagementScore: avgEngagement,
              thinkingIntensity: avgThinking,
              combinedScore: combinedScore,
              sessions: perf.totalSessions
            }
          };
        }
      }

      return bestModel;
    } catch (error) {
      console.error('[ModelRecommendationService] Error getting best global model:', error);
      return null;
    }
  }

  /**
   * Get recommended AI models for task creation
   * @param {string} studentId - Student ID (optional, for personalized recommendations)
   * @param {string} taskType - 'Lesson' or 'Quiz'
   * @param {string} gradeLevel - Grade level
   * @param {string} subject - Subject
   * @returns {Promise<Object>} Recommended models
   */
  async getRecommendedModels(studentId, taskType, gradeLevel, subject) {
    let scriptModel = null;
    let imageModel = null;
    let quizPromptModel = null;
    let quizQuestionsModel = null;

    if (taskType === 'Lesson') {
      // Try student-specific first, fall back to global
      scriptModel = studentId
        ? await this.getBestModelForStudent(studentId, 'Lesson', gradeLevel, subject)
        : null;
      
      if (!scriptModel) {
        scriptModel = await this.getBestModelGlobal('Lesson', gradeLevel, subject);
      }

      // For image model, use global (less student-specific)
      // You could extend this to be student-specific too if needed
      const imageSessions = await StudentTaskSession.find({
        taskType: 'Lesson',
        gradeLevel: gradeLevel,
        subject: subject,
        status: 'completed',
        'aggregatedMetrics.averageEngagementScore': { $gt: 0 }
      })
        .sort({ createdAt: -1 })
        .limit(100);

      // Simple heuristic: use same provider as script model for consistency
      if (scriptModel) {
        imageModel = {
          provider: scriptModel.provider,
          model: scriptModel.model, // Could be different model, but same provider
          name: scriptModel.name
        };
      }
    } else if (taskType === 'Quiz') {
      // Try student-specific first, fall back to global
      quizQuestionsModel = studentId
        ? await this.getBestModelForStudent(studentId, 'Quiz', gradeLevel, subject)
        : null;
      
      if (!quizQuestionsModel) {
        quizQuestionsModel = await this.getBestModelGlobal('Quiz', gradeLevel, subject);
      }

      // Use same model for prompt generation (or could be different)
      if (quizQuestionsModel) {
        quizPromptModel = {
          provider: quizQuestionsModel.provider,
          model: quizQuestionsModel.model,
          name: quizQuestionsModel.name
        };
      }
    }

    return {
      scriptModel,
      imageModel,
      quizPromptModel,
      quizQuestionsModel
    };
  }
}

export default new ModelRecommendationService();

