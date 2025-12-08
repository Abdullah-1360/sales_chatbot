/**
 * Simple test for /api/myAccount endpoint
 * Demonstrates the simplified response with id and name only
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_EMAIL = process.env.TEST_EMAIL || 'abdullahshahid906@gmail.com';

console.log('🧪 Testing /api/myAccount - Simplified Response\n');
console.log('='.repeat(80));

async function testMyAccount() {
  try {
    console.log('Request:');
    console.log('  POST /api/myAccount');
    console.log('  Body:', JSON.stringify({ email: TEST_EMAIL }, null, 2));
    console.log('');
    
    const { data } = await axios.post(`${BASE_URL}/myAccount`, {
      email: TEST_EMAIL
    });
    
    console.log('✅ SUCCESS\n');
    console.log('Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');
    
    console.log('='.repeat(80));
    console.log('Summary:');
    console.log(`  • Client ID: ${data.clientId}`);
    console.log(`  • Total Items: ${data.totalItems}`);
    console.log('');
    
    if (data.items && data.items.length > 0) {
      console.log('Items:');
      data.items.forEach((item, index) => {
        console.log(`  ${index + 1}. ID: ${item.id}, Name: ${item.name}`);
      });
    }
    
    console.log('');
    console.log('='.repeat(80));
    console.log('Use Cases:');
    console.log('  1. Chatbot: "Show me all my services and domains"');
    console.log('     → Bot displays simple list of names');
    console.log('');
    console.log('  2. Dropdown menu: Select a service/domain');
    console.log('     → Use id for selection, name for display');
    console.log('');
    console.log('  3. Quick overview: Count total items');
    console.log('     → "You have ' + data.totalItems + ' services and domains"');
    console.log('');
    console.log('='.repeat(80));
    console.log('Comparison with other endpoints:');
    console.log('');
    console.log('  /api/myServices   → Detailed service info (status, dates, billing)');
    console.log('  /api/myDomains    → Detailed domain info (expiry, registrar)');
    console.log('  /api/myAccount    → Simple list (id + name only) ✨');
    console.log('');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.log('❌ FAILED\n');
    console.log('Error:', error.response?.data || error.message);
  }
}

testMyAccount();
