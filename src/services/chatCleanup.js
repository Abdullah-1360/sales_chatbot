/**
 * Chat Cleanup Service
 * Handles automatic cleanup of old chats and manual deletion with notification cleanup
 */

const Chat = require('../models/Chat');
const ChatNotification = require('../models/ChatNotification');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CHAT_CLEANUP');

/**
 * Delete chats older than 24 hours
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupOldChats() {
  try {
    // Calculate timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    logger.info('Starting chat cleanup', { 
      cutoffTime: twentyFourHoursAgo.toISOString() 
    });
    
    // Find chats older than 24 hours to get their IDs for notification cleanup
    const oldChats = await Chat.find({
      createdAt: { $lt: twentyFourHoursAgo }
    }, { _id: 1 }).lean();
    
    if (oldChats.length === 0) {
      logger.info('No old chats to clean up');
      return {
        success: true,
        deletedChats: 0,
        deletedNotifications: 0,
        cutoffTime: twentyFourHoursAgo
      };
    }
    
    const chatIds = oldChats.map(chat => chat._id);
    
    logger.info('Found old chats to delete', { 
      count: chatIds.length,
      cutoffTime: twentyFourHoursAgo.toISOString()
    });
    
    // Delete associated chat notifications first
    const notificationResult = await ChatNotification.deleteMany({
      chatId: { $in: chatIds }
    });
    
    // Delete the chats
    const chatResult = await Chat.deleteMany({
      _id: { $in: chatIds }
    });
    
    logger.info('Chat cleanup completed', { 
      deletedChats: chatResult.deletedCount,
      deletedNotifications: notificationResult.deletedCount,
      cutoffTime: twentyFourHoursAgo.toISOString()
    });
    
    return {
      success: true,
      deletedChats: chatResult.deletedCount,
      deletedNotifications: notificationResult.deletedCount,
      cutoffTime: twentyFourHoursAgo
    };
    
  } catch (error) {
    logger.error('Error during chat cleanup', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete a specific chat and its associated notifications
 * @param {string} chatId - Chat ID to delete
 * @returns {Promise<Object>} Deletion result
 */
async function deleteChat(chatId) {
  try {
    logger.info('Deleting specific chat', { chatId });
    
    // Get chat notification service to stop any active notifications
    const chatNotificationService = require('./chatNotificationService');
    
    // Stop notifications for this chat (if any)
    try {
      await chatNotificationService.stopNotifications(chatId, 'manual_delete');
      logger.info('Stopped notifications for chat', { chatId });
    } catch (notificationError) {
      // Don't fail the deletion if notification cleanup fails
      logger.warn('Failed to stop notifications during chat deletion', {
        chatId,
        error: notificationError.message
      });
    }
    
    // Delete associated chat notifications
    const notificationResult = await ChatNotification.deleteMany({
      chatId: chatId
    });
    
    // Delete the chat
    const chatResult = await Chat.findByIdAndDelete(chatId);
    
    if (!chatResult) {
      logger.warn('Chat not found for deletion', { chatId });
      return {
        success: false,
        error: 'Chat not found',
        chatId
      };
    }
    
    logger.info('Chat deleted successfully', { 
      chatId,
      email: chatResult.email,
      messageCount: chatResult.messageCount || 1,
      deletedNotifications: notificationResult.deletedCount
    });
    
    return {
      success: true,
      chatId,
      deletedChat: {
        id: chatResult._id.toString(),
        email: chatResult.email,
        messageCount: chatResult.messageCount || 1,
        firstname: chatResult.firstname,
        lastname: chatResult.lastname
      },
      deletedNotifications: notificationResult.deletedCount
    };
    
  } catch (error) {
    logger.error('Error deleting specific chat', {
      chatId,
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message,
      chatId
    };
  }
}

/**
 * Delete multiple chats by IDs
 * @param {Array<string>} chatIds - Array of chat IDs to delete
 * @returns {Promise<Object>} Bulk deletion result
 */
async function deleteMultipleChats(chatIds) {
  try {
    logger.info('Deleting multiple chats', { count: chatIds.length, chatIds });
    
    if (!Array.isArray(chatIds) || chatIds.length === 0) {
      return {
        success: false,
        error: 'Invalid chat IDs array'
      };
    }
    
    // Get chat notification service to stop any active notifications
    const chatNotificationService = require('./chatNotificationService');
    
    // Stop notifications for all chats
    const notificationStopResults = [];
    for (const chatId of chatIds) {
      try {
        await chatNotificationService.stopNotifications(chatId, 'bulk_delete');
        notificationStopResults.push({ chatId, stopped: true });
      } catch (notificationError) {
        notificationStopResults.push({ 
          chatId, 
          stopped: false, 
          error: notificationError.message 
        });
      }
    }
    
    // Delete associated chat notifications
    const notificationResult = await ChatNotification.deleteMany({
      chatId: { $in: chatIds }
    });
    
    // Delete the chats
    const chatResult = await Chat.deleteMany({
      _id: { $in: chatIds }
    });
    
    logger.info('Multiple chats deleted successfully', { 
      requestedCount: chatIds.length,
      deletedChats: chatResult.deletedCount,
      deletedNotifications: notificationResult.deletedCount
    });
    
    return {
      success: true,
      requestedCount: chatIds.length,
      deletedChats: chatResult.deletedCount,
      deletedNotifications: notificationResult.deletedCount,
      notificationStopResults
    };
    
  } catch (error) {
    logger.error('Error deleting multiple chats', {
      chatIds,
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message,
      chatIds
    };
  }
}

/**
 * Clean up orphaned chat notifications (notifications without corresponding chats)
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupOrphanedNotifications() {
  try {
    logger.info('Starting orphaned notification cleanup');
    
    // Find all chat IDs that exist
    const existingChatIds = await Chat.find({}, { _id: 1 }).lean();
    const existingChatIdStrings = existingChatIds.map(chat => chat._id.toString());
    
    // Find notifications that don't have corresponding chats
    const orphanedNotifications = await ChatNotification.find({
      chatId: { $nin: existingChatIds.map(chat => chat._id) }
    });
    
    if (orphanedNotifications.length === 0) {
      logger.info('No orphaned notifications found');
      return {
        success: true,
        deletedCount: 0
      };
    }
    
    // Delete orphaned notifications
    const result = await ChatNotification.deleteMany({
      chatId: { $nin: existingChatIds.map(chat => chat._id) }
    });
    
    logger.info('Orphaned notification cleanup completed', { 
      deletedCount: result.deletedCount
    });
    
    return {
      success: true,
      deletedCount: result.deletedCount
    };
    
  } catch (error) {
    logger.error('Error during orphaned notification cleanup', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get cleanup statistics
 * @returns {Promise<Object>} Statistics about chats and notifications
 */
async function getCleanupStats() {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Count total chats
    const totalChats = await Chat.countDocuments();
    
    // Count old chats (older than 24 hours)
    const oldChats = await Chat.countDocuments({
      createdAt: { $lt: twentyFourHoursAgo }
    });
    
    // Count total notifications
    const totalNotifications = await ChatNotification.countDocuments();
    
    // Count active notifications
    const activeNotifications = await ChatNotification.countDocuments({
      isActive: true
    });
    
    // Count orphaned notifications
    const existingChatIds = await Chat.find({}, { _id: 1 }).lean();
    const orphanedNotifications = await ChatNotification.countDocuments({
      chatId: { $nin: existingChatIds.map(chat => chat._id) }
    });
    
    return {
      success: true,
      stats: {
        totalChats,
        oldChats,
        recentChats: totalChats - oldChats,
        totalNotifications,
        activeNotifications,
        inactiveNotifications: totalNotifications - activeNotifications,
        orphanedNotifications,
        cutoffTime: twentyFourHoursAgo
      }
    };
    
  } catch (error) {
    logger.error('Error getting cleanup stats', {
      error: error.message
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Schedule automatic chat cleanup
 * Runs every hour to check for old chats
 */
function scheduleChatCleanup() {
  // Run cleanup immediately on startup
  cleanupOldChats();
  
  // Also clean up orphaned notifications on startup
  cleanupOrphanedNotifications();
  
  // Schedule cleanup to run every hour (3600000 ms)
  const intervalId = setInterval(() => {
    cleanupOldChats();
    
    // Run orphaned notification cleanup every 6 hours
    const currentHour = new Date().getHours();
    if (currentHour % 6 === 0) {
      cleanupOrphanedNotifications();
    }
  }, 60 * 60 * 1000); // 1 hour
  
  logger.info('Chat cleanup scheduled to run every hour');
  
  return intervalId;
}

module.exports = {
  cleanupOldChats,
  deleteChat,
  deleteMultipleChats,
  cleanupOrphanedNotifications,
  getCleanupStats,
  scheduleChatCleanup
};