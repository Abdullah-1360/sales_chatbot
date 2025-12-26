/**
 * cPHulk Management API Usage Examples
 * 
 * This file demonstrates how to use the cPHulk management endpoints
 * for checking failed logins and whitelisting IP addresses.
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = 'http://localhost:3000'; // Adjust to your server URL

/**
 * Example 1: Check failed login attempts for an IP address
 * This example shows how to check failed login attempts without domain validation
 */
async function checkFailedLoginsBasic() {
  try {
    console.log('=== Example 1: Basic Failed Login Check ===');
    console.log('Checking failed login attempts for IP address...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/check-failed-logins`, {
      ip: '115.186.130.67'
    });
    
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 2: Check failed login attempts with domain and client validation
 * This example shows how to check failed logins with client verification
 */
async function checkFailedLoginsWithValidation() {
  try {
    console.log('\n=== Example 2: Failed Login Check with Client Validation ===');
    console.log('Checking failed login attempts with domain and client validation...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/check-failed-logins`, {
      ip: '115.186.130.67',
      domain: 'example.com',
      email: 'client@example.com' // Client identification
    });
    
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 3: Check failed login attempts using phone number for client identification
 */
async function checkFailedLoginsWithPhone() {
  try {
    console.log('\n=== Example 3: Failed Login Check with Phone Verification ===');
    console.log('Checking failed login attempts using phone number for client identification...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/check-failed-logins`, {
      ip: '115.186.130.67',
      domain: 'example.com',
      phone: '+1234567890' // Alternative client identification
    });
    
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 4: Whitelist an IP address (basic)
 * This example shows how to whitelist an IP without domain validation
 */
async function whitelistIPBasic() {
  try {
    console.log('\n=== Example 4: Basic IP Whitelisting ===');
    console.log('Whitelisting IP address...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip`, {
      ip: '115.186.130.67',
      reason: 'Client requested via API'
    });
    
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 5: Intelligent IP whitelisting workflow (cpaneld)
 * This example shows the intelligent workflow for cpaneld authentication failures
 * All IPs are whitelisted for 24 hours with automatic removal
 */
async function intelligentWhitelistCpaneld() {
  try {
    console.log('\n=== Example 5: Intelligent Whitelisting - cpaneld Workflow (24hrs) ===');
    console.log('Executing intelligent whitelisting for cpaneld authentication failures...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip`, {
      ip: '115.186.130.67',
      domain: 'example.com',
      email: 'client@example.com',
      reason: 'Legitimate client access from office IP'
    });
    
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 6: Intelligent IP whitelisting workflow (webmaild/dovecot)
 * This example shows the intelligent workflow for mail service authentication failures
 * All IPs are whitelisted for 24 hours with automatic removal
 */
async function intelligentWhitelistMailServices() {
  try {
    console.log('\n=== Example 6: Intelligent Whitelisting - Mail Services Workflow (24hrs) ===');
    console.log('Executing intelligent whitelisting for webmaild/dovecot authentication failures...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip`, {
      ip: '115.186.130.67',
      domain: 'example.com',
      email: 'client@example.com',
      reason: 'Mail client configuration issues'
    });
    
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 7: Intelligent IP whitelisting workflow (pure-ftpd)
 * This example shows the intelligent workflow for FTP authentication failures
 * All IPs are whitelisted for 24 hours with automatic removal
 */
async function intelligentWhitelistFTP() {
  try {
    console.log('\n=== Example 7: Intelligent Whitelisting - FTP Workflow (24hrs) ===');
    console.log('Executing intelligent whitelisting for pure-ftpd authentication failures...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip`, {
      ip: '115.186.130.67',
      domain: 'example.com',
      email: 'client@example.com',
      reason: 'FTP client synchronization'
    });
    
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 6: Get cPHulk service capabilities
 */
/**
 * Example 8: Get cPHulk service capabilities
 */
async function getCphulkCapabilities() {
  try {
    console.log('\n=== Example 8: Get cPHulk Service Capabilities ===');
    console.log('Retrieving cPHulk service capabilities...');
    
    const response = await axios.get(`${API_BASE_URL}/cphulk/capabilities`);
    
    console.log('✅ Available capabilities:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 9: Health check
 */
async function healthCheck() {
  try {
    console.log('\n=== Example 9: cPHulk Service Health Check ===');
    console.log('Checking cPHulk service health...');
    
    const response = await axios.get(`${API_BASE_URL}/cphulk/health`);
    
    console.log('✅ Service health:', response.data);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 10: Handle service status errors
 * This example shows what happens when a service is expired/terminated/suspended
 */
async function handleServiceStatusErrors() {
  try {
    console.log('\n=== Example 10: Service Status Error Handling ===');
    console.log('Testing with expired/terminated service...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/check-failed-logins`, {
      ip: '115.186.130.67',
      domain: 'expired-domain.com',
      email: 'client@example.com'
    });
    
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    if (error.response?.status === 412) {
      console.log('⚠️  Expected: Service status error (412 Precondition Failed)');
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('❌ Unexpected error:', error.response?.data || error.message);
    }
  }
}

/**
 * Example 11: Handle phone verification errors
 */
async function handlePhoneVerificationErrors() {
  try {
    console.log('\n=== Example 11: Phone Verification Error Handling ===');
    console.log('Testing with incorrect phone number...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/check-failed-logins`, {
      ip: '115.186.130.67',
      domain: 'example.com',
      phone: '+9999999999' // Wrong phone number
    });
    
    console.log('✅ Success:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.registeredPhone) {
      console.log('⚠️  Expected: Phone verification failed');
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('❌ Unexpected error:', error.response?.data || error.message);
    }
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🚀 cPHulk Management API Examples\n');
  
  await checkFailedLoginsBasic();
  await checkFailedLoginsWithValidation();
  await checkFailedLoginsWithPhone();
  await whitelistIPBasic();
  await intelligentWhitelistCpaneld();
  await intelligentWhitelistMailServices();
  await intelligentWhitelistFTP();
  await getCphulkCapabilities();
  await healthCheck();
  await handleServiceStatusErrors();
  await handlePhoneVerificationErrors();
  
  console.log('\n✅ All examples completed!');
}

/**
 * Example API Response Formats
 */
function showExpectedResponses() {
  console.log('\n📋 Expected API Response Formats:\n');
  
  console.log('1. Successful Failed Login Check:');
  console.log(JSON.stringify({
    success: true,
    status: 'SUCCESS',
    message: 'Found 5 failed login attempts for IP 115.186.130.67',
    timestamp: '2025-12-26T16:30:00.000Z',
    ip: '115.186.130.67',
    server: 'pcp3',
    domain: 'example.com',
    client: {
      id: '123',
      email: 'client@example.com',
      name: 'John Doe'
    },
    result: {
      totalAttempts: 5,
      uniqueUsers: 2,
      services: ['ftp', 'ssh'],
      countries: ['Pakistan (PK)', 'India (IN)'],
      timeRange: {
        earliest: '2025-12-26T16:09:39.000Z',
        latest: '2025-12-26T16:10:20.000Z',
        duration: '41 seconds'
      },
      recentFailedLogins: [
        {
          exptime: '2025-12-26 22:10:20',
          user: 'hello@uzairfarooq.pk',
          ip: '115.186.130.67',
          timeleft: '359',
          service: 'ftp',
          country_name: 'Pakistan',
          logintime: '2025-12-26 16:10:20',
          authservice: 'pure-ftpd',
          country_code: 'PK'
        }
      ]
    },
    performance: {
      totalTime: 1250,
      cached: false
    }
  }, null, 2));
  
  console.log('\n2. Successful IP Whitelisting (24-hour temporary):');
  console.log(JSON.stringify({
    success: true,
    status: 'SUCCESS',
    message: 'cpaneld workflow completed: IP flushed, whitelisted (24hrs), removal scheduled, and ticket created',
    timestamp: '2025-12-26T16:30:00.000Z',
    ip: '115.186.130.67',
    server: 'pcp3',
    domain: 'example.com',
    client: {
      id: '123',
      email: 'client@example.com',
      name: 'John Doe'
    },
    result: {
      workflow: 'intelligent_whitelist',
      authServices: ['cpaneld'],
      whitelisted: true,
      flushed: true,
      ticketCreated: true,
      scheduledRemoval: true,
      summary: [
        'Executing cpaneld workflow: flush + whitelist (24hrs) + ticket + schedule removal',
        'Login history flushed successfully',
        'IP whitelisted for 24 hours',
        'IP removal scheduled for 24 hours',
        'Support ticket created with workflow summary'
      ]
    },
    performance: {
      totalTime: 2100,
      cached: false
    }
  }, null, 2));
  
  console.log('\n3. Service Status Error (412):');
  console.log(JSON.stringify({
    success: false,
    status: 'SERVICE_UNAVAILABLE',
    message: 'Your example.com service has expired. Please renew to continue using cPHulk management features.',
    timestamp: '2025-12-26T16:30:00.000Z',
    domain: 'example.com',
    serviceStatus: 'EXPIRED',
    performance: {
      totalTime: 800,
      cached: false
    }
  }, null, 2));
  
  console.log('\n4. Phone Verification Error (400):');
  console.log(JSON.stringify({
    success: false,
    error: 'Phone number verification failed. Please contact us using the registered number: 123*****90',
    registeredPhone: '123*****90'
  }, null, 2));
}

// Export functions for individual testing
module.exports = {
  checkFailedLoginsBasic,
  checkFailedLoginsWithValidation,
  checkFailedLoginsWithPhone,
  whitelistIPBasic,
  intelligentWhitelistCpaneld,
  intelligentWhitelistMailServices,
  intelligentWhitelistFTP,
  getCphulkCapabilities,
  healthCheck,
  handleServiceStatusErrors,
  handlePhoneVerificationErrors,
  runAllExamples,
  showExpectedResponses
};

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('Choose an option:');
  console.log('1. Run all examples: node examples/cphulk-usage-examples.js');
  console.log('2. Show expected responses: Add "responses" argument');
  console.log('');
  
  const arg = process.argv[2];
  if (arg === 'responses') {
    showExpectedResponses();
  } else {
    runAllExamples().catch(console.error);
  }
}