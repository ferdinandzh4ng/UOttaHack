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
import time
import base64
import boto3
from botocore.exceptions import ClientError

class ImageAgent(Agent):
    """Agent that generates images for educational slides with multiple model support"""
    
    # Supported models for image generation (all via OpenRouter)
    # For Google, we use gemini-2.5-flash-image
    SUPPORTED_MODELS = [
        {'provider': 'openai', 'model': 'openai/gpt-5-image', 'name': 'OpenAI GPT-5 Image', 'uses_credits': True},
        {'provider': 'openai', 'model': 'openai/gpt-5-image-mini', 'name': 'OpenAI GPT-5 Image Mini', 'uses_credits': True},
        {'provider': 'google', 'model': 'google/gemini-2.5-flash-image', 'name': 'Google Gemini 2.5 Flash Image', 'uses_credits': True},
    ]
    
    def __init__(self):
        super().__init__(
            name="image_agent",
            instructions="""You are an image generation specialist. 
            Create educational illustrations that are clean, professional, 
            and suitable for classroom presentations."""
        )
        
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        self.openrouter_base_url = "https://openrouter.ai/api/v1"
        if not self.openrouter_api_key:
            print("⚠️ OPENROUTER_API_KEY not configured", flush=True)
        
        # S3 configuration
        self.use_s3 = os.getenv("USE_S3", "false").lower() == "true"
        self.s3_bucket = os.getenv("AWS_S3_BUCKET")
        self.s3_region = os.getenv("AWS_REGION", "us-east-1")
        self.aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
        self.aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        
        # Debug S3 configuration
        print(f"🔍 Image Agent S3 Configuration Check:", flush=True)
        print(f"   USE_S3: {self.use_s3}", flush=True)
        print(f"   AWS_S3_BUCKET: {self.s3_bucket if self.s3_bucket else 'NOT SET'}", flush=True)
        print(f"   AWS_REGION: {self.s3_region}", flush=True)
        print(f"   AWS_ACCESS_KEY_ID: {'SET' if self.aws_access_key_id else 'NOT SET'}", flush=True)
        print(f"   AWS_SECRET_ACCESS_KEY: {'SET' if self.aws_secret_access_key else 'NOT SET'}", flush=True)
        
        # Initialize S3 client if configured
        self.s3_client = None
        if self.use_s3 and self.s3_bucket and self.aws_access_key_id and self.aws_secret_access_key:
            try:
                self.s3_client = boto3.client(
                    's3',
                    region_name=self.s3_region,
                    aws_access_key_id=self.aws_access_key_id,
                    aws_secret_access_key=self.aws_secret_access_key
                )
                print(f"✅ S3 client initialized for bucket: {self.s3_bucket}", flush=True)
            except Exception as e:
                print(f"❌ Failed to initialize S3 client: {e}", flush=True)
                print("⚠️ Falling back to returning image data directly", flush=True)
                self.use_s3 = False
        elif self.use_s3:
            print("⚠️ S3 enabled but missing required configuration. Images will be returned directly.", flush=True)
            print("   Required: AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY", flush=True)
            self.use_s3 = False
        
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
        
        # Map invalid model names to OpenRouter supported image models
        # OpenRouter supports various image generation models
        # For Google, use gemini-2.5-flash-image
        model_map = {
            'google/nano-banana-pro': 'google/gemini-2.5-flash-image',  # Map to supported model
            'dall-e-3': 'openai/gpt-5-image',  # Map to supported OpenAI image model
            'dall-e-2': 'openai/gpt-5-image-mini',  # Map to supported OpenAI image model
            'imagen-3': 'google/gemini-2.5-flash-image',  # Map to supported Google image model
            'google/gemini-3-pro-image-preview': 'google/gemini-2.5-flash-image',  # Use gemini-2.5-flash-image instead
            'stable-diffusion-xl': 'openai/gpt-5-image',  # Map to supported model
        }
        model_name = model_map.get(model_name, model_name)
        
        # For Google provider, default to gemini-2.5-flash-image if not specified
        if provider == 'google' and not model_name.startswith('google/'):
            model_name = 'google/gemini-2.5-flash-image'
        elif provider == 'google' and 'gemini-3-pro-image-preview' in model_name:
            # Replace any gemini-3-pro-image-preview with gemini-2.5-flash-image
            model_name = 'google/gemini-2.5-flash-image'
        
        # Ensure model has provider prefix for image models (OpenRouter format: "provider/model")
        if not '/' in model_name:
            # Add provider prefix if missing
            if provider == 'openai':
                model_name = f'openai/{model_name}' if not model_name.startswith('openai/') else model_name
            elif provider == 'google':
                model_name = f'google/{model_name}' if not model_name.startswith('google/') else model_name
        
        # All image generation goes through OpenRouter
        image_data = await self._generate_with_openrouter(prompt, model_name)
        
        # Validate that we got actual image data
        if not image_data or (isinstance(image_data, str) and len(image_data.strip()) == 0):
            print(f"❌ Image generation returned empty data for slide {slide_number}", flush=True)
            print(f"   Provider: {provider}, Model: {model_name}", flush=True)
            raise ValueError(f"Image generation returned empty data. The model '{model_name}' may not have generated an image, or the response format is unexpected.")
        
        # Log successful image generation
        if isinstance(image_data, str):
            if image_data.startswith('http'):
                print(f"✅ Generated image URL: {image_data[:100]}...", flush=True)
            elif image_data.startswith('data:image'):
                print(f"✅ Generated image data URL (base64, length: {len(image_data)})", flush=True)
            else:
                print(f"✅ Generated image data (length: {len(image_data)})", flush=True)
        
        # Upload to S3 if configured
        if self.use_s3 and self.s3_client:
            try:
                s3_url = await self._upload_image_to_s3(image_data, slide_number, topic)
                print(f"✅ Uploaded image to S3: {s3_url}", flush=True)
                return s3_url
            except Exception as e:
                print(f"❌ S3 upload error: {e}", flush=True)
                print("⚠️ Returning image data directly", flush=True)
        
        # Return image data directly if S3 is not configured or upload failed
        return image_data
    
    
    async def _generate_with_openrouter(self, prompt: str, model: str) -> str:
        """Generate image using OpenRouter API directly"""
        if not self.openrouter_api_key:
            raise ValueError("OpenRouter API key not configured")
        
        try:
            # Ensure model has provider prefix (e.g., "google/gemini-2.5-flash-image")
            if '/' not in model:
                raise ValueError(f"Model name must include provider prefix (e.g., 'google/gemini-2.5-flash-image'), got: {model}")
            
            # OpenRouter uses /chat/completions endpoint with modalities parameter
            headers = {
                "Authorization": f"Bearer {self.openrouter_api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/your-repo",  # Optional but recommended
                "X-Title": "UOttaHack Education Platform"  # Optional but recommended
            }
            
            request_body = {
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "modalities": ["image", "text"]  # Request image generation
            }
            
            print(f"🔍 Calling OpenRouter API for image generation", flush=True)
            print(f"   Model: {model}", flush=True)
            print(f"   Prompt length: {len(prompt)}", flush=True)
            
            # Make request with longer timeout for image generation
            response = requests.post(
                f"{self.openrouter_base_url}/chat/completions",
                headers=headers,
                json=request_body,
                timeout=180  # 3 minutes for image generation
            )
            response.raise_for_status()
            
            result = response.json()
            
            # Check for errors in the response
            if result.get("choices") and len(result["choices"]) > 0:
                choice = result["choices"][0]
                if choice.get("error"):
                    error_info = choice["error"]
                    error_message = error_info.get("message", "Unknown error")
                    error_code = error_info.get("code", "Unknown code")
                    # Check for nested error in metadata
                    if error_info.get("metadata") and error_info["metadata"].get("raw"):
                        try:
                            raw_error = json.loads(error_info["metadata"]["raw"])
                            if raw_error.get("error"):
                                nested_error = raw_error["error"]
                                error_message = nested_error.get("message", error_message)
                                error_code = nested_error.get("code", error_code)
                        except:
                            pass
                    raise ValueError(f"OpenRouter API error (code {error_code}): {error_message}")
            
            # Extract image from response (similar to Node.js version)
            if result.get("choices") and len(result["choices"]) > 0:
                message = result["choices"][0].get("message", {})
                
                # Check for images field first (Google Gemini returns images here)
                if message.get("images") and isinstance(message["images"], list) and len(message["images"]) > 0:
                    for img_item in message["images"]:
                        if isinstance(img_item, dict):
                            if img_item.get("type") == "image_url" and img_item.get("image_url"):
                                image_url = img_item["image_url"]
                                if isinstance(image_url, dict) and image_url.get("url"):
                                    image_data = image_url["url"]
                                    print(f"✅ Extracted image from images[].image_url.url", flush=True)
                                    return image_data
                                elif isinstance(image_url, str):
                                    print(f"✅ Extracted image from images[].image_url (string)", flush=True)
                                    return image_url
                            if img_item.get("image"):
                                print(f"✅ Extracted image from images[].image", flush=True)
                                return img_item["image"]
                            if img_item.get("url"):
                                print(f"✅ Extracted image from images[].url", flush=True)
                                return img_item["url"]
                
                # Check for image content in array format
                content = message.get("content")
                if isinstance(content, list):
                    # First check for type: "image" with image field (base64 data)
                    image_content = next((item for item in content if item.get("type") == "image"), None)
                    if image_content and image_content.get("image"):
                        print(f"✅ Extracted image from content[].image", flush=True)
                        return image_content["image"]
                    
                    # Fallback to image_url type
                    image_url_content = next((item for item in content if item.get("type") == "image_url"), None)
                    if image_url_content and image_url_content.get("image_url"):
                        image_url = image_url_content["image_url"]
                        if isinstance(image_url, dict) and image_url.get("url"):
                            print(f"✅ Extracted image from content[].image_url.url", flush=True)
                            return image_url["url"]
                        elif isinstance(image_url, str):
                            print(f"✅ Extracted image from content[].image_url (string)", flush=True)
                            return image_url
                
                # Check for image_url directly in message
                if message.get("image_url"):
                    image_url = message["image_url"]
                    if isinstance(image_url, dict) and image_url.get("url"):
                        print(f"✅ Extracted image from message.image_url.url", flush=True)
                        return image_url["url"]
                    elif isinstance(image_url, str):
                        print(f"✅ Extracted image from message.image_url (string)", flush=True)
                        return image_url
                
                # Some models return image as string content
                if isinstance(content, str) and content.startswith("http"):
                    print(f"✅ Extracted image from message.content (URL string)", flush=True)
                    return content
            
            # Fallback: check response data structure
            if result.get("data") and isinstance(result["data"], list) and len(result["data"]) > 0:
                if result["data"][0].get("url"):
                    print(f"✅ Extracted image from data[0].url", flush=True)
                    return result["data"][0]["url"]
            
            print(f"❌ No image found in OpenRouter response", flush=True)
            print(f"   Response structure: {json.dumps(result, indent=2)[:500]}...", flush=True)
            raise ValueError("No image URL found in OpenRouter response")
            
        except requests.exceptions.RequestException as e:
            print(f"❌ OpenRouter API request error for model {model}:", flush=True)
            print(f"   Error: {str(e)}", flush=True)
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_data = e.response.json()
                    print(f"   Response: {json.dumps(error_data, indent=2)}", flush=True)
                except:
                    print(f"   Response text: {e.response.text[:500]}", flush=True)
            raise ValueError(f"OpenRouter image generation failed: {str(e)}")
        except Exception as e:
            print(f"❌ OpenRouter API error for model {model}:", flush=True)
            print(f"   Error: {str(e)}", flush=True)
            raise ValueError(f"OpenRouter image generation failed: {str(e)}")
    
    async def _upload_image_to_s3(self, image_data: str, slide_number: int, topic: str) -> str:
        """
        Upload image to S3 bucket
        
        Args:
            image_data: Image data as base64 data URL, regular URL, or base64 string
            slide_number: Slide number for filename
            topic: Topic for filename (sanitized)
            
        Returns:
            S3 URL of the uploaded image
        """
        # Determine image format and get binary data
        image_bytes = None
        content_type = 'image/png'  # Default
        
        if isinstance(image_data, str):
            # Handle base64 data URL (data:image/png;base64,...)
            if image_data.startswith('data:image'):
                # Extract content type and base64 data
                header, encoded = image_data.split(',', 1)
                # Extract content type from header (e.g., "data:image/png;base64")
                if 'image/png' in header:
                    content_type = 'image/png'
                elif 'image/jpeg' in header or 'image/jpg' in header:
                    content_type = 'image/jpeg'
                elif 'image/webp' in header:
                    content_type = 'image/webp'
                elif 'image/gif' in header:
                    content_type = 'image/gif'
                
                try:
                    image_bytes = base64.b64decode(encoded)
                except Exception as e:
                    print(f"❌ Failed to decode base64 image data: {e}", flush=True)
                    raise
            
            # Handle regular URL - download the image
            elif image_data.startswith('http://') or image_data.startswith('https://'):
                try:
                    response = requests.get(image_data, timeout=30)
                    response.raise_for_status()
                    image_bytes = response.content
                    # Try to determine content type from response headers
                    content_type_header = response.headers.get('Content-Type', '')
                    if content_type_header.startswith('image/'):
                        content_type = content_type_header
                except Exception as e:
                    print(f"❌ Failed to download image from URL: {e}", flush=True)
                    raise
            
            # Handle raw base64 string (without data: prefix)
            else:
                # Check if it looks like base64 (alphanumeric + / + = padding)
                is_base64_like = all(c.isalnum() or c in ('+', '/', '=', '-', '_') for c in image_data[:100])
                
                if is_base64_like and len(image_data) > 50:
                    try:
                        # Add padding if needed (base64 strings must be multiple of 4)
                        padding = 4 - (len(image_data) % 4)
                        if padding != 4:
                            image_data = image_data + ('=' * padding)
                        
                        image_bytes = base64.b64decode(image_data, validate=True)
                    except Exception as e:
                        print(f"❌ Failed to decode base64 string: {e}", flush=True)
                        print(f"   Attempting to download as URL instead...", flush=True)
                        # If it's not base64, treat as URL and try to download
                        try:
                            response = requests.get(image_data, timeout=30)
                            response.raise_for_status()
                            image_bytes = response.content
                        except:
                            raise ValueError(f"Could not process image data: not a valid base64 string or URL")
                else:
                    # Doesn't look like base64, try as URL
                    try:
                        response = requests.get(image_data, timeout=30)
                        response.raise_for_status()
                        image_bytes = response.content
                    except:
                        raise ValueError(f"Could not process image data: not a valid base64 string or URL")
        
        if not image_bytes:
            raise ValueError("Could not extract image bytes from image data")
        
        # Generate filename
        timestamp = int(time.time() * 1000)
        # Sanitize topic for filename (remove special characters)
        sanitized_topic = "".join(c for c in topic[:50] if c.isalnum() or c in (' ', '-', '_')).strip().replace(' ', '_')
        extension = 'png'
        if 'jpeg' in content_type or 'jpg' in content_type:
            extension = 'jpg'
        elif 'webp' in content_type:
            extension = 'webp'
        elif 'gif' in content_type:
            extension = 'gif'
        
        filename = f"slide_{slide_number}_{sanitized_topic}_{timestamp}.{extension}"
        s3_key = f"images/{filename}"
        
        # Upload to S3
        # Note: Public access is controlled by bucket policy, not ACLs
        try:
            self.s3_client.put_object(
                Bucket=self.s3_bucket,
                Key=s3_key,
                Body=image_bytes,
                ContentType=content_type
            )
            
            # Generate public URL
            if self.s3_region == 'us-east-1':
                url = f"https://{self.s3_bucket}.s3.amazonaws.com/{s3_key}"
            else:
                url = f"https://{self.s3_bucket}.s3.{self.s3_region}.amazonaws.com/{s3_key}"
            
            print(f"✅ Uploaded image to S3: {url}", flush=True)
            return url
        except ClientError as e:
            print(f"❌ S3 upload error: {e}", flush=True)
            raise

