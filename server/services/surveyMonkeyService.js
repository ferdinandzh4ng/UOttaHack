import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Ensure .env is loaded before reading environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load .env from project root (two levels up from server/services/)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

/**
 * Survey Monkey Service
 * Handles submission of biometric feedback to Survey Monkey API
 * Maps metrics to survey responses with custom variables for analysis
 */
class SurveyMonkeyService {
  constructor() {
    this.apiBaseUrl = 'https://api.surveymonkey.com/v3';
    this.accessToken = process.env.SURVEYMONKEY_ACCESS_TOKEN;
    this.surveyId = process.env.SURVEYMONKEY_SURVEY_ID;
    this.collectorId = process.env.SURVEYMONKEY_COLLECTOR_ID;
    this.isConfigured = !!(this.accessToken && this.surveyId && this.collectorId);
    
    // Debug logging
    if (!this.isConfigured) {
      console.warn('[SurveyMonkey] Configuration check:', {
        hasAccessToken: !!this.accessToken,
        hasSurveyId: !!this.surveyId,
        hasCollectorId: !!this.collectorId,
        accessTokenLength: this.accessToken?.length || 0,
        surveyId: this.surveyId || 'missing',
        collectorId: this.collectorId || 'missing',
        envFile: path.join(__dirname, '..', '..', '.env')
      });
    } else {
      console.log('✅ [SurveyMonkey] Configured successfully:', {
        surveyId: this.surveyId,
        collectorId: this.collectorId,
        accessTokenPresent: !!this.accessToken
      });
    }
  }

  /**
   * Get API headers with authentication
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Map biometric metrics to survey question answers
   * @param {Object} metrics - Aggregated metrics from session
   * @returns {Object} Survey response payload
   */
  mapMetricsToSurveyResponse(metrics) {
    // Map metrics to survey scale (1-5 or 1-10 depending on survey setup)
    // Assuming survey uses 1-5 scale for simplicity
    
    // Clarity score: based on focus and thinking intensity
    // Higher focus + thinking = higher clarity
    const clarityScore = Math.round(
      ((metrics.averageFocusScore || 0) * 0.5 + 
       (metrics.averageThinkingIntensity || 0) * 0.5) / 20
    ); // Convert 0-100 to 1-5 scale
    
    // Engagement score: direct mapping
    const engagementScore = Math.round(
      (metrics.averageEngagementScore || 0) / 20
    ); // Convert 0-100 to 1-5 scale
    
    // Breathing stability: lower std dev = higher stability
    const breathingStability = metrics.breathingRateStdDev 
      ? Math.max(1, Math.min(5, Math.round(5 - (metrics.breathingRateStdDev / 2))))
      : 3; // Default neutral
    
    // Gaze attention: derived from focus duration (if available in metrics)
    // For now, use focus score as proxy
    const gazeAttention = Math.round(
      (metrics.averageFocusScore || 0) / 20
    );
    
    return {
      clarityScore: Math.max(1, Math.min(5, clarityScore)),
      engagementScore: Math.max(1, Math.min(5, engagementScore)),
      breathingStability: Math.max(1, Math.min(5, breathingStability)),
      gazeAttention: Math.max(1, Math.min(5, gazeAttention))
    };
  }

  /**
   * Submit feedback to Survey Monkey
   * @param {Object} sessionData - Session data with metrics and metadata
   * @param {Object} sessionData.aggregatedMetrics - Aggregated biometric metrics
   * @param {Object} sessionData.aiModels - AI models used
   * @param {String} sessionData.taskType - Task type (Lesson/Quiz)
   * @param {String} sessionData.topic - Topic
   * @param {String} sessionData.gradeLevel - Grade level
   * @param {String} sessionData.subject - Subject
   * @param {Number} sessionData.duration - Session duration in seconds
   * @returns {Promise<Object|null>} Survey response ID or null if failed
   */
  async submitFeedback(sessionData) {
    if (!this.isConfigured) {
      console.warn('[SurveyMonkey] Not configured - skipping feedback submission');
      return null;
    }

    try {
      const { aggregatedMetrics, aiModels, taskType, topic, gradeLevel, subject, duration } = sessionData;
      
      // Map metrics to survey responses
      const surveyAnswers = this.mapMetricsToSurveyResponse(aggregatedMetrics);
      
      // Build custom variables for filtering/analysis
      const customVariables = {
        agentCombo: this.buildAgentComboString(aiModels, taskType),
        topic: topic || 'unknown',
        taskType: taskType || 'unknown',
        gradeLevel: gradeLevel || 'unknown',
        subject: subject || 'unknown',
        length: this.categorizeLength(duration),
        purpose: taskType === 'Lesson' ? 'Conceptual' : 'Assessment',
        sessionId: sessionData.sessionId || 'unknown'
      };

      // Get survey structure to map answers to question IDs
      // Note: You'll need to configure your survey question IDs in env vars
      const questionMappings = await this.getQuestionMappings();
      
      // Validate page ID exists in survey
      if (!questionMappings.pageId || questionMappings.pageId === 'default') {
        console.error('[SurveyMonkey] Invalid page ID, cannot submit feedback');
        return null;
      }
      
      console.log(`[SurveyMonkey] Using page ID: ${questionMappings.pageId}`);
      
      // Build response payload
      const responsePayload = {
        pages: [{
          id: questionMappings.pageId,
          questions: [
            {
              id: questionMappings.clarityQuestionId,
              answers: [{
                choice_id: this.scoreToChoiceId(surveyAnswers.clarityScore, questionMappings.clarityChoices)
              }]
            },
            {
              id: questionMappings.engagementQuestionId,
              answers: [{
                choice_id: this.scoreToChoiceId(surveyAnswers.engagementScore, questionMappings.engagementChoices)
              }]
            },
            {
              id: questionMappings.breathingQuestionId,
              answers: [{
                choice_id: this.scoreToChoiceId(surveyAnswers.breathingStability, questionMappings.breathingChoices)
              }]
            },
            {
              id: questionMappings.gazeQuestionId,
              answers: [{
                choice_id: this.scoreToChoiceId(surveyAnswers.gazeAttention, questionMappings.gazeChoices)
              }]
            }
          ]
        }]
        // Note: custom_variables require a paid Survey Monkey plan and must be defined in the survey
        // If you have custom variables set up, uncomment the line below:
        // custom_variables: customVariables
      };
      
      // Log metadata for reference (even if we can't send as custom variables)
      console.log('[SurveyMonkey] Submitting feedback with metadata:', {
        agentCombo: customVariables.agentCombo,
        topic: customVariables.topic,
        taskType: customVariables.taskType,
        gradeLevel: customVariables.gradeLevel,
        subject: customVariables.subject
      });

      // Submit to Survey Monkey API
      const response = await axios.post(
        `${this.apiBaseUrl}/collectors/${this.collectorId}/responses`,
        responsePayload,
        { headers: this.getHeaders() }
      );

      console.log(`✅ [SurveyMonkey] Feedback submitted - Response ID: ${response.data.id}`);
      
      return {
        surveyResponseId: response.data.id,
        customVariables,
        surveyAnswers
      };
    } catch (error) {
      console.error('[SurveyMonkey] Error submitting feedback:', error.response?.data || error.message);
      // Don't throw - allow system to continue even if Survey Monkey fails
      return null;
    }
  }

  /**
   * Build agent combo string for custom variables
   * Includes full model names (e.g., "gemini-2.5-flash") not just providers
   */
  buildAgentComboString(aiModels, taskType) {
    if (!aiModels || typeof aiModels !== 'object') {
      return 'unknown';
    }
    
    if (taskType === 'Lesson') {
      const script = aiModels.scriptModel;
      const image = aiModels.imageModel;
      
      // Build combo with full model names
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
    } else if (taskType === 'Quiz') {
      const questions = aiModels.quizQuestionsModel;
      const prompt = aiModels.quizPromptModel;
      
      // Build combo with full model names
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
    
    return 'unknown';
  }

  /**
   * Categorize session length
   */
  categorizeLength(durationSeconds) {
    if (!durationSeconds) return 'Unknown';
    const minutes = durationSeconds / 60;
    if (minutes < 5) return 'Short';
    if (minutes < 15) return 'Medium';
    return 'Long';
  }

  /**
   * Get question ID mappings from environment or fetch from API
   * Note: These should be configured based on your actual Survey Monkey survey
   */
  async getQuestionMappings() {
    // Use page ID from env (it's the source of truth after setup)
    // Only fetch from API if env is not set
    let pageId = process.env.SURVEYMONKEY_PAGE_ID;
    
    // If no page ID in env, try to fetch from API
    if (!pageId && this.surveyId && this.accessToken) {
      try {
        const pagesResponse = await axios.get(
          `${this.apiBaseUrl}/surveys/${this.surveyId}/pages`,
          { headers: this.getHeaders() }
        );
        
        const pages = pagesResponse.data?.data || [];
        if (pages.length > 0) {
          // Use the first page
          pageId = pages[0].id;
          console.log(`[SurveyMonkey] Fetched page ID from API: ${pageId}`);
        } else {
          console.warn('[SurveyMonkey] No pages found in survey');
        }
      } catch (error) {
        console.error('[SurveyMonkey] Error fetching pages:', error.response?.data || error.message);
      }
    }
    
    if (!pageId) {
      console.error('[SurveyMonkey] No page ID available. Please set SURVEYMONKEY_PAGE_ID in .env');
    } else {
      console.log(`[SurveyMonkey] Using page ID: ${pageId}`);
    }
    
    // These should be set in .env based on your survey structure
    return {
      pageId: pageId || 'default',
      clarityQuestionId: process.env.SURVEYMONKEY_CLARITY_QUESTION_ID || 'clarity',
      engagementQuestionId: process.env.SURVEYMONKEY_ENGAGEMENT_QUESTION_ID || 'engagement',
      breathingQuestionId: process.env.SURVEYMONKEY_BREATHING_QUESTION_ID || 'breathing',
      gazeQuestionId: process.env.SURVEYMONKEY_GAZE_QUESTION_ID || 'gaze',
      // Choice IDs for 1-5 scale (you'll need to get these from your survey)
      clarityChoices: process.env.SURVEYMONKEY_CLARITY_CHOICES?.split(',') || ['1', '2', '3', '4', '5'],
      engagementChoices: process.env.SURVEYMONKEY_ENGAGEMENT_CHOICES?.split(',') || ['1', '2', '3', '4', '5'],
      breathingChoices: process.env.SURVEYMONKEY_BREATHING_CHOICES?.split(',') || ['1', '2', '3', '4', '5'],
      gazeChoices: process.env.SURVEYMONKEY_GAZE_CHOICES?.split(',') || ['1', '2', '3', '4', '5']
    };
  }

  /**
   * Convert score (1-5) to Survey Monkey choice ID
   * @param {Number} score - Score from 1-5
   * @param {Array} choices - Array of choice IDs (in order 1-5)
   * @returns {String} Choice ID
   */
  scoreToChoiceId(score, choices) {
    if (!choices || choices.length === 0) {
      console.warn('[SurveyMonkey] No choices provided, using default');
      return null;
    }
    
    // Score is 1-5, array index is 0-4
    const index = Math.max(0, Math.min(choices.length - 1, score - 1));
    const choiceId = choices[index];
    
    if (!choiceId) {
      console.warn(`[SurveyMonkey] No choice ID found for score ${score} at index ${index}`);
      return null;
    }
    
    return choiceId;
  }

  /**
   * Fetch survey responses (for webhook alternative or polling)
   * @param {Object} filters - Filters for responses (custom variables, date range, etc.)
   * @returns {Promise<Array>} Array of responses
   */
  async fetchResponses(filters = {}) {
    if (!this.isConfigured) {
      return [];
    }

    try {
      const params = new URLSearchParams();
      if (filters.per_page) params.append('per_page', filters.per_page);
      if (filters.page) params.append('page', filters.page);
      
      const response = await axios.get(
        `${this.apiBaseUrl}/surveys/${this.surveyId}/responses/bulk?${params.toString()}`,
        { headers: this.getHeaders() }
      );

      return response.data.data || [];
    } catch (error) {
      console.error('[SurveyMonkey] Error fetching responses:', error.response?.data || error.message);
      return [];
    }
  }
}

export default new SurveyMonkeyService();

