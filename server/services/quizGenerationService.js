import axios from 'axios';
import * as Sentry from '@sentry/node';

class QuizGenerationService {
  constructor() {
    this.provider = process.env.QUIZ_GEN_PROVIDER || 'openai';
    this.openRouterKey = process.env.OPENROUTER_API_KEY;
  }

  /**
   * Generate quiz prompt using OpenRouter (Claude or GPT-4)
   */
  async generateQuizPrompt(topic, questionType, numQuestions, provider = null, model = null) {
    const prompt = `Create a comprehensive quiz prompt for generating ${numQuestions} ${questionType} questions about ${topic}. The prompt should be detailed enough to generate high-quality educational questions.`;
    
    try {
      // Use Claude 3.5 Sonnet or GPT-4o via OpenRouter directly
      const modelToUse = model || 'anthropic/claude-3.5-sonnet';
      
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: modelToUse,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001'
          },
          timeout: 120000
        }
      );
      
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Quiz prompt generation error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Generate quiz questions and answers using OpenRouter (Claude or GPT-4)
   */
  async generateQuizQuestions(quizPrompt, topic, questionType, numQuestions, provider = null, model = null) {
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
      // Use Claude 3.5 Sonnet or GPT-4o via OpenRouter directly
      const modelToUse = model || 'anthropic/claude-3.5-sonnet';
      
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: modelToUse,
          messages: [
            {
              role: 'system',
              content: 'You are an expert educational content creator. Generate high-quality quiz questions based on the provided prompt. Always respond with valid JSON.'
            },
            {
              role: 'user',
              content: userPrompt
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001'
          },
          timeout: 120000
        }
      );
      
      const content = response.data.choices[0].message.content;
      const parsed = JSON.parse(content);
      
      // Validate number of questions
      const questions = parsed.questions || [];
      const actualCount = questions.length;
      
      if (actualCount !== numQuestions) {
        // This is a failure - capture in Sentry
        const error = new Error(`Quiz question count mismatch: requested ${numQuestions}, got ${actualCount}`);
        
        if (Sentry) {
          Sentry.setTag('agent_name', 'quiz_questions_agent');
          Sentry.setTag('provider', provider || 'unknown');
          Sentry.setTag('model_name', model || 'unknown');
          Sentry.setTag('service', 'quiz_generation');
          Sentry.setContext('quiz_validation', {
            requested_count: numQuestions,
            actual_count: actualCount,
            topic: topic,
            question_type: questionType,
            model: model,
            provider: provider,
          });
          Sentry.captureException(error);
        }
        
        console.error(`❌ Quiz question count mismatch: requested ${numQuestions}, got ${actualCount}`);
      }
      
      // Add metadata about validation
      parsed._metadata = {
        requested_questions: numQuestions,
        actual_questions: actualCount,
        question_count_match: actualCount === numQuestions
      };
      
      return parsed;
    } catch (error) {
      console.error('Quiz generation error:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new QuizGenerationService();

