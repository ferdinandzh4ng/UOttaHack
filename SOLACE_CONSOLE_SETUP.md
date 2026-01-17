# Solace Console Configuration Guide

This guide explains what you need to configure in your Solace Cloud console to enable messaging between the Node.js server and Python SAM bridge service.

## Prerequisites

1. Access to your Solace Cloud account
2. A Solace Cloud service instance (e.g., "UOttaHacks")
3. Admin access to configure Message VPN settings

## Step 1: Verify Message VPN Configuration

1. **Log in to Solace Cloud Console**
   - Go to https://console.solace.cloud/
   - Navigate to your service instance

2. **Check Message VPN Settings**
   - Click on your service → **"Manage"** → **"Message VPNs"**
   - Find your VPN (e.g., `uottahacks`)
   - Verify it's **Active** and **Enabled**

3. **VPN Settings to Verify:**
   - **Name**: Should match `SOLACE_VPN_NAME` in your `.env` file
   - **Status**: Should be **Active**
   - **Max Connections**: Ensure it's sufficient (default is usually fine)

## Step 2: Configure Client Username and Password

### Option A: Use Default Client Username (Recommended for Development)

1. **Go to Client Usernames**
   - In your Message VPN → **"Client Usernames"** tab
   - Check if `default` exists (it usually does)

2. **If `default` doesn't exist, create it:**
   - Click **"Create Client Username"**
   - Username: `default`
   - Password: Set a password (or use the cluster password)
   - Click **"Create"**

3. **Configure Client Username Permissions:**
   - Click on the username → **"Permissions"** tab
   - Ensure these permissions are set:
     - **Publish Topic**: `ai/>` (or `*` for all topics)
     - **Subscribe Topic**: `ai/>` (or `*` for all topics)
     - **Publish Client Profile**: Default
     - **Subscribe Client Profile**: Default

### Option B: Create Dedicated Client Username (Recommended for Production)

1. **Create New Client Username:**
   - Go to **"Client Usernames"** → **"Create Client Username"**
   - Username: `uottahack-sam` (or your preferred name)
   - Password: Set a strong password
   - **Note this password** - you'll need it in your `.env` file

2. **Set Permissions:**
   - **Publish Topic**: `ai/>`
   - **Subscribe Topic**: `ai/>` and `ai/reply/>`
   - **Publish Client Profile**: Default
   - **Subscribe Client Profile**: Default

## Step 3: Configure Topic Subscriptions

The application uses these topics:

### Request Topics (Python SAM bridge subscribes to these):
- `ai/task/script/lesson/>` - Script generation requests
- `ai/task/image/slide/>` - Image generation requests
- `ai/task/speech/slide` - Speech generation requests
- `ai/task/quiz/prompt/>` - Quiz prompt generation requests
- `ai/task/quiz/questions/>` - Quiz question generation requests

### Reply Topics (Both services subscribe to these):
- `ai/reply/>` - Reply topics for request-reply pattern

### Configuration Steps:

1. **Go to Topic Subscriptions** (if available in your console)
   - Some Solace Cloud plans don't show this directly
   - Topics are created automatically when messages are published

2. **Verify Topic Permissions:**
   - Ensure your client username has permissions for:
     - Publish to: `ai/task/>`
     - Subscribe to: `ai/task/>` and `ai/reply/>`

## Step 4: Configure Client Profiles (Optional but Recommended)

1. **Go to Client Profiles**
   - Message VPN → **"Client Profiles"** tab
   - Find or create a profile for your application

2. **Recommended Settings:**
   - **Max Connections**: 10 (or as needed)
   - **Max Subscriptions**: 100
   - **Allow Guaranteed Endpoints**: Enabled (if using guaranteed messaging)
   - **Allow Transacted Sessions**: Enabled (if using transactions)

## Step 5: Get Connection Information

1. **Go to "Connect" Tab**
   - In your Solace Cloud service dashboard
   - Click **"Connect"** tab

2. **Note the Connection Details:**
   - **Host**: e.g., `mr-connection-dhsmkgyaczm.messaging.solace.cloud`
   - **Message VPN**: e.g., `uottahacks`
   - **Username**: `default` or your custom username
   - **Password**: Your cluster password or client username password
   - **Ports**:
     - **TLS (Secure)**: `55443` (recommended)
     - **Non-TLS**: `55555`
     - **WebSocket**: `8008` (for WebSocket connections)

## Step 6: Environment Variables Configuration

Update your `.env` files with the connection details:

### For Python SAM Bridge (`sam_service/.env`):
```bash
SOLACE_HOST=mr-connection-dhsmkgyaczm.messaging.solace.cloud
SOLACE_PORT=55443
SOLACE_VPN_NAME=uottahacks
SOLACE_USERNAME=default
SOLACE_PASSWORD=your-password-here
```

### For Node.js Server (`server/.env` or root `.env`):
```bash
SOLACE_HOST=mr-connection-dhsmkgyaczm.messaging.solace.cloud
SOLACE_PORT=8008
SOLACE_VPN_NAME=uottahacks
SOLACE_USERNAME=default
SOLACE_PASSWORD=your-password-here
SOLACE_USE_TLS=false
```

**Note**: Node.js uses WebSocket (port 8008), Python uses TLS (port 55443)

## Step 7: Verify Configuration

### Check Active Connections:

1. **In Solace Console:**
   - Go to **"Monitor"** → **"Connections"**
   - You should see active connections when your services are running
   - Connection names should match your client names:
     - `sam-bridge-<pid>` (Python)
     - `uottahack-node-<pid>` (Node.js)

2. **Check Message Flow:**
   - Go to **"Monitor"** → **"Message Spool"** (if available)
   - You should see message activity when requests are made

### Test Connection:

1. **Start Python SAM Bridge:**
   ```bash
   cd sam_service
   python bridge_api.py
   ```
   - Look for: `✅ Connected to Solace: ...`
   - Look for: `✅ Subscribed to Solace topic: ...`

2. **Start Node.js Server:**
   ```bash
   npm run server
   ```
   - The SolaceService will connect automatically if configured

## Step 8: Troubleshooting

### Connection Fails:

1. **Check Credentials:**
   - Verify username and password match Solace console
   - Ensure VPN name is correct (case-sensitive)

2. **Check Network:**
   - Verify firewall allows outbound connections
   - Test connectivity: `telnet <host> <port>`

3. **Check Port:**
   - Python: Use port `55443` (TLS)
   - Node.js: Use port `8008` (WebSocket) or `55443` (TLS with wss://)

### No Messages Received:

1. **Check Subscriptions:**
   - Verify topics match exactly (case-sensitive)
   - Check wildcard subscriptions: `ai/task/>` vs `ai/task/script/lesson`

2. **Check Permissions:**
   - Ensure client username has subscribe permissions
   - Verify topic permissions allow the subscription

3. **Check Message Format:**
   - Messages must be JSON strings
   - Verify `_metadata` field contains `request_id` for replies

### Authentication Errors:

1. **Username Issues:**
   - Try using `default` username
   - Verify username exists in Message VPN

2. **Password Issues:**
   - Use cluster password (not account password)
   - If using client username, use that password

## Step 9: Production Recommendations

1. **Create Dedicated Client Usernames:**
   - One for Python SAM bridge
   - One for Node.js server
   - Use strong, unique passwords

2. **Restrict Topic Permissions:**
   - Only allow necessary topics
   - Use specific topic patterns instead of `*`

3. **Enable Logging:**
   - Enable message spool logging (if available)
   - Monitor connection logs

4. **Set Connection Limits:**
   - Configure max connections per client profile
   - Set appropriate timeouts

## Summary Checklist

- [ ] Message VPN is active and configured
- [ ] Client username exists with correct password
- [ ] Client username has publish/subscribe permissions for `ai/>` topics
- [ ] Connection details (host, port, VPN, username, password) are correct
- [ ] Environment variables are set in both `.env` files
- [ ] Python SAM bridge connects successfully
- [ ] Node.js server can connect (if using Solace directly)
- [ ] Active connections appear in Solace console
- [ ] Messages are being published and received

## Additional Resources

- [Solace Cloud Documentation](https://docs.solace.com/)
- [Solace JavaScript API](https://docs.solace.com/Developer-Tools/JavaScript-API/js-api-home.htm)
- [Solace Python API](https://docs.solace.com/Developer-Tools/Python-API/python-api-home.htm)

