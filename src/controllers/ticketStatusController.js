/**
 * Ticket Status Controller
 * Handles WHMCS ticket status webhook/callback
 */

const { createLogger } = require('../utils/logger');
const { getTicket, getClientsDetails, callApi } = require('../services/whmcsService');
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
    logger.info('🎫 Processing ticket status update', {
      ticket_id,
      status,
      timestamp: new Date().toISOString()
    });

    // Skip notification for Customer-Reply status
    // Only send notifications for Answered or In Progress statuses
    if (status === 'Customer-Reply') {
      logger.info('⏭️ Skipping Customer-Reply status notification', { ticket_id });
      return;
    }

    // Only send notifications for specific statuses
    const notifiableStatuses = ['Answered', 'In Progress'];
    if (!notifiableStatuses.includes(status)) {
      logger.info('⏭️ Skipping non-notifiable status', { ticket_id, status });
      return;
    }

    // Fetch ticket details from WHMCS (bypass cache for critical data)
    logger.info('📋 Fetching ticket details from WHMCS', { ticket_id });
    const ticketData = await getTicket(ticket_id);

    // Extract client ID from ticket data
    const clientId = ticketData.userid || ticketData.clientid;
    
    // Extract ticket number (tid) for customer display
    const ticketNumber = ticketData.tid || ticketData.id || ticket_id;
    
    if (!clientId) {
      logger.warn('⚠️ No client ID found in ticket data', { ticket_id, ticketData });
      return;
    }

    logger.info('👤 Found client ID for ticket', { ticket_id, clientId, ticketNumber });

    // Fetch client details from WHMCS (bypass cache to prevent data mixing)
    logger.info('📞 Fetching client details from WHMCS', { ticket_id, clientId });
    const clientData = await getClientsDetailsUncached(clientId);
    
    // Extract phone number from client data
    const phoneNumber = clientData.phonenumber;
    const phonecc = clientData.phonecc || '92';
    
    if (!phoneNumber) {
      logger.warn('⚠️ No phone number found for client', { ticket_id, clientId });
      return;
    }

    // Add country code prefix
    const fullPhoneNumber = `${phonecc}${phoneNumber}`;
    
    // Validate phone number format
    if (!fullPhoneNumber || fullPhoneNumber.length < 10) {
      logger.warn('⚠️ Invalid phone number format', { 
        ticket_id, 
        clientId,
        phonecc,
        phoneNumber,
        fullPhoneNumber
      });
      return;
    }
    
    logger.info('📱 Resolved phone number for notification', { 
      ticket_id, 
      clientId, 
      phoneNumber: `${phonecc}****${phoneNumber.slice(-4)}`, // Masked for security
      fullPhoneNumber: `${phonecc}****${phoneNumber.slice(-4)}`, // Masked for security
      phonecc,
      originalPhone: phoneNumber
    });

    // Call UChat API to get subscriber info
    const uchatApiUrl = `${process.env.UCHAT_API_URL}/subscriber/get-info-by-user-id?user_id=${fullPhoneNumber}`;
    
    logger.info('🔍 Looking up UChat subscriber', { ticket_id, fullPhoneNumber, uchatApiUrl });
    
    try {
      const uchatResponse = await axios.get(uchatApiUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.UCHAT_BEARER_TOKEN}`
        },
        timeout: 10000
      });
      
      // Check if subscriber was found
      if (uchatResponse.data && uchatResponse.data.message === 'subscriber not found') {
        logger.info('👤 UChat subscriber not found', { ticket_id, fullPhoneNumber });
        return;
      }
      
      // Extract user_ns from UChat response
      const userNs = uchatResponse.data?.data?.user_ns || uchatResponse.data?.user_ns;
      
      if (!userNs) {
        logger.warn('⚠️ No user_ns found in UChat response', { 
          ticket_id, 
          fullPhoneNumber,
          uchatResponse: uchatResponse.data 
        });
        return;
      }
      
      logger.info('✅ Found UChat subscriber', { ticket_id, userNs });
      
      // Continue with sending notification...
      await sendTicketNotification(ticket_id, ticketNumber, userNs, status);
      
    } catch (uchatError) {
      logger.error('❌ UChat API call failed', {
        ticket_id,
        fullPhoneNumber,
        uchatApiUrl,
        error: uchatError.message,
        status: uchatError.response?.status,
        statusText: uchatError.response?.statusText,
        responseData: uchatError.response?.data,
        requestHeaders: uchatError.config?.headers
      });
      
      // Don't throw error, just log and continue
      return;
    }
    
  } catch (error) {
    logger.error('❌ Error processing ticket status update', {
      ticket_id,
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Send ticket notification to UChat subscriber
 * @param {string} ticket_id - Internal ticket ID
 * @param {string} ticketNumber - Customer-facing ticket number
 * @param {string} userNs - UChat user namespace
 * @param {string} status - Ticket status
 */
async function sendTicketNotification(ticket_id, ticketNumber, userNs, status) {
  try {
    // Prepare ticket status message
    const ticketStatus = status || 'Updated';
    
    // Build message without the subject line
    const messageContent = `Ticket #${ticketNumber} Status: ${ticketStatus}\n\nWaiting on You`;
    
    logger.info('📤 Sending notification to UChat', { 
      ticket_id, 
      ticketNumber,
      userNs, 
      status: ticketStatus
    });
    
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

    logger.info('✅ Ticket status notification sent successfully', { 
      ticket_id, 
      ticketNumber,
      userNs, 
      status: ticketStatus 
    });
    
  } catch (error) {
    logger.error('❌ Failed to send ticket notification', {
      ticket_id,
      ticketNumber,
      userNs,
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data
    });
  }
}

/**
 * Get client details without caching to prevent data mixing
 * @param {string} clientId - Client ID
 * @returns {Promise<Object>} Client details
 */
async function getClientsDetailsUncached(clientId) {
  // Call WHMCS API directly without caching to prevent race conditions
  return await callApi('GetClientsDetails', { clientid: clientId });
}
