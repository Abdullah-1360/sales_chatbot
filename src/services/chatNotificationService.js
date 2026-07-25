/**
 * Backend Chat Notification Service
 * Handles periodic notifications for chats with 40-second intervals and 5-notification limit
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
    this.autoTicketTimeouts = new Map(); // chatId -> timeoutId
    this.notificationInterval = 2 * 60 * 1000; // 2 minutes
    this.maxNotifications = 5;
    this.autoTicketDelay = 15 * 60 * 1000; // 15 minutes
    this.uchatApiUrl = 'https://www.uchat.com.au/api/subscriber/send-text';
    this.uchatBearerToken = 'cgkrwrtOHtxZ1AqQju9kYWjbcsVJ3FMWCY6gZoARWQkXNaTSCbaOp7J6Ap1D';
    this.isInitialized = false;
  }

  /**
   * Initialize the service and restore active notifications
   * This should be called on server startup
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      logger.info('🚀 Initializing ChatNotificationService...');

      // Check database connection
      if (!this.isDatabaseConnected()) {
        logger.warn('⚠️ Database not connected, skipping notification recovery');
        return;
      }

      // Restore active notifications from database
      await this.restoreActiveNotifications();

      this.isInitialized = true;
      logger.info('✅ ChatNotificationService initialized successfully');

    } catch (error) {
      logger.error('❌ Failed to initialize ChatNotificationService', { error: error.message });
      throw error;
    }
  }

  /**
   * Restore active notifications from database after server restart
   * This recovers lost intervals and timeouts
   */
  async restoreActiveNotifications() {
    try {
      logger.info('🔄 Restoring active notifications from database...');

      // First, bulk cleanup expired notifications (older than 2 hours)
      const maxAge = 2 * 60 * 60 * 1000; // 2 hours
      const expiredCutoff = new Date(Date.now() - maxAge);
      
      const expiredResult = await ChatNotification.updateMany(
        {
          startedAt: { $lt: expiredCutoff },
          $or: [
            { isActive: true },
            { 
              isActive: false, 
              autoTicketScheduled: true, 
              autoTicketCreated: false 
            }
          ]
        },
        {
          isActive: false,
          stoppedAt: new Date(),
          stopReason: 'expired_on_restart',
          intervalId: null
        }
      );

      if (expiredResult.modifiedCount > 0) {
        logger.info(`🧹 Bulk cleaned up ${expiredResult.modifiedCount} expired notifications`);
      }

      // Now find notifications that need restoration (not expired)
      const notificationsToRestore = await ChatNotification.find({
        startedAt: { $gte: expiredCutoff }, // Only recent notifications
        $or: [
          { isActive: true }, // Active notifications
          { 
            isActive: false, 
            autoTicketScheduled: true, 
            autoTicketCreated: false,
            stopReason: { $in: ['max_reached'] } // Only restore auto-tickets for max_reached
          }
        ]
      });
      
      if (notificationsToRestore.length === 0) {
        logger.info('ℹ️ No notifications to restore');
        return { 
          total: expiredResult.modifiedCount, 
          restored: 0, 
          autoTicketOnly: 0, 
          expired: expiredResult.modifiedCount, 
          errors: 0 
        };
      }

      logger.info(`📋 Found ${notificationsToRestore.length} notifications to restore`);

      let restoredCount = 0;
      let errorCount = 0;
      let autoTicketOnlyCount = 0;

      for (const notification of notificationsToRestore) {
        try {
          const chatId = notification.chatId.toString();

          // Check if chat still exists
          const chat = await Chat.findById(chatId);
          if (!chat) {
            logger.warn(`🗑️ Chat not found, marking as stopped: ${chatId}`);
            await ChatNotification.findByIdAndUpdate(notification._id, {
              isActive: false,
              stoppedAt: new Date(),
              stopReason: 'chat_not_found',
              intervalId: null
            });
            errorCount++;
            continue;
          }

          // Handle active notifications (restore full functionality)
          if (notification.isActive) {
            // Check if max notifications reached
            if (notification.notificationCount >= notification.maxNotifications) {
              logger.info(`🔢 Max notifications reached, stopping: ${chatId}`);
              await ChatNotification.findByIdAndUpdate(notification._id, {
                isActive: false,
                stoppedAt: new Date(),
                stopReason: 'max_reached',
                intervalId: null
              });
              // Still check for auto-ticket restoration below
            } else {
              // Restore periodic notifications
              const intervalId = setInterval(async () => {
                try {
                  await this.handlePeriodicNotification(chatId);
                } catch (error) {
                  logger.error('Error in restored periodic notification', { 
                    chatId, 
                    error: error.message 
                  });
                }
              }, this.notificationInterval);

              this.activeIntervals.set(chatId, intervalId);
              restoredCount++;
            }
          }

          // Handle auto-ticket restoration (for both active and stopped notifications)
          if (notification.autoTicketScheduled && !notification.autoTicketCreated) {
            // Calculate remaining time for auto-ticket
            const elapsedTime = Date.now() - new Date(notification.startedAt).getTime();
            const remainingTime = Math.max(0, this.autoTicketDelay - elapsedTime);

            if (remainingTime > 0) {
              // Schedule auto-ticket for remaining time
              const timeoutId = setTimeout(async () => {
                try {
                  await this.createAutoTicket(chat, notification);
                } catch (error) {
                  logger.error('Error in restored auto-ticket creation', { 
                    chatId, 
                    error: error.message,
                    stack: error.stack,
                    fullError: error
                  });
                }
              }, remainingTime);

              this.autoTicketTimeouts.set(chatId, timeoutId);
              
              logger.info(`🔄 Restored auto-ticket timeout: ${chatId} (${Math.round(remainingTime / 1000)}s remaining)`, {
                isActive: notification.isActive,
                stopReason: notification.stopReason
              });
              
              if (!notification.isActive) {
                autoTicketOnlyCount++;
              }
            } else {
              // Auto-ticket should have been created already, create it now
              logger.info(`⚡ Creating overdue auto-ticket: ${chatId}`);
              await this.createAutoTicket(chat, notification);
              
              if (!notification.isActive) {
                autoTicketOnlyCount++;
              }
            }
          }

        } catch (error) {
          logger.error(`❌ Failed to restore notification: ${notification.chatId}`, { 
            error: error.message 
          });
          errorCount++;
        }
      }

      const result = {
        total: notificationsToRestore.length + expiredResult.modifiedCount,
        restored: restoredCount,
        autoTicketOnly: autoTicketOnlyCount,
        expired: expiredResult.modifiedCount,
        errors: errorCount
      };

      logger.info(`✅ Notification restoration completed`, result);
      return result;

    } catch (error) {
      logger.error('❌ Failed to restore active notifications', { error: error.message });
      throw error;
    }
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

      // Schedule auto-ticket creation after 5 minutes
      await this.scheduleAutoTicket(chat, notificationRecord);

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
   * Preserves the original auto-ticket timeout to include all messages
   * @param {Object} chat - Updated chat object
   * @returns {Promise<Object>} Updated notification record
   */
  async resetNotifications(chat) {
    try {
      const chatId = chat._id.toString();
      
      logger.info('Resetting notifications for chat (preserving auto-ticket)', { 
        chatId, 
        userNs: chat.userNs 
      });

      // Check if there's an existing notification record with auto-ticket scheduled
      const existingRecord = await ChatNotification.findOne({ chatId });
      const hasAutoTicketScheduled = existingRecord && existingRecord.autoTicketScheduled && !existingRecord.autoTicketCreated;

      if (hasAutoTicketScheduled) {
        logger.info('🎫 Preserving existing auto-ticket timeout (will include new messages)', { 
          chatId,
          originalStartTime: existingRecord.startedAt
        });

        // Only stop the periodic notifications, keep auto-ticket timeout
        this.cleanupInterval(chatId);

        // Reset notification count and reactivate notifications
        existingRecord.notificationCount = 0;
        existingRecord.isActive = true;
        existingRecord.lastNotificationAt = new Date();
        existingRecord.stoppedAt = null;
        existingRecord.stopReason = null;
        // Keep original startedAt and autoTicketScheduled = true
        
        await existingRecord.save();

        // Send immediate notification (first one for the reset)
        await this.sendNotification(chat, existingRecord, true);

        // Set up new periodic notifications
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

        // Store new interval ID
        this.activeIntervals.set(chatId, intervalId);
        existingRecord.intervalId = intervalId.toString();
        await existingRecord.save();

        logger.info('✅ Notifications reset with preserved auto-ticket', { 
          chatId,
          newIntervalId: intervalId.toString(),
          autoTicketStillScheduled: true
        });

        return existingRecord;

      } else {
        // No auto-ticket scheduled or already created, use normal reset
        logger.info('🔄 No auto-ticket to preserve, doing full reset', { chatId });
        
        // Stop existing notifications completely
        await this.stopNotifications(chatId, 'reset_full');

        // Start fresh notifications
        return await this.startNotifications(chat);
      }

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

      // Only cancel auto-ticket timeout for specific reasons (when agent views chat or ticket created)
      // Do NOT cancel for 'max_reached' or 'reset' - auto-ticket should still be created
      const reasonsThatCancelAutoTicket = ['viewed', 'manual', 'auto_ticket_created', 'system_shutdown', 'reset_full'];
      if (reasonsThatCancelAutoTicket.includes(reason)) {
        this.cancelAutoTicket(chatId);
        logger.info('🚫 Auto-ticket cancelled due to reason', { chatId, reason });
      } else {
        logger.info('⏰ Auto-ticket NOT cancelled, will still be created', { chatId, reason });
      }

      // Update notification record (only if it exists and is active)
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
        // Don't log as warning for expected cases (expired notifications, etc.)
        const expectedReasons = ['expired_on_restart', 'chat_not_found', 'system_shutdown'];
        if (expectedReasons.includes(reason)) {
          logger.debug('No active notification record found (expected)', { chatId, reason });
        } else {
          logger.warn('No active notification record found to stop', { chatId, reason });
        }
      }

      return notificationRecord;

    } catch (error) {
      logger.error('Error stopping notifications', { chatId, error: error.message });
      throw error;
    }
  }

  /**
   * Handle view chat action - stops notifications, cancels auto-ticket, and sends agent joined message
   * @param {string} chatId - Chat ID
   * @param {string} userNs - User namespace
   * @returns {Promise<Object>} Result of the operation
   */
  async handleViewChat(chatId, userNs) {
    try {
      logger.info('🚀 handleViewChat called', { chatId, userNs });

      // Cancel auto-ticket timeout if scheduled
      this.cancelAutoTicket(chatId);

      // Stop notifications
      logger.info('🛑 Stopping notifications...', { chatId });
      await this.stopNotifications(chatId, 'viewed');
      logger.info('✅ Notifications stopped', { chatId });

      // Check if agent message has already been sent for this chat
      const ChatNotification = require('../models/ChatNotification');
      const notification = await ChatNotification.findOne({ chatId });
      
      let apiResult = { success: false, skipped: true, reason: 'No notification record found' };
      
      if (notification) {
        if (notification.agentJoinedMessageSent) {
          logger.info('⏭️ Agent message already sent for this chat, skipping UChat API call', { 
            chatId, 
            userNs,
            sentAt: notification.agentJoinedMessageSentAt 
          });
          apiResult = { 
            success: true, 
            skipped: true, 
            reason: 'Agent message already sent',
            sentAt: notification.agentJoinedMessageSentAt
          };
        } else {
          // Send human agent notification to UChat API
          logger.info('📞 Calling UChat API (first time for this chat)...', { userNs });
          apiResult = await this.sendHumanAgentNotification(userNs);
          logger.info('📞 UChat API call completed', { userNs, success: apiResult.success });
          
          // Mark message as sent if successful
          if (apiResult.success) {
            notification.agentJoinedMessageSent = true;
            notification.agentJoinedMessageSentAt = new Date();
            await notification.save();
            logger.info('✅ Marked agent message as sent', { chatId, userNs });
          }
        }
      } else {
        logger.warn('⚠️ No notification record found for chat, skipping UChat API call', { chatId });
      }

      const result = {
        success: true,
        notificationsStopped: true,
        autoTicketCancelled: true,
        apiCallResult: apiResult,
        uchatUrl: `https://www.uchat.com.au/inbox/${userNs}`
      };

      logger.info('✅ View chat action completed', { 
        chatId, 
        userNs,
        apiSuccess: apiResult.success,
        apiSkipped: apiResult.skipped,
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
   * Schedule auto-ticket creation after 5 minutes
   * @param {Object} chat - Chat object
   * @param {Object} notificationRecord - Notification record
   */
  async scheduleAutoTicket(chat, notificationRecord) {
    try {
      const chatId = chat._id.toString();
      
      logger.info('⏰ Scheduling auto-ticket creation', { 
        chatId, 
        userNs: chat.userNs,
        delayMinutes: this.autoTicketDelay / 60000
      });

      // Set timeout for 5 minutes
      const timeoutId = setTimeout(async () => {
        try {
          await this.createAutoTicket(chat, notificationRecord);
        } catch (error) {
          logger.error('Error in auto-ticket creation', { 
            chatId, 
            error: error.message,
            stack: error.stack,
            fullError: error
          });
        }
      }, this.autoTicketDelay);

      // Store timeout ID for cleanup
      this.autoTicketTimeouts.set(chatId, timeoutId);

      // Mark as scheduled in database
      notificationRecord.autoTicketScheduled = true;
      await notificationRecord.save();

      logger.info('✅ Auto-ticket scheduled', { 
        chatId,
        timeoutId: timeoutId.toString()
      });

    } catch (error) {
      logger.error('Error scheduling auto-ticket', { 
        chatId: chat._id?.toString(), 
        error: error.message 
      });
    }
  }

  /**
   * Cancel auto-ticket timeout
   * @param {string} chatId - Chat ID
   */
  cancelAutoTicket(chatId) {
    const timeoutId = this.autoTicketTimeouts.get(chatId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.autoTicketTimeouts.delete(chatId);
      logger.info('⏹️ Auto-ticket timeout cancelled', { chatId });
    }
  }

  /**
   * Create auto-ticket when no agent responds within 5 minutes
   * @param {Object} chat - Chat object
   * @param {Object} notificationRecord - Notification record
   */
  async createAutoTicket(chat, notificationRecord) {
    try {
      const chatId = chat._id.toString();
      
      logger.info('🎫 Creating auto-ticket (no agent response)', { 
        chatId, 
        userNs: chat.userNs 
      });

      // Check if agent has viewed the chat or ticket already created
      const updatedRecord = await ChatNotification.findOne({ chatId });
      if (!updatedRecord) {
        logger.warn('⚠️ No notification record found, skipping auto-ticket', { chatId });
        return;
      }

      // Only skip auto-ticket for these specific reasons:
      // 1. Agent has viewed the chat (agent is handling it)
      // 2. Auto-ticket already created (avoid duplicates)
      const skipReasons = ['viewed', 'auto_ticket_created'];
      if (updatedRecord.stopReason && skipReasons.includes(updatedRecord.stopReason)) {
        logger.info('⏭️ Auto-ticket skipped', { 
          chatId, 
          reason: updatedRecord.stopReason,
          message: updatedRecord.stopReason === 'viewed' 
            ? 'Agent is handling the chat' 
            : 'Auto-ticket already exists'
        });
        return;
      }

      // For all other cases, create the auto-ticket
      // This includes: max_reached, system_shutdown, chat_not_found, etc.
      logger.info('🎫 Proceeding with auto-ticket creation', { 
        chatId, 
        stopReason: updatedRecord.stopReason || 'timeout_expired',
        isActive: updatedRecord.isActive,
        reason: 'Customer needs support - no agent intervention detected'
      });

      // Prepare ticket context
      const fullName = `${chat.firstname} ${chat.lastname}`.trim() || 'Unknown User';
      const email = chat.email || 'no-email@provided.com';
      const phone = chat.phone || 'No phone provided';
      
      // Build message context from chat messages
      let messageContext = '';
      if (chat.messages && chat.messages.length > 0) {
        messageContext = chat.messages.map((msg, index) => {
          const timestamp = new Date(msg.timestamp).toLocaleString();
          return `[${timestamp}] ${msg.source}: ${msg.text}`;
        }).join('\n');
      } else {
        messageContext = chat.comment || chat.description || 'No message content available';
      }

      // PARALLEL CLIENT RESOLUTION: phone lookup + email + domain (all three simultaneously)
      let resolvedClientId = null;
      let resolvedFrom = null;

      // Use stored domain field first, then fall back to extracting from email
      let domain = chat.domain || null;
      if (!domain && email && email.includes('@') && !email.includes('@uchat.generated')) {
        const emailParts = email.split('@');
        if (emailParts.length === 2) {
          domain = emailParts[1];
        }
      }

      const parallelTasks = [];

      // Task 1: Phone lookup via external client_lookup API
      if (chat.phone && chat.phone.trim() !== '' && chat.phone !== 'No phone provided') {
        parallelTasks.push(
          this.resolvePhoneToClient(chat.phone)
            .then(result => ({ type: 'phone', success: true, data: result }))
            .catch(error => ({ type: 'phone', success: false, error: error.message }))
        );
      }

      // Task 2: Domain resolution
      if (domain) {
        parallelTasks.push(
          this.resolveDomainToClient(domain)
            .then(result => ({ type: 'domain', success: true, data: result }))
            .catch(error => ({ type: 'domain', success: false, error: error.message }))
        );
      }

      // Task 3: Email resolution (only real emails)
      if (email && !email.includes('@uchat.generated') && !email.startsWith('client@')) {
        parallelTasks.push(
          this.resolveEmailToClient(email)
            .then(result => ({ type: 'email', success: true, data: result }))
            .catch(error => ({ type: 'email', success: false, error: error.message }))
        );
      }

      if (parallelTasks.length > 0) {
        logger.info('→ Running parallel client resolution (phone + domain + email)', {
          chatId,
          hasPhone: !!chat.phone,
          hasDomain: !!domain,
          hasEmail: !!(email && !email.includes('@uchat.generated')),
        });

        const results = await Promise.allSettled(parallelTasks);
        let phoneResult = null;
        let domainResult = null;
        let emailResult = null;

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.success) {
            if (result.value.type === 'phone') phoneResult = result.value.data;
            else if (result.value.type === 'domain') domainResult = result.value.data;
            else if (result.value.type === 'email') emailResult = result.value.data;
          }
        }

        // Priority: phone > domain > email
        if (phoneResult) {
          resolvedClientId = phoneResult.clientId;
          resolvedFrom = 'phone';
        } else if (domainResult && emailResult) {
          resolvedClientId = domainResult.clientId === emailResult.clientId
            ? domainResult.clientId
            : domainResult.clientId; // domain wins on mismatch
          resolvedFrom = domainResult.clientId === emailResult.clientId ? 'domain+email' : 'domain_priority';
        } else if (domainResult) {
          resolvedClientId = domainResult.clientId;
          resolvedFrom = 'domain';
        } else if (emailResult) {
          resolvedClientId = emailResult.clientId;
          resolvedFrom = 'email';
        }

        if (resolvedClientId) {
          logger.info(`→ Client resolved via ${resolvedFrom}`, { chatId, clientId: resolvedClientId });
        } else {
          logger.info('→ No client resolved — will create lead instead of guest ticket', { chatId });
        }
      }

      // Create ticket subject and message
      const subject = `Auto-Ticket: Chat from ${fullName} (No Agent Response)`;
      const message = `This ticket was automatically created because no agent responded to the chat within 5 minutes.

**Chat Details:**
- Name: ${fullName}
- Email: ${email}
- Phone: ${phone}
- User NS: ${chat.userNs}
- Chat Started: ${new Date(chat.createdAt).toLocaleString()}
${resolvedClientId ? `- Client ID: ${resolvedClientId} (resolved from ${resolvedFrom})` : '- Client: Not found in WHMCS (guest ticket)'}

**Chat Messages:**
${messageContext}

**Note:** Customer has been notified that a ticket has been raised.`;

      // Get WHMCS service for ticket creation
      const whmcsService = require('./whmcsService');
      const { openOrMergeTicket } = require('./ticketDeduplicationService');
      
      // Determine department ID (use Support department)
      const deptId = process.env.TECHSUPPORT_DEPTID || process.env.SUPPORT_DEPTID;
      
      if (!deptId) {
        logger.error('❌ No support department ID configured', { chatId });
        throw new Error('Support department not configured');
      }

      // If no client resolved — create a lead instead of a guest ticket
      if (!resolvedClientId) {
        logger.info('📋 No client resolved — creating lead in VTiger instead of guest ticket', { chatId });
        try {
          const { createLeadFlow } = require('./vtiger');
          const { broadcastNewLead } = require('./websocket');
          const Lead = require('../models/Lead');

          const leadEmail = email && !email.includes('@uchat.generated') && !email.startsWith('client@')
            ? email
            : (chat.userNs ? `${chat.userNs.toLowerCase().replace(/[^a-z0-9]/g, '_')}@uchat.generated` : `guest_${Date.now().toString(36)}@uchat.generated`);

          const vtigerResponse = await createLeadFlow({
            username: fullName,
            email: leadEmail,
            phone: chat.phone || '',
            description: messageContext,
            User_Ns: chat.userNs || '',
          });

          if (vtigerResponse.success && vtigerResponse.result) {
            const leadData = {
              vtigerId: vtigerResponse.result.id || vtigerResponse.existingLeadId,
              firstname: vtigerResponse.result.firstname || chat.firstname,
              lastname: vtigerResponse.result.lastname || chat.lastname,
              email: vtigerResponse.result.email || leadEmail,
              phone: vtigerResponse.result.mobile || chat.phone || '',
              description: messageContext,
              comment: messageContext,
              source: 'Chatbot',
              userNs: chat.userNs || '',
            };

            try {
              await Lead.findOneAndUpdate(
                { vtigerId: leadData.vtigerId },
                leadData,
                { upsert: true, new: true }
              );
              broadcastNewLead({ ...leadData, id: leadData.vtigerId, createdAt: new Date() });
            } catch (dbErr) {
              logger.warn('Failed to save lead to DB after auto-ticket fallback', { error: dbErr.message });
            }

            logger.info('✅ Lead created as fallback (no client resolved)', { chatId, vtigerId: leadData.vtigerId });
          }

          // Notify customer and stop notifications without creating a ticket
          await this.resumeBot(chat.userNs);
          await this.stopNotifications(chatId, 'auto_ticket_created');
          return;
        } catch (leadErr) {
          logger.error('❌ Lead creation fallback failed', { chatId, error: leadErr.message });
          // Fall through to guest ticket as last resort
        }
      }

      // Create ticket in WHMCS
      const ticketParams = {
        deptid: deptId,
        subject: subject,
        message: message,
        priority: 'Medium'
      };
      
      // Add client ID if resolved, otherwise use name/email
      if (resolvedClientId) {
        ticketParams.clientid = resolvedClientId;
        logger.info('📤 Creating WHMCS ticket for resolved client', { 
          chatId,
          clientId: resolvedClientId,
          resolvedFrom
        });
      } else {
        ticketParams.name = fullName;
        ticketParams.email = email;
        logger.info('📤 Creating WHMCS ticket as guest', { 
          chatId,
          name: fullName,
          email
        });
      }

      const ticketResult = await openOrMergeTicket({
        ticketType: 'auto_chat',
        ...ticketParams,
        domain: chat.domain || null,
      });
      
      if (!ticketResult || !ticketResult.ticketId) {
        throw new Error('Failed to create ticket in WHMCS');
      }

      const ticketId = ticketResult.ticketId;
      const ticketNumber = ticketResult.ticketNumber;
      logger.info(ticketResult.merged ? '🔀 Content merged into existing ticket' : '✅ New WHMCS ticket created', {
        chatId,
        ticketId,
        ticketNumber,
        merged: ticketResult.merged,
        clientId: resolvedClientId || 'guest',
      });

      // Send message to customer via UChat API with ticket number
      await this.sendNoAgentMessage(chat.userNs, ticketNumber, ticketResult.merged);

      // Resume bot after sending message
      await this.resumeBot(chat.userNs);

      // Update notification record
      notificationRecord.autoTicketCreated = true;
      notificationRecord.autoTicketCreatedAt = new Date();
      notificationRecord.autoTicketId = ticketId.toString();
      await notificationRecord.save();

      // Stop notifications
      await this.stopNotifications(chatId, 'auto_ticket_created');

      logger.info('✅ Auto-ticket process completed', { 
        chatId, 
        ticketId,
        ticketNumber,
        userNs: chat.userNs,
        clientId: resolvedClientId || 'guest'
      });

    } catch (error) {
      logger.error('❌ Error creating auto-ticket', { 
        chatId: chat._id?.toString(), 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Send "No agent available" message to customer via UChat API
   * @param {string} userNs - User namespace
   * @param {string} ticketNumber - Ticket number to include in message
   * @returns {Promise<Object>} API call result
   */
  async sendNoAgentMessage(userNs, ticketNumber, merged = false) {
    try {
      logger.info('📤 Sending no-agent message to customer', { userNs, ticketNumber, merged });

      if (!userNs || userNs.trim() === '') {
        logger.warn('❌ No User_Ns provided, skipping UChat API call', { userNs });
        return { success: false, error: 'No User_Ns provided' };
      }

      if (typeof userNs !== 'string' || userNs.length < 5) {
        logger.warn('❌ Invalid User_Ns format, skipping UChat API call', { userNs, length: userNs?.length });
        return { success: false, error: 'Invalid User_Ns format' };
      }

      const content = merged
        ? `Your latest message has been added to your existing support ticket #${ticketNumber}. Our team will review it shortly.`
        : `As no live agent is available right now, we've automatically created support ticket #${ticketNumber} on your behalf.\n\nOur 24x7 helpdesk support team will review it and update you at the earliest opportunity.`;

      const payload = { user_ns: userNs, content };

      logger.info('📤 Sending to UChat API', { 
        userNs, 
        apiUrl: this.uchatApiUrl,
        payload: payload,
        bearerTokenPrefix: this.uchatBearerToken ? this.uchatBearerToken.substring(0, 10) + '...' : 'NOT SET'
      });

      const response = await axios.post(this.uchatApiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.uchatBearerToken}`
        },
        timeout: 10000 // 10 second timeout
      });

      logger.info('✅ No-agent message sent successfully', { 
        userNs,
        ticketNumber,
        status: response.status,
        data: response.data 
      });

      return { 
        success: true, 
        status: response.status, 
        data: response.data 
      };

    } catch (error) {
      logger.error('❌ Failed to send no-agent message', { 
        userNs,
        ticketNumber,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
        stack: error.stack,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout
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
   * Resume bot for user via UChat API
   * @param {string} userNs - User namespace
   * @returns {Promise<Object>} API call result
   */
  async resumeBot(userNs) {
    try {
      logger.info('🤖 Resuming bot for user', { userNs });

      if (!userNs || userNs.trim() === '') {
        logger.warn('❌ No User_Ns provided, skipping resume-bot API call', { userNs });
        return { success: false, error: 'No User_Ns provided' };
      }

      // Validate userNs format (basic validation)
      if (typeof userNs !== 'string' || userNs.length < 5) {
        logger.warn('❌ Invalid User_Ns format, skipping resume-bot API call', { userNs, length: userNs?.length });
        return { success: false, error: 'Invalid User_Ns format' };
      }

      const resumeBotUrl = 'https://www.uchat.com.au/api/subscriber/resume-bot';
      const payload = {
        user_ns: userNs
      };

      logger.info('📤 Calling resume-bot API', { 
        userNs, 
        apiUrl: resumeBotUrl,
        payload: payload,
        bearerTokenPrefix: this.uchatBearerToken ? this.uchatBearerToken.substring(0, 10) + '...' : 'NOT SET'
      });

      const response = await axios.post(resumeBotUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.uchatBearerToken}`
        },
        timeout: 10000 // 10 second timeout
      });

      logger.info('✅ Bot resumed successfully', { 
        userNs,
        status: response.status,
        data: response.data 
      });

      return { 
        success: true, 
        status: response.status, 
        data: response.data 
      };

    } catch (error) {
      logger.error('❌ Failed to resume bot', { 
        userNs,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
        stack: error.stack,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout
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
        
        // Still clear local intervals and timeouts
        let clearedCount = 0;
        for (const [chatId, intervalId] of this.activeIntervals) {
          clearInterval(intervalId);
          clearedCount++;
          logger.debug('Cleared interval', { chatId, intervalId });
        }
        this.activeIntervals.clear();
        
        // Clear all auto-ticket timeouts
        for (const [chatId, timeoutId] of this.autoTicketTimeouts) {
          clearTimeout(timeoutId);
          logger.debug('Cleared auto-ticket timeout', { chatId, timeoutId });
        }
        this.autoTicketTimeouts.clear();
        
        logger.info('Local intervals and timeouts cleared', { count: clearedCount });
        return clearedCount;
      }

      // Clear all intervals
      for (const [chatId, intervalId] of this.activeIntervals) {
        clearInterval(intervalId);
        logger.debug('Cleared interval', { chatId, intervalId });
      }
      this.activeIntervals.clear();

      // Clear all auto-ticket timeouts
      for (const [chatId, timeoutId] of this.autoTicketTimeouts) {
        clearTimeout(timeoutId);
        logger.debug('Cleared auto-ticket timeout', { chatId, timeoutId });
      }
      this.autoTicketTimeouts.clear();

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
      
      // Still try to clear local intervals and timeouts even if database update fails
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
      
      // Clear all auto-ticket timeouts
      for (const [chatId, timeoutId] of this.autoTicketTimeouts) {
        try {
          clearTimeout(timeoutId);
        } catch (clearError) {
          logger.error('Error clearing auto-ticket timeout', { chatId, error: clearError.message });
        }
      }
      this.autoTicketTimeouts.clear();
      
      logger.info('Local intervals and timeouts cleared after error', { count: clearedCount });
      return clearedCount;
    }
  }

  /**
   * Resolve client by phone via external client_lookup API
   * @param {string} phone - Phone number
   * @returns {Promise<Object>} { clientId, phone }
   */
  async resolvePhoneToClient(phone) {
    try {
      const { normalizePhone } = require('../utils/phoneNormalizer');
      const normalized = normalizePhone(phone);
      if (!normalized) throw new Error('Invalid phone number');

      const url = `https://portal.hostbreak.com/client_lookup.php?secret=fdf256fb4995528972f5338581eeb3de1d459b505ac13b847d04392518274013&phone=${encodeURIComponent(normalized)}`;
      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;

      // Response: { is_client: true, client_data: { id, full_name, email, status }, active_services: [...] }
      if (data && data.is_client === true && data.client_data && data.client_data.id) {
        const clientId = String(data.client_data.id);
        logger.debug('→ Phone resolved to client', { phone: normalized, clientId });
        return { clientId, phone: normalized, clientData: data.client_data };
      }

      throw new Error(`No client found for phone: ${normalized}`);
    } catch (error) {
      logger.debug('→ Phone resolution failed', { phone, error: error.message });
      throw error;
    }
  }

  /**
   * Helper method to resolve domain to client
   * @param {string} domain - Domain name
   * @returns {Promise<Object>} Client resolution result
   */
  async resolveDomainToClient(domain) {
    const { callApi } = require('./whmcsService');
    
    try {
      logger.debug('→ Resolving domain to client', { domain });
      
      const result = await callApi('GetClientsDomains', { domain });
      
      if (result && result.domains && result.domains.domain) {
        const domains = Array.isArray(result.domains.domain) 
          ? result.domains.domain 
          : [result.domains.domain];
        
        if (domains.length > 0) {
          const clientId = domains[0].userid || domains[0].clientid;
          logger.debug('→ Domain resolved to client', { domain, clientId });
          return { clientId, domain };
        }
      }
      
      throw new Error(`No client found for domain: ${domain}`);
    } catch (error) {
      logger.debug('→ Domain resolution failed', { domain, error: error.message });
      throw error;
    }
  }

  /**
   * Helper method to resolve email to client
   * @param {string} email - Email address
   * @returns {Promise<Object>} Client resolution result
   */
  async resolveEmailToClient(email) {
    const { getClientsDetails } = require('./whmcsService');
    
    try {
      logger.debug('→ Resolving email to client', { email });
      
      const result = await getClientsDetails({ email });
      
      if (result && result.userid) {
        const clientId = result.userid;
        logger.debug('→ Email resolved to client', { email, clientId });
        return { clientId, email };
      }
      
      throw new Error(`No client found for email: ${email}`);
    } catch (error) {
      logger.debug('→ Email resolution failed', { email, error: error.message });
      throw error;
    }
  }
}

// Create singleton instance
const chatNotificationService = new ChatNotificationService();

module.exports = chatNotificationService;