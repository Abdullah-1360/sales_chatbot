const router = require('express').Router();
const { recommend } = require('../controllers/recommendation');

router.post('/recommendations', recommend);
module.exports = router;