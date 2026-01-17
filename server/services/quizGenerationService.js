import backboardService from './backboardService.js';

class QuizGenerationService {
  constructor() {
    this.provider = process.env.QUIZ_GEN_PROVIDER || 'openai';
  }

  /**
   * Generate quiz prompt using AI LLM via Backboard.io
   */
  async generateQuizPrompt(topic, questionType, numQuestions, provider = null, model = null) {
    const prompt = `Create a comprehensive quiz prompt for generating ${numQuestions} ${questionType} questions about ${topic}. The prompt should be detailed enough to generate high-quality educational questions.`;
    
    try {
      const useProvider = provider || this.provider;
      const { llmProvider, modelName } = backboardService.mapProviderToModel(useProvider, model);
      return await backboardService.generateText(prompt, null, llmProvider, modelName, {
        timeout: 120000
      });
    } catch (error) {
      console.error('Quiz prompt generation error:', error);
      throw error;
    }
  }

  /**
   * Generate quiz questions and answers using AI LLM via Backboard.io
   */
  async generateQuizQuestions(quizPrompt, topic, questionType, numQuestions, provider = null, model = null) {
    const systemPrompt = `You are an expert educational content creator. Generate high-quality quiz questions based on the provided prompt.`;
    
    const userPrompt = `Topic: ${topic}
Question Type: ${questionType}
Number of Questions: ${numQuestions}

Quiz Prompt: ${quizPrompt}

Generate exactly ${numQuestions} ${questionType} questions about ${topic}. For each question:
1. Provide a clear, educational question
2. If MCQ: Provide 4 options (A, B, C, D) with one correct answer
3. If True/False: Provide the correct answer (True or False)
4. If Short Answer: Provide a sample correct answer
5. Include a brief explanation for the correct answer

Format your response as JSON with this structure:
{
  "questions": [
    {
      "question": "Question text here",
      "type": "${questionType}",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Correct answer",
      "explanation": "Brief explanation"
    }
  ]
}`;

    try {
      const useProvider = provider || this.provider;
      const { llmProvider, modelName } = backboardService.mapProviderToModel(useProvider, model);
      return await backboardService.generateJSON(userPrompt, systemPrompt, llmProvider, modelName, {
        timeout: 120000
      });
    } catch (error) {
      console.error('Quiz questions generation error:', error);
      throw error;
    }
  }

}

export default new QuizGenerationService();

