const router = require('express').Router();
const { 
  getCachedServerData,
  refreshServerCache,
  getServerCacheStats,
  clearServerCache,
  healthCheck
} = require('../controllers/serverCacheController');

/**
 * Server Cache Routes
 * Manages MongoDB-cached WHMCS server data
 */

// Get cached server data (optimized)
router.get('/', getCachedServerData);

// Get server cache statistics
router.get('/stats', getServerCacheStats);

// Health check for cache system
router.get('/health', healthCheck);

// Force refresh server cache from WHMCS
router.post('/refresh', refreshServerCache);

// Clear server cache
router.delete('/', clearServerCache);

module.exports = router;