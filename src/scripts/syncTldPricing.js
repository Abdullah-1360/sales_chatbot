// Load .env file only if it exists (optional for production)
try {
  require('dotenv').config();
} catch (err) {
  // Using environment variables directly
}

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
    console.log(`   Currency: PKR (fetched directly from WHMCS)\n`);
    process.exit(0);
  } catch (err) {
    console.error('❌ TLD pricing sync failed:', err.message);
    process.exit(1);
  }
})();


