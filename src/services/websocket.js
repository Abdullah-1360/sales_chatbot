/**
 * WebSocket Service
 * Manages Socket.IO server and real-time communication
 */

const { Server } = require('socket.io');
const { createLogger } = require('../utils/logger');

const logger = createLogger('WEBSOCKET');

let io = null;

/**
 * Initialize Socket.IO server
 * @param {http.Server} httpServer - HTTP server instance
 * @param {Object} options - Configuration options
 * @param {string} options.corsOrigin - CORS origin for frontend
 * @returns {Server} Socket.IO server instance
 */
function initializeWebSocket(httpServer, options = {}) {
  const { corsOrigin = 'http://localhost:5173' } = options;
  
  // Handle both single origin and array of origins
  const origins = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
  
  io = new Server(httpServer, {
    cors: {
      origin: function (origin, callback) {
        // Allow requests with no origin
        if (!origin) return callback(null, true);
        
        // Check if origin is allowed or is ngrok
        const isAllowed = origins.some(allowed => {
          if (allowed === '*') return true;
          if (allowed === origin) return true;
          if (origin.includes('.ngrok-free.dev') || origin.includes('.ngrok.io')) return true;
          return false;
        });
        
        callback(null, isAllowed);
      },
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  
  // Connection event handler
  io.on('connection', (socket) => {
    logger.info('Client connected', { 
      socketId: socket.id,
      address: socket.handshake.address 
    });
    
    // Handle client disconnection
    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected', { 
        socketId: socket.id,
        reason 
      });
    });
    
    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', { 
        socketId: socket.id,
        error: error.message 
      });
    });
  });
  
  logger.info('WebSocket server initialized', { corsOrigin });
  
  return io;
}

/**
 * Broadcast new lead to all connected clients
 * @param {Object} leadData - Lead information
 * @param {string} leadData.id - Lead ID
 * @param {string} leadData.firstname - First name
 * @param {string} leadData.lastname - Last name
 * @param {string} leadData.email - Email address
 * @param {string} leadData.phone - Phone number
 * @param {string} leadData.description - Lead description
 * @param {Date} leadData.createdAt - Creation timestamp
 */
function broadcastNewLead(leadData) {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot broadcast lead');
    return;
  }
  
  try {
    const payload = {
      type: 'new_lead',
      data: leadData,
      timestamp: new Date()
    };
    
    io.emit('new_lead', payload);
    
    logger.info('Broadcasted new lead', { 
      leadId: leadData.id,
      email: leadData.email,
      connectedClients: io.engine.clientsCount 
    });
  } catch (error) {
    logger.error('Error broadcasting new lead', { 
      error: error.message,
      leadId: leadData.id 
    });
  }
}

/**
 * Broadcast new chat to all connected clients
 * @param {Object} chatData - Chat information
 * @param {string} chatData.id - Chat ID
 * @param {string} chatData.firstname - First name
 * @param {string} chatData.lastname - Last name
 * @param {string} chatData.email - Email address
 * @param {string} chatData.phone - Phone number
 * @param {string} chatData.description - Chat message
 * @param {Date} chatData.createdAt - Creation timestamp
 */
function broadcastNewChat(chatData) {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot broadcast chat');
    return;
  }
  
  try {
    const payload = {
      type: 'new_chat',
      data: chatData,
      timestamp: new Date()
    };
    
    io.emit('new_chat', payload);
    
    logger.info('Broadcasted new chat', { 
      chatId: chatData.id,
      email: chatData.email,
      connectedClients: io.engine.clientsCount 
    });
  } catch (error) {
    logger.error('Error broadcasting new chat', { 
      error: error.message,
      chatId: chatData.id 
    });
  }
}

/**
 * Get Socket.IO server instance
 * @returns {Server|null} Socket.IO server instance or null if not initialized
 */
function getIO() {
  return io;
}

module.exports = {
  initializeWebSocket,
  broadcastNewLead,
  broadcastNewChat,
  getIO
};
