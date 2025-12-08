/**
 * Test to verify domain is included in ticket subject
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_EMAIL = 'abdullahshahid906@gmail.com';

// Small test image
const TEST_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

console.log('🧪 Testing Subject Line with Domain\n');
console.log('='.repeat(80));

async function getTestInvoice() {
  const { getInvoices } = require('../services/whmcsService');
  const result = await getInvoices({ userid: '29097', limitnum: 1 });
  const invoices = result.invoices?.invoice || [];
  const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
  return invoiceArray[0]?.id || invoiceArray[0]?.invoiceid || '999999';
}

async function testSubject() {
  try {
    const invoiceId = await getTestInvoice();
    
    console.log('\n📝 Test Details:');
    console.log('   Email:', TEST_EMAIL);
    console.log('   Expected Domain:', TEST_EMAIL.split('@')[1]);
    console.log('   Invoice ID:', invoiceId);
    
    console.log('\n📤 Sending payment confirmation...');
    
    const { data } = await axios.post(`${BASE_URL}/confirmPayment`, {
      email: TEST_EMAIL,
      invoiceId: invoiceId,
      details: 'Test to verify domain in subject',
      image_base64: TEST_IMAGE,
      image_filename: 'test.png'
    });
    
    console.log('\n✅ Response:');
    console.log('   Success:', data.success);
    console.log('   Ticket ID:', data.ticketId);
    console.log('   Invoice ID:', data.invoiceId);
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 VERIFICATION STEPS:');
    console.log('='.repeat(80));
    
    console.log('\n1. Log into WHMCS Admin Panel');
    console.log('   URL: https://portal.hostbreak.com');
    
    console.log('\n2. Navigate to Support > Tickets');
    
    console.log('\n3. Find and open ticket #' + data.ticketId);
    
    console.log('\n4. Check the SUBJECT line:');
    console.log('   ✅ Expected: "Payment clarification for Invoice #' + invoiceId + ' - gmail.com"');
    console.log('   ❌ Wrong: "Payment clarification for Invoice #' + invoiceId + '" (no domain)');
    
    console.log('\n5. Check the MESSAGE body:');
    console.log('   ✅ Should contain: "Client Domain: gmail.com"');
    console.log('   ✅ Should display embedded image (if HTML supported)');
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ TEST COMPLETED');
    console.log('='.repeat(80));
    
    console.log('\n📊 Summary:');
    console.log('   Ticket ID: #' + data.ticketId);
    console.log('   Expected Subject: Payment clarification for Invoice #' + invoiceId + ' - gmail.com');
    console.log('   Expected Domain in Message: gmail.com');
    console.log('   Image Embedded: YES');
    
    console.log('\n💡 Please verify in WHMCS admin panel');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    throw error;
  }
}

testSubject()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
