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
    // USD pricing (currencyid=1)
    pricing_usd: {
      register: { type: Object, default: {} },
      transfer: { type: Object, default: {} },
      renew: { type: Object, default: {} },
      grace_period: { type: Object, default: {} },
      redemption_period: { type: Object, default: {} },
      currency_code: { type: String, default: 'USD' },
      currency_prefix: { type: String, default: '$' },
      currency_suffix: { type: String, default: ' USD' }
    },
    // PKR pricing (currencyid=2)
    pricing_pkr: {
      register: { type: Object, default: {} },
      transfer: { type: Object, default: {} },
      renew: { type: Object, default: {} },
      grace_period: { type: Object, default: {} },
      redemption_period: { type: Object, default: {} },
      currency_code: { type: String, default: 'PKR' },
      currency_prefix: { type: String, default: 'Rs ' },
      currency_suffix: { type: String, default: ' PKR' }
    },
    // Sync tracking
    last_sync_date: { type: Date, default: Date.now },
    sync_status: { 
      type: String, 
      enum: ['fresh', 'stale', 'failed'], 
      default: 'fresh' 
    },
    sync_attempts: { type: Number, default: 0 },
    last_error: { type: String, default: null },
    raw_usd: { type: Object, default: {} },
    raw_pkr: { type: Object, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('TldPricing', TldPricingSchema);


