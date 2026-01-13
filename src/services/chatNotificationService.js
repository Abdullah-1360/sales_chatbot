/**
 * Backend Chat Notification Service
 * Handles periodic notifications for chats with 2-minute intervals and 5-notification limit
 */

const ChatNotification = require('../models/ChatNotification');
const Chat = require('../models/Chat');
const { createLogger } = require('../utils/logger');
const { broadcastNotification } = require('./websocket');
const axios = require('axios');

const logger = createLogger('CHAT_NOTIFICATION_SERVICE');

class ChatNotificationService {
  constructor() {
    this.activeIntervals = new Map(); // chatId -> intervalId
    this.notificationInterval = 2 * 60 * 1000; // 2 minutes
    this.maxNotifications = 5;
    this.uchatApiUrl = 'https://www.uchat.com.au/api/subscriber/send-text';
    this.uchatBearerToken = 'cgkrwrtOHtxZ1AqQju9kYWjbcsVJ3FMWCY6gZoARWQkXNaTSCbaOp7J6Ap1D';
  }

  /**
   * Check if database is connected and ready
   * @returns {boolean} Database connection status
   */
  isDatabaseConnected() {
    try {
      const mongoose = require('mongoose');
      return mongoose.connection.readyState === 1;
    } catch (error) {
      logger.error('Error checking database connection', { error: error.message });
      return false;
    }
  }

  /**
   * Start notifications for a new chat
   * @param {Object} chat - Chat object from database
   * @returns {Promise<Object>} Notification record
   */
  async startNotifications(chat) {
    try {
      const chatId = chat._id.toString();
      
      logger.info('Starting notifications for chat', { 
        chatId, 
        userNs: chat.userNs,
        email: chat.email 
      });

      // Check if mongoose is connected
      if (!this.isDatabaseConnected()) {
        logger.error('MongoDB not connected, cannot start notifications');
        throw new Error('Database not connected');
      }

      // Check if notifications already exist for this chat
      let notificationRecord = await ChatNotification.findOne({ chatId });
      
      if (notificationRecord && notificationRecord.isActive) {
        logger.info('Notifications already active for chat', { chatId });
        return notificationRecord;
      }

      // Create or update notification record
      if (notificationRecord) {
        // Reset existing record
        notificationRecord.notificationCount = 0;
        notificationRecord.isActive = true;
        notificationRecord.startedAt = new Date();
        notificationRecord.lastNotificationAt = new Date();
        notificationRecord.stoppedAt = null;
        notificationRecord.stopReason = null;
      } else {
        // Create new record
        notificationRecord = new ChatNotification({
          chatId,
          userNs: chat.userNs,
          notificationCount: 0,
          maxNotifications: this.maxNotifications,
          isActive: true,
          startedAt: new Date(),
          lastNotificationAt: new Date()
        });
      }

      await notificationRecord.save();

      // Send immediate notification (first one)
      await this.sendNotification(chat, notificationRecord, true);

      // Set up periodic notifications
      const intervalId = setInterval(async () => {
        try {
          await this.handlePeriodicNotification(chatId);
        } catch (error) {
          logger.error('Error in periodic notification', { 
            chatId, 
            error: error.message 
          });
        }
      }, this.notificationInterval);

      // Store interval ID for cleanup
      this.activeIntervals.set(chatId, intervalId);
      notificationRecord.intervalId = intervalId.toString();
      await notificationRecord.save();

      logger.info('Notifications started successfully', { 
        chatId, 
        intervalId: intervalId.toString() 
      });

      return notificationRecord;

    } catch (error) {
      logger.error('Error starting notifications', { 
        chatId: chat._id?.toString(), 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Reset notifications for an existing chat (when new message arrives)
   * @param {Object} chat - Updated chat object
   * @returns {Promise<Object>} Updated notification record
   */
  async resetNotifications(chat) {
    try {
      const chatId = chat._id.toString();
      
      logger.info('Resetting notifications for chat', { 
        chatId, 
        userNs: chat.userNs 
      });

      // Stop existing notifications
      await this.stopNotifications(chatId, 'reset');

      // Start fresh notifications
      return await this.startNotifications(chat);

    } catch (error) {
      logger.error('Error resetting notifications', { 
        chatId: chat._id?.toString(), 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Handle periodic notification check
   * @param {string} chatId - Chat ID
   */
  async handlePeriodicNotification(chatId) {
    try {
      // Get notification record
      const notificationRecord = await ChatNotification.findOne({ 
        chatId, 
        isActive: true 
      });

      if (!notificationRecord) {
        logger.warn('No active notification record found', { chatId });
        this.cleanupInterval(chatId);
        return;
      }

      // Check if we've reached the maximum
      if (notificationRecord.notificationCount >= notificationRecord.maxNotifications) {
        logger.info('Maximum notifications reached, stopping', { 
          chatId, 
          count: notificationRecord.notificationCount 
        });
        await this.stopNotifications(chatId, 'max_reached');
        return;
      }

      // Get chat data
      const chat = await Chat.findById(chatId);
      if (!chat) {
        logger.warn('Chat not found, stopping notifications', { chatId });
        await this.stopNotifications(chatId, 'chat_not_found');
        return;
      }

      // Send notification
      await this.sendNotification(chat, notificationRecord, false);

    } catch (error) {
      logger.error('Error in periodic notification handler', { 
        chatId, 
        error: error.message 
      });
    }
  }

  /**
   * Send a notification for a chat
   * @param {Object} chat - Chat object
   * @param {Object} notificationRecord - Notification record
   * @param {boolean} isFirst - Whether this is the first notification
   */
  async sendNotification(chat, notificationRecord, isFirst = false) {
    try {
      // Update notification count
      notificationRecord.notificationCount += 1;
      notificationRecord.lastNotificationAt = new Date();
      await notificationRecord.save();

      const fullName = `${chat.firstname} ${chat.lastname}`.trim() || 'Unknown User';
      const latestMessage = this.getLatestMessage(chat);
      const currentCount = notificationRecord.notificationCount;
      const maxCount = notificationRecord.maxNotifications;

      // Create the same notification format as original chat notification
      // This matches the format from broadcastNewChat in websocket.js
      const chatNotificationData = {
        id: chat._id.toString(),
        firstname: chat.firstname,
        lastname: chat.lastname,
        email: chat.email,
        phone: chat.phone,
        description: chat.description,
        comment: chat.comment,
        messages: chat.messages.map(msg => ({
          id: msg._id.toString(),
          text: msg.text,
          timestamp: msg.timestamp,
          source: msg.source
        })),
        messageCount: chat.messageCount,
        lastMessageAt: chat.lastMessageAt,
        createdAt: chat.createdAt,
        source: chat.source,
        userNs: chat.userNs,
        isNewChat: isFirst,
        isUpdate: !isFirst,
        // Add notification metadata
        notificationCount: currentCount,
        maxNotifications: maxCount,
        isNotificationReminder: !isFirst,
        isFinalNotification: currentCount >= maxCount
      };

      // Broadcast the same format as new_chat event to frontend
      this.broadcastChatNotificationToFrontend(chatNotificationData);

      logger.info('Chat notification sent', { 
        chatId: chat._id.toString(),
        userNs: chat.userNs,
        count: `${currentCount}/${maxCount}`,
        isFirst,
        isFinal: currentCount >= maxCount
      });

      // Stop notifications if we've reached the maximum
      if (currentCount >= maxCount) {
        await this.stopNotifications(chat._id.toString(), 'max_reached');
      }

    } catch (error) {
      logger.error('Error sending notification', { 
        chatId: chat._id?.toString(), 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Stop notifications for a chat
   * @param {string} chatId - Chat ID
   * @param {string} reason - Reason for stopping
   * @returns {Promise<Object>} Updated notification record
   */
  async stopNotifications(chatId, reason = 'manual') {
    try {
      logger.info('Stopping notifications', { chatId, reason });

      // Clear interval
      this.cleanupInterval(chatId);

      // Update notification record
      const notificationRecord = await ChatNotification.findOneAndUpdate(
        { chatId, isActive: true },
        {
          isActive: false,
          stoppedAt: new Date(),
          stopReason: reason,
          intervalId: null
        },
        { new: true }
      );

      if (notificationRecord) {
        logger.info('Notifications stopped successfully', { 
          chatId, 
          reason,
          totalNotifications: notificationRecord.notificationCount 
        });
      } else {
        logger.warn('No active notification record found to stop', { chatId });
      }

      return notificationRecord;

    } catch (error) {
      logger.error('Error stopping notifications', { chatId, error: error.message });
      throw error;
    }
  }

  /**
   * Handle view chat action - stops notifications and sends UChat API call
   * @param {string} chatId - Chat ID
   * @param {string} userNs - User namespace
   * @returns {Promise<Object>} Result of the operation
   */
  async handleViewChat(chatId, userNs) {
    try {
      logger.info('🚀 handleViewChat called', { chatId, userNs });

      // Stop notifications
      logger.info('🛑 Stopping notifications...', { chatId });
      await this.stopNotifications(chatId, 'viewed');
      logger.info('✅ Notifications stopped', { chatId });

      // Send human agent notification to UChat API
      logger.info('📞 Calling UChat API...', { userNs });
      const apiResult = await this.sendHumanAgentNotification(userNs);
      logger.info('📞 UChat API call completed', { userNs, success: apiResult.success });

      const result = {
        success: true,
        notificationsStopped: true,
        apiCallResult: apiResult,
        uchatUrl: `https://www.uchat.com.au/inbox/${userNs}`
      };

      logger.info('✅ View chat action completed', { 
        chatId, 
        userNs,
        apiSuccess: apiResult.success,
        result: result
      });

      return result;

    } catch (error) {
      logger.error('❌ Error handling view chat action', { 
        chatId, 
        userNs, 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Send human agent notification to UChat API
   * @param {string} userNs - User namespace
   * @returns {Promise<Object>} API call result
   */
  async sendHumanAgentNotification(userNs) {
    try {
      logger.info('🚀 sendHumanAgentNotification called', { userNs });

      if (!userNs || userNs.trim() === '') {
        logger.warn('❌ No User_Ns provided, skipping UChat API call', { userNs });
        return { success: false, error: 'No User_Ns provided' };
      }

      const payload = {
        user_ns: userNs,
        content: "Agent has joined the chat "
      };

      logger.info('📤 Sending human agent notification to UChat API', { 
        userNs, 
        apiUrl: this.uchatApiUrl,
        payload: payload,
        bearerToken: this.uchatBearerToken ? `${this.uchatBearerToken.substring(0, 10)}...` : 'NOT SET'
      });

      const response = await axios.post(this.uchatApiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.uchatBearerToken}`
        },
        timeout: 10000 // 10 second timeout
      });

      logger.info('✅ UChat API call successful', { 
        userNs, 
        status: response.status,
        statusText: response.statusText,
        data: response.data 
      });

      return { 
        success: true, 
        status: response.status, 
        data: response.data 
      };

    } catch (error) {
      logger.error('❌ UChat API call failed', { 
        userNs, 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers ? 'SET' : 'NOT SET'
        }
      });

      return { 
        success: false, 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data 
      };
    }
  }

  /**
   * Get latest message text from chat
   * @param {Object} chat - Chat object
   * @returns {string} Latest message text
   */
  getLatestMessage(chat) {
    if (chat.messages && chat.messages.length > 0) {
      return chat.messages[chat.messages.length - 1].text;
    }
    return chat.comment || chat.description || 'New message received';
  }

  /**
   * Broadcast chat notification to frontend via WebSocket
   * Uses the same format as new_chat events
   * @param {Object} chatData - Chat data in new_chat format
   */
  broadcastChatNotificationToFrontend(chatData) {
    try {
      // Import here to avoid circular dependency
      const { getIO } = require('./websocket');
      const io = getIO();
      
      if (io) {
        // Use the same event name as original chat notifications
        // This ensures frontend handles it the same way
        io.emit('new_chat', {
          type: 'new_chat',
          data: chatData,
          timestamp: new Date()
        });
        
        logger.debug('Chat notification broadcasted as new_chat event', { 
          chatId: chatData.id,
          isReminder: chatData.isNotificationReminder,
          connectedClients: io.engine.clientsCount 
        });
      } else {
        logger.warn('WebSocket not available, cannot broadcast chat notification');
      }
    } catch (error) {
      logger.error('Error broadcasting chat notification to frontend', { 
        error: error.message 
      });
    }
  }

  /**
   * Clean up interval for a chat
   * @param {string} chatId - Chat ID
   */
  cleanupInterval(chatId) {
    const intervalId = this.activeIntervals.get(chatId);
    if (intervalId) {
      clearInterval(intervalId);
      this.activeIntervals.delete(chatId);
      logger.debug('Interval cleaned up', { chatId, intervalId });
    }
  }

  /**
   * Get notification status for a chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object|null>} Notification status
   */
  async getNotificationStatus(chatId) {
    try {
      const notificationRecord = await ChatNotification.findOne({ chatId });
      if (!notificationRecord) return null;

      return {
        chatId,
        userNs: notificationRecord.userNs,
        notificationCount: notificationRecord.notificationCount,
        maxNotifications: notificationRecord.maxNotifications,
        isActive: notificationRecord.isActive,
        startedAt: notificationRecord.startedAt,
        lastNotificationAt: notificationRecord.lastNotificationAt,
        stoppedAt: notificationRecord.stoppedAt,
        stopReason: notificationRecord.stopReason,
        remainingNotifications: Math.max(0, notificationRecord.maxNotifications - notificationRecord.notificationCount)
      };
    } catch (error) {
      logger.error('Error getting notification status', { chatId, error: error.message });
      return null;
    }
  }

  /**
   * Get all active notifications
   * @returns {Promise<Array>} Array of active notification statuses
   */
  async getAllActiveNotifications() {
    try {
      const activeNotifications = await ChatNotification.find({ isActive: true });
      return activeNotifications.map(record => ({
        chatId: record.chatId.toString(),
        userNs: record.userNs,
        notificationCount: record.notificationCount,
        maxNotifications: record.maxNotifications,
        startedAt: record.startedAt,
        lastNotificationAt: record.lastNotificationAt,
        remainingNotifications: Math.max(0, record.maxNotifications - record.notificationCount)
      }));
    } catch (error) {
      logger.error('Error getting all active notifications', { error: error.message });
      return [];
    }
  }

  /**
   * Stop all notifications (for cleanup)
   * @returns {Promise<number>} Number of notifications stopped
   */
  async stopAllNotifications() {
    try {
      logger.info('Stopping all active notifications');

      // Check if mongoose is connected
      if (!this.isDatabaseConnected()) {
        logger.warn('MongoDB not connected, cannot stop notifications in database');
        
        // Still clear local intervals
        let clearedCount = 0;
        for (const [chatId, intervalId] of this.activeIntervals) {
          clearInterval(intervalId);
          clearedCount++;
          logger.debug('Cleared interval', { chatId, intervalId });
        }
        this.activeIntervals.clear();
        
        logger.info('Local intervals cleared', { count: clearedCount });
        return clearedCount;
      }

      // Clear all intervals
      for (const [chatId, intervalId] of this.activeIntervals) {
        clearInterval(intervalId);
        logger.debug('Cleared interval', { chatId, intervalId });
      }
      this.activeIntervals.clear();

      // Update all active notification records
      const result = await ChatNotification.updateMany(
        { isActive: true },
        {
          isActive: false,
          stoppedAt: new Date(),
          stopReason: 'system_shutdown',
          intervalId: null
        }
      );

      logger.info('All notifications stopped', { count: result.modifiedCount });
      return result.modifiedCount;

    } catch (error) {
      logger.error('Error stopping all notifications', { error: error.message });
      
      // Still try to clear local intervals even if database update fails
      let clearedCount = 0;
      for (const [chatId, intervalId] of this.activeIntervals) {
        try {
          clearInterval(intervalId);
          clearedCount++;
        } catch (clearError) {
          logger.error('Error clearing interval', { chatId, error: clearError.message });
        }
      }
      this.activeIntervals.clear();
      
      logger.info('Local intervals cleared after error', { count: clearedCount });
      return clearedCount;
    }
  }
}

// Create singleton instance
const chatNotificationService = new ChatNotificationService();

module.exports = chatNotificationService;