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
    this.autoTicketTimeouts = new Map(); // chatId -> timeoutId
    this.notificationInterval = 2 * 60 * 1000; // 2 minutes
    this.maxNotifications = 5;
    this.autoTicketDelay = 5 * 60 * 1000; // 5 minutes
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

      // Cancel auto-ticket timeout
      this.cancelAutoTicket(chatId);

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
            error: error.message 
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

      // Check if agent has viewed the chat
      const updatedRecord = await ChatNotification.findOne({ chatId });
      if (!updatedRecord || !updatedRecord.isActive) {
        logger.info('⏭️ Chat already viewed by agent, skipping auto-ticket', { chatId });
        return;
      }

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

      // PARALLEL CLIENT RESOLUTION: Try to resolve client from email/domain
      let resolvedClientId = null;
      let resolvedFrom = null;
      
      // Extract domain from email if available
      let domain = null;
      if (email && email.includes('@') && !email.includes('@uchat.generated')) {
        const emailParts = email.split('@');
        if (emailParts.length === 2) {
          domain = emailParts[1];
        }
      }
      
      if (domain || (email && !email.includes('@uchat.generated'))) {
        logger.info('→ Attempting parallel client resolution', { 
          chatId,
          email: email && !email.includes('@uchat.generated') ? email : null,
          domain 
        });
        
        const parallelTasks = [];
        
        // Task 1: Domain resolution (if domain extracted)
        if (domain) {
          parallelTasks.push(
            this.resolveDomainToClient(domain)
              .then(result => ({ type: 'domain', success: true, data: result }))
              .catch(error => ({ type: 'domain', success: false, error: error.message }))
          );
        }
        
        // Task 2: Email resolution (if real email provided)
        if (email && !email.includes('@uchat.generated')) {
          parallelTasks.push(
            this.resolveEmailToClient(email)
              .then(result => ({ type: 'email', success: true, data: result }))
              .catch(error => ({ type: 'email', success: false, error: error.message }))
          );
        }
        
        // Execute parallel resolution
        if (parallelTasks.length > 0) {
          const results = await Promise.allSettled(parallelTasks);
          
          // Process results
          let domainResult = null;
          let emailResult = null;
          
          for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success) {
              if (result.value.type === 'domain') {
                domainResult = result.value.data;
              } else if (result.value.type === 'email') {
                emailResult = result.value.data;
              }
            }
          }
          
          // Determine which resolution to use
          if (domainResult && emailResult) {
            if (domainResult.clientId === emailResult.clientId) {
              resolvedClientId = domainResult.clientId;
              resolvedFrom = 'domain+email';
              logger.info('→ Client resolved from both domain and email (matching)', { 
                chatId,
                clientId: resolvedClientId 
              });
            } else {
              // Prioritize domain over email
              resolvedClientId = domainResult.clientId;
              resolvedFrom = 'domain_priority';
              logger.info('→ Client resolved from domain (email mismatch)', { 
                chatId,
                clientId: resolvedClientId 
              });
            }
          } else if (domainResult) {
            resolvedClientId = domainResult.clientId;
            resolvedFrom = 'domain';
            logger.info('→ Client resolved from domain', { 
              chatId,
              clientId: resolvedClientId 
            });
          } else if (emailResult) {
            resolvedClientId = emailResult.clientId;
            resolvedFrom = 'email';
            logger.info('→ Client resolved from email', { 
              chatId,
              clientId: resolvedClientId 
            });
          } else {
            logger.info('→ Client resolution failed, creating guest ticket', { chatId });
          }
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
      
      // Determine department ID (use Support department)
      const deptId = process.env.TECHSUPPORT_DEPTID || process.env.SUPPORT_DEPTID;
      
      if (!deptId) {
        logger.error('❌ No support department ID configured', { chatId });
        throw new Error('Support department not configured');
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

      const ticketResult = await whmcsService.openTicket(ticketParams);
      
      if (!ticketResult || !ticketResult.id) {
        throw new Error('Failed to create ticket in WHMCS');
      }

      const ticketId = ticketResult.id;
      const ticketNumber = ticketResult.tid;
      logger.info('✅ WHMCS ticket created', { 
        chatId, 
        ticketId,
        ticketNumber,
        clientId: resolvedClientId || 'guest'
      });

      // Send message to customer via UChat API with ticket number
      await this.sendNoAgentMessage(chat.userNs, ticketNumber);

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
  async sendNoAgentMessage(userNs, ticketNumber) {
    try {
      logger.info('📤 Sending no-agent message to customer', { userNs, ticketNumber });

      if (!userNs || userNs.trim() === '') {
        logger.warn('❌ No User_Ns provided, skipping UChat API call', { userNs });
        return { success: false, error: 'No User_Ns provided' };
      }

      const payload = {
        user_ns: userNs,
        content: `No agent is currently available, raised ticket #${ticketNumber}`
      };

      logger.info('📤 Sending to UChat API', { 
        userNs, 
        apiUrl: this.uchatApiUrl,
        payload: payload
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
        data: error.response?.data
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

      const resumeBotUrl = 'https://www.uchat.com.au/api/subscriber/resume-bot';
      const payload = {
        user_ns: userNs
      };

      logger.info('📤 Calling resume-bot API', { 
        userNs, 
        apiUrl: resumeBotUrl,
        payload: payload
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
        data: error.response?.data
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