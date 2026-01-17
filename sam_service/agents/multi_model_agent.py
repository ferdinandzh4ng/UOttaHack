"""
Multi-Model Agent Base Class
All models go through Backboard.io - just change the model name
"""
import json
import os
from typing import Dict, Any, Optional
from abc import ABC, abstractmethod
from .backboard_service import get_backboard_service

class MultiModelAgent(ABC):
    """Base class for agents that support multiple model providers via Backboard.io"""
    
    def __init__(self, name: str, supported_providers: list):
        self.name = name
        self.supported_providers = supported_providers
        self.backboard_api_key = os.getenv('BACKBOARD_API_KEY')
        self.elevenlabs_api_key = os.getenv('ELEVENLABS_API_KEY')  # For speech only
    
    @abstractmethod
    async def execute_task(self, provider: str, **kwargs) -> Dict[str, Any]:
        """Execute the task with the specified provider"""
        pass
    
    async def generate_with_backboard(self, prompt: str, system_prompt: str = None, llm_provider: str = 'openai', model_name: str = 'gpt-4o') -> str:
        """Generate text using Backboard.io API"""
        if not self.backboard_api_key:
            raise ValueError("Backboard API key not configured")
        
        try:
            backboard_service = await get_backboard_service()
            return await backboard_service.generate_text(
                prompt=prompt,
                system_prompt=system_prompt,
                llm_provider=llm_provider,
                model_name=model_name,
                stream=False
            )
        except Exception as e:
            print(f"❌ Backboard.io API error for model {model_name}:", flush=True)
            print(f"   Error: {str(e)}", flush=True)
            raise ValueError(f"Backboard.io generation failed: {str(e)}")
    
    async def call_llm(self, provider: str, prompt: str, system_prompt: str = None, model: str = None) -> str:
        """Call the appropriate LLM via Backboard.io - all models go through Backboard.io"""
        # Map provider to Backboard.io format
        # Backboard.io uses provider names like "openai", "google", "anthropic"
        # Note: If Backboard.io account only supports certain models (e.g., Korean models),
        # we'll automatically fallback to OpenAI gpt-4o
        
        # Remove provider prefix from model if present (e.g., "openai/gpt-4" -> "gpt-4")
        if model and '/' in model:
            model = model.split('/')[-1]
        
        # Map model names to Backboard.io supported models
        # Based on Backboard.io Model Library: https://backboard.io
        backboard_model_map = {
            # OpenAI models - map to actual Backboard.io supported models
            'gpt-3.5-turbo': 'gpt-4o',  # gpt-3.5-turbo not in library, use gpt-4o
            'gpt-35-turbo': 'gpt-4o',
            'gpt-4': 'gpt-4o',          # Use gpt-4o (supported)
            'gpt-4-turbo': 'gpt-4o',
            'gpt-4o': 'gpt-4o',         # Already correct
            # Google models - use actual Backboard.io supported Gemini models
            'gemini-pro': 'gemini-2.5-pro',  # Map to supported model
            'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',  # Already correct
            'gemini-2.0-flash-exp': 'gemini-2.5-flash',  # Map to supported
            'gemini-2.5-flash': 'gemini-2.5-flash',  # Already correct
            'gemini-2.5-pro': 'gemini-2.5-pro',  # Already correct
            # Claude models - use actual Backboard.io supported Claude model
            'claude-3-sonnet': 'claude-3-7-sonnet-20250219',  # Map to latest supported
            'claude-3-opus': 'claude-3-7-sonnet-20250219',  # Map to latest supported
            'claude-3-5-sonnet-20241022': 'claude-3-7-sonnet-20250219',  # Map to latest
        }
        model_name = backboard_model_map.get(model, model or 'gpt-4o')
        
        # Determine provider based on model name
        # Backboard.io supports: openai, google, anthropic
        if model_name.startswith('gpt') or model_name.startswith('claude'):
            if model_name.startswith('gpt'):
                llm_provider = 'openai'
            elif model_name.startswith('claude'):
                llm_provider = 'anthropic'
            else:
                llm_provider = provider if provider in ('openai', 'google', 'anthropic') else 'openai'
        elif model_name.startswith('gemini'):
            llm_provider = 'google'
        else:
            # Default to original provider or openai
            llm_provider = provider if provider in ('openai', 'google', 'anthropic') else 'openai'
        
        # Log mapping if changed
        if model_name != (model or 'gpt-4o') or llm_provider != provider:
            print(f"ℹ️ Mapping model '{model or 'default'}' (provider: {provider}) to '{model_name}' (provider: {llm_provider}) for Backboard.io", flush=True)
        
        return await self.generate_with_backboard(prompt, system_prompt, llm_provider, model_name)
