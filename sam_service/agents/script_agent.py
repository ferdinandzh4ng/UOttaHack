"""
Script Generation Agent for Solace Agent Mesh
Generates lesson scripts divided into slides
Supports multiple AI providers for comparison
Handles messages from Solace event mesh topics
"""
import json
from datetime import datetime
from typing import Dict, Any, Optional
# TODO: Fix Agent import - solace_agent_mesh package API differs
# For now, create a simple Agent base class
# from solace_agent_mesh import Agent, Tool

class Agent:
    """Simple Agent base class for event mesh compatibility"""
    def __init__(self, name, instructions=""):
        self.name = name
        self.instructions = instructions
        self.tools = []
    
    def register_tool(self, tool):
        self.tools.append(tool)
    
    async def publish(self, topic, message):
        """Publish message - to be implemented with actual Solace connection"""
        pass

class Tool:
    """Simple Tool class for compatibility"""
    pass
from .multi_model_agent import MultiModelAgent

class ScriptAgent(Agent, MultiModelAgent):
    """Agent that generates educational lesson scripts with multiple model support"""
    
    # Supported models for script generation (all via Backboard.io)
    # Models are from Backboard.io Model Library: https://backboard.io
    SUPPORTED_MODELS = [
        {'provider': 'google', 'model': 'gemini-2.5-flash-lite', 'name': 'Google Gemini 2.5 Flash Lite', 'uses_credits': True},
        {'provider': 'google', 'model': 'gemini-2.5-flash', 'name': 'Google Gemini 2.5 Flash', 'uses_credits': True},
        {'provider': 'google', 'model': 'gemini-2.5-pro', 'name': 'Google Gemini 2.5 Pro', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-4o', 'name': 'OpenAI GPT-4o', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-5', 'name': 'OpenAI GPT-5', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-5-mini', 'name': 'OpenAI GPT-5 Mini', 'uses_credits': True},
        {'provider': 'openai', 'model': 'gpt-4.1', 'name': 'OpenAI GPT-4.1', 'uses_credits': True},
        {'provider': 'anthropic', 'model': 'claude-3-7-sonnet-20250219', 'name': 'Anthropic Claude 3.7 Sonnet', 'uses_credits': True},
    ]
    
    def __init__(self):
        MultiModelAgent.__init__(self, "script_agent", ['google', 'openai', 'anthropic'])
        Agent.__init__(
            self,
            name="script_agent",
            instructions="""You are an expert educational content creator. 
            Generate engaging, educational lesson scripts that are well-structured 
            and appropriate for classroom use. Break scripts into slides with 
            approximately 2 minutes of content per slide."""
        )
        
        # Register tool
        self.register_tool(self.generate_lesson_script)
        
        # Subscribe to model-specific topics for event mesh routing
        self.subscribe_topics = [
            "ai/task/script/lesson/google/*",
            "ai/task/script/lesson/openai/*",
            "ai/task/script/lesson/anthropic/*",
            "ai/task/script/lesson/openai/*",
            "ai/task/script/lesson"  # Fallback to general topic
        ]
    
    async def handle_message(self, message: Dict[str, Any], topic: str = None):
        """
        Handle incoming message from event mesh topic
        This is called automatically when a message is received on subscribed topics
        """
        try:
            # Extract metadata
            metadata = message.get("_metadata", {})
            provider = metadata.get("provider", "google")
            model = metadata.get("model")
            request_id = metadata.get("request_id")
            group_number = message.get("group_number")
            
            # Extract task parameters
            topic_name = message.get("topic")
            length_minutes = message.get("length_minutes")
            
            if not topic_name or not length_minutes:
                raise ValueError("Missing required parameters: topic or length_minutes")
            
            # Generate script
            result = await self.generate_lesson_script(
                topic_name,
                length_minutes,
                provider=provider,
                model=model
            )
            
            # Add tracking metadata to response
            result["_metadata"] = {
                "agent": "script_agent",
                "provider": provider,
                "model": model or next(
                    (m['model'] for m in self.SUPPORTED_MODELS if m['provider'] == provider),
                    'google/gemini-2.5-flash-lite'
                ),
                "model_name": next(
                    (m['name'] for m in self.SUPPORTED_MODELS if m['provider'] == provider),
                    'Google Gemini Pro'
                ),
                "request_id": request_id,
                "group_number": group_number,
                "processed_at": datetime.now().isoformat(),
                "topic_received": topic
            }
            
            # Publish response to response topic
            response_topic = "ai/task/script/lesson/response"
            await self.publish(response_topic, result)
            
            return result
        except Exception as e:
            # Publish error response
            error_response = {
                "error": str(e),
                "_metadata": {
                    "agent": "script_agent",
                    "request_id": message.get("_metadata", {}).get("request_id"),
                    "error_at": datetime.now().isoformat()
                }
            }
            await self.publish("ai/task/script/lesson/response", error_response)
            raise
    
    async def generate_lesson_script(self, topic: str, length_minutes: int, provider: str = 'google', model: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate a lesson script divided into slides
        
        Args:
            topic: The lesson topic
            length_minutes: Length of the lesson in minutes
            
        Returns:
            Dictionary with script and slides
        """
        num_slides = max(3, length_minutes // 2)
        
        prompt = f"""Create an educational lesson script about "{topic}" that is approximately {length_minutes} minutes long when spoken.

Break the script into {num_slides} slides (approximately 2 minutes per slide).

For each slide, provide:
1. A clear, engaging script that can be read aloud
2. Content that is educational and appropriate for students
3. Smooth transitions between slides

Format your response as JSON:
{{
  "script": "Full script text here",
  "slides": [
    {{
      "slideNumber": 1,
      "script": "Script content for slide 1"
    }},
    {{
      "slideNumber": 2,
      "script": "Script content for slide 2"
    }}
  ]
}}"""

        # Determine model to use
        model_config = next((m for m in self.SUPPORTED_MODELS if m['provider'] == provider), None)
        if not model_config:
            raise ValueError(f"Unsupported provider: {provider}")
        
        model_name = model or model_config['model']
        system_prompt = """You are an expert educational content creator. 
        Generate engaging, educational lesson scripts that are well-structured 
        and appropriate for classroom use."""
        
        # Use the specified provider to generate the script
        content = await self.call_llm(provider, prompt, system_prompt, model_name)
        
        # Parse JSON response
        try:
            # Extract JSON from markdown code blocks if present
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
            # Fallback if JSON parsing fails
            return {
                "script": content,
                "slides": [
                    {
                        "slideNumber": 1,
                        "script": content
                    }
                ],
                "_metadata": {
                    'provider': provider,
                    'model': model_name,
                    'model_name': model_config['name']
                }
            }
    
    async def execute_task(self, provider: str, **kwargs) -> Dict[str, Any]:
        """Execute script generation with specified provider"""
        return await self.generate_lesson_script(
            kwargs.get('topic'),
            kwargs.get('length_minutes'),
            provider=provider,
            model=kwargs.get('model')
        )

