#!/usr/bin/env node
const axios = require('axios');
require('dotenv').config();

const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_API_SECRET;

async function testDomainLookup() {
  const domain = 'mywebsitebox.com';
  const clientId = '31';
  
  console.log('=== Testing WHMCS API Calls ===\n');
  
  // Test 1: GetClientsProducts with domain filter
  console.log('1. GetClientsProducts with domain filter:');
  const productsPayload = new URLSearchParams({
    action: 'GetClientsProducts',
    clientid: clientId,
    domain: domain,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });
  
  try {
    const { data } = await axios.post(WHMCS_URL, productsPayload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log('Result:', data.result);
    console.log('Products found:', data.products ? 'Yes' : 'No');
    if (data.products) {
      const items = data.products.product || data.products || [];
      const itemArray = Array.isArray(items) ? items : [items];
      console.log('Count:', itemArray.length);
      console.log('Data:', JSON.stringify(itemArray, null, 2));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
  
  // Test 2: GetClientsDomains with domain filter
  console.log('\n2. GetClientsDomains with domain filter:');
  const domainsPayload = new URLSearchParams({
    action: 'GetClientsDomains',
    clientid: clientId,
    domain: domain,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });
  
  try {
    const { data } = await axios.post(WHMCS_URL, domainsPayload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log('Result:', data.result);
    console.log('Domains found:', data.domains ? 'Yes' : 'No');
    if (data.domains) {
      const items = data.domains.domain || data.domains || [];
      const itemArray = Array.isArray(items) ? items : [items];
      console.log('Count:', itemArray.length);
      console.log('Data:', JSON.stringify(itemArray, null, 2));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

testDomainLookup();
