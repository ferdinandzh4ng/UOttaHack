import axios from 'axios';

/**
 * AI Router Service - Routes AI tasks through Solace Agent Mesh (SAM)
 * This service communicates with the Python SAM bridge API
 */
class AIRouterService {
  constructor() {
    // SAM Bridge API endpoint
    this.samBridgeUrl = process.env.SAM_BRIDGE_URL || 'http://localhost:5001';
    
    this.routingConfig = {
      // Script generation routing
      'script.lesson': {
        providers: ['openai', 'google', 'anthropic'],
        default: process.env.SCRIPT_GEN_PROVIDER || 'openai',
        endpoint: '/api/ai/task/script/lesson'
      },
      
      // Image generation routing
      'image.slide': {
        providers: ['openai', 'google'],
        default: process.env.IMAGE_GEN_PROVIDER || 'openai',
        endpoint: '/api/ai/task/image/slide'
      },
      
      // Speech generation routing
      'speech.slide': {
        providers: ['elevenlabs'],
        default: 'elevenlabs',
        endpoint: '/api/ai/task/speech/slide'
      },
      
      // Quiz generation routing
      'quiz.prompt': {
        providers: ['openai', 'google', 'anthropic'],
        default: process.env.QUIZ_GEN_PROVIDER || 'openai',
        endpoint: '/api/ai/task/quiz/prompt'
      },
      'quiz.questions': {
        providers: ['openai', 'google', 'anthropic'],
        default: process.env.QUIZ_GEN_PROVIDER || 'openai',
        endpoint: '/api/ai/task/quiz/questions'
      }
    };

    this.isInitialized = false;
  }

  /**
   * Initialize and check SAM bridge connection
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Check if SAM bridge is available
      const response = await axios.get(`${this.samBridgeUrl}/health`, {
        timeout: 5000
      });
      
      if (response.data.status === 'healthy') {
        this.isInitialized = true;
        console.log('AI Router Service initialized - Connected to SAM bridge');
      } else {
        throw new Error('SAM bridge health check failed');
      }
    } catch (error) {
      console.error('Error connecting to SAM bridge:', error.message);
      // Continue without SAM if connection fails (fallback to direct calls)
      console.warn('Falling back to direct AI service calls');
      this.isInitialized = false;
    }
  }

  /**
   * Execute task through SAM bridge API
   * @param {string} taskType - Type of task (e.g., 'script.lesson', 'image.slide')
   * @param {object} params - Task parameters
   * @param {string} params.provider - Optional: AI provider (e.g., 'google', 'openai')
   * @param {string} params.model - Optional: Specific model (e.g., 'google/gemini-pro')
   * @param {boolean} useSam - Whether to use SAM bridge (default: true)
   */
  async executeTask(taskType, params, useSam = true) {
    const config = this.routingConfig[taskType];
    if (!config) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    // If SAM is not initialized or useSam is false, fallback to direct calls
    if (!this.isInitialized || !useSam) {
      console.warn(`SAM not available, falling back to direct call for ${taskType}`);
      return await this.fallbackToDirectCall(taskType, params);
    }

    try {
      // Prepare request payload with provider/model if specified
      const payload = { ...params };
      
      // Call SAM bridge API
      const response = await axios.post(
        `${this.samBridgeUrl}${config.endpoint}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 120000 // 2 minutes timeout
        }
      );

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Task execution failed');
      }
    } catch (error) {
      console.warn(`SAM bridge call failed for ${taskType}, falling back:`, error.message);
      // Fallback to direct call
      return await this.fallbackToDirectCall(taskType, params);
    }
  }

  /**
   * Fallback to direct service calls when SAM is unavailable
   * All calls go through Backboard.io
   */
  async fallbackToDirectCall(taskType, params) {
    // Import services dynamically to avoid circular dependencies
    const imageGenerationService = (await import('./imageGenerationService.js')).default;
    const elevenLabsService = (await import('./elevenLabsService.js')).default;
    const quizGenerationService = (await import('./quizGenerationService.js')).default;

    switch (taskType) {
      case 'script.lesson':
        return await this.generateLessonScriptWithBackboard(
          params.topic, 
          params.lengthMinutes,
          params.provider,
          params.model
        );
      case 'image.slide':
        return await imageGenerationService.generateSlideImage(
          params.slideScript,
          params.slideNumber,
          params.topic,
          params.provider,
          params.model
        );
      case 'speech.slide':
        return await elevenLabsService.generateSpeech(params.text, params.voiceId);
      case 'quiz.prompt':
        return await quizGenerationService.generateQuizPrompt(
          params.topic,
          params.questionType,
          params.numQuestions,
          params.provider,
          params.model
        );
      case 'quiz.questions':
        return await quizGenerationService.generateQuizQuestions(
          params.quizPrompt,
          params.topic,
          params.questionType,
          params.numQuestions,
          params.provider,
          params.model
        );
      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }
  }

  /**
   * Generate lesson script using Backboard.io (fallback when SAM unavailable)
   */
  async generateLessonScriptWithBackboard(topic, lengthMinutes, provider = 'openai', model = null) {
    const backboardService = (await import('./backboardService.js')).default;
    
    const prompt = `Create an educational lesson script about "${topic}" that is approximately ${lengthMinutes} minutes long when spoken.

Break the script into ${Math.max(3, Math.floor(lengthMinutes / 2))} slides (approximately 2 minutes per slide).

For each slide, provide:
1. A clear, engaging script that can be read aloud
2. Content that is educational and appropriate for students
3. Smooth transitions between slides

Format your response as JSON:
{
  "script": "Full script text here",
  "slides": [
    {
      "slideNumber": 1,
      "script": "Script content for slide 1"
    },
    {
      "slideNumber": 2,
      "script": "Script content for slide 2"
    }
  ]
}`;

    const systemPrompt = 'You are an expert educational content creator. Create engaging, educational lesson scripts that are well-structured and appropriate for classroom use.';
    
    // Map provider/model to Backboard.io format
    const { llmProvider, modelName } = backboardService.mapProviderToModel(provider, model);
    
    return await backboardService.generateJSON(prompt, systemPrompt, llmProvider, modelName, {
      timeout: 120000
    });
  }


  /**
   * Get routing configuration from SAM bridge
   */
  async getRoutingConfig() {
    try {
      if (this.isInitialized) {
        const response = await axios.get(`${this.samBridgeUrl}/api/ai/router/config`, {
          timeout: 5000
        });
        return response.data.routingConfig || this.routingConfig;
      }
    } catch (error) {
      console.warn('Failed to get routing config from SAM, using local config');
    }
    return this.routingConfig;
  }

  /**
   * Update routing configuration (for dynamic provider selection)
   */
  updateRoutingConfig(taskType, provider) {
    if (this.routingConfig[taskType]) {
      if (this.routingConfig[taskType].providers.includes(provider)) {
        this.routingConfig[taskType].default = provider;
        return true;
      }
    }
    return false;
  }
}

export default new AIRouterService();

