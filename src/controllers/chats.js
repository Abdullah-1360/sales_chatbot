/**
 * Chats Controller
 * Handles HTTP requests for incoming chat messages
 */

const Chat = require('../models/Chat');
const { broadcastNewChat } = require('../services/websocket');
const chatNotificationService = require('../services/chatNotificationService');
const { createLogger } = require('../utils/logger');
const { splitName } = require('../services/vtiger');

const logger = createLogger('CHATS_CONTROLLER');

/**
 * Create chat endpoint - Enhanced to handle multiple messages per user
 * POST /api/chats
 * Body: { username, email, phone, description, comment, User_Ns, domain }
 */
exports.createChat = async (req, res, next) => {
  try {
    let { username, email, phone, description, comment, User_Ns, domain } = req.body;
    
    // Use comment if description is not provided
    const messageText = description || comment;
    
    logger.info('Incoming chat request received', { 
      email,
      domain,
      hasPhone: !!phone,
      hasDescription: !!description,
      hasComment: !!comment,
      hasUserNs: !!User_Ns,
      ip: req.ip 
    });
    
    // Validate required fields
    if (!username) {
      return res.status(400).json({ 
        success: false,
        error: 'username is required' 
      });
    }
    
    if (!messageText || messageText.trim() === '') {
      return res.status(400).json({ 
        success: false,
        error: 'message text is required (description or comment)' 
      });
    }
    
    // Generate unique email based on User_Ns if email is empty
    if (!email || email.trim() === '') {
      if (User_Ns && User_Ns.trim() !== '') {
        // Create email from User_Ns: user_ns@uchat.generated
        email = `${User_Ns.toLowerCase().replace(/[^a-z0-9]/g, '_')}@uchat.generated`;
        logger.info('Generated email from User_Ns', { 
          User_Ns,
          generatedEmail: email 
        });
      } else {
        // No email and no User_Ns - generate random email
        const randomId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        email = `guest_${randomId}@uchat.generated`;
        logger.info('Generated random email (no User_Ns provided)', { 
          generatedEmail: email 
        });
      }
    }
    
    // Split name
    const { firstname, lastname } = splitName(username);
    
    let savedChat;
    let isNewChat = false;
    
    try {
      // Check if chat already exists for this User_Ns
      if (User_Ns && User_Ns.trim() !== '') {
        const existingChat = await Chat.findOne({ userNs: User_Ns });
        
        if (existingChat) {
          // Append new message to existing chat
          logger.info('Found existing chat, appending message', { 
            chatId: existingChat._id,
            userNs: User_Ns,
            currentMessageCount: existingChat.messageCount 
          });
          
          const newMessage = {
            text: messageText,
            timestamp: new Date(),
            source: 'user'
          };
          
          // Update existing chat with new message
          existingChat.messages.push(newMessage);
          existingChat.lastMessageAt = new Date();
          existingChat.messageCount = existingChat.messages.length;
          
          // Update description/comment to latest message for backward compatibility
          existingChat.description = messageText;
          existingChat.comment = messageText;
          
          // Update user info if provided (in case user details changed)
          if (username) {
            existingChat.firstname = firstname;
            existingChat.lastname = lastname;
          }
          if (phone) {
            existingChat.phone = phone;
          }
          
          savedChat = await existingChat.save();
          isNewChat = false;
          
        } else {
          // Create new chat
          isNewChat = true;
        }
      } else {
        // No User_Ns provided, always create new chat
        isNewChat = true;
      }
      
      // Create new chat if needed
      if (isNewChat) {
        logger.info('Creating new chat', { 
          userNs: User_Ns,
          email 
        });
        
        const chatData = {
          firstname,
          lastname,
          email,
          phone: phone || '',
          description: messageText,
          comment: messageText,
          messages: [{
            text: messageText,
            timestamp: new Date(),
            source: 'user'
          }],
          source: 'Chatbot',
          userNs: User_Ns || '',
          lastMessageAt: new Date(),
          messageCount: 1
        };
        
        savedChat = await Chat.create(chatData);
      }
      
      // Broadcast to frontend
      const broadcastData = {
        id: savedChat._id.toString(),
        firstname: savedChat.firstname,
        lastname: savedChat.lastname,
        email: savedChat.email,
        phone: savedChat.phone,
        description: savedChat.description,
        comment: savedChat.comment,
        messages: savedChat.messages.map(msg => ({
          id: msg._id.toString(),
          text: msg.text,
          timestamp: msg.timestamp,
          source: msg.source
        })),
        messageCount: savedChat.messageCount,
        lastMessageAt: savedChat.lastMessageAt,
        createdAt: savedChat.createdAt,
        source: savedChat.source,
        userNs: savedChat.userNs,
        isNewChat: isNewChat,
        isUpdate: !isNewChat
      };
      
      broadcastNewChat(broadcastData);
      
      // Handle backend notifications
      try {
        if (isNewChat) {
          // Start notifications for new chat
          logger.info('Starting backend notifications for new chat', { 
            chatId: savedChat._id.toString() 
          });
          await chatNotificationService.startNotifications(savedChat);
        } else {
          // Reset notifications for existing chat with new message
          logger.info('Resetting backend notifications for existing chat', { 
            chatId: savedChat._id.toString() 
          });
          await chatNotificationService.resetNotifications(savedChat);
        }
      } catch (notificationError) {
        logger.error('Failed to handle backend notifications', {
          chatId: savedChat._id.toString(),
          isNewChat,
          error: notificationError.message
        });
        // Don't fail the request if notifications fail
      }
      
      logger.info('Chat processed and broadcasted', { 
        chatId: savedChat._id,
        email: savedChat.email,
        isNewChat: isNewChat,
        messageCount: savedChat.messageCount
      });
      
      // Return success response
      res.json({
        success: true,
        chat: broadcastData,
        isNewChat: isNewChat,
        messageCount: savedChat.messageCount
      });
      
    } catch (dbError) {
      logger.error('Failed to save chat to database', { 
        error: dbError.message,
        email,
        userNs: User_Ns
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to save chat'
      });
    }
    
  } catch (error) {
    logger.error('Error in createChat controller', { 
      error: error.message,
      stack: error.stack 
    });
    next(error);
  }
};

/**
 * Get chats endpoint - Enhanced to return message arrays
 * GET /api/chats
 * Query params: limit (default: 50), offset (default: 0)
 * Returns chats sorted by last message time (descending)
 */
exports.getChats = async (req, res, next) => {
  try {
    // Parse query parameters with defaults
    const limit = req.query.limit !== undefined ? parseInt(req.query.limit) : 50;
    const offset = req.query.offset !== undefined ? parseInt(req.query.offset) : 0;
    
    // Validate pagination parameters
    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'limit must be between 1 and 100'
      });
    }
    
    if (offset < 0) {
      return res.status(400).json({
        success: false,
        error: 'offset must be non-negative'
      });
    }
    
    logger.info('Fetching chats', { limit, offset });
    
    // Fetch chats with pagination and sorting by last message time
    const chats = await Chat.find()
      .sort({ lastMessageAt: -1 }) // Sort by last message time descending
      .skip(offset)
      .limit(limit)
      .lean(); // Return plain JavaScript objects for better performance
    
    // Get total count for pagination metadata
    const total = await Chat.countDocuments();
    
    // Transform chats to match frontend expectations
    const transformedChats = chats.map(chat => ({
      id: chat._id.toString(),
      firstname: chat.firstname,
      lastname: chat.lastname,
      email: chat.email,
      phone: chat.phone || '',
      description: chat.description || '',
      comment: chat.comment || '',
      messages: (chat.messages || []).map(msg => ({
        id: msg._id.toString(),
        text: msg.text,
        timestamp: msg.timestamp,
        source: msg.source
      })),
      messageCount: chat.messageCount || 1,
      lastMessageAt: chat.lastMessageAt || chat.createdAt,
      createdAt: chat.createdAt,
      source: chat.source || 'Chatbot',
      userNs: chat.userNs || ''
    }));
    
    logger.info('Chats fetched successfully', { 
      count: transformedChats.length,
      total,
      limit,
      offset 
    });
    
    res.json({
      success: true,
      chats: transformedChats,
      total,
      limit,
      offset
    });
    
  } catch (error) {
    logger.error('Error in getChats controller', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

/**
 * Get individual chat with all messages
 * GET /api/chats/:id
 * Returns a single chat with all its messages
 */
exports.getChatById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    logger.info('Fetching chat by ID', { id });
    
    // Find the chat by ID
    const chat = await Chat.findById(id).lean();
    
    if (!chat) {
      logger.warn('Chat not found', { id });
      return res.status(404).json({
        success: false,
        error: 'Chat not found'
      });
    }
    
    // Transform chat to match frontend expectations
    const transformedChat = {
      id: chat._id.toString(),
      firstname: chat.firstname,
      lastname: chat.lastname,
      email: chat.email,
      phone: chat.phone || '',
      description: chat.description || '',
      comment: chat.comment || '',
      messages: (chat.messages || []).map(msg => ({
        id: msg._id.toString(),
        text: msg.text,
        timestamp: msg.timestamp,
        source: msg.source
      })),
      messageCount: chat.messageCount || 1,
      lastMessageAt: chat.lastMessageAt || chat.createdAt,
      createdAt: chat.createdAt,
      source: chat.source || 'Chatbot',
      userNs: chat.userNs || ''
    };
    
    logger.info('Chat fetched successfully', { 
      id,
      messageCount: transformedChat.messageCount 
    });
    
    res.json({
      success: true,
      chat: transformedChat
    });
    
  } catch (error) {
    logger.error('Error in getChatById controller', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

/**
 * Delete chat endpoint
 * DELETE /api/chats/:id
 * Deletes a chat by ID
 */
exports.deleteChat = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    logger.info('Deleting chat', { id });
    
    // Find and delete the chat
    const deletedChat = await Chat.findByIdAndDelete(id);
    
    if (!deletedChat) {
      logger.warn('Chat not found', { id });
      return res.status(404).json({
        success: false,
        error: 'Chat not found'
      });
    }
    
    logger.info('Chat deleted successfully', { 
      id,
      email: deletedChat.email,
      messageCount: deletedChat.messageCount || 1
    });
    
    res.json({
      success: true,
      message: 'Chat deleted successfully',
      deletedChat: {
        id: deletedChat._id.toString(),
        email: deletedChat.email,
        messageCount: deletedChat.messageCount || 1
      }
    });
    
  } catch (error) {
    logger.error('Error in deleteChat controller', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};
