/**
 * Chat Notification Routes
 * API endpoints for managing chat notifications
 */

const router = require('express').Router();
const chatNotificationService = require('../services/chatNotificationService');
const Chat = require('../models/Chat');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CHAT_NOTIFICATION_ROUTES');

/**
 * Handle view chat action
 * POST /chat-notifications/view-chat
 * Body: { chatId, userNs }
 */
router.post('/view-chat', async (req, res, next) => {
  try {
    const { chatId, userNs } = req.body;

    logger.info('🚀 View chat request received', { 
      chatId, 
      userNs,
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    });

    // Validate required fields
    if (!chatId) {
      logger.error('❌ Missing chatId in request', { body: req.body });
      return res.status(400).json({
        success: false,
        error: 'chatId is required'
      });
    }

    if (!userNs) {
      logger.error('❌ Missing userNs in request', { body: req.body });
      return res.status(400).json({
        success: false,
        error: 'userNs is required'
      });
    }

    // Verify chat exists
    logger.info('🔍 Verifying chat exists...', { chatId });
    const chat = await Chat.findById(chatId);
    if (!chat) {
      logger.error('❌ Chat not found', { chatId });
      return res.status(404).json({
        success: false,
        error: 'Chat not found'
      });
    }
    logger.info('✅ Chat found', { chatId, userNs: chat.userNs });

    // Handle view chat action
    logger.info('📞 Calling chatNotificationService.handleViewChat...', { chatId, userNs });
    const result = await chatNotificationService.handleViewChat(chatId, userNs);
    logger.info('✅ chatNotificationService.handleViewChat completed', { 
      chatId, 
      userNs, 
      success: result.success,
      apiSuccess: result.apiCallResult?.success
    });

    const response = {
      success: true,
      message: 'View chat action completed successfully',
      result: result
    };

    logger.info('✅ View chat action completed successfully', { 
      chatId, 
      userNs, 
      response: response
    });

    res.json(response);

  } catch (error) {
    logger.error('❌ Error in view chat endpoint', { 
      error: error.message,
      stack: error.stack,
      chatId: req.body?.chatId,
      userNs: req.body?.userNs
    });
    next(error);
  }
});

/**
 * Stop notifications for a chat
 * POST /chat-notifications/stop
 * Body: { chatId, reason? }
 */
router.post('/stop', async (req, res, next) => {
  try {
    const { chatId, reason = 'manual' } = req.body;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: 'chatId is required'
      });
    }

    logger.info('Stop notifications request received', { chatId, reason });

    const result = await chatNotificationService.stopNotifications(chatId, reason);

    res.json({
      success: true,
      message: 'Notifications stopped successfully',
      result: result
    });

  } catch (error) {
    logger.error('Error in stop notifications endpoint', { 
      error: error.message,
      chatId: req.body?.chatId
    });
    next(error);
  }
});

/**
 * Get notification status for a chat
 * GET /chat-notifications/status/:chatId
 */
router.get('/status/:chatId', async (req, res, next) => {
  try {
    const { chatId } = req.params;

    logger.info('Get notification status request', { chatId });

    const status = await chatNotificationService.getNotificationStatus(chatId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'No notification record found for this chat'
      });
    }

    res.json({
      success: true,
      status: status
    });

  } catch (error) {
    logger.error('Error in get notification status endpoint', { 
      error: error.message,
      chatId: req.params?.chatId
    });
    next(error);
  }
});

/**
 * Get all active notifications
 * GET /chat-notifications/active
 */
router.get('/active', async (req, res, next) => {
  try {
    logger.info('Get all active notifications request');

    const activeNotifications = await chatNotificationService.getAllActiveNotifications();

    res.json({
      success: true,
      count: activeNotifications.length,
      notifications: activeNotifications
    });

  } catch (error) {
    logger.error('Error in get active notifications endpoint', { 
      error: error.message 
    });
    next(error);
  }
});

/**
 * Start notifications for a chat (manual trigger)
 * POST /chat-notifications/start
 * Body: { chatId }
 */
router.post('/start', async (req, res, next) => {
  try {
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: 'chatId is required'
      });
    }

    logger.info('Start notifications request received', { chatId });

    // Get chat data
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found'
      });
    }

    // Start notifications
    const result = await chatNotificationService.startNotifications(chat);

    res.json({
      success: true,
      message: 'Notifications started successfully',
      result: {
        chatId: result.chatId.toString(),
        userNs: result.userNs,
        notificationCount: result.notificationCount,
        maxNotifications: result.maxNotifications,
        isActive: result.isActive
      }
    });

  } catch (error) {
    logger.error('Error in start notifications endpoint', { 
      error: error.message,
      chatId: req.body?.chatId
    });
    next(error);
  }
});

/**
 * Reset notifications for a chat (when new message arrives)
 * POST /chat-notifications/reset
 * Body: { chatId }
 */
router.post('/reset', async (req, res, next) => {
  try {
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: 'chatId is required'
      });
    }

    logger.info('Reset notifications request received', { chatId });

    // Get chat data
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found'
      });
    }

    // Reset notifications
    const result = await chatNotificationService.resetNotifications(chat);

    res.json({
      success: true,
      message: 'Notifications reset successfully',
      result: {
        chatId: result.chatId.toString(),
        userNs: result.userNs,
        notificationCount: result.notificationCount,
        maxNotifications: result.maxNotifications,
        isActive: result.isActive
      }
    });

  } catch (error) {
    logger.error('Error in reset notifications endpoint', { 
      error: error.message,
      chatId: req.body?.chatId
    });
    next(error);
  }
});

/**
 * Stop all notifications (admin endpoint)
 * POST /chat-notifications/stop-all
 */
router.post('/stop-all', async (req, res, next) => {
  try {
    logger.info('Stop all notifications request received');

    const count = await chatNotificationService.stopAllNotifications();

    res.json({
      success: true,
      message: `All notifications stopped successfully`,
      stoppedCount: count
    });

  } catch (error) {
    logger.error('Error in stop all notifications endpoint', { 
      error: error.message 
    });
    next(error);
  }
});

module.exports = router;