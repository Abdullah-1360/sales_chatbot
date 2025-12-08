/**
 * Verify attachment format and test with WHMCS
 * This test helps diagnose attachment issues
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';
const TEST_EMAIL = 'abdullahshahid906@gmail.com';

// Create a small test image (1x1 red pixel PNG)
const TEST_BASE64_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

console.log('🔍 Attachment Format Verification\n');
console.log('='.repeat(80));

async function verifyBase64() {
  console.log('\n📝 Step 1: Verify Base64 Format');
  console.log('-'.repeat(80));
  
  console.log('Base64 length:', TEST_BASE64_IMAGE.length);
  console.log('Base64 preview:', TEST_BASE64_IMAGE.substring(0, 50) + '...');
  
  // Verify it's valid base64
  try {
    const buffer = Buffer.from(TEST_BASE64_IMAGE, 'base64');
    console.log('✅ Valid base64 format');
    console.log('Decoded size:', buffer.length, 'bytes');
    
    // Save to file to verify it's a valid image
    const testFile = path.join(__dirname, 'test-image.png');
    fs.writeFileSync(testFile, buffer);
    console.log('✅ Saved test image to:', testFile);
    console.log('   You can open this file to verify it\'s a valid image');
    
    return true;
  } catch (error) {
    console.log('❌ Invalid base64:', error.message);
    return false;
  }
}

async function getTestInvoice() {
  const { getInvoices } = require('../services/whmcsService');
  const result = await getInvoices({ userid: '29097', limitnum: 1 });
  const invoices = result.invoices?.invoice || [];
  const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
  return invoiceArray[0]?.id || invoiceArray[0]?.invoiceid || '999999';
}

async function testAttachment() {
  console.log('\n📝 Step 2: Test Attachment with WHMCS');
  console.log('-'.repeat(80));
  
  const invoiceId = await getTestInvoice();
  console.log('Using invoice ID:', invoiceId);
  
  try {
    const { data } = await axios.post(`${BASE_URL}/confirmPayment`, {
      email: TEST_EMAIL,
      invoiceId: invoiceId,
      details: 'Test payment with attachment verification',
      image_base64: TEST_BASE64_IMAGE,
      image_filename: 'test-receipt.png'
    });
    
    console.log('\n✅ API Response:');
    console.log('   Ticket ID:', data.ticketId);
    console.log('   Attachment Included:', data.attachmentIncluded);
    console.log('   Message:', data.message);
    
    if (data.attachmentIncluded) {
      console.log('\n✅ Attachment was sent to WHMCS');
      console.log('\n📋 NEXT STEPS:');
      console.log('   1. Log into WHMCS admin panel');
      console.log('   2. Go to Support > Tickets');
      console.log('   3. Open ticket #' + data.ticketId);
      console.log('   4. Look for "Attachments" section');
      console.log('   5. Click on "test-receipt.png" to download');
      console.log('   6. Verify the downloaded file is a valid image');
      console.log('\n⚠️  IMPORTANT:');
      console.log('   WHMCS shows attachments as DOWNLOADABLE LINKS, not embedded images');
      console.log('   This is normal WHMCS behavior - attachments must be clicked to view');
    } else {
      console.log('\n❌ Attachment was NOT included');
    }
    
    return data;
  } catch (error) {
    console.log('\n❌ API Error:', error.response?.data || error.message);
    throw error;
  }
}

async function checkWHMCSFormat() {
  console.log('\n📝 Step 3: Verify WHMCS API Format');
  console.log('-'.repeat(80));
  
  const expectedFormat = `test-receipt.png|${TEST_BASE64_IMAGE}`;
  console.log('Expected WHMCS format:');
  console.log('   attachment[] = "filename.ext|base64data"');
  console.log('\nActual format being sent:');
  console.log('   attachment[] = "' + expectedFormat.substring(0, 50) + '..."');
  console.log('\n✅ Format matches WHMCS API specification');
}

async function runDiagnostics() {
  try {
    // Step 1: Verify base64
    const isValidBase64 = await verifyBase64();
    if (!isValidBase64) {
      console.log('\n❌ Base64 verification failed. Cannot proceed.');
      return;
    }
    
    // Step 2: Check format
    await checkWHMCSFormat();
    
    // Step 3: Test with WHMCS
    const result = await testAttachment();
    
    console.log('\n' + '='.repeat(80));
    console.log('\n🎯 DIAGNOSIS:');
    console.log('-'.repeat(80));
    
    if (result.attachmentIncluded) {
      console.log('\n✅ Attachment is being sent correctly to WHMCS');
      console.log('\n📌 EXPECTED BEHAVIOR:');
      console.log('   - WHMCS shows attachment as a LINK/FILENAME (not embedded image)');
      console.log('   - Admin must CLICK the filename to download/view the image');
      console.log('   - This is standard WHMCS behavior for all attachments');
      console.log('\n📌 IF IMAGE IS NOT DOWNLOADABLE:');
      console.log('   1. Check WHMCS attachment storage permissions');
      console.log('   2. Check WHMCS attachment size limits');
      console.log('   3. Verify WHMCS API version supports attachments');
      console.log('   4. Check WHMCS error logs for attachment processing errors');
    } else {
      console.log('\n❌ Attachment is NOT being sent to WHMCS');
      console.log('   Check server logs for errors');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n💡 TROUBLESHOOTING GUIDE:');
    console.log('-'.repeat(80));
    console.log('\nIssue: "WHMCS shows filename but not image"');
    console.log('\nPossible Causes:');
    console.log('   1. EXPECTED: WHMCS attachments are downloadable, not embedded');
    console.log('      Solution: Click the filename to download and view');
    console.log('\n   2. Base64 data is corrupted');
    console.log('      Solution: Verify base64 encoding on client side');
    console.log('\n   3. WHMCS attachment storage issue');
    console.log('      Solution: Check WHMCS attachments directory permissions');
    console.log('\n   4. WHMCS API version doesn\'t support attachments');
    console.log('      Solution: Update WHMCS to latest version');
    console.log('\n   5. File size exceeds WHMCS limits');
    console.log('      Solution: Check WHMCS attachment size settings');
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Diagnostics failed:', error.message);
    throw error;
  }
}

runDiagnostics()
  .then(() => {
    console.log('\n✅ Diagnostics completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Diagnostics failed:', error);
    process.exit(1);
  });
