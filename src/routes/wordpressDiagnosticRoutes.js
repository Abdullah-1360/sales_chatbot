const router = require('express').Router();
const wordpressDiagnosticController = require('../controllers/wordpressDiagnosticController');

/**
 * WordPress Database Diagnostic Routes
 * 
 * These endpoints provide comprehensive WordPress database connection
 * diagnosis and automated remediation capabilities.
 */

/**
 * POST /wordpress/diagnose
 * 
 * Full diagnostic workflow including:
 * - Automatic cPanel credential resolution from WHMCS/WHM
 * - Guard checks (WHMCS product, DNS, WordPress installation)
 * - wp-config.php parsing
 * - Database connection testing
 * - Error diagnosis and root cause analysis
 * - Automated remediation with safe defaults
 * 
 * Body Parameters:
 * - domain (required): Domain to diagnose
 * - email (optional): Client email address for identification
 * - phone (optional): Client phone number for identification
 * Note: Either email or phone is required for client identification
 * 
 * All other settings use secure defaults:
 * - WordPress path: public_html
 * - Remediation: enabled with safe settings (no destructive actions)
 * - Guards: all enabled for security
 */
router.post('/diagnose', wordpressDiagnosticController.diagnoseDatabase);

/**
 * POST /wordpress/quick-test
 * 
 * Lightweight connection test that:
 * - Automatically resolves cPanel credentials from WHMCS/WHM
 * - Parses wp-config.php from default location
 * - Tests database connection
 * - Returns basic success/failure with error details
 * 
 * Body Parameters:
 * - domain (required): Domain to test
 * - email (optional): Client email address for identification
 * - phone (optional): Client phone number for identification
 * Note: Either email or phone is required for client identification
 */
router.post('/quick-test', wordpressDiagnosticController.quickTest);

/**
 * GET /wordpress/capabilities
 * 
 * Returns diagnostic service capabilities including:
 * - Available guard checks
 * - Diagnosis features
 * - Remediation options
 * - Security features
 * - Required permissions for each feature
 */
router.get('/capabilities', wordpressDiagnosticController.getCapabilities);

/**
 * GET /wordpress/health
 * 
 * Health check endpoint for monitoring service status
 */
router.get('/health', wordpressDiagnosticController.healthCheck);

module.exports = router;