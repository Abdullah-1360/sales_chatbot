/**
 * Cancel Ticket Controller
 * Handles cancellation of scheduled auto-ticket creation
 */

const Chat = require('../models/Chat');
const chatNotificationService = require('../services/chatNotificationService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CANCEL_TICKET_CONTROLLER');

/**
 * Cancel scheduled ticket creation for a chat
 * POST /api/cancelTicket
 * Body: { user_ns }
 */
exports.cancelTicket = async (req, res, next) => {
  console.log('[POST /api/cancelTicket]', { 
    user_ns: req.body.user_ns,
    ip: req.ip 
  });

  try {
    const { user_ns } = req.body;

    // Validate user_ns
    if (!user_ns || typeof user_ns !== 'string' || user_ns.trim() === '') {
      logger.warn('Invalid or missing user_ns', { user_ns });
      return res.status(400).json({
        success: false,
        error: 'user_ns is required and must be a non-empty string'
      });
    }

    // Find chat by user_ns
    const chat = await Chat.findOne({ userNs: user_ns });

    if (!chat) {
      logger.warn('Chat not found for user_ns', { user_ns });
      return res.status(404).json({
        success: false,
        error: 'No chat found for the provided user_ns'
      });
    }

    const chatId = chat._id.toString();
    logger.info('Found chat for user_ns', { user_ns, chatId });

    // Cancel the auto-ticket timeout
    chatNotificationService.cancelAutoTicket(chatId);
    logger.info('Auto-ticket timeout cancelled', { chatId, user_ns });

    // Stop notifications with reason 'manual_cancel'
    await chatNotificationService.stopNotifications(chatId, 'manual_cancel');
    logger.info('Notifications stopped', { chatId, user_ns });

    // Return success response
    res.json({
      success: true,
      message: 'Scheduled ticket creation cancelled successfully',
      chatId: chatId,
      user_ns: user_ns
    });

    logger.info('Ticket cancellation completed', { chatId, user_ns });

  } catch (error) {
    logger.error('Error cancelling ticket', { 
      user_ns: req.body.user_ns,
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

module.exports = exports;
