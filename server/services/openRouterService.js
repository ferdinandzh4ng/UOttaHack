import axios from 'axios';
import * as Sentry from '@sentry/node';

/**
 * OpenRouter Service - Unified service for all AI API calls through OpenRouter
 * All AI models are accessed via OpenRouter API
 */
class OpenRouterService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://uottahack.com',
      'X-Title': 'UOttaHack Learning Platform',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Generate text using OpenRouter API
   * @param {string} prompt - User prompt
   * @param {string} systemPrompt - Optional system prompt
   * @param {string} model - Model identifier (e.g., 'openai/gpt-4', 'google/gemini-pro')
   * @param {object} options - Additional options (temperature, max_tokens, etc.)
   * @returns {Promise<string>} Generated text content
   */
  async generateText(prompt, systemPrompt = null, model = 'openai/gpt-4', options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    // Parse model to get provider and model name
    const [provider, modelName] = model.includes('/') ? model.split('/') : ['openai', model];
    
    // Start Sentry transaction for tracking
    const transaction = Sentry?.startTransaction({
      op: 'ai.generate',
      name: `openrouter.${provider}.${modelName}`,
    });

    // Set tags for filtering in Sentry
    if (Sentry) {
      Sentry.setTag('provider', provider);
      Sentry.setTag('model_name', modelName);
      Sentry.setTag('service', 'openrouter');
      Sentry.setTag('model', model);
    }

    const startTime = Date.now();
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: model,
          messages: messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 3000
        },
        {
          headers: this.headers,
          timeout: options.timeout || 120000 // 2 minutes default
        }
      );

      const duration = Date.now() - startTime;
      const content = response.data.choices[0].message.content;

      // Record success metrics
      if (transaction) {
        transaction.setStatus('ok');
        transaction.setData('duration_ms', duration);
        transaction.setData('success', true);
        transaction.setData('response_length', content.length);
        transaction.setData('tokens_used', response.data.usage?.total_tokens || 0);
        transaction.finish();
      }

      // Add measurement for analytics
      if (Sentry) {
        Sentry.setMeasurement('ai_latency', duration, 'millisecond');
        Sentry.setMeasurement('response_length', content.length, 'none');
        if (response.data.usage?.total_tokens) {
          Sentry.setMeasurement('tokens_used', response.data.usage.total_tokens, 'none');
        }
      }

      return content;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record error metrics
      if (transaction) {
        transaction.setStatus('internal_error');
        transaction.setData('duration_ms', duration);
        transaction.setData('success', false);
        transaction.setData('error_type', error.response?.status || 'unknown');
        transaction.finish();
      }

      // Capture error with context
      if (Sentry) {
        Sentry.setContext('ai_error', {
          provider: provider,
          model: modelName,
          full_model: model,
          duration_ms: duration,
          error_status: error.response?.status,
          error_message: error.message,
        });
        Sentry.captureException(error);
      }

      console.error('OpenRouter text generation error:', error.response?.data || error.message);
      throw new Error(`OpenRouter generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Generate text and parse as JSON
   * @param {string} prompt - User prompt
   * @param {string} systemPrompt - Optional system prompt
   * @param {string} model - Model identifier
   * @param {object} options - Additional options
   * @returns {Promise<object>} Parsed JSON response
   */
  async generateJSON(prompt, systemPrompt = null, model = 'openai/gpt-4', options = {}) {
    const content = await this.generateText(prompt, systemPrompt, model, options);
    
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
   * Generate image using OpenRouter (for models that support image generation)
   * OpenRouter routes all image generation through /chat/completions with modalities parameter
   * @param {string} prompt - Image generation prompt
   * @param {string} model - Model identifier for image generation
   * @param {object} options - Additional options
   * @returns {Promise<string>} Image URL or data URL
   */
  async generateImage(prompt, model = 'openai/gpt-5-image', options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    // OpenRouter uses /chat/completions endpoint for all image generation models
    // with the modalities parameter to request image generation
    try {
      const requestBody = {
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        modalities: ['image', 'text'] // Request image generation
      };

      // Image generation models typically don't support temperature
      // Only add if explicitly requested and model supports it
      if (options.temperature !== undefined && options.temperature !== null) {
        requestBody.temperature = options.temperature;
      }

      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        requestBody,
        {
          headers: this.headers,
          timeout: options.timeout || 120000
        }
      );

      // Extract image from response
      const result = response.data;
      if (result.choices && result.choices[0] && result.choices[0].message) {
        const message = result.choices[0].message;
        
        // Check for images field first (Google Gemini returns images here)
        if (message.images && Array.isArray(message.images) && message.images.length > 0) {
          for (const imgItem of message.images) {
            // Check for image_url structure
            if (imgItem.type === 'image_url' && imgItem.image_url) {
              if (typeof imgItem.image_url === 'object' && imgItem.image_url.url) {
                return imgItem.image_url.url; // Returns base64 data URL
              } else if (typeof imgItem.image_url === 'string') {
                return imgItem.image_url;
              }
            }
            // Check for direct image field
            if (imgItem.image) {
              return imgItem.image;
            }
            // Check for url field directly
            if (imgItem.url) {
              return imgItem.url;
            }
          }
        }
        
        // Check for image content in array format
        if (message.content && Array.isArray(message.content)) {
          // First check for type: "image" with image field (base64 data)
          const imageContent = message.content.find(item => item.type === 'image');
          if (imageContent && imageContent.image) {
            return imageContent.image; // Returns base64 data URL
          }
          // Fallback to image_url type
          const imageUrlContent = message.content.find(item => item.type === 'image_url');
          if (imageUrlContent && imageUrlContent.image_url) {
            return imageUrlContent.image_url.url || imageUrlContent.image_url;
          }
        }
        
        // Check for image_url directly in message
        if (message.image_url) {
          return message.image_url.url || message.image_url;
        }
        
        // Some models return image as string content
        if (typeof message.content === 'string' && message.content.startsWith('http')) {
          return message.content;
        }
      }

      // Fallback: check response data structure
      if (result.data && result.data[0] && result.data[0].url) {
        return result.data[0].url;
      }

      throw new Error('No image URL found in response');
    } catch (error) {
      console.error('OpenRouter image generation error:', error.response?.data || error.message);
      throw new Error(`Image generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Map provider name to OpenRouter model
   * @param {string} provider - Provider name (e.g., 'openai', 'google', 'anthropic')
   * @param {string} model - Specific model identifier (optional)
   * @returns {string} OpenRouter model identifier
   */
  mapProviderToModel(provider, model = null) {
    // If model is already provided and in correct format, use it
    if (model && model.includes('/')) {
      // Validate and fix common model ID issues
      const modelMap = {
        'google/gemini-pro': 'google/gemini-2.5-flash-lite', // Use gemini-2.5-flash-lite
        'google/gemini-pro-1.5-flash': 'google/gemini-2.5-flash-lite', // Use gemini-2.5-flash-lite
        'google/gemini-2.0-flash-exp': 'google/gemini-2.5-flash-lite', // Use gemini-2.5-flash-lite
        // Note: openai/gpt-5-image and openai/gpt-5-image-mini are valid models, don't map them
        // Only map invalid/unsupported models to fallbacks
        'google/nano-banana-pro': 'google/gemini-2.5-flash-image', // Map to valid Google image model
        'minimax/minimax-01': 'openai/gpt-5-image', // Fallback for image models
        'minimax/minimax-m2.1': 'openai/gpt-5-image', // Fallback for image models
        'prime-intellect/intellect-3': 'openai/gpt-5-image' // Fallback for image models
      };
      
      return modelMap[model] || model;
    }

    // Default model mappings with valid OpenRouter model IDs
    const defaultModels = {
      'openai': 'openai/gpt-4',
      'google': 'google/gemini-2.5-flash-lite', // Use gemini-2.5-flash-lite
      'anthropic': 'anthropic/claude-3-sonnet',
      'openrouter': 'openai/gpt-4',
      'mistral': 'mistralai/mistral-7b-instruct',
      'minimax': 'openai/gpt-5-image', // Image generation fallback
      'prime-intellect': 'openai/gpt-5-image' // Image generation fallback
    };

    if (model) {
      // Try to construct model path
      const constructed = `${provider}/${model}`;
      // Check if we have a mapping for it
      const modelMap = {
        'google/gemini-pro': 'google/gemini-2.5-flash-lite',
        'google/gemini': 'google/gemini-2.5-flash-lite'
      };
      return modelMap[constructed] || constructed;
    }

    return defaultModels[provider] || 'openai/gpt-4';
  }
}

export default new OpenRouterService();

