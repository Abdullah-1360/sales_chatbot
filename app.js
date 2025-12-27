#!/usr/bin/env node

/**
 * cPanel Node.js Application Entry Point
 * Passenger/LiteSpeed handles the HTTP server.
 * 
 * NOTE: WebSocket support on cPanel/Passenger is limited.
 * For full WebSocket support, consider using server.js with a VPS.
 */

// Load environment variables (if .env exists)
try {
  require('dotenv').config();
} catch (err) {
  // No .env defined — ignore
}

const http = require('http');
const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { syncAllProducts, scheduleSync } = require('./src/services/whmcsSync');
const { upsertAllTldPricing } = require('./src/services/tldPricing');
const { scheduleLeadCleanup } = require('./src/services/leadCleanup');
const jobScheduler = require('./src/services/jobScheduler');
const cfg = require('./src/config');

// WebSocket initialization (disabled for cPanel/Passenger)
// Passenger doesn't support WebSocket on most shared hosting
// Use polling or upgrade to VPS for real-time features
let httpServer;
let io;

if (process.env.ENABLE_WEBSOCKET === 'true') {
  try {
    const { initializeWebSocket } = require('./src/services/websocket');
    
    // Create HTTP server for WebSocket
    httpServer = http.createServer(app);
    
    // Initialize WebSocket with CORS support
    const corsOrigin = '*';
    const wsOrigins = corsOrigin.includes(',') 
      ? corsOrigin.split(',').map(origin => origin.trim())
      : [corsOrigin];
    
    // Add ngrok support
    if (!wsOrigins.some(o => o.includes('ngrok'))) {
      wsOrigins.push('https://granularly-meticulous-sarahi.ngrok-free.dev');
    }
    
    io = initializeWebSocket(httpServer, { corsOrigin: wsOrigins });
    console.log('🔌 WebSocket initialized');
  } catch (error) {
    console.warn('⚠️  WebSocket initialization failed:', error.message);
  }
} else {
  console.log('🔌 WebSocket disabled (set ENABLE_WEBSOCKET=true to enable)');
  console.log('💡 Note: Most shared cPanel hosting does not support WebSocket');
}

(async () => {
  try {
    // Connect to MongoDB if enabled
    if (cfg.USE_MONGODB) {
      await connectDB();

      // Disable auto-sync on startup for cPanel to avoid memory issues
      // Run sync manually or via cron job instead
      if (cfg.AUTO_SYNC_ON_STARTUP && process.env.ENABLE_AUTO_SYNC === 'true') {
        console.log('\n🔄 Auto-sync enabled, fetching products and TLD pricing...\n');
        console.log('⚠️  Note: This may cause memory issues on shared hosting\n');

        try {
          // Run sequentially to reduce memory usage
          const productsResult = await syncAllProducts();
          
          if (productsResult?.success) {
            console.log(`✅ Product sync complete: ${productsResult.totalInserted} products loaded`);
          }
          
          // Small delay to allow garbage collection
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const tldResult = await upsertAllTldPricing().catch(err => {
            console.warn(`⚠️  TLD pricing sync failed: ${err.message}`);
            return { success: false, error: err.message };
          });

          if (tldResult?.success) {
            const total = (tldResult.upserted || 0) + (tldResult.modified || 0);
            console.log(`✅ TLD pricing sync complete: ${total} TLDs loaded`);
          }
          console.log('');
        } catch (e) {
          console.warn(`⚠️ Sync error: ${e.message}`);
          console.warn('⚠️ Continuing without sync data...');
        }
      } else if (cfg.AUTO_SYNC_ON_STARTUP) {
        console.log('⚠️  Auto-sync disabled on startup to prevent memory issues');
        console.log('💡 Set ENABLE_AUTO_SYNC=true to enable (not recommended on shared hosting)');
      }

      // Disable periodic sync on shared hosting to prevent memory issues
      if (cfg.SYNC_INTERVAL_HOURS > 0 && process.env.ENABLE_PERIODIC_SYNC === 'true') {
        scheduleSync(cfg.SYNC_INTERVAL_HOURS);
        console.log(`⏰ Periodic sync enabled: every ${cfg.SYNC_INTERVAL_HOURS} hours`);
      } else if (cfg.SYNC_INTERVAL_HOURS > 0) {
        console.log('⏰ Periodic sync disabled (set ENABLE_PERIODIC_SYNC=true to enable)');
      }
      
      // Schedule automatic lead cleanup (lightweight operation)
      scheduleLeadCleanup();
      console.log('🧹 Lead cleanup scheduled (runs every hour)');
      
      // Initialize job scheduler for cPHulk IP removal
      try {
        await jobScheduler.initialize();
        await jobScheduler.startPeriodicCleanup();
        console.log('⏰ Job scheduler initialized for cPHulk IP removal');
      } catch (error) {
        console.warn('⚠️  Job scheduler initialization failed:', error.message);
        console.warn('⚠️  cPHulk IP removal scheduling will use fallback logging');
      }
    }

  } catch (error) {
    console.error('Startup Error:', error.message);
  }
})();


console.log(`🚀 App initialized — waiting for Passenger to bind the server`);
console.log(`📦 MongoDB: ${cfg.USE_MONGODB ? 'enabled' : 'disabled'}`);
console.log(`🔄 Auto-sync: disabled (prevents memory issues on shared hosting)`);
console.log(`💡 Tip: Use cron jobs for data sync instead of auto-sync`);

// Export the HTTP server if WebSocket is initialized, otherwise export app
module.exports = httpServer || app;
