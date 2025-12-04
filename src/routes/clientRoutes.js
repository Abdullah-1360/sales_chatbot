const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// GET /clients/:clientId/products
router.get('/:clientId/products', clientController.getClientProducts);

// GET /clients/:clientId/domains
router.get('/:clientId/domains', clientController.getClientDomains);

// GET /clients/:clientId/service-status
router.get('/:clientId/service-status', clientController.getClientServiceStatus);

module.exports = router;
