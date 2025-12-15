#!/usr/bin/env node

/**
 * Test the service status endpoint with ping integration
 */

require('dotenv').config();
const axios = require('axios');

async function testServiceStatusWithPing() {
  console.log('🧪 Testing service status endpoint with ping integration');
  
  const domain = 'gamitixstudios.com';
  const clientId = '1'; // Test client ID
  
  try {
    console.log(`\n🎯 Testing service status for domain: ${domain}`);
    
    const response = await axios.post('http://localhost:3000/api/serviceStatus', {
      clientId: clientId,
      domain: domain
    });
    
    console.log('\n📊 Service Status Response:');
    console.log(`  Success: ${response.data.success ? '✅' : '❌'}`);
    
    if (response.data.success) {
      console.log(`  Status: ${response.data.status}`);
      
      if (response.data.dnsZoneAnalysis) {
        const dns = response.data.dnsZoneAnalysis;
        console.log(`\n🔍 DNS Analysis:`);
        console.log(`  Domain: ${dns.domain}`);
        console.log(`  Expected IP: ${dns.expectedServerIP}`);
        console.log(`  Data Source: ${dns.dataSource}`);
        console.log(`  DNS Consistent: ${dns.dnsConsistent ? '✅' : '❌'}`);
        console.log(`  Issue: ${dns.issue || 'None'}`);
        console.log(`  Recommendation: ${dns.recommendation}`);
      }
      
      if (response.data.pingAnalysis) {
        const ping = response.data.pingAnalysis;
        console.log(`\n🏓 Ping Analysis:`);
        console.log(`  Domain: ${ping.domain}`);
        console.log(`  Overall Status: ${ping.overall.status}`);
        console.log(`  Reachable: ${ping.overall.reachable ? '✅' : '❌'}`);
        console.log(`  Summary: ${ping.overall.summary}`);
        
        if (ping.tests) {
          if (ping.tests.ping) {
            console.log(`  Ping Test: ${ping.tests.ping.alive ? '✅' : '❌'} (${ping.tests.ping.responseTime || 'N/A'}ms)`);
          }
          if (ping.tests.http) {
            console.log(`  HTTP Test: ${ping.tests.http.reachable ? '✅' : '❌'} (${ping.tests.http.statusCode || 'N/A'})`);
          }
          if (ping.tests.https) {
            console.log(`  HTTPS Test: ${ping.tests.https.reachable ? '✅' : '❌'} (${ping.tests.https.statusCode || 'N/A'})`);
          }
        }
        
        if (ping.workflow) {
          console.log(`\n🔄 Workflow Recommendation:`);
          console.log(`  Recommended: ${ping.workflow.recommendedWorkflow}`);
          console.log(`  Priority: ${ping.workflow.priority}`);
          console.log(`  Reasoning: ${ping.workflow.reasoning}`);
        }
      }
      
      if (response.data.message) {
        console.log(`\n💬 Message: ${response.data.message}`);
      }
      
    } else {
      console.log(`  Error: ${response.data.error}`);
    }
    
  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.data);
    } else {
      console.error('❌ Request Error:', error.message);
    }
  }
}

// Run the test
testServiceStatusWithPing().then(() => {
  console.log('\n🏁 Service status with ping test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});