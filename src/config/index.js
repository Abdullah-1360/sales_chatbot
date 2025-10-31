require('dotenv').config();

module.exports = {
  WHMCS_URL: process.env.WHMCS_URL || '',
  WHMCS_API_USER: process.env.WHMCS_API_USER || '',
  WHMCS_API_PASS: process.env.WHMCS_API_PASS || '',
  WHMCS_CACHE_TTL: Number(process.env.WHMCS_CACHE_TTL) || 300,
  USE_FIXTURE: process.env.USE_FIXTURE === 'true',
};