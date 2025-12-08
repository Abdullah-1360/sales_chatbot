/**
 * Direct WHMCS API test for ticket creation
 * Tests what parameters WHMCS actually accepts
 */

require('dotenv').config();
const axios = require('axios');

const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_API_SECRET;

async function testWHMCSTicket(params) {
  const url = WHMCS_URL;
  const payload = new URLSearchParams({
    action: 'OpenTicket',
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET,
    ...params
  });

  try {
    const { data } = await axios.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('🧪 Testing WHMCS OpenTicket API directly\n');
  
  console.log('='.repeat(80));
  console.log('TEST 1: Create ticket with deptid');
  console.log('='.repeat(80));
  await testWHMCSTicket({
    clientid: '29097',
    deptid: '2',
    subject: 'Direct WHMCS Test - DeptId',
    message: 'Testing with deptid parameter',
    priority: 'Medium'
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Create ticket with deptname');
  console.log('='.repeat(80));
  await testWHMCSTicket({
    clientid: '29097',
    deptname: 'Support',
    subject: 'Direct WHMCS Test - DeptName',
    message: 'Testing with deptname parameter',
    priority: 'Medium'
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: Create ticket with both deptid and deptname');
  console.log('='.repeat(80));
  await testWHMCSTicket({
    clientid: '29097',
    deptid: '2',
    deptname: 'Support',
    subject: 'Direct WHMCS Test - Both',
    message: 'Testing with both parameters',
    priority: 'Medium'
  });
}

runTests();
