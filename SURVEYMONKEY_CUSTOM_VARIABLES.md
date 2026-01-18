# Survey Monkey Custom Variables Setup

## The Issue

You're getting this error:
```
Custom variable `agentCombo` is not defined in the survey.
```

This means custom variables need to be **defined in your Survey Monkey survey** before they can be used.

## Important: Custom Variables Require Paid Plan

⚠️ **Custom variables are a paid Survey Monkey feature** (not available on free tier).

If you don't have a paid plan, the system will still work but won't send custom variables. All metadata is still stored in MongoDB, so you don't lose any data.

## Option 1: Set Up Custom Variables (If You Have Paid Plan)

### Step 1: Enable Custom Variables in Survey

1. Go to your survey in Survey Monkey
2. Click **"Collect Responses"**
3. Click on your **Web Link Collector**
4. Go to **"Collector Settings"** or **"Options"**
5. Look for **"Custom Variables"** or **"URL Variables"** section
6. Add these custom variables:
   - `agentCombo`
   - `topic`
   - `taskType`
   - `gradeLevel`
   - `subject`
   - `length`
   - `purpose`
   - `sessionId`

### Step 2: Enable Custom Variables in Code

Once you've set them up in Survey Monkey, uncomment this line in `server/services/surveyMonkeyService.js`:

```javascript
// Around line 164, change:
// custom_variables: customVariables

// To:
custom_variables: customVariables
```

## Option 2: Work Without Custom Variables (Current Setup)

The system is currently configured to **work without custom variables**. 

✅ **What still works:**
- Feedback is submitted to Survey Monkey with all answers
- All metadata is stored in MongoDB (`SessionFeedback` collection)
- Agent performance tracking works
- All analysis and insights work

❌ **What you lose:**
- Can't filter Survey Monkey responses by agentCombo, topic, etc. in Survey Monkey UI
- Have to analyze responses in MongoDB instead

## Recommendation

For a hackathon, **Option 2 is fine**. You can:
1. Analyze feedback in MongoDB (where all metadata is stored)
2. Use the teacher insights API endpoints
3. View agent performance in the `AgentPerformance` collection

Custom variables are nice-to-have but not essential since all the data is in MongoDB anyway.

## If You Want to Use Custom Variables Later

1. Upgrade to a paid Survey Monkey plan
2. Set up the custom variables in your survey collector
3. Uncomment the `custom_variables` line in the code
4. Restart the server

The code is already set up to use them once they're configured!

