/**
 * Test confirm payment with image attachment
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_CLIENT_ID = process.env.TEST_CLIENT_ID || '29097';
const TEST_EMAIL = process.env.TEST_EMAIL || 'abdullahshahid906@gmail.com';

// Sample image URLs for testing
const TEST_IMAGE_URLS = {
  valid: 'https://via.placeholder.com/600x400.png/0000FF/FFFFFF?text=Payment+Receipt',
  jpg: 'https://via.placeholder.com/800x600.jpg',
  small: 'https://via.placeholder.com/150',
  invalid: 'https://example.com/not-an-image.txt',
  notFound: 'https://via.placeholder.com/nonexistent.png'
};

console.log('🧪 Testing Confirm Payment with Image Attachment\n');
console.log('='.repeat(80));

async function testWithImage(testName, imageUrl, invoiceId) {
  console.log(`\n📝 TEST: ${testName}`);
  console.log(`   Image URL: ${imageUrl}`);
  
  const startTime = Date.now();
  
  try {
    const { data } = await axios.post(`${BASE_URL}/confirmPayment`, {
      email: TEST_EMAIL,
      invoiceId: invoiceId,
      details: 'Bank transfer completed. Transaction ID: TXN123456789',
      image_url: imageUrl
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`   ✅ SUCCESS (${duration}ms)`);
    console.log('   Response:', JSON.stringify(data, null, 2));
    
    if (data.attachmentIncluded) {
      console.log('   📎 Attachment: Included');
    } else {
      console.log('   📎 Attachment: Not included');
    }
    
    return { success: true, data, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.log(`   ❌ FAILED (${duration}ms)`);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('   Error:', error.message);
    }
    
    return { success: false, error: error.response?.data || error.message, duration };
  }
}

async function runTests() {
  // Get a test invoice
  const { getInvoices } = require('../services/whmcsService');
  const result = await getInvoices({ userid: TEST_CLIENT_ID, limitnum: 1 });
  const invoices = result.invoices?.invoice || [];
  const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
  const TEST_INVOICE_ID = invoiceArray[0]?.id || invoiceArray[0]?.invoiceid || '999999';
  
  console.log(`Using invoice ID: ${TEST_INVOICE_ID}\n`);
  console.log('='.repeat(80));
  
  // TEST 1: Valid PNG image
  await testWithImage(
    'Confirm payment with PNG receipt',
    TEST_IMAGE_URLS.valid,
    TEST_INVOICE_ID
  );
  
  console.log('\n' + '='.repeat(80));
  
  // TEST 2: Valid JPG image
  await testWithImage(
    'Confirm payment with JPG receipt',
    TEST_IMAGE_URLS.jpg,
    TEST_INVOICE_ID
  );
  
  console.log('\n' + '='.repeat(80));
  
  // TEST 3: Small image
  await testWithImage(
    'Confirm payment with small image',
    TEST_IMAGE_URLS.small,
    TEST_INVOICE_ID
  );
  
  console.log('\n' + '='.repeat(80));
  
  // TEST 4: Without image (should still work)
  console.log('\n📝 TEST: Confirm payment without image');
  try {
    const { data } = await axios.post(`${BASE_URL}/confirmPayment`, {
      email: TEST_EMAIL,
      invoiceId: TEST_INVOICE_ID,
      details: 'Payment made without receipt image'
    });
    console.log('   ✅ SUCCESS');
    console.log('   Attachment Included:', data.attachmentIncluded || false);
  } catch (error) {
    console.log('   ❌ FAILED:', error.message);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n💡 KEY FEATURES:');
  console.log('   • Downloads image from provided URL');
  console.log('   • Converts to base64 for WHMCS');
  console.log('   • Attaches to support ticket');
  console.log('   • Supports PNG, JPG, GIF, WebP formats');
  console.log('   • Max file size: 10MB');
  console.log('   • Cleans up temp files automatically');
  console.log('   • Graceful fallback if image fails');
  
  console.log('\n📋 REQUEST FORMAT:');
  console.log('   {');
  console.log('     "email": "user@example.com",');
  console.log('     "invoiceId": "131836",');
  console.log('     "details": "Payment details...",');
  console.log('     "image_url": "https://example.com/receipt.jpg"  ← NEW');
  console.log('   }');
  
  console.log('\n📤 RESPONSE:');
  console.log('   {');
  console.log('     "success": true,');
  console.log('     "ticketId": "407148",');
  console.log('     "invoiceId": "131836",');
  console.log('     "attachmentIncluded": true,  ← NEW');
  console.log('     "message": "...Payment receipt attached."');
  console.log('   }');
  
  console.log('\n' + '='.repeat(80));
}

runTests()
  .then(() => {
    console.log('\n✅ Tests completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });
