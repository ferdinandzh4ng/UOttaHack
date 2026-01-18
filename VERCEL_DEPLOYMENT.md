# Vercel Deployment Guide

This guide will help you deploy your UOttaHack application to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Your MongoDB connection string
3. All environment variables from your `.env` file

## Step 1: Install Vercel CLI (Optional but Recommended)

```bash
npm i -g vercel
```

## Step 2: Login to Vercel

```bash
vercel login
```

## Step 3: Deploy to Vercel

From your project root directory:

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Yes**
- Which scope? Choose your account
- Link to existing project? **No** (for first deployment)
- Project name? Enter a name or press Enter for default
- Directory? Press Enter (current directory)
- Override settings? **No**

## Step 4: Set Environment Variables

After the first deployment, you need to add all your environment variables:

1. Go to your Vercel project dashboard: https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add all variables from your `.env` file:

### Required Environment Variables:

```
MONGODB_URI=your_mongodb_connection_string
SENTRY_DSN=your_sentry_dsn
SENTRY_ORG=your_sentry_org
SENTRY_PROJECT=your_sentry_project
SENTRY_AUTH_TOKEN=your_sentry_auth_token
OPENROUTER_API_KEY=your_openrouter_key
BACKBOARD_API_KEY=your_backboard_key
SURVEYMONKEY_ACCESS_TOKEN=your_surveymonkey_token
SURVEYMONKEY_SURVEY_ID=your_survey_id
SURVEYMONKEY_COLLECTOR_ID=your_collector_id
PRESAGE_API_KEY=your_presage_key
ELEVENLABS_API_KEY=your_elevenlabs_key
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=your_aws_region
AWS_S3_BUCKET=your_s3_bucket
```

5. For each variable, select **Production**, **Preview**, and **Development** environments
6. Click **Save**

## Step 5: Redeploy

After adding environment variables, redeploy:

```bash
vercel --prod
```

Or trigger a redeploy from the Vercel dashboard.

## Important Notes

### Python Services (SAM Service)

⚠️ **The Python vitals service (`sam_service/vitals_service.py`) cannot run on Vercel serverless functions.** Vercel only supports Node.js, Python (limited), and other runtimes, but your Python service with C++ dependencies (Presage SDK) requires a different deployment strategy.

**Options:**
1. **Deploy Python service separately** on:
   - Railway (https://railway.app)
   - Render (https://render.com)
   - Google Cloud Run
   - AWS Lambda (with custom runtime)
   - A VPS/server

2. **Update the vitals service URL** in your environment variables to point to the separately deployed service

### File Uploads

The `/uploads` directory is served statically. For production, consider:
- Using AWS S3 (already configured in your code)
- Using Vercel Blob Storage
- Using Cloudinary or similar service

### Database

Make sure your MongoDB Atlas cluster allows connections from Vercel's IP ranges (or set to allow all IPs for development).

### Build Configuration

The `vercel.json` file is configured to:
- Build the frontend with `npm run build`
- Serve the built files from `dist/`
- Route API requests to `/api/*`
- Serve the React app for all other routes

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Ensure Node.js version is compatible (Vercel uses Node 18.x by default)

### API Routes Return 404
- Verify `api/index.js` exists and exports the app correctly
- Check that routes are prefixed with `/api`

### Environment Variables Not Working
- Make sure variables are set for the correct environment (Production/Preview/Development)
- Redeploy after adding new variables

### MongoDB Connection Issues
- Verify MongoDB Atlas allows connections from anywhere (0.0.0.0/0) or Vercel's IPs
- Check connection string format

## Production Deployment

For production deployment:

```bash
vercel --prod
```

This will deploy to your production domain.

## Custom Domain

1. Go to your project settings in Vercel
2. Navigate to **Domains**
3. Add your custom domain
4. Follow DNS configuration instructions

## Monitoring

- Check Vercel logs: `vercel logs`
- Monitor in Vercel dashboard under **Deployments** → Click deployment → **Functions** tab

