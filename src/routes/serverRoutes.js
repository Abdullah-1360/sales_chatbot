const router = require('express').Router();
const { 
  getServers, 
  getServerById, 
  getServerDNSInfo, 
  getServerStats 
} = require('../controllers/serverController');

/**
 * Server Routes
 * Handles WHMCS server-related endpoints
 */

// Get all servers (with optional filtering)
// GET /servers?active=true - Get active servers only
// GET /servers?id=123 - Get specific server by ID
router.get('/', getServers);

// Get server statistics
router.get('/stats', getServerStats);

// Get server DNS information (IPs, mail servers, nameservers)
router.get('/dns-info', getServerDNSInfo);

// Get specific server by ID
router.get('/:id', getServerById);

module.exports = router;