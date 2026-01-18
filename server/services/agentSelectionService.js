import AgentPerformance from '../models/AgentPerformance.js';
import SessionFeedback from '../models/SessionFeedback.js';

/**
 * AI Agent Selection Engine
 * Uses feedback to select the best AI model combinations for tasks
 */
class AgentSelectionService {
  /**
   * Update agent performance profile from feedback
   * @param {Object} feedback - Session feedback
   * @returns {Promise<Object>} Updated performance profile
   */
  async updatePerformanceProfile(feedback) {
    try {
      const {
        agentCombo,
        topic,
        taskType,
        gradeLevel,
        subject,
        clarityScore,
        engagementScore,
        confidence,
        attentionSpan,
        fatigueSlope
      } = feedback;

      // Determine purpose and length from context
      const purpose = taskType === 'Lesson' ? 'Conceptual' : 'Assessment';
      const length = feedback.length || 'Unknown';

      // Find or create performance profile
      let profile = await AgentPerformance.findOne({
        agentCombo,
        topic,
        purpose,
        length,
        taskType,
        gradeLevel,
        subject
      });

      if (!profile) {
        // Create new profile
        profile = new AgentPerformance({
          agentCombo,
          topic,
          purpose,
          length,
          taskType,
          gradeLevel,
          subject,
          sessionCount: 0,
          firstSeen: new Date()
        });
      }

      // Update with new feedback (exponential moving average)
      const alpha = 0.2; // Learning rate (how much new data affects average)
      
      profile.avgClarity = (1 - alpha) * profile.avgClarity + alpha * clarityScore;
      profile.avgEngagement = (1 - alpha) * profile.avgEngagement + alpha * engagementScore;
      profile.avgConfidence = (1 - alpha) * profile.avgConfidence + alpha * confidence;
      profile.avgAttentionSpan = (1 - alpha) * profile.avgAttentionSpan + alpha * attentionSpan;
      
      // Fatigue slope: weighted average
      if (profile.sessionCount > 0) {
        profile.fatigueSlope = (1 - alpha) * profile.fatigueSlope + alpha * (fatigueSlope || 0);
      } else {
        profile.fatigueSlope = fatigueSlope || 0;
      }
      
      profile.sessionCount += 1;
      
      await profile.save();
      
      return profile;
    } catch (error) {
      console.error('[AgentSelection] Error updating performance profile:', error);
      throw error;
    }
  }

  /**
   * Select best agent combo for a task
   * @param {Object} taskContext - Task context
   * @param {String} taskContext.topic - Topic
   * @param {String} taskContext.taskType - Task type (Lesson/Quiz)
   * @param {String} taskContext.gradeLevel - Grade level
   * @param {String} taskContext.subject - Subject
   * @param {String} taskContext.purpose - Purpose (Conceptual/Assessment/etc)
   * @param {String} taskContext.length - Length (Short/Medium/Long)
   * @param {Number} minSessions - Minimum sessions required for confidence (default: 3)
   * @returns {Promise<Object|null>} Best agent combo or null if no data
   */
  async selectBestAgentCombo(taskContext, minSessions = 3) {
    try {
      const {
        topic,
        taskType,
        gradeLevel,
        subject,
        purpose = taskType === 'Lesson' ? 'Conceptual' : 'Assessment',
        length = 'Unknown'
      } = taskContext;

      // Query for matching profiles with sufficient data
      const profiles = await AgentPerformance.find({
        topic,
        taskType,
        purpose,
        length,
        gradeLevel,
        subject,
        status: 'active',
        sessionCount: { $gte: minSessions }
      })
        .sort({ performanceScore: -1 })
        .limit(10);

      if (profiles.length === 0) {
        // Fallback: try without length constraint
        const fallbackProfiles = await AgentPerformance.find({
          topic,
          taskType,
          purpose,
          gradeLevel,
          subject,
          status: 'active',
          sessionCount: { $gte: minSessions }
        })
          .sort({ performanceScore: -1 })
          .limit(10);

        if (fallbackProfiles.length === 0) {
          return null; // No data available
        }

        return this.parseAgentCombo(fallbackProfiles[0].agentCombo);
      }

      // Return best performing combo
      return this.parseAgentCombo(profiles[0].agentCombo);
    } catch (error) {
      console.error('[AgentSelection] Error selecting agent combo:', error);
      return null;
    }
  }

  /**
   * Get top N agent combos for a task context
   * @param {Object} taskContext - Task context
   * @param {Number} limit - Number of combos to return
   * @returns {Promise<Array>} Array of agent combos with performance data
   */
  async getTopAgentCombos(taskContext, limit = 5) {
    try {
      const {
        topic,
        taskType,
        gradeLevel,
        subject,
        purpose = taskType === 'Lesson' ? 'Conceptual' : 'Assessment',
        length = 'Unknown'
      } = taskContext;

      const profiles = await AgentPerformance.find({
        topic,
        taskType,
        purpose,
        length,
        gradeLevel,
        subject,
        status: 'active'
      })
        .sort({ performanceScore: -1 })
        .limit(limit);

      return profiles.map(profile => ({
        agentCombo: this.parseAgentCombo(profile.agentCombo),
        performance: {
          score: profile.performanceScore,
          clarity: profile.avgClarity,
          engagement: profile.avgEngagement,
          confidence: profile.avgConfidence,
          attentionSpan: profile.avgAttentionSpan,
          fatigueSlope: profile.fatigueSlope,
          sessions: profile.sessionCount
        }
      }));
    } catch (error) {
      console.error('[AgentSelection] Error getting top combos:', error);
      return [];
    }
  }

  /**
   * Deprecate poor performing combos (for A/B testing)
   * @param {Number} threshold - Performance score threshold (default: 0.4)
   * @param {Number} minSessions - Minimum sessions to consider (default: 5)
   * @returns {Promise<Number>} Number of combos deprecated
   */
  async deprecatePoorCombos(threshold = 0.4, minSessions = 5) {
    try {
      const result = await AgentPerformance.updateMany(
        {
          performanceScore: { $lt: threshold },
          sessionCount: { $gte: minSessions },
          status: 'active'
        },
        {
          status: 'deprecated'
        }
      );

      console.log(`[AgentSelection] Deprecated ${result.modifiedCount} poor performing combos`);
      return result.modifiedCount;
    } catch (error) {
      console.error('[AgentSelection] Error deprecating combos:', error);
      return 0;
    }
  }

  /**
   * Parse agent combo string into model objects
   * @param {String} comboString - e.g., "openai+google"
   * @returns {Object} Parsed combo with provider/model info
   */
  parseAgentCombo(comboString) {
    if (!comboString || comboString === 'unknown') {
      return null;
    }

    const providers = comboString.split('+');
    
    if (providers.length === 1) {
      return {
        primary: {
          provider: providers[0],
          model: this.getDefaultModel(providers[0])
        }
      };
    }

    return {
      primary: {
        provider: providers[0],
        model: this.getDefaultModel(providers[0])
      },
      secondary: {
        provider: providers[1],
        model: this.getDefaultModel(providers[1])
      }
    };
  }

  /**
   * Get default model for a provider
   */
  getDefaultModel(provider) {
    const defaults = {
      'openai': 'gpt-4o',
      'google': 'gemini-2.5-flash',
      'anthropic': 'claude-3-7-sonnet-20250219'
    };
    return defaults[provider] || 'gpt-4o';
  }
}

export default new AgentSelectionService();

