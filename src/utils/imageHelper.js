/**
 * Image Helper - Download and process images for WHMCS attachments
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Download image from URL and save to temp directory
 * @param {string} imageUrl - URL of the image to download
 * @returns {Promise<{filepath: string, filename: string, mimetype: string}>}
 */
async function downloadImage(imageUrl) {
  try {
    console.log('→ Downloading image from:', imageUrl);
    
    // Validate URL
    const url = new URL(imageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid URL protocol. Only HTTP and HTTPS are supported.');
    }
    
    // Download image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 second timeout
      maxContentLength: 10 * 1024 * 1024, // 10MB max
      headers: {
        'User-Agent': 'WHMCS-Sales-Chatbot/1.0'
      }
    });
    
    // Get content type
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    
    // Validate it's an image
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}. Expected an image.`);
    }
    
    // Generate filename
    const ext = getExtensionFromMimeType(contentType) || 'jpg';
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `payment-receipt-${hash}.${ext}`;
    
    // Save to temp directory
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filepath = path.join(tempDir, filename);
    fs.writeFileSync(filepath, response.data);
    
    console.log('→ Image downloaded:', filename, `(${response.data.length} bytes)`);
    
    return {
      filepath,
      filename,
      mimetype: contentType,
      size: response.data.length
    };
  } catch (error) {
    console.log('✗ Error downloading image:', error.message);
    throw new Error(`Failed to download image: ${error.message}`);
  }
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg'
  };
  
  return mimeMap[mimeType.toLowerCase()] || null;
}

/**
 * Clean up temporary file
 */
function cleanupTempFile(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log('→ Cleaned up temp file:', path.basename(filepath));
    }
  } catch (error) {
    console.log('⚠️  Warning: Could not delete temp file:', error.message);
  }
}

/**
 * Convert image file to base64 for WHMCS API
 */
function imageToBase64(filepath) {
  try {
    const imageBuffer = fs.readFileSync(filepath);
    return imageBuffer.toString('base64');
  } catch (error) {
    throw new Error(`Failed to read image file: ${error.message}`);
  }
}

module.exports = {
  downloadImage,
  cleanupTempFile,
  imageToBase64,
  getExtensionFromMimeType
};
