const router = require('express').Router();
const { recommend } = require('../controllers/recommendation');

router.post('/recommendations', recommend);
router.get('/health', (_req, res) => {
  console.log('✅ Health check endpoint accessed');
  res.json({ status: 'ok' });
});module.exports = router;