const express = require("express");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const pino = require("pino");

const app = express();
const PORT = 5000;

// Middleware - CORS restricted to namia.online (allows localhost for development)
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from namia.online and its subdomains
    const allowedOrigins = [
      "https://namia.online",
      "http://namia.online",
      "https://www.namia.online",
      "http://www.namia.online",
    ];

    // Allow requests with no origin (like mobile apps, curl, Postman)
    // OR from localhost (for development)
    if (
      !origin ||
      allowedOrigins.some((allowed) => origin.includes("namia.online")) ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1")
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS - Only namia.online domain is allowed"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create auth directory if it doesn't exist
const authDir = path.join(__dirname, "auth_info");
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept images and other common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mp3|ogg|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only images, PDFs, documents, and media files are allowed."
        )
      );
    }
  },
});

// Store QR code data and socket
let qrCodeData = null;
let sock = null;
let isReady = false;
let userInfo = null; // Store user info when connected

// Initialize WhatsApp Socket with Baileys
async function initializeWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    // Fetch latest version
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      auth: state,
      browser: ["WhatsApp REST API", "Chrome", "1.0.0"],
    });

    // Save credentials when updated
    sock.ev.on("creds.update", saveCreds);

    // Handle connection updates
    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR code
      if (qr) {
        console.log("QR Code received, scan it!");
        qrCodeData = qr;
        // Display QR code in terminal
        qrcode.generate(qr, { small: true });
      }

      // Handle connection status
      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode !==
              DisconnectReason.loggedOut
            : true;
        console.log(
          "Connection closed due to ",
          lastDisconnect?.error,
          ", reconnecting ",
          shouldReconnect
        );

        isReady = false;
        qrCodeData = null;

        if (shouldReconnect) {
          // Reconnect after 5 seconds
          setTimeout(() => {
            initializeWhatsApp();
          }, 5000);
        }
      } else if (connection === "open") {
        console.log("WhatsApp client is ready!");
        isReady = true;
        qrCodeData = null; // Clear QR code once ready

        // Get user info
        if (sock.user) {
          userInfo = {
            id: sock.user.id,
            name: sock.user.name || "Unknown",
          };
        }
      }
    });

    // Handle messages (optional - for receiving messages)
    sock.ev.on("messages.upsert", (m) => {
      // Handle incoming messages if needed
    });
  } catch (error) {
    console.error("Error initializing WhatsApp:", error);
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

// Dashboard endpoint - Serve static HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Health check endpoint
app.get("/api", (req, res) => {
  res.json({
    status: "OK",
    message: "WhatsApp REST API is running (Baileys)",
    whatsappReady: isReady,
  });
});

// Get QR Code endpoint (NO /api prefix)
app.get("/qr", (req, res) => {
  if (isReady) {
    return res.json({
      status: "error",
      message: "WhatsApp is already connected. No QR code needed.",
    });
  }

  if (!qrCodeData) {
    return res.json({
      status: "waiting",
      message: "Waiting for QR code to be generated. Please try again.",
    });
  }

  // Return QR code as text that can be displayed
  res.json({
    status: "success",
    qr: qrCodeData,
    message: "Scan this QR code with WhatsApp to connect",
  });
});

// Get QR Code as HTML page (NO /api prefix)
app.get("/qr/display", (req, res) => {
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
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .status {
            color: #25D366;
            font-size: 24px;
            font-weight: bold;
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
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Generating QR Code...</h2>
          <p>Please wait...</p>
          <script>
            setTimeout(() => location.reload(), 3000);
          </script>
        </div>
      </body>
      </html>
    `);
  }

  // Generate QR code HTML using qrcode library
  const QRCode = require("qrcode");
  QRCode.toDataURL(qrCodeData, (err, url) => {
    if (err) {
      return res.status(500).send("Error generating QR code");
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
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            color: #333;
            margin-bottom: 20px;
          }
          img {
            max-width: 300px;
            margin: 20px 0;
          }
          .instructions {
            text-align: left;
            display: inline-block;
            margin-top: 20px;
            color: #666;
          }
        </style>
        <script>
          setTimeout(() => location.reload(), 30000);
        </script>
      </head>
      <body>
        <div class="container">
          <h1>📱 Scan QR Code</h1>
          <img src="${url}" alt="QR Code">
          <div class="instructions">
            <p><strong>How to connect:</strong></p>
            <p>1. Open WhatsApp on your phone</p>
            <p>2. Go to Settings → Linked Devices</p>
            <p>3. Tap "Link a Device"</p>
            <p>4. Scan this QR code</p>
            <p style="color: #999; font-size: 12px;">This page refreshes every 30 seconds</p>
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// Send message endpoint (NO /api prefix)
app.post("/send-message", upload.single("image"), async (req, res) => {
  try {
    if (!isReady || !sock) {
      return res.status(400).json({
        status: "error",
        message: "WhatsApp client is not ready. Please scan QR code first.",
      });
    }

    const { number, message } = req.body;
    const imageFile = req.file;

    if (!number) {
      return res.status(400).json({
        status: "error",
        message: "Phone number is required",
      });
    }

    if (!message && !imageFile) {
      return res.status(400).json({
        status: "error",
        message: "Either message or image is required",
      });
    }

    // Format JID (WhatsApp ID)
    let jid;
    if (number.includes("@g.us")) {
      // Group chat
      jid = number;
    } else {
      // Individual contact - format number and add @s.whatsapp.net
      const cleanNumber = number.replace(/[^\d+]/g, "");
      jid = `${cleanNumber}@s.whatsapp.net`;
    }

    let result;

    // If image is provided, send message with image
    if (imageFile) {
      try {
        // Read image file
        const imageBuffer = fs.readFileSync(imageFile.path);
        const mimeType = imageFile.mimetype || "image/jpeg";

        // Send message with image using Baileys
        result = await sock.sendMessage(jid, {
          image: imageBuffer,
          caption: message || "",
          mimetype: mimeType,
        });

        // Delete the uploaded file after sending
        fs.unlinkSync(imageFile.path);
      } catch (error) {
        // Clean up file on error
        if (fs.existsSync(imageFile.path)) {
          fs.unlinkSync(imageFile.path);
        }
        throw error;
      }
    } else {
      // Send text message only
      if (!message) {
        return res.status(400).json({
          status: "error",
          message: "Message text is required when no image is provided",
        });
      }

      result = await sock.sendMessage(jid, { text: message });
    }

    res.json({
      status: "success",
      message: imageFile
        ? "Message with image sent successfully"
        : "Message sent successfully",
      messageId: result.key.id,
    });
  } catch (error) {
    console.error("Error sending message:", error);

    // Clean up file on error if it exists
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error("Error deleting file:", unlinkError);
      }
    }

    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Get client status (NO /api prefix)
app.get("/status", (req, res) => {
  res.json({
    status: isReady ? "ready" : "not_ready",
    isReady: isReady,
    hasQrCode: !!qrCodeData,
    hasSocket: !!sock,
  });
});

// Connect/Reconnect endpoint (NO /api prefix)
app.post("/connect", async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");

    // If already connected, return success
    if (isReady && sock) {
      return res.json({
        status: "success",
        message: "WhatsApp is already connected.",
      });
    }

    // If socket exists but not ready, close it first
    if (sock) {
      try {
        if (typeof sock.end === "function") {
          sock.end();
        }
      } catch (error) {
        console.log("Error closing existing socket:", error.message);
      }
      sock = null;
    }

    // Reset state
    isReady = false;
    qrCodeData = null;

    console.log("Initiating WhatsApp connection...");

    // Initialize WhatsApp connection
    initializeWhatsApp();

    res.json({
      status: "success",
      message:
        "Connection initiated. Please wait for QR code or connection to complete.",
    });
  } catch (error) {
    console.error("Error connecting:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to initiate connection",
    });
  }
});

// Get all groups (NO /api prefix)
app.get("/groups", async (req, res) => {
  try {
    if (!isReady || !sock) {
      return res.status(400).json({
        status: "error",
        message: "WhatsApp client is not ready. Please scan QR code first.",
      });
    }

    // Fetch all groups using Baileys
    const groups = await sock.groupFetchAllParticipating();

    // Format groups data
    const groupsList = Object.values(groups).map((group) => ({
      id: group.id,
      subject: group.subject || "No Subject",
      description: group.desc || "",
      creation: group.creation
        ? new Date(group.creation * 1000).toISOString()
        : null,
      owner: group.owner || "",
      participants: group.participants ? group.participants.length : 0,
      size: group.size || 0,
    }));

    res.json({
      status: "success",
      groups: groupsList,
      total: groupsList.length,
    });
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to fetch groups",
    });
  }
});

// Disconnect/Logout endpoint (NO /api prefix)
app.post("/disconnect", async (req, res) => {
  try {
    // Ensure we always return JSON
    res.setHeader("Content-Type", "application/json");

    const { deleteAuth = false } = req.body || {}; // Option to delete auth files

    if (!sock) {
      return res.json({
        status: "success",
        message: "Already disconnected. No active connection.",
        deletedAuth: false,
      });
    }

    console.log("Disconnecting WhatsApp...");

    // Logout from WhatsApp
    try {
      if (sock && typeof sock.logout === "function") {
        await sock.logout();
        console.log("Logged out from WhatsApp");
      }
    } catch (error) {
      console.log("Error during logout (non-fatal):", error.message);
      // Continue with disconnection even if logout fails
    }

    // Close the socket
    try {
      if (sock && typeof sock.end === "function") {
        sock.end();
      }
    } catch (error) {
      console.log("Error closing socket (non-fatal):", error.message);
    }

    sock = null;
    isReady = false;
    qrCodeData = null;

    // Optionally delete auth files to completely remove session
    if (deleteAuth) {
      try {
        const authDir = path.join(__dirname, "auth_info");
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true });
          console.log("Auth files deleted");
        }
      } catch (error) {
        console.error("Error deleting auth files:", error);
        // Don't fail the request if auth deletion fails
      }
    }

    res.json({
      status: "success",
      message: deleteAuth
        ? "Disconnected and auth files deleted. You will need to scan QR code again."
        : "Disconnected successfully. Reconnecting will use existing session.",
      deletedAuth: deleteAuth,
    });

    // Reinitialize after a short delay if not deleting auth
    if (!deleteAuth) {
      setTimeout(() => {
        initializeWhatsApp();
      }, 2000);
    }
  } catch (error) {
    console.error("Error disconnecting:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Unknown error occurred",
      deletedAuth: false,
    });
  }
});

// 404 handler - must be after all routes
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Endpoint not found",
    path: req.path,
  });
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal server error",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(
    `WhatsApp REST API server is running on http://localhost:${PORT}`
  );
  console.log(`📊 Dashboard: http://localhost:${PORT}/`);
  console.log(`QR Code endpoint: http://localhost:${PORT}/qr/display`);
  console.log(`Using Baileys library for WhatsApp integration`);
});
