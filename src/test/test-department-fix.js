/**
 * Test department ID vs name priority
 * Verifies that deptid takes priority over deptname
 */

require('dotenv').config();

console.log('\n' + '='.repeat(80));
console.log('🧪 DEPARTMENT CONFIGURATION TEST');
console.log('='.repeat(80));

console.log('\n📋 Current Environment Variables:');
console.log('-'.repeat(80));
console.log(`TECHSUPPORT_DEPTID: ${process.env.TECHSUPPORT_DEPTID || 'NOT SET'}`);
console.log(`TECHSUPPORT_DEPTNAME: ${process.env.TECHSUPPORT_DEPTNAME || 'NOT SET'}`);
console.log(`BILLING_DEPTID: ${process.env.BILLING_DEPTID || 'NOT SET'}`);
console.log(`BILLING_DEPTNAME: ${process.env.BILLING_DEPTNAME || 'NOT SET'}`);

console.log('\n🔍 Testing Department Resolution Logic:');
console.log('-'.repeat(80));

// Simulate the logic from controllers
function testDepartmentLogic(deptIdEnv, deptNameEnv, defaultName) {
  const deptid = deptIdEnv;
  const deptname = deptid ? undefined : (deptNameEnv || defaultName);
  
  return { deptid, deptname };
}

// Test 1: Tech Support (with ID)
console.log('\n1. Tech Support Department:');
const techResult = testDepartmentLogic(
  process.env.TECHSUPPORT_DEPTID,
  process.env.TECHSUPPORT_DEPTNAME,
  'Technical Support'
);
console.log(`   deptid: ${techResult.deptid || 'undefined'}`);
console.log(`   deptname: ${techResult.deptname || 'undefined'}`);
console.log(`   → Will send to WHMCS: ${techResult.deptid ? `deptid=${techResult.deptid}` : `deptname=${techResult.deptname}`}`);
console.log(`   ✅ ${techResult.deptid ? 'Using ID (correct!)' : 'Using name (fallback)'}`);

// Test 2: Billing (with ID)
console.log('\n2. Billing Department:');
const billingResult = testDepartmentLogic(
  process.env.BILLING_DEPTID,
  process.env.BILLING_DEPTNAME,
  'Billing'
);
console.log(`   deptid: ${billingResult.deptid || 'undefined'}`);
console.log(`   deptname: ${billingResult.deptname || 'undefined'}`);
console.log(`   → Will send to WHMCS: ${billingResult.deptid ? `deptid=${billingResult.deptid}` : `deptname=${billingResult.deptname}`}`);
console.log(`   ✅ ${billingResult.deptid ? 'Using ID (correct!)' : 'Using name (fallback)'}`);

// Test 3: Simulate no ID (fallback to name)
console.log('\n3. Simulated: No Department ID (fallback):');
const fallbackResult = testDepartmentLogic(
  undefined,
  'Custom Department',
  'Default Department'
);
console.log(`   deptid: ${fallbackResult.deptid || 'undefined'}`);
console.log(`   deptname: ${fallbackResult.deptname || 'undefined'}`);
console.log(`   → Will send to WHMCS: ${fallbackResult.deptid ? `deptid=${fallbackResult.deptid}` : `deptname=${fallbackResult.deptname}`}`);
console.log(`   ✅ Using name (fallback - will resolve to ID)`);

console.log('\n' + '='.repeat(80));
console.log('📊 SUMMARY');
console.log('='.repeat(80));

if (process.env.TECHSUPPORT_DEPTID && process.env.BILLING_DEPTID) {
  console.log('✅ Both department IDs are configured');
  console.log('✅ Tickets will be created using department IDs');
  console.log('✅ No name resolution needed');
  console.log('\n🎉 Configuration is optimal!');
} else if (!process.env.TECHSUPPORT_DEPTID && !process.env.BILLING_DEPTID) {
  console.log('⚠️  No department IDs configured');
  console.log('⚠️  Will use department names (slower, may fail if name not found)');
  console.log('\n💡 Recommendation: Set TECHSUPPORT_DEPTID and BILLING_DEPTID in .env');
} else {
  console.log('⚠️  Partial configuration (some IDs missing)');
  console.log('\n💡 Recommendation: Set all department IDs in .env');
}

console.log('\n' + '='.repeat(80));
console.log('🔧 To find your department IDs, run:');
console.log('   node src/test/get-departments.js');
console.log('='.repeat(80) + '\n');
