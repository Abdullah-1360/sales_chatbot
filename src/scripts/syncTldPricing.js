require('dotenv').config();
const { connectDB } = require('../config/database');
const { upsertAllTldPricing } = require('../services/tldPricing');

(async () => {
  try {
    await connectDB();
    console.log('🔄 Syncing TLD pricing from WHMCS...\n');
    const result = await upsertAllTldPricing();
    console.log(`\n✅ Sync completed!`);
    console.log(`   Upserted: ${result.upserted}`);
    console.log(`   Modified: ${result.modified}`);
    console.log(`   Exchange Rate: 1 USD = ${result.exchangeRate} PKR`);
    console.log(`   Rate Date: ${result.exchangeDate?.toISOString().split('T')[0] || 'N/A'}\n`);
    process.exit(0);
  } catch (err) {
    console.error('❌ TLD pricing sync failed:', err.message);
    process.exit(1);
  }
})();


