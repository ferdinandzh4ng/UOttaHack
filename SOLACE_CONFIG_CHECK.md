# Solace Configuration Checklist

Based on your Solace Cloud dashboard, here's what should be configured:

## ✅ Required Environment Variables

Create or update `sam_service/.env` with these values:

```bash
# Solace Cloud Connection (from your dashboard)
SOLACE_HOST=mr-connection-dhsmkgyaczm.messaging.solace.cloud
SOLACE_PORT=55443
SOLACE_VPN_NAME=uottahacks
SOLACE_USERNAME=default
SOLACE_PASSWORD=jo0nn6m80c932d73o4hjqb92h0
```

## 📋 Configuration Checklist

### From Your Dashboard:
- ✅ **Hostname**: `mr-connection-dhsmkgyaczm.messaging.solace.cloud`
- ✅ **Message VPN**: `uottahacks`
- ✅ **Cluster Password**: `jo0nn6m80c932d73o4hjqb92h0`
- ✅ **Port**: `55443` (TLS port for Solace Cloud)

### Environment Variables to Set:
- [ ] `SOLACE_HOST` = `mr-connection-dhsmkgyaczm.messaging.solace.cloud`
- [ ] `SOLACE_PORT` = `55443`
- [ ] `SOLACE_VPN_NAME` = `uottahacks`
- [ ] `SOLACE_USERNAME` = `default` (or your actual username if different)
- [ ] `SOLACE_PASSWORD` = `jo0nn6m80c932d73o4hjqb92h0`

## 🔍 How to Verify

1. **Check your `.env` file exists**:
   ```bash
   ls -la sam_service/.env
   ```

2. **Verify variables are set** (don't show the actual file, just check it exists):
   ```bash
   cd sam_service
   python -c "from dotenv import load_dotenv; import os; load_dotenv(); print('SOLACE_HOST:', os.getenv('SOLACE_HOST')); print('SOLACE_VPN_NAME:', os.getenv('SOLACE_VPN_NAME')); print('SOLACE_USERNAME:', os.getenv('SOLACE_USERNAME')); print('SOLACE_PASSWORD:', 'SET' if os.getenv('SOLACE_PASSWORD') else 'NOT SET')"
   ```

3. **Start the SAM bridge** and look for these log messages:
   ```
   🔌 Solace Configuration:
      Host: mr-connection-dhsmkgyaczm.messaging.solace.cloud
      VPN: uottahacks
      Username: default
      Port: 55443
   ```

4. **Check for connection success**:
   - ✅ Should see: `✅ Connected to Solace: ...`
   - ❌ If you see timeout, check network/firewall

## ⚠️ Common Issues

1. **Username might not be "default"**
   - Check the "Connect" tab in Solace Cloud dashboard
   - Look for "Username" field
   - It might be your email or a different value

2. **Port might need to be different**
   - TLS (secure): `55443` ✅ (recommended)
   - Non-TLS: `55555`
   - WebSocket: `8008`

3. **Password is the Cluster Password**
   - This is the password shown in the dashboard
   - Not your Solace Cloud account password
   - Should be: `jo0nn6m80c932d73o4hjqb92h0`

## 🚀 Next Steps

1. Create/update `sam_service/.env` with the values above
2. Restart the SAM bridge service
3. Check console logs for connection status
4. Verify active connections appear in Solace Cloud dashboard

