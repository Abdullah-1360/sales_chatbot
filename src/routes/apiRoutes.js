const express = require('express');
const router = express.Router();
const resolveClientId = require('../middleware/resolveClientId');
const invoiceController = require('../controllers/invoiceController');
const serviceStatusController = require('../controllers/serviceStatusController');
const billingController = require('../controllers/billingController');

// POST /api/invoiceLookup
router.post('/invoiceLookup', resolveClientId, invoiceController.invoiceLookup);

// POST /api/serviceStatus
router.post('/serviceStatus', resolveClientId, serviceStatusController.checkServiceStatus);

// POST /api/renewService
router.post('/renewService', resolveClientId, billingController.renewService);

// POST /api/confirmPayment
router.post('/confirmPayment', resolveClientId, billingController.confirmPayment);

// POST /api/triageIssue
router.post('/triageIssue', resolveClientId, billingController.triageIssue);

module.exports = router;
