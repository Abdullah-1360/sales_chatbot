/**
 * Test serviceStatus endpoint with issue parameter
 * When billingIssue is false, a support ticket should be created
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_EMAIL = 'abdullahshahid906@gmail.com';
const TEST_DOMAIN = 'example.com'; // Replace with actual test domain

console.log('🧪 Testing Service Status with Issue Parameter\n');
console.log('='.repeat(80));

async function testServiceStatusWithIssue() {
  try {
    console.log('\n📝 Test Configuration:');
    console.log('   Email:', TEST_EMAIL);
    console.log('   Domain:', TEST_DOMAIN);
    console.log('   Issue: Website is loading slowly');
    
    console.log('\n📤 Checking service status with issue...');
    
    const { data } = await axios.post(`${BASE_URL}/serviceStatus`, {
      email: TEST_EMAIL,
      domain: TEST_DOMAIN,
      issue: 'My website is loading very slowly. Pages take 10-15 seconds to load. This started happening yesterday.'
    });
    
    console.log('\n✅ Response:');
    console.log('   Success:', data.success);
    console.log('   Status:', data.status);
    console.log('   Service:', data.service);
    console.log('   Billing Issue:', data.billingIssue);
    console.log('   Ticket Created:', data.ticketCreated);
    console.log('   Ticket ID:', data.ticketId);
    console.log('   Message:', data.message);
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 EXPECTED BEHAVIOR');
    console.log('='.repeat(80));
    
    console.log('\n✅ When billingIssue is FALSE:');
    console.log('   - Support ticket should be created automatically');
    console.log('   - Ticket should contain service details');
    console.log('   - Ticket should contain issue description');
    console.log('   - Response should include ticketId');
    
    console.log('\n⚠️  When billingIssue is TRUE:');
    console.log('   - No support ticket created (billing issue, not technical)');
    console.log('   - User should pay invoice instead');
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 VERIFICATION IN WHMCS');
    console.log('='.repeat(80));
    
    if (data.ticketCreated && data.ticketId) {
      console.log('\n1. Log into WHMCS Admin: https://portal.hostbreak.com');
      console.log('\n2. Go to Support > Tickets');
      console.log('\n3. Open ticket #' + data.ticketId);
      
      console.log('\n4. Verify SUBJECT:');
      console.log('   ✅ "Issue with ' + (data.service || TEST_DOMAIN) + '"');
      
      console.log('\n5. Verify MESSAGE contains:');
      console.log('   ✅ Service: ' + (data.service || TEST_DOMAIN));
      console.log('   ✅ Status: ' + data.status);
      console.log('   ✅ Domain: ' + TEST_DOMAIN);
      console.log('   ✅ Issue Description: Website is loading slowly...');
      
      console.log('\n6. Verify DEPARTMENT:');
      console.log('   ✅ Technical Support (not Billing)');
      
      console.log('\n7. Verify PRIORITY:');
      console.log('   ✅ High');
    } else {
      console.log('\n⚠️  No ticket was created');
      console.log('   Possible reasons:');
      console.log('   - billingIssue is true (payment issue, not technical)');
      console.log('   - Service not found');
      console.log('   - Error creating ticket');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\n   Service Status: ' + data.status);
    console.log('   Billing Issue: ' + (data.billingIssue ? 'YES (payment needed)' : 'NO (technical issue)'));
    console.log('   Ticket Created: ' + (data.ticketCreated ? 'YES ✅' : 'NO ❌'));
    if (data.ticketId) {
      console.log('   Ticket ID: #' + data.ticketId);
    }
    console.log('   Status: ' + (data.ticketCreated ? 'Support ticket opened' : 'No ticket created'));
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      console.log('\n⚠️  Service not found');
      console.log('   Please update TEST_DOMAIN in the test file with a valid domain');
    }
    
    throw error;
  }
}

// Test 2: Service with billing issue (should NOT create ticket)
async function testServiceStatusWithBillingIssue() {
  console.log('\n\n' + '='.repeat(80));
  console.log('\n🧪 TEST 2: Service with Billing Issue (Should NOT Create Ticket)');
  console.log('='.repeat(80));
  
  try {
    console.log('\n📝 Test Configuration:');
    console.log('   Email:', TEST_EMAIL);
    console.log('   Domain:', TEST_DOMAIN);
    console.log('   Issue: Website is down');
    console.log('   Expected: If service is suspended due to billing, NO ticket should be created');
    
    console.log('\n📤 Checking service status...');
    
    const { data } = await axios.post(`${BASE_URL}/serviceStatus`, {
      email: TEST_EMAIL,
      domain: TEST_DOMAIN,
      issue: 'My website is down and not accessible.'
    });
    
    console.log('\n✅ Response:');
    console.log('   Success:', data.success);
    console.log('   Status:', data.status);
    console.log('   Billing Issue:', data.billingIssue);
    console.log('   Ticket Created:', data.ticketCreated);
    
    if (data.billingIssue) {
      console.log('\n✅ CORRECT BEHAVIOR:');
      console.log('   - billingIssue is TRUE');
      console.log('   - No support ticket created (payment issue)');
      console.log('   - User should pay invoice: #' + (data.invoiceId || 'N/A'));
      console.log('   - Amount due: ' + (data.amountDue || 'N/A'));
    } else {
      console.log('\n✅ Service is Active:');
      console.log('   - billingIssue is FALSE');
      console.log('   - Support ticket created: ' + (data.ticketCreated ? 'YES' : 'NO'));
      if (data.ticketId) {
        console.log('   - Ticket ID: #' + data.ticketId);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
  }
}

async function runTests() {
  try {
    await testServiceStatusWithIssue();
    await testServiceStatusWithBillingIssue();
    
    console.log('\n\n' + '='.repeat(80));
    console.log('\n✅ All tests completed');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Tests failed');
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  });
