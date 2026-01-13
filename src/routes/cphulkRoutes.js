const router = require('express').Router();
const cphulkController = require('../controllers/cphulkControllerOptimized');

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
 * Whitelist an IP address in cPHulk with enhanced parallel validation including:
 * - Parallel domain/email client resolution
 * - Phone as second-level validation
 * - Service/domain status checks
 * - IP whitelisting in cPHulk system
 * - Automatic failed login cleanup for the IP
 * 
 * Body Parameters:
 * - ip (required): IP address to whitelist
 * - domain (optional): Domain name for client identification
 * - email (optional): Email address for client identification
 * - phone (optional): Phone number for second-level validation
 * - reason (optional): Reason for whitelisting (for logging purposes)
 * 
 * Client Identification:
 * - Either domain OR email is required for client identification
 * - Both can be provided for enhanced validation
 * - Phone serves as second-level validation when provided
 * 
 * Edge Case Handling:
 * - If both domain and email resolve to different clients, domain takes priority
 * - If one parameter is wrong but the other is correct, uses the correct one
 * - Phone validation provides masked error messages with update instructions
 * 
 * Note: Enhanced parallel validation with intelligent fallback for edge cases
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
 * GET /cphulk/debug-csf
 * 
 * Debug CSF response endpoint to see raw CSF API responses
 * Query Parameters:
 * - server (required): Server name to test CSF on (e.g., pcp3, cp1)
 * - ip (optional): IP address to test (defaults to 65.21.229.29)
 */
router.get('/debug-csf', cphulkController.debugCSF);

/**
 * GET /cphulk/test-csf
 * 
 * Test CSF integration endpoint for debugging
 * Query Parameters:
 * - server (required): Server name to test CSF on (e.g., pcp3, cp1)
 * - ip (optional): IP address to test (defaults to 8.8.8.8)
 */
router.get('/test-csf', cphulkController.testCSF);

/**
 * GET /cphulk/health
 * 
 * Health check endpoint for monitoring cPHulk service status
 */
router.get('/health', cphulkController.healthCheck);

/**
 * GET /cphulk/scheduled-removals
 * 
 * Get scheduled IP removals from the job scheduler
 * Query Parameters:
 * - ip (optional): Filter by specific IP address
 * - server (optional): Filter by specific server name
 */
router.get('/scheduled-removals', cphulkController.getScheduledRemovals);

/**
 * POST /cphulk/cancel-scheduled-removal
 * 
 * Cancel a scheduled IP removal
 * Body Parameters:
 * - ip (required): IP address to cancel removal for
 * - server (required): Server name to cancel removal for
 */
router.post('/cancel-scheduled-removal', cphulkController.cancelScheduledRemoval);

/**
 * GET /cphulk/scheduler-stats
 * 
 * Get job scheduler statistics including total jobs, scheduled, running, completed, and failed
 */
router.get('/scheduler-stats', cphulkController.getSchedulerStats);

module.exports = router;