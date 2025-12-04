/**
 * Test script for clientId resolution middleware
 * 
 * This demonstrates how the middleware resolves clientId from:
 * 1. Email address
 * 2. Domain name
 * 3. Handles multiple clients for same domain
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function testClientResolution() {
  console.log('Testing Client ID Resolution Middleware\n');
  console.log('='.repeat(50));

  // Test 1: Resolve from email
  console.log('\n1. Testing resolution from EMAIL:');
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      email: 'customer@example.com',
      domain: 'example.com'
    });
    console.log('✓ Success:', response.data);
    console.log('  Resolved clientId:', response.config.data.includes('clientId'));
  } catch (err) {
    console.log('✗ Error:', err.response?.data || err.message);
  }

  // Test 2: Resolve from domain
  console.log('\n2. Testing resolution from DOMAIN:');
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      domain: 'example.com'
    });
    console.log('✓ Success:', response.data);
  } catch (err) {
    console.log('✗ Error:', err.response?.data || err.message);
  }

  // Test 3: ClientId already provided (should skip resolution)
  console.log('\n3. Testing with EXISTING clientId (should skip resolution):');
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      clientId: '123',
      domain: 'example.com'
    });
    console.log('✓ Success: Used provided clientId');
  } catch (err) {
    console.log('✗ Error:', err.response?.data || err.message);
  }

  // Test 4: No email or domain (should pass through to endpoint validation)
  console.log('\n4. Testing with NO email or domain:');
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      serviceId: '456'
    });
    console.log('✓ Success:', response.data);
  } catch (err) {
    console.log('✗ Expected error:', err.response?.data?.error || err.message);
  }

  // Test 5: Invalid email
  console.log('\n5. Testing with INVALID email:');
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      email: 'nonexistent@example.com',
      domain: 'example.com'
    });
    console.log('✓ Success:', response.data);
  } catch (err) {
    console.log('✗ Expected error:', err.response?.data?.error || err.message);
  }

  // Test 6: Invalid domain
  console.log('\n6. Testing with INVALID domain:');
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      domain: 'nonexistent-domain-12345.com'
    });
    console.log('✓ Success:', response.data);
  } catch (err) {
    console.log('✗ Expected error:', err.response?.data?.error || err.message);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Testing complete!\n');
}

// Run tests
testClientResolution().catch(console.error);
