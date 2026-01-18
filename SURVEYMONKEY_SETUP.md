# Survey Monkey Setup Guide

## Step 1: Get API Access Token

### Option A: OAuth 2.0 (Recommended for Production)

1. Go to [Survey Monkey Developer Portal](https://developer.surveymonkey.com/)
2. Click **"Build a Private App"** (or Public App if you need sharing)
3. Fill in:
   - **App Name**: "UOttaHack AI Feedback"
   - **Description**: "Collects biometric feedback for AI teaching performance"
   - **Redirect URI**: `http://localhost:3001` (or your server URL)
4. After creating, you'll get:
   - **Client ID**
   - **Client Secret**
5. **⚠️ CRITICAL: Configure Scopes**
   - In your app settings, click on **"Scopes"** tab
   - Enable these **Required** scopes:
     - ✅ **View Surveys** - "View your surveys and those shared with you"
     - ✅ **Create/Modify Surveys** - "Create or edit surveys in your account"
     - ✅ **View Collectors** - "View collectors in your account"
     - ✅ **Create/Modify Collectors** - "Create or edit collectors in your account"
     - ✅ **View Responses** - "View responses in your account"
     - ✅ **Create/Modify Responses** - "Create or edit responses in your account"
   - Optional but recommended:
     - **View Response Details** - For detailed analysis
   - **Note:** Changes to scopes require re-authentication for OAuth users
6. Set up OAuth flow to get Access Token (see helper script below)

### Option B: Personal Access Token (Easier for Testing)

1. Go to [Survey Monkey Developer Portal](https://developer.surveymonkey.com/)
2. Click **"Personal Access Token"** (if available on your plan)
3. **⚠️ IMPORTANT: Select Required Scopes**
   - When generating the token, make sure to select:
     - ✅ **View Surveys**
     - ✅ **Create/Modify Surveys**
     - ✅ **View Collectors**
     - ✅ **Create/Modify Collectors**
     - ✅ **View Responses**
     - ✅ **Create/Modify Responses**
4. Generate the token
5. Copy the token - this is your `SURVEYMONKEY_ACCESS_TOKEN`

## Step 2: Create the Survey

You have two options:

### Option A: Create Survey via UI (Easier)

1. In Survey Monkey, click **"Create survey"**
2. Name it: **"AI Teaching Effectiveness"** (or use your existing one)
3. Add these questions (in order):

   **Question 1: Clarity**
   - Type: **Rating Scale** (1-5 stars or 1-5 scale)
   - Question: "How clear was the content?"
   - Scale: 1 (Very Unclear) to 5 (Very Clear)
   - Required: Yes

   **Question 2: Engagement**
   - Type: **Rating Scale** (1-5)
   - Question: "How engaged were you?"
   - Scale: 1 (Not Engaged) to 5 (Very Engaged)
   - Required: Yes

   **Question 3: Breathing Stability**
   - Type: **Rating Scale** (1-5)
   - Question: "How stable was your breathing?" (or "How relaxed were you?")
   - Scale: 1 (Very Unstable) to 5 (Very Stable)
   - Required: Yes

   **Question 4: Gaze Attention**
   - Type: **Rating Scale** (1-5)
   - Question: "How well did you maintain focus?"
   - Scale: 1 (Poor Focus) to 5 (Excellent Focus)
   - Required: Yes

4. **Save** the survey
5. Go to **"Collect Responses"** → **"Send with a survey link"**
6. Create a **Web Link Collector**
7. Copy the **Collector ID** from the URL or settings

### Option B: Create Survey via API (Automated)

Use the helper script below to create the survey programmatically.

## Step 3: Get All Required IDs

After creating the survey, you need to get these IDs:

### Get Survey ID
1. Open your survey in Survey Monkey
2. Look at the URL: `https://www.surveymonkey.com/r/XXXXX` or check the survey settings
3. Or use the API: `GET /v3/surveys` to list all surveys

### Get Page ID
1. Use API: `GET /v3/surveys/{survey_id}/pages`
2. Copy the `id` of the first (or only) page

### Get Question IDs
1. Use API: `GET /v3/surveys/{survey_id}/pages/{page_id}/questions`
2. Match questions by their `headings`:
   - Clarity question → `clarityQuestionId`
   - Engagement question → `engagementQuestionId`
   - Breathing question → `breathingQuestionId`
   - Gaze question → `gazeQuestionId`

### Get Choice IDs
1. For each question, get choices: `GET /v3/surveys/{survey_id}/pages/{page_id}/questions/{question_id}`
2. The `answers.choices` array contains choice IDs
3. For a 1-5 scale, you'll have 5 choices with IDs like `12345678`, `12345679`, etc.
4. Order matters: first choice = 1, second = 2, etc.

### Get Collector ID
1. Go to **"Collect Responses"** in your survey
2. Click on your collector (Web Link, Email, etc.)
3. Use API: `GET /v3/surveys/{survey_id}/collectors`
4. Copy the `id` of your collector

## Step 4: Configure Environment Variables

Add these to your `.env` file:

```env
# Survey Monkey API
SURVEYMONKEY_ACCESS_TOKEN=your_access_token_here

# Survey Configuration
SURVEYMONKEY_SURVEY_ID=your_survey_id
SURVEYMONKEY_COLLECTOR_ID=your_collector_id
SURVEYMONKEY_PAGE_ID=your_page_id

# Question IDs (from your survey)
SURVEYMONKEY_CLARITY_QUESTION_ID=your_clarity_question_id
SURVEYMONKEY_ENGAGEMENT_QUESTION_ID=your_engagement_question_id
SURVEYMONKEY_BREATHING_QUESTION_ID=your_breathing_question_id
SURVEYMONKEY_GAZE_QUESTION_ID=your_gaze_question_id

# Choice IDs (comma-separated, in order 1-5)
# Format: choice_id_for_1,choice_id_for_2,choice_id_for_3,choice_id_for_4,choice_id_for_5
SURVEYMONKEY_CLARITY_CHOICES=12345678,12345679,12345680,12345681,12345682
SURVEYMONKEY_ENGAGEMENT_CHOICES=12345683,12345684,12345685,12345686,12345687
SURVEYMONKEY_BREATHING_CHOICES=12345688,12345689,12345690,12345691,12345692
SURVEYMONKEY_GAZE_CHOICES=12345693,12345694,12345695,12345696,12345697
```

## Step 5: Test the Integration

1. Start your server
2. Complete a test session
3. Check logs for: `✅ [SURVEYMONKEY] Feedback submitted`
4. Check Survey Monkey dashboard for new responses
5. Verify custom variables are attached to responses

## Quick Reference: API Endpoints

```bash
# List all surveys
GET https://api.surveymonkey.com/v3/surveys

# Get survey details
GET https://api.surveymonkey.com/v3/surveys/{survey_id}

# Get pages
GET https://api.surveymonkey.com/v3/surveys/{survey_id}/pages

# Get questions
GET https://api.surveymonkey.com/v3/surveys/{survey_id}/pages/{page_id}/questions

# Get question details (with choices)
GET https://api.surveymonkey.com/v3/surveys/{survey_id}/pages/{page_id}/questions/{question_id}

# Get collectors
GET https://api.surveymonkey.com/v3/surveys/{survey_id}/collectors

# Submit response
POST https://api.surveymonkey.com/v3/collectors/{collector_id}/responses
```

## Troubleshooting

### "Invalid access token"
- Check that your token hasn't expired
- Verify token has correct scopes
- Regenerate if needed

### "Question ID not found"
- Verify question IDs match your actual survey
- Use API to fetch current question IDs
- Check that questions are on the correct page

### "Collector not found"
- Verify collector ID is correct
- Check that collector is active
- Ensure collector type supports API submissions

### Custom variables not showing
- Custom variables require a **paid Survey Monkey plan**
- Check your plan includes custom variables feature
- Verify collector type supports custom variables (Web Link collectors do)

