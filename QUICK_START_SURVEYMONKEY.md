# Quick Start: Survey Monkey Setup

## 🚀 Fastest Way to Get Started

### Step 1: Get Your Access Token (5 minutes)

1. Go to: https://developer.surveymonkey.com/
2. Click **"Build a Private App"**
3. Fill in:
   - App Name: `UOttaHack AI Feedback`
   - Redirect URI: `http://localhost:3001`
4. After creating, you'll see **Client ID** and **Client Secret**
5. **IMPORTANT: Configure Scopes** (Required!)
   - In your app settings, go to the **"Scopes"** section
   - Enable these **Required** scopes:
     - ✅ `View Surveys` (View your surveys and those shared with you)
     - ✅ `Create/Modify Surveys` (Create or edit surveys in your account)
     - ✅ `View Collectors` (View collectors in your account)
     - ✅ `Create/Modify Collectors` (Create or edit collectors in your account)
     - ✅ `View Responses` (View responses in your account)
     - ✅ `Create/Modify Responses` (Create or edit responses in your account)
   - Optional but recommended:
     - `View Response Details` (for detailed analysis)
6. For quick testing, use **Personal Access Token** (if available):
   - Go to Developer Portal → Personal Access Tokens
   - Generate token with the scopes above
7. Add to `.env`:
   ```env
   SURVEYMONKEY_ACCESS_TOKEN=your_token_here
   ```
   
   **Note:** If you already have a token, you may need to regenerate it after enabling scopes, or re-authenticate if using OAuth.

### Step 2: Run the Setup Script (2 minutes)

```bash
npm run setup-surveymonkey
```

This script will:
- ✅ Create a survey with all required questions
- ✅ Set up a collector
- ✅ Get all the IDs you need
- ✅ Print the `.env` configuration for you to copy

### Step 3: Copy Configuration to .env

The script will output something like:
```env
SURVEYMONKEY_SURVEY_ID=123456789
SURVEYMONKEY_COLLECTOR_ID=987654321
SURVEYMONKEY_PAGE_ID=555555555
SURVEYMONKEY_CLARITY_QUESTION_ID=111111111
SURVEYMONKEY_ENGAGEMENT_QUESTION_ID=222222222
SURVEYMONKEY_BREATHING_QUESTION_ID=333333333
SURVEYMONKEY_GAZE_QUESTION_ID=444444444
SURVEYMONKEY_CLARITY_CHOICES=aaaa,bbbb,cccc,dddd,eeee
SURVEYMONKEY_ENGAGEMENT_CHOICES=ffff,gggg,hhhh,iiii,jjjj
SURVEYMONKEY_BREATHING_CHOICES=kkkk,llll,mmmm,nnnn,oooo
SURVEYMONKEY_GAZE_CHOICES=pppp,qqqq,rrrr,ssss,tttt
```

Copy these to your `.env` file.

### Step 4: Test It!

1. Start your server: `npm run server`
2. Complete a test session
3. Check logs for: `✅ [SURVEYMONKEY] Feedback submitted`
4. Check Survey Monkey dashboard for new responses

## 📝 Manual Setup (If Script Doesn't Work)

If you prefer to create the survey manually:

### 1. Create Survey in UI

1. Go to Survey Monkey → Create Survey
2. Name: "AI Teaching Effectiveness"
3. Add 4 Rating Scale questions (1-5):
   - "How clear was the content?"
   - "How engaged were you?"
   - "How stable was your breathing?"
   - "How well did you maintain focus?"

### 2. Get IDs via API

Use these API calls (replace `{survey_id}` with your survey ID):

```bash
# Get survey ID (list all surveys)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.surveymonkey.com/v3/surveys

# Get pages
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.surveymonkey.com/v3/surveys/{survey_id}/pages

# Get questions
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.surveymonkey.com/v3/surveys/{survey_id}/pages/{page_id}/questions

# Get question details (with choice IDs)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.surveymonkey.com/v3/surveys/{survey_id}/pages/{page_id}/questions/{question_id}

# Get collectors
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.surveymonkey.com/v3/surveys/{survey_id}/collectors
```

### 3. Create Collector

1. In Survey Monkey UI: Go to your survey → Collect Responses
2. Click "Send with a survey link"
3. Create Web Link Collector
4. Copy the Collector ID from the URL or API

## 🔍 Finding IDs in Survey Monkey UI

- **Survey ID**: Look in the URL: `surveymonkey.com/r/XXXXX` or check survey settings
- **Page ID**: Usually only one page, use API to get it
- **Question IDs**: Use API to list questions and match by heading
- **Choice IDs**: Get from question details API call
- **Collector ID**: In collector settings or URL

## ⚠️ Important Notes

1. **Custom Variables**: Requires a **paid Survey Monkey plan** (not available on free tier)
   - If you don't have custom variables, the system will still work but won't tag responses with metadata
   - You can still analyze responses manually

2. **Question Order Matters**: Make sure questions are in this order:
   1. Clarity
   2. Engagement  
   3. Breathing
   4. Gaze

3. **Rating Scale**: Use 1-5 scale (not stars, not 1-10)

## 🆘 Troubleshooting

**"Invalid access token" or "Permission Error" / "Scopes have not been granted"**
- ✅ **Most Common Fix:** Go to your app in Developer Portal → **Scopes** section
- ✅ Enable all **Required** scopes:
  - View Surveys
  - Create/Modify Surveys
  - View Collectors
  - Create/Modify Collectors
  - View Responses
  - Create/Modify Responses
- ✅ After enabling scopes, regenerate your access token
- ✅ If using OAuth, users need to re-authenticate to get new scopes

**"Invalid access token" (other causes)**
- Token might have expired
- Check token has correct scopes
- Regenerate if needed

**"Question not found"**
- Verify question IDs match your survey
- Use API to fetch current IDs
- Check question order

**Script fails**
- Check your access token is valid
- Verify you have API access on your plan
- Try manual setup instead

## 📚 More Details

See `SURVEYMONKEY_SETUP.md` for detailed documentation.

