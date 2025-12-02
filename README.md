# WhatsApp REST API

A REST API server using Baileys that allows you to send messages and images via WhatsApp through HTTP endpoints.

## Features

- 🔐 QR Code authentication
- 💬 Send text messages
- 📷 Send messages with images
- 🌐 RESTful API endpoints
- 📱 Baileys integration (WebSocket-based, more stable than browser automation)

## Installation

1. Install dependencies:

```bash
npm install
```

## Usage

1. Start the server:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

2. The server will start on `http://localhost:3000` (or the PORT specified in environment variable)

3. **First time setup**: Visit `http://localhost:3000/api/qr/display` to scan the QR code with WhatsApp

## API Endpoints

### 1. Health Check

```
GET /api
```

Returns server status and WhatsApp connection status.

**Response:**

```json
{
  "status": "OK",
  "message": "WhatsApp REST API is running",
  "whatsappReady": true
}
```

### 2. Get QR Code (JSON)

```
GET /qr
```

Returns QR code data as JSON.

**Response:**

```json
{
  "status": "success",
  "qr": "QR_CODE_STRING",
  "message": "Scan this QR code with WhatsApp to connect"
}
```

### 3. Get QR Code (HTML Display)

```
GET /qr/display
```

Returns an HTML page with a scannable QR code. This is the easiest way to connect your WhatsApp account.

### 4. Get Status

```
GET /status
```

Returns the current status of the WhatsApp client.

**Response:**

```json
{
  "status": "ready",
  "isReady": true,
  "hasQrCode": false,
  "hasSocket": true
}
```

### 5. Disconnect/Logout

```
POST /disconnect
Content-Type: application/json

{
  "deleteAuth": false
}
```

Disconnects from WhatsApp. Optionally deletes authentication files to completely logout.

**Parameters:**

- `deleteAuth` (optional, default: `false`): If `true`, deletes all auth files. You will need to scan QR code again.

**Response:**

```json
{
  "status": "success",
  "message": "Disconnected successfully. Reconnecting will use existing session.",
  "deletedAuth": false
}
```

**To completely logout and remove session:**

```json
{
  "deleteAuth": true
}
```

### 6. Send Message (Image Optional)

```
POST /send-message
```

**For text-only messages:**

```
Content-Type: application/json

{
  "number": "1234567890",
  "message": "Hello, this is a test message!"
}
```

**For messages with image:**

```
Content-Type: multipart/form-data

Form Data:
- number: "1234567890"
- message: "Check out this image!" (optional when image is provided)
- image: [file] (optional)
```

**Parameters:**

- `number` (required): Phone number in international format (e.g., "1234567890" or "+1234567890")
- `message` (required for text-only, optional when image is provided): Text message or caption
- `image` (optional): Image file (supports: jpeg, jpg, png, gif, pdf, doc, docx, mp4, mp3, ogg, webp)
- Max file size: 10MB

**Response:**

```json
{
  "status": "success",
  "message": "Message sent successfully",
  "messageId": "MESSAGE_ID"
}
```

**Note:** If you send an image without a message, the caption will be empty. If you send a message without an image, it will be sent as a text message.

## Example Usage

### Using cURL

**Send text message:**

```bash
curl -X POST http://localhost:3000/api/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "number": "1234567890",
    "message": "Hello from WhatsApp API!"
  }'
```

**Send message with image:**

```bash
curl -X POST http://localhost:3000/api/send-message \
  -F "number=1234567890" \
  -F "message=Check out this image!" \
  -F "image=@/path/to/image.jpg"
```

### Using JavaScript (Fetch)

**Send text message:**

```javascript
fetch("http://localhost:3000/api/send-message", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    number: "1234567890",
    message: "Hello from WhatsApp API!",
  }),
})
  .then((res) => res.json())
  .then((data) => console.log(data));
```

**Send message with image:**

```javascript
const formData = new FormData();
formData.append("number", "1234567890");
formData.append("message", "Check out this image!");
formData.append("image", fileInput.files[0]);

fetch("http://localhost:3000/api/send-message", {
  method: "POST",
  body: formData,
})
  .then((res) => res.json())
  .then((data) => console.log(data));
```

## Notes

- Phone numbers should be in international format (without + sign or with + sign, both work)
- The WhatsApp session is stored locally using `useMultiFileAuthState`, so you only need to scan the QR code once
- Session data is stored in `auth_info/` directory
- Uploaded images are automatically deleted after sending
- The server automatically reconnects if the WhatsApp connection is lost
- This project uses [Baileys](https://github.com/WhiskeySockets/Baileys) - a WebSocket-based library that doesn't require browser automation, making it more stable and efficient

## Disconnecting/Logging Out

### Method 1: Using API Endpoint

```bash
# Disconnect but keep session (can reconnect without QR code)
curl -X POST http://localhost:3000/api/disconnect \
  -H "Content-Type: application/json" \
  -d '{"deleteAuth": false}'

# Completely logout and delete session (need to scan QR code again)
curl -X POST http://localhost:3000/api/disconnect \
  -H "Content-Type: application/json" \
  -d '{"deleteAuth": true}'
```

### Method 2: Manual Disconnect

To completely remove the WhatsApp session:

1. Stop the server (Ctrl+C)
2. Delete the `auth_info/` folder
3. Restart the server
4. Scan QR code again

## Troubleshooting

1. **QR Code not showing**: Make sure to visit `/api/qr/display` endpoint and wait a few seconds for the QR code to generate.

2. **Message not sending**:

   - Check if WhatsApp is connected (visit `/api/status`)
   - Verify the phone number format
   - Make sure the number includes country code

3. **Image upload fails**:

   - Check file size (max 10MB)
   - Verify file type is supported
   - Ensure the `uploads/` directory has write permissions

4. **Want to switch WhatsApp account**:
   - Use `/api/disconnect` with `deleteAuth: true`
   - Or manually delete the `auth_info/` folder
   - Restart server and scan new QR code

## License

ISC
