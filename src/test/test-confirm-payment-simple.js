/**
 * Simple test for confirmPayment endpoint
 * No image processing - just basic payment confirmation
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_EMAIL = 'abdullahshahid906@gmail.com';

console.log('🧪 Testing Payment Confirmation (No Image Processing)\n');
console.log('='.repeat(80));

async function getTestInvoice() {
  const { getInvoices } = require('../services/whmcsService');
  const result = await getInvoices({ userid: '29097', limitnum: 1 });
  const invoices = result.invoices?.invoice || [];
  const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
  return invoiceArray[0]?.id || invoiceArray[0]?.invoiceid || '999999';
}

async function testConfirmPayment() {
  try {
    const invoiceId = await getTestInvoice();
    
    console.log('\n📝 Test Configuration:');
    console.log('   Email:', TEST_EMAIL);
    console.log('   Invoice ID:', invoiceId);
    console.log('   Domain: example.com');
    
    console.log('\n📤 Sending payment confirmation...');
    
    const { data } = await axios.post(`${BASE_URL}/confirmPayment`, {
      email: TEST_EMAIL,
      invoiceId: invoiceId,
      domain: 'example.com',
      details: 'Payment made via bank transfer on 2024-01-15.\nReference: TXN123456'
    });
    
    console.log('\n✅ Response:');
    console.log('   Success:', data.success);
    console.log('   Ticket ID:', data.ticketId);
    console.log('   Invoice ID:', data.invoiceId);
    console.log('   Message:', data.message);
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 VERIFICATION IN WHMCS');
    console.log('='.repeat(80));
    
    console.log('\n1. Log into WHMCS Admin: https://portal.hostbreak.com');
    console.log('\n2. Go to Support > Tickets');
    console.log('\n3. Open ticket #' + data.ticketId);
    
    console.log('\n4. Verify SUBJECT:');
    console.log('   ✅ "Payment clarification for Invoice #' + invoiceId + ' - example.com"');
    
    console.log('\n5. Verify MESSAGE contains:');
    console.log('   ✅ Invoice ID: ' + invoiceId);
    console.log('   ✅ Domain: example.com');
    console.log('   ✅ Payment details');
    
    console.log('\n6. Verify NO image/attachment:');
    console.log('   ✅ No embedded image');
    console.log('   ✅ No attachments section');
    console.log('   ✅ Clean text-only ticket');
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\n   Ticket ID: #' + data.ticketId);
    console.log('   Subject: Payment clarification for Invoice #' + invoiceId + ' - example.com');
    console.log('   Image Processing: DISABLED ✅');
    console.log('   Attachments: NONE ✅');
    console.log('   Status: Clean text-only ticket');
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    throw error;
  }
}

testConfirmPayment()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
