/**
 * Standardized Endpoints Test Suite
 * Tests the 5 main endpoints with all 6 domains
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

const TEST_DOMAINS = [
  'Wmflippers.com',
  'Hostbrake.com',
  'Filter.pk',
  'Vizfilters.com',
  'Ibuy.com.pk',
  'macoode.com'
];

const TEST_CLIENT_ID = process.env.TEST_CLIENT_ID || '1';
const TEST_INVOICE_ID = process.env.TEST_INVOICE_ID || '1';

// Helper function
async function apiCall(endpoint, body) {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

console.log('='.repeat(60));
console.log('STANDARDIZED ENDPOINTS TEST SUITE');
console.log('='.repeat(60));
console.log(`Base URL: ${BASE_URL}`);
console.log(`Client ID: ${TEST_CLIENT_ID}`);
console.log(`Test Domains: ${TEST_DOMAINS.join(', ')}`);
console.log('='.repeat(60));

// Test 1: Invoice Lookup
async function testInvoiceLookup() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: INVOICE LOOKUP');
  console.log('='.repeat(60));

  // Test 1a: By Invoice ID
  console.log('\n--- Test 1a: Invoice Lookup by ID ---');
  const result1a = await apiCall('/api/invoiceLookup', {
    clientId: TEST_CLIENT_ID,
    invoiceId: TEST_INVOICE_ID
  });
  console.log('Status:', result1a.status);
  console.log('Response:', JSON.stringify(result1a.data, null, 2));

  // Test 1b: By Domain (all domains)
  console.log('\n--- Test 1b: Invoice Lookup by Domain ---');
  for (const domain of TEST_DOMAINS) {
    console.log(`\nTesting: ${domain}`);
    const result = await apiCall('/api/invoiceLookup', {
      clientId: TEST_CLIENT_ID,
      domain: domain
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  }
}

// Test 2: Service Status Check
async function testServiceStatus() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: SERVICE STATUS CHECK');
  console.log('='.repeat(60));

  for (const domain of TEST_DOMAINS) {
    console.log(`\nTesting: ${domain}`);
    const result = await apiCall('/api/serviceStatus', {
      clientId: TEST_CLIENT_ID,
      domain: domain
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    
    // Display key fields
    if (result.data.success) {
      console.log(`  → Status: ${result.data.status}`);
      console.log(`  → Billing Issue: ${result.data.billingIssue}`);
      if (result.data.invoiceId) {
        console.log(`  → Invoice ID: ${result.data.invoiceId}`);
        console.log(`  → Amount Due: $${result.data.amountDue}`);
      }
    }
  }
}

// Test 3: Renew Service
async function testRenewService() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: RENEW SERVICE');
  console.log('='.repeat(60));

  for (const domain of TEST_DOMAINS) {
    console.log(`\nTesting: ${domain}`);
    const result = await apiCall('/api/renewService', {
      clientId: TEST_CLIENT_ID,
      domain: domain,
      period: 1
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    
    // Display key fields
    if (result.data.success) {
      console.log(`  → Existing Invoice: ${result.data.existingInvoice}`);
      console.log(`  → Invoice ID: ${result.data.invoiceId}`);
      console.log(`  → Amount: $${result.data.amount}`);
    }
  }
}

// Test 4: Payment Confirmation
async function testConfirmPayment() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: PAYMENT CONFIRMATION');
  console.log('='.repeat(60));

  console.log(`\nTesting Invoice ID: ${TEST_INVOICE_ID}`);
  const result = await apiCall('/api/confirmPayment', {
    clientId: TEST_CLIENT_ID,
    invoiceId: TEST_INVOICE_ID,
    details: 'Test payment via bank transfer. Reference: TEST-' + Date.now()
  });
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  // Display key fields
  if (result.data.success) {
    console.log(`  → Paid: ${result.data.paid}`);
    if (result.data.paid) {
      console.log(`  → Paid Date: ${result.data.paidDate}`);
    } else {
      console.log(`  → Ticket ID: ${result.data.ticketId}`);
    }
  }
}

// Test 5: Triage Issue
async function testTriageIssue() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: TRIAGE ISSUE');
  console.log('='.repeat(60));

  const issues = [
    { domain: TEST_DOMAINS[0], issue: 'Website is not loading, showing 503 error' },
    { domain: TEST_DOMAINS[1], issue: 'Email service is down, cannot send or receive emails' },
    { domain: TEST_DOMAINS[2], issue: 'Database connection timeout errors' },
    { domain: TEST_DOMAINS[3], issue: 'SSL certificate expired' },
    { domain: TEST_DOMAINS[4], issue: 'FTP access not working' },
    { domain: TEST_DOMAINS[5], issue: 'Server not responding, high CPU usage' }
  ];

  for (const test of issues) {
    console.log(`\nTesting: ${test.domain}`);
    console.log(`Issue: ${test.issue}`);
    const result = await apiCall('/api/triageIssue', {
      clientId: TEST_CLIENT_ID,
      domain: test.domain,
      issue: test.issue
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    
    // Display key fields
    if (result.data.success) {
      console.log(`  → Resolution: ${result.data.resolution}`);
      if (result.data.resolution === 'billing') {
        console.log(`  → Invoice ID: ${result.data.invoiceId}`);
        console.log(`  → Amount Due: $${result.data.amountDue}`);
      } else if (result.data.resolution === 'tech_ticket') {
        console.log(`  → Ticket ID: ${result.data.ticketId}`);
      }
    }
  }
}

// Run all tests
async function runAllTests() {
  try {
    await testInvoiceLookup();
    await testServiceStatus();
    await testRenewService();
    await testConfirmPayment();
    await testTriageIssue();
    
    console.log('\n' + '='.repeat(60));
    console.log('ALL TESTS COMPLETED');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\nTest execution error:', error);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testInvoiceLookup,
    testServiceStatus,
    testRenewService,
    testConfirmPayment,
    testTriageIssue,
    runAllTests
  };
}

// Run if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
