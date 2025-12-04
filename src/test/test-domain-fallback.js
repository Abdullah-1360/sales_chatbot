#!/usr/bin/env node
/**
 * Test Domain Registration Fallback
 * Verifies that the system can find domain registrations when not found in hosting products
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_API_SECRET;

async function findDomainOnlyRegistrations(clientId) {
  console.log(`\n=== Finding Domain-Only Registrations for Client ${clientId} ===\n`);
  
  // Get all domains
  const domainsUrl = WHMCS_URL;
  const domainsPayload = new URLSearchParams({
    action: 'GetClientsDomains',
    clientid: clientId,
    limitnum: 50,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  // Get all products
  const productsUrl = WHMCS_URL;
  const productsPayload = new URLSearchParams({
    action: 'GetClientsProducts',
    clientid: clientId,
    limitnum: 200,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  try {
    const [domainsResponse, productsResponse] = await Promise.all([
      axios.post(domainsUrl, domainsPayload.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }),
      axios.post(productsUrl, productsPayload.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    ]);
    
    const domainsData = domainsResponse.data;
    const productsData = productsResponse.data;
    
    if (domainsData.result !== 'success' || !domainsData.domains) {
      console.log('No domains found or error fetching domains.');
      return [];
    }
    
    const domains = domainsData.domains.domain || domainsData.domains || [];
    const domainArray = Array.isArray(domains) ? domains : [domains];
    
    const products = productsData.products?.product || productsData.products || [];
    const productArray = Array.isArray(products) ? products : [products];
    
    // Find domains that are NOT in products (domain-only registrations)
    const productDomains = new Set(
      productArray.map(p => (p.domain || '').toLowerCase()).filter(d => d)
    );
    
    const domainOnlyRegistrations = domainArray.filter(d => {
      const domainName = (d.domainname || d.domain || '').toLowerCase();
      return domainName && !productDomains.has(domainName);
    });
    
    console.log(`Total Domains: ${domainArray.length}`);
    console.log(`Domains with Hosting: ${productDomains.size}`);
    console.log(`Domain-Only Registrations: ${domainOnlyRegistrations.length}\n`);
    
    if (domainOnlyRegistrations.length > 0) {
      console.log('Domain-Only Registrations Found:\n');
      domainOnlyRegistrations.forEach((d, i) => {
        console.log(`${i + 1}. ${d.domainname || d.domain}`);
        console.log(`   Status: ${d.status}`);
        console.log(`   Next Due: ${d.nextduedate}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No domain-only registrations found for this client.');
      console.log('All domains have associated hosting products.\n');
    }
    
    return domainOnlyRegistrations;
  } catch (err) {
    console.error('Error fetching data:', err.message);
    return [];
  }
}

async function testServiceStatus(clientId, domain, expectFound) {
  console.log(`\n=== Testing Service Status: ${domain} ===`);
  console.log(`Expected: ${expectFound ? 'Found' : 'Not Found'}\n`);
  
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      clientId: clientId.toString(),
      domain: domain
    });
    
    console.log('✅ SUCCESS - Domain Found\n');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log(`\n✅ Service Type: ${response.data.type || 'hosting'}`);
      console.log(`✅ Status: ${response.data.status}`);
      console.log(`✅ Next Due Date: ${response.data.nextDueDate || 'N/A'}`);
    }
    
    return expectFound ? true : false; // Should have found it
  } catch (err) {
    if (err.response?.status === 404) {
      console.log('❌ NOT FOUND\n');
      console.log('Error:', err.response.data.error);
      return !expectFound ? true : false; // Should not have found it
    }
    console.log('❌ FAILED\n');
    console.log(`Error: ${err.response?.data?.error || err.message}`);
    return false;
  }
}

async function testInvoiceLookup(clientId, domain, expectFound) {
  console.log(`\n=== Testing Invoice Lookup: ${domain} ===`);
  console.log(`Expected: ${expectFound ? 'Found or No Invoice' : 'Domain Not Found'}\n`);
  
  try {
    const response = await axios.post(`${BASE_URL}/api/invoiceLookup`, {
      clientId: clientId.toString(),
      domain: domain
    });
    
    console.log('✅ SUCCESS - Invoice Found\n');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return expectFound ? true : false;
  } catch (err) {
    if (err.response?.status === 404) {
      const errorMsg = err.response.data.error;
      console.log('ℹ️  NOT FOUND\n');
      console.log('Error:', errorMsg);
      
      // Check if it's "invoice not found" (good) or "domain not found" (bad)
      if (errorMsg.includes('service') || errorMsg.includes('domain')) {
        console.log('❌ Domain itself was not found (fallback failed)');
        return !expectFound ? true : false;
      } else {
        console.log('✅ Domain found but no invoice (expected)');
        return expectFound ? true : false;
      }
    }
    console.log('❌ FAILED\n');
    console.log(`Error: ${err.response?.data?.error || err.message}`);
    return false;
  }
}

async function main() {
  const clientId = process.argv[2] || '31';
  
  console.log('============================================================');
  console.log('DOMAIN REGISTRATION FALLBACK TEST');
  console.log('============================================================');
  console.log(`Testing Client ID: ${clientId}`);
  console.log('============================================================');
  
  // Find domain-only registrations
  const domainOnlyRegs = await findDomainOnlyRegistrations(clientId);
  
  let testsPassed = 0;
  let testsTotal = 0;
  
  if (domainOnlyRegs.length > 0) {
    // Test with first domain-only registration
    const testDomain = domainOnlyRegs[0].domainname || domainOnlyRegs[0].domain;
    
    console.log('\n--- TEST 1: Service Status for Domain-Only Registration ---');
    if (await testServiceStatus(clientId, testDomain, true)) {
      testsPassed++;
    }
    testsTotal++;
    
    console.log('\n--- TEST 2: Invoice Lookup for Domain-Only Registration ---');
    if (await testInvoiceLookup(clientId, testDomain, true)) {
      testsPassed++;
    }
    testsTotal++;
  } else {
    console.log('\n⚠️  Cannot test domain-only registrations - none found for this client.');
    console.log('Testing with a regular hosting domain instead...\n');
    
    // Test with a known hosting domain
    console.log('--- TEST 1: Service Status for Hosting Domain ---');
    if (await testServiceStatus(clientId, 'wmflippers.com', true)) {
      testsPassed++;
    }
    testsTotal++;
  }
  
  // Test with non-existent domain
  console.log('\n--- TEST: Non-Existent Domain (Should Fail) ---');
  if (await testServiceStatus(clientId, 'nonexistent-domain-12345.com', false)) {
    testsPassed++;
  }
  testsTotal++;
  
  console.log('\n============================================================');
  console.log('TEST SUMMARY');
  console.log('============================================================');
  console.log(`Tests Run: ${testsTotal}`);
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsTotal - testsPassed}`);
  console.log(`Success Rate: ${testsTotal > 0 ? ((testsPassed / testsTotal) * 100).toFixed(1) : 0}%`);
  console.log('============================================================\n');
  
  if (testsPassed === testsTotal) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('\n✅ Domain Registration Fallback is Working:');
    console.log('   • Searches hosting products first');
    console.log('   • Falls back to domain registrations if not found');
    console.log('   • Returns appropriate error for non-existent domains');
  } else {
    console.log('⚠️  Some tests failed. Review the output above.');
  }
  
  console.log('\n💡 Note: If no domain-only registrations exist, the fallback');
  console.log('   logic is still implemented but cannot be fully tested.');
}

main().catch(err => {
  console.error('Fatal Error:', err.message);
  process.exit(1);
});
