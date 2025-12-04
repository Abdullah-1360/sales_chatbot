#!/usr/bin/env node
/**
 * Find Client ID by Email or Domain
 */

const axios = require('axios');
require('dotenv').config();

const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_API_SECRET;

async function findClientByEmail(email) {
  console.log(`\n=== Searching for Client by Email: ${email} ===\n`);
  
  const payload = new URLSearchParams({
    action: 'GetClientsDetails',
    email: email,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  try {
    const { data } = await axios.post(WHMCS_URL, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (data.result === 'success') {
      console.log('✅ Client Found!');
      console.log(`Client ID: ${data.userid}`);
      console.log(`Name: ${data.firstname} ${data.lastname}`);
      console.log(`Email: ${data.email}`);
      console.log(`Company: ${data.companyname || 'N/A'}`);
      console.log(`Status: ${data.status}`);
      return data.userid;
    } else {
      console.log('❌ Client not found');
      console.log('Error:', data.message);
      return null;
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    return null;
  }
}

async function findClientByDomain(domain) {
  console.log(`\n=== Searching for Client by Domain: ${domain} ===\n`);
  
  // Try domains first
  const domainsPayload = new URLSearchParams({
    action: 'GetClientsDomains',
    domain: domain,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  try {
    const { data } = await axios.post(WHMCS_URL, domainsPayload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (data.result === 'success' && data.domains) {
      const domains = data.domains.domain || data.domains;
      const domainArray = Array.isArray(domains) ? domains : [domains];
      
      if (domainArray.length > 0) {
        const clientId = domainArray[0].userid;
        console.log('✅ Client Found (via domain registration)!');
        console.log(`Client ID: ${clientId}`);
        console.log(`Domain: ${domainArray[0].domainname || domainArray[0].domain}`);
        console.log(`Status: ${domainArray[0].status}`);
        console.log(`Next Due: ${domainArray[0].nextduedate}`);
        return clientId;
      }
    }
  } catch (err) {
    console.log('Domain registration not found, trying hosting products...');
  }

  // Try hosting products
  const productsPayload = new URLSearchParams({
    action: 'GetClientsProducts',
    domain: domain,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  try {
    const { data } = await axios.post(WHMCS_URL, productsPayload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (data.result === 'success' && data.products) {
      const products = data.products.product || data.products;
      const productArray = Array.isArray(products) ? products : [products];
      
      if (productArray.length > 0) {
        const clientId = productArray[0].userid || productArray[0].clientid;
        console.log('✅ Client Found (via hosting product)!');
        console.log(`Client ID: ${clientId}`);
        console.log(`Domain: ${productArray[0].domain}`);
        console.log(`Product: ${productArray[0].name || productArray[0].productname}`);
        console.log(`Status: ${productArray[0].status}`);
        return clientId;
      }
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  console.log('❌ Domain not found in either domain registrations or hosting products');
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node find-client-id.js email <email@example.com>');
    console.log('  node find-client-id.js domain <example.com>');
    console.log('\nExamples:');
    console.log('  node find-client-id.js email client@example.com');
    console.log('  node find-client-id.js domain example.com');
    process.exit(1);
  }

  const type = args[0].toLowerCase();
  const value = args[1];

  if (!value) {
    console.error('Error: Please provide a value to search for');
    process.exit(1);
  }

  let clientId = null;

  if (type === 'email') {
    clientId = await findClientByEmail(value);
  } else if (type === 'domain') {
    clientId = await findClientByDomain(value);
  } else {
    console.error('Error: Type must be "email" or "domain"');
    process.exit(1);
  }

  if (clientId) {
    console.log('\n============================================================');
    console.log(`✅ Client ID: ${clientId}`);
    console.log('============================================================');
    console.log('\nYou can now use this client ID in your API calls:');
    console.log(`\ncurl -X POST http://localhost:3000/api/serviceStatus \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"clientId":"${clientId}","domain":"${type === 'domain' ? value : 'example.com'}"}'`);
  } else {
    console.log('\n❌ Client ID not found');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Error:', err.message);
  process.exit(1);
});
