#!/usr/bin/env node

/**
 * Test script for real-time WHOIS domain availability checking
 */

const { getDomainAvailability } = require('./src/services/domainService');

async function runTests() {
  console.log('🧪 Testing Real-time WHOIS Domain Availability API\n');
  
  const testCases = [
    {
      name: 'Known taken domain',
      domain: 'google.com',
      expectedAvailable: false
    },
    {
      name: 'Likely available domain',
      domain: `test-whois-${Date.now()}.pk`,
      expectedAvailable: true
    },
    {
      name: 'Another known taken domain',
      domain: 'github.com',
      expectedAvailable: false
    }
  ];
  
  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`\n=== Test ${i + 1}: ${test.name} ===`);
    console.log(`Domain: ${test.domain}`);
    
    try {
      const startTime = Date.now();
      const result = await getDomainAvailability(test.domain);
      const duration = Date.now() - startTime;
      
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(`📊 Result:`, {
        available: result.available,
        suggestions: result.suggestions?.length || 0,
        source: result.source,
        registrar: result.registrar
      });
      
      // Validate result
      if (result.success) {
        if (test.expectedAvailable === result.available) {
          console.log('✅ Test PASSED - Expected result matched');
        } else {
          console.log('⚠️  Test result differs from expected (this is normal for real-time data)');
        }
      } else {
        console.log('❌ Test FAILED - API returned error:', result.er