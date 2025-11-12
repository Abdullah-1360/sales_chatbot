// Load .env file only if it exists (optional for production)
try {
  require('dotenv').config();
} catch (err) {
  // Using environment variables directly
}

const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { syncAllProducts, scheduleSync } = require('./src/services/whmcsSync');
const { upsertAllTldPricing } = require('./src/services/tldPricing');
const cfg = require('./src/config');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Connect to MongoDB if enabled
    if (cfg.USE_MONGODB) {
      await connectDB();
      
      // Auto-sync on startup if enabled
      if (cfg.AUTO_SYNC_ON_STARTUP) {
        console.log('\n🔄 Auto-sync enabled, fetching products and TLD pricing from WHMCS...\n');
        try {
          // Run sequentially to avoid memory issues with concurrent HTTP requests
          const productsResult = await syncAllProducts();
          
          // Small delay between syncs
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const tldResult = await upsertAllTldPricing().catch(err => {
            console.warn(`⚠️  TLD pricing sync failed: ${err.message}`);
            return { success: false, error: err.message };
          });

          if (productsResult?.success) {
            console.log(`✅ Initial product sync completed: ${productsResult.totalInserted} products loaded`);
          } else {
            console.warn(`⚠️  Initial product sync failed: ${productsResult?.error || productsResult?.message || 'unknown error'}`);
          }

          if (tldResult?.success) {
            const total = (tldResult.upserted || 0) + (tldResult.modified || 0);
            console.log(`✅ TLD pricing sync completed: ${total} TLDs loaded in PKR`);
          } else {
            console.warn(`⚠️  TLD pricing sync failed: ${tldResult?.error || 'unknown error'}`);
          }
          
          console.log('');
        } catch (e) {
          console.warn(`⚠️  Initial sync encountered errors: ${e.message}`);
          console.warn('⚠️  Server will start but may have stale data\n');
        }
      }
      
      // Schedule periodic sync
      if (cfg.SYNC_INTERVAL_HOURS > 0) {
        scheduleSync(cfg.SYNC_INTERVAL_HOURS);
      }
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 API running on :${PORT}`);
      console.log(`📦 MongoDB: ${cfg.USE_MONGODB ? 'enabled' : 'disabled'}`);
      console.log(`🔄 Auto-sync: ${cfg.AUTO_SYNC_ON_STARTUP ? 'enabled' : 'disabled'}`);
      if (cfg.SYNC_INTERVAL_HOURS > 0) {
        console.log(`⏰ Sync interval: ${cfg.SYNC_INTERVAL_HOURS} hours`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();