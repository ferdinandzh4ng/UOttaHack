# Solace Setup for SAM Bridge

This document explains how to configure Solace Cloud connection for the SAM bridge.

**📋 For detailed Solace Console configuration steps, see [SOLACE_CONSOLE_SETUP.md](./SOLACE_CONSOLE_SETUP.md)**

## Environment Variables

Add these to `sam_service/.env`:

```bash
# Solace Cloud Configuration
SOLACE_HOST=mr-connection-dhsmkgyaczm.messaging.solace.cloud
SOLACE_PORT=55443
SOLACE_VPN_NAME=uottahacks
SOLACE_USERNAME=default
SOLACE_PASSWORD=your-cluster-password
# Alternative variable names (also supported):
# SOLACE_URL=mr-connection-dhsmkgyaczm.messaging.solace.cloud
# SOLACE_VPN=uottahacks
# SOLACE_CLUSTER_PASSWORD=your-cluster-password
```

## Installation

1. Install the Solace Python SDK:
   ```bash
   cd sam_service
   pip install solace-pubsubplus
   ```

2. Restart the SAM bridge service

## How It Works

- The SAM bridge will attempt to connect to Solace Cloud on startup
- If connection succeeds, messages are published/subscribed through Solace
- If connection fails, it falls back to direct routing (agents called directly)
- You'll see connection status in the console logs

## Connection Status

When the service starts, you'll see:
- `✅ Connected to Solace: hostname:port` - Successfully connected
- `⚠️ Solace library not available` - Need to install solace-pubsubplus
- `⚠️ SOLACE_HOST not configured` - Missing environment variables
- `❌ Failed to connect to Solace` - Connection error (check credentials)

## Getting Your Solace Credentials

From your Solace Cloud dashboard:
1. Go to your service (UOttaHacks)
2. Click on "Connect" tab
3. Find the connection details:
   - **Hostname**: `mr-connection-dhsmkgyaczm.messaging.solace.cloud`
   - **Message VPN**: `uottahacks`
   - **Username**: Usually `default` or your username
   - **Password**: Your cluster password (click eye icon to reveal)
   - **Port**: `55443` (TLS) or `55555` (non-TLS)

## Troubleshooting

### No Active Connections in Solace Dashboard

1. Check that environment variables are set correctly
2. Verify the service is running: `python bridge_api.py`
3. Check console logs for connection errors
4. Verify credentials match Solace Cloud dashboard

### Connection Fails

- Verify hostname, port, VPN name, username, and password
- Check firewall/network allows outbound connections to Solace Cloud
- Ensure TLS port (55443) is accessible
- Check Solace Cloud service status

### Still Using Direct Routing

- Check console logs for connection errors
- Verify `solace-pubsubplus` is installed: `pip list | grep solace`
- Check environment variables are loaded: print them in the code

