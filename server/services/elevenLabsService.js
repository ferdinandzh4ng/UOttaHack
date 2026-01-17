import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ElevenLabsService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseURL = 'https://api.elevenlabs.io/v1';
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Default voice: Rachel
    
    // S3 configuration
    this.useS3 = process.env.USE_S3 === 'true';
    this.s3Bucket = process.env.AWS_S3_BUCKET;
    this.s3Region = process.env.AWS_REGION || 'us-east-1';
    this.awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    this.awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    // Debug S3 configuration
    console.log('🔍 S3 Configuration Check:');
    console.log(`   USE_S3: ${this.useS3}`);
    console.log(`   AWS_S3_BUCKET: ${this.s3Bucket || 'NOT SET'}`);
    console.log(`   AWS_REGION: ${this.s3Region}`);
    console.log(`   AWS_ACCESS_KEY_ID: ${this.awsAccessKeyId ? 'SET' : 'NOT SET'}`);
    console.log(`   AWS_SECRET_ACCESS_KEY: ${this.awsSecretAccessKey ? 'SET' : 'NOT SET'}`);
    
    // Initialize S3 client if configured
    this.s3Client = null;
    if (this.useS3 && this.s3Bucket && this.awsAccessKeyId && this.awsSecretAccessKey) {
      try {
        this.s3Client = new S3Client({
          region: this.s3Region,
          credentials: {
            accessKeyId: this.awsAccessKeyId,
            secretAccessKey: this.awsSecretAccessKey
          }
        });
        console.log(`✅ S3 client initialized for bucket: ${this.s3Bucket}`);
      } catch (error) {
        console.error('❌ Failed to initialize S3 client:', error);
        console.log('⚠️ Falling back to local storage');
        this.useS3 = false;
      }
    } else if (this.useS3) {
      console.log('⚠️ S3 enabled but missing required configuration. Falling back to local storage.');
      console.log('   Required: AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
      this.useS3 = false;
    }
  }

  /**
   * Generate speech from text using ElevenLabs
   */
  async generateSpeech(text, voiceId = null, modelId = 'eleven_monolingual_v1') {
    try {
      const voice = voiceId || this.voiceId;
      
      const response = await axios.post(
        `${this.baseURL}/text-to-speech/${voice}`,
        {
          text: text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey
          },
          responseType: 'arraybuffer',
          timeout: 120000 // 2 minutes timeout
        }
      );

      const audioBuffer = Buffer.from(response.data);
      
      // Generate a unique filename
      const timestamp = Date.now();
      const filename = `speech_${timestamp}.mp3`;
      
      // Debug: Log S3 status before upload attempt
      console.log(`🔍 Attempting to upload speech file: ${filename}`);
      console.log(`   useS3: ${this.useS3}, s3Client: ${this.s3Client !== null}`);
      
      // Upload to S3 if configured, otherwise save locally
      if (this.useS3 && this.s3Client) {
        try {
          const s3Key = `speech/${filename}`;
          
          await this.s3Client.send(new PutObjectCommand({
            Bucket: this.s3Bucket,
            Key: s3Key,
            Body: audioBuffer,
            ContentType: 'audio/mpeg',
            CacheControl: 'public, max-age=31536000', // Cache for 1 year
            ContentDisposition: 'inline' // Allow inline playback
            // Note: Public access is controlled by bucket policy, not ACLs
            // ACLs may be disabled on your bucket, so we rely on bucket policy instead
          }));
          
          // Generate public URL
          let url;
          if (this.s3Region === 'us-east-1') {
            url = `https://${this.s3Bucket}.s3.amazonaws.com/${s3Key}`;
          } else {
            url = `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${s3Key}`;
          }
          
          console.log(`✅ Uploaded speech file to S3: ${url}`);
          return url;
        } catch (error) {
          console.error('❌ S3 upload error:', error);
          console.log('⚠️ Falling back to local storage');
          // Fall through to local storage
        }
      }
      
      // Fallback to local storage
      const filepath = path.join(__dirname, '../uploads', filename);
      
      // Ensure uploads directory exists
      const uploadsDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      fs.writeFileSync(filepath, audioBuffer);
      
      // Return the file path (Node.js server serves /uploads/ statically)
      return `/uploads/${filename}`;
    } catch (error) {
      console.error('ElevenLabs speech generation error:', error.response?.data || error.message);
      throw new Error(`Speech generation failed: ${error.response?.data?.detail?.message || error.message}`);
    }
  }

  /**
   * Generate speech for multiple slides
   */
  async generateSlideSpeeches(slides) {
    const speechPromises = slides.map(slide => 
      this.generateSpeech(slide.script)
    );
    
    return await Promise.all(speechPromises);
  }

  /**
   * Get available voices
   */
  async getVoices() {
    try {
      const response = await axios.get(
        `${this.baseURL}/voices`,
        {
          headers: {
            'xi-api-key': this.apiKey
          }
        }
      );

      return response.data.voices;
    } catch (error) {
      console.error('Error fetching voices:', error.response?.data || error.message);
      throw new Error(`Failed to fetch voices: ${error.message}`);
    }
  }
}

export default new ElevenLabsService();

