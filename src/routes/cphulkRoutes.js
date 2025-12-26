const router = require('express').Router();
const cphulkController = require('../controllers/cphulkController');

/**
 * cPHulk Management Routes
 * 
 * These endpoints provide cPHulk failed login monitoring and whitelisting capabilities.
 */

/**
 * POST /cphulk/check-failed-logins
 * 
 * Check failed login attempts for a specific IP address including:
 * - Automatic client credential resolution from WHMCS/WHM
 * - Service/domain status validation (active, not expired/terminated/suspended)
 * - Failed login retrieval from cPHulk
 * - Detailed login attempt information with country, service, and timing data
 * 
 * Body Parameters:
 * - ip (required): IP address to check for failed logins
 * - domain (optional): Domain to validate ownership and server location
 * - email (optional): Client email address for identification
 * - phone (optional): Client phone number for identification
 * Note: Either email or phone is required for client identification when domain is provided
 */
router.post('/check-failed-logins', cphulkController.checkFailedLogins);

/**
 * POST /cphulk/whitelist-ip
 * 
 * Whitelist an IP address in cPHulk including:
 * - Client credential resolution and validation
 * - Service/domain status checks
 * - IP whitelisting in cPHulk system
 * - Automatic failed login cleanup for the IP
 * 
 * Body Parameters:
 * - ip (required): IP address to whitelist
 * - domain (optional): Domain to validate ownership and server location
 * - email (optional): Client email address for identification
 * - phone (optional): Client phone number for identification
 * - reason (optional): Reason for whitelisting (for logging purposes)
 * Note: Either email or phone is required for client identification when domain is provided
 */
router.post('/whitelist-ip', cphulkController.whitelistIP);

/**
 * GET /cphulk/capabilities
 * 
 * Returns cPHulk service capabilities including:
 * - Available monitoring features
 * - Whitelisting options
 * - Security features
 * - Required permissions for each feature
 */
router.get('/capabilities', cphulkController.getCapabilities);

/**
 * GET /cphulk/health
 * 
 * Health check endpoint for monitoring cPHulk service status
 */
router.get('/health', cphulkController.healthCheck);

module.exports = router;