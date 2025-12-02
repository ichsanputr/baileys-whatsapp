# Troubleshooting Guide - WhatsApp API

## Common Issues and Solutions

### 1. Error 401: Connection Failure

**Error Message:**

```
Connection closed due to Error: Connection Failure
{ data: { reason: '401', location: 'odn' } }
```

**Cause:**

- Session expired or invalidated by WhatsApp
- Auth files are corrupted
- WhatsApp blocked the connection

**Solution:**

**Option A - Automatic (Recommended):**
The server now automatically detects 401 errors and deletes auth files. Just restart the server:

```bash
# Stop the server (Ctrl+C)
node server.js
```

**Option B - Manual:**

1. Stop the server (Ctrl+C)
2. Delete auth files:

   ```bash
   # Windows
   rmdir /s /q auth_info

   # Linux/Mac
   rm -rf auth_info
   ```

3. Restart the server:
   ```bash
   node server.js
   ```
4. Visit: http://localhost:5000/qr/display
5. Scan the new QR code

**Option C - Use Helper Script (Windows):**

```bash
clean-auth.bat
```

---

### 2. CORS Error

**Error Message:**

```
Not allowed by CORS
```

**Cause:**
Request from unauthorized domain

**Solution:**
The server allows:

- ✅ localhost (development)
- ✅ 127.0.0.1 (development)
- ✅ namia.online (production)
- ✅ No origin (curl, Postman)

If you need to add more domains, edit `server.js` line 22-26.

---

### 3. QR Code Not Showing

**Symptoms:**

- Dashboard shows "Generating QR Code..."
- No QR code appears

**Solution:**

1. Wait 10-15 seconds for QR generation
2. Refresh the page
3. Check server logs for errors
4. Try accessing directly: http://localhost:5000/qr/display

---

### 4. Message Not Sending

**Error:**

```json
{
  "status": "error",
  "message": "WhatsApp client is not ready"
}
```

**Solution:**

1. Check connection status at: http://localhost:5000/status
2. Make sure status shows `"isReady": true`
3. If not ready, scan QR code first
4. Wait for "WhatsApp client is ready!" in server logs

---

### 5. Deprecation Warning

**Warning:**

```
⚠️ The printQRInTerminal option has been deprecated
```

**Solution:**
This is just a warning and doesn't affect functionality. The latest code has this fixed by setting `printQRInTerminal: false`.

---

### 6. Connection Keeps Dropping

**Symptoms:**

- Frequent disconnections
- Constant reconnection attempts

**Possible Causes:**

1. Poor internet connection
2. WhatsApp rate limiting
3. Multiple devices connected

**Solution:**

1. Check your internet connection
2. Don't scan QR code on multiple servers
3. Wait 1-2 minutes between reconnection attempts
4. Use only one active session

---

### 7. Image Upload Fails

**Error:**

```json
{
  "status": "error",
  "message": "Invalid file type"
}
```

**Solution:**
Allowed file types:

- Images: jpeg, jpg, png, gif, webp
- Documents: pdf, doc, docx
- Media: mp4, mp3, ogg

Max file size: 10MB

---

## Best Practices

### 1. Fresh Start

When experiencing persistent issues:

```bash
# Stop server
# Delete auth files
rm -rf auth_info

# Delete node_modules (if needed)
rm -rf node_modules
npm install

# Restart
node server.js
```

### 2. Check Server Status

Always verify before sending messages:

```bash
curl http://localhost:5000/status
```

Expected response:

```json
{
  "status": "ready",
  "isReady": true,
  "hasQrCode": false,
  "hasSocket": true
}
```

### 3. Monitor Logs

Keep an eye on server logs for:

- ✅ "WhatsApp client is ready!"
- ✅ "Connected as: [name]"
- ❌ Connection errors
- ❌ 401 errors

### 4. Session Management

- Only scan QR code once
- Don't logout from WhatsApp app while server is running
- Use `/disconnect` endpoint before stopping server
- Keep auth_info folder backed up for quick recovery

---

## Quick Commands

### Check if server is running:

```bash
curl http://localhost:5000/api
```

### Get current status:

```bash
curl http://localhost:5000/status
```

### Send test message:

```bash
curl -X POST http://localhost:5000/send-message \
  -H "Content-Type: application/json" \
  -d '{"number": "628999812190", "message": "Test"}'
```

### Clean restart:

```bash
# Stop server (Ctrl+C)
rm -rf auth_info
node server.js
```

---

## Getting Help

If issues persist:

1. Check server logs for specific error messages
2. Verify WhatsApp app is updated
3. Ensure phone has stable internet
4. Try using a different phone number
5. Check Baileys GitHub issues: https://github.com/WhiskeySockets/Baileys/issues

---

## Configuration Changes

### Improved Settings (Already Applied)

```javascript
makeWASocket({
  version,
  logger: pino({ level: "silent" }),
  printQRInTerminal: false,
  auth: state,
  browser: ["Chrome (Linux)", "", ""],
  defaultQueryTimeoutMs: undefined,
  syncFullHistory: false,
  markOnlineOnConnect: true,
});
```

These settings:

- ✅ Remove deprecation warning
- ✅ Better browser identification
- ✅ Prevent sync issues
- ✅ Auto-mark online on connect
- ✅ Handle 401 errors automatically
