/**
 * Chats Controller
 * Handles HTTP requests for incoming chat messages
 */

const Chat = require('../models/Chat');
const { broadcastNewChat } = require('../services/websocket');
const { createLogger } = require('../utils/logger');
const { splitName } = require('../services/vtiger');

const logger = createLogger('CHATS_CONTROLLER');

/**
 * Create chat endpoint
 * POST /api/chats
 * Body: { username, email, phone, description, User_Ns }
 */
exports.createChat = async (req, res, next) => {
  try {
    let { username, email, phone, description, comment, User_Ns } = req.body;
    
    // Use comment if description is not provided
    const messageText = description || comment;
    
    logger.info('Incoming chat request received', { 
      email,
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
    
    // Create chat data
    const chatData = {
      firstname,
      lastname,
      email,
      phone: phone || '',
      description: messageText || '',
      comment: messageText || '',
      source: 'Chatbot',
      userNs: User_Ns || ''
    };
    
    try {
      // Save to database
      const savedChat = await Chat.create(chatData);
      
      // Broadcast to frontend
      const broadcastData = {
        id: savedChat._id.toString(),
        firstname: savedChat.firstname,
        lastname: savedChat.lastname,
        email: savedChat.email,
        phone: savedChat.phone,
        description: savedChat.description,
        comment: savedChat.comment,
        createdAt: savedChat.createdAt,
        source: savedChat.source,
        userNs: savedChat.userNs
      };
      
      broadcastNewChat(broadcastData);
      
      logger.info('Chat saved and broadcasted', { 
        chatId: savedChat._id,
        email: savedChat.email 
      });
      
      // Return success response
      res.json({
        success: true,
        chat: broadcastData
      });
      
    } catch (dbError) {
      logger.error('Failed to save chat to database', { 
        error: dbError.message,
        email 
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
 * Get chats endpoint
 * GET /api/chats
 * Query params: limit (default: 50), offset (default: 0)
 * Returns chats sorted by creation date (descending)
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
    
    // Fetch chats with pagination and sorting
    const chats = await Chat.find()
      .sort({ createdAt: -1 }) // Sort by creation date descending
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
      email: deletedChat.email 
    });
    
    res.json({
      success: true,
      message: 'Chat deleted successfully',
      deletedChat: {
        id: deletedChat._id.toString(),
        email: deletedChat.email
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
