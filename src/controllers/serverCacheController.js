const { 
  getServerDataOptimized,
  refreshServerDataCache,
  getServerStats,
  clearServerCache,
  healthCheck
} = require('../services/mongoServerService');

/**
 * Server Cache Controller - Manages MongoDB-cached server data
 */

/**
 * Get cached server data
 */
exports.getCachedServerData = async (req, res, next) => {
  console.log('[GET /api/server-cache]');
  
  try {
    const serverData = await getServerDataOptimized();
    
    console.log(`→ Returning cached server data (${serverData.serverIPs.length} IPs, source: ${serverData.source})`);
    
    return res.json({
      success: true,
      ...serverData
    });
    
  } catch (err) {
    console.log('✗ Error getting cached server data:', err.message);
    next(err);
  }
};

/**
 * Force refresh server cache from WHMCS
 */
exports.refreshServerCache = async (req, res, next) => {
  console.log('[POST /api/server-cache/refresh]');
  
  try {
    const refreshedData = await refreshServerDataCache(true);
    
    console.log(`→ Server cache refreshed (${refreshedData.serverIPs.length} IPs)`);
    
    return res.json({
      success: true,
      message: 'Server cache refreshed successfully',
      ...refreshedData
    });
    
  } catch (err) {
    console.log('✗ Error refreshing server cache:', err.message);
    next(err);
  }
};

/**
 * Get server cache statistics
 */
exports.getServerCacheStats = async (req, res, next) => {
  console.log('[GET /api/server-cache/stats]');
  
  try {
    const stats = await getServerStats();
    
    console.log(`→ Server cache stats: ${stats.totalServers} servers, status: ${stats.cacheStatus}`);
    
    return res.json({
      success: true,
      stats: stats
    });
    
  } catch (err) {
    console.log('✗ Error getting server cache stats:', err.message);
    next(err);
  }
};

/**
 * Clear server cache
 */
exports.clearServerCache = async (req, res, next) => {
  console.log('[DELETE /api/server-cache]');
  
  try {
    const deletedCount = await clearServerCache();
    
    console.log(`→ Cleared ${deletedCount} server cache entries`);
    
    return res.json({
      success: true,
      message: `Cleared ${deletedCount} server cache entries`,
      deletedCount: deletedCount
    });
    
  } catch (err) {
    console.log('✗ Error clearing server cache:', err.message);
    next(err);
  }
};

/**
 * Health check for server cache system
 */
exports.healthCheck = async (req, res, next) => {
  console.log('[GET /api/server-cache/health]');
  
  try {
    const health = await healthCheck();
    
    const isHealthy = health.mongodb === 'connected' && health.cacheStatus !== 'error';
    
    return res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      health: health
    });
    
  } catch (err) {
    console.log('✗ Error checking server cache health:', err.message);
    return res.status(503).json({
      success: false,
      health: {
        mongodb: 'error',
        error: err.message
      }
    });
  }
};

module.exports = exports;