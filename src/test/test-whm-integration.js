/**
 * WHM Integration Test Suite
 * Tests all WHM API endpoints and functionality
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Test configuration
const TEST_CONFIG = {
  domain: process.env.TEST_DOMAIN || 'example.com',
  username: process.env.TEST_WHM_USERNAME || 'testuser',
  clientId: process.env.TEST_CLIENT_ID || '1'
};

console.log('\n' + '='.repeat(80));
console.log('🧪 WHM INTEGRATION TEST SUITE');
console.log('='.repeat(80));

console.log('\n📋 Test Configuration:');
console.log('  Base URL:', BASE_URL);
console.log('  Test Domain:', TEST_CONFIG.domain);
console.log('  Test Username:', TEST_CONFIG.username);
console.log('  Client ID:', TEST_CONFIG.clientId);

/**
 * Test WHM connection
 */
async function testWHMConnection() {
  console.log('\n\n🔧 TEST 1: WHM Connection Test');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.get(`${BASE_URL}/whm/test`);
    
    console.log('✅ SUCCESS - WHM Connection Test');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.connected) {
      console.log('🎉 WHM is connected and working!');
      console.log('📊 WHM Version:', response.data.version);
    } else {
      console.log('⚠️  WHM connection failed');
    }
    
    return response.data.connected;
  } catch (error) {
    console.log('❌ FAILED - WHM Connection Test');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return false;
  }
}

/**
 * Test server status
 */
async function testServerStatus() {
  console.log('\n\n📊 TEST 2: Server Status');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.get(`${BASE_URL}/whm/server/status`);
    
    console.log('✅ SUCCESS - Server Status');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    const server = response.data.server;
    if (server.loadAverage) {
      console.log('📈 Load Average:', server.loadAverage);
    }
    if (server.uptime) {
      console.log('⏰ Uptime:', server.uptime);
    }
    
    return true;
  } catch (error) {
    console.log('❌ FAILED - Server Status');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return false;
  }
}

/**
 * Test hosting packages
 */
async function testHostingPackages() {
  console.log('\n\n📦 TEST 3: Hosting Packages');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.get(`${BASE_URL}/whm/packages`);
    
    console.log('✅ SUCCESS - Hosting Packages');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    const packages = response.data.packages;
    console.log(`📊 Found ${packages.length} hosting packages:`);
    packages.forEach((pkg, index) => {
      console.log(`  ${index + 1}. ${pkg.name} - Disk: ${pkg.diskSpace}, Bandwidth: ${pkg.bandwidth}`);
    });
    
    return true;
  } catch (error) {
    console.log('❌ FAILED - Hosting Packages');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return false;
  }
}

/**
 * Test account lookup by domain
 */
async function testAccountByDomain() {
  console.log('\n\n🔍 TEST 4: Account Lookup by Domain');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/whm/account/domain`, {
      domain: TEST_CONFIG.domain
    });
    
    console.log('✅ SUCCESS - Account Lookup by Domain');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    const account = response.data.account;
    console.log('📊 Account Details:');
    console.log(`  Username: ${account.username}`);
    console.log(`  Domain: ${account.domain}`);
    console.log(`  Status: ${account.suspended ? 'Suspended' : 'Active'}`);
    console.log(`  Package: ${account.package}`);
    console.log(`  Disk Used: ${account.diskUsed}`);
    
    return account;
  } catch (error) {
    console.log('❌ FAILED - Account Lookup by Domain');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return null;
  }
}

/**
 * Test account status
 */
async function testAccountStatus(username) {
  console.log('\n\n📋 TEST 5: Account Status');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/whm/account/status`, {
      username: username || TEST_CONFIG.username
    });
    
    console.log('✅ SUCCESS - Account Status');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    const account = response.data.account;
    console.log('📊 Account Status:');
    console.log(`  Username: ${account.username}`);
    console.log(`  Status: ${account.status}`);
    console.log(`  Suspended: ${account.suspended}`);
    console.log(`  SSL Certificates: ${account.sslCertificates}`);
    console.log(`  Package: ${account.package}`);
    
    return true;
  } catch (error) {
    console.log('❌ FAILED - Account Status');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return false;
  }
}

/**
 * Test account usage
 */
async function testAccountUsage(username) {
  console.log('\n\n📈 TEST 6: Account Usage');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/whm/account/usage`, {
      username: username || TEST_CONFIG.username
    });
    
    console.log('✅ SUCCESS - Account Usage');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.usage) {
      console.log('📊 Usage Statistics Available');
    }
    if (response.data.bandwidth) {
      console.log('📊 Bandwidth Statistics Available');
    }
    
    return true;
  } catch (error) {
    console.log('❌ FAILED - Account Usage');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return false;
  }
}

/**
 * Test WHMCS-WHM sync
 */
async function testServiceSync() {
  console.log('\n\n🔄 TEST 7: WHMCS-WHM Service Sync');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/whm/sync/service`, {
      clientId: TEST_CONFIG.clientId,
      domain: TEST_CONFIG.domain
    });
    
    console.log('✅ SUCCESS - Service Sync');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    const sync = response.data.sync;
    console.log('📊 Sync Results:');
    console.log(`  Domain: ${sync.domain}`);
    console.log(`  WHMCS Status: ${sync.whmcs.status}`);
    console.log(`  WHM Status: ${sync.whm.status}`);
    console.log(`  Status Match: ${sync.statusMatch ? '✅' : '❌'}`);
    
    if (sync.recommendation) {
      console.log(`  Recommendation: ${sync.recommendation}`);
    }
    
    return true;
  } catch (error) {
    console.log('❌ FAILED - Service Sync');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  let passed = 0;
  let failed = 0;
  
  console.log('\n🚀 Starting WHM Integration Tests...');
  
  // Test 1: Connection
  if (await testWHMConnection()) {
    passed++;
  } else {
    failed++;
    console.log('\n⚠️  WHM connection failed. Remaining tests may fail.');
  }
  
  // Test 2: Server Status
  if (await testServerStatus()) passed++; else failed++;
  
  // Test 3: Hosting Packages
  if (await testHostingPackages()) passed++; else failed++;
  
  // Test 4: Account by Domain
  const account = await testAccountByDomain();
  if (account) {
    passed++;
    
    // Test 5: Account Status (using found username)
    if (await testAccountStatus(account.username)) passed++; else failed++;
    
    // Test 6: Account Usage (using found username)
    if (await testAccountUsage(account.username)) passed++; else failed++;
  } else {
    failed += 3; // Failed account lookup affects subsequent tests
  }
  
  // Test 7: Service Sync
  if (await testServiceSync()) passed++; else failed++;
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! WHM integration is working correctly.');
  } else if (passed > 0) {
    console.log('\n⚠️  Some tests failed. Check WHM configuration and connectivity.');
  } else {
    console.log('\n❌ All tests failed. WHM integration is not working.');
  }
  
  console.log('\n💡 Configuration Tips:');
  console.log('  1. Ensure WHM_URL, WHM_USERNAME, and WHM_API_TOKEN are set in .env');
  console.log('  2. Verify WHM server is accessible and API is enabled');
  console.log('  3. Check firewall settings and SSL certificate');
  console.log('  4. Update TEST_DOMAIN and TEST_CLIENT_ID for your environment');
  
  console.log('='.repeat(80) + '\n');
}

// Run tests
runAllTests().catch(console.error);