import SessionFeedback from '../models/SessionFeedback.js';
import AgentPerformance from '../models/AgentPerformance.js';
import StudentTaskSession from '../models/StudentTaskSession.js';

/**
 * Teacher Insights Service
 * Provides actionable insights for teachers based on feedback
 */
class TeacherInsightsService {
  /**
   * Get insights for a specific class
   * @param {String} classId - Class ID
   * @param {Object} filters - Optional filters (date range, topic, etc.)
   * @returns {Promise<Object>} Insights object
   */
  async getClassInsights(classId, filters = {}) {
    try {
      // Get all sessions for this class
      const sessions = await StudentTaskSession.find({
        class: classId,
        status: 'completed',
        ...filters
      })
        .populate('task')
        .populate('student', 'name email')
        .sort({ createdAt: -1 })
        .limit(100);

      if (sessions.length === 0) {
        return {
          message: 'No completed sessions found',
          insights: []
        };
      }

      // Get feedback for these sessions
      const sessionIds = sessions.map(s => s._id);
      const feedbacks = await SessionFeedback.find({
        sessionId: { $in: sessionIds }
      });

      // Build insights
      const insights = {
        overall: this.calculateOverallInsights(sessions, feedbacks),
        byTopic: this.groupByTopic(sessions, feedbacks),
        byAgentCombo: this.groupByAgentCombo(sessions, feedbacks),
        recommendations: this.generateRecommendations(sessions, feedbacks)
      };

      return insights;
    } catch (error) {
      console.error('[TeacherInsights] Error getting class insights:', error);
      throw error;
    }
  }

  /**
   * Calculate overall insights
   */
  calculateOverallInsights(sessions, feedbacks) {
    if (feedbacks.length === 0) {
      return {
        avgClarity: 0,
        avgEngagement: 0,
        avgConfidence: 0,
        totalSessions: sessions.length,
        message: 'Insufficient feedback data'
      };
    }

    const avgClarity = feedbacks.reduce((sum, f) => sum + f.clarityScore, 0) / feedbacks.length;
    const avgEngagement = feedbacks.reduce((sum, f) => sum + f.engagementScore, 0) / feedbacks.length;
    const avgConfidence = feedbacks.reduce((sum, f) => sum + f.confidence, 0) / feedbacks.length;

    return {
      avgClarity: parseFloat(avgClarity.toFixed(2)),
      avgEngagement: parseFloat(avgEngagement.toFixed(2)),
      avgConfidence: parseFloat(avgConfidence.toFixed(2)),
      totalSessions: sessions.length,
      totalFeedback: feedbacks.length
    };
  }

  /**
   * Group insights by topic
   */
  groupByTopic(sessions, feedbacks) {
    const topicMap = {};

    feedbacks.forEach(feedback => {
      const topic = feedback.topic || 'Unknown';
      if (!topicMap[topic]) {
        topicMap[topic] = {
          topic,
          sessions: [],
          avgClarity: 0,
          avgEngagement: 0,
          avgConfidence: 0,
          count: 0
        };
      }

      topicMap[topic].sessions.push(feedback.sessionId);
      topicMap[topic].avgClarity += feedback.clarityScore;
      topicMap[topic].avgEngagement += feedback.engagementScore;
      topicMap[topic].avgConfidence += feedback.confidence;
      topicMap[topic].count += 1;
    });

    // Calculate averages
    Object.values(topicMap).forEach(topic => {
      topic.avgClarity = parseFloat((topic.avgClarity / topic.count).toFixed(2));
      topic.avgEngagement = parseFloat((topic.avgEngagement / topic.count).toFixed(2));
      topic.avgConfidence = parseFloat((topic.avgConfidence / topic.count).toFixed(2));
    });

    return Object.values(topicMap);
  }

  /**
   * Group insights by agent combo
   */
  groupByAgentCombo(sessions, feedbacks) {
    const comboMap = {};

    feedbacks.forEach(feedback => {
      const combo = feedback.agentCombo || 'Unknown';
      if (!comboMap[combo]) {
        comboMap[combo] = {
          agentCombo: combo,
          sessions: [],
          avgClarity: 0,
          avgEngagement: 0,
          avgConfidence: 0,
          count: 0
        };
      }

      comboMap[combo].sessions.push(feedback.sessionId);
      comboMap[combo].avgClarity += feedback.clarityScore;
      comboMap[combo].avgEngagement += feedback.engagementScore;
      comboMap[combo].avgConfidence += feedback.confidence;
      comboMap[combo].count += 1;
    });

    // Calculate averages
    Object.values(comboMap).forEach(combo => {
      combo.avgClarity = parseFloat((combo.avgClarity / combo.count).toFixed(2));
      combo.avgEngagement = parseFloat((combo.avgEngagement / combo.count).toFixed(2));
      combo.avgConfidence = parseFloat((combo.avgConfidence / combo.count).toFixed(2));
    });

    return Object.values(comboMap).sort((a, b) => {
      const scoreA = (a.avgClarity + a.avgEngagement) / 2;
      const scoreB = (b.avgClarity + b.avgEngagement) / 2;
      return scoreB - scoreA;
    });
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(sessions, feedbacks) {
    const recommendations = [];

    if (feedbacks.length === 0) {
      return [{
        type: 'info',
        message: 'Collect more feedback to generate recommendations',
        priority: 'low'
      }];
    }

    // Check for low clarity
    const avgClarity = feedbacks.reduce((sum, f) => sum + f.clarityScore, 0) / feedbacks.length;
    if (avgClarity < 0.5) {
      recommendations.push({
        type: 'clarity',
        message: 'Students are finding content unclear. Consider using more examples and simpler language.',
        priority: 'high',
        action: 'Review content clarity and add more concrete examples'
      });
    }

    // Check for low engagement
    const avgEngagement = feedbacks.reduce((sum, f) => sum + f.engagementScore, 0) / feedbacks.length;
    if (avgEngagement < 0.5) {
      recommendations.push({
        type: 'engagement',
        message: 'Student engagement is low. Try shorter lessons or more interactive content.',
        priority: 'high',
        action: 'Consider breaking content into shorter segments'
      });
    }

    // Check for fatigue
    const risingFatigue = feedbacks.filter(f => f.fatigueTrend === 'rising').length;
    if (risingFatigue > feedbacks.length * 0.3) {
      recommendations.push({
        type: 'fatigue',
        message: 'Many students are showing signs of fatigue. Consider shorter sessions or more breaks.',
        priority: 'medium',
        action: 'Reduce session length or add more breaks'
      });
    }

    // Check for best performing combos
    const comboInsights = this.groupByAgentCombo(sessions, feedbacks);
    if (comboInsights.length > 0) {
      const bestCombo = comboInsights[0];
      if (bestCombo.avgClarity > 0.7 && bestCombo.avgEngagement > 0.7) {
        recommendations.push({
          type: 'success',
          message: `The AI combination "${bestCombo.agentCombo}" is performing exceptionally well.`,
          priority: 'low',
          action: `Consider using this combination more frequently`
        });
      }
    }

    return recommendations;
  }

  /**
   * Get insights for a specific task
   * @param {String} taskId - Task ID
   * @returns {Promise<Object>} Task insights
   */
  async getTaskInsights(taskId) {
    try {
      const sessions = await StudentTaskSession.find({
        task: taskId,
        status: 'completed'
      })
        .populate('student', 'name')
        .sort({ createdAt: -1 });

      if (sessions.length === 0) {
        return {
          message: 'No completed sessions for this task',
          insights: null
        };
      }

      const sessionIds = sessions.map(s => s._id);
      const feedbacks = await SessionFeedback.find({
        sessionId: { $in: sessionIds }
      });

      return {
        taskId,
        totalSessions: sessions.length,
        avgMetrics: this.calculateOverallInsights(sessions, feedbacks),
        studentPerformance: sessions.map(session => {
          const feedback = feedbacks.find(f => f.sessionId.toString() === session._id.toString());
          return {
            student: session.student?.name || 'Unknown',
            clarity: feedback?.clarityScore || 0,
            engagement: feedback?.engagementScore || 0,
            confidence: feedback?.confidence || 0
          };
        })
      };
    } catch (error) {
      console.error('[TeacherInsights] Error getting task insights:', error);
      throw error;
    }
  }
}

export default new TeacherInsightsService();

