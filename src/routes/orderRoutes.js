const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');

// POST /orders
router.post('/', billingController.createOrder);

module.exports = router;
