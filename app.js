#!/usr/bin/env node

/**
 * cPanel Node.js Application Entry Point
 * Passenger/LiteSpeed handles the HTTP server.
 */

// Load environment variables (if .env exists)
try {
  require('dotenv').config();
} catch (err) {
  // No .env defined — ignore
}

const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { syncAllProducts, scheduleSync } = require('./src/services/whmcsSync');
const { upsertAllTldPricing } = require('./src/services/tldPricing');
const cfg = require('./src/config');

(async () => {
  try {
    // Connect to MongoDB if enabled
    if (cfg.USE_MONGODB) {
      await connectDB();

      if (cfg.AUTO_SYNC_ON_STARTUP) {
        console.log('\n🔄 Auto-sync enabled, fetching products and TLD pricing...\n');

        try {
          const [productsResult, tldResult] = await Promise.all([
            syncAllProducts(),
            upsertAllTldPricing().catch(err => {
              console.warn(`⚠️  TLD pricing sync failed: ${err.message}`);
              return { success: false, error: err.message };
            })
          ]);

          if (productsResult?.success) {
            console.log(`✅ Product sync complete: ${productsResult.totalInserted} products loaded`);
          }

          if (tldResult?.success) {
            const total = (tldResult.upserted || 0) + (tldResult.modified || 0);
            console.log(`✅ TLD pricing sync complete: ${total} TLDs loaded`);
          }
          console.log('');
        } catch (e) {
          console.warn(`⚠️ Sync error: ${e.message}`);
        }
      }

      if (cfg.SYNC_INTERVAL_HOURS > 0) {
        scheduleSync(cfg.SYNC_INTERVAL_HOURS);
      }
    }

  } catch (error) {
    console.error('Startup Error:', error.message);
  }
})();

console.log(`🚀 App initialized — waiting for Passenger to bind the server`);
module.exports = app;
