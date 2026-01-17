"""
Image Generation Agent for Solace Agent Mesh
Generates images for lesson slides via OpenRouter
Supports multiple image generation models for comparison
"""
from typing import Dict, Any
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
import os
import requests
import json

class ImageAgent(Agent):
    """Agent that generates images for educational slides with multiple model support"""
    
    # Supported models for image generation (all via OpenRouter)
    # Updated to use valid OpenRouter model IDs
    SUPPORTED_MODELS = [
        {'provider': 'openai', 'model': 'openai/gpt-5-image', 'name': 'OpenAI: GPT-5 Image', 'uses_credits': True},
        {'provider': 'openai', 'model': 'openai/gpt-5-image-mini', 'name': 'OpenAI: GPT-5 Image Mini', 'uses_credits': True},
        {'provider': 'google', 'model': 'google/gemini-2.5-flash-image', 'name': 'Google: Gemini 2.5 Flash Image', 'uses_credits': True},
        {'provider': 'minimax', 'model': 'minimax/minimax-01', 'name': 'MiniMax: MiniMax-01', 'uses_credits': True},
        {'provider': 'minimax', 'model': 'minimax/minimax-m2.1', 'name': 'MiniMax: MiniMax M2.1', 'uses_credits': True},
        {'provider': 'prime-intellect', 'model': 'prime-intellect/intellect-3', 'name': 'Prime Intellect: INTELLECT-3', 'uses_credits': True},
        {'provider': 'minimax', 'model': 'minimax/minimax-m2', 'name': 'MiniMax: MiniMax M2', 'uses_credits': True},
    ]
    
    def __init__(self):
        super().__init__(
            name="image_agent",
            instructions="""You are an image generation specialist. 
            Create educational illustrations that are clean, professional, 
            and suitable for classroom presentations."""
        )
        
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")  # ✅ Use your $10 credits!
        self.openrouter_base_url = 'https://openrouter.ai/api/v1'
        self.openrouter_headers = {
            'Authorization': f'Bearer {self.openrouter_api_key}' if self.openrouter_api_key else None,
            'HTTP-Referer': os.getenv('OPENROUTER_REFERER', 'https://uottahack.com'),
            'X-Title': 'UOttaHack Learning Platform',
            'Content-Type': 'application/json'
        }
        
        # Register tool
        self.register_tool(self.generate_slide_image)
    
    async def generate_slide_image(self, slide_script: str, slide_number: int, topic: str, provider: str = 'google', model: str = None) -> str:
        """
        Generate an image for a lesson slide
        
        Args:
            slide_script: The script content for the slide
            slide_number: The slide number
            topic: The lesson topic
            
        Returns:
            URL or base64 data URL of the generated image
        """
        prompt = f"Educational illustration for slide {slide_number} about {topic}. {slide_script[:200]}. Style: clean, educational, professional, suitable for classroom presentation."
        
        # Determine model to use
        model_config = next((m for m in self.SUPPORTED_MODELS if m['provider'] == provider), None)
        if not model_config:
            raise ValueError(f"Unsupported provider: {provider}")
        
        model_name = model or model_config['model']
        
        # Map invalid model names to valid ones
        model_map = {
            'google/nano-banana-pro': 'google/gemini-2.5-flash-image',  # Map invalid model to valid one
            'openai/gpt-5-image-mini': 'openai/gpt-5-image-mini',  # Keep valid models
            'openai/gpt-5-image': 'openai/gpt-5-image',
        }
        model_name = model_map.get(model_name, model_name)
        
        # All image generation goes through OpenRouter
        return await self._generate_with_openrouter(prompt, model_name)
    
    
    async def _generate_with_openrouter(self, prompt: str, model: str) -> str:
        """Generate image using OpenRouter API (uses your $10 credits) ✅"""
        if not self.openrouter_api_key:
            raise ValueError("OpenRouter API key not configured")
        
        response = requests.post(
            f"{self.openrouter_base_url}/chat/completions",
            headers=self.openrouter_headers,
            json={
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "modalities": ["image", "text"]  # Request image generation
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
            print(f"OpenRouter API error for image model {model}:")
            print(f"Status: {response.status_code}")
            print(f"Response: {error_detail}")
            print(f"Request payload: {json.dumps({'model': model, 'messages': [{'role': 'user', 'content': prompt[:100] + '...'}], 'modalities': ['image', 'text']}, indent=2)}")
        
        response.raise_for_status()
        result = response.json()
        
        # Debug: Print response structure immediately (flush to ensure it shows)
        import sys
        print(f"\n{'='*80}", flush=True)
        print(f"DEBUG: OpenRouter response structure", flush=True)
        print(f"DEBUG: result keys: {list(result.keys())}", flush=True)
        print(f"DEBUG: has choices: {'choices' in result}", flush=True)
        if "choices" in result:
            print(f"DEBUG: choices length: {len(result['choices'])}", flush=True)
        
        # Extract image from response
        if "choices" in result and len(result["choices"]) > 0:
            message = result["choices"][0].get("message", {})
            print(f"DEBUG: message keys: {list(message.keys())}", flush=True)
            
            # Check for images field first (Google Gemini returns images here)
            images = message.get("images")
            if images and isinstance(images, list) and len(images) > 0:
                print(f"DEBUG: Found 'images' field with {len(images)} items", flush=True)
                for idx, img_item in enumerate(images):
                    print(f"DEBUG: images[{idx}] type = {type(img_item)}, keys = {list(img_item.keys()) if isinstance(img_item, dict) else 'not a dict'}", flush=True)
                    if isinstance(img_item, dict):
                        # Check for image_url structure
                        if img_item.get("type") == "image_url" and img_item.get("image_url"):
                            image_url_obj = img_item["image_url"]
                            if isinstance(image_url_obj, dict) and image_url_obj.get("url"):
                                url = image_url_obj["url"]
                                print(f"DEBUG: ✓✓✓ Found image URL in images[{idx}] (length: {len(url)})", flush=True)
                                return url
                            elif isinstance(image_url_obj, str):
                                print(f"DEBUG: ✓✓✓ Found image URL string in images[{idx}]", flush=True)
                                return image_url_obj
                        # Check for direct image field
                        elif img_item.get("image"):
                            print(f"DEBUG: ✓✓✓ Found image field in images[{idx}]", flush=True)
                            return str(img_item["image"])
                        # Check for url field directly
                        elif img_item.get("url"):
                            print(f"DEBUG: ✓✓✓ Found url field in images[{idx}]", flush=True)
                            return str(img_item["url"])
            
            # Fallback to checking content field
            content = message.get("content")
            
            # Debug: Print content type and structure
            print(f"DEBUG: content type = {type(content)}", flush=True)
            if content is None:
                print(f"DEBUG: content is None, message keys: {list(message.keys())}", flush=True)
                print(f"DEBUG: Full message (first 500 chars): {json.dumps(message, indent=2)[:500]}", flush=True)
            elif isinstance(content, list):
                print(f"DEBUG: content is a list with {len(content)} items", flush=True)
            elif isinstance(content, str):
                print(f"DEBUG: content is a string, length: {len(content)}, starts with: {content[:50]}", flush=True)
            
            # Handle list of content items
            if isinstance(content, list) and len(content) > 0:
                print(f"DEBUG: content is a list with {len(content)} items", flush=True)
                for idx, item in enumerate(content):
                    print(f"DEBUG: Processing item {idx}, type = {type(item)}", flush=True)
                    if isinstance(item, dict):
                        item_keys = list(item.keys())
                        item_type = item.get("type", "unknown")
                        print(f"DEBUG: item {idx} keys = {item_keys}, type = {item_type}", flush=True)
                        
                        # Check for image type with image field (base64 data) - PRIMARY CHECK
                        if item_type == "image":
                            print(f"DEBUG: ✓ Found image type item!", flush=True)
                            image_data = item.get("image")
                            print(f"DEBUG: image field exists: {bool(image_data)}, type: {type(image_data)}", flush=True)
                            if image_data:
                                img_str = str(image_data)
                                print(f"DEBUG: ✓✓✓ Returning image data (length: {len(img_str)})", flush=True)
                                return img_str  # Ensure it's a string
                            
                            # Fallback to url or data fields
                            fallback = item.get("url") or item.get("data")
                            if fallback:
                                print(f"DEBUG: Returning fallback image data", flush=True)
                                return str(fallback)
                        
                        # Check for image_url structure
                        elif item_type == "image_url" and item.get("image_url"):
                            image_url = item["image_url"]
                            if isinstance(image_url, str):
                                return image_url
                            elif isinstance(image_url, dict) and image_url.get("url"):
                                return image_url["url"]
                        
                        # Also check if image field exists regardless of type
                        if item.get("image"):
                            print(f"DEBUG: Found 'image' field in item {idx} (type: {item_type})", flush=True)
                            return str(item["image"])
                            
                    elif isinstance(item, str) and (item.startswith("http") or item.startswith("data:image")):
                        print(f"DEBUG: Found string image URL", flush=True)
                        return item
                
                print(f"DEBUG: Went through all {len(content)} items but didn't find image", flush=True)
            elif content is None:
                print(f"DEBUG: content is None, checking message directly")
                # Try to find image in message directly
                if message.get("image"):
                    return message["image"]
                if message.get("image_url"):
                    img_url = message["image_url"]
                    if isinstance(img_url, str):
                        return img_url
                    elif isinstance(img_url, dict):
                        return img_url.get("url") or img_url.get("image")
            
            # Handle string content
            elif isinstance(content, str):
                if content.startswith("http") or content.startswith("data:image"):
                    return content
                # Try to parse JSON
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, list):
                        for item in parsed:
                            if item.get("type") == "image":
                                # Check for base64 data in image field first
                                if item.get("image"):
                                    return item["image"]
                                return item.get("url") or item.get("data")
                            elif item.get("type") == "image_url":
                                return item.get("url") or (item.get("image_url", {}).get("url") if isinstance(item.get("image_url"), dict) else item.get("image_url"))
                except:
                    pass
            
            # Check for image_url directly in message
            if message.get("image_url"):
                image_url = message["image_url"]
                if isinstance(image_url, str):
                    return image_url
                elif isinstance(image_url, dict) and image_url.get("url"):
                    return image_url["url"]
        
        # If we get here, log the full response for debugging
        print(f"\n{'='*80}")
        print(f"ERROR: Could not extract image from response")
        print(f"Response structure:")
        print(json.dumps(result, indent=2)[:2000])  # Print first 2000 chars
        print(f"{'='*80}\n")
        raise ValueError("No image returned from OpenRouter")
    

