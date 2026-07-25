const { openTicket } = require('../services/whmcsService');
const { openOrMergeTicket } = require('../services/ticketDeduplicationService');

/**
 * Create a new support ticket
 */
exports.createTicket = async (req, res, next) => {
  console.log('[POST /tickets]', { 
    dept: req.body.deptname || req.body.deptid, 
    subject: req.body.subject,
    hasUserNs: !!req.body.user_ns
  });
  
  try {
    const { user_ns, domain, ...ticketData } = req.body || {};
    
    const data = await openOrMergeTicket({ ticketType: 'manual', ...ticketData, domain: domain || null });
    const ticketId = data.ticketNumber || data.ticketId;
    console.log(data.merged ? '→ Content merged into existing ticket:' : '→ Ticket created:', ticketId);
    
    // Send UChat notification if user_ns provided
    if (typeof user_ns !== 'undefined' && user_ns) {
      sendUChatTicketNotification(user_ns, ticketId, data.merged).catch(err => {
        console.error('✗ UChat notification failed:', err.message);
      });
    }
    
    if (data.merged) {
      res.json({
        ok: true,
        merged: true,
        ticketid: data.ticketId,
        ticketnumber: data.ticketNumber,
        message: `Your message has been added to your existing ticket #${data.ticketNumber}.`,
      });
    } else {
      res.json({
        ok: true,
        merged: false,
        ticketid: data.ticketId,
        ticketnumber: data.ticketNumber,
        message: `Support ticket #${data.ticketNumber} has been created successfully.`,
      });
    }
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Helper function to send UChat notification when ticket is created
 * @param {string} user_ns - UChat user namespace
 * @param {string} ticketId - Ticket ID or number
 */
async function sendUChatTicketNotification(user_ns, ticketId, merged = false) {
  if (!user_ns) return;

  try {
    const axios = require('axios');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const messageContent = merged
      ? `Your message has been added to your existing support ticket #${ticketId}. Our team will review it shortly.`
      : `Your support ticket #${ticketId} has been created. Our 24x7 helpdesk team will get back to you at the earliest.`;

    await axios.post(`${process.env.UCHAT_API_URL}/subscriber/send-text`, {
      user_ns,
      content: messageContent
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.UCHAT_BEARER_TOKEN}`
      },
      timeout: 10000
    });

    console.log(`✅ UChat notification sent for ticket #${ticketId} (merged: ${merged})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Move chat to done status
    console.log(`→ Moving chat to done status for user_ns: ${user_ns}`);
    const moveChatResponse = await axios.post(`${process.env.UCHAT_API_URL}/subscriber/move-chat-to`, {
      user_ns: user_ns,
      status: 'done'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.UCHAT_BEARER_TOKEN}`
      },
      timeout: 10000
    });
    
    console.log(`✅ UChat chat moved to done for ticket #${ticketId}`, moveChatResponse.data);
    
  } catch (error) {
    console.error('✗ Failed to send UChat notification:', error.message);
    if (error.response) {
      console.error('✗ UChat API error response:', error.response.data);
      console.error('✗ UChat API status:', error.response.status);
    }
  }
}

module.exports = exports;
