/**
 * API Test Cases for Billing Backend
 * 
 * Test Domains:
 * - Wmflippers.com
 * - Hostbrake.com
 * - Filter.pk
 * - Vizfilters.com
 * - Ibuy.com.pk
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Test data
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
const TEST_SERVICE_ID = process.env.TEST_SERVICE_ID || '1';

// Helper function to make API calls
async function apiCall(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

// Test Cases
const testCases = {
  
  // 1. Health Check
  healthCheck: async () => {
    console.log('\n=== Testing Health Check ===');
    const result = await apiCall('GET', '/health');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 2. Get Single Invoice
  getInvoice: async () => {
    console.log('\n=== Testing Get Invoice ===');
    const result = await apiCall('GET', `/invoices/${TEST_INVOICE_ID}`);
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 3. Get All Invoices
  getInvoices: async () => {
    console.log('\n=== Testing Get Invoices ===');
    const result = await apiCall('GET', `/invoices?clientId=${TEST_CLIENT_ID}&status=Unpaid&limitnum=10`);
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 4. Get Client Products
  getClientProducts: async () => {
    console.log('\n=== Testing Get Client Products ===');
    const result = await apiCall('GET', `/clients/${TEST_CLIENT_ID}/products?status=Active`);
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 5. Get Client Domains
  getClientDomains: async () => {
    console.log('\n=== Testing Get Client Domains ===');
    const result = await apiCall('GET', `/clients/${TEST_CLIENT_ID}/domains?status=Active`);
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 6. Get Service Status
  getServiceStatus: async () => {
    console.log('\n=== Testing Get Service Status ===');
    const result = await apiCall('GET', `/clients/${TEST_CLIENT_ID}/service-status`);
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 7. Invoice Lookup - Test with each domain
  invoiceLookupByDomain: async () => {
    console.log('\n=== Testing Invoice Lookup by Domain ===');
    const results = [];
    
    for (const domain of TEST_DOMAINS) {
      console.log(`\nTesting domain: ${domain}`);
      const result = await apiCall('POST', '/api/invoiceLookup', {
        clientId: TEST_CLIENT_ID,
        domain: domain
      });
      console.log('Status:', result.status);
      console.log('Response:', JSON.stringify(result.data, null, 2));
      results.push({ domain, result });
    }
    
    return results;
  },

  // 8. Invoice Lookup by ID
  invoiceLookupById: async () => {
    console.log('\n=== Testing Invoice Lookup by ID ===');
    const result = await apiCall('POST', '/api/invoiceLookup', {
      clientId: TEST_CLIENT_ID,
      invoiceId: TEST_INVOICE_ID
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 9. Service Status - Test with each domain
  serviceStatusByDomain: async () => {
    console.log('\n=== Testing Service Status by Domain ===');
    const results = [];
    
    for (const domain of TEST_DOMAINS) {
      console.log(`\nTesting domain: ${domain}`);
      const result = await apiCall('POST', '/api/serviceStatus', {
        clientId: TEST_CLIENT_ID,
        domain: domain
      });
      console.log('Status:', result.status);
      console.log('Response:', JSON.stringify(result.data, null, 2));
      results.push({ domain, result });
    }
    
    return results;
  },

  // 10. Service Status by Service ID
  serviceStatusById: async () => {
    console.log('\n=== Testing Service Status by Service ID ===');
    const result = await apiCall('POST', '/api/serviceStatus', {
      clientId: TEST_CLIENT_ID,
      serviceId: TEST_SERVICE_ID
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 11. Renew Service - Test with each domain
  renewServiceByDomain: async () => {
    console.log('\n=== Testing Renew Service by Domain ===');
    const results = [];
    
    for (const domain of TEST_DOMAINS) {
      console.log(`\nTesting domain: ${domain}`);
      const result = await apiCall('POST', '/api/renewService', {
        clientId: TEST_CLIENT_ID,
        domain: domain,
        billingcycle: 'monthly',
        paymentmethod: 'banktransfer'
      });
      console.log('Status:', result.status);
      console.log('Response:', JSON.stringify(result.data, null, 2));
      results.push({ domain, result });
    }
    
    return results;
  },

  // 12. Renew Service by Service ID
  renewServiceById: async () => {
    console.log('\n=== Testing Renew Service by Service ID ===');
    const result = await apiCall('POST', '/api/renewService', {
      clientId: TEST_CLIENT_ID,
      serviceId: TEST_SERVICE_ID,
      billingcycle: 'monthly',
      paymentmethod: 'banktransfer'
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 13. Confirm Payment
  confirmPayment: async () => {
    console.log('\n=== Testing Confirm Payment ===');
    const result = await apiCall('POST', '/api/confirmPayment', {
      clientId: TEST_CLIENT_ID,
      invoiceId: TEST_INVOICE_ID,
      details: 'Payment made via bank transfer on 2024-12-02. Reference: TXN123456'
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 14. Triage Issue - Test with each domain
  triageIssue: async () => {
    console.log('\n=== Testing Triage Issue ===');
    const results = [];
    
    const issues = [
      { domain: TEST_DOMAINS[0], description: 'Website is not loading, showing 503 error' },
      { domain: TEST_DOMAINS[1], description: 'Email service is down, cannot send or receive emails' },
      { domain: TEST_DOMAINS[2], description: 'Database connection timeout errors' },
      { domain: TEST_DOMAINS[3], description: 'SSL certificate expired' },
      { domain: TEST_DOMAINS[4], description: 'FTP access not working' },
      { domain: TEST_DOMAINS[5], description: 'Server not responding, high CPU usage' }
    ];
    
    for (const issue of issues) {
      console.log(`\nTesting domain: ${issue.domain}`);
      const result = await apiCall('POST', '/api/triageIssue', {
        clientId: TEST_CLIENT_ID,
        domain: issue.domain,
        description: issue.description
      });
      console.log('Status:', result.status);
      console.log('Response:', JSON.stringify(result.data, null, 2));
      results.push({ domain: issue.domain, result });
    }
    
    return results;
  },

  // 15. Open Ticket
  openTicket: async () => {
    console.log('\n=== Testing Open Ticket ===');
    const result = await apiCall('POST', '/tickets', {
      deptname: 'Technical Support',
      subject: 'General inquiry about hosting services',
      message: 'I need help understanding my hosting plan features',
      clientid: TEST_CLIENT_ID,
      priority: 'Medium'
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  },

  // 16. Add Order
  addOrder: async () => {
    console.log('\n=== Testing Add Order ===');
    const result = await apiCall('POST', '/orders', {
      clientid: TEST_CLIENT_ID,
      paymentmethod: 'banktransfer',
      pid: [1],
      domain: 'newdomain.com',
      billingcycle: 'annually'
    });
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
    return result;
  }
};

// Run all tests
async function runAllTests() {
  console.log('========================================');
  console.log('Starting API Tests');
  console.log('========================================');
  console.log('Base URL:', BASE_URL);
  console.log('Test Client ID:', TEST_CLIENT_ID);
  console.log('Test Domains:', TEST_DOMAINS.join(', '));
  console.log('========================================');

  const results = {};

  try {
    results.healthCheck = await testCases.healthCheck();
    results.getInvoice = await testCases.getInvoice();
    results.getInvoices = await testCases.getInvoices();
    results.getClientProducts = await testCases.getClientProducts();
    results.getClientDomains = await testCases.getClientDomains();
    results.getServiceStatus = await testCases.getServiceStatus();
    results.invoiceLookupByDomain = await testCases.invoiceLookupByDomain();
    results.invoiceLookupById = await testCases.invoiceLookupById();
    results.serviceStatusByDomain = await testCases.serviceStatusByDomain();
    results.serviceStatusById = await testCases.serviceStatusById();
    results.renewServiceByDomain = await testCases.renewServiceByDomain();
    results.renewServiceById = await testCases.renewServiceById();
    results.confirmPayment = await testCases.confirmPayment();
    results.triageIssue = await testCases.triageIssue();
    results.openTicket = await testCases.openTicket();
    results.addOrder = await testCases.addOrder();
  } catch (error) {
    console.error('\nTest execution error:', error);
  }

  console.log('\n========================================');
  console.log('All Tests Completed');
  console.log('========================================');

  return results;
}

// Run individual test
async function runTest(testName) {
  if (testCases[testName]) {
    return await testCases[testName]();
  } else {
    console.error(`Test "${testName}" not found`);
    console.log('Available tests:', Object.keys(testCases).join(', '));
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAllTests, runTest, testCases };
}

// Run if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
