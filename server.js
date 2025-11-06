require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { syncAllProducts, scheduleSync } = require('./src/services/whmcsSync');
const cfg = require('./src/config');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Connect to MongoDB if enabled
    if (cfg.USE_MONGODB) {
      await connectDB();
      
      // Auto-sync on startup if enabled
      if (cfg.AUTO_SYNC_ON_STARTUP) {
        console.log('\n🔄 Auto-sync enabled, fetching products from WHMCS...\n');
        const result = await syncAllProducts();
        
        if (result.success) {
          console.log(`✅ Initial sync completed: ${result.totalInserted} products loaded\n`);
        } else {
          console.warn(`⚠️  Initial sync failed: ${result.error || result.message}`);
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