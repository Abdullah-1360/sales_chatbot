/**
 * Ticket Status Controller
 * Handles WHMCS ticket status webhook/callback
 */

const { createLogger } = require('../utils/logger');
const { getTicket, getClientsDetails } = require('../services/whmcsService');
const axios = require('axios');

const logger = createLogger('TICKET_STATUS_CONTROLLER');

/**
 * GET/POST /whmcs/ticket-status
 * Receives ticket status updates from WHMCS and fetches full ticket details
 * Responds immediately and processes asynchronously
 */
exports.getTicketStatus = async (req, res, next) => {
  try {
    // Check for Bearer token
    const authHeader = req.headers['authorization'];
    const expectedToken = process.env.WHMCS_TICKET_STATUS_BEARER_TOKEN;

    if (!expectedToken) {
      return res.json({
        success: true,
        message: 'Ticket status received',
        timestamp: new Date().toISOString()
      });
    }

    if (!authHeader) {
      logger.warn('⚠️ Ticket status request without Authorization header', {
        ip: req.ip,
        url: req.originalUrl
      });
      return res.json({
        success: true,
        message: 'Ticket status received',
        timestamp: new Date().toISOString()
      });
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    if (token !== expectedToken) {
      logger.warn('⚠️ Ticket status request with invalid token', {
        ip: req.ip,
        url: req.originalUrl,
        providedToken: token.substring(0, 10) + '...'
      });
      return res.json({
        success: true,
        message: 'Ticket status received',
        timestamp: new Date().toISOString()
      });
    }

    // Extract ticket_id from request body
    const { ticket_id, status, client_id, subject, department, priority, timestamp } = req.body;

    if (!ticket_id) {
      return res.json({
        success: true,
        message: 'Ticket status received',
        timestamp: new Date().toISOString()
      });
    }

    // Respond immediately to webhook
    res.json({
      success: true,
      message: 'Ticket status received',
      timestamp: new Date().toISOString()
    });

    // Process asynchronously in background (don't await)
    processTicketStatusUpdate({
      ticket_id,
      status,
      client_id,
      subject,
      department,
      priority,
      timestamp,
      ip: req.ip
    }).catch(error => {
      logger.error('❌ Error in background ticket processing', {
        ticket_id,
        error: error.message,
        stack: error.stack
      });
    });

  } catch (error) {
    logger.error('❌ Error in ticket status endpoint', {
      error: error.message,
      stack: error.stack
    });
    
    // Still return success to webhook
    if (!res.headersSent) {
      res.json({
        success: true,
        message: 'Ticket status received',
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * Process ticket status update asynchronously
 * @param {Object} webhookData - Webhook data
 */
async function processTicketStatusUpdate(webhookData) {
  const { ticket_id, status, subject } = webhookData;

  try {
    // Skip notification for Customer-Reply status
    // Only send notifications for Answered or In Progress statuses
    if (status === 'Customer-Reply') {
      
      return;
    }

    // Only send notifications for specific statuses
    const notifiableStatuses = ['Answered', 'In Progress'];
    if (!notifiableStatuses.includes(status)) {
      
      return;
    }

    // Fetch ticket details from WHMCS
    const ticketData = await getTicket(ticket_id);

    // Extract client ID from ticket data
    const clientId = ticketData.userid || ticketData.clientid;
    
    if (!clientId) {
      return;
    }

    // Fetch client details from WHMCS
    const clientData = await getClientsDetails({ clientid: clientId });
    
    // Extract phone number from client data
    const phoneNumber = clientData.phonenumber;
    const phonecc = clientData.phonecc || '92';
    
    if (!phoneNumber) {
      return;
    }

    // Add country code prefix
    const fullPhoneNumber = `${phonecc}${phoneNumber}`;
    
    // Call UChat API to get subscriber info
    const uchatApiUrl = `${process.env.UCHAT_API_URL}/subscriber/get-info-by-user-id?user_id=${fullPhoneNumber}`;
    
    const uchatResponse = await axios.get(uchatApiUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.UCHAT_BEARER_TOKEN}`
      },
      timeout: 10000
    });
    
    // Check if subscriber was found
    if (uchatResponse.data && uchatResponse.data.message === 'subscriber not found') {
      return;
    }
    
    // Extract user_ns from UChat response
    const userNs = uchatResponse.data?.data?.user_ns || uchatResponse.data?.user_ns;
    
    if (!userNs) {
      return;
    }
    
    // Prepare ticket status message
    const ticketStatus = status || 'Updated';
    
    // Build message without the subject line
    const messageContent = `Ticket #${ticket_id} Status: ${ticketStatus}\n\nYour ticket has been updated. Please check your email for details.`;
    
    // Send message to subscriber via UChat
    const sendTextUrl = `${process.env.UCHAT_API_URL}/subscriber/send-text`;
    
    await axios.post(sendTextUrl, {
      user_ns: userNs,
      content: messageContent
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.UCHAT_BEARER_TOKEN}`
      },
      timeout: 10000
    });

    

  } catch (error) {
    logger.error('❌ Error processing ticket status update', {
      ticket_id,
      error: error.message
    });
  }
}
