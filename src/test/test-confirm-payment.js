/**
 * Test cases for POST /api/confirmPayment endpoint
 * Tests payment confirmation and billing ticket creation
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_CLIENT_ID = process.env.TEST_CLIENT_ID || '29097';
const TEST_EMAIL = process.env.TEST_EMAIL || 'abdullahshahid906@gmail.com';

console.log('🧪 Testing Payment Confirmation Endpoint\n');
console.log('Configuration:', {
  baseUrl: BASE_URL,
  clientId: TEST_CLIENT_ID,
  email: TEST_EMAIL
});
console.log('\n' + '='.repeat(80) + '\n');

/**
 * Helper function to make API requests
 */
async function testEndpoint(name, method, url, data = null) {
  console.log(`\n📝 TEST: ${name}`);
  console.log(`   ${method} ${url}`);
  if (data) {
    console.log('   Body:', JSON.stringify(data, null, 2));
  }
  
  const startTime = Date.now();
  
  try {
    const config = {
      method,
      url,
      ...(data && { data })
    };
    
    const response = await axios(config);
    const duration = Date.now() - startTime;
    
    console.log(`   ✅ SUCCESS (${duration}ms)`);
    console.log('   Status:', response.status);
    console.log('   Response:', JSON.stringify(response.data, null, 2));
    
    return { success: true, data: response.data, duration };
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

/**
 * Helper to get an invoice for testing
 */
async function getTestInvoice(clientId) {
  try {
    // Try to get invoices via WHMCS service
    const { getInvoices } = require('../services/whmcsService');
    const result = await getInvoices({ userid: clientId, limitnum: 5 });
    
    const invoices = result.invoices?.invoice || [];
    const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
    
    if (invoiceArray.length > 0) {
      // Return the first invoice
      return invoiceArray[0];
    }
    return null;
  } catch (error) {
    console.log('   ⚠️  Could not fetch invoices:', error.message);
    return null;
  }
}

/**
 * Test Suite
 */
async function runTests() {
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  // Get a test invoice
  console.log('🔍 Finding test invoice for client', TEST_CLIENT_ID, '...');
  const testInvoice = await getTestInvoice(TEST_CLIENT_ID);
  
  if (!testInvoice) {
    console.log('   ⚠️  No invoices found for this client');
    console.log('   ℹ️  Tests will use mock invoice ID for validation tests only');
  }
  
  const TEST_INVOICE_ID = testInvoice?.id || testInvoice?.invoiceid || '999999';
  const invoiceStatus = testInvoice?.status || 'Unknown';
  
  console.log(`   Invoice ID: ${TEST_INVOICE_ID}`);
  console.log(`   Status: ${invoiceStatus}`);
  console.log(`   Owner: ${testInvoice?.userid || 'Unknown'}`);
  
  // ============================================================================
  // TEST 1: Confirm payment with valid clientId and invoiceId
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: Confirm Payment with Valid ClientId and InvoiceId');
  console.log('='.repeat(80));
  
  const test1 = await testEndpoint(
    'Confirm payment with clientId and invoiceId',
    'POST',
    `${BASE_URL}/confirmPayment`,
    {
      clientId: TEST_CLIENT_ID,
      invoiceId: TEST_INVOICE_ID
    }
  );
  results.tests.push(test1);
  test1.success ? results.passed++ : results.failed++;
  
  // ============================================================================
  // TEST 2: Confirm payment with payment details
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Confirm Payment with Payment Details');
  console.log('='.repeat(80));
  
  const test2 = await testEndpoint(
    'Confirm payment with transaction details',
    'POST',
    `${BASE_URL}/confirmPayment`,
    {
      clientId: TEST_CLIENT_ID,
      invoiceId: TEST_INVOICE_ID,
      details: 'Payment made via bank transfer. Transaction ID: TXN123456789. Date: 2025-12-06. Amount: $7800.00'
    }
  );
  results.tests.push(test2);
  test2.success ? results.passed++ : results.failed++;
  
  // ============================================================================
  // TEST 3: Confirm payment using email (auto-resolve clientId)
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: Confirm Payment Using Email (Auto-Resolve)');
  console.log('='.repeat(80));
  
  const test3 = await testEndpoint(
    'Confirm payment with email instead of clientId',
    'POST',
    `${BASE_URL}/confirmPayment`,
    {
      email: TEST_EMAIL,
      invoiceId: TEST_INVOICE_ID,
      details: 'Paid via online banking. Reference: REF987654321'
    }
  );
  results.tests.push(test3);
  test3.success ? results.passed++ : results.failed++;
  
  // ============================================================================
  // TEST 4: Validation - Missing clientId
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: Validation - Missing ClientId');
  console.log('='.repeat(80));
  
  const test4 = await testEndpoint(
    'Attempt to confirm payment without clientId (should fail)',
    'POST',
    `${BASE_URL}/confirmPayment`,
    {
      invoiceId: TEST_INVOICE_ID
    }
  );
  results.tests.push(test4);
  // This should fail, so we count it as passed if it fails
  !test4.success ? results.passed++ : results.failed++;
  
  // ============================================================================
  // TEST 5: Validation - Missing invoiceId
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 5: Validation - Missing InvoiceId');
  console.log('='.repeat(80));
  
  const test5 = await testEndpoint(
    'Attempt to confirm payment without invoiceId (should fail)',
    'POST',
    `${BASE_URL}/confirmPayment`,
    {
      clientId: TEST_CLIENT_ID
    }
  );
  results.tests.push(test5);
  // This should fail, so we count it as passed if it fails
  !test5.success ? results.passed++ : results.failed++;
  
  // ============================================================================
  // TEST 6: Validation - Invalid invoiceId
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 6: Validation - Invalid InvoiceId');
  console.log('='.repeat(80));
  
  const test6 = await testEndpoint(
    'Attempt to confirm payment with invalid invoiceId (should fail)',
    'POST',
    `${BASE_URL}/confirmPayment`,
    {
      clientId: TEST_CLIENT_ID,
      invoiceId: '999999999'
    }
  );
  results.tests.push(test6);
  // This should fail, so we count it as passed if it fails
  !test6.success ? results.passed++ : results.failed++;
  
  // ============================================================================
  // TEST 7: Validation - Invoice belongs to different client
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 7: Validation - Invoice Belongs to Different Client');
  console.log('='.repeat(80));
  
  const test7 = await testEndpoint(
    'Attempt to confirm payment for another client\'s invoice (should fail)',
    'POST',
    `${BASE_URL}/confirmPayment`,
    {
      clientId: '99999',
      invoiceId: TEST_INVOICE_ID
    }
  );
  results.tests.push(test7);
  // This should fail, so we count it as passed if it fails
  !test7.success ? results.passed++ : results.failed++;
  
  // ============================================================================
  // TEST 8: Different payment methods mentioned in details
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 8: Different Payment Methods in Details');
  console.log('='.repeat(80));
  
  const paymentMethods = [
    'Bank Transfer - Account: 1234567890, Date: 2025-12-06',
    'Credit Card - Last 4 digits: 4242, Authorization: AUTH123',
    'PayPal - Transaction ID: PAY-123456789',
    'Cash Payment - Receipt #: CASH-2025-001'
  ];
  
  for (const method of paymentMethods) {
    const test = await testEndpoint(
      `Confirm payment: ${method.split('-')[0].trim()}`,
      'POST',
      `${BASE_URL}/confirmPayment`,
      {
        clientId: TEST_CLIENT_ID,
        invoiceId: TEST_INVOICE_ID,
        details: method
      }
    );
    results.tests.push(test);
    test.success ? results.passed++ : results.failed++;
  }
  
  // ============================================================================
  // TEST 9: Confirm payment without details (minimal request)
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 9: Confirm Payment Without Details (Minimal)');
  console.log('='.repeat(80));
  
  const test9 = await testEndpoint(
    'Confirm payment with minimal information',
    'POST',
    `${BASE_URL}/confirmPayment`,
    {
      clientId: TEST_CLIENT_ID,
      invoiceId: TEST_INVOICE_ID
    }
  );
  results.tests.push(test9);
  test9.success ? results.passed++ : results.failed++;
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${results.tests.length}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`);
  
  // Calculate average response time
  const avgDuration = results.tests.reduce((sum, t) => sum + t.duration, 0) / results.tests.length;
  console.log(`⏱️  Average Response Time: ${avgDuration.toFixed(0)}ms`);
  
  console.log('\n' + '='.repeat(80));
  console.log('\n💡 KEY FEATURES:');
  console.log('   • Creates billing ticket for payment verification');
  console.log('   • Validates invoice ownership (prevents unauthorized access)');
  console.log('   • Detects already-paid invoices');
  console.log('   • Accepts payment details/notes from user');
  console.log('   • Supports email-based client resolution');
  console.log('   • Returns ticket ID for tracking');
  
  console.log('\n📋 ENDPOINT BEHAVIOR:');
  console.log('   1. Validates clientId and invoiceId are provided');
  console.log('   2. Fetches invoice from WHMCS');
  console.log('   3. Verifies invoice belongs to the client');
  console.log('   4. If already paid → Returns success with paid date');
  console.log('   5. If unpaid → Creates billing ticket with details');
  console.log('   6. Returns ticket ID for user to track');
  
  console.log('\n🎫 TICKET CREATION:');
  console.log('   • Department: Billing');
  console.log('   • Priority: Medium');
  console.log('   • Subject: "Payment clarification for Invoice #[ID]"');
  console.log('   • Message: User-provided details or default message');
  console.log('   • Linked to: Client account');
  
  console.log('\n' + '='.repeat(80));
  
  return results;
}

// Run tests
runTests()
  .then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
