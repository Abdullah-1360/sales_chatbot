const mongoose = require('mongoose');
const { getAllServers, extractServerIPs, extractMailServers, extractNameservers } = require('./serverService');

/**
 * MongoDB Server Service - Caches WHMCS server data in MongoDB
 * Provides high-performance server information retrieval for DNS checking
 */

// Cache configuration
const CACHE_TTL_MINUTES = parseInt(process.env.SERVER_CACHE_TTL_MINUTES) || 30; // 30 minutes default
const FORCE_REFRESH_HOURS = parseInt(process.env.SERVER_FORCE_REFRESH_HOURS) || 24; // 24 hours force refresh

// Server cache schema - stores raw WHMCS data
const serverCacheSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    default: 'whmcs_servers'
  },
  // Raw WHMCS GetServers response
  rawWhmcsData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // Extracted data for quick access (computed from rawWhmcsData)
  serverIPs: [{
    type: String
  }],
  mailServers: [{
    type: String
  }],
  nameservers: [{
    type: String
  }],
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  },
  totalServers: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create model
const ServerCache = mongoose.model('ServerCache', serverCacheSchema);

/**
 * Initialize MongoDB connection (using existing mongoose connection)
 */
async function initializeMongoDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('✅ Using existing MongoDB connection for server cache');
      return true;
    }
    
    if (mongoose.connection.readyState === 0) {
      const MONGODB_URI = process.env.MONGODB_URI ;
      console.log('🔌 Connecting to MongoDB for server cache...');
      await mongoose.connect(MONGODB_URI);
      console.log('✅ MongoDB connection established for server cache');
    }
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

/**
 * Close MongoDB connection
 */
async function closeMongoDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error.message);
  }
}

/**
 * Get cached server data from MongoDB
 * NOTE: No TTL checking - cache is used as-is until server restart
 * Cache is only refreshed on server startup (via AUTO_SYNC_ON_STARTUP)
 * @returns {Object|null} Cached server data or null if not found
 */
async function getCachedServerData() {
  try {
    await initializeMongoDB();
    
    // Find the most recent server data
    const cachedData = await ServerCache.findOne(
      { type: 'whmcs_servers' }
    ).sort({ lastUpdated: -1 });
    
    if (!cachedData) {
      console.log('📭 No cached server data found in MongoDB');
      return null;
    }
    
    const now = new Date();
    const lastUpdated = new Date(cachedData.lastUpdated);
    const ageMinutes = (now - lastUpdated) / (1000 * 60);
    
    // Return cached data regardless of age
    // Cache is only refreshed on server startup
    console.log(`📦 Using cached server data (${Math.round(ageMinutes)} minutes old, last updated: ${lastUpdated.toISOString()})`);
    
    return {
      rawWhmcsData: cachedData.rawWhmcsData,
      serverIPs: cachedData.serverIPs || [],
      mailServers: cachedData.mailServers || [],
      nameservers: cachedData.nameservers || [],
      lastUpdated: cachedData.lastUpdated,
      source: 'mongodb_cache',
      cacheAgeMinutes: Math.round(ageMinutes)
    };
    
  } catch (error) {
    console.error('❌ Error getting cached server data:', error.message);
    return null;
  }
}

/**
 * Save raw WHMCS server data to MongoDB cache
 * @param {Object} rawWhmcsData - Raw WHMCS GetServers response
 */
async function saveServerDataToCache(rawWhmcsData) {
  try {
    await initializeMongoDB();
    
    // Extract servers array from raw WHMCS response
    const serversRaw = rawWhmcsData.servers || {};
    const servers = serversRaw.server || serversRaw;
    const serverArray = Array.isArray(servers) ? servers : (servers ? [servers] : []);
    
    // Extract data for quick access (but keep raw data intact)
    const serverIPs = extractServerIPs(serverArray);
    const mailServers = extractMailServers(serverArray);
    const nameservers = extractNameservers(serverArray);
    
    const cacheDocument = {
      type: 'whmcs_servers',
      rawWhmcsData: rawWhmcsData, // Store complete raw WHMCS response
      serverIPs: serverIPs,
      mailServers: mailServers,
      nameservers: nameservers,
      lastUpdated: new Date(),
      totalServers: serverArray.length,
      createdAt: new Date()
    };
    
    // Replace existing cache (upsert)
    await ServerCache.findOneAndUpdate(
      { type: 'whmcs_servers' },
      cacheDocument,
      { upsert: true, new: true }
    );
    
    console.log(`💾 Saved raw WHMCS server data to MongoDB cache (${cacheDocument.totalServers} servers)`);
    
    // Clean up old cache entries (keep only the latest)
    await ServerCache.deleteMany({
      type: 'whmcs_servers',
      lastUpdated: { $ne: cacheDocument.lastUpdated }
    });
    
    return cacheDocument;
    
  } catch (error) {
    console.error('❌ Error saving server data to cache:', error.message);
    throw error;
  }
}

/**
 * Refresh server data from WHMCS and update cache
 * @param {boolean} force - Force refresh even if cache is fresh
 * @returns {Object} Updated server data
 */
async function refreshServerDataCache(force = false) {
  try {
    console.log('🔄 Refreshing server data from WHMCS...');
    
    // Get raw WHMCS data directly
    const rawWhmcsData = await getAllServers();
    
    // Save raw data to MongoDB cache
    await saveServerDataToCache(rawWhmcsData);
    
    console.log('✅ Server data cache refreshed successfully');
    
    // Extract data for return (but raw data is stored in MongoDB)
    const serversRaw = rawWhmcsData.servers || {};
    const servers = serversRaw.server || serversRaw;
    const serverArray = Array.isArray(servers) ? servers : (servers ? [servers] : []);
    
    return {
      rawWhmcsData: rawWhmcsData,
      serverIPs: extractServerIPs(serverArray),
      mailServers: extractMailServers(serverArray),
      nameservers: extractNameservers(serverArray),
      lastUpdated: new Date().toISOString(),
      source: 'whmcs_fresh',
      cacheAgeMinutes: 0
    };
    
  } catch (error) {
    console.error('❌ Error refreshing server data cache:', error.message);
    throw error;
  }
}

/**
 * Get server data with intelligent caching
 * NOTE: Cache is only refreshed on server startup (via AUTO_SYNC_ON_STARTUP)
 * No automatic background refresh based on TTL
 * @returns {Object} Server data from cache or fresh from WHMCS
 */
async function getServerDataOptimized() {
  try {
    // Try to get cached data first
    const cachedData = await getCachedServerData();
    
    if (cachedData) {
      // Return cached data (regardless of age)
      // Cache is only refreshed on server startup
      console.log(`📦 Using cached server data (${cachedData.cacheAgeMinutes} minutes old)`);
      return cachedData;
    }
    
    // No cached data found - fetch fresh data
    console.log('📡 No cache found, fetching fresh server data from WHMCS...');
    return await refreshServerDataCache();
    
  } catch (error) {
    console.error('❌ Error getting optimized server data:', error.message);
    
    // Try to return any cached data as fallback (even if expired)
    try {
      const fallbackData = await getCachedServerData();
      if (fallbackData) {
        console.log('🆘 Using cached data as fallback (even if expired)');
        return {
          ...fallbackData,
          source: 'mongodb_fallback_expired'
        };
      }
    } catch (fallbackError) {
      console.error('❌ Fallback cache retrieval failed:', fallbackError.message);
    }
    
    throw error;
  }
}

/**
 * Get server statistics from cache
 * @returns {Object} Server statistics
 */
async function getServerStats() {
  try {
    await initializeMongoDB();
    
    const cachedData = await ServerCache.findOne(
      { type: 'whmcs_servers' }
    ).sort({ lastUpdated: -1 });
    
    if (!cachedData) {
      return {
        totalServers: 0,
        lastUpdated: null,
        cacheStatus: 'empty'
      };
    }
    
    const now = new Date();
    const lastUpdated = new Date(cachedData.lastUpdated);
    const ageMinutes = (now - lastUpdated) / (1000 * 60);
    
    return {
      totalServers: cachedData.totalServers || 0,
      serverIPs: cachedData.serverIPs ? cachedData.serverIPs.length : 0,
      mailServers: cachedData.mailServers ? cachedData.mailServers.length : 0,
      nameservers: cachedData.nameservers ? cachedData.nameservers.length : 0,
      lastUpdated: cachedData.lastUpdated,
      cacheAgeMinutes: Math.round(ageMinutes),
      cacheStatus: ageMinutes <= CACHE_TTL_MINUTES ? 'fresh' : 'expired'
    };
    
  } catch (error) {
    console.error('❌ Error getting server stats:', error.message);
    return {
      totalServers: 0,
      lastUpdated: null,
      cacheStatus: 'error',
      error: error.message
    };
  }
}

/**
 * Clear server data cache
 */
async function clearServerCache() {
  try {
    await initializeMongoDB();
    
    const result = await ServerCache.deleteMany({ type: 'whmcs_servers' });
    console.log(`🗑️ Cleared ${result.deletedCount} server cache entries`);
    
    return result.deletedCount;
    
  } catch (error) {
    console.error('❌ Error clearing server cache:', error.message);
    throw error;
  }
}

/**
 * Health check for MongoDB connection
 */
async function healthCheck() {
  try {
    await initializeMongoDB();
    
    // Check connection
    const connectionState = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    
    const stats = await getServerStats();
    
    return {
      mongodb: states[connectionState] || 'unknown',
      database: mongoose.connection.name || 'unknown',
      collection: 'servercaches',
      cacheStatus: stats.cacheStatus,
      totalServers: stats.totalServers,
      lastUpdated: stats.lastUpdated
    };
    
  } catch (error) {
    return {
      mongodb: 'disconnected',
      error: error.message
    };
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down MongoDB server cache...');
  await closeMongoDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down MongoDB server cache...');
  await closeMongoDB();
  process.exit(0);
});

module.exports = {
  initializeMongoDB,
  closeMongoDB,
  getCachedServerData,
  saveServerDataToCache,
  refreshServerDataCache,
  getServerDataOptimized,
  getServerStats,
  clearServerCache,
  healthCheck
};