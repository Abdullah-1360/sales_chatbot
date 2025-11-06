/**
 * Test Windows → WordPress API integration
 */

require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const axios = require('axios');

async function testWindowsAPI() {
  try {
    await connectDB();

    const PORT = 4002;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Test server running on :${PORT}`);
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n🧪 Testing Windows → WordPress API Integration\n');

    // Test: Windows tech_stack should return WordPress plans
    const windowsRequest = {
      purpose: 'Blog',
      websites_count: '2-3',
      tech_stack: 'Windows',
      cms: 'None',
      email_needed: true,
      storage_needed_gb: 10,
      monthly_budget: 15,
      free_domain: true,
      migrate_from_existing_host: false,
      email_deliverability_priority: false
    };

    console.log('📝 Request:');
    console.log(JSON.stringify(windowsRequest, null, 2));

    const response = await axios.post(
      `http://localhost:${PORT}/api/recommendations`,
      windowsRequest
    );

    console.log('\n✅ Response:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.matches && response.data.matches.length > 0) {
      console.log('\n📊 Recommendations Summary:');
      response.data.matches.forEach((plan, index) => {
        console.log(`\n${index + 1}. ${plan.name} (PID: ${plan.pid}, GID: ${plan.gid})`);
        console.log(`   Confidence: ${plan.confidence}%`);
        console.log(`   Price: $${plan.pricing.USD.monthly}/mo`);
        console.log(`   Storage: ${plan.diskspace} GB`);
        console.log(`   Free Domain: ${plan.freedomain ? 'Yes' : 'No'}`);
      });

      // Verify all plans are from GID 20 (WordPress)
      const allWordPress = response.data.matches.every(p => p.gid === '20');
      console.log(`\n${allWordPress ? '✅' : '❌'} All plans are WordPress (GID 20): ${allWordPress}`);
      
      if (!allWordPress) {
        console.error('❌ ERROR: Some plans are not WordPress!');
        const gids = response.data.matches.map(p => p.gid);
        console.error('Found GIDs:', gids);
      }
    } else {
      console.log('\n⚠️  No recommendations returned');
    }

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

testWindowsAPI();
