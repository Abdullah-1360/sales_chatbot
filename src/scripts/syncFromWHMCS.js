/**
 * Manual sync script - Fetch from WHMCS and sync to MongoDB
 */

require('dotenv').config();
const { connectDB } = require('../config/database');
const { syncAllProducts, syncGID } = require('../services/whmcsSync');

async function main() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Get GID from command line argument (optional)
    const gid = process.argv[2];

    if (gid) {
      // Sync specific GID
      console.log(`\n🎯 Syncing specific GID: ${gid}\n`);
      const result = await syncGID(parseInt(gid));
      
      if (result.success) {
        console.log(`✅ Successfully synced ${result.count} products for GID ${gid}`);
      } else {
        console.error(`❌ Sync failed: ${result.error || result.message}`);
        process.exit(1);
      }
    } else {
      // Sync all GIDs
      console.log('\n🌐 Syncing all GIDs from WHMCS...\n');
      const result = await syncAllProducts();
      
      if (result.success) {
        console.log(`\n✅ Successfully synced ${result.totalInserted} products`);
      } else {
        console.error(`\n❌ Sync failed: ${result.error || result.message}`);
        process.exit(1);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
