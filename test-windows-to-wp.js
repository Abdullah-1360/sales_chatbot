/**
 * Test Windows → WordPress mapping
 */

require('dotenv').config();
const planMatcher = require('./src/services/planMatcher');

console.log('🧪 Testing Windows → WordPress Mapping\n');

// Test 1: Windows tech stack
const test1 = {
  purpose: 'Blog',
  websites_count: '2-3',
  tech_stack: 'Windows',
  cms: 'None',
  email_needed: true,
  storage_needed_gb: 10,
  monthly_budget: 10,
  free_domain: true,
  migrate_from_existing_host: false,
  email_deliverability_priority: false
};

const result1 = planMatcher(test1);
console.log('Test 1: Windows tech_stack');
console.log('Input:', { tech_stack: test1.tech_stack, cms: test1.cms });
console.log('Result:', result1);
console.log('Expected: GID 20 (WordPress)');
console.log('Status:', result1.gid === 20 ? '✅ PASS' : '❌ FAIL');

console.log('\n---\n');

// Test 2: WordPress CMS (should still work)
const test2 = {
  ...test1,
  tech_stack: 'Linux',
  cms: 'WordPress'
};

const result2 = planMatcher(test2);
console.log('Test 2: WordPress CMS');
console.log('Input:', { tech_stack: test2.tech_stack, cms: test2.cms });
console.log('Result:', result2);
console.log('Expected: GID 20 (WordPress)');
console.log('Status:', result2.gid === 20 ? '✅ PASS' : '❌ FAIL');

console.log('\n---\n');

// Test 3: WooCommerce (should override Windows)
const test3 = {
  ...test1,
  tech_stack: 'Windows',
  cms: 'WooCommerce'
};

const result3 = planMatcher(test3);
console.log('Test 3: WooCommerce with Windows');
console.log('Input:', { tech_stack: test3.tech_stack, cms: test3.cms });
console.log('Result:', result3);
console.log('Expected: GID 21 (WooCommerce)');
console.log('Status:', result3.gid === 21 ? '✅ PASS' : '❌ FAIL');

console.log('\n---\n');

// Test 4: Default Linux
const test4 = {
  ...test1,
  tech_stack: 'Linux',
  cms: 'None'
};

const result4 = planMatcher(test4);
console.log('Test 4: Default Linux');
console.log('Input:', { tech_stack: test4.tech_stack, cms: test4.cms });
console.log('Result:', result4);
console.log('Expected: GID 1 (cPanel)');
console.log('Status:', result4.gid === 1 ? '✅ PASS' : '❌ FAIL');

console.log('\n✅ All tests completed!');
