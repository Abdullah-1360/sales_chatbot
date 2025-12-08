/**
 * Test both image attachment methods
 * 1. Base64 direct (recommended)
 * 2. URL download (requires network access)
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_EMAIL = 'abdullahshahid906@gmail.com';

// Small 1x1 red pixel PNG in base64
const TEST_BASE64_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

console.log('🧪 Testing Image Attachment Methods\n');
console.log('='.repeat(80));

async function getTestInvoice() {
  const { getInvoices } = require('../services/whmcsService');
  const result = await getInvoices({ userid: '29097', limitnum: 1 });
  const invoices = result.invoices?.invoice || [];
  const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
  return invoiceArray[0]?.id || invoiceArray[0]?.invoiceid || '999999';
}

async function runTests() {
  const invoiceId = await getTestInvoice();
  console.log(`Using invoice ID: ${invoiceId}\n`);
  console.log('='.repeat(80));
  
  // TEST 1: Base64 method (recommended)
  console.log('\n📝 TEST 1: Base64 Image Attachment (Recommended)');
  console.log('-'.repeat(80));
  
  try {
    const { data } = await axios.post(`${BASE_URL}/confirmPayment`, {
      email: TEST_EMAIL,
      invoiceId: invoiceId,
      details: 'Payment made via bank transfer. Receipt attached as base64.',
      image_base64: TEST_BASE64_IMAGE,
      image_filename: 'payment-receipt.png'
    });
    
    console.log('✅ SUCCESS');
    console.log('Ticket ID:', data.ticketId);
    console.log('Attachment Included:', data.attachmentIncluded);
    console.log('Message:', data.message);
    
    if (data.attachmentIncluded) {
      console.log('\n🎉 Base64 method works! Image attached to ticket.');
    }
  } catch (error) {
    console.log('❌ FAILED:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(80));
  
  // TEST 2: URL method (requires network)
  console.log('\n📝 TEST 2: URL Download Method (Requires Network Access)');
  console.log('-'.repeat(80));
  
  try {
    const { data } = await axios.post(`${BASE_URL}/confirmPayment`, {
      email: TEST_EMAIL,
      invoiceId: invoiceId,
      details: 'Payment made via bank transfer. Receipt downloaded from URL.',
      image_url: 'https://via.placeholder.com/300x200.png'
    });
    
    console.log('✅ SUCCESS');
    console.log('Ticket ID:', data.ticketId);
    console.log('Attachment Included:', data.attachmentIncluded);
    console.log('Message:', data.message);
    
    if (data.attachmentIncluded) {
      console.log('\n🎉 URL method works! Image downloaded and attached.');
    } else {
      console.log('\n⚠️  URL method did not attach image (likely network issue)');
    }
  } catch (error) {
    console.log('❌ FAILED:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 COMPARISON:');
  console.log('-'.repeat(80));
  console.log('\nBase64 Method (Recommended):');
  console.log('  ✅ No network required');
  console.log('  ✅ Faster (no download)');
  console.log('  ✅ More reliable');
  console.log('  ✅ Works in restricted networks');
  console.log('  ⚠️  Requires client to encode image');
  
  console.log('\nURL Method:');
  console.log('  ✅ Simpler for client (just send URL)');
  console.log('  ⚠️  Requires network access');
  console.log('  ⚠️  Slower (download time)');
  console.log('  ⚠️  May fail in restricted networks');
  console.log('  ⚠️  Depends on external server availability');
  
  console.log('\n' + '='.repeat(80));
  console.log('\n💡 RECOMMENDATION:');
  console.log('   Use Base64 method for production');
  console.log('   Client should encode image before sending');
  console.log('   URL method as fallback only');
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📝 EXAMPLE CODE:');
  console.log('\nJavaScript (Browser):');
  console.log('```javascript');
  console.log('// Convert file to base64');
  console.log('const file = input.files[0];');
  console.log('const reader = new FileReader();');
  console.log('reader.onload = () => {');
  console.log('  const base64 = reader.result.split(\',\')[1];');
  console.log('  // Send to API');
  console.log('  fetch(\'/api/confirmPayment\', {');
  console.log('    method: \'POST\',');
  console.log('    body: JSON.stringify({');
  console.log('      email: user.email,');
  console.log('      invoiceId: invoiceId,');
  console.log('      details: \'Payment receipt\',');
  console.log('      image_base64: base64,');
  console.log('      image_filename: file.name');
  console.log('    })');
  console.log('  });');
  console.log('};');
  console.log('reader.readAsDataURL(file);');
  console.log('```');
  
  console.log('\n' + '='.repeat(80));
}

runTests()
  .then(() => {
    console.log('\n✅ Tests completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
