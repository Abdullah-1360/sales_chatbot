/**
 * Test all WHMCS requirements
 */

require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const axios = require('axios');

async function testAllRequirements() {
  try {
    await connectDB();

    const PORT = 4003;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Test server running on :${PORT}\n`);
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const tests = [
      {
        name: 'WooCommerce → GID 21',
        request: {
          purpose: 'Ecommerce',
          websites_count: '2-3',
          tech_stack: 'Linux',
          cms: 'WooCommerce',
          email_needed: true,
          storage_needed_gb: 5,
          monthly_budget: 15,
          free_domain: true,
          migrate_from_existing_host: false,
          email_deliverability_priority: false
        },
        expectedGID: '21'
      },
      {
        name: 'WordPress → GID 20',
        request: {
          purpose: 'Blog',
          websites_count: '1',
          tech_stack: 'Linux',
          cms: 'WordPress',
          email_needed: true,
          storage_needed_gb: 10,
          monthly_budget: 10,
          free_domain: true,
          migrate_from_existing_host: false,
          email_deliverability_priority: false
        },
        expectedGID: '20'
      },
      {
        name: 'Windows → GID 28',
        request: {
          purpose: 'Other',
          websites_count: '2-3',
          tech_stack: 'Windows',
          cms: 'None',
          email_needed: true,
          storage_needed_gb: 10,
          monthly_budget: 15,
          free_domain: false,
          migrate_from_existing_host: false,
          email_deliverability_priority: false
        },
        expectedGID: '28'
      },
      {
        name: 'Business → GID 25',
        request: {
          purpose: 'Business Site',
          websites_count: '4-10',
          tech_stack: 'Linux',
          cms: 'None',
          email_needed: true,
          storage_needed_gb: 20,
          monthly_budget: 25,
          free_domain: false,
          migrate_from_existing_host: false,
          email_deliverability_priority: true
        },
        expectedGID: '25'
      },
      {
        name: 'Default Linux → GID 1',
        request: {
          purpose: 'Portfolio',
          websites_count: '1',
          tech_stack: 'Linux',
          cms: 'None',
          email_needed: true,
          storage_needed_gb: 5,
          monthly_budget: 10,
          free_domain: false,
          migrate_from_existing_host: false,
          email_deliverability_priority: false
        },
        expectedGID: '1'
      }
    ];

    console.log('🧪 Testing All WHMCS Requirements\n');
    console.log('='.repeat(80) + '\n');

    let passCount = 0;
    let failCount = 0;

    for (const test of tests) {
      console.log(`📝 Test: ${test.name}`);
      console.log(`   Expected GID: ${test.expectedGID}`);

      try {
        const response = await axios.post(
          `http://localhost:${PORT}/api/recommendations`,
          test.request
        );

        const matches = response.data.matches;
        
        if (matches.length === 0) {
          console.log(`   ⚠️  No matches returned`);
          console.log(`   Status: ⚠️  WARNING\n`);
          continue;
        }

        // Check GID
        const allCorrectGID = matches.every(p => p.gid === test.expectedGID);
        const gids = [...new Set(matches.map(p => p.gid))];
        
        console.log(`   Returned: ${matches.length} plans`);
        console.log(`   GIDs: ${gids.join(', ')}`);
        console.log(`   Plans:`);
        
        matches.forEach((plan, i) => {
          console.log(`     ${i + 1}. ${plan.name} - $${plan.pricing.USD.monthly}/mo (${plan.confidence}% confidence)`);
        });

        if (allCorrectGID) {
          console.log(`   Status: ✅ PASS\n`);
          passCount++;
        } else {
          console.log(`   Status: ❌ FAIL - Wrong GID\n`);
          failCount++;
        }

      } catch (error) {
        console.log(`   Error: ${error.message}`);
        console.log(`   Status: ❌ FAIL\n`);
        failCount++;
      }
    }

    console.log('='.repeat(80));
    console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed out of ${tests.length} tests\n`);

    // Test 3-plan selection
    console.log('='.repeat(80));
    console.log('\n🎯 Testing 3-Plan Selection (best fit, cheaper, higher)\n');

    const threePlanTest = {
      purpose: 'Blog',
      websites_count: '2-3',
      tech_stack: 'Linux',
      cms: 'WordPress',
      email_needed: true,
      storage_needed_gb: 12,
      monthly_budget: 10,
      free_domain: true,
      migrate_from_existing_host: false,
      email_deliverability_priority: false
    };

    const response = await axios.post(
      `http://localhost:${PORT}/api/recommendations`,
      threePlanTest
    );

    const matches = response.data.matches;
    console.log(`Returned ${matches.length} plans:`);
    
    matches.forEach((plan, i) => {
      const price = plan.pricing.USD.monthly;
      const budget = threePlanTest.monthly_budget;
      const relation = price < budget ? '(cheaper)' : price === budget ? '(at budget)' : '(higher)';
      console.log(`  ${i + 1}. ${plan.name} - $${price}/mo ${relation} - ${plan.confidence}% confidence`);
    });

    if (matches.length <= 3) {
      console.log('\n✅ Returns maximum 3 plans');
    } else {
      console.log('\n❌ Returns more than 3 plans');
    }

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAllRequirements();
