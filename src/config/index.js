require('dotenv').config();

module.exports = {
  WHMCS_URL: process.env.WHMCS_URL || '',
  WHMCS_API_IDENTIFIER: process.env.WHMCS_API_IDENTIFIER || '',
  WHMCS_API_SECRET: process.env.WHMCS_API_SECRET || '',
  WHMCS_CACHE_TTL: Number(process.env.WHMCS_CACHE_TTL) || 300,
  USE_FIXTURE: process.env.USE_FIXTURE === 'true',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/sales_chatbot',
  USE_MONGODB: process.env.USE_MONGODB !== 'false', // Default to true
  AUTO_SYNC_ON_STARTUP: process.env.AUTO_SYNC_ON_STARTUP !== 'false', // Default to true
  SYNC_INTERVAL_HOURS: Number(process.env.SYNC_INTERVAL_HOURS) || 24,
  USE_MOCK_DOMAIN_CHECK: process.env.USE_MOCK_DOMAIN_CHECK !== 'false', // Default to true
  // Exchange rate configuration
  FIXED_EXCHANGE_RATE: process.env.FIXED_EXCHANGE_RATE ? Number(process.env.FIXED_EXCHANGE_RATE) : null, // Override exchange rate if set
  AUTO_REFRESH_STALE_PRICING: process.env.AUTO_REFRESH_STALE_PRICING === 'true', // Auto-refresh stale pricing
};