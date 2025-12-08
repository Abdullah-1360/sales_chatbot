/**
 * Test cases for ticket creation endpoints
 * Tests both direct ticket creation and automated ticket creation (confirmPayment, triageIssue)
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

// Test data - update these with valid values from your WHMCS
const TEST_DATA = {
  clientId: process.env.TEST_CLIENT_ID || '29097',
  email: process.env.TEST_EMAIL || 'abdullahshahid906@gmail.com',
  domain: process.env.TEST_DOMAIN || 'test123.com',
  invoiceId: process.env.TEST_INVOICE_ID || '130901',
  techDeptId: process.env.TECHSUPPORT_DEPTID,
  techDeptName: process.env.TECHSUPPORT_DEPTNAME || 'Technical Support',
  billingDeptId: process.env.BILLING_DEPTID,
  billingDeptName: process.env.BILLING_DEPTNAME || 'Billing'
};

console.log('🧪 Testing Ticket Creation Endpoints\n');
console.log('Configuration:', {
  baseUrl: BASE_URL,
  clientId: TEST_DATA.clientId,
  email: TEST_DATA.email,
  domain: TEST_DATA.domain
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
 * Test Suite
 */
async function runTests() {
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  // TEST 1: Create ticket with clientId and deptid
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: Create Ticket with ClientId and DeptId');
  console.log('='.repeat(80));
  
  const test1 = await testEndpoint(
    'Create ticket with clientId and deptid',
    'POST',
    `${API_URL}/tickets`,
    {
      clientid: TEST_DATA.clientId,
      deptid: TEST_DATA.techDeptId,
      subject: 'Test Ticket - ClientId + DeptId',
      message: 'This is a test ticket created with clientId and deptid parameters.',
      priority: 'Medium'
    }
  );
  results.tests.push(test1);
  test1.success ? results.passed++ : results.failed++;
  
  // TEST 2: Create ticket with clientId and deptname
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Create Ticket with ClientId and DeptName');
  console.log('='.repeat(80));
  
  const test2 = await testEndpoint(
    'Create ticket with clientId and deptname',
    'POST',
    `${API_URL}/tickets`,
    {
      clientid: TEST_DATA.clientId,
      deptname: TEST_DATA.techDeptName,
      subject: 'Test Ticket - ClientId + DeptName',
      message: 'This is a test ticket created with clientId and deptname parameters.',
      priority: 'High'
    }
  );
  results.tests.push(test2);
  test2.success ? results.passed++ : results.failed++;
  
  // TEST 3: Create ticket with name and email (guest ticket)
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: Create Guest Ticket with Name and Email');
  console.log('='.repeat(80));
  
  const test3 = await testEndpoint(
    'Create guest ticket with name and email',
    'POST',
    `${API_URL}/tickets`,
    {
      name: 'Test User',
      email: TEST_DATA.email,
      deptname: TEST_DATA.techDeptName,
      subject: 'Test Guest Ticket - Name + Email',
      message: 'This is a test guest ticket created without clientId.',
      priority: 'Low'
    }
  );
  results.tests.push(test3);
  test3.success ? results.passed++ : results.failed++;
  
  // TEST 4: Create ticket with serviceId
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: Create Ticket with ServiceId');
  console.log('='.repeat(80));
  
  const test4 = await testEndpoint(
    'Create ticket with serviceId',
    'POST',
    `${API_URL}/tickets`,
    {
      clientid: TEST_DATA.clientId,
      deptname: TEST_DATA.techDeptName,
      subject: 'Test Ticket - With ServiceId',
      message: 'This ticket is linked to a specific service.',
      priority: 'High',
      serviceid: '19032' // Update with valid service ID
    }
  );
  results.tests.push(test4);
  test4.success ? results.passed++ : results.failed++;
  
  // TEST 5: Create billing ticket via confirmPayment
  console.log('\n' + '='.repeat(80));
  console.log('TEST 5: Create Billing Ticket via confirmPayment');
  console.log('='.repeat(80));
  
  const test5 = await testEndpoint(
    'Create billing ticket via confirmPayment',
    'POST',
    `${API_URL}/confirmPayment`,
    {
      clientId: TEST_DATA.clientId,
      invoiceId: TEST_DATA.invoiceId,
      details: 'I have made the payment via bank transfer. Transaction ID: TEST123456'
    }
  );
  results.tests.push(test5);
  test5.success ? results.passed++ : results.failed++;
  
  // TEST 6: Create tech support ticket via triageIssue
  console.log('\n' + '='.repeat(80));
  console.log('TEST 6: Create Tech Support Ticket via triageIssue');
  console.log('='.repeat(80));
  
  const test6 = await testEndpoint(
    'Create tech support ticket via triageIssue',
    'POST',
    `${API_URL}/triageIssue`,
    {
      clientId: TEST_DATA.clientId,
      domain: TEST_DATA.domain,
      issue: 'My website is showing a 500 Internal Server Error. I cannot access the admin panel and need urgent help.'
    }
  );
  results.tests.push(test6);
  test6.success ? results.passed++ : results.failed++;
  
  // TEST 7: Missing required fields
  console.log('\n' + '='.repeat(80));
  console.log('TEST 7: Validation - Missing Required Fields');
  console.log('='.repeat(80));
  
  const test7 = await testEndpoint(
    'Create ticket without subject (should fail)',
    'POST',
    `${API_URL}/tickets`,
    {
      clientid: TEST_DATA.clientId,
      deptname: TEST_DATA.techDeptName,
      message: 'This ticket has no subject'
    }
  );
  results.tests.push(test7);
  // This should fail, so we count it as passed if it fails
  !test7.success ? results.passed++ : results.failed++;
  
  // TEST 8: Invalid department
  console.log('\n' + '='.repeat(80));
  console.log('TEST 8: Validation - Invalid Department');
  console.log('='.repeat(80));
  
  const test8 = await testEndpoint(
    'Create ticket with invalid department (should fail)',
    'POST',
    `${API_URL}/tickets`,
    {
      clientid: TEST_DATA.clientId,
      deptname: 'NonExistentDepartment',
      subject: 'Test Invalid Department',
      message: 'This should fail due to invalid department'
    }
  );
  results.tests.push(test8);
  // This should fail, so we count it as passed if it fails
  !test8.success ? results.passed++ : results.failed++;
  
  // TEST 9: Different priority levels
  console.log('\n' + '='.repeat(80));
  console.log('TEST 9: Create Tickets with Different Priority Levels');
  console.log('='.repeat(80));
  
  const priorities = ['Low', 'Medium', 'High'];
  for (const priority of priorities) {
    const test = await testEndpoint(
      `Create ticket with ${priority} priority`,
      'POST',
      `${API_URL}/tickets`,
      {
        clientid: TEST_DATA.clientId,
        deptname: TEST_DATA.techDeptName,
        subject: `Test Ticket - ${priority} Priority`,
        message: `This is a ${priority} priority test ticket.`,
        priority: priority
      }
    );
    results.tests.push(test);
    test.success ? results.passed++ : results.failed++;
  }
  
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
