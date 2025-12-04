const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

// GET /invoices/:invoiceId
router.get('/:invoiceId', invoiceController.getInvoiceById);

// GET /invoices
router.get('/', invoiceController.getInvoicesList);

module.exports = router;
