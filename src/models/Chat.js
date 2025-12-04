/**
 * Chat Model for MongoDB
 */

const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, default: '' },
  description: { type: String, default: '' },
  comment: { type: String, default: '' }, // Comment field
  source: { type: String, default: 'Chatbot' },
  userNs: { type: String, default: '' }, // UChat User Namespace ID
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'chats'
});

// Index for efficient sorting by creation date
chatSchema.index({ createdAt: -1 });

// Index for email lookups
chatSchema.index({ email: 1 });

module.exports = mongoose.model('Chat', chatSchema);
