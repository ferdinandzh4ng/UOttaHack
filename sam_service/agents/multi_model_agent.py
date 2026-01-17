"""
Multi-Model Agent Base Class
All models go through OpenRouter - just change the model name
"""
import json
import os
import requests
from typing import Dict, Any, Optional
from abc import ABC, abstractmethod

class MultiModelAgent(ABC):
    """Base class for agents that support multiple model providers via OpenRouter"""
    
    def __init__(self, name: str, supported_providers: list):
        self.name = name
        self.supported_providers = supported_providers
        self.openrouter_api_key = os.getenv('OPENROUTER_API_KEY')
        self.elevenlabs_api_key = os.getenv('ELEVENLABS_API_KEY')  # For speech only
        self.openrouter_base_url = 'https://openrouter.ai/api/v1'
        self.openrouter_headers = {
            'Authorization': f'Bearer {self.openrouter_api_key}' if self.openrouter_api_key else None,
            'HTTP-Referer': os.getenv('OPENROUTER_REFERER', 'https://uottahack.com'),
            'X-Title': 'UOttaHack Learning Platform',
            'Content-Type': 'application/json'
        }
    
    @abstractmethod
    async def execute_task(self, provider: str, **kwargs) -> Dict[str, Any]:
        """Execute the task with the specified provider"""
        pass
    
    async def generate_with_openrouter(self, prompt: str, system_prompt: str = None, model: str = 'openai/gpt-3.5-turbo') -> str:
        """Generate text using OpenRouter API (uses your credits) ✅"""
        if not self.openrouter_api_key:
            raise ValueError("OpenRouter API key not configured")
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = requests.post(
            f"{self.openrouter_base_url}/chat/completions",
            headers=self.openrouter_headers,
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 3000
            },
            timeout=120
        )
        
        if not response.ok:
            error_detail = response.text
            try:
                error_json = response.json()
                error_detail = json.dumps(error_json, indent=2)
            except:
                pass
            print(f"OpenRouter API error for model {model}:")
            print(f"Status: {response.status_code}")
            print(f"Response: {error_detail}")
            print(f"Request payload: {json.dumps({'model': model, 'messages': messages, 'temperature': 0.7, 'max_tokens': 3000}, indent=2)}")
        
        response.raise_for_status()
        result = response.json()
        return result["choices"][0]["message"]["content"]
    
    async def call_llm(self, provider: str, prompt: str, system_prompt: str = None, model: str = None) -> str:
        """Call the appropriate LLM via OpenRouter - all models go through OpenRouter"""
        # Map provider to OpenRouter model name
        # Use updated model names that are valid on OpenRouter
        if provider == 'google':
            model = model or 'google/gemini-2.5-flash-lite'  # Updated to valid model
        elif provider == 'openai':
            model = model or 'openai/gpt-4'  # Use GPT-4 as default
        elif provider == 'anthropic':
            model = model or 'anthropic/claude-3-sonnet'
        elif provider == 'openrouter':
            model = model or 'openai/gpt-4'
        else:
            # Default to OpenRouter with specified model
            model = model or 'openai/gpt-4'
        
        # Map old model names to new ones
        model_map = {
            'google/gemini-pro': 'google/gemini-2.5-flash-lite',
            'google/gemini-pro-1.5-flash': 'google/gemini-2.5-flash-lite',
            'google/gemini-2.0-flash-exp': 'google/gemini-2.5-flash-lite',
        }
        if model in model_map:
            model = model_map[model]
        
        return await self.generate_with_openrouter(prompt, system_prompt, model)
