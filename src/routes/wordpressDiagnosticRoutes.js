const router = require('express').Router();
const wordpressComprehensiveDiagnosticController = require('../controllers/wordpressComprehensiveDiagnosticController');
const wordpressSiteFixesController = require('../controllers/wordpressSiteFixesController');
const wordpressDiagnosticController = require('../controllers/wordpressDiagnosticController');

/**
 * WordPress Comprehensive Diagnostic Routes
 * 
 * Advanced L1/L2/L3 classification system for WordPress issues
 */

/**
 * POST /wordpress/diagnose-comprehensive
 * 
 * Comprehensive WordPress diagnostic with L1/L2/L3 classification:
 * - L1: Primary symptom classification (SITE_DOWN, SERVER_ERROR, etc.)
 * - L2: Secondary symptom refinement (DNS_FAIL, HTTP_500, etc.)
 * - L3: Technical evidence layer (PHP_FATAL, DB_ERROR, etc.)
 * 
 * Body Parameters:
 * - domain (required): Domain to diagnose
 * - phone (optional): Client phone number for identification
 * - frontend_accessible (optional): Boolean - Is frontend accessible?
 * - admin_accessible (optional): Boolean - Is wp-admin accessible?
 * - error_visible (optional): Boolean - Are errors visible to users?
 * - recent_changes (optional): Boolean - Were recent changes made?
 * 
 * Returns comprehensive diagnostic with:
 * - L1/L2/L3 classification
 * - Confidence score
 * - Technical evidence
 * - Actionable recommendations
 * - Server-side analysis (if credentials available)
 */
router.post('/diagnose-comprehensive', wordpressComprehensiveDiagnosticController.diagnoseWordPressSite);

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

/**
 * WordPress Site Fixes Routes
 * 
 * These endpoints provide automated fixes for common WordPress issues
 * with minimal response time and maximum accuracy.
 */

/**
 * POST /wordpress/fix/deactivate-plugin
 * 
 * Branch A: Plugin Deactivation (The "Rename" Trick)
 * Safely deactivates a plugin by renaming its directory without deletion.
 * 
 * Body Parameters:
 * - domain (required): Domain name
 * - email (optional): Client email for identification
 * - phone (optional): Client phone for identification
 * - pluginName (required): Plugin directory name to deactivate
 * - docRoot (optional): Document root path (default: 'public_html')
 */
router.post('/fix/deactivate-plugin', wordpressSiteFixesController.deactivatePlugin);

/**
 * POST /wordpress/fix/increase-memory
 * 
 * Branch B: Memory Increase
 * Increases PHP memory limit to resolve memory exhaustion errors.
 * 
 * Body Parameters:
 * - domain (required): Domain name
 * - email (optional): Client email for identification
 * - phone (optional): Client phone for identification
 * - memoryLimit (optional): Memory limit value (default: '256M')
 * - method (optional): 'php_ini' or 'wp_config' (default: 'php_ini')
 * - docRoot (optional): Document root path (default: 'public_html')
 */
router.post('/fix/increase-memory', wordpressSiteFixesController.increaseMemory);

/**
 * POST /wordpress/fix/htaccess
 * 
 * Branch C: Fix .htaccess (The "Default" Fix)
 * Writes standard WordPress rewrite rules to fix 404/500 errors.
 * 
 * Body Parameters:
 * - domain (required): Domain name
 * - email (optional): Client email for identification
 * - phone (optional): Client phone for identification
 * - backup (optional): Whether to backup existing .htaccess (default: true)
 * - docRoot (optional): Document root path (default: 'public_html')
 */
router.post('/fix/htaccess', wordpressSiteFixesController.fixHtaccess);

/**
 * POST /wordpress/fix/auto
 * 
 * Auto-diagnose and apply appropriate fixes
 * Analyzes error logs and applies the most suitable fix automatically.
 * 
 * Body Parameters:
 * - domain (required): Domain name
 * - email (optional): Client email for identification
 * - phone (optional): Client phone for identification
 * - docRoot (optional): Document root path (default: 'public_html')
 * - memoryLimit (optional): Memory limit for memory fixes (default: '256M')
 * - memoryMethod (optional): 'php_ini' or 'wp_config' (default: 'php_ini')
 * - deactivatePlugin (optional): Whether to deactivate problematic plugins (default: true)
 * - applyDefaultFix (optional): Apply .htaccess fix if no specific issue found (default: true)
 */
router.post('/fix/auto', wordpressSiteFixesController.autoFix);

module.exports = router;