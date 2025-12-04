const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');

// POST /tickets
router.post('/', ticketController.createTicket);

module.exports = router;
