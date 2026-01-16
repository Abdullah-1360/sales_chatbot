const { openTicket } = require('../services/whmcsService');

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
    const { user_ns, ...ticketData } = req.body || {};
    
    const data = await openTicket(ticketData);
    const ticketId = data.tid || data.ticketid;
    console.log('→ Ticket created:', ticketId);
    
    // Send UChat notification if user_ns provided
    if (typeof user_ns !== 'undefined' && user_ns) {
      console.log(`→ Calling sendUChatTicketNotification with user_ns: ${user_ns}, ticketId: ${ticketId}`);
      sendUChatTicketNotification(user_ns, ticketId).catch(err => {
        console.error('✗ UChat notification failed:', err.message);
      });
    }
    
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

/**
 * Helper function to send UChat notification when ticket is created
 * @param {string} user_ns - UChat user namespace
 * @param {string} ticketId - Ticket ID or number
 */
async function sendUChatTicketNotification(user_ns, ticketId) {
  console.log(`→ sendUChatTicketNotification called with user_ns: ${user_ns}, ticketId: ${ticketId}`);
  
  if (!user_ns) {
    console.log('→ Skipping UChat notification - no user_ns provided');
    return;
  }

  try {
    const axios = require('axios');
    
    // Wait 5 seconds before sending notification (to ensure response is sent first)
    console.log(`→ Waiting 5 seconds before sending UChat notification...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(`→ Sending UChat notification to ${process.env.UCHAT_API_URL}/subscriber/send-text`);
    
    // Send ticket notification message
    const messageContent = `Your ticket has been generated #${ticketId}. Please contact support for assistance.`;
    
    const sendTextResponse = await axios.post(`${process.env.UCHAT_API_URL}/subscriber/send-text`, {
      user_ns: user_ns,
      content: messageContent
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.UCHAT_BEARER_TOKEN}`
      },
      timeout: 10000
    });
    
    console.log(`✅ UChat notification sent for ticket #${ticketId}`, sendTextResponse.data);
    
    // Wait 1 second before moving chat to done
    console.log(`→ Waiting 1 second before moving chat to done...`);
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
