const mongoose = require('mongoose');

const TldPricingSchema = new mongoose.Schema(
  {
    tld: { type: String, required: true, index: true, unique: true },
    categories: { type: [String], default: [] },
    addons: {
      dns: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
      idprotect: { type: Boolean, default: false }
    },
    group: { type: String, default: '' },
    // PKR pricing (converted from USD)
    register: { type: Object, default: {} },
    transfer: { type: Object, default: {} },
    renew: { type: Object, default: {} },
    grace_period: { type: Object, default: {} },
    redemption_period: { type: Object, default: {} },
    exchange_rate: { type: Number, default: null }, // USD to PKR rate used for conversion
    exchange_rate_date: { type: Date, default: null }, // Date when rate was fetched
    raw: { type: Object, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('TldPricing', TldPricingSchema);


