#!/usr/bin/env node

/**
 * Test duplicate A record cleanup
 */

require('dotenv').config();
const whmService = require('./src/services/whmService');

async function testDuplicateCleanup() {
  console.log('🧪 Testing duplicate A record cleanup');
  
  const domain = 'gamitixstudios.com';
  const serverName = 'cp1';
  const correctIP = '95.217.204.85';
  
  try {
    console.log(`\n🎯 Testing auto-fix for ${domain} (should clean up duplicates)`);
    
    const result = await whmService.autoFixARecord(domain);
    
    console.log('\n📊 Auto-fix Result:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`\n✅ Auto-fix Success:`);
      console.log(`  Domain: ${result.domain}`);
      console.log(`  Server: ${result.server}`);
      console.log(`  Method: ${result.method}`);
      console.log(`  Old IP: ${result.oldIP || result.currentIP}`);
      console.log(`  New IP: ${result.newIP || result.correctIP}`);
      console.log(`  Message: ${result.message}`);
    } else {
      console.log(`\n❌ Auto-fix Failed:`);
      console.log(`  Error: ${result.error}`);
      console.log(`  Domain: ${result.domain}`);
    }
    
    // Verify the final state
    console.log(`\n🔍 Verifying final zone state...`);
    const dnsRecords = await whmService.getDNSZone(serverName, domain);
    
    const mainDomainARecords = dnsRecords.filter(record => {
      if (record.type !== 'A') return false;
      const recordName = (record.name || '').toLowerCase();
      const domainName = domain.toLowerCase();
      return recordName === `${domainName}.` || recordName === domainName;
    });
    
    console.log(`→ Final A records: ${mainDomainARecords.length}`);
    mainDomainARecords.forEach((record, index) => {
      const isCorrect = record.address === correctIP;
      console.log(`  ${index + 1}. "${record.name}" → ${record.address} ${isCorrect ? '✅' : '❌'}`);
    });
    
    const correctRecords = mainDomainARecords.filter(r => r.address === correctIP).length;
    const incorrectRecords = mainDomainARecords.filter(r => r.address !== correctIP).length;
    
    console.log(`\n📈 Summary:`);
    console.log(`  Total A records: ${mainDomainARecords.length}`);
    console.log(`  Correct records: ${correctRecords}`);
    console.log(`  Duplicate/incorrect records: ${incorrectRecords}`);
    
    if (mainDomainARecords.length === 1 && correctRecords === 1) {
      console.log(`\n🎉 PERFECT: Single A record with correct IP!`);
    } else if (correctRecords > 0 && incorrectRecords === 0) {
      console.log(`\n✅ GOOD: All A records have correct IP (but ${mainDomainARecords.length} duplicates)`);
    } else if (correctRecords > 0 && incorrectRecords > 0) {
      console.log(`\n⚠️ MIXED: Has correct IP but also ${incorrectRecords} duplicate(s) with wrong IP`);
    } else {
      console.log(`\n❌ PROBLEM: No A records have the correct IP`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testDuplicateCleanup().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});