import backboardService from './backboardService.js';

class ImageGenerationService {
  constructor() {
    this.provider = process.env.IMAGE_GEN_PROVIDER || 'openai';
  }

  /**
   * Generate image using Backboard.io (supports image generation models)
   */
  async generateWithBackboard(prompt, llmProvider = 'openai', modelName = 'dall-e-3') {
    try {
      return await backboardService.generateImage(prompt, llmProvider, modelName, {
        timeout: 120000
      });
    } catch (error) {
      console.error('Backboard.io image generation error:', error);
      throw error;
    }
  }

  /**
   * Generate image for a lesson slide using Backboard.io
   */
  async generateSlideImage(slideScript, slideNumber, topic, provider = null, model = null) {
    const prompt = `Educational illustration for slide ${slideNumber} about ${topic}. ${slideScript.substring(0, 200)}. Style: clean, educational, professional, suitable for classroom presentation.`;
    
    try {
      const useProvider = provider || this.provider;
      const { llmProvider, modelName } = backboardService.mapProviderToModel(useProvider, model || 'dall-e-3');
      return await this.generateWithBackboard(prompt, llmProvider, modelName);
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

