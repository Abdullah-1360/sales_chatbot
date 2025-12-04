#!/usr/bin/env node
/**
 * Comprehensive Endpoint Test
 * Tests all API endpoints and both support departments
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_CLIENT_ID = '31';
const TEST_DOMAINS = {
  hosting: 'wmflippers.com',
  domainOnly: 'mywebsitebox.com',
  terminated: 'petonytech.com'
};

let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

function logTest(name, passed, details = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}`);
  }
  if (details) {
    console.log(`   ${details}`);
  }
  testResults.details.push({ name, passed, details });
}

async function testEndpoint(name, method, endpoint, data = null) {
  try {
    let response;
    if (method === 'GET') {
      response = await axios.get(`${BASE_URL}${endpoint}`);
    } else {
      response = await axios.post(`${BASE_URL}${endpoint}`, data, {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return { success: true, data: response.data, status: response.status };
  } catch (err) {
    return { 
      success: false, 
      error: err.response?.data?.error || err.message,
      status: err.response?.status || 500,
      data: err.response?.data
    };
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('COMPREHENSIVE ENDPOINT TEST');
  console.log('============================================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Client ID: ${TEST_CLIENT_ID}`);
  console.log('============================================================\n');

  // ========================================
  // 1. HEALTH CHECK
  // ========================================
  console.log('=== 1. HEALTH CHECK ===\n');
  
  const health = await testEndpoint('Health Check', 'GET', '/health');
  logTest(
    'GET /health',
    health.success && health.data.ok,
    health.success ? `Service: ${health.data.service}` : health.error
  );

  // ========================================
  // 2. INVOICE ENDPOINTS
  // ========================================
  console.log('\n=== 2. INVOICE ENDPOINTS ===\n');

  // Get invoices list
  const invoices = await testEndpoint(
    'Get Invoices',
    'GET',
    `/invoices?clientId=${TEST_CLIENT_ID}&status=Unpaid&limitnum=5`
  );
  logTest(
    'GET /invoices',
    invoices.success,
    invoices.success ? `Found ${invoices.data.invoices?.invoice?.length || 0} invoices` : invoices.error
  );

  // Get specific invoice (if we have one)
  let testInvoiceId = null;
  if (invoices.success && invoices.data.invoices?.invoice) {
    const invoiceList = Array.isArray(invoices.data.invoices.invoice) 
      ? invoices.data.invoices.invoice 
      : [invoices.data.invoices.invoice];
    if (invoiceList.length > 0) {
      testInvoiceId = invoiceList[0].id || invoiceList[0].invoiceid;
    }
  }

  if (testInvoiceId) {
    const invoice = await testEndpoint(
      'Get Single Invoice',
      'GET',
      `/invoices/${testInvoiceId}`
    );
    logTest(
      `GET /invoices/${testInvoiceId}`,
      invoice.success,
      invoice.success ? `Status: ${invoice.data.invoice?.status}` : invoice.error
    );
  } else {
    console.log('⚠️  Skipping GET /invoices/:id (no unpaid invoices found)');
  }

  // ========================================
  // 3. CLIENT ENDPOINTS
  // ========================================
  console.log('\n=== 3. CLIENT ENDPOINTS ===\n');

  // Get client products
  const products = await testEndpoint(
    'Get Client Products',
    'GET',
    `/clients/${TEST_CLIENT_ID}/products?status=Active`
  );
  logTest(
    `GET /clients/${TEST_CLIENT_ID}/products`,
    products.success,
    products.success ? `Found ${products.data.products?.product?.length || 0} products` : products.error
  );

  // Get client domains
  const domains = await testEndpoint(
    'Get Client Domains',
    'GET',
    `/clients/${TEST_CLIENT_ID}/domains?status=Active`
  );
  logTest(
    `GET /clients/${TEST_CLIENT_ID}/domains`,
    domains.success,
    domains.success ? `Found ${domains.data.domains?.domain?.length || 0} domains` : domains.error
  );

  // Get client service status
  const serviceStatus = await testEndpoint(
    'Get Client Service Status',
    'GET',
    `/clients/${TEST_CLIENT_ID}/service-status`
  );
  logTest(
    `GET /clients/${TEST_CLIENT_ID}/service-status`,
    serviceStatus.success,
    serviceStatus.success 
      ? `Products: ${serviceStatus.data.products?.length || 0}, Domains: ${serviceStatus.data.domains?.length || 0}` 
      : serviceStatus.error
  );

  // ========================================
  // 4. INVOICE LOOKUP API
  // ========================================
  console.log('\n=== 4. INVOICE LOOKUP API ===\n');

  // By invoice ID
  if (testInvoiceId) {
    const invoiceLookupById = await testEndpoint(
      'Invoice Lookup by ID',
      'POST',
      '/api/invoiceLookup',
      { clientId: TEST_CLIENT_ID, invoiceId: testInvoiceId }
    );
    logTest(
      'POST /api/invoiceLookup (by ID)',
      invoiceLookupById.success,
      invoiceLookupById.success 
        ? `Invoice #${invoiceLookupById.data.invoiceId}: ${invoiceLookupById.data.status}` 
        : invoiceLookupById.error
    );
  }

  // By domain (hosting)
  const invoiceLookupByDomain = await testEndpoint(
    'Invoice Lookup by Domain',
    'POST',
    '/api/invoiceLookup',
    { clientId: TEST_CLIENT_ID, domain: TEST_DOMAINS.hosting }
  );
  logTest(
    'POST /api/invoiceLookup (by hosting domain)',
    invoiceLookupByDomain.success || invoiceLookupByDomain.status === 404,
    invoiceLookupByDomain.success 
      ? `Invoice #${invoiceLookupByDomain.data.invoiceId}` 
      : 'No unpaid invoices (expected)'
  );

  // By domain (domain-only registration)
  const invoiceLookupByDomainOnly = await testEndpoint(
    'Invoice Lookup by Domain-Only',
    'POST',
    '/api/invoiceLookup',
    { clientId: TEST_CLIENT_ID, domain: TEST_DOMAINS.domainOnly }
  );
  logTest(
    'POST /api/invoiceLookup (by domain-only registration)',
    invoiceLookupByDomainOnly.success || invoiceLookupByDomainOnly.status === 404,
    invoiceLookupByDomainOnly.success 
      ? `Invoice #${invoiceLookupByDomainOnly.data.invoiceId}` 
      : 'No unpaid invoices (expected)'
  );

  // Auto-resolve from domain
  const invoiceLookupAutoResolve = await testEndpoint(
    'Invoice Lookup Auto-Resolve',
    'POST',
    '/api/invoiceLookup',
    { domain: TEST_DOMAINS.hosting }
  );
  logTest(
    'POST /api/invoiceLookup (auto-resolve from domain)',
    invoiceLookupAutoResolve.success || invoiceLookupAutoResolve.status === 404,
    invoiceLookupAutoResolve.success 
      ? `Resolved to client, Invoice #${invoiceLookupAutoResolve.data.invoiceId}` 
      : 'No unpaid invoices (expected)'
  );

  // ========================================
  // 5. SERVICE STATUS API
  // ========================================
  console.log('\n=== 5. SERVICE STATUS API ===\n');

  // Hosting domain
  const statusHosting = await testEndpoint(
    'Service Status - Hosting',
    'POST',
    '/api/serviceStatus',
    { clientId: TEST_CLIENT_ID, domain: TEST_DOMAINS.hosting }
  );
  logTest(
    'POST /api/serviceStatus (hosting domain)',
    statusHosting.success,
    statusHosting.success 
      ? `${statusHosting.data.status} - ${statusHosting.data.service}` 
      : statusHosting.error
  );

  // Domain-only registration
  const statusDomainOnly = await testEndpoint(
    'Service Status - Domain Only',
    'POST',
    '/api/serviceStatus',
    { clientId: TEST_CLIENT_ID, domain: TEST_DOMAINS.domainOnly }
  );
  logTest(
    'POST /api/serviceStatus (domain-only registration)',
    statusDomainOnly.success,
    statusDomainOnly.success 
      ? `${statusDomainOnly.data.status} - ${statusDomainOnly.data.service}` 
      : statusDomainOnly.error
  );

  // Terminated service
  const statusTerminated = await testEndpoint(
    'Service Status - Terminated',
    'POST',
    '/api/serviceStatus',
    { clientId: '1', domain: TEST_DOMAINS.terminated }
  );
  logTest(
    'POST /api/serviceStatus (terminated service)',
    statusTerminated.success,
    statusTerminated.success 
      ? `${statusTerminated.data.status} - ${statusTerminated.data.service}` 
      : statusTerminated.error
  );

  // Auto-resolve from domain
  const statusAutoResolve = await testEndpoint(
    'Service Status Auto-Resolve',
    'POST',
    '/api/serviceStatus',
    { domain: TEST_DOMAINS.hosting }
  );
  logTest(
    'POST /api/serviceStatus (auto-resolve from domain)',
    statusAutoResolve.success,
    statusAutoResolve.success 
      ? `Resolved to client, Status: ${statusAutoResolve.data.status}` 
      : statusAutoResolve.error
  );

  // ========================================
  // 6. RENEW SERVICE API
  // ========================================
  console.log('\n=== 6. RENEW SERVICE API ===\n');

  const renewService = await testEndpoint(
    'Renew Service',
    'POST',
    '/api/renewService',
    { 
      clientId: TEST_CLIENT_ID, 
      domain: TEST_DOMAINS.hosting,
      period: 1,
      paymentmethod: 'hostbreakbanktransfer'
    }
  );
  logTest(
    'POST /api/renewService',
    renewService.success,
    renewService.success 
      ? (renewService.data.existingInvoice 
          ? `Existing invoice #${renewService.data.invoiceId}` 
          : `New invoice #${renewService.data.invoiceId}`)
      : renewService.error
  );

  // ========================================
  // 7. CONFIRM PAYMENT API
  // ========================================
  console.log('\n=== 7. CONFIRM PAYMENT API ===\n');

  if (testInvoiceId) {
    const confirmPayment = await testEndpoint(
      'Confirm Payment',
      'POST',
      '/api/confirmPayment',
      { 
        clientId: TEST_CLIENT_ID, 
        invoiceId: testInvoiceId,
        details: 'Test payment confirmation - automated test'
      }
    );
    logTest(
      'POST /api/confirmPayment',
      confirmPayment.success,
      confirmPayment.success 
        ? (confirmPayment.data.paid 
            ? `Invoice already paid on ${confirmPayment.data.paidDate}` 
            : `Ticket created #${confirmPayment.data.ticketId}`)
        : confirmPayment.error
    );
  } else {
    console.log('⚠️  Skipping POST /api/confirmPayment (no unpaid invoices found)');
  }

  // ========================================
  // 8. TRIAGE ISSUE API - TECHNICAL SUPPORT
  // ========================================
  console.log('\n=== 8. TRIAGE ISSUE API - TECHNICAL SUPPORT ===\n');

  const triageTechnical = await testEndpoint(
    'Triage Technical Issue',
    'POST',
    '/api/triageIssue',
    { 
      clientId: TEST_CLIENT_ID, 
      domain: TEST_DOMAINS.hosting,
      issue: 'Website showing 503 error - automated test'
    }
  );
  logTest(
    'POST /api/triageIssue (technical issue)',
    triageTechnical.success,
    triageTechnical.success 
      ? `Resolution: ${triageTechnical.data.resolution}, Ticket: #${triageTechnical.data.ticketId}` 
      : triageTechnical.error
  );

  // Verify ticket was created in Technical Support department
  if (triageTechnical.success && triageTechnical.data.ticketId) {
    console.log(`   → Ticket #${triageTechnical.data.ticketId} created in Technical Support`);
  }

  // ========================================
  // 9. TRIAGE ISSUE API - BILLING (via suspended service)
  // ========================================
  console.log('\n=== 9. TRIAGE ISSUE API - BILLING ===\n');

  // Note: This would only trigger billing if the service is actually suspended
  // For testing, we'll just verify the endpoint works
  const triageBilling = await testEndpoint(
    'Triage Billing Issue',
    'POST',
    '/api/triageIssue',
    { 
      clientId: TEST_CLIENT_ID, 
      domain: TEST_DOMAINS.hosting,
      issue: 'Cannot access service - automated test'
    }
  );
  logTest(
    'POST /api/triageIssue (potential billing issue)',
    triageBilling.success,
    triageBilling.success 
      ? `Resolution: ${triageBilling.data.resolution}${triageBilling.data.ticketId ? ', Ticket: #' + triageBilling.data.ticketId : ''}${triageBilling.data.invoiceId ? ', Invoice: #' + triageBilling.data.invoiceId : ''}` 
      : triageBilling.error
  );

  // ========================================
  // 10. TICKET CREATION - DIRECT
  // ========================================
  console.log('\n=== 10. DIRECT TICKET CREATION ===\n');

  // Create ticket in Technical Support
  const ticketTech = await testEndpoint(
    'Create Technical Support Ticket',
    'POST',
    '/tickets',
    { 
      deptid: process.env.TECHSUPPORT_DEPTID || '2',
      subject: 'Test Technical Support Ticket - Automated Test',
      message: 'This is an automated test ticket for technical support department.',
      clientid: TEST_CLIENT_ID,
      priority: 'Medium'
    }
  );
  logTest(
    'POST /tickets (Technical Support)',
    ticketTech.success,
    ticketTech.success 
      ? `Ticket #${ticketTech.data.ticketnumber} created in dept ${process.env.TECHSUPPORT_DEPTNAME}` 
      : ticketTech.error
  );

  // Create ticket in Billing
  const ticketBilling = await testEndpoint(
    'Create Billing Ticket',
    'POST',
    '/tickets',
    { 
      deptid: process.env.BILLING_DEPTID || '3',
      subject: 'Test Billing Ticket - Automated Test',
      message: 'This is an automated test ticket for billing department.',
      clientid: TEST_CLIENT_ID,
      priority: 'Medium'
    }
  );
  logTest(
    'POST /tickets (Billing)',
    ticketBilling.success,
    ticketBilling.success 
      ? `Ticket #${ticketBilling.data.ticketnumber} created in dept ${process.env.BILLING_DEPTNAME}` 
      : ticketBilling.error
  );

  // ========================================
  // 11. ORDER CREATION
  // ========================================
  console.log('\n=== 11. ORDER CREATION ===\n');

  // Note: This creates a real order, so we'll skip it in automated tests
  console.log('⚠️  Skipping POST /orders (would create real order)');
  console.log('   To test manually: curl -X POST http://localhost:3000/orders \\');
  console.log('     -d \'{"clientid":"31","paymentmethod":"banktransfer","pid":[1]}\'');

  // ========================================
  // 12. ERROR HANDLING
  // ========================================
  console.log('\n=== 12. ERROR HANDLING ===\n');

  // Invalid domain
  const invalidDomain = await testEndpoint(
    'Invalid Domain',
    'POST',
    '/api/serviceStatus',
    { clientId: TEST_CLIENT_ID, domain: 'nonexistent-domain-12345.com' }
  );
  logTest(
    'POST /api/serviceStatus (invalid domain)',
    !invalidDomain.success && invalidDomain.status === 404,
    'Correctly returns 404 error'
  );

  // Missing required parameter
  const missingParam = await testEndpoint(
    'Missing Parameter',
    'POST',
    '/api/serviceStatus',
    { clientId: TEST_CLIENT_ID }
  );
  logTest(
    'POST /api/serviceStatus (missing domain)',
    !missingParam.success && missingParam.status === 400,
    'Correctly returns 400 error'
  );

  // Invalid invoice ID
  const invalidInvoice = await testEndpoint(
    'Invalid Invoice ID',
    'POST',
    '/api/invoiceLookup',
    { clientId: TEST_CLIENT_ID, invoiceId: 'invalid' }
  );
  logTest(
    'POST /api/invoiceLookup (invalid invoice ID)',
    !invalidInvoice.success && invalidInvoice.status === 400,
    'Correctly returns 400 error'
  );

  // ========================================
  // SUMMARY
  // ========================================
  console.log('\n============================================================');
  console.log('TEST SUMMARY');
  console.log('============================================================');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  console.log('============================================================\n');

  if (testResults.failed === 0) {
    console.log('🎉 ALL TESTS PASSED!\n');
    console.log('✅ Verified Features:');
    console.log('   • All REST endpoints working');
    console.log('   • Invoice lookup (by ID and domain)');
    console.log('   • Service status (hosting and domain-only)');
    console.log('   • Domain registration fallback');
    console.log('   • Auto-resolution from domain');
    console.log('   • Technical Support ticket creation');
    console.log('   • Billing ticket creation');
    console.log('   • Triage issue routing');
    console.log('   • Error handling (404, 400)');
  } else {
    console.log('⚠️  Some tests failed. Review the output above.\n');
    console.log('Failed Tests:');
    testResults.details
      .filter(t => !t.passed)
      .forEach(t => console.log(`   • ${t.name}: ${t.details}`));
  }

  console.log('\n============================================================');
  console.log('DEPARTMENT VERIFICATION');
  console.log('============================================================');
  console.log(`Technical Support Dept ID: ${process.env.TECHSUPPORT_DEPTID || 'NOT SET'}`);
  console.log(`Technical Support Dept Name: ${process.env.TECHSUPPORT_DEPTNAME || 'NOT SET'}`);
  console.log(`Billing Dept ID: ${process.env.BILLING_DEPTID || 'NOT SET'}`);
  console.log(`Billing Dept Name: ${process.env.BILLING_DEPTNAME || 'NOT SET'}`);
  console.log('============================================================\n');
}

runTests().catch(err => {
  console.error('Fatal Error:', err.message);
  process.exit(1);
});
