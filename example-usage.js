/**
 * Example usage of WhatsApp REST API
 * 
 * This file demonstrates how to use the API endpoints
 * Run this after starting the server with: npm start
 */

const BASE_URL = 'http://localhost:5000';

// Example 1: Check server status
async function checkStatus() {
  try {
    const response = await fetch(`${BASE_URL}/status`);
    const data = await response.json();
    console.log('Server Status:', data);
  } catch (error) {
    console.error('Error checking status:', error);
  }
}

// Example 2: Get QR Code (JSON)
async function getQRCode() {
  try {
    const response = await fetch(`${BASE_URL}/qr`);
    const data = await response.json();
    console.log('QR Code:', data);
  } catch (error) {
    console.error('Error getting QR code:', error);
  }
}

// Example 3: Send text message
async function sendTextMessage(number, message) {
  try {
    const response = await fetch(`${BASE_URL}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: number,
        message: message
      })
    });
    const data = await response.json();
    console.log('Message sent:', data);
    return data;
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// Example 4: Send message with image (optional)
async function sendMessageWithImage(number, imagePath, caption = '') {
  try {
    const FormData = require('form-data');
    const fs = require('fs');
    
    const formData = new FormData();
    formData.append('number', number);
    formData.append('message', caption);
    formData.append('image', fs.createReadStream(imagePath));

    const response = await fetch(`${BASE_URL}/send-message`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    console.log('Message with image sent:', data);
    return data;
  } catch (error) {
    console.error('Error sending message with image:', error);
  }
}

// Uncomment to test:
// checkStatus();
// getQRCode();
// sendTextMessage('1234567890', 'Hello from WhatsApp API!');
// sendMessageWithImage('1234567890', './path/to/image.jpg', 'Check out this image!');

module.exports = {
  checkStatus,
  getQRCode,
  sendTextMessage,
  sendMessageWithImage
};
