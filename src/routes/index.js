const router = require('express').Router();
const { recommend } = require('../controllers/recommendation');
const { checkAvailability, checkMultiple } = require('../controllers/domain');
const { searchPlans } = require('../controllers/planSearch');
const { createLead } = require('../controllers/vtiger');
const { getAllGidsWithNames, getGidName, isValidGid } = require('../services/gidHelper');

router.post('/recommendations', recommend);
router.post('/domain/check', checkAvailability);
router.post('/domain/bulk-check', checkMultiple);

// Plan search endpoint
router.get('/plans/search', searchPlans);

// VTiger lead creation endpoint
router.post('/leads', createLead);

// GID information endpoints
router.get('/gids', (_req, res) => {
  res.json({
    success: true,
    gids: getAllGidsWithNames()
  });
});

router.get('/gids/:gid', (req, res) => {
  const gid = Number(req.params.gid);
  if (!isValidGid(gid)) {
    return res.status(404).json({
      success: false,
      error: `Invalid GID: ${gid}`
    });
  }
  res.json({
    success: true,
    gid,
    name: getGidName(gid)
  });
});

router.get('/health', (_req, res) => {
  console.log('✅ Health check endpoint accessed');
  res.json({ status: 'ok' });
});

module.exports = router;