/**
 * Test script to send an image message via WhatsApp API
 * 
 * Usage: node test.js [image_path]
 * Example: node test.js ./test-image.jpg
 * 
 * If no image path is provided, it will try to use a default test image
 */

const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const TEST_NUMBER = '628999812190';
const TEST_MESSAGE = 'Test image from WhatsApp API';

// Get image path from command line argument or use default
const imagePath = process.argv[2] || path.join(__dirname, 'image.jpg');

async function sendTestImage() {
  try {
    console.log('🚀 Starting test...');
    console.log(`📞 Number: ${TEST_NUMBER}`);
    console.log(`📷 Image: ${imagePath}`);
    console.log(`💬 Message: ${TEST_MESSAGE}`);
    console.log('');

    // Check if image file exists
    if (!fs.existsSync(imagePath)) {
      console.error(`❌ Error: Image file not found at: ${imagePath}`);
      console.log('');
      console.log('Please provide a valid image path:');
      console.log('  node test.js ./image.jpg');
      console.log('');
      console.log('Or create a test image first.');
      process.exit(1);
    }

    // Check server status first
    console.log('📡 Checking server status...');
    const statusResponse = await fetch(`${BASE_URL}/status`);
    const statusData = await statusResponse.json();
    
    if (!statusData.isReady) {
      console.error('❌ Error: WhatsApp client is not ready!');
      console.log('Please scan the QR code first at:', `${BASE_URL}/qr/display`);
      process.exit(1);
    }
    
    console.log('✅ Server is ready!');
    console.log('');

    // Create form data
    console.log('📦 Preparing image...');
    const formData = new FormData();
    formData.append('number', TEST_NUMBER);
    formData.append('message', TEST_MESSAGE);
    formData.append('image', fs.createReadStream(imagePath));

    // Send request
    console.log('📤 Sending image message...');
    const response = await fetch(`${BASE_URL}/send-message`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok && result.status === 'success') {
      console.log('');
      console.log('✅ Success! Message sent successfully!');
      console.log(`📨 Message ID: ${result.messageId}`);
      console.log(`💬 Response: ${result.message}`);
    } else {
      console.error('');
      console.error('❌ Error sending message:');
      console.error(result);
      process.exit(1);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('');
      console.error('Server is not running. Please start the server first:');
      console.error('  npm start');
    }
    
    process.exit(1);
  }
}

// Run the test
sendTestImage();

