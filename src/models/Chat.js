/**
 * Chat Model for MongoDB
 * Enhanced to support multiple messages per user session
 */

const mongoose = require('mongoose');

// Message schema for individual messages within a chat
const messageSchema = new mongoose.Schema({
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  source: { type: String, default: 'user' } // 'user' or 'system'
}, { _id: true });

const chatSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, default: '' },
  description: { type: String, default: '' }, // First message for backward compatibility
  comment: { type: String, default: '' }, // Comment field for backward compatibility
  messages: [messageSchema], // Array of messages
  source: { type: String, default: 'Chatbot' },
  userNs: { type: String, default: '' }, // UChat User Namespace ID
  lastMessageAt: { type: Date, default: Date.now }, // Track last message time
  messageCount: { type: Number, default: 1 }, // Track total message count
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'chats'
});

// Index for efficient sorting by last message time
chatSchema.index({ lastMessageAt: -1 });

// Index for userNs lookups (for finding existing chats)
chatSchema.index({ userNs: 1 });

// Index for email lookups
chatSchema.index({ email: 1 });

// Compound index for userNs and lastMessageAt for efficient queries
chatSchema.index({ userNs: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);
