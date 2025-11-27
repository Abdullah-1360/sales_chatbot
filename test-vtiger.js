/**
 * Test script for VTiger lead creation
 * Run: node test-vtiger.js
 */

require('dotenv').config();
const { createLeadFlow } = require('./src/services/vtiger');

async function test() {
  try {
    console.log('Testing VTiger lead creation...\n');
    
    const result = await createLeadFlow({
      username: 'Test User',
      email: 'test@example.com',
      phone: '+923001234567'
    });
    
    console.log('\n✅ Success!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

test();
