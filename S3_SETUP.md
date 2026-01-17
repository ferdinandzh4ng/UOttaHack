# S3 Configuration for Speech Files

This document explains how to configure S3 storage for speech audio files.

## Environment Variables

Add these environment variables to enable S3 storage:

### For Python (SAM Service)
Add to `sam_service/.env`:

```bash
# Enable S3 storage (set to "true" to use S3, "false" for local storage)
USE_S3=true

# AWS S3 Configuration
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1  # or your preferred region
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

### For Node.js (Server)
Add to `.env` in the project root:

```bash
# Enable S3 storage (set to "true" to use S3, "false" for local storage)
USE_S3=true

# AWS S3 Configuration
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1  # or your preferred region
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

## Setup Steps

1. **Create an S3 Bucket**
   - Go to AWS Console → S3
   - Create a new bucket (e.g., `uottahack-speech-files`)
   - Note the bucket name and region

2. **Configure Bucket Permissions**
   - Go to your bucket → Permissions
   - Edit "Block public access" settings
   - Uncheck "Block all public access" (or configure bucket policy for public read)
   - Add a bucket policy to allow public read access:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::your-bucket-name/*"
       }
     ]
   }
   ```

3. **Create IAM User with S3 Permissions**
   - Go to AWS Console → IAM
   - Create a new user (e.g., `uottahack-s3-uploader`)
   - Attach policy: `AmazonS3FullAccess` (or create a custom policy with `PutObject` and `GetObject` permissions)
   - Create access keys and save them securely

4. **Install Dependencies**

   For Python:
   ```bash
   cd sam_service
   pip install -r requirements.txt
   ```

   For Node.js:
   ```bash
   npm install
   ```

5. **Set Environment Variables**
   - Add the environment variables listed above to your `.env` files
   - Restart your services

## How It Works

- When `USE_S3=true`, speech files are uploaded directly to S3 and a public URL is returned
- When `USE_S3=false` (or not set), files are saved locally to `server/uploads/` and served by the Node.js server
- The system automatically falls back to local storage if S3 upload fails

## File Structure in S3

Files are stored with the following structure:
```
your-bucket-name/
  └── speech/
      ├── speech_1234567890.mp3
      ├── speech_1234567891.mp3
      └── ...
```

## Testing

After configuration, generate a new task with speech. Check:
1. Files appear in your S3 bucket under the `speech/` prefix
2. The returned URLs are S3 URLs (e.g., `https://your-bucket.s3.amazonaws.com/speech/speech_1234567890.mp3`)
3. Audio files are accessible and playable in the frontend

