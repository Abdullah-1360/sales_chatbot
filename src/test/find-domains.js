#!/usr/bin/env node
/**
 * Script to find client IDs by searching domains (not just products)
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_DOMAINS = [
  'Hostbrake.com',
  'Filter.pk',
  'Vizfilters.com',
  'Ibuy.com.pk'
];

const START_CLIENT_ID = parseInt(process.env.START_CLIENT_ID || '1');
const END_CLIENT_ID = parseInt(process.env.END_CLIENT_ID || '100');

async function checkClientDomains(clientId) {
  try {
    const response = await axios.get(`${BASE_URL}/clients/${clientId}/domains`);
    if (response.data.ok && response.data.domains) {
      const domains = response.data.domains.domain || response.data.domains || [];
      return Array.isArray(domains) ? domains : [domains];
    }
  } catch (err) {
    // Ignore errors
  }
  return [];
}

async function checkClientProducts(clientId) {
  try {
    const response = await axios.get(`${BASE_URL}/clients/${clientId}/products`);
    if (response.data.ok && response.data.products) {
      const products = response.data.products.product || response.data.products || [];
      return Array.isArray(products) ? products : [products];
    }
  } catch (err) {
    // Ignore errors
  }
  return [];
}

async function main() {
  console.log('============================================================');
  console.log('SEARCHING FOR DOMAINS IN WHMCS');
  console.log('============================================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Searching client IDs: ${START_CLIENT_ID} to ${END_CLIENT_ID}`);
  console.log(`Looking for: ${TEST_DOMAINS.join(', ')}`);
  console.log('============================================================\n');
  
  const found = {};
  
  for (let clientId = START_CLIENT_ID; clientId <= END_CLIENT_ID; clientId++) {
    if (clientId % 10 === 0) {
      process.stdout.write(`\rChecking client ${clientId}...`);
    }
    
    // Check domains
    const domains = await checkClientDomains(clientId);
    for (const domain of domains) {
      const domainName = domain.domainname || domain.domain;
      if (domainName) {
        const normalized = domainName.toLowerCase();
        for (const testDomain of TEST_DOMAINS) {
          if (normalized === testDomain.toLowerCase()) {
            if (!found[testDomain]) found[testDomain] = [];
            found[testDomain].push({
              clientId,
              type: 'domain',
              status: domain.status,
              name: domainName
            });
          }
        }
      }
    }
    
    // Check products
    const products = await checkClientProducts(clientId);
    for (const product of products) {
      const productDomain = product.domain;
      if (productDomain) {
        const normalized = productDomain.toLowerCase();
        for (const testDomain of TEST_DOMAINS) {
          if (normalized === testDomain.toLowerCase()) {
            if (!found[testDomain]) found[testDomain] = [];
            found[testDomain].push({
              clientId,
              type: 'product',
              status: product.status,
              name: productDomain
            });
          }
        }
      }
    }
  }
  
  console.log('\n\n============================================================');
  console.log('RESULTS');
  console.log('============================================================\n');
  
  if (Object.keys(found).length === 0) {
    console.log('❌ No domains found in the specified range.');
    console.log('\nTry expanding the search range:');
    console.log('  START_CLIENT_ID=1 END_CLIENT_ID=500 node tests/find-domains.js');
  } else {
    for (const [domain, matches] of Object.entries(found)) {
      console.log(`✓ ${domain}:`);
      matches.forEach(m => {
        console.log(`  → Client ID: ${m.clientId} (${m.type}, ${m.status})`);
      });
      console.log('');
    }
    
    console.log('Update your tests with these client IDs:');
    console.log('const TEST_CLIENTS = {');
    for (const [domain, matches] of Object.entries(found)) {
      console.log(`  "${domain}": ${matches[0].clientId},`);
    }
    console.log('};');
  }
  
  console.log('\n============================================================');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
