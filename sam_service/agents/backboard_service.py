"""
Backboard.io Service Helper
Provides a unified interface for Backboard.io API calls
"""
import os
import asyncio
from typing import Optional, Dict, Any
from backboard import BackboardClient

class BackboardService:
    """Service wrapper for Backboard.io API"""
    
    _instance = None
    _clients = {}  # Store clients per event loop
    _assistants = {}  # Cache assistants by name/model
    _api_key = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(BackboardService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        # Store API key but don't create client yet
        if self._api_key is None:
            self._api_key = os.getenv("BACKBOARD_API_KEY")
            if not self._api_key:
                raise ValueError("BACKBOARD_API_KEY not configured")
    
    def _get_client(self) -> BackboardClient:
        """Get or create a BackboardClient for the current event loop"""
        try:
            loop = asyncio.get_running_loop()
            loop_id = id(loop)
        except RuntimeError:
            # No running loop, use a default key
            loop_id = "default"
        
        # Create client for this event loop if it doesn't exist
        if loop_id not in self._clients:
            self._clients[loop_id] = BackboardClient(api_key=self._api_key)
        
        return self._clients[loop_id]
    
    async def _get_or_create_assistant(self, name: str, system_prompt: str = "A helpful assistant") -> str:
        """Get or create an assistant, caching by name"""
        if name in self._assistants:
            return self._assistants[name]
        
        # Get client for current event loop
        client = self._get_client()
        
        # Create assistant - Backboard.io SDK may have different parameter names
        # Try common variations
        try:
            # Try with system_prompt (from quick start example)
            assistant = await client.create_assistant(
                name=name,
                system_prompt=system_prompt
            )
        except (TypeError, AttributeError):
            try:
                # Try with instructions
                assistant = await client.create_assistant(
                    name=name,
                    instructions=system_prompt
                )
            except (TypeError, AttributeError):
                # Try with just name (system prompt will be in messages)
                assistant = await client.create_assistant(name=name)
        
        # Extract assistant ID (handle different response formats)
        if hasattr(assistant, 'assistant_id'):
            assistant_id = assistant.assistant_id
        elif hasattr(assistant, 'id'):
            assistant_id = assistant.id
        else:
            assistant_id = str(assistant)
        
        self._assistants[name] = assistant_id
        return assistant_id
    
    async def generate_text(
        self, 
        prompt: str, 
        system_prompt: Optional[str] = None,
        llm_provider: str = "openai",
        model_name: str = "gpt-4o",
        stream: bool = False
    ) -> str:
        """
        Generate text using Backboard.io
        
        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            llm_provider: LLM provider (e.g., "openai", "google", "anthropic")
            model_name: Model name (e.g., "gpt-4o", "gemini-pro")
            stream: Whether to stream the response
            
        Returns:
            Generated text content
        """
        assistant_name = f"{llm_provider}_{model_name}"
        system_prompt = system_prompt or "A helpful assistant"
        
        # Get client for current event loop
        client = self._get_client()
        
        # Get or create assistant (without system_prompt if SDK doesn't support it)
        assistant_id = await self._get_or_create_assistant(assistant_name, system_prompt)
        
        # Create a thread
        thread = await client.create_thread(assistant_id)
        thread_id = thread.thread_id if hasattr(thread, 'thread_id') else (thread.id if hasattr(thread, 'id') else str(thread))
        
        # Include system prompt in the message if assistant creation didn't accept it
        # Format: system prompt + user prompt
        full_prompt = f"{system_prompt}\n\nUser: {prompt}" if system_prompt and system_prompt != "A helpful assistant" else prompt
        
        # Map model names to Backboard.io supported models
        # Based on Backboard.io Model Library: https://backboard.io
        model_name_mapping = {
            # OpenAI models - map to supported models
            'gpt-3.5-turbo': 'gpt-4o',  # gpt-3.5-turbo not in library, use gpt-4o
            'gpt-35-turbo': 'gpt-4o',
            'gpt-4': 'gpt-4o',
            'gpt-4-turbo': 'gpt-4o',
            'gpt-4o': 'gpt-4o',  # Already correct
            # Google models - use actual supported Gemini models
            'gemini-pro': 'gemini-2.5-pro',  # Map to supported model
            'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',  # Already correct
            'gemini-2.0-flash-exp': 'gemini-2.5-flash',  # Map to supported
            'gemini-2.5-flash': 'gemini-2.5-flash',  # Already correct
            'gemini-2.5-pro': 'gemini-2.5-pro',  # Already correct
            # Claude models - use actual supported Claude model
            'claude-3-sonnet': 'claude-3-7-sonnet-20250219',  # Map to latest supported
            'claude-3-opus': 'claude-3-7-sonnet-20250219',  # Map to latest supported
            'claude-3-5-sonnet-20241022': 'claude-3-7-sonnet-20250219',  # Map to latest
        }
        backboard_model_name = model_name_mapping.get(model_name, model_name)
        
        # Determine provider based on model name (Backboard.io supports openai, google, anthropic)
        if backboard_model_name.startswith('gpt'):
            final_provider = 'openai'
        elif backboard_model_name.startswith('gemini'):
            final_provider = 'google'
        elif backboard_model_name.startswith('claude'):
            final_provider = 'anthropic'
        else:
            final_provider = llm_provider if llm_provider in ('openai', 'google', 'anthropic') else 'openai'
        
        # Log mapping if changed
        if backboard_model_name != model_name or final_provider != llm_provider:
            print(f"ℹ️ Mapping model '{model_name}' (provider: {llm_provider}) to '{backboard_model_name}' (provider: {final_provider}) for Backboard.io", flush=True)
        
        llm_provider = final_provider
        
        # Send message and get response with fallback and timeout handling
        max_attempts = 3
        timeout_seconds = 120.0  # 2 minutes timeout for text generation
        last_error = None
        
        for attempt in range(max_attempts):
            try:
                # Wrap in asyncio.wait_for to enforce timeout
                response = await asyncio.wait_for(
                    client.add_message(
                        thread_id=thread_id,
                        content=full_prompt,
                        llm_provider=llm_provider,
                        model_name=backboard_model_name,
                        stream=stream
                    ),
                    timeout=timeout_seconds
                )
                break  # Success, exit loop
            except asyncio.TimeoutError:
                error_msg = f"Request timed out after {timeout_seconds}s"
                last_error = error_msg
                if attempt < max_attempts - 1:
                    # If Gemini model times out, fallback to gpt-4o
                    if llm_provider == 'google' and 'gemini' in backboard_model_name.lower():
                        print(f"⚠️ Gemini model '{backboard_model_name}' timed out, trying 'gpt-4o' (provider: openai) as fallback", flush=True)
                        llm_provider = 'openai'
                        backboard_model_name = 'gpt-4o'
                        # Create new thread for fallback
                        thread = await client.create_thread(assistant_id)
                        thread_id = thread.thread_id if hasattr(thread, 'thread_id') else (thread.id if hasattr(thread, 'id') else str(thread))
                        continue
                    else:
                        print(f"⚠️ Request timed out, retrying ({attempt + 1}/{max_attempts})...", flush=True)
                        await asyncio.sleep(2)
                        continue
                else:
                    # Final attempt failed, try gpt-4o as last resort
                    if llm_provider != 'openai' or backboard_model_name != 'gpt-4o':
                        print(f"⚠️ All retries failed, trying 'gpt-4o' (provider: openai) as final fallback", flush=True)
                        llm_provider = 'openai'
                        backboard_model_name = 'gpt-4o'
                        # Create new thread for fallback
                        thread = await client.create_thread(assistant_id)
                        thread_id = thread.thread_id if hasattr(thread, 'thread_id') else (thread.id if hasattr(thread, 'id') else str(thread))
                        try:
                            response = await asyncio.wait_for(
                                client.add_message(
                                    thread_id=thread_id,
                                    content=full_prompt,
                                    llm_provider=llm_provider,
                                    model_name=backboard_model_name,
                                    stream=stream
                                ),
                                timeout=timeout_seconds
                            )
                            break
                        except:
                            raise ValueError(f"Backboard.io text generation timed out after {max_attempts} attempts with model '{model_name}'. Please try a different model.")
            except Exception as e:
                last_error = e
                error_msg = str(e)
                
                # If timeout error, handle it
                if "timeout" in error_msg.lower():
                    if attempt < max_attempts - 1:
                        # If Gemini model times out, fallback to gpt-4o
                        if llm_provider == 'google' and 'gemini' in backboard_model_name.lower():
                            print(f"⚠️ Gemini model '{backboard_model_name}' timed out, trying 'gpt-4o' (provider: openai) as fallback", flush=True)
                            llm_provider = 'openai'
                            backboard_model_name = 'gpt-4o'
                            # Create new thread for fallback
                            thread = await client.create_thread(assistant_id)
                            thread_id = thread.thread_id if hasattr(thread, 'thread_id') else (thread.id if hasattr(thread, 'id') else str(thread))
                            continue
                        else:
                            print(f"⚠️ Request timed out, retrying ({attempt + 1}/{max_attempts})...", flush=True)
                            await asyncio.sleep(2)
                            continue
                    else:
                        # Final attempt failed, try gpt-4o as last resort
                        if llm_provider != 'openai' or backboard_model_name != 'gpt-4o':
                            print(f"⚠️ All retries failed, trying 'gpt-4o' (provider: openai) as final fallback", flush=True)
                            llm_provider = 'openai'
                            backboard_model_name = 'gpt-4o'
                            # Create new thread for fallback
                            thread = await client.create_thread(assistant_id)
                            thread_id = thread.thread_id if hasattr(thread, 'thread_id') else (thread.id if hasattr(thread, 'id') else str(thread))
                            try:
                                response = await asyncio.wait_for(
                                    client.add_message(
                                        thread_id=thread_id,
                                        content=full_prompt,
                                        llm_provider=llm_provider,
                                        model_name=backboard_model_name,
                                        stream=stream
                                    ),
                                    timeout=timeout_seconds
                                )
                                break
                            except:
                                raise ValueError(f"Backboard.io text generation failed after {max_attempts} attempts: {error_msg}")
                
                # If model not supported, try with gpt-4o as fallback
                if 'not supported' in error_msg.lower() or 'supported models' in error_msg.lower():
                    if attempt < max_attempts - 1:
                        print(f"⚠️ Model '{backboard_model_name}' (provider: {llm_provider}) not supported, trying 'gpt-4o' (provider: openai) as fallback", flush=True)
                        llm_provider = 'openai'
                        backboard_model_name = 'gpt-4o'
                        # Create new thread for fallback
                        thread = await client.create_thread(assistant_id)
                        thread_id = thread.thread_id if hasattr(thread, 'thread_id') else (thread.id if hasattr(thread, 'id') else str(thread))
                        continue
                    else:
                        raise ValueError(f"Backboard.io does not support model '{model_name}'. Please use a supported model or configure your Backboard.io account for the desired models.")
                else:
                    raise
        
        # Extract content from response
        if hasattr(response, 'content'):
            return response.content
        elif hasattr(response, 'message') and hasattr(response.message, 'content'):
            return response.message.content
        else:
            return str(response)
    
    async def generate_image(
        self,
        prompt: str,
        llm_provider: str = "openrouter",
        model_name: str = "openai/gpt-5-image",
        stream: bool = False,
        timeout: float = 180.0
    ) -> str:
        """
        Generate image using Backboard.io
        
        Args:
            prompt: Image generation prompt
            llm_provider: LLM provider (for image models, use "openrouter" as Backboard.io routes images through openrouter)
            model_name: Model name (for image generation, e.g., "openai/gpt-5-image" or "google/gemini-2.5-flash-image")
            stream: Whether to stream the response
            timeout: Request timeout in seconds (default 180 for image generation)
            
        Returns:
            Image URL or base64 data URL
        """
        assistant_name = f"{llm_provider}_{model_name}_image"
        system_prompt = "You are an image generation specialist. Generate images based on user prompts."
        
        # Get client for current event loop
        client = self._get_client()
        
        # Get or create assistant
        assistant_id = await self._get_or_create_assistant(assistant_name, system_prompt)
        
        # Create a thread
        thread = await client.create_thread(assistant_id)
        thread_id = thread.thread_id if hasattr(thread, 'thread_id') else (thread.id if hasattr(thread, 'id') else str(thread))
        
        # Send message and get response with retry logic for timeouts
        # Wrap in asyncio.wait_for to enforce timeout
        max_retries = 2
        for attempt in range(max_retries):
            try:
                response = await asyncio.wait_for(
                    client.add_message(
                        thread_id=thread_id,
                        content=prompt,
                        llm_provider=llm_provider,
                        model_name=model_name,
                        stream=stream
                    ),
                    timeout=timeout
                )
                break
            except asyncio.TimeoutError:
                if attempt < max_retries - 1:
                    print(f"⚠️ Backboard.io request timed out after {timeout}s, retrying ({attempt + 1}/{max_retries})...", flush=True)
                    await asyncio.sleep(2)  # Wait before retry
                    continue
                raise ValueError(f"Backboard.io image generation timed out after {timeout} seconds")
            except Exception as e:
                if "timeout" in str(e).lower() and attempt < max_retries - 1:
                    print(f"⚠️ Backboard.io request timed out, retrying ({attempt + 1}/{max_retries})...", flush=True)
                    await asyncio.sleep(2)  # Wait before retry
                    continue
                raise
        
        # Extract image from response
        # Backboard.io may return images in different formats
        # Check multiple possible response structures
        content = None
        
        # Try different response structures
        if hasattr(response, 'content'):
            content = response.content
        elif hasattr(response, 'message') and hasattr(response.message, 'content'):
            content = response.message.content
        elif hasattr(response, 'data') and hasattr(response.data, 'content'):
            content = response.data.content
        elif isinstance(response, str):
            content = response
        elif isinstance(response, dict):
            # Check for common keys in dict response
            content = response.get('content') or response.get('message', {}).get('content') or response.get('data', {}).get('content')
            if not content:
                content = str(response)
        else:
            content = str(response)
        
        # Log response structure for debugging
        print(f"🔍 Image response type: {type(response)}", flush=True)
        if hasattr(response, '__dict__'):
            print(f"   Response attributes: {list(response.__dict__.keys())[:10]}", flush=True)
        print(f"   Content type: {type(content)}, Length: {len(str(content)) if content else 0}", flush=True)
        if content and isinstance(content, str):
            print(f"   Content preview: {content[:200]}...", flush=True)
        
        # Check if content is actually text (not an image)
        # If it starts with text like "Here's an illustration" or doesn't look like image data, it's likely text
        if isinstance(content, str):
            # Check if it's a valid image URL
            if content.startswith("http://") or content.startswith("https://"):
                # Could be an image URL, check if it ends with image extensions
                if any(content.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
                    return content
                # Or check if it's a data URL
                if content.startswith("data:image"):
                    return content
            elif content.startswith("data:image"):
                return content
            # Check if it looks like base64 image data (starts with base64-like string)
            elif len(content) > 100 and not content.startswith(('Here', 'This', 'The', 'An', 'A ')):
                # Might be base64, try to return it
                # But first check if it's clearly text
                if any(content.startswith(prefix) for prefix in ['Here\'s', 'Here is', 'This is', 'The image', 'An illustration']):
                    # This is text, not an image - Backboard.io returned text instead of image
                    print(f"⚠️ Backboard.io returned text instead of image: {content[:100]}...", flush=True)
                    raise ValueError(f"Backboard.io image generation returned text instead of an image URL or base64 data. The model may not support image generation, or the prompt needs to be adjusted.")
                # Might be base64, return it
                return content
        
        # Check if response has image attachments or data
        attachments = None
        if hasattr(response, 'attachments'):
            attachments = response.attachments
        elif hasattr(response, 'message') and hasattr(response.message, 'attachments'):
            attachments = response.message.attachments
        elif isinstance(response, dict):
            attachments = response.get('attachments') or response.get('message', {}).get('attachments')
        
        if attachments:
            for attachment in attachments:
                # Handle both dict and object attachments
                url = None
                if isinstance(attachment, dict):
                    url = attachment.get('url') or attachment.get('data')
                elif hasattr(attachment, 'url'):
                    url = attachment.url
                elif hasattr(attachment, 'data'):
                    url = attachment.data
                
                if url:
                    print(f"✅ Found image in attachments: {url[:100]}...", flush=True)
                    return url
        
        # Check if response has files or images
        files = None
        if hasattr(response, 'files'):
            files = response.files
        elif isinstance(response, dict):
            files = response.get('files')
        
        if files:
            for file in files:
                url = None
                if isinstance(file, dict):
                    url = file.get('url') or file.get('file_id')
                elif hasattr(file, 'url'):
                    url = file.url
                elif hasattr(file, 'file_id'):
                    url = file.file_id
                
                if url:
                    print(f"✅ Found image in files: {url[:100]}...", flush=True)
                    return url
        
        # If content is JSON, try to parse it
        import json
        try:
            if isinstance(content, str):
                # Try parsing as JSON
                parsed = json.loads(content)
                if isinstance(parsed, dict):
                    # Check for various image URL keys
                    for key in ['image_url', 'url', 'image', 'file_url', 'imageUrl', 'imageData', 'data']:
                        if key in parsed:
                            value = parsed[key]
                            if value and (isinstance(value, str) and (value.startswith('http') or value.startswith('data:image') or len(value) > 100)):
                                print(f"✅ Found image in JSON key '{key}': {str(value)[:100]}...", flush=True)
                                return value
        except json.JSONDecodeError:
            # Not JSON, continue
            pass
        except Exception as e:
            print(f"⚠️ Error parsing JSON content: {e}", flush=True)
            pass
        
        # If we get here and content looks like text, it's an error
        if isinstance(content, str) and any(content.startswith(prefix) for prefix in ['Here\'s', 'Here is', 'This is', 'The image', 'An illustration', 'I\'ll', 'I will']):
            print(f"⚠️ Backboard.io returned text instead of image: {content[:200]}...", flush=True)
            raise ValueError(f"Backboard.io image generation returned text instead of an image URL or base64 data. Response: {content[:200]}...")
        
        # If content is empty or very short, it's likely an error
        if not content or (isinstance(content, str) and len(content.strip()) < 50):
            print(f"❌ Backboard.io returned empty or very short content: {repr(content)}", flush=True)
            raise ValueError(f"Backboard.io image generation returned empty content. The model may not support image generation or the response format is unexpected.")
        
        # Return content as-is (might be base64 or URL string)
        print(f"✅ Returning image content (type: {type(content)}, length: {len(str(content))})", flush=True)
        return content

# Global instance
_backboard_service = None

async def get_backboard_service() -> BackboardService:
    """Get or create the global BackboardService instance"""
    global _backboard_service
    if _backboard_service is None:
        _backboard_service = BackboardService()
    return _backboard_service

