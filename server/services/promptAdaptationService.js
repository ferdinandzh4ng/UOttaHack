/**
 * Prompt Adaptation Service
 * Modifies prompts based on feedback to improve AI performance
 */
class PromptAdaptationService {
  /**
   * Get adapted prompt based on feedback patterns
   * @param {Object} feedbackPattern - Aggregated feedback pattern
   * @param {String} basePrompt - Original prompt
   * @param {String} taskType - Task type (Lesson/Quiz)
   * @returns {String} Adapted prompt
   */
  adaptPrompt(feedbackPattern, basePrompt, taskType = 'Lesson') {
    const adaptations = [];

    // High fatigue → shorter paragraphs, more breaks
    if (feedbackPattern.fatigueTrend === 'rising' || feedbackPattern.avgFatigueSlope > 0.1) {
      adaptations.push({
        instruction: 'Use shorter paragraphs (2-3 sentences max). Insert recap checkpoints every 3-4 paragraphs.',
        priority: 'high'
      });
    }

    // Low clarity → more examples, simpler language
    if (feedbackPattern.avgClarity < 0.5) {
      adaptations.push({
        instruction: 'Include concrete examples every 2 paragraphs. Avoid dense notation. Use analogies.',
        priority: 'high'
      });
    }

    // High cognitive load → slower pacing, more repetition
    if (feedbackPattern.avgCognitiveLoad > 0.7) {
      adaptations.push({
        instruction: 'Slow down the pacing. Repeat key concepts. Use simpler sentence structures.',
        priority: 'medium'
      });
    }

    // Low engagement → more interactive elements, questions
    if (feedbackPattern.avgEngagement < 0.5) {
      adaptations.push({
        instruction: 'Include rhetorical questions. Add interactive elements. Use more engaging language.',
        priority: 'high'
      });
    }

    // Low attention span → shorter sections, more variety
    if (feedbackPattern.avgAttentionSpan < 0.5) {
      adaptations.push({
        instruction: 'Break content into shorter sections. Vary presentation style. Include visual descriptions.',
        priority: 'medium'
      });
    }

    // Build adapted prompt
    if (adaptations.length === 0) {
      return basePrompt; // No adaptations needed
    }

    // Sort by priority
    adaptations.sort((a, b) => {
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Build adaptation instructions
    const adaptationText = adaptations
      .map(a => `- ${a.instruction}`)
      .join('\n');

    const adaptedPrompt = `${basePrompt}

IMPORTANT ADAPTATIONS (based on student feedback):
${adaptationText}

Apply these adaptations throughout your response.`;

    return adaptedPrompt;
  }

  /**
   * Get prompt template modifications based on feedback
   * @param {Object} feedbackPattern - Aggregated feedback pattern
   * @returns {Object} Template modifications
   */
  getTemplateModifications(feedbackPattern) {
    const modifications = {
      paragraphLength: 'normal',
      exampleFrequency: 'normal',
      pacing: 'normal',
      interactivity: 'normal',
      complexity: 'normal'
    };

    // Adjust paragraph length
    if (feedbackPattern.fatigueTrend === 'rising') {
      modifications.paragraphLength = 'short';
    } else if (feedbackPattern.avgAttentionSpan < 0.5) {
      modifications.paragraphLength = 'short';
    }

    // Adjust example frequency
    if (feedbackPattern.avgClarity < 0.5) {
      modifications.exampleFrequency = 'high';
    }

    // Adjust pacing
    if (feedbackPattern.avgCognitiveLoad > 0.7) {
      modifications.pacing = 'slow';
    } else if (feedbackPattern.avgEngagement < 0.4) {
      modifications.pacing = 'fast';
    }

    // Adjust interactivity
    if (feedbackPattern.avgEngagement < 0.5) {
      modifications.interactivity = 'high';
    }

    // Adjust complexity
    if (feedbackPattern.avgClarity < 0.5 || feedbackPattern.avgCognitiveLoad > 0.7) {
      modifications.complexity = 'low';
    }

    return modifications;
  }

  /**
   * Generate system prompt with adaptations
   * @param {Object} feedbackPattern - Aggregated feedback pattern
   * @param {String} baseSystemPrompt - Base system prompt
   * @returns {String} Adapted system prompt
   */
  adaptSystemPrompt(feedbackPattern, baseSystemPrompt) {
    const modifications = this.getTemplateModifications(feedbackPattern);
    
    let adaptations = [];

    if (modifications.paragraphLength === 'short') {
      adaptations.push('Use shorter paragraphs (2-3 sentences maximum)');
    }

    if (modifications.exampleFrequency === 'high') {
      adaptations.push('Include concrete examples every 2 paragraphs');
    }

    if (modifications.pacing === 'slow') {
      adaptations.push('Use slower pacing with more repetition of key concepts');
    } else if (modifications.pacing === 'fast') {
      adaptations.push('Use faster pacing to maintain engagement');
    }

    if (modifications.interactivity === 'high') {
      adaptations.push('Include rhetorical questions and interactive elements');
    }

    if (modifications.complexity === 'low') {
      adaptations.push('Use simpler language and avoid dense notation');
    }

    if (adaptations.length === 0) {
      return baseSystemPrompt;
    }

    return `${baseSystemPrompt}

Based on student feedback, apply these adaptations:
${adaptations.map(a => `- ${a}`).join('\n')}`;
  }
}

export default new PromptAdaptationService();

