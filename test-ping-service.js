#!/usr/bin/env node

/**
 * Test the ping service functionality
 */

require('dotenv').config();
const { pingDomain, comprehensiveConnectivityTest, determineWorkflowFromPing } = require('./src/utils/pingService');

async function testPingService() {
  console.log('🧪 Testing ping service functionality');
  
  const domain = 'gamitixstudios.com';
  
  try {
    console.log(`\n🏓 Testing basic ping for ${domain}...`);
    
    // Test 1: Basic ping
    const pingResult = await pingDomain(domain);
    
    console.log('\n📊 Basic Ping Result:');
    console.log(`  Domain: ${pingResult.domain}`);
    console.log(`  Alive: ${pingResult.alive ? '✅' : '❌'}`);
    console.log(`  Status: ${pingResult.status}`);
    console.log(`  Resolved IP: ${pingResult.resolvedIP || 'N/A'}`);
    console.log(`  Response Time: ${pingResult.responseTime || 'N/A'}ms`);
    console.log(`  Avg Response Time: ${pingResult.avgResponseTime || 'N/A'}ms`);
    console.log(`  Packet Loss: ${pingResult.packetLoss}`);
    
    // Test 2: Comprehensive connectivity test
    console.log(`\n🔍 Testing comprehensive connectivity for ${domain}...`);
    
    const connectivityResult = await comprehensiveConnectivityTest(domain, {
      ping: { timeout: 5 },
      includeHTTP: true,
      includeHTTPS: true,
      http: { timeout: 5000 },
      https: { timeout: 5000 }
    });
    
    console.log('\n📊 Comprehensive Connectivity Result:');
    console.log(`  Domain: ${connectivityResult.domain}`);
    console.log(`  Overall Status: ${connectivityResult.overall.status}`);
    console.log(`  Reachable: ${connectivityResult.overall.reachable ? '✅' : '❌'}`);
    console.log(`  Summary: ${connectivityResult.overall.summary}`);
    
    if (connectivityResult.tests.ping) {
      console.log(`\n  🏓 Ping Test:`);
      console.log(`    Alive: ${connectivityResult.tests.ping.alive ? '✅' : '❌'}`);
      console.log(`    Response Time: ${connectivityResult.tests.ping.responseTime || 'N/A'}ms`);
    }
    
    if (connectivityResult.tests.http) {
      console.log(`\n  🌐 HTTP Test:`);
      console.log(`    Reachable: ${connectivityResult.tests.http.reachable ? '✅' : '❌'}`);
      console.log(`    Status Code: ${connectivityResult.tests.http.statusCode || 'N/A'}`);
      console.log(`    Response Time: ${connectivityResult.tests.http.responseTime || 'N/A'}ms`);
    }
    
    if (connectivityResult.tests.https) {
      console.log(`\n  🔒 HTTPS Test:`);
      console.log(`    Reachable: ${connectivityResult.tests.https.reachable ? '✅' : '❌'}`);
      console.log(`    Status Code: ${connectivityResult.tests.https.statusCode || 'N/A'}`);
      console.log(`    Response Time: ${connectivityResult.tests.https.responseTime || 'N/A'}ms`);
      console.log(`    SSL Valid: ${connectivityResult.tests.https.ssl?.valid ? '✅' : '❌'}`);
    }
    
    if (connectivityResult.overall.issues.length > 0) {
      console.log(`\n  ⚠️ Issues:`);
      connectivityResult.overall.issues.forEach(issue => {
        console.log(`    - ${issue}`);
      });
    }
    
    if (connectivityResult.overall.recommendations.length > 0) {
      console.log(`\n  💡 Recommendations:`);
      connectivityResult.overall.recommendations.forEach(rec => {
        console.log(`    - ${rec}`);
      });
    }
    
    // Test 3: Workflow determination
    console.log(`\n🔄 Testing workflow determination...`);
    
    const workflow = determineWorkflowFromPing(connectivityResult);
    
    console.log('\n📋 Workflow Recommendation:');
    console.log(`  Recommended Workflow: ${workflow.recommendedWorkflow}`);
    console.log(`  Priority: ${workflow.priority}`);
    console.log(`  Reasoning: ${workflow.reasoning}`);
    console.log(`  Actions:`);
    workflow.actions.forEach(action => {
      console.log(`    - ${action}`);
    });
    
    console.log('\n✅ Ping service test completed successfully!');
    
  } catch (error) {
    console.error('❌ Ping service test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testPingService().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});