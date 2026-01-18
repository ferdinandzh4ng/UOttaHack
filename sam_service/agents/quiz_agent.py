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
    
    # Supported models for quiz prompt generation - ONLY OpenAI and Anthropic (NO GEMINI)
    SUPPORTED_MODELS = [
        {'provider': 'anthropic', 'model': 'claude-3-7-sonnet-20250219', 'name': 'Anthropic Claude 3.7 Sonnet', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-4o', 'name': 'OpenAI GPT-4o', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-5', 'name': 'OpenAI GPT-5', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-5-mini', 'name': 'OpenAI GPT-5 Mini', 'uses_credits': True},
    ]
    
    def __init__(self):
        MultiModelAgent.__init__(self, "quiz_prompt_agent", ['anthropic', 'openai'])
        Agent.__init__(
            self,
            name="quiz_prompt_agent",
            instructions="""You are an expert educational content creator. 
            Generate comprehensive quiz prompts that are detailed enough to 
            generate high-quality educational questions."""
        )
        
        self.register_tool(self.generate_quiz_prompt)
    
    async def generate_quiz_prompt(self, topic: str, question_type: str, num_questions: int, provider: str = 'anthropic', model: Optional[str] = None) -> str:
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
    
    # Supported models for quiz question generation - ONLY OpenAI and Anthropic (NO GEMINI)
    SUPPORTED_MODELS = [
        {'provider': 'anthropic', 'model': 'claude-3-7-sonnet-20250219', 'name': 'Anthropic Claude 3.7 Sonnet', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-4o', 'name': 'OpenAI GPT-4o', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-5', 'name': 'OpenAI GPT-5', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-5-mini', 'name': 'OpenAI GPT-5 Mini', 'uses_credits': True},
    ]
    
    def __init__(self):
        MultiModelAgent.__init__(self, "quiz_questions_agent", ['anthropic', 'openai'])
        Agent.__init__(
            self,
            name="quiz_questions_agent",
            instructions="""You are an expert educational content creator. 
            Generate high-quality quiz questions with correct answers and 
            explanations based on provided prompts."""
        )
        
        self.register_tool(self.generate_quiz_questions)
    
    async def generate_quiz_questions(self, quiz_prompt: str, topic: str, question_type: str, num_questions: int, provider: str = 'openai', model: Optional[str] = None) -> Dict[str, Any]:
        """anthropic
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
}}
YOU MUST HAVE {num_questions} QESTIONS AND ANSWERS!"""

        # Import sentry_helper for tracking
        try:
            from ..sentry_helper import (
                capture_agent_error,
                add_agent_breadcrumb,
                set_agent_context
            )
        except ImportError:
            # Fallback for when running directly (not as package)
            import sys
            import os
            parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            if parent_dir not in sys.path:
                sys.path.insert(0, parent_dir)
            from sentry_helper import (
                capture_agent_error,
                add_agent_breadcrumb,
                set_agent_context
            )
        
        # Set Sentry context
        set_agent_context('quiz_questions_agent', 'quiz_questions', provider, model_name)
        
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
            
            # Validate number of questions
            questions = result.get('questions', [])
            actual_count = len(questions)
            
            if actual_count != num_questions:
                # This is a failure - capture in Sentry
                error_msg = f"Quiz question count mismatch: requested {num_questions}, got {actual_count}"
                error = ValueError(error_msg)
                
                capture_agent_error(
                    error=error,
                    agent_name='quiz_questions_agent',
                    task_type='quiz_questions',
                    provider=provider,
                    message=error_msg,
                    model=model_name,
                    requested_count=num_questions,
                    actual_count=actual_count,
                    topic=topic,
                    question_type=question_type
                )
                
                add_agent_breadcrumb(
                    message=f"Question count validation failed: {actual_count}/{num_questions}",
                    category="validation",
                    level="error",
                    requested=num_questions,
                    actual=actual_count
                )
                
                print(f"❌ Quiz question count mismatch: requested {num_questions}, got {actual_count}", flush=True)
            
            result['_metadata'] = {
                'provider': provider,
                'model': model_name,
                'model_name': model_config['name'],
                'requested_questions': num_questions,
                'actual_questions': actual_count,
                'question_count_match': actual_count == num_questions
            }
            return result
        except json.JSONDecodeError as e:
            # Capture JSON parsing error
            try:
                from ..sentry_helper import capture_agent_error
            except ImportError:
                import sys
                import os
                parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                if parent_dir not in sys.path:
                    sys.path.insert(0, parent_dir)
                from sentry_helper import capture_agent_error
            
            capture_agent_error(
                error=e,
                agent_name='quiz_questions_agent',
                task_type='quiz_questions',
                provider=provider,
                message="Failed to parse quiz questions JSON",
                model=model_name
            )
            
            return {
                "questions": [],
                "_metadata": {
                    'provider': provider,
                    'model': model_name,
                    'model_name': model_config['name'],
                    'error': 'json_parse_failed'
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

