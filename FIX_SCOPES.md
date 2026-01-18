# 🔧 Fix: Survey Monkey Scope Permissions Error

## The Problem

You're seeing errors like:
```
❌ API Error: The following scopes have not been granted: View your surveys and those shared with you
❌ API Error: The following scopes have not been granted: Create or edit surveys in your account
```

This means your access token doesn't have the required permissions (scopes).

## ✅ Quick Fix (2 minutes)

### Step 1: Go to Your App Settings

1. Go to: https://developer.surveymonkey.com/
2. Click on your app (or create one if you haven't)
3. Click on the **"Scopes"** tab/section

### Step 2: Enable Required Scopes

You'll see a list of scopes. Make sure these are **enabled** (checked):

**Required Scopes:**
- ✅ **View Surveys** - "View your surveys and those shared with you"
- ✅ **Create/Modify Surveys** - "Create or edit surveys in your account"
- ✅ **View Collectors** - "View collectors in your account"
- ✅ **Create/Modify Collectors** - "Create or edit collectors in your account"
- ✅ **View Responses** - "View responses in your account"
- ✅ **Create/Modify Responses** - "Create or edit responses in your account"

**Optional (but recommended):**
- **View Response Details** - For detailed analysis

### Step 3: Regenerate Your Access Token

After enabling scopes, you need a new token with the updated permissions:

**If using Personal Access Token:**
1. Go to Developer Portal → Personal Access Tokens
2. Delete your old token (or create a new one)
3. When creating, make sure all the scopes above are selected
4. Copy the new token
5. Update your `.env` file:
   ```env
   SURVEYMONKEY_ACCESS_TOKEN=your_new_token_here
   ```

**If using OAuth:**
- Users will need to re-authenticate to get the new scopes
- The access token will automatically include the new scopes after re-auth

### Step 4: Test Again

Run the setup script again:
```bash
npm run setup-surveymonkey
```

It should work now! ✅

## Visual Guide

In the Scopes page, you'll see:
- 🔒 **Padlock icon** = Required scope
- ⭕ **Circle with line** = Not Required scope

Make sure all the required ones (with padlocks) are **checked/enabled**.

## Still Not Working?

1. **Check your Survey Monkey plan:**
   - Some features require a paid plan
   - Free plans may have limited API access

2. **Verify token type:**
   - Personal Access Tokens: Check scopes when creating
   - OAuth tokens: Check app scopes, then re-authenticate

3. **Try creating a new app:**
   - Sometimes starting fresh helps
   - Make sure to enable all scopes from the start

4. **Check token expiration:**
   - Tokens can expire
   - Generate a new one if needed

## Need Help?

The error message tells you exactly which scope is missing:
- "View your surveys" → Enable **View Surveys**
- "Create or edit surveys" → Enable **Create/Modify Surveys**
- etc.

Just enable the missing scope and regenerate your token!

