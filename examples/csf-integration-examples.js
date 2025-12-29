/**
 * CSF (ConfigServer Security & Firewall) Integration Examples
 * 
 * This file demonstrates how to use the enhanced whitelist-ip endpoint
 * with CSF firewall analysis and management capabilities.
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

/**
 * Example 1: Basic IP whitelisting with CSF analysis
 * This example shows how the enhanced endpoint now includes CSF firewall analysis
 */
async function basicWhitelistWithCSFAnalysis() {
  console.log('\n=== Example 1: Basic IP Whitelisting with CSF Analysis ===');
  
  try {
    console.log('Whitelisting IP with automatic CSF analysis...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip`, {
      ip: '203.0.113.10',
      domain: 'example.com',
      email: 'admin@example.com',
      reason: 'Client requested access restoration'
    });
    
    console.log('✅ Whitelist Response:', {
      success: response.data.success,
      message: response.data.message,
      whitelisted: response.data.whitelisted,
      clearedFailedLogins: response.data.clearedFailedLogins
    });
    
    // Check CSF analysis results
    if (response.data.csfAnalysis) {
      console.log('🔍 CSF Firewall Analysis:');
      console.log(`   - IP found in CSF rules: ${response.data.csfAnalysis.csf.found}`);
      console.log(`   - In CSF allow list: ${response.data.csfAnalysis.csf.inAllowList}`);
      console.log(`   - In CSF deny list: ${response.data.csfAnalysis.csf.inDenyList}`);
      console.log(`   - Risk level: ${response.data.csfAnalysis.riskLevel}`);
      
      if (response.data.csfAnalysis.recommendations.length > 0) {
        console.log('   - Recommendations:');
        response.data.csfAnalysis.recommendations.forEach((rec, index) => {
          console.log(`     ${index + 1}. [${rec.type.toUpperCase()}] ${rec.message}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Basic whitelist with CSF analysis failed:', error.response?.data || error.message);
  }
}

/**
 * Example 2: Whitelist IP with automatic CSF unblocking
 * This example shows how to automatically unblock an IP from CSF deny list
 */
async function whitelistWithCSFUnblock() {
  console.log('\n=== Example 2: Whitelist IP with CSF Unblocking ===');
  
  try {
    console.log('Whitelisting IP with automatic CSF unblocking...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip?unblockCSF=true`, {
      ip: '203.0.113.20',
      domain: 'example.com',
      email: 'admin@example.com',
      reason: 'False positive - legitimate client'
    });
    
    console.log('✅ Whitelist Response:', {
      success: response.data.success,
      message: response.data.message,
      whitelisted: response.data.whitelisted
    });
    
    // Check if CSF unblock was attempted
    if (response.data.csfAnalysis?.unblockAttempt) {
      console.log('🔓 CSF Unblock Attempt:');
      console.log(`   - Success: ${response.data.csfAnalysis.unblockAttempt.success}`);
      console.log(`   - Message: ${response.data.csfAnalysis.unblockAttempt.message}`);
    }
    
  } catch (error) {
    console.error('❌ Whitelist with CSF unblock failed:', error.response?.data || error.message);
  }
}

/**
 * Example 3: Whitelist IP with CSF allow list addition
 * This example shows how to add an IP to CSF allow list during whitelisting
 */
async function whitelistWithCSFAllow() {
  console.log('\n=== Example 3: Whitelist IP with CSF Allow List Addition ===');
  
  try {
    console.log('Whitelisting IP and adding to CSF allow list...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip?addToCSFAllow=true`, {
      ip: '203.0.113.30',
      domain: 'example.com',
      email: 'admin@example.com',
      reason: 'Trusted client - permanent access'
    });
    
    console.log('✅ Whitelist Response:', {
      success: response.data.success,
      message: response.data.message,
      whitelisted: response.data.whitelisted
    });
    
    // Check if CSF allow was attempted
    if (response.data.csfAnalysis?.allowAttempt) {
      console.log('✅ CSF Allow List Addition:');
      console.log(`   - Success: ${response.data.csfAnalysis.allowAttempt.success}`);
      console.log(`   - Message: ${response.data.csfAnalysis.allowAttempt.message}`);
      console.log(`   - Comment: ${response.data.csfAnalysis.allowAttempt.comment}`);
    }
    
  } catch (error) {
    console.error('❌ Whitelist with CSF allow failed:', error.response?.data || error.message);
  }
}

/**
 * Example 4: Comprehensive IP management (unblock + whitelist + allow)
 * This example shows the full workflow for problematic IPs
 */
async function comprehensiveIPManagement() {
  console.log('\n=== Example 4: Comprehensive IP Management ===');
  
  try {
    console.log('Executing comprehensive IP management workflow...');
    
    const response = await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip?unblockCSF=true&addToCSFAllow=true&debug=true`, {
      ip: '203.0.113.40',
      domain: 'example.com',
      email: 'admin@example.com',
      reason: 'VIP client - full access restoration'
    });
    
    console.log('✅ Comprehensive Management Response:');
    console.log(`   - cPHulk whitelisted: ${response.data.whitelisted}`);
    console.log(`   - Failed logins cleared: ${response.data.clearedFailedLogins}`);
    
    if (response.data.csfAnalysis) {
      console.log('🔍 CSF Analysis Results:');
      console.log(`   - Original status: ${response.data.csfAnalysis.csf.summary}`);
      console.log(`   - Risk level: ${response.data.csfAnalysis.riskLevel}`);
      
      if (response.data.csfAnalysis.unblockAttempt) {
        console.log(`   - CSF unblock: ${response.data.csfAnalysis.unblockAttempt.success ? 'SUCCESS' : 'FAILED'}`);
      }
      
      if (response.data.csfAnalysis.allowAttempt) {
        console.log(`   - CSF allow: ${response.data.csfAnalysis.allowAttempt.success ? 'SUCCESS' : 'FAILED'}`);
      }
    }
    
    console.log('📋 Workflow Summary:');
    console.log('   1. ✅ Analyzed IP in CSF firewall');
    console.log('   2. ✅ Removed IP from CSF deny list (if blocked)');
    console.log('   3. ✅ Added IP to CSF allow list');
    console.log('   4. ✅ Whitelisted IP in cPHulk');
    console.log('   5. ✅ Cleared failed login records');
    
  } catch (error) {
    console.error('❌ Comprehensive IP management failed:', error.response?.data || error.message);
  }
}

/**
 * Example 5: Direct CSF service usage
 * This example shows how to use the CSF service directly
 * Note: Server name is required and should come from credential resolution
 */
async function directCSFServiceUsage() {
  console.log('\n=== Example 5: Direct CSF Service Usage ===');
  
  try {
    // Note: This requires direct access to the CSF service
    const CSFService = require('../src/services/csfService');
    const csfService = new CSFService();
    
    const testIP = '203.0.113.50';
    const serverName = 'pcp3'; // This should come from credential resolution in real usage
    
    console.log(`Analyzing IP ${testIP} with CSF service on server ${serverName}...`);
    
    // Step 1: Analyze IP
    const analysis = await csfService.analyzeIP(testIP, serverName);
    console.log('🔍 CSF Analysis:', {
      success: analysis.success,
      found: analysis.csf?.found,
      inAllowList: analysis.csf?.inAllowList,
      inDenyList: analysis.csf?.inDenyList,
      riskLevel: analysis.riskLevel
    });
    
    // Step 2: Add to allow list if not already there
    if (analysis.success && !analysis.csf.inAllowList) {
      console.log(`Adding IP ${testIP} to CSF allow list on ${serverName}...`);
      const allowResult = await csfService.allowIP(testIP, serverName, 'Direct API test');
      console.log('✅ CSF Allow Result:', {
        success: allowResult.success,
        message: allowResult.message
      });
    }
    
  } catch (error) {
    console.error('❌ Direct CSF service usage failed:', error.message);
    console.log('💡 Note: This example requires the CSF service to be properly configured');
    console.log('💡 Server name must be provided and match your WHM API key configuration');
  }
}

/**
 * Example 6: Error handling and troubleshooting
 * This example shows how to handle various error scenarios
 */
async function errorHandlingExample() {
  console.log('\n=== Example 6: Error Handling and Troubleshooting ===');
  
  try {
    console.log('Testing error scenarios...');
    
    // Test with invalid IP
    try {
      await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip`, {
        ip: 'invalid-ip',
        domain: 'example.com',
        email: 'admin@example.com'
      });
    } catch (error) {
      console.log('✅ Invalid IP error handled correctly:', error.response?.data?.error);
    }
    
    // Test with missing domain credentials
    try {
      await axios.post(`${API_BASE_URL}/cphulk/whitelist-ip`, {
        ip: '203.0.113.60',
        domain: 'nonexistent-domain.com',
        email: 'admin@nonexistent-domain.com'
      });
    } catch (error) {
      console.log('✅ Domain not found error handled correctly:', error.response?.data?.error);
    }
    
    console.log('🔧 Troubleshooting Tips:');
    console.log('   - Ensure WHM API keys are configured for all servers');
    console.log('   - Verify CSF is installed and accessible on target servers');
    console.log('   - Check network connectivity to WHM servers on port 2087');
    console.log('   - Use debug=true parameter for detailed error information');
    
  } catch (error) {
    console.error('❌ Error handling example failed:', error.message);
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🚀 CSF Integration Examples');
  console.log('===========================');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  await basicWhitelistWithCSFAnalysis();
  await whitelistWithCSFUnblock();
  await whitelistWithCSFAllow();
  await comprehensiveIPManagement();
  await directCSFServiceUsage();
  await errorHandlingExample();
  
  console.log('\n🏁 All CSF Integration Examples Complete');
  console.log('\n📚 API Documentation:');
  console.log('   POST /cphulk/whitelist-ip');
  console.log('   Query Parameters:');
  console.log('     - unblockCSF=true    : Automatically unblock IP from CSF deny list');
  console.log('     - addToCSFAllow=true : Add IP to CSF allow list');
  console.log('     - debug=true         : Include detailed debug information');
  console.log('   Body Parameters:');
  console.log('     - ip (required)      : IP address to whitelist');
  console.log('     - domain (optional)  : Domain for client identification');
  console.log('     - email (optional)   : Client email for verification');
  console.log('     - phone (optional)   : Client phone for verification');
  console.log('     - reason (optional)  : Reason for whitelisting');
}

// Export functions for use in other modules
module.exports = {
  basicWhitelistWithCSFAnalysis,
  whitelistWithCSFUnblock,
  whitelistWithCSFAllow,
  comprehensiveIPManagement,
  directCSFServiceUsage,
  errorHandlingExample,
  runAllExamples
};

// Run examples if this script is executed directly
if (require.main === module) {
  runAllExamples().catch(error => {
    console.error('💥 Examples failed:', error.message);
    process.exit(1);
  });
}