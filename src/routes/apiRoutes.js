const express = require('express');
const router = express.Router();
const resolveClientId = require('../middleware/resolveClientId');
const validatePhoneNumber = require('../middleware/validatePhoneNumber');
const invoiceController = require('../controllers/invoiceController');
const serviceStatusController = require('../controllers/serviceStatusController');
const billingController = require('../controllers/billingController');
const userController = require('../controllers/userController');
const leadsController = require('../controllers/leadsController');

// POST /api/checkUserExists - Check if user exists by email or phone (DEPRECATED - use /api/leads)
// router.post('/checkUserExists', userController.checkUserExists);

// POST /api/leads - Combined endpoint: check user exists in WHMCS, create lead in VTiger if not exists
router.post('/leads', leadsController.handleLeads);

// POST /api/invoiceLookup - with phone validation
router.post('/invoiceLookup', resolveClientId, validatePhoneNumber, invoiceController.invoiceLookup);

// POST /api/serviceStatus - with phone validation
router.post('/serviceStatus', resolveClientId, validatePhoneNumber, serviceStatusController.checkServiceStatus);

// POST /api/myServices - Get all services for a client (email only)
router.post('/myServices', resolveClientId, serviceStatusController.getMyServices);

// POST /api/myDomains - Get all domains for a client (email only)
router.post('/myDomains', resolveClientId, serviceStatusController.getMyDomains);

// POST /api/myAccount - Get complete account overview (email only)
router.post('/myAccount', resolveClientId, serviceStatusController.getMyAccount);

// POST /api/test-dns-zone-analysis - Test DNS zone analysis with auto-fix (for testing)
router.post('/test-dns-zone-analysis', serviceStatusController.testDNSZoneAnalysis);

// POST /api/test-reachability - Test domain reachability (for testing)
router.post('/test-reachability', serviceStatusController.testReachability);

// POST /api/test-error-log - Test error log fetching for 500 errors (for testing)
router.post('/test-error-log', serviceStatusController.testErrorLogFetching);

// POST /api/test-syntax-error-ticket - Test syntax error ticket creation (for testing)
router.post('/test-syntax-error-ticket', serviceStatusController.testSyntaxErrorTicket);

// POST /api/renewService
router.post('/renewService', resolveClientId, billingController.renewService);

// POST /api/renewservice - New endpoint with phone/email resolution and validation
router.post('/renewservice', resolveClientId, validatePhoneNumber, billingController.renewServiceEndpoint);

// POST /api/confirmPayment - with phone validation
router.post('/confirmPayment', resolveClientId, validatePhoneNumber, billingController.confirmPayment);

// POST /api/triageIssue
router.post('/triageIssue', resolveClientId, billingController.triageIssue);

module.exports = router;
