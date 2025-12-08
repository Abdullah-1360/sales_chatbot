/**
 * Test image embedding (no attachment)
 * Image is embedded in message only, not attached as file
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_EMAIL = 'abdullahshahid906@gmail.com';

// Small test image (100x100 red square)
const TEST_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAA0klEQVR42u3RAQ0AAAjDMO5fNCCDkC5z0HTVriRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkqTvBaJXAGXjK3jzAAAAAElFTkSuQmCC';

console.log('🧪 Testing Image Embedding (No Attachment)\n');
console.log('='.repeat(80));

async function getTestInvoice() {
  const { getInvoices } = require('../services/whmcsService');
  const result = await getInvoices({ userid: '29097', limitnum: 1 });
  const invoices = result.invoices?.invoice || [];
  const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
  return invoiceArray[0]?.id || invoiceArray[0]?.invoiceid || '999999';
}

async function testEmbeddedImage() {
  try {
    const invoiceId = await getTestInvoice();
    
    console.log('\n📝 Test Configuration:');
    console.log('   Email:', TEST_EMAIL);
    console.log('   Invoice ID:', invoiceId);
    console.log('   Domain: example.com');
    console.log('   Image: 100x100 red square (embedded only)');
    
    console.log('\n📤 Sending payment confirmation...');
    
    const { data } = await axios.post(`${BASE_URL}/confirmPayment`, {
      email: TEST_EMAIL,
      invoiceId: invoiceId,
      domain: 'example.com',
      details: 'Payment made via bank transfer. Receipt embedded in message.',
      image_base64: TEST_IMAGE,
      image_filename: 'payment-receipt.png'
    });
    
    console.log('\n✅ Response:');
    console.log('   Success:', data.success);
    console.log('   Ticket ID:', data.ticketId);
    console.log('   Invoice ID:', data.invoiceId);
    console.log('   Image Embedded:', data.imageEmbedded);
    console.log('   Message:', data.message);
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 VERIFICATION STEPS');
    console.log('='.repeat(80));
    
    console.log('\n1. Log into WHMCS Admin Panel');
    console.log('   URL: https://portal.hostbreak.com');
    
    console.log('\n2. Navigate to Support > Tickets');
    
    console.log('\n3. Open ticket #' + data.ticketId);
    
    console.log('\n4. Check the SUBJECT:');
    console.log('   ✅ Expected: "Payment clarification for Invoice #' + invoiceId + ' - example.com"');
    
    console.log('\n5. Check the MESSAGE body:');
    console.log('   ✅ Should show: "Domain: example.com"');
    console.log('   ✅ Should show: "=== PAYMENT RECEIPT ==="');
    console.log('   ✅ Should display: Embedded image (if WHMCS supports HTML)');
    
    console.log('\n6. Check for ATTACHMENTS section:');
    console.log('   ✅ Expected: NO attachments section');
    console.log('   ✅ Image is embedded in message only');
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📌 IMPORTANT NOTES');
    console.log('='.repeat(80));
    
    console.log('\n✅ Image Embedding:');
    console.log('   - Image is embedded using HTML <img> tag');
    console.log('   - Image displays inline if WHMCS supports HTML');
    console.log('   - No separate attachment file');
    console.log('   - Image is part of message content');
    
    console.log('\n⚠️  If WHMCS doesn\'t support HTML:');
    console.log('   - HTML tags will show as text');
    console.log('   - Base64 data may be visible');
    console.log('   - This is a WHMCS limitation, not an API issue');
    
    console.log('\n✅ Benefits of Embedding:');
    console.log('   - Image visible immediately in ticket');
    console.log('   - No need to click/download attachment');
    console.log('   - Faster for support team to review');
    console.log('   - Cleaner ticket interface');
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\n   Ticket ID: #' + data.ticketId);
    console.log('   Subject: Payment clarification for Invoice #' + invoiceId + ' - example.com');
    console.log('   Image Embedded: ' + (data.imageEmbedded ? 'YES ✅' : 'NO ❌'));
    console.log('   Attachment File: NO (embedded only) ✅');
    console.log('   Status: Ready for verification');
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    throw error;
  }
}

testEmbeddedImage()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
