const express = require('express');
const router = express.Router();
const { handlePortalPasswordReset } = require('../controllers/portalPasswordResetController');

/**
 * POST /portal-pass-reset
 * Reset WHMCS portal password for a client
 * 
 * Body parameters:
 * - email: string (client email address) - optional if domain provided
 * - phone: string (client phone number) - REQUIRED for verification
 * - domain: string (domain name owned by client) - optional if email provided
 * - contact: string (legacy - email or phone number)
 * 
 * Workflow:
 * 1. Find client by email and/or domain
 * 2. Validate phone number matches client's registered phone
 * 3. If phone matches: reset WHMCS portal password using ResetPassword API
 * 4. Send password reset email to client
 */
router.post('/', handlePortalPasswordReset);

module.exports = router;
