#!/usr/bin/env node

/**
 * MySQL Host Addition Example
 * 
 * This example demonstrates the new MySQL host addition functionality
 * that resolves the 17-second timeout issue in WordPress diagnose endpoint.
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Example 1: Basic WordPress Diagnose with Automatic Host Addition
 */
async function basicDiagnoseWithHostAddition() {
  try {
    console.log('=== Example 1: Basic WordPress Diagnose with Host Addition ===');
    console.log('Making request to WordPress diagnose endpoint...');
    console.log('The system will automatically:');
    console.log('1. Use your local development IP (115.186.130.67)');
    console.log('2. Add it to MySQL remote access hosts');
    console.log('3. Test the MySQL connection');
    console.log('4. Schedule cleanup after 5 minutes\n');
    
    const startTime = Date.now();
    
    const response = await axios.post(`${API_BASE_URL}/wordpress/diagnose`, {
      domain: 'example.com',
      email: 'client@example.com'
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`✓ Request completed in ${duration}ms`);
    console.log('\n=== MySQL Host Management Results ===');
    
    const hostMgmt = response.data.data?.workflow?.stepC1_mysqlHostManagement;
    if (hostMgmt) {
      console.log(`Local Development IP: ${hostMgmt.localIP}`);
      console.log(`Host Addition: ${hostMgmt.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`Action Taken: ${hostMgmt.hostManagement?.action}`);
      console.log(`Cleanup Scheduled: ${hostMgmt.cleanupScheduled ? 'YES' : 'NO'}`);
      
      if (hostMgmt.success) {
        console.log('✓ Your local development IP (115.186.130.67) has been added to MySQL remote access hosts');
        console.log('✓ MySQL connection should now work without timeout');
      }
    }
    
    return response.data;
    
  } catch (error) {
    console.error('Example 1 failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 2: Demonstrate the cPanel API Call
 */
async function demonstrateCpanelAPICall() {
  console.log('\n=== Example 2: cPanel API Call Details ===');
  console.log('The system makes this cPanel API call to add your IP:');
  console.log('');
  console.log('URL: https://pcp3.mywebsitebox.com:2087/json-api/cpanel');
  console.log('Method: POST');
  console.log('Content-Type: application/x-www-form-urlencoded');
  console.log('');
  console.log('Parameters:');
  console.log('  api.version=1');
  console.log('  cpanel_jsonapi_user=x98aailqrs');
  console.log('  cpanel_jsonapi_apiversion=3');
  console.log('  cpanel_jsonapi_module=Mysql');
  console.log('  cpanel_jsonapi_func=add_host');
  console.log('  host=115.186.130.67  # Your detected IP');
  console.log('');
  console.log('This is the exact API call mentioned in your original issue.');
}

/**
 * Example 3: Test with Phone Number Authentication
 */
async function testWithPhoneAuth() {
  try {
    console.log('\n=== Example 3: WordPress Diagnose with Phone Authentication ===');
    console.log('Testing with phone number instead of email...\n');
    
    const response = await axios.post(`${API_BASE_URL}/wordpress/diagnose`, {
      domain: 'example.com',
      phone: '+1234567890'
    });
    
    console.log('✓ Phone authentication successful');
    
    const hostMgmt = response.data.data?.workflow?.stepC1_mysqlHostManagement;
    if (hostMgmt?.success) {
      console.log(`✓ Host addition successful for local IP: ${hostMgmt.localIP}`);
    }
    
    return response.data;
    
  } catch (error) {
    if (error.response?.status === 400 && error.response?.data?.registeredPhone) {
      console.log('Phone verification failed - using registered number format');
      console.log(`Registered phone: ${error.response.data.registeredPhone}`);
    } else {
      console.error('Example 3 failed:', error.response?.data || error.message);
    }
    return null;
  }
}

/**
 * Example 4: Monitor Performance Improvement
 */
async function monitorPerformanceImprovement() {
  console.log('\n=== Example 4: Performance Monitoring ===');
  console.log('Comparing performance before and after the fix...\n');
  
  const tests = [];
  
  // Run multiple tests to get average performance
  for (let i = 1; i <= 3; i++) {
    try {
      console.log(`Running test ${i}/3...`);
      const startTime = Date.now();
      
      const response = await axios.post(`${API_BASE_URL}/wordpress/diagnose`, {
        domain: 'example.com',
        email: 'client@example.com'
      });
      
      const duration = Date.now() - startTime;
      tests.push({
        test: i,
        duration: duration,
        success: response.data.success,
        hostAddition: response.data.data?.workflow?.stepC1_mysqlHostManagement?.success
      });
      
      console.log(`  Test ${i}: ${duration}ms - ${response.data.success ? 'SUCCESS' : 'FAILED'}`);
      
    } catch (error) {
      tests.push({
        test: i,
        duration: null,
        success: false,
        error: error.message
      });
      console.log(`  Test ${i}: FAILED - ${error.message}`);
    }
  }
  
  // Calculate statistics
  const successfulTests = tests.filter(t => t.success && t.duration);
  if (successfulTests.length > 0) {
    const avgDuration = successfulTests.reduce((sum, t) => sum + t.duration, 0) / successfulTests.length;
    const minDuration = Math.min(...successfulTests.map(t => t.duration));
    const maxDuration = Math.max(...successfulTests.map(t => t.duration));
    
    console.log('\n=== Performance Results ===');
    console.log(`Average Duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`Min Duration: ${minDuration}ms`);
    console.log(`Max Duration: ${maxDuration}ms`);
    console.log(`Success Rate: ${successfulTests.length}/${tests.length}`);
    
    if (avgDuration < 17000) {
      console.log('✓ Performance improved - average under 17 seconds');
    } else {
      console.log('⚠ Performance still needs improvement');
    }
  }
  
  return tests;
}

/**
 * Main execution function
 */
async function main() {
  console.log('MySQL Host Addition Examples');
  console.log('============================\n');
  
  try {
    // Example 1: Basic functionality
    await basicDiagnoseWithHostAddition();
    
    // Example 2: Show API details
    await demonstrateCpanelAPICall();
    
    // Example 3: Phone authentication
    await testWithPhoneAuth();
    
    // Example 4: Performance monitoring
    await monitorPerformanceImprovement();
    
    console.log('\n=== Examples Complete ===');
    console.log('The MySQL host addition feature should resolve the 17-second timeout');
    console.log('by automatically adding your local development IP (115.186.130.67) to MySQL remote access hosts.');
    
  } catch (error) {
    console.error('\nExamples failed:', error.message);
    process.exit(1);
  }
}

// Export functions for use in other scripts
module.exports = {
  basicDiagnoseWithHostAddition,
  demonstrateCpanelAPICall,
  testWithPhoneAuth,
  monitorPerformanceImprovement
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}