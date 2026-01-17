"""
Speech Generation Agent for Solace Agent Mesh
Generates speech audio from text using ElevenLabs
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
import time
import pathlib
import boto3
from botocore.exceptions import ClientError

class SpeechAgent(Agent):
    """Agent that generates speech from text"""
    
    def __init__(self):
        super().__init__(
            name="speech_agent",
            instructions="""You are a text-to-speech specialist. 
            Convert educational scripts into natural-sounding speech 
            suitable for classroom presentations."""
        )
        
        self.api_key = os.getenv("ELEVENLABS_API_KEY")
        self.voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
        self.base_url = "https://api.elevenlabs.io/v1"
        
        # S3 configuration
        self.use_s3 = os.getenv("USE_S3", "false").lower() == "true"
        self.s3_bucket = os.getenv("AWS_S3_BUCKET")
        self.s3_region = os.getenv("AWS_REGION", "us-east-1")
        self.aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
        self.aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        
        # Debug S3 configuration
        print(f"🔍 S3 Configuration Check:", flush=True)
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
                # Test S3 connection by listing bucket (optional, can be removed)
                print(f"✅ S3 client initialized for bucket: {self.s3_bucket}", flush=True)
            except Exception as e:
                print(f"❌ Failed to initialize S3 client: {e}", flush=True)
                print("⚠️ Falling back to local storage", flush=True)
                self.use_s3 = False
        elif self.use_s3:
            print("⚠️ S3 enabled but missing required configuration. Falling back to local storage.", flush=True)
            print("   Required: AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY", flush=True)
            self.use_s3 = False
        
        # Register tool
        self.register_tool(self.generate_speech)
    
    async def generate_speech(self, text: str, voice_id: str = None) -> str:
        """
        Generate speech audio from text
        
        Args:
            text: The text to convert to speech
            voice_id: Optional voice ID (defaults to configured voice)
            
        Returns:
            URL or file path of the generated audio
        """
        voice = voice_id or self.voice_id
        
        response = requests.post(
            f"{self.base_url}/text-to-speech/{voice}",
            headers={
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": self.api_key
            },
            json={
                "text": text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "style": 0.0,
                    "use_speaker_boost": True
                }
            },
            timeout=120
        )
        response.raise_for_status()
        
        timestamp = int(time.time() * 1000)
        filename = f"speech_{timestamp}.mp3"
        
        # Debug: Log S3 status before upload attempt
        print(f"🔍 Attempting to upload speech file: {filename}", flush=True)
        print(f"   use_s3: {self.use_s3}, s3_client: {self.s3_client is not None}", flush=True)
        
        # Upload to S3 if configured, otherwise save locally
        if self.use_s3 and self.s3_client:
            try:
                # Upload to S3
                s3_key = f"speech/{filename}"
                self.s3_client.put_object(
                    Bucket=self.s3_bucket,
                    Key=s3_key,
                    Body=response.content,
                    ContentType='audio/mpeg',
                    ACL='public-read'  # Make files publicly accessible
                )
                
                # Generate public URL
                if self.s3_region == 'us-east-1':
                    url = f"https://{self.s3_bucket}.s3.amazonaws.com/{s3_key}"
                else:
                    url = f"https://{self.s3_bucket}.s3.{self.s3_region}.amazonaws.com/{s3_key}"
                
                print(f"✅ Uploaded speech file to S3: {url}", flush=True)
                return url
            except ClientError as e:
                print(f"❌ S3 upload error: {e}", flush=True)
                print("⚠️ Falling back to local storage", flush=True)
                # Fall through to local storage
        
        # Fallback to local storage
        current_file = pathlib.Path(__file__).resolve()
        sam_service_dir = current_file.parent.parent  # Go up from agents/ to sam_service/
        project_root = sam_service_dir.parent  # Go up from sam_service/ to project root
        uploads_dir = project_root / "server" / "uploads"
        
        # Create uploads directory if it doesn't exist
        uploads_dir.mkdir(parents=True, exist_ok=True)
        filepath = uploads_dir / filename
        
        with open(filepath, "wb") as f:
            f.write(response.content)
        
        print(f"✅ Saved speech file locally to: {filepath}", flush=True)
        
        # Return URL path (Node.js server serves /uploads/ statically)
        return f"/uploads/{filename}"

