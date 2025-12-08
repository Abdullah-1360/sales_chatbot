/**
 * Test invoice checking in renewal endpoint
 * Verifies that existing unpaid invoices are properly detected
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_EMAIL = process.env.TEST_EMAIL || 'abdullahshahid906@gmail.com';
const TEST_DOMAIN = process.env.TEST_DOMAIN || 'test123.com';

console.log('🧪 Testing Renewal Invoice Checking\n');
console.log('='.repeat(80));

async function testRenewal(testName, requestBody) {
  console.log(`\n📝 TEST: ${testName}`);
  console.log('Request:', JSON.stringify(requestBody, null, 2));
  
  const startTime = Date.now();
  
  try {
    const { data } = await axios.post(`${BASE_URL}/renewService`, requestBody);
    const duration = Date.now() - startTime;
    
    console.log(`✅ SUCCESS (${duration}ms)`);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.existingInvoice) {
      console.log('\n📋 Existing Invoice Details:');
      console.log(`   Invoice ID: ${data.invoiceId}`);
      console.log(`   Amount: ${data.amount}`);
      console.log(`   Due Date: ${data.dueDate}`);
      console.log(`   Overdue: ${data.isOverdue ? 'Yes' : 'No'}`);
      console.log(`   Message: ${data.message}`);
    }
    
    return { success: true, data, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.log(`❌ FAILED (${duration}ms)`);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    
    return { success: false, error: error.response?.data || error.message, duration };
  }
}

async function runTests() {
  console.log('Testing Invoice Detection in Renewal Endpoint');
  console.log('='.repeat(80));
  
  // TEST 1: Renew with email and domain
  await testRenewal(
    'Renew service with email and domain',
    {
      email: TEST_EMAIL,
      domain: TEST_DOMAIN
    }
  );
  
  console.log('\n' + '='.repeat(80));
  
  // TEST 2: Renew with different domain (might not have invoice)
  await testRenewal(
    'Renew service with different domain',
    {
      email: TEST_EMAIL,
      domain: 'example.com'
    }
  );
  
  console.log('\n' + '='.repeat(80));
  console.log('\n💡 KEY FEATURES:');
  console.log('   1. Checks all unpaid invoices for the client');
  console.log('   2. Parses invoice items and matches by relid (service/domain ID)');
  console.log('   3. Falls back to matching domain name in description');
  console.log('   4. Detects if invoice is overdue and adjusts message');
  console.log('   5. Returns invoice details (ID, amount, due date, overdue status)');
  console.log('\n' + '='.repeat(80));
  
  console.log('\n📊 INVOICE MATCHING LOGIC:');
  console.log('   • Service renewals: Match by relid == serviceId');
  console.log('   • Domain renewals: Match by relid == domainId');
  console.log('   • Fallback: Match domain name in item description');
  console.log('   • Type checking: Verifies item type (Hosting, Domain, etc.)');
  console.log('\n' + '='.repeat(80));
  
  console.log('\n📝 RESPONSE MESSAGES:');
  console.log('   • Not overdue: "Invoice #123 for $50 due on 2025-12-15"');
  console.log('   • Overdue: "Invoice #123 is overdue by 5 days (due: 2025-12-01)"');
  console.log('   • No invoice: Proceeds to generate new invoice via GenInvoices');
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
