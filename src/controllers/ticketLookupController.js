/**
 * Ticket Lookup Controller
 * Handles ticket lookup with client validation via phone number
 */

const { getTicketWithClientValidation } = require('../services/whmcsService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TICKET_LOOKUP');

/**
 * Get ticket summary with client validation
 * POST /api/ticketLookup
 * Body: { phone, ticket }
 */
const getTicketSummary = async (req, res, next) => {
  console.log('[POST /api/ticketLookup]', { 
    hasPhone: !!req.body.phone,
    hasTicket: !!req.body.ticket,
    ticket: req.body.ticket
  });
  
  try {
    const { phone, ticket } = req.body;
    
    logger.info('Ticket lookup request received', { 
      phone: phone ? `${phone.substring(0, 3)}***` : null,
      ticket,
      ip: req.ip 
    });
    
    // Validate required parameters
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'phone parameter is required' 
      });
    }
    
    if (!ticket) {
      return res.status(400).json({ 
        success: false, 
        error: 'ticket parameter is required' 
      });
    }
    
    // Validate phone format (basic validation)
    const phoneStr = phone.toString().trim();
    if (phoneStr.length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'phone number must be at least 10 digits' 
      });
    }
    
    // Validate ticket format (should be numeric)
    const ticketStr = ticket.toString().trim();
    if (!/^\d+$/.test(ticketStr)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ticket number must be numeric' 
      });
    }
    
    console.log(`→ Looking up ticket ${ticketStr} for phone ${phoneStr.substring(0, 3)}***`);
    
    // Get ticket with client validation
    const result = await getTicketWithClientValidation(ticketStr, phoneStr);
    
    if (!result || !result.ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found or access denied'
      });
    }
    
    const { ticket: ticketData, client: clientData } = result;
    
    // Format ticket summary
    const ticketSummary = {
      ticketId: ticketData.id || ticketData.tid,
      ticketNumber: ticketData.tid || ticketData.id,
      subject: ticketData.subject,
      status: ticketData.status,
      priority: ticketData.priority,
      department: ticketData.deptname || ticketData.department,
      departmentId: ticketData.deptid || ticketData.departmentid,
      dateOpened: ticketData.date,
      lastReply: ticketData.lastreply,
      clientName: `${clientData.firstname} ${clientData.lastname}`.trim(),
      clientEmail: clientData.email,
      clientId: clientData.id || clientData.userid,
      
      // Ticket details
      message: ticketData.message || 'No message available',
      
      // Status information
      isOpen: ['Open', 'Customer-Reply', 'In Progress'].includes(ticketData.status),
      isClosed: ['Closed', 'Resolved'].includes(ticketData.status),
      
      // Additional metadata
      replies: ticketData.replies || [],
      totalReplies: ticketData.replies ? ticketData.replies.length : 0,
      
      // Service information (if available)
      serviceId: ticketData.serviceid || null,
      
      // Search and validation information
      phoneValidated: result.phoneValidated,
      searchMethod: result.searchMethod,
      departmentId: result.departmentId,
      departmentName: result.departmentName,
      
      // Formatted summary
      summary: generateTicketSummary(ticketData, clientData)
    };
    
    logger.info('Ticket lookup successful', { 
      ticketId: ticketSummary.ticketId,
      clientId: ticketSummary.clientId,
      status: ticketSummary.status 
    });
    
    console.log(`✅ Ticket ${ticketSummary.ticketNumber} found for client ${ticketSummary.clientName}`);
    console.log(`→ Status: ${ticketSummary.status}, Department: ${ticketSummary.department}`);
    
    res.json({
      success: true,
      ticket: ticketSummary,
      message: `Ticket ${ticketSummary.ticketNumber} retrieved successfully`
    });
    
  } catch (error) {
    console.log('✗ Ticket lookup error:', error.message);
    logger.error('Error in ticket lookup', {
      error: error.message,
      stack: error.stack,
      phone: req.body.phone ? `${req.body.phone.toString().substring(0, 3)}***` : null,
      ticket: req.body.ticket
    });
    
    // Handle specific error cases
    if (error.message.includes('Ticket not found')) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found with the provided ticket number'
      });
    }
    
    if (error.message.includes('Phone number does not match') || error.message.includes('Please contact from your registered number')) {
      return res.status(403).json({
        success: false,
        error: error.message.replace('Ticket lookup failed: ', '')
      });
    }
    
    if (error.message.includes('Client not found')) {
      return res.status(404).json({
        success: false,
        error: 'Client information not found for this ticket'
      });
    }
    
    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve ticket information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Generate a human-readable ticket summary
 * @param {Object} ticketData - Ticket data from WHMCS
 * @param {Object} clientData - Client data from WHMCS
 * @returns {string} Formatted summary
 */
function generateTicketSummary(ticketData, clientData) {
  const clientName = `${clientData.firstname} ${clientData.lastname}`.trim();
  const status = ticketData.status;
  const department = ticketData.deptname || ticketData.department || 'Support';
  const dateOpened = ticketData.date;
  const subject = ticketData.subject;
  
  let summary = `Ticket #${ticketData.tid || ticketData.id} for ${clientName}\n`;
  summary += `Subject: ${subject}\n`;
  summary += `Status: ${status}\n`;
  summary += `Department: ${department}\n`;
  summary += `Opened: ${dateOpened}\n`;
  
  if (ticketData.lastreply) {
    summary += `Last Reply: ${ticketData.lastreply}\n`;
  }
  
  if (ticketData.priority) {
    summary += `Priority: ${ticketData.priority}\n`;
  }
  
  // Add status-specific information
  if (['Open', 'Customer-Reply', 'In Progress'].includes(status)) {
    summary += `\nThis ticket is currently active and being handled by our support team.`;
  } else if (['Closed', 'Resolved'].includes(status)) {
    summary += `\nThis ticket has been resolved and closed.`;
  }
  
  // Add reply count if available
  if (ticketData.replies && ticketData.replies.length > 0) {
    summary += ` There are ${ticketData.replies.length} replies in this conversation.`;
  }
  
  return summary;
}

module.exports = {
  getTicketSummary
};