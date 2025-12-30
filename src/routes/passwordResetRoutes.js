const express = require('express');
const router = express.Router();
const { handlePasswordReset, getClientHostingServices } = require('../controllers/passwordResetController');

/**
 * POST /password-reset
 * Reset cPanel password for a hosting service by domain
 * 
 * Body parameters:
 * - contact: string (email or phone number)
 * - domain: string (domain name of the hosting service)
 * 
 * Workflow:
 * 1. Find client by email/phone
 * 2. Get client's hosting services for the specific domain
 * 3. Find the service that matches the domain
 * 4. Check service status (active/suspended/terminated)
 * 5. If suspended/terminated: create support ticket
 * 6. If active: reset password using WHMCS ModuleChangePw and send email notification
 */
router.post('/', handlePasswordReset);

/**
 * GET /password-reset/services
 * Get available hosting services for a client
 * 
 * Query parameters:
 * - contact: string (email or phone number)
 * 
 * Returns list of client's hosting services with domains and status
 */
router.get('/services', getClientHostingServices);

module.exports = router;