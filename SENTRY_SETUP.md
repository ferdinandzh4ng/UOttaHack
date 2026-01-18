# Sentry Setup Guide

## Why You're Getting 404 Errors

You're getting error emails from Sentry (SDK is working), but the analytics page shows 404 errors. This is because:

1. **Sentry SDK** (for error tracking) uses `SENTRY_DSN` - ✅ This is working
2. **Sentry API** (for fetching metrics) uses `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` - ❌ This needs setup

## Step-by-Step Setup

### 1. Get Your Organization Slug

1. Go to https://sentry.io
2. Click on your organization
3. Look at the URL: `https://sentry.io/organizations/{YOUR-ORG-SLUG}/`
4. Copy the `{YOUR-ORG-SLUG}` part

### 2. Get Your Project Slug

1. In Sentry, go to: **Settings** > **Projects** > **[Your Project Name]**
2. Click on **General** tab
3. Find the **Slug** field (e.g., `javascript-react`)
4. Copy this slug (NOT the ID number)

### 3. Create an API Token

1. Go to: https://sentry.io/settings/account/api/auth-tokens/
2. Click **Create New Token**
3. Give it a name like "Analytics API Token"
4. **IMPORTANT**: Select these scopes:
   - ✅ `org:read`
   - ✅ `project:read`
   - ✅ `event:read`
5. Click **Create Token**
6. **Copy the token immediately** (you won't see it again!)

### 4. Update Your .env File

Add these variables to your `.env` file in the project root:

```env
# Sentry SDK (for error tracking) - you probably already have this
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx

# Sentry API (for analytics) - ADD THESE:
SENTRY_ORG=your-org-slug-here
SENTRY_PROJECT=your-project-slug-here
SENTRY_AUTH_TOKEN=your-api-token-here
```

**Example:**
```env
SENTRY_ORG=ay-jackson-secondary-school
SENTRY_PROJECT=javascript-react
SENTRY_AUTH_TOKEN=sntrys_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 5. Test Your Configuration

1. Restart your Node.js server
2. Visit: `http://localhost:3001/api/analytics/test-sentry`
3. This will show you:
   - ✅ If your org slug is correct
   - ✅ If your project slug is correct
   - ✅ If your token has the right permissions
   - ✅ If you can fetch issues

### 6. Common Issues

**404 Errors:**
- ❌ Wrong organization slug (check URL in Sentry)
- ❌ Wrong project slug (use slug, not ID)
- ❌ Project doesn't exist in the organization

**403 Errors:**
- ❌ API token missing required scopes
- ❌ Token expired or revoked

**401 Errors:**
- ❌ Invalid API token
- ❌ Token was deleted

## Quick Check

Run this in your terminal to test:
```bash
curl "http://localhost:3001/api/analytics/test-sentry"
```

This will show you exactly what's wrong with your Sentry API configuration.

