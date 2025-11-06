/**
 * Test Domain Availability API
 */

require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const axios = require('axios');

async function testDomainAPI() {
  try {
    await connectDB();

    const PORT = 4004;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Test server running on :${PORT}\n`);
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('🧪 Testing Domain Availability API\n');
    console.log('='.repeat(80) + '\n');

    const tests = [
      {
        name: 'Available Domain Check',
        domain: 'my-unique-test-domain-12345.com',
        expectAvailable: true
      },
      {
        name: 'Taken Domain Check (with suggestions)',
        domain: 'google.com',
        expectAvailable: false
      },
      {
        name: 'Pakistani Domain Check',
        domain: 'test-domain-availability.pk',
        expectAvailable: null // Unknown
      }
    ];

    for (const test of tests) {
      console.log(`📝 Test: ${test.name}`);
      console.log(`   Domain: ${test.domain}`);

      try {
        const response = await axios.post(
          `http://localhost:${PORT}/api/domain/check`,
          { domain: test.domain }
        );

        console.log(`   Status: ${response.data.available ? '✅ Available' : '❌ Not Available'}`);
        console.log(`   Message: ${response.data.message}`);
        
        if (!response.data.available && response.data.suggestions) {
          console.log(`   Suggestions (${response.data.suggestions.length}):`);
          response.data.suggestions.slice(0, 3).forEach((suggestion, i) => {
            console.log(`     ${i + 1}. ${suggestion}`);
          });
          if (response.data.suggestions.length > 3) {
            console.log(`     ... and ${response.data.suggestions.length - 3} more`);
          }
        }

      } catch (error) {
        console.log(`   Error: ${error.response?.data?.message || error.message}`);
      }

      console.log('');
    }

    // Test bulk check
    console.log('='.repeat(80));
    console.log('\n📝 Test: Bulk Domain Check');
    
    try {
      const bulkDomains = [
        'test1.com',
        'test2.net', 
        'google.com',
        'my-test-domain-123.pk'
      ];
      
      console.log(`   Domains: ${bulkDomains.join(', ')}`);
      
      const bulkResponse = await axios.post(
        `http://localhost:${PORT}/api/domain/bulk-check`,
        { domains: bulkDomains }
      );

      console.log(`   Results: ${bulkResponse.data.availableCount}/${bulkResponse.data.totalChecked} available`);
      
      bulkResponse.data.results.forEach(result => {
        console.log(`     ${result.domain}: ${result.available ? '✅' : '❌'} ${result.message}`);
      });

    } catch (error) {
      console.log(`   Error: ${error.response?.data?.message || error.message}`);
    }

    // Test validation
    console.log('\n='.repeat(80));
    console.log('\n📝 Test: Invalid Domain Validation');
    
    try {
      await axios.post(
        `http://localhost:${PORT}/api/domain/check`,
        { domain: 'invalid-domain' }
      );
    } catch (error) {
      console.log(`   ✅ Validation working: ${error.response.data.message}`);
    }

    console.log('\n='.repeat(80));
    console.log('\n✅ Domain API testing completed!\n');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testDomainAPI();