/**
 * Simple focused test for ticket creation
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

const TEST_CLIENT_ID = '29097';
const TEST_DOMAIN = 'test123.com';
const TEST_EMAIL = 'abdullahshahid906@gmail.com';

console.log('🎫 Simple Ticket Creation Tests\n');

async function test(name, fn) {
  process.stdout.write(`${name}... `);
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`✅ PASS (${duration}ms)`);
    if (result) {
      console.log(`   Result:`, JSON.stringify(result, null, 2));
    }
    return true;
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`❌ FAIL (${duration}ms)`);
    console.log(`   Error:`, error.response?.data || error.message);
    return false;
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;
  
  console.log('='.repeat(80));
  console.log('TEST 1: Create ticket with deptid (Support)');
  console.log('='.repeat(80));
  
  if (await test('Create ticket with deptid=2', async () => {
    const { data } = await axios.post(`${API_URL}/tickets`, {
      clientid: TEST_CLIENT_ID,
      deptid: '2',
      subject: 'Test Ticket - Using DeptId',
      message: 'This is a test ticket created with deptid parameter.',
      priority: 'Medium'
    });
    return data;
  })) {
    passed++;
  } else {
    failed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Create ticket with deptname (Support)');
  console.log('='.repeat(80));
  
  if (await test('Create ticket with deptname=Support', async () => {
    const { data } = await axios.post(`${API_URL}/tickets`, {
      clientid: TEST_CLIENT_ID,
      deptname: 'Support',
      subject: 'Test Ticket - Using DeptName',
      message: 'This is a test ticket created with deptname parameter.',
      priority: 'High'
    });
    return data;
  })) {
    passed++;
  } else {
    failed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: Create ticket with deptname (Billing)');
  console.log('='.repeat(80));
  
  if (await test('Create ticket with deptname=Billing', async () => {
    const { data } = await axios.post(`${API_URL}/tickets`, {
      clientid: TEST_CLIENT_ID,
      deptname: 'Billing',
      subject: 'Test Ticket - Billing Department',
      message: 'This is a test ticket for billing department.',
      priority: 'Low'
    });
    return data;
  })) {
    passed++;
  } else {
    failed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: Create guest ticket with name and email');
  console.log('='.repeat(80));
  
  if (await test('Create guest ticket', async () => {
    const { data } = await axios.post(`${API_URL}/tickets`, {
      name: 'Test Guest User',
      email: TEST_EMAIL,
      deptid: '2',
      subject: 'Test Guest Ticket',
      message: 'This is a guest ticket without clientid.',
      priority: 'Medium'
    });
    return data;
  })) {
    passed++;
  } else {
    failed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST 5: Create ticket via triageIssue');
  console.log('='.repeat(80));
  
  if (await test('Create tech support ticket via triageIssue', async () => {
    const { data } = await axios.post(`${API_URL}/triageIssue`, {
      clientId: TEST_CLIENT_ID,
      domain: TEST_DOMAIN,
      issue: 'Website is down. Getting 500 error. Please help urgently!'
    });
    return data;
  })) {
    passed++;
  } else {
    failed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST 6: Create ticket with serviceId (optional - requires valid service)');
  console.log('='.repeat(80));
  
  // First, try to get a valid service for this client
  let validServiceId = null;
  try {
    const { data: services } = await axios.get(`${API_URL}/clients/${TEST_CLIENT_ID}/products`);
    if (services.products && services.products.length > 0) {
      validServiceId = services.products[0].id;
    }
  } catch (e) {
    console.log('   ⚠️  Could not fetch services, skipping serviceId test');
  }
  
  if (validServiceId) {
    if (await test(`Create ticket with serviceId=${validServiceId}`, async () => {
      const { data } = await axios.post(`${API_URL}/tickets`, {
        clientid: TEST_CLIENT_ID,
        deptid: '2',
        subject: 'Test Ticket - With Service Link',
        message: 'This ticket is linked to a specific service.',
        priority: 'High',
        serviceid: validServiceId
      });
      return data;
    })) {
      passed++;
    } else {
      failed++;
    }
  } else {
    console.log('   ⏭️  SKIPPED (no valid service found)');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST 7: Validation - Missing subject');
  console.log('='.repeat(80));
  
  if (await test('Create ticket without subject (should fail)', async () => {
    try {
      await axios.post(`${API_URL}/tickets`, {
        clientid: TEST_CLIENT_ID,
        deptid: '2',
        message: 'No subject provided'
      });
      throw new Error('Should have failed but succeeded');
    } catch (error) {
      if (error.response?.status >= 400) {
        return { expected: 'failure', got: 'failure' };
      }
      throw error;
    }
  })) {
    passed++;
  } else {
    failed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST 8: Validation - Invalid department');
  console.log('='.repeat(80));
  
  if (await test('Create ticket with invalid department (should fail)', async () => {
    try {
      await axios.post(`${API_URL}/tickets`, {
        clientid: TEST_CLIENT_ID,
        deptname: 'InvalidDepartmentName',
        subject: 'Test Invalid Dept',
        message: 'This should fail'
      });
      throw new Error('Should have failed but succeeded');
    } catch (error) {
      if (error.response?.status >= 400) {
        return { expected: 'failure', got: 'failure' };
      }
      throw error;
    }
  })) {
    passed++;
  } else {
    failed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total: ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(80));
  
  return failed === 0;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
  });
