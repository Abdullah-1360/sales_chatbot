/**
 * WHM Routes
 * Routes for WHM (Web Host Manager) integration
 */

const express = require('express');
const router = express.Router();
const whmController = require('../controllers/whmController');

// ========================================
// SERVER MANAGEMENT
// ========================================

// GET /whm/test - Test WHM connection
router.get('/test', whmController.testConnection);

// GET /whm/servers - Get list of available servers
router.get('/servers', whmController.getAvailableServers);

// GET /whm/server/status - Get server status and information
router.get('/server/status', whmController.getServerStatus);

// GET /whm/packages - Get hosting packages
router.get('/packages', whmController.getPackages);

// ========================================
// ACCOUNT MANAGEMENT
// ========================================

// POST /whm/account/domain - Get account by domain
router.post('/account/domain', whmController.getAccountByDomain);

// POST /whm/account/status - Get account status and details
router.post('/account/status', whmController.getAccountStatus);

// POST /whm/account/usage - Get account resource usage
router.post('/account/usage', whmController.getAccountUsage);

// POST /whm/account/create - Create new cPanel account
router.post('/account/create', whmController.createAccount);

// POST /whm/account/suspend - Suspend account
router.post('/account/suspend', whmController.suspendAccount);

// POST /whm/account/unsuspend - Unsuspend account
router.post('/account/unsuspend', whmController.unsuspendAccount);

// ========================================
// DNS MANAGEMENT
// ========================================

// POST /whm/dns/add-a-record - Add missing A record to DNS zone file
router.post('/dns/add-a-record', whmController.addMissingARecord);

// POST /whm/dns/auto-fix-a-record - Auto-fix missing A record (find server automatically)
router.post('/dns/auto-fix-a-record', whmController.autoFixMissingARecord);

// POST /whm/dns/remove-duplicate-a-records - Remove duplicate A records from zone file
router.post('/dns/remove-duplicate-a-records', whmController.removeDuplicateARecords);

// ========================================
// INTEGRATION & SYNC
// ========================================

// POST /whm/sync/service - Sync WHMCS service with WHM account
router.post('/sync/service', whmController.syncServiceWithWHM);

module.exports = router;