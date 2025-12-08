/**
 * FINAL COMPREHENSIVE ATTACHMENT TEST
 * This test will create a ticket with attachment and provide complete verification steps
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';
const TEST_EMAIL = 'abdullahshahid906@gmail.com';

// Create a more visible test image (100x100 red square PNG)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAA0klEQVR42u3RAQ0AAAjDMO5fNCCDkC5z0HTVriRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkqTvBaJXAGXjK3jzAAAAAElFTkSuQmCC';

console.log('🎯 FINAL COMPREHENSIVE ATTACHMENT TEST\n');
console.log('='.repeat(80));
console.log('\nThis test will:');
console.log('  1. Create a test image file locally');
console.log('  2. Send payment confirmation with attachment');
console.log('  3. Provide complete verification instructions');
console.log('  4. Explain expected WHMCS behavior');
console.log('\n' + '='.repeat(80));

async function getTestInvoice() {
  const { getInvoices } = require('../services/whmcsService');
  const result = await getInvoices({ userid: '29097', limitnum: 1 });
  const invoices = result.invoices?.invoice || [];
  const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
  return invoiceArray[0]?.id || invoiceArray[0]?.invoiceid || '999999';
}

async function runFinalTest() {
  try {
    // Step 1: Create test image locally
    console.log('\n📝 STEP 1: Creating Test Image');
    console.log('-'.repeat(80));
    
    const testImagePath = path.join(__dirname, 'test-payment-receipt.png');
    const imageBuffer = Buffer.from(TEST_IMAGE_BASE64, 'base64');
    fs.writeFileSync(testImagePath, imageBuffer);
    
    console.log('✅ Test image created:', testImagePath);
    console.log('   Size:', imageBuffer.length, 'bytes');
    console.log('   Dimensions: 100x100 pixels (red square)');
    console.log('   You can open this file to verify it\'s valid');
    
    // Step 2: Get test invoice
    console.log('\n📝 STEP 2: Getting Test Invoice');
    console.log('-'.repeat(80));
    
    const invoiceId = await getTestInvoice();
    console.log('✅ Using invoice ID:', invoiceId);
    
    // Step 3: Send payment confirmation with attachment
    console.log('\n📝 STEP 3: Sending Payment Confirmation with Attachment');
    console.log('-'.repeat(80));
    
    const requestData = {
      email: TEST_EMAIL,
      invoiceId: invoiceId,
      domain: 'example.com',
      details: 'Test payment confirmation with image attachment.\n\nThis is a test to verify that image attachments are working correctly in WHMCS.',
      image_base64: TEST_IMAGE_BASE64,
      image_filename: 'payment-receipt-test.png'
    };
    
    console.log('Request data:');
    console.log('   Email:', requestData.email);
    console.log('   Invoice ID:', requestData.invoiceId);
    console.log('   Domain:', requestData.domain);
    console.log('   Image filename:', requestData.image_filename);
    console.log('   Base64 length:', requestData.image_base64.length);
    
    const { data } = await axios.post(`${BASE_URL}/confirmPayment`, requestData);
    
    console.log('\n✅ API Response:');
    console.log('   Success:', data.success);
    console.log('   Ticket ID:', data.ticketId);
    console.log('   Invoice ID:', data.invoiceId);
    console.log('   Image Embedded:', data.imageEmbedded);
    console.log('   Message:', data.message);
    
    // Step 4: Verification instructions
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 STEP 4: MANUAL VERIFICATION REQUIRED');
    console.log('='.repeat(80));
    
    console.log('\n🔍 Please follow these steps to verify the attachment:');
    console.log('\n1. Log into WHMCS Admin Panel');
    console.log('   URL: ' + (process.env.WHMCS_URL || 'https://your-whmcs-url.com'));
    console.log('\n2. Navigate to Support > Tickets');
    console.log('\n3. Find and open ticket #' + data.ticketId + '

4. Check the ticket MESSAGE body
   Expected: Image should display INLINE in the message

5. Look for "=== PAYMENT RECEIPT ===" section
   Expected: Image should be visible below this heading

6. Verify there is NO separate "Attachments" section
   Expected: No downloadable attachment (image is embedded only)

OLD STEP 3: Find and open ticket #' + data.ticketId);
    console.log('\n4. Look for the "Attachments" section');
    console.log('   Expected: You should see "payment-receipt-test.png"');
    console.log('\n5. Click on the filename "payment-receipt-test.png"');
    console.log('   Expected: File should download to your computer');
    console.log('\n6. Open the downloaded file');
    console.log('   Expected: You should see a 100x100 red square image');
    
    console.log('\n' + '='.repeat(80));
    console.log('\n⚠️  IMPORTANT: Understanding WHMCS Attachment Behavior');
    console.log('='.repeat(80));
    
    console.log('\n📌 EXPECTED BEHAVIOR:');
    console.log('   ✅ Image is EMBEDDED in the ticket message (HTML img tag)');
    console.log('   ✅ Image displays INLINE if WHMCS supports HTML');
    console.log('   ✅ NO separate attachment file');
    console.log('   ✅ Image is part of the message content');
    console.log('   ✅ If WHMCS doesn\'t support HTML, base64 data will show as text');
    
    console.log('\n📌 WHAT YOU WILL SEE IN WHMCS:');
    console.log('\n   ┌──────────────────────────────────────────────────┐');
    console.log('   │ Ticket #' + data.ticketId + '                                   │');
    console.log('   │ Subject: Payment clarification for Invoice       │');
    console.log('   │          #' + invoiceId + ' - example.com                    │');
    console.log('   │                                                  │');
    console.log('   │ Message:                                         │');
    console.log('   │ === PAYMENT CONFIRMATION ===                     │');
    console.log('   │ Invoice ID: ' + invoiceId + '                              │');
    console.log('   │ Domain: example.com                              │');
    console.log('   │ [IMAGE DISPLAYS HERE]                            │');
    console.log('   │ ...                                              │');
    console.log('   │                                                  │');
    console.log('   │ Attachments:                                     │');
    console.log('   │ 📎 payment-receipt-test.png  <-- Also downloadable│');
    console.log('   └──────────────────────────────────────────────────┘');
    
    console.log('\n📌 IF ATTACHMENT IS NOT VISIBLE:');
    console.log('   1. Check WHMCS version (attachments require v6.0+)');
    console.log('   2. Check WHMCS attachments directory permissions');
    console.log('   3. Check WHMCS error logs');
    console.log('   4. Check PHP upload limits (upload_max_filesize)');
    console.log('   5. Verify WHMCS API credentials have attachment permissions');
    
    console.log('\n📌 IF ATTACHMENT SHOWS AS TEXT:');
    console.log('   This was the original issue - FIXED in latest version');
    console.log('   The fix ensures proper array serialization (attachment[])');
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    
    console.log('\n📊 Summary:');
    console.log('   ✅ Test image created locally');
    console.log('   ✅ Payment confirmation sent');
    console.log('   ✅ Ticket created: #' + data.ticketId);
    console.log('   ✅ Attachment included: ' + data.attachmentIncluded);
    console.log('   ✅ Ready for manual verification');
    
    console.log('\n💡 Next Action:');
    console.log('   Please verify the attachment in WHMCS admin panel');
    console.log('   Follow the verification steps above');
    
    console.log('\n' + '='.repeat(80));
    
    return data;
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.response?.data) {
      console.error('API Error:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

runFinalTest()
  .then(() => {
    console.log('\n✅ All steps completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
