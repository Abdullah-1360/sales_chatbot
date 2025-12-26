#!/usr/bin/env node
/**
 * Script to find client IDs for test domains
 * This will help identify which client IDs own the test domains
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_DOMAINS = [
  'Wmflippers.com',
  'Hostbrake.com',
  'Filter.pk',
  'Vizfilters.com',
  'Ibuy.com.pk',
  'macoode.com'
];

// You'll need to provide a range of client IDs to search
const START_CLIENT_ID = parseInt(process.env.START_CLIENT_ID || '1');
const END_CLIENT_ID = parseInt(process.env.END_CLIENT_ID || '100');

async function findClientForDomain(domain, startId, endId) {
  console.log(`\nSearching for domain: ${domain}`);
  console.log(`Checking client IDs from ${startId} to ${endId}...`);
  
  for (let clientId = startId; clientId <= endId; clientId++) {
    try {
      const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
        clientId: clientId.toString(),
        domain: domain
      });
      
      if (response.data.success) {
        console.log(`✓ FOUND! Domain ${domain} belongs to Client ID: ${clientId}`);
        console.log(`  Status: ${response.data.status}`);
        console.log(`  Service: ${response.data.service}`);
        return { clientId, domain, ...response.data };
      }
    } catch (err) {
      // 404 means not found for this client, continue searching
      if (err.response && err.response.status === 404) {
        continue;
      }
      // Other errors might indicate API issues
      if (err.response && err.response.status !== 400) {
        console.log(`  Error checking client ${clientId}: ${err.message}`);
      }
    }
  }
  
  console.log(`✗ NOT FOUND: Domain ${domain} not found in client IDs ${startId}-${endId}`);
  return null;
}

async function main() {
  console.log('============================================================');
  console.log('FINDING CLIENT IDs FOR TEST DOMAINS');
  console.log('============================================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Searching client IDs: ${START_CLIENT_ID} to ${END_CLIENT_ID}`);
  console.log('============================================================');
  
  const results = [];
  
  for (const domain of TEST_DOMAINS) {
    const result = await findClientForDomain(domain, START_CLIENT_ID, END_CLIENT_ID);
    if (result) {
      results.push(result);
    }
  }
  
  console.log('\n============================================================');
  console.log('SUMMARY');
  console.log('============================================================');
  
  if (results.length === 0) {
    console.log('No domains found. Try expanding the client ID range:');
    console.log('  START_CLIENT_ID=1 END_CLIENT_ID=500 node tests/find-client-ids.js');
  } else {
    console.log(`Found ${results.length} out of ${TEST_DOMAINS.length} domains:\n`);
    results.forEach(r => {
      console.log(`  ${r.domain} → Client ID: ${r.clientId} (${r.status})`);
    });
    
    console.log('\nUpdate your test files with these client IDs:');
    console.log('const TEST_CLIENTS = {');
    results.forEach(r => {
      console.log(`  "${r.domain}": ${r.clientId},`);
    });
    console.log('};');
  }
  
  console.log('\n============================================================');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
