#!/usr/bin/env node

/**
 * Debug CSF Response Script
 * Tests the actual CSF API response for a blocked IP
 */

require('dotenv').config();
const CSFService = require('./src/services/csfService');

async function debugCSFResponse() {
  console.log('🔍 Debug CSF Response for Blocked IP');
  console.log('====================================');
  
  const ip = '65.21.229.29'; // Your manually blocked IP
  const server = 'pcp3';
  
  try {
    const csfService = new CSFService();
    
    console.log(`→ Testing IP: ${ip}`);
    console.log(`→ Server: ${server}`);
    console.log('');
    
    // Get raw debug response
    const debugResult = await csfService.debugCSFResponse(ip, server);
    
    if (debugResult.success) {
      console.log('✅ CSF API Response Retrieved:');
      console.log(`   Status Code: ${debugResult.statusCode}`);
      console.log(`   Response Length: ${debugResult.responseLength} characters`);
      console.log(`   Contains IP: ${debugResult.containsIP}`);
      console.log('');
      
      console.log('📄 Raw CSF Response:');
      console.log('-------------------');
      console.log(debugResult.rawResponse);
      console.log('-------------------');
      console.log('');
      
      // Now test the parsing
      console.log('🔧 Testing CSF Response Parsing:');
      const parseResult = csfService.parseCSFResponse(debugResult.rawResponse, ip);
      console.log('   Parsed Result:', JSON.stringify(parseResult, null, 2));
      
    } else {
      console.error('❌ Failed to get CSF response:', debugResult.error);
    }
    
  } catch (error) {
    console.error('💥 Debug script failed:', error.message);
    console.error('   Make sure you have:');
    console.error('   - Valid WHM_API_KEY_PCP3 in your .env file');
    console.error('   - Network access to pcp3.mywebsitebox.com:2087');
    console.error('   - CSF installed on the server');
  }
}

// Run the debug
debugCSFResponse().then(() => {
  console.log('🏁 Debug complete');
}).catch(error => {
  console.error('💥 Debug failed:', error.message);
  process.exit(1);
});