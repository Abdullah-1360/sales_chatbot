// Load .env file only if it exists (optional for production)
try {
  require('dotenv').config();
} catch (err) {
  // .env file not found or dotenv not installed - use environment variables directly
  console.log('ℹ️  Using environment variables (no .env file)');
}

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
  
  // WHMCS Product Group IDs (GIDs)
  WHMCS_GIDS: {
    CPANEL_HOSTING: 1,        // cPanel Hosting
    CPANEL_RESELLER: 2,       // cPanel Reseller Hosting (8 products)
    SSL_CERTIFICATES: 6,      // SSL Certificates
    WORDPRESS_HOSTING: 20,    // WordPress Hosting (4 products)
    WOOCOMMERCE_HOSTING: 21,  // WooCommerce Hosting (3 products)
    BUSINESS_HOSTING: 25,     // Business Hosting (12 products)
    WINDOWS_RESELLER: 26,     // Windows Reseller (4 products)
    WINDOWS_HOSTING: 28       // Windows Hosting (4 products)
  },
  
  // GID Names for display
  GID_NAMES: {
    1: 'cPanel Hosting',
    2: 'cPanel Reseller Hosting',
    6: 'SSL Certificates',
    20: 'WordPress Hosting',
    21: 'WooCommerce Hosting',
    25: 'Business Hosting',
    26: 'Windows Reseller',
    28: 'Windows Hosting'
  },
  
  // GID Keywords - Alternative names and search terms
  GID_KEYWORDS: {
    1: ['cpanel', 'linux', 'web hosting', 'shared hosting'],
    2: ['cpanel reseller', 'reseller hosting'],
    6: ['ssl', 'certificate', 'https', 'security'],
    20: ['wordpress', 'wp'],
    21: ['woocommerce', 'ecommerce', 'shop', 'store', 'online store'],
    25: ['business', 'professional', 'corporate'],
    26: ['windows reseller'],
    28: ['windows', 'asp', '.net', 'mssql', 'asp.net', 'dotnet', 'asp hosting', '.net hosting', 'mssql hosting']
  }
};