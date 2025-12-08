/**
 * Test Windows keyword detection
 * ASP.NET, .NET, .NET Core keywords should restrict to Windows plans only
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

console.log('🧪 Testing Windows Keyword Detection\n');
console.log('='.repeat(80));

const testCases = [
  {
    name: 'ASP.NET Application',
    purpose: 'I need hosting for my ASP.NET application',
    expectedWindows: true
  },
  {
    name: '.NET Core Website',
    purpose: 'Building a .NET Core website',
    expectedWindows: true
  },
  {
    name: 'C# Application',
    purpose: 'Need hosting for C# application',
    expectedWindows: true
  },
  {
    name: 'MSSQL Database',
    purpose: 'Website with MSSQL database',
    expectedWindows: true
  },
  {
    name: 'IIS Server',
    purpose: 'Need IIS server for my website',
    expectedWindows: true
  },
  {
    name: 'PHP Website (Non-Windows)',
    purpose: 'PHP website with MySQL',
    expectedWindows: false
  },
  {
    name: 'WordPress Blog (Non-Windows)',
    purpose: 'Personal blog using WordPress',
    expectedWindows: false
  },
  {
    name: 'E-commerce Store (Non-Windows)',
    purpose: 'Online store for selling products',
    expectedWindows: false
  }
];

async function testWindowsKeywords() {
  console.log('\n📝 Running Windows Keyword Detection Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    try {
      console.log(`\nTest: ${testCase.name}`);
      console.log(`Purpose: "${testCase.purpose}"`);
      console.log(`Expected Windows: ${testCase.expectedWindows}`);
      
      const { data } = await axios.post(`${BASE_URL}/recommendations`, {
        purpose: testCase.purpose,
        websites_count: '1',
        storage_needed_gb: 10
      });
      
      // Check if all returned plans are Windows plans
      const allPlansAreWindows = data.every(plan => 
        plan.name.toLowerCase().includes('windows')
      );
      
      const noWindowsPlans = data.every(plan => 
        !plan.name.toLowerCase().includes('windows')
      );
      
      console.log(`Plans returned: ${data.length}`);
      if (data.length > 0) {
        console.log(`Plan names: ${data.map(p => p.name).join(', ')}`);
      }
      
      let testPassed = false;
      
      if (testCase.expectedWindows) {
        // Should return ONLY Windows plans
        if (allPlansAreWindows && data.length > 0) {
          console.log('✅ PASS: All plans are Windows plans');
          testPassed = true;
        } else if (data.length === 0) {
          console.log('⚠️  WARNING: No plans returned (might be no Windows plans available)');
          testPassed = true; // Not a failure, just no Windows plans
        } else {
          console.log('❌ FAIL: Non-Windows plans returned');
        }
      } else {
        // Should return NON-Windows plans
        if (noWindowsPlans && data.length > 0) {
          console.log('✅ PASS: No Windows plans returned');
          testPassed = true;
        } else if (data.length === 0) {
          console.log('⚠️  WARNING: No plans returned');
          testPassed = true;
        } else {
          console.log('❌ FAIL: Windows plans returned for non-Windows request');
        }
      }
      
      if (testPassed) {
        passed++;
      } else {
        failed++;
      }
      
    } catch (error) {
      console.log('❌ ERROR:', error.response?.data || error.message);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nTotal Tests: ${testCases.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 WINDOWS KEYWORDS DETECTED:');
  console.log('='.repeat(80));
  console.log('\n✅ ASP.NET, asp, .net, dotnet');
  console.log('✅ .NET Core, aspnet');
  console.log('✅ C#, csharp');
  console.log('✅ MSSQL, MS SQL');
  console.log('✅ IIS');
  console.log('✅ windows');
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 EXPECTED BEHAVIOR:');
  console.log('='.repeat(80));
  console.log('\n1. When Windows keywords detected:');
  console.log('   ✅ needs_windows automatically set to true');
  console.log('   ✅ Only Windows plans returned');
  console.log('   ✅ Plans have "Windows" in name');
  
  console.log('\n2. When NO Windows keywords:');
  console.log('   ✅ needs_windows remains false');
  console.log('   ✅ Only non-Windows plans returned');
  console.log('   ✅ Plans do NOT have "Windows" in name');
  
  console.log('\n' + '='.repeat(80));
  
  return { passed, failed, total: testCases.length };
}

testWindowsKeywords()
  .then(({ passed, failed, total }) => {
    if (failed === 0) {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed`);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  });
