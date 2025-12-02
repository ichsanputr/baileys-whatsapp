const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create auth directory if it doesn't exist
const authDir = path.join(__dirname, 'auth_info');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept images and other common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mp3|ogg|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, documents, and media files are allowed.'));
    }
  }
});

// Store QR code data and socket
let qrCodeData = null;
let sock = null;
let isReady = false;

// Initialize WhatsApp Socket with Baileys
async function initializeWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    // Fetch latest version
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: true,
      auth: state,
      browser: ['WhatsApp REST API', 'Chrome', '1.0.0'],
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR code
      if (qr) {
        console.log('QR Code received, scan it!');
        qrCodeData = qr;
        // Display QR code in terminal
        qrcode.generate(qr, { small: true });
      }

      // Handle connection status
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;
        console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
        
        isReady = false;
        qrCodeData = null;
        
        if (shouldReconnect) {
          // Reconnect after 5 seconds
          setTimeout(() => {
            initializeWhatsApp();
          }, 5000);
        }
      } else if (connection === 'open') {
        console.log('WhatsApp client is ready!');
        isReady = true;
        qrCodeData = null; // Clear QR code once ready
      }
    });

    // Handle messages (optional - for receiving messages)
    sock.ev.on('messages.upsert', (m) => {
      // Handle incoming messages if needed
    });

  } catch (error) {
    console.error('Error initializing WhatsApp:', error);
    isReady = false;
    // Retry after 5 seconds
    setTimeout(() => {
      initializeWhatsApp();
    }, 5000);
  }
}

// Initialize WhatsApp on server start
initializeWhatsApp();

// Routes

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'WhatsApp REST API is running (Baileys)',
    whatsappReady: isReady
  });
});

// Get QR Code endpoint
app.get('/api/qr', (req, res) => {
  if (isReady) {
    return res.json({
      status: 'ready',
      message: 'WhatsApp is already connected. No QR code needed.'
    });
  }

  if (!qrCodeData) {
    return res.json({
      status: 'waiting',
      message: 'QR code is being generated. Please wait...'
    });
  }

  // Return QR code as text that can be displayed
  res.json({
    status: 'success',
    qr: qrCodeData,
    message: 'Scan this QR code with WhatsApp to connect'
  });
});

// Get QR Code as HTML page (for easy scanning)
app.get('/api/qr/display', (req, res) => {
  if (isReady) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp QR Code</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .status {
            color: #25D366;
            font-size: 18px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="status">✓ WhatsApp is already connected!</div>
        </div>
      </body>
      </html>
    `);
  }

  if (!qrCodeData) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp QR Code</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <p>QR code is being generated. Please wait...</p>
          <p>This page will refresh automatically.</p>
          <script>
            setTimeout(() => location.reload(), 3000);
          </script>
        </div>
      </body>
      </html>
    `);
  }

  // Generate QR code HTML using qrcode library
  const QRCode = require('qrcode');
  QRCode.toDataURL(qrCodeData, (err, url) => {
    if (err) {
      return res.status(500).send('Error generating QR code');
    }
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp QR Code</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          img {
            max-width: 400px;
            margin: 20px 0;
          }
          p {
            color: #666;
            margin: 10px 0;
          }
        </style>
        <meta http-equiv="refresh" content="30">
      </head>
      <body>
        <div class="container">
          <h2>Scan QR Code with WhatsApp</h2>
          <img src="${url}" alt="QR Code">
          <p>1. Open WhatsApp on your phone</p>
          <p>2. Go to Settings → Linked Devices</p>
          <p>3. Tap "Link a Device"</p>
          <p>4. Scan this QR code</p>
          <p style="color: #999; font-size: 12px;">This page refreshes every 30 seconds</p>
        </div>
      </body>
      </html>
    `);
  });
});

// Send message endpoint (image is optional)
app.post('/api/send-message', upload.single('image'), async (req, res) => {
  try {
    if (!isReady || !sock) {
      return res.status(400).json({
        status: 'error',
        message: 'WhatsApp client is not ready. Please scan QR code first.'
      });
    }

    const { number, message } = req.body;
    const imageFile = req.file;

    if (!number) {
      return res.status(400).json({
        status: 'error',
        message: 'Number is required'
      });
    }

    // Format number for Baileys (use @s.whatsapp.net)
    const cleanNumber = number.replace(/[^\d+]/g, '');
    const jid = `${cleanNumber}@s.whatsapp.net`;

    let result;

    // If image is provided, send message with image
    if (imageFile) {
      try {
        // Read image file
        const imageBuffer = fs.readFileSync(imageFile.path);
        const mimeType = imageFile.mimetype || 'image/jpeg';

        // Send message with image using Baileys
        result = await sock.sendMessage(jid, {
          image: imageBuffer,
          caption: message || '',
          mimetype: mimeType
        });

        // Clean up uploaded file
        fs.unlinkSync(imageFile.path);
      } catch (imageError) {
        // Clean up file on error
        if (imageFile) {
          try {
            fs.unlinkSync(imageFile.path);
          } catch (unlinkError) {
            console.error('Error deleting file:', unlinkError);
          }
        }
        throw imageError;
      }
    } else {
      // Send text message only
      if (!message) {
        return res.status(400).json({
          status: 'error',
          message: 'Message is required when no image is provided'
        });
      }

      result = await sock.sendMessage(jid, { text: message });
    }

    res.json({
      status: 'success',
      message: imageFile ? 'Message with image sent successfully' : 'Message sent successfully',
      messageId: result.key.id
    });
  } catch (error) {
    console.error('Error sending message:', error);
    
    // Clean up file on error if it exists
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get client status
app.get('/api/status', (req, res) => {
  res.json({
    status: isReady ? 'ready' : 'not_ready',
    isReady: isReady,
    hasQrCode: !!qrCodeData,
    hasSocket: !!sock
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp REST API server is running on http://localhost:${PORT}`);
  console.log(`QR Code endpoint: http://localhost:${PORT}/api/qr/display`);
  console.log(`Using Baileys library for WhatsApp integration`);
});
