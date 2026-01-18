import axios from 'axios';
import { Sentry } from '../index.js';

/**
 * Backboard.io Service - Unified service for all AI API calls through Backboard.io
 * All AI models are accessed via Backboard.io API
 */
class BackboardService {
  constructor() {
    this.apiKey = process.env.BACKBOARD_API_KEY;
    // Try different possible endpoints - Backboard.io might use a different base URL
    // If BACKBOARD_BASE_URL is not set, we'll try common variations
    this.baseURL = process.env.BACKBOARD_BASE_URL || 'https://backboard.io/api/v1';
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
    
    // Cache for assistants and threads
    this.assistantCache = new Map();
  }

  /**
   * Get or create an assistant
   * @private
   */
  async _getOrCreateAssistant(name, systemPrompt = "A helpful assistant") {
    const cacheKey = `${name}_${systemPrompt}`;
    if (this.assistantCache.has(cacheKey)) {
      return this.assistantCache.get(cacheKey);
    }

    // Try multiple possible endpoints if the default fails
    const possibleEndpoints = [
      this.baseURL,
      'https://api.backboard.io/v1',
      'https://backboard.io/api/v1',
      'https://api.backboard.io',
      'https://backboard.io/api'
    ];

    let lastError = null;
    for (const endpoint of possibleEndpoints) {
      try {
        const response = await axios.post(
          `${endpoint}/assistants`,
          {
            name: name,
            system_prompt: systemPrompt
          },
          {
            headers: this.headers,
            timeout: 30000
          }
        );

        const assistantId = response.data.assistant_id || response.data.id;
        this.assistantCache.set(cacheKey, assistantId);
        
        // Update baseURL if we found a working endpoint
        if (endpoint !== this.baseURL) {
          console.log(`✅ Found working Backboard.io endpoint: ${endpoint}`);
          this.baseURL = endpoint;
        }
        
        return assistantId;
      } catch (error) {
        lastError = error;
        // If it's not a DNS/connection error, don't try other endpoints
        if (error.code !== 'ENOTFOUND' && error.code !== 'ECONNREFUSED') {
          console.error('Backboard.io assistant creation error:', error.response?.data || error.message);
          throw new Error(`Failed to create assistant: ${error.response?.data?.error?.message || error.message}`);
        }
      }
    }

    // If all endpoints failed with DNS/connection errors
    console.error('Backboard.io assistant creation error: All endpoints failed', lastError?.message);
    throw new Error(`Failed to connect to Backboard.io API. Please check your BACKBOARD_BASE_URL environment variable or ensure Backboard.io is accessible. Error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Create a thread for an assistant
   * @private
   */
  async _createThread(assistantId) {
    try {
      const response = await axios.post(
        `${this.baseURL}/threads`,
        {
          assistant_id: assistantId
        },
        {
          headers: this.headers,
          timeout: 30000
        }
      );

      return response.data.thread_id || response.data.id;
    } catch (error) {
      console.error('Backboard.io thread creation error:', error.response?.data || error.message);
      throw new Error(`Failed to create thread: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Generate text using Backboard.io API
   * @param {string} prompt - User prompt
   * @param {string} systemPrompt - Optional system prompt
   * @param {string} llmProvider - LLM provider (e.g., 'openai', 'google', 'anthropic')
   * @param {string} modelName - Model name (e.g., 'gpt-4o', 'gemini-pro')
   * @param {object} options - Additional options
   * @returns {Promise<string>} Generated text content
   */
  async generateText(prompt, systemPrompt = null, llmProvider = 'openai', modelName = 'gpt-4o', options = {}) {
    if (!this.apiKey) {
      throw new Error('Backboard API key not configured');
    }

    try {
      const assistantName = `${llmProvider}_${modelName}`;
      const assistantId = await this._getOrCreateAssistant(assistantName, systemPrompt || "A helpful assistant");
      const threadId = await this._createThread(assistantId);

      const response = await axios.post(
        `${this.baseURL}/messages`,
        {
          thread_id: threadId,
          content: prompt,
          llm_provider: llmProvider,
          model_name: modelName,
          stream: false
        },
        {
          headers: this.headers,
          timeout: options.timeout || 120000
        }
      );

      return response.data.content || response.data.message?.content || '';
    } catch (error) {
      console.error('Backboard.io text generation error:', error.response?.data || error.message);
      throw new Error(`Backboard.io generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Generate text and parse as JSON
   * @param {string} prompt - User prompt
   * @param {string} systemPrompt - Optional system prompt
   * @param {string} llmProvider - LLM provider
   * @param {string} modelName - Model name
   * @param {object} options - Additional options
   * @returns {Promise<object>} Parsed JSON response
   */
  async generateJSON(prompt, systemPrompt = null, llmProvider = 'openai', modelName = 'gpt-4o', options = {}) {
    const content = await this.generateText(prompt, systemPrompt, llmProvider, modelName, options);
    
    try {
      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;
      return JSON.parse(jsonString);
    } catch (parseError) {
      // If not JSON, return as text object
      return { text: content };
    }
  }

  /**
   * Generate image using Backboard.io
   * @param {string} prompt - Image generation prompt
   * @param {string} llmProvider - LLM provider (e.g., 'openai' for DALL-E)
   * @param {string} modelName - Model name (e.g., 'dall-e-3', 'dall-e-2')
   * @param {object} options - Additional options
   * @returns {Promise<string>} Image URL or data URL
   */
  async generateImage(prompt, llmProvider = 'openai', modelName = 'dall-e-3', options = {}) {
    if (!this.apiKey) {
      throw new Error('Backboard API key not configured');
    }

    try {
      const assistantName = `${llmProvider}_${modelName}_image`;
      const systemPrompt = "You are an image generation specialist. Generate images based on user prompts.";
      const assistantId = await this._getOrCreateAssistant(assistantName, systemPrompt);
      const threadId = await this._createThread(assistantId);

      const response = await axios.post(
        `${this.baseURL}/messages`,
        {
          thread_id: threadId,
          content: prompt,
          llm_provider: llmProvider,
          model_name: modelName,
          stream: false
        },
        {
          headers: this.headers,
          timeout: options.timeout || 120000
        }
      );

      // Extract image from response
      const result = response.data;
      
      // Check if content is a URL
      const content = result.content || result.message?.content || '';
      if (typeof content === 'string' && (content.startsWith('http') || content.startsWith('data:image'))) {
        return content;
      }

      // Check for attachments
      if (result.attachments && Array.isArray(result.attachments) && result.attachments.length > 0) {
        for (const attachment of result.attachments) {
          if (attachment.url) return attachment.url;
          if (attachment.data) return attachment.data;
        }
      }

      // Check if content is JSON with image data
      try {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        if (parsed && typeof parsed === 'object') {
          if (parsed.image_url) return parsed.image_url;
          if (parsed.url) return parsed.url;
          if (parsed.image) return parsed.image;
        }
      } catch (e) {
        // Not JSON, continue
      }

      // Return content as-is (might be base64 or URL string)
      return content || '';
    } catch (error) {
      console.error('Backboard.io image generation error:', error.response?.data || error.message);
      throw new Error(`Image generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Map provider name to Backboard.io format
   * @param {string} provider - Provider name (e.g., 'openai', 'google', 'anthropic')
   * @param {string} model - Specific model identifier (optional)
   * @returns {object} {llmProvider, modelName}
   */
  mapProviderToModel(provider, model = null) {
    // Remove provider prefix from model if present
    let modelName = model;
    if (model && model.includes('/')) {
      modelName = model.split('/').pop();
    }

    // Map provider names
    let llmProvider = provider;
    if (provider === 'openrouter') {
      llmProvider = 'openai';
    }

    // Default model mappings
    if (!modelName) {
      const defaultModels = {
        'openai': 'gpt-4o',
        'google': 'gemini-pro',
        'anthropic': 'claude-3-sonnet',
        'openrouter': 'gpt-4o'
      };
      modelName = defaultModels[llmProvider] || 'gpt-4o';
    }

    return { llmProvider, modelName };
  }
}

export default new BackboardService();

