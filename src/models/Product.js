/**
 * Product Model for MongoDB
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  pid: { type: String, required: true, unique: true },
  gid: { type: String, required: true },
  type: { type: String },
  name: { type: String, required: true },
  description: { type: String, required: true },
  module: { type: String },
  paytype: { type: String },
  diskspace: { type: String, required: true },
  freedomain: { type: Boolean, required: true },
  pricing: { type: mongoose.Schema.Types.Mixed, required: true },
  customfields: { type: mongoose.Schema.Types.Mixed },
  configoptions: { type: mongoose.Schema.Types.Mixed },
  link: { type: String, required: true }
}, {
  timestamps: true,
  collection: 'products',
  strict: false // Allow additional fields from WHMCS
});

// Index for efficient GID queries
productSchema.index({ gid: 1 });

module.exports = mongoose.model('Product', productSchema);
