const router = require('express').Router();
const { recommend } = require('../controllers/recommendation');
const { checkAvailability, checkMultiple } = require('../controllers/domain');
const { searchPlans } = require('../controllers/planSearch');
const { createLead } = require('../controllers/vtiger');
const { getLeads, deleteLead } = require('../controllers/leads');
const { createChat, getChats, deleteChat } = require('../controllers/chats');
const { getAllGidsWithNames, getGidName, isValidGid } = require('../services/gidHelper');
const invoiceRoutes = require('./invoiceRoutes');
const clientRoutes = require('./clientRoutes');
const ticketRoutes = require('./ticketRoutes');
const orderRoutes = require('./orderRoutes');
const apiRoutes = require('./apiRoutes');
const whmRoutes = require('./whmRoutes');
const serverRoutes = require('./serverRoutes');
const serverCacheRoutes = require('./serverCacheRoutes');
const startAutosslTestRoute = require('./startAutosslTestRoute'); // TEMPORARY - DELETE AFTER TESTING
const focusedAutosslTestRoute = require('./focusedAutosslTestRoute'); // TEMPORARY - DELETE AFTER TESTING
const testFocusedAutosslRoute = require('./testFocusedAutosslRoute'); // TEMPORARY - DELETE AFTER TESTING
const { checkDNS, getDNSStatus, comprehensiveDNSLookup } = require('../controllers/dnsController');
const wordpressDiagnosticRoutes = require('./wordpressDiagnosticRoutes');

router.use('/invoices', invoiceRoutes);
router.use('/clients', clientRoutes);
router.use('/tickets', ticketRoutes);
router.use('/orders', orderRoutes);
router.use('/api', apiRoutes);
router.use('/whm', whmRoutes);
router.use('/servers', serverRoutes);
router.use('/server-cache', serverCacheRoutes);
router.use('/test-start-autossl', startAutosslTestRoute); // TEMPORARY - DELETE AFTER TESTING
router.use('/focused-autossl-test', focusedAutosslTestRoute); // TEMPORARY - DELETE AFTER TESTING
router.use('/test-focused-autossl', testFocusedAutosslRoute); // TEMPORARY - DELETE AFTER TESTING
router.use('/wordpress', wordpressDiagnosticRoutes);
router.post('/recommendations', recommend);
router.post('/domain/check', checkAvailability);
router.post('/domain/bulk-check', checkMultiple);

// DNS propagation and nameserver checking endpoints
router.post('/dns/check', checkDNS);
router.post('/dns/status', getDNSStatus);
router.post('/dns/comprehensive', comprehensiveDNSLookup);

// Plan search endpoint
router.get('/plans/search', searchPlans);

// VTiger lead endpoints
router.post('/leads', createLead);
router.get('/leads', getLeads);
router.delete('/leads/:id', deleteLead);

// Chat endpoints
router.post('/chats', createChat);
router.get('/chats', getChats);
router.delete('/chats/:id', deleteChat);

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