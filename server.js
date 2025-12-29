// Load .env file only if it exists (optional for production)
try {
  require('dotenv').config();
} catch (err) {
  // Using environment variables directly
}

const http = require('http');
const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { syncAllProducts, scheduleSync } = require('./src/services/whmcsSync');
const { upsertAllTldPricing } = require('./src/services/tldPricing');
const { initializeWebSocket } = require('./src/services/websocket');
const { scheduleLeadCleanup } = require('./src/services/leadCleanup');
const localIPCache = require('./src/services/localIPCache');
const cfg = require('./src/config');

const PORT = process.env.PORT || 3000;

// Create HTTP server
const httpServer = http.createServer(app);

async function startServer() {
  try {
    // Initialize local machine IP detection at startup
    try {
      await localIPCache.initialize();
    } catch (error) {
      console.warn(`⚠️  Local IP detection failed: ${error.message}`);
      console.warn('⚠️  MySQL host management may not work properly');
    }
    
    // Connect to MongoDB if enabled
    if (cfg.USE_MONGODB) {
      await connectDB();
      
      // Initialize server cache on startup
      console.log('🔄 Initializing server cache from WHMCS...');
      try {
        const { refreshServerDataCache } = require('./src/services/mongoServerService');
        const serverData = await refreshServerDataCache();
        console.log(`✅ Server cache initialized: ${serverData.serverIPs.length} IPs, ${serverData.nameservers.length} nameservers`);
      } catch (error) {
        console.warn(`⚠️  Server cache initialization failed: ${error.message}`);
        console.warn('⚠️  DNS checking may use fallback data');
      }
      
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
    
    // Initialize WebSocket server
    const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
    
    // Support multiple origins for WebSocket
    const wsOrigins = corsOrigin.includes(',') 
      ? corsOrigin.split(',').map(origin => origin.trim())
      : [corsOrigin];
    
    // Add ngrok support
    wsOrigins.push('https://granularly-meticulous-sarahi.ngrok-free.dev');
    
    initializeWebSocket(httpServer, { corsOrigin: wsOrigins });
    
    // Schedule automatic lead cleanup (delete leads older than 24 hours)
    if (cfg.USE_MONGODB) {
      scheduleLeadCleanup();
    }
    
    httpServer.listen(PORT, () => {
      const localIP = localIPCache.getCachedIP();
      console.log(`🚀 API running on :${PORT}`);
      console.log(`🔌 WebSocket server initialized`);
      console.log(`🌐 Local machine IP: ${localIP || 'not detected'}`);
      console.log(`📦 MongoDB: ${cfg.USE_MONGODB ? 'enabled' : 'disabled'}`);
      console.log(`🔄 Auto-sync: ${cfg.AUTO_SYNC_ON_STARTUP ? 'enabled' : 'disabled'}`);
      if (cfg.SYNC_INTERVAL_HOURS > 0) {
        console.log(`⏰ Sync interval: ${cfg.SYNC_INTERVAL_HOURS} hours`);
      }
      if (cfg.USE_MONGODB) {
        console.log(`🧹 Lead cleanup: enabled (runs every hour, deletes leads > 24h old)`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();