/**
 * Lead Model for MongoDB
 */

const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  vtigerId: { type: String, required: true, unique: true },
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, default: '' },
  description: { type: String, default: '' },
  source: { type: String, default: 'Chatbot' },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'leads'
});

// Index for efficient sorting by creation date
leadSchema.index({ createdAt: -1 });

// Index for email lookups
leadSchema.index({ email: 1 });

module.exports = mongoose.model('Lead', leadSchema);
