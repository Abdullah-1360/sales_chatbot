#!/usr/bin/env node
/**
 * Test script for domains with multiple hosting products
 * This tests the scenario where a domain has multiple hosting products
 * with different statuses (e.g., some active, some terminated)
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testMultipleProducts() {
  console.log('Testing Domain with Multiple Hosting Products');
  console.log('='.repeat(60));
  
  // Get test data from environment or use defaults
  const clientId = process.env.TEST_CLIENT_ID;
  const domain = process.env.TEST_DOMAIN || 'example.com';
  const email = process.env.TEST_EMAIL;
  
  if (!clientId && !email) {
    console.log('✗ ERROR: Please set TEST_CLIENT_ID or TEST_EMAIL in .env');
    return;
  }
  
  if (!domain) {
    console.log('✗ ERROR: Please set TEST_DOMAIN in .env');
    return;
  }
  
  console.log('\nTest Parameters:');
  console.log('- Client ID:', clientId || '(will resolve from email)');
  console.log('- Email:', email || 'N/A');
  console.log('- Domain:', domain);
  console.log('='.repeat(60));
  
  try {
    // First, let's check all products for this client
    console.log('\n1. Checking all products for client...');
    const productsResponse = await axios.get(`${BASE_URL}/clients/${clientId}/products`);
    const products = productsResponse.data.products?.product || productsResponse.data.products || [];
    const productArray = Array.isArray(products) ? products : [products];
    
    console.log(`   Found ${productArray.length} total products`);
    
    // Filter products for this domain
    const domainProducts = productArray.filter(p => 
      (p.domain && p.domain.toLowerCase() === domain.toLowerCase())
    );
    
    console.log(`   Found ${domainProducts.length} products for domain "${domain}":`);
    domainProducts.forEach((p, i) => {
      console.log(`   ${i + 1}. Product ID: ${p.id}, Status: ${p.status}, Name: ${p.name || p.productname}`);
    });
    
    // Now test the serviceStatus endpoint
    console.log('\n2. Testing /api/serviceStatus endpoint...');
    const payload = { domain };
    if (clientId) {
      payload.clientId = clientId;
    } else if (email) {
      payload.email = email;
    }
    
    const statusResponse = await axios.post(`${BASE_URL}/api/serviceStatus`, payload);
    
    console.log('\n3. Service Status Response:');
    console.log('='.repeat(60));
    console.log('Status:', statusResponse.data.status);
    console.log('Domain Status:', statusResponse.data.domainStatus || 'N/A');
    console.log('Hosting Status:', statusResponse.data.hostingStatus || 'N/A');
    console.log('Billing Issue:', statusResponse.data.billingIssue);
    console.log('Action Required:', statusResponse.data.actionRequired || 'None');
    
    if (statusResponse.data.allHostingProducts) {
      console.log('\nAll Hosting Products:');
      statusResponse.data.allHostingProducts.forEach((p, i) => {
        console.log(`  ${i + 1}. [${p.status}] ${p.name} (ID: ${p.id})`);
        if (p.nextDueDate) console.log(`     Next Due: ${p.nextDueDate}`);
      });
      
      console.log('\nStatus Summary:');
      const counts = statusResponse.data.hostingStatusCounts;
      Object.keys(counts).forEach(status => {
        if (counts[status] > 0) {
          console.log(`  - ${status}: ${counts[status]}`);
        }
      });
    }
    
    console.log('\nMessage:');
    console.log(statusResponse.data.message);
    console.log('='.repeat(60));
    
    // Verify the logic
    console.log('\n4. Verification:');
    if (domainProducts.length > 1) {
      const activeCount = domainProducts.filter(p => p.status === 'Active').length;
      const suspendedCount = domainProducts.filter(p => p.status === 'Suspended').length;
      const terminatedCount = domainProducts.filter(p => p.status === 'Terminated' || p.status === 'Cancelled').length;
      
      console.log(`   - Active products: ${activeCount}`);
      console.log(`   - Suspended products: ${suspendedCount}`);
      console.log(`   - Terminated/Cancelled products: ${terminatedCount}`);
      
      // Expected behavior
      if (activeCount > 0) {
        console.log('   ✓ Expected: Should show Active hosting status');
        if (statusResponse.data.hostingStatus === 'Active') {
          console.log('   ✓ PASS: Correctly showing Active status');
        } else {
          console.log(`   ✗ FAIL: Expected Active, got ${statusResponse.data.hostingStatus}`);
        }
      } else if (suspendedCount > 0) {
        console.log('   ✓ Expected: Should show Suspended hosting status');
        if (statusResponse.data.hostingStatus === 'Suspended') {
          console.log('   ✓ PASS: Correctly showing Suspended status');
        } else {
          console.log(`   ✗ FAIL: Expected Suspended, got ${statusResponse.data.hostingStatus}`);
        }
      } else if (terminatedCount > 0) {
        console.log('   ✓ Expected: Should show Terminated/Cancelled hosting status');
        if (['Terminated', 'Cancelled'].includes(statusResponse.data.hostingStatus)) {
          console.log('   ✓ PASS: Correctly showing Terminated/Cancelled status');
        } else {
          console.log(`   ✗ FAIL: Expected Terminated/Cancelled, got ${statusResponse.data.hostingStatus}`);
        }
      }
    } else if (domainProducts.length === 1) {
      console.log('   ℹ Only one product found for this domain');
      console.log(`   Status: ${domainProducts[0].status}`);
    } else {
      console.log('   ℹ No hosting products found for this domain');
    }
    
  } catch (error) {
    console.log('\n✗ ERROR:', error.response?.data?.error || error.message);
    if (error.response?.data) {
      console.log('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testMultipleProducts().catch(console.error);
