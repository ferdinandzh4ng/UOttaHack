import openRouterService from './openRouterService.js';

class ImageGenerationService {
  constructor() {
    this.provider = process.env.IMAGE_GEN_PROVIDER || 'openrouter';
  }

  /**
   * Generate image using OpenRouter (supports image generation models)
   * Note: DALL-E models don't support temperature parameter
   */
  async generateWithOpenRouter(prompt, model = 'openai/gpt-5-image') {
    try {
      return await openRouterService.generateImage(prompt, model, {
        timeout: 120000
      });
    } catch (error) {
      console.error('OpenRouter image generation error:', error);
      throw error;
    }
  }

  /**
   * Generate image for a lesson slide using OpenRouter
   */
  async generateSlideImage(slideScript, slideNumber, topic, provider = null, model = null) {
    const prompt = `Educational illustration for slide ${slideNumber} about ${topic}. ${slideScript.substring(0, 200)}. Style: clean, educational, professional, suitable for classroom presentation.`;
    
    try {
      const useProvider = provider || this.provider;
      // Map model to valid OpenRouter model ID
      let modelName;
      if (model) {
        // Model is already provided, map it to valid OpenRouter ID
        modelName = openRouterService.mapProviderToModel(useProvider, model);
      } else {
        // Default to GPT-5 Image for image generation
        modelName = 'openai/gpt-5-image';
      }
      return await this.generateWithOpenRouter(prompt, modelName);
    } catch (error) {
      console.error('Slide image generation error:', error);
      throw new Error(`Image generation failed: ${error.message}`);
    }
  }

  /**
   * Generate multiple images for slides
   */
  async generateSlideImages(slides, topic) {
    const imagePromises = slides.map((slide, index) => 
      this.generateSlideImage(slide.script, index + 1, topic)
    );
    
    return await Promise.all(imagePromises);
  }
}

export default new ImageGenerationService();

