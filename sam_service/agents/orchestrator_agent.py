"""
Orchestrator Agent for Solace Agent Mesh
Routes tasks to appropriate agents with multiple model support
"""
from typing import Dict, Any, Optional
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
from .multi_model_agent import MultiModelAgent

class OrchestratorAgent(Agent, MultiModelAgent):
    """Orchestrator agent that routes tasks with multiple model support"""
    
    # Supported models for orchestrator (all via OpenRouter - uses your $10 credits)
    SUPPORTED_MODELS = [
        {'provider': 'google', 'model': 'google/gemini-pro', 'name': 'Google Gemini Pro', 'uses_credits': True},
        {'provider': 'openai', 'model': 'openai/gpt-3.5-turbo', 'name': 'OpenAI GPT-3.5 Turbo', 'uses_credits': True},
        {'provider': 'openai', 'model': 'openai/gpt-4', 'name': 'OpenAI GPT-4', 'uses_credits': True},
        {'provider': 'anthropic', 'model': 'anthropic/claude-3-sonnet', 'name': 'Anthropic Claude 3 Sonnet', 'uses_credits': True},
        {'provider': 'anthropic', 'model': 'anthropic/claude-3-opus', 'name': 'Anthropic Claude 3 Opus', 'uses_credits': True},
        {'provider': 'openrouter', 'model': 'mistralai/mistral-7b-instruct', 'name': 'Mistral 7B', 'uses_credits': True},
    ]
    
    def __init__(self):
        MultiModelAgent.__init__(self, "orchestrator", ['google', 'openai', 'openrouter'])
        Agent.__init__(
            self,
            name="orchestrator",
            instructions="""You are the orchestrator for the UOttaHack learning platform. 
            Your job is to route AI tasks to the appropriate specialized agents:
            - script_agent: For lesson script generation
            - image_agent: For slide image generation
            - speech_agent: For text-to-speech conversion
            - quiz_prompt_agent: For quiz prompt generation
            - quiz_questions_agent: For quiz question generation
            
            Route tasks based on the task type and delegate to the appropriate agent.
            You can also compare different models by routing the same task to multiple agents."""
        )
    
    async def execute_task(self, provider: str, **kwargs) -> Dict[str, Any]:
        """Execute orchestration task with specified provider"""
        return await self.route_task(
            kwargs.get('task_type'),
            kwargs.get('params', {}),
            provider=provider,
            model=kwargs.get('model')
        )
    
    async def route_task(self, task_type: str, params: Dict[str, Any], provider: str = 'openai', model: Optional[str] = None) -> Dict[str, Any]:
        """
        Route a task to the appropriate agent
        
        Args:
            task_type: Type of task (script.lesson, image.slide, etc.)
            params: Task parameters
            provider: LLM provider to use for orchestration logic
            model: Specific model to use
            
        Returns:
            Routing decision and metadata
        """
        routing_prompt = f"""Based on the task type "{task_type}" and parameters, determine:
1. Which agent should handle this task
2. What parameters to pass to that agent
3. Whether to use model comparison mode

Task Type: {task_type}
Parameters: {params}

Respond with JSON:
{{
  "agent": "agent_name",
  "params": {{}},
  "compare_models": false
}}"""

        model_config = next((m for m in self.SUPPORTED_MODELS if m['provider'] == provider), None)
        if not model_config:
            raise ValueError(f"Unsupported provider: {provider}")
        
        model_name = model or model_config['model']
        system_prompt = """You are the orchestrator for the UOttaHack learning platform. 
        Route tasks to the appropriate specialized agents."""
        
        # For now, return simple routing (can be enhanced with LLM-based routing)
        routing_map = {
            'script.lesson': {'agent': 'script_agent', 'params': params},
            'image.slide': {'agent': 'image_agent', 'params': params},
            'speech.slide': {'agent': 'speech_agent', 'params': params},
            'quiz.prompt': {'agent': 'quiz_prompt_agent', 'params': params},
            'quiz.questions': {'agent': 'quiz_questions_agent', 'params': params},
        }
        
        if task_type in routing_map:
            return {
                **routing_map[task_type],
                '_metadata': {
                    'provider': provider,
                    'model': model_name,
                    'model_name': model_config['name']
                }
            }
        else:
            raise ValueError(f"Unknown task type: {task_type}")

