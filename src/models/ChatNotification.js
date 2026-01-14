/**
 * Chat Notification Model for MongoDB
 * Tracks notification state for each chat
 */

const mongoose = require('mongoose');

const chatNotificationSchema = new mongoose.Schema({
  chatId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Chat', 
    required: true,
    unique: true 
  },
  userNs: { 
    type: String, 
    required: true
  },
  notificationCount: { 
    type: Number, 
    default: 0 
  },
  maxNotifications: { 
    type: Number, 
    default: 5 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  lastNotificationAt: { 
    type: Date, 
    default: Date.now 
  },
  startedAt: { 
    type: Date, 
    default: Date.now 
  },
  stoppedAt: { 
    type: Date, 
    default: null 
  },
  stopReason: { 
    type: String, 
    enum: ['viewed', 'dismissed', 'max_reached', 'manual', 'auto_ticket_created', 'reset', 'chat_not_found', 'system_shutdown'],
    default: null 
  },
  intervalId: { 
    type: String, 
    default: null 
  },
  agentJoinedMessageSent: {
    type: Boolean,
    default: false
  },
  agentJoinedMessageSentAt: {
    type: Date,
    default: null
  },
  autoTicketScheduled: {
    type: Boolean,
    default: false
  },
  autoTicketCreated: {
    type: Boolean,
    default: false
  },
  autoTicketCreatedAt: {
    type: Date,
    default: null
  },
  autoTicketId: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'chat_notifications'
});

// Create indexes separately to avoid duplicates
chatNotificationSchema.index({ chatId: 1 });
chatNotificationSchema.index({ userNs: 1 });
chatNotificationSchema.index({ isActive: 1 });
chatNotificationSchema.index({ lastNotificationAt: 1 });

// Compound indexes for common queries
chatNotificationSchema.index({ isActive: 1, lastNotificationAt: 1 });
chatNotificationSchema.index({ userNs: 1, isActive: 1 });

module.exports = mongoose.model('ChatNotification', chatNotificationSchema);