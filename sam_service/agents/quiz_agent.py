"""
Quiz Generation Agents for Solace Agent Mesh
Generates quiz prompts and questions
Supports multiple AI providers for comparison
"""
import json
from typing import Dict, Any, List, Optional
# TODO: Fix Agent import - solace_agent_mesh package API differs
# Simple Agent base class for compatibility
class Agent:
    def __init__(self, name, instructions=""):
        self.name = name
        self.instructions = instructions
        self.tools = []
    
    def register_tool(self, tool):
        self.tools.append(tool)
    
    async def publish(self, topic, message):
        pass

class Tool:
    pass
from .multi_model_agent import MultiModelAgent

class QuizPromptAgent(Agent, MultiModelAgent):
    """Agent that generates quiz prompts with multiple model support"""
    
    # Supported models for quiz prompt generation (all via OpenRouter - uses your $10 credits)
    SUPPORTED_MODELS = [
        {'provider': 'google', 'model': 'google/gemini-pro', 'name': 'Google Gemini Pro', 'uses_credits': True},
        {'provider': 'openai', 'model': 'openai/gpt-3.5-turbo', 'name': 'OpenAI GPT-3.5 Turbo', 'uses_credits': True},
        {'provider': 'openai', 'model': 'openai/gpt-4', 'name': 'OpenAI GPT-4', 'uses_credits': True},
        {'provider': 'anthropic', 'model': 'anthropic/claude-3-sonnet', 'name': 'Anthropic Claude 3 Sonnet', 'uses_credits': True},
        {'provider': 'anthropic', 'model': 'anthropic/claude-3-opus', 'name': 'Anthropic Claude 3 Opus', 'uses_credits': True},
        {'provider': 'openrouter', 'model': 'mistralai/mistral-7b-instruct', 'name': 'Mistral 7B', 'uses_credits': True},
    ]
    
    def __init__(self):
        MultiModelAgent.__init__(self, "quiz_prompt_agent", ['google', 'openai', 'openrouter'])
        Agent.__init__(
            self,
            name="quiz_prompt_agent",
            instructions="""You are an expert educational content creator. 
            Generate comprehensive quiz prompts that are detailed enough to 
            generate high-quality educational questions."""
        )
        
        self.register_tool(self.generate_quiz_prompt)
    
    async def generate_quiz_prompt(self, topic: str, question_type: str, num_questions: int, provider: str = 'openai', model: Optional[str] = None) -> str:
        """
        Generate a quiz prompt
        
        Args:
            topic: The quiz topic
            question_type: Type of questions (MCQ, True/False, Short Answer, Mixed)
            num_questions: Number of questions to generate
            
        Returns:
            Generated quiz prompt
        """
        prompt = f"""Create a comprehensive quiz prompt for generating {num_questions} {question_type} questions about {topic}. 
        The prompt should be detailed enough to generate high-quality educational questions."""
        
        # Determine model to use
        model_config = next((m for m in self.SUPPORTED_MODELS if m['provider'] == provider), None)
        if not model_config:
            raise ValueError(f"Unsupported provider: {provider}")
        
        model_name = model or model_config['model']
        system_prompt = """You are an expert educational content creator. 
        Generate comprehensive quiz prompts that are detailed enough to 
        generate high-quality educational questions."""
        
        content = await self.call_llm(provider, prompt, system_prompt, model_name)
        return content
    
    async def execute_task(self, provider: str, **kwargs) -> str:
        """Execute quiz prompt generation with specified provider"""
        return await self.generate_quiz_prompt(
            kwargs.get('topic'),
            kwargs.get('question_type'),
            kwargs.get('num_questions'),
            provider=provider,
            model=kwargs.get('model')
        )


class QuizQuestionsAgent(Agent, MultiModelAgent):
    """Agent that generates quiz questions and answers with multiple model support"""
    
    # Supported models for quiz question generation (all via OpenRouter - uses your $10 credits)
    SUPPORTED_MODELS = [
        {'provider': 'google', 'model': 'google/gemini-pro', 'name': 'Google Gemini Pro', 'uses_credits': True},
        {'provider': 'openai', 'model': 'openai/gpt-3.5-turbo', 'name': 'OpenAI GPT-3.5 Turbo', 'uses_credits': True},
        {'provider': 'openai', 'model': 'openai/gpt-4', 'name': 'OpenAI GPT-4', 'uses_credits': True},
        {'provider': 'anthropic', 'model': 'anthropic/claude-3-sonnet', 'name': 'Anthropic Claude 3 Sonnet', 'uses_credits': True},
        {'provider': 'anthropic', 'model': 'anthropic/claude-3-opus', 'name': 'Anthropic Claude 3 Opus', 'uses_credits': True},
        {'provider': 'openrouter', 'model': 'mistralai/mistral-7b-instruct', 'name': 'Mistral 7B', 'uses_credits': True},
    ]
    
    def __init__(self):
        MultiModelAgent.__init__(self, "quiz_questions_agent", ['google', 'openai', 'openrouter'])
        Agent.__init__(
            self,
            name="quiz_questions_agent",
            instructions="""You are an expert educational content creator. 
            Generate high-quality quiz questions with correct answers and 
            explanations based on provided prompts."""
        )
        
        self.register_tool(self.generate_quiz_questions)
    
    async def generate_quiz_questions(self, quiz_prompt: str, topic: str, question_type: str, num_questions: int, provider: str = 'openai', model: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate quiz questions and answers
        
        Args:
            quiz_prompt: The quiz prompt to base questions on
            topic: The quiz topic
            question_type: Type of questions
            num_questions: Number of questions to generate
            
        Returns:
            Dictionary with questions array
        """
        # Determine model to use
        model_config = next((m for m in self.SUPPORTED_MODELS if m['provider'] == provider), None)
        if not model_config:
            raise ValueError(f"Unsupported provider: {provider}")
        
        model_name = model or model_config['model']
        system_prompt = "You are an expert educational content creator. Generate high-quality quiz questions based on the provided prompt."
        
        user_prompt = f"""Topic: {topic}
Question Type: {question_type}
Number of Questions: {num_questions}

Quiz Prompt: {quiz_prompt}

Generate exactly {num_questions} {question_type} questions about {topic}. For each question:
1. Provide a clear, educational question
2. If MCQ: Provide 4 options (A, B, C, D) with one correct answer
3. If True/False: Provide the correct answer (True or False)
4. If Short Answer: Provide a sample correct answer
5. Include a brief explanation for the correct answer

Format your response as JSON with this structure:
{{
  "questions": [
    {{
      "question": "Question text here",
      "type": "{question_type}",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Correct answer",
      "explanation": "Brief explanation"
    }}
  ]
}}"""

        content = await self.call_llm(provider, user_prompt, system_prompt, model_name)
        
        # Parse JSON response
        try:
            if "```json" in content:
                json_start = content.find("```json") + 7
                json_end = content.find("```", json_start)
                content = content[json_start:json_end].strip()
            elif "```" in content:
                json_start = content.find("```") + 3
                json_end = content.find("```", json_start)
                content = content[json_start:json_end].strip()
            
            result = json.loads(content)
            result['_metadata'] = {
                'provider': provider,
                'model': model_name,
                'model_name': model_config['name']
            }
            return result
        except json.JSONDecodeError:
            return {
                "questions": [],
                "_metadata": {
                    'provider': provider,
                    'model': model_name,
                    'model_name': model_config['name']
                }
            }
    
    async def execute_task(self, provider: str, **kwargs) -> Dict[str, Any]:
        """Execute quiz question generation with specified provider"""
        return await self.generate_quiz_questions(
            kwargs.get('quiz_prompt'),
            kwargs.get('topic'),
            kwargs.get('question_type'),
            kwargs.get('num_questions'),
            provider=provider,
            model=kwargs.get('model')
        )

