/**
 * Test script for plan search endpoint
 * Usage: node test-plan-search.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

async function testSearch(query) {
  try {
    console.log(`\n🔍 Searching for: "${query}"`);
    const response = await axios.get(`${BASE_URL}/plans/search`, {
      params: { q: query }
    });

    console.log(`✅ Found ${response.data.count} results:`);
    response.data.results.forEach((plan, index) => {
      console.log(`   ${index + 1}. ${plan.name} (PID: ${plan.pid}, GID: ${plan.gid})`);
    });

  } catch (error) {
    if (error.response) {
      console.error(`❌ Error: ${error.response.data.error}`);
    } else {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

async function runTests() {
  console.log('🧪 Testing Plan Search Endpoint with Keyword Mapping\n');
  console.log('=' .repeat(70));

  // Test hosting types
  console.log('\n📦 HOSTING TYPES:');
  await testSearch('wordpress');
  await testSearch('wp');
  await testSearch('woocommerce');
  await testSearch('reseller');
  await testSearch('business');

  // Test plan levels
  console.log('\n📊 PLAN LEVELS:');
  await testSearch('starter');
  await testSearch('entry');
  await testSearch('basic');
  await testSearch('standard');
  await testSearch('pro');
  await testSearch('premium');
  await testSearch('ultimate');
  await testSearch('fantasy');

  // Test SSL/Security
  console.log('\n🔒 SSL/SECURITY:');
  await testSearch('ssl');
  await testSearch('certificate');
  await testSearch('wildcard');
  await testSearch('rapidssl');
  await testSearch('geotrust');

  // Test specific features
  console.log('\n⚙️ FEATURES:');
  await testSearch('windows');
  await testSearch('free');
  await testSearch('trial');
  await testSearch('multidomain');

  // Test specific brands
  console.log('\n🏷️ BRANDS:');
  await testSearch('smarty');
  await testSearch('freedom');
  await testSearch('micro');

  console.log('\n' + '='.repeat(70));
  console.log('✅ Tests completed!\n');
}

runTests();
