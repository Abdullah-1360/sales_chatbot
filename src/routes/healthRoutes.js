const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

// GET /health
router.get('/health', healthController.getHealth);

module.exports = router;
