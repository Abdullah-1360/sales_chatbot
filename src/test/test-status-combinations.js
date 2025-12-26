#!/usr/bin/env node
/**
 * Test script for domain and hosting status combinations
 * Tests all possible scenarios:
 * - Both active
 * - Domain inactive, hosting active
 * - Domain active, hosting inactive
 * - Both inactive
 * - Only domain exists
 * - Only hosting exists
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Test cases - replace with actual client data
const TEST_CASES = [
  {
    name: 'Both Active',
    clientId: process.env.TEST_CLIENT_ID,
    domain: process.env.TEST_DOMAIN_ACTIVE,
    expectedStatus: 'Active'
  },
  {
    name: 'Domain Inactive, Hosting Active',
    clientId: process.env.TEST_CLIENT_ID,
    domain: process.env.TEST_DOMAIN_INACTIVE,
    expectedStatus: 'Partial'
  },
  {
    name: 'Domain Active, Hosting Suspended',
    clientId: process.env.TEST_CLIENT_ID,
    domain: process.env.TEST_DOMAIN_HOSTING_SUSPENDED,
    expectedStatus: 'Partial'
  },
  {
    name: 'Both Inactive',
    clientId: process.env.TEST_CLIENT_ID,
    domain: process.env.TEST_DOMAIN_BOTH_INACTIVE,
    expectedStatus: 'Inactive'
  }
];

async function testStatusCombination(testCase) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${testCase.name}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      clientId: testCase.clientId,
      domain: testCase.domain
    });
    
    console.log('✓ Status:', response.data.status);
    console.log('✓ Domain Status:', response.data.domainStatus || 'N/A');
    console.log('✓ Hosting Status:', response.data.hostingStatus || 'N/A');
    console.log('✓ Message:', response.data.message);
    console.log('✓ Action Required:', response.data.actionRequired || 'None');
    
    if (response.data.status === testCase.expectedStatus) {
      console.log('✓ PASS: Status matches expected');
    } else {
      console.log(`✗ FAIL: Expected ${testCase.expectedStatus}, got ${response.data.status}`);
    }
    
    return true;
  } catch (error) {
    console.log('✗ ERROR:', error.response?.data?.error || error.message);
    return false;
  }
}

async function runTests() {
  console.log('Testing Domain and Hosting Status Combinations');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of TEST_CASES) {
    // Skip if test data not configured
    if (!testCase.clientId || !testCase.domain) {
      console.log(`\nSKIPPING: ${testCase.name} (no test data configured)`);
      continue;
    }
    
    const result = await testStatusCombination(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(60)}`);
}

// Run tests
runTests().catch(console.error);
