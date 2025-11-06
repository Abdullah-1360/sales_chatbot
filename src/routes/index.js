const router = require('express').Router();
const { recommend } = require('../controllers/recommendation');
const { checkAvailability, checkMultiple } = require('../controllers/domain');

router.post('/recommendations', recommend);
router.post('/domain/check', checkAvailability);
router.post('/domain/bulk-check', checkMultiple);
router.get('/health', (_req, res) => {
  console.log('✅ Health check endpoint accessed');
  res.json({ status: 'ok' });
});

module.exports = router;