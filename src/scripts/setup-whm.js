/**
 * WHM Setup Script
 * Helps configure and test WHM integration
 */

require('dotenv').config();
const whmService = require('../services/whmService');

console.log('\n' + '='.repeat(80));
console.log('🔧 WHM INTEGRATION SETUP');
console.log('='.repeat(80));

async function checkConfiguration() {
  console.log('\n📋 Configuration Check:');
  console.log('-'.repeat(80));
  
  const config = {
    'WHM_URL': process.env.WHM_URL,
    'WHM_USERNAME': process.env.WHM_USERNAME,
    'WHM_API_TOKEN': process.env.WHM_API_TOKEN ? '***SET***' : 'NOT SET',
    'WHM_PASSWORD': process.env.WHM_PASSWORD ? '***SET***' : 'NOT SET',
    'WHM_VERIFY_SSL': process.env.WHM_VERIFY_SSL || 'true'
  };
  
  let allSet = true;
  
  Object.entries(config).forEach(([key, value]) => {
    const status = value ? '✅' : '❌';
    console.log(`  ${status} ${key}: ${value || 'NOT SET'}`);
    if (!value && key !== 'WHM_PASSWORD') allSet = false;
  });
  
  if (!process.env.WHM_API_TOKEN && !process.env.WHM_PASSWORD) {
    console.log('\n❌ Either WHM_API_TOKEN or WHM_PASSWORD must be set');
    allSet = false;
  }
  
  console.log(`\n📊 Configuration Status: ${allSet ? '✅ Complete' : '❌ Incomplete'}`);
  
  if (!allSet) {
    console.log('\n💡 Required Environment Variables:');
    console.log('  WHM_URL=https://your-server.com:2087');
    console.log('  WHM_USERNAME=root');
    console.log('  WHM_API_TOKEN=your_api_token_here');
    console.log('  # OR');
    console.log('  WHM_PASSWORD=your_password_here');
    console.log('  WHM_VERIFY_SSL=true');
  }
  
  return allSet;
}

async function testConnection() {
  console.log('\n🔌 Connection Test:');
  console.log('-'.repeat(80));
  
  try {
    const isConnected = await whmService.testConnection();
    
    if (isConnected) {
      console.log('✅ WHM connection successful!');
      
      try {
        const version = await whmService.getVersion();
        console.log(`📊 WHM Version: ${version}`);
      } catch (err) {
        console.log('⚠️  Could not get version:', err.message);
      }
      
      return true;
    } else {
      console.log('❌ WHM connection failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Connection test error:', error.message);
    return false;
  }
}

async function testBasicFunctions() {
  console.log('\n🧪 Basic Function Tests:');
  console.log('-'.repeat(80));
  
  const tests = [
    {
      name: 'List Packages',
      test: async () => {
        const packages = await whmService.listPackages();
        console.log(`  ✅ Found ${packages.length} hosting packages`);
        return packages.length > 0;
      }
    },
    {
      name: 'Server Load',
      test: async () => {
        const load = await whmService.getLoadAverage();
        console.log('  ✅ Server load retrieved');
        return !!load;
      }
    },
    {
      name: 'System Info',
      test: async () => {
        const info = await whmService.getSystemInfo();
        console.log('  ✅ System info retrieved');
        return !!info;
      }
    }
  ];
  
  let passed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.test();
      if (result) passed++;
    } catch (error) {
      console.log(`  ❌ ${test.name} failed: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Basic Tests: ${passed}/${tests.length} passed`);
  return passed === tests.length;
}

async function suggestNextSteps() {
  console.log('\n🎯 Next Steps:');
  console.log('-'.repeat(80));
  
  console.log('1. 🧪 Run full test suite:');
  console.log('   node src/test/test-whm-integration.js');
  
  console.log('\n2. 🔗 Test API endpoints:');
  console.log('   curl http://localhost:3000/whm/test');
  console.log('   curl http://localhost:3000/whm/server/status');
  
  console.log('\n3. 🔄 Integrate with existing endpoints:');
  console.log('   - Enhance /api/serviceStatus with WHM data');
  console.log('   - Add auto-sync between WHMCS and WHM');
  
  console.log('\n4. 🔒 Security checklist:');
  console.log('   - Use API tokens instead of passwords');
  console.log('   - Enable SSL verification in production');
  console.log('   - Restrict WHM API access by IP');
  
  console.log('\n5. 📊 Monitoring:');
  console.log('   - Add WHM health checks');
  console.log('   - Set up status sync monitoring');
  console.log('   - Configure alerting for failures');
}

async function main() {
  try {
    // Step 1: Check configuration
    const configOk = await checkConfiguration();
    
    if (!configOk) {
      console.log('\n❌ Configuration incomplete. Please set required environment variables.');
      return;
    }
    
    // Step 2: Test connection
    const connectionOk = await testConnection();
    
    if (!connectionOk) {
      console.log('\n❌ Connection failed. Please check your WHM configuration.');
      console.log('\n🔧 Troubleshooting:');
      console.log('  - Verify WHM_URL is correct (usually port 2087)');
      console.log('  - Check WHM_USERNAME and credentials');
      console.log('  - Ensure WHM API access is enabled');
      console.log('  - Check firewall settings');
      console.log('  - Try WHM_VERIFY_SSL=false for testing');
      return;
    }
    
    // Step 3: Test basic functions
    const functionsOk = await testBasicFunctions();
    
    // Step 4: Summary and next steps
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 SETUP SUMMARY');
    console.log('='.repeat(80));
    
    if (configOk && connectionOk && functionsOk) {
      console.log('🎉 WHM integration is ready!');
      console.log('✅ Configuration complete');
      console.log('✅ Connection successful');
      console.log('✅ Basic functions working');
    } else {
      console.log('⚠️  WHM integration needs attention:');
      console.log(`  Configuration: ${configOk ? '✅' : '❌'}`);
      console.log(`  Connection: ${connectionOk ? '✅' : '❌'}`);
      console.log(`  Functions: ${functionsOk ? '✅' : '❌'}`);
    }
    
    await suggestNextSteps();
    
    console.log('='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run setup
main().catch(console.error);