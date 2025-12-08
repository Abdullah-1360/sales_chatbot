/**
 * Test image download functionality
 */

const { downloadImage, imageToBase64, cleanupTempFile } = require('../utils/imageHelper');

console.log('🧪 Testing Image Download\n');

async function testDownload() {
  const testUrl = 'https://via.placeholder.com/300x200.png';
  
  console.log('Downloading from:', testUrl);
  
  try {
    const imageInfo = await downloadImage(testUrl);
    
    console.log('\n✅ Download successful!');
    console.log('Filename:', imageInfo.filename);
    console.log('Filepath:', imageInfo.filepath);
    console.log('MIME type:', imageInfo.mimetype);
    console.log('Size:', imageInfo.size, 'bytes');
    
    // Test base64 conversion
    const base64 = imageToBase64(imageInfo.filepath);
    console.log('\n✅ Base64 conversion successful!');
    console.log('Base64 length:', base64.length);
    console.log('Base64 preview:', base64.substring(0, 100) + '...');
    
    // Cleanup
    cleanupTempFile(imageInfo.filepath);
    console.log('\n✅ Cleanup successful!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testDownload();
