const { openTicket } = require('../services/whmcsService');

/**
 * Create a new support ticket
 */
exports.createTicket = async (req, res, next) => {
  console.log('[POST /tickets]', { 
    dept: req.body.deptname || req.body.deptid, 
    subject: req.body.subject 
  });
  
  try {
    const data = await openTicket(req.body || {});
    console.log('→ Ticket created:', data.tid || data.ticketid);
    res.json({ 
      ok: true, 
      ticketid: data.ticketid, 
      ticketnumber: data.tid, 
      raw: data 
    });
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

module.exports = exports;
