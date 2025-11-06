/**
 * Quick API test script
 */

require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/database');

async function testAPI() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start server
    const PORT = 4001;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Test server running on :${PORT}`);
    });

    // Wait a bit for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test the API
    const axios = require('axios');
    
    console.log('\n📝 Testing recommendation API with MongoDB...\n');
    
    const testRequest = {
      purpose: 'Blog',
      websites_count: '2-3',
      tech_stack: 'Linux',
      cms: 'WordPress',
      email_needed: true,
      storage_needed_gb: 12,
      monthly_budget: 10,
      free_domain: true,
      migrate_from_existing_host: false,
      email_deliverability_priority: false
    };

    const response = await axios.post(`http://localhost:${PORT}/api/recommendations`, testRequest);
    
    console.log('✅ API Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.matches && response.data.matches.length > 0) {
      console.log('\n📊 Recommendations:');
      response.data.matches.forEach((plan, index) => {
        console.log(`\n${index + 1}. ${plan.name}`);
        console.log(`   Confidence: ${plan.confidence}%`);
        console.log(`   Price: $${plan.pricing.USD.monthly}/mo`);
        console.log(`   Storage: ${plan.diskspace} GB`);
        console.log(`   Free Domain: ${plan.freedomain ? 'Yes' : 'No'}`);
      });
    }

    console.log('\n✅ MongoDB integration working successfully!');
    
    server.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAPI();
