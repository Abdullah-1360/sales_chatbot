#!/usr/bin/env node

/**
 * Test script for the new /api/renewservice endpoint
 * 
 * This script tests the renewservice endpoint with various scenarios:
 * 1. Valid domain with phone number
 * 2. Valid domain with email
 * 3. Missing parameters
 * 4. Invalid domain
 */

const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/renewservice`;

async function testRenewService() {
  console.log('🧪 Testing /api/renewservice endpoint...\n');

  // Test 1: Missing parameters
  console.log('Test 1: Missing parameters');
  try {
    const response = await axios.post(API_URL, {});
    console.log('❌ Expected error but got success:', response.data);
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('✅ Correctly returned 400 for missing parameters');
      console.log('   Error:', error.response.data.error);
      if (error.response.data.ticketId) {
        console.log('   Ticket Created:', error.response.data.ticketId);
      }
    } else {
      console.log('❌ Unexpected error:', error.message);
    }
  }
  console.log('');

  // Test 2: Valid email but no domain
  console.log('Test 2: Valid email but no domain');
  try {
    const response = await axios.post(API_URL, {
      email: 'test@example.com'
    });
    console.log('❌ Expected error but got success:', response.data);
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('✅ Correctly returned 400 for missing domain');
      console.log('   Error:', error.response.data.error);
    } else {
      console.log('❌ Unexpected error:', error.message);
    }
  }
  console.log('');

  // Test 3: Valid domain with email (should resolve client)
  console.log('Test 3: Valid domain with email');
  try {
    const response = await axios.post(API_URL, {
      domain: 'example.com',
      email: 'test@example.com'
    });
    console.log('Response:', response.data);
    if (response.data.ticketId) {
      console.log('✅ Ticket created:', response.data.ticketId);
    }
  } catch (error) {
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);
      if (error.response.data.ticketId) {
        console.log('✅ Ticket created:', error.response.data.ticketId);
      }
    } else {
      console.log('❌ Network error:', error.message);
    }
  }
  console.log('');

  // Test 4: Valid domain with phone number
  console.log('Test 4: Valid domain with phone number');
  try {
    const response = await axios.post(API_URL, {
      domain: 'example.com',
      email: 'test@example.com',
      phoneNumber: '+1234567890'
    });
    console.log('Response:', response.data);
    if (response.data.ticketId) {
      console.log('✅ Ticket created:', response.data.ticketId);
    }
  } catch (error) {
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);
      if (error.response.data.ticketId) {
        console.log('✅ Ticket created:', error.response.data.ticketId);
      }
    } else {
      console.log('❌ Network error:', error.message);
    }
  }
  console.log('');

  console.log('🏁 Test completed!');
}

// Run tests if this script is executed directly
if (require.main === module) {
  testRenewService().catch(console.error);
}

module.exports = { testRenewService };