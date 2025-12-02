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
const PORT = 5000;

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
let userInfo = null; // Store user info when connected

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
        
        // Get user info
        if (sock.user) {
          userInfo = {
            id: sock.user.id,
            name: sock.user.name || 'Unknown'
          };
        }
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

// Dashboard endpoint - All features in one page
app.get('/', async (req, res) => {
  const QRCode = require('qrcode');
  
  // Generate QR code image if available
  let qrImageUrl = null;
  if (qrCodeData) {
    try {
      qrImageUrl = await QRCode.toDataURL(qrCodeData);
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  }
  sendDashboard(res, qrImageUrl);
});

function sendDashboard(res, qrImageUrl) {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp API Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .header {
      text-align: center;
      color: white;
      margin-bottom: 30px;
    }
    
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    
    .status-card {
      background: white;
      border-radius: 15px;
      padding: 25px;
      margin-bottom: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    
    .status-indicator {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }
    
    .status-indicator.ready {
      background: #25D366;
      box-shadow: 0 0 10px #25D366;
    }
    
    .status-indicator.not-ready {
      background: #ff4444;
      box-shadow: 0 0 10px #ff4444;
    }
    
    .status-indicator.waiting {
      background: #ffaa00;
      box-shadow: 0 0 10px #ffaa00;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    
    .card {
      background: white;
      border-radius: 15px;
      padding: 25px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    
    .card h2 {
      color: #333;
      margin-bottom: 20px;
      font-size: 1.5em;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    
    .qr-container {
      text-align: center;
      padding: 20px;
    }
    
    .qr-container img {
      max-width: 100%;
      border-radius: 10px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.1);
    }
    
    .qr-instructions {
      margin-top: 20px;
      color: #666;
      line-height: 1.8;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 600;
    }
    
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.3s;
    }
    
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    
    .form-group textarea {
      resize: vertical;
      min-height: 100px;
    }
    
    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      width: 100%;
    }
    
    .btn-primary {
      background: #25D366;
      color: white;
    }
    
    .btn-primary:hover {
      background: #20ba5a;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(37, 211, 102, 0.3);
    }
    
    .btn-danger {
      background: #ff4444;
      color: white;
      margin-top: 10px;
    }
    
    .btn-danger:hover {
      background: #cc0000;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(255, 68, 68, 0.3);
    }
    
    .btn:disabled {
      background: #ccc;
      cursor: not-allowed;
      transform: none;
    }
    
    .alert {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    
    .alert.show {
      display: block;
    }
    
    .alert.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    
    .alert.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }
    
    .info-item {
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      text-align: center;
    }
    
    .info-item strong {
      display: block;
      color: #667eea;
      margin-bottom: 5px;
    }
    
    .refresh-btn {
      background: #667eea;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-left: 10px;
    }
    
    .refresh-btn:hover {
      background: #5568d3;
    }
    
    .file-input-wrapper {
      position: relative;
      overflow: hidden;
      display: inline-block;
      width: 100%;
    }
    
    .file-input-wrapper input[type=file] {
      position: absolute;
      left: -9999px;
    }
    
    .file-input-label {
      display: block;
      padding: 12px;
      background: #f8f9fa;
      border: 2px dashed #ccc;
      border-radius: 8px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
    }
    
    .file-input-label:hover {
      background: #e9ecef;
      border-color: #667eea;
    }
    
    .file-name {
      margin-top: 8px;
      color: #666;
      font-size: 14px;
    }
    
    .groups-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    
    .groups-table th,
    .groups-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .groups-table th {
      background: #f8f9fa;
      font-weight: 600;
      color: #333;
      position: sticky;
      top: 0;
    }
    
    .groups-table tr:hover {
      background: #f8f9fa;
    }
    
    .group-id {
      font-family: monospace;
      font-size: 12px;
      color: #667eea;
      word-break: break-all;
      max-width: 300px;
    }
    
    .group-subject {
      font-weight: 600;
      color: #333;
    }
    
    .copy-btn {
      background: #667eea;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      margin-left: 5px;
    }
    
    .copy-btn:hover {
      background: #5568d3;
    }
    
    .groups-container {
      max-height: 500px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📱 WhatsApp API Dashboard</h1>
      <p>Control Center for WhatsApp REST API</p>
    </div>
    
    <div class="status-card">
      <h2>
        <span class="status-indicator ${isReady ? 'ready' : (qrCodeData ? 'waiting' : 'not-ready')}"></span>
        Connection Status
        <button class="refresh-btn" onclick="refreshStatus()">🔄 Refresh</button>
      </h2>
      <div id="statusInfo">
        <p><strong>Status:</strong> <span id="statusText">${isReady ? 'Connected' : (qrCodeData ? 'Waiting for QR Scan' : 'Not Connected')}</span></p>
        <p><strong>Socket:</strong> <span id="socketStatus">${sock ? 'Active' : 'Inactive'}</span></p>
        ${userInfo ? `<p><strong>User ID:</strong> <span>${userInfo.id}</span></p>` : ''}
      </div>
    </div>
    
    <div class="grid">
      ${qrCodeData && !isReady ? `
      <div class="card">
        <h2>📱 QR Code</h2>
        <div class="qr-container">
          ${qrImageUrl ? `<img src="${qrImageUrl}" alt="QR Code">` : '<p>Generating QR code...</p>'}
          <div class="qr-instructions">
            <p><strong>How to connect:</strong></p>
            <ol style="text-align: left; display: inline-block;">
              <li>Open WhatsApp on your phone</li>
              <li>Go to Settings → Linked Devices</li>
              <li>Tap "Link a Device"</li>
              <li>Scan this QR code</li>
            </ol>
          </div>
        </div>
      </div>
      ` : ''}
      
      <div class="card">
        <h2>💬 Send Message</h2>
        <div id="alert" class="alert"></div>
        <form id="messageForm" onsubmit="sendMessage(event)">
          <div class="form-group">
            <label for="number">Phone Number *</label>
            <input type="text" id="number" placeholder="628999812190" required>
          </div>
          
          <div class="form-group">
            <label for="message">Message *</label>
            <textarea id="message" placeholder="Type your message here..." required></textarea>
          </div>
          
          <div class="form-group">
            <label>Image (Optional)</label>
            <div class="file-input-wrapper">
              <label for="image" class="file-input-label">
                📷 Click to select image
              </label>
              <input type="file" id="image" accept="image/*" onchange="handleFileSelect(event)">
              <div id="fileName" class="file-name"></div>
            </div>
          </div>
          
          <button type="submit" class="btn btn-primary" ${!isReady ? 'disabled' : ''}>
            ${!isReady ? '⏳ Connect WhatsApp First' : '📤 Send Message'}
          </button>
        </form>
      </div>
      
      <div class="card">
        <h2>⚙️ Actions</h2>
        <button class="btn btn-danger" onclick="disconnect(false)">
          🔌 Disconnect (Keep Session)
        </button>
        <button class="btn btn-danger" onclick="disconnect(true)" style="background: #cc0000;">
          🗑️ Logout (Delete Session)
        </button>
        <div class="info-grid" style="margin-top: 20px;">
          <div class="info-item">
            <strong>API Endpoint</strong>
            <span>POST /api/send-message</span>
          </div>
          <div class="info-item">
            <strong>Status Endpoint</strong>
            <span>GET /api/status</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="card" style="margin-top: 20px;">
      <h2>
        👥 WhatsApp Groups
        <button class="refresh-btn" onclick="loadGroups()">🔄 Refresh</button>
      </h2>
      <div id="groupsContainer">
        <p style="text-align: center; color: #666; padding: 20px;">
          ${isReady ? 'Loading groups...' : 'Connect WhatsApp first to see groups'}
        </p>
      </div>
    </div>
  </div>
  
  <script>
    let selectedFile = null;
    
    function handleFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        selectedFile = file;
        document.getElementById('fileName').textContent = 'Selected: ' + file.name;
      }
    }
    
    async function sendMessage(event) {
      event.preventDefault();
      
      const number = document.getElementById('number').value;
      const message = document.getElementById('message').value;
      const alertDiv = document.getElementById('alert');
      
      if (!number || !message) {
        showAlert('Please fill in all required fields', 'error');
        return;
      }
      
      const formData = new FormData();
      formData.append('number', number);
      formData.append('message', message);
      if (selectedFile) {
        formData.append('image', selectedFile);
      }
      
      try {
        showAlert('Sending message...', 'success');
        const response = await fetch('/api/send-message', {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
          showAlert('✅ Message sent successfully! Message ID: ' + result.messageId, 'success');
          document.getElementById('messageForm').reset();
          document.getElementById('fileName').textContent = '';
          selectedFile = null;
        } else {
          showAlert('❌ Error: ' + result.message, 'error');
        }
      } catch (error) {
        showAlert('❌ Error: ' + error.message, 'error');
      }
    }
    
    async function disconnect(deleteAuth) {
      if (!confirm(deleteAuth 
        ? 'Are you sure you want to logout and delete the session? You will need to scan QR code again.' 
        : 'Are you sure you want to disconnect?')) {
        return;
      }
      
      try {
        const response = await fetch('/api/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleteAuth })
        });
        
        // Check if response is OK and is JSON
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error('Server error: ' + response.status + ' - ' + errorText.substring(0, 100));
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error('Expected JSON but got: ' + text.substring(0, 100));
        }
        
        const result = await response.json();
        showAlert(result.message, result.status === 'success' ? 'success' : 'error');
        
        setTimeout(() => {
          location.reload();
        }, 2000);
      } catch (error) {
        console.error('Disconnect error:', error);
        showAlert('❌ Error: ' + error.message, 'error');
      }
    }
    
    function refreshStatus() {
      location.reload();
    }
    
    function showAlert(message, type) {
      const alertDiv = document.getElementById('alert');
      alertDiv.textContent = message;
      alertDiv.className = 'alert show ' + type;
      setTimeout(() => {
        alertDiv.classList.remove('show');
      }, 5000);
    }
    
    // Auto-refresh status every 10 seconds if not connected
    ${!isReady ? `
    setInterval(() => {
      fetch('/api/status')
        .then(res => res.json())
        .then(data => {
          if (data.isReady !== ${isReady}) {
            location.reload();
          }
        });
    }, 10000);
    ` : ''}
    
    // Load groups on page load if connected
    ${isReady ? `
    window.addEventListener('load', () => {
      loadGroups();
    });
    ` : ''}
    
    async function loadGroups() {
      const container = document.getElementById('groupsContainer');
      
      if (!${isReady}) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Connect WhatsApp first to see groups</p>';
        return;
      }
      
      try {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Loading groups...</p>';
        
        const response = await fetch('/api/groups');
        const result = await response.json();
        
        if (result.status === 'success' && result.groups && result.groups.length > 0) {
          let html = '<div class="groups-container">';
          html += '<table class="groups-table">';
          html += '<thead><tr><th>Group Name</th><th>Group ID</th><th>Participants</th><th>Created</th><th>Actions</th></tr></thead>';
          html += '<tbody>';
          
          result.groups.forEach(group => {
            const createdDate = group.creation ? new Date(group.creation).toLocaleDateString() : 'Unknown';
            html += '<tr>';
            html += '<td class="group-subject">' + escapeHtml(group.subject) + '</td>';
            html += '<td><span class="group-id">' + escapeHtml(group.id) + '</span></td>';
            html += '<td>' + group.participants + ' members</td>';
            html += '<td>' + createdDate + '</td>';
            html += '<td><button class="copy-btn" onclick="copyGroupId(\'' + escapeHtml(group.id) + '\')">📋 Copy ID</button></td>';
            html += '</tr>';
          });
          
          html += '</tbody></table>';
          html += '<p style="margin-top: 15px; color: #666; text-align: center;">Total: ' + result.total + ' groups</p>';
          html += '</div>';
          
          container.innerHTML = html;
        } else {
          container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No groups found. You may not be a member of any groups.</p>';
        }
      } catch (error) {
        console.error('Error loading groups:', error);
        container.innerHTML = '<p style="text-align: center; color: #ff4444; padding: 20px;">Error loading groups: ' + escapeHtml(error.message) + '</p>';
      }
    }
    
    function copyGroupId(groupId) {
      navigator.clipboard.writeText(groupId).then(() => {
        showAlert('✅ Group ID copied to clipboard: ' + groupId, 'success');
      }).catch(err => {
        showAlert('❌ Failed to copy: ' + err.message, 'error');
      });
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>
  `);
}

// Health check endpoint (API)
app.get('/api', (req, res) => {
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

    // Format JID for Baileys
    // If number already contains @g.us or @s.whatsapp.net, use it as-is (group or already formatted)
    // Otherwise, format as individual contact @s.whatsapp.net
    let jid;
    if (number.includes('@g.us')) {
      // Group JID - use as-is
      jid = number;
    } else if (number.includes('@s.whatsapp.net')) {
      // Already formatted individual JID - use as-is
      jid = number;
    } else {
      // Individual contact - format number and add @s.whatsapp.net
      const cleanNumber = number.replace(/[^\d+]/g, '');
      jid = `${cleanNumber}@s.whatsapp.net`;
    }

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

// Get all groups
app.get('/api/groups', async (req, res) => {
  try {
    if (!isReady || !sock) {
      return res.status(400).json({
        status: 'error',
        message: 'WhatsApp client is not ready. Please scan QR code first.'
      });
    }

    // Fetch all groups using Baileys
    const groups = await sock.groupFetchAllParticipating();
    
    // Format groups data
    const groupsList = Object.values(groups).map(group => ({
      id: group.id,
      subject: group.subject || 'No Subject',
      description: group.desc || '',
      creation: group.creation ? new Date(group.creation * 1000).toISOString() : null,
      owner: group.owner || '',
      participants: group.participants ? group.participants.length : 0,
      size: group.size || 0
    }));

    res.json({
      status: 'success',
      groups: groupsList,
      total: groupsList.length
    });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch groups'
    });
  }
});

// Disconnect/Logout endpoint
app.post('/api/disconnect', async (req, res) => {
  try {
    // Ensure we always return JSON
    res.setHeader('Content-Type', 'application/json');
    
    const { deleteAuth = false } = req.body || {}; // Option to delete auth files

    if (!sock) {
      return res.json({
        status: 'success',
        message: 'Already disconnected. No active connection.',
        deletedAuth: false
      });
    }

    console.log('Disconnecting WhatsApp...');
    
    // Logout from WhatsApp
    try {
      if (sock && typeof sock.logout === 'function') {
        await sock.logout();
        console.log('Logged out from WhatsApp');
      }
    } catch (error) {
      console.log('Error during logout (non-fatal):', error.message);
      // Continue with disconnection even if logout fails
    }

    // Close the socket
    try {
      if (sock && typeof sock.end === 'function') {
        sock.end();
      }
    } catch (error) {
      console.log('Error closing socket (non-fatal):', error.message);
    }
    
    sock = null;
    isReady = false;
    qrCodeData = null;

    // Optionally delete auth files to completely remove session
    if (deleteAuth) {
      try {
        const authDir = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true });
          console.log('Auth files deleted');
        }
      } catch (error) {
        console.error('Error deleting auth files:', error);
        // Don't fail the request if auth deletion fails
      }
    }

    res.json({
      status: 'success',
      message: deleteAuth 
        ? 'Disconnected and auth files deleted. You will need to scan QR code again.' 
        : 'Disconnected successfully. Reconnecting will use existing session.',
      deletedAuth: deleteAuth
    });

    // Reinitialize after a short delay if not deleting auth
    if (!deleteAuth) {
      setTimeout(() => {
        initializeWhatsApp();
      }, 2000);
    }

  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Unknown error occurred',
      deletedAuth: false
    });
  }
});

// 404 handler - must be after all routes
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    path: req.path
  });
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp REST API server is running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/`);
  console.log(`QR Code endpoint: http://localhost:${PORT}/api/qr/display`);
  console.log(`Using Baileys library for WhatsApp integration`);
});
