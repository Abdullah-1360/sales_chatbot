const axios = require('axios');
const cfg = require('../config');
const TldPricing = require('../models/TldPricing');

// Retry configuration for WHMCS API calls
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2
};

// Staleness thresholds
const STALENESS_THRESHOLD_HOURS = 48;

/**
 * Fetch USD to PKR exchange rate from multiple sources with fallback
 */
async function fetchUsdToPkrRate() {
  // Check if a fixed exchange rate is configured
  if (cfg.FIXED_EXCHANGE_RATE && cfg.FIXED_EXCHANGE_RATE > 0) {
    console.log(`💱 Using fixed exchange rate: ${cfg.FIXED_EXCHANGE_RATE} PKR`);
    return {
      rate: cfg.FIXED_EXCHANGE_RATE,
      date: new Date(),
      fixed: true
    };
  }

  // Try multiple exchange rate APIs in order
  const apis = [
    {
      name: 'exchangerate-api.com',
      url: 'https://api.exchangerate-api.com/v4/latest/USD',
      parser: (data) => ({
        rate: parseFloat(data.rates.PKR),
        date: data.date ? new Date(data.date) : new Date()
      })
    },
    {
      name: 'exchangerate.host',
      url: 'https://api.exchangerate.host/latest?base=USD&symbols=PKR',
      parser: (data) => ({
        rate: parseFloat(data.rates.PKR),
        date: data.date ? new Date(data.date) : new Date()
      })
    },
    {
      name: 'fawazahmed0 (CDN)',
      url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
      parser: (data) => ({
        rate: parseFloat(data.usd.pkr),
        date: data.date ? new Date(data.date) : new Date()
      })
    }
  ];

  for (const api of apis) {
    try {
      console.log(`💱 Trying ${api.name}...`);
      const response = await axios.get(api.url, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      });

      if (response.data) {
        const result = api.parser(response.data);
        
        if (result.rate && !isNaN(result.rate) && result.rate > 0) {
          console.log(`✅ Successfully fetched exchange rate from ${api.name}`);
          return result;
        }
      }
    } catch (error) {
      console.warn(`⚠️  ${api.name} failed: ${error.message}`);
      // Continue to next API
    }
  }

  // All APIs failed, use fallback rate
  console.error('❌ All exchange rate APIs failed');
  console.warn('⚠️  Using fallback exchange rate: 278.50 PKR');
  return {
    rate: 278.50,
    date: new Date(),
    fallback: true
  };
}

/**
 * Convert USD price object to PKR
 * @param {Object} usdPricing - Object like { "1": "12.50", "2": "23.50" }
 * @param {Number} exchangeRate - USD to PKR rate
 * @returns {Object} - PKR pricing object
 */
function convertUsdToPkr(usdPricing, exchangeRate) {
  if (!usdPricing || typeof usdPricing !== 'object') {
    return {};
  }

  const pkrPricing = {};
  for (const [key, value] of Object.entries(usdPricing)) {
    const usdAmount = parseFloat(value);
    if (!isNaN(usdAmount)) {
      // Keep 2 decimal places for accurate pricing
      pkrPricing[key] = (usdAmount * exchangeRate).toFixed(2);
    } else {
      pkrPricing[key] = value; // Keep non-numeric values as-is
    }
  }
  return pkrPricing;
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff(fn, retries = RETRY_CONFIG.maxRetries) {
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < retries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffFactor, attempt),
          RETRY_CONFIG.maxDelay
        );
        console.warn(`⚠️  Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Fetch TLD pricing from WHMCS for a specific currency
 * @param {number} currencyId - Currency ID (1 = USD, 2 = PKR)
 */
async function fetchTldPricingFromWHMCS(currencyId = 1) {
  const params = {
    action: 'GetTLDPricing',
    responsetype: 'json',
    identifier: cfg.WHMCS_API_IDENTIFIER,
    secret: cfg.WHMCS_API_SECRET,
    currencyid: currencyId
  };

  return await retryWithBackoff(async () => {
    const { data } = await axios.get(cfg.WHMCS_URL, { 
      params,
      timeout: 15000 
    });
    
    if (data.result !== 'success') {
      throw new Error(data.message || 'Failed to fetch TLD pricing');
    }
    
    return data;
  });
}

async function upsertAllTldPricing() {
  const startTime = Date.now();
  
  try {
    console.log('📡 Fetching TLD pricing from WHMCS in USD (currencyid=1)...');
    const usdData = await fetchTldPricingFromWHMCS(1);
    
    console.log('📡 Fetching TLD pricing from WHMCS in PKR (currencyid=2)...');
    const pkrData = await fetchTldPricingFromWHMCS(2);

    const usdPricing = usdData.pricing || {};
    const pkrPricing = pkrData.pricing || {};
    const usdCurrency = usdData.currency || {};
    const pkrCurrency = pkrData.currency || {};
    const now = new Date();

    console.log(`✅ Fetched pricing in USD and PKR currencies`);

    // Merge USD and PKR pricing data
    const ops = Object.keys({ ...usdPricing, ...pkrPricing }).map(tld => {
      const usdInfo = usdPricing[tld] || {};
      const pkrInfo = pkrPricing[tld] || {};

      return {
        updateOne: {
          filter: { tld },
          update: {
            $set: {
              tld,
              categories: usdInfo.categories || pkrInfo.categories || [],
              addons: usdInfo.addons || pkrInfo.addons || {},
              group: usdInfo.group || pkrInfo.group || '',
              // USD pricing
              pricing_usd: {
                register: usdInfo.register || {},
                transfer: usdInfo.transfer || {},
                renew: usdInfo.renew || {},
                grace_period: usdInfo.grace_period || {},
                redemption_period: usdInfo.redemption_period || {},
                currency_code: usdCurrency.code || 'USD',
                currency_prefix: usdCurrency.prefix || '$',
                currency_suffix: usdCurrency.suffix || ' USD'
              },
              // PKR pricing
              pricing_pkr: {
                register: pkrInfo.register || {},
                transfer: pkrInfo.transfer || {},
                renew: pkrInfo.renew || {},
                grace_period: pkrInfo.grace_period || {},
                redemption_period: pkrInfo.redemption_period || {},
                currency_code: pkrCurrency.code || 'PKR',
                currency_prefix: pkrCurrency.prefix || 'Rs ',
                currency_suffix: pkrCurrency.suffix || ' PKR'
              },
              // Sync tracking
              last_sync_date: now,
              sync_status: 'fresh',
              sync_attempts: 0,
              last_error: null,
              raw_usd: usdInfo,
              raw_pkr: pkrInfo
            }
          },
          upsert: true
        }
      };
    });

    if (ops.length === 0) {
      return { 
        success: true,
        matched: 0, 
        upserted: 0,
        duration: Date.now() - startTime
      };
    }

    console.log(`💾 Upserting ${ops.length} TLD pricing records in PKR...`);
    const result = await TldPricing.bulkWrite(ops, { ordered: false });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Pricing sync completed in ${duration}ms`);
    
    return {
      success: true,
      matched: result.matchedCount || 0,
      upserted: result.upsertedCount || 0,
      modified: result.modifiedCount || 0,
      duration
    };
  } catch (error) {
    console.error('❌ Failed to sync TLD pricing:', error.message);
    
    // Mark failed TLDs in database
    try {
      await TldPricing.updateMany(
        { sync_status: { $ne: 'fresh' } },
        { 
          $set: { sync_status: 'failed', last_error: error.message },
          $inc: { sync_attempts: 1 }
        }
      );
    } catch (dbError) {
      console.error('❌ Failed to update sync status:', dbError.message);
    }
    
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Determine currency based on phone number
 * @param {string} phoneNumber - Phone number with country code
 * @returns {string} - 'PKR' or 'USD'
 */
function getCurrencyFromPhoneNumber(phoneNumber) {
  if (!phoneNumber) return 'USD'; // Default to USD if no phone number
  
  // Remove spaces, dashes, and other formatting
  const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // Check if phone number starts with +92 (Pakistan)
  if (cleanPhone.startsWith('+92') || cleanPhone.startsWith('92')) {
    return 'PKR';
  }
  
  return 'USD';
}

/**
 * Get pricing for a TLD with currency selection
 * @param {string} tld - TLD (e.g., ".com" or "com")
 * @param {string} currency - Currency code ('USD' or 'PKR')
 * @returns {Promise<Object>} - Pricing data in the specified currency
 */
async function getPricingForTld(tld, currency = 'USD') {
  // tld may be like ".com" or "com". Normalize to no leading dot key in WHMCS JSON
  const key = tld.startsWith('.') ? tld.slice(1) : tld;
  const doc = await TldPricing.findOne({ tld: key }).lean();
  
  if (!doc) return null;
  
  // Select the appropriate pricing based on currency
  const pricingData = currency === 'PKR' ? doc.pricing_pkr : doc.pricing_usd;
  
  return {
    tld: doc.tld,
    categories: doc.categories,
    addons: doc.addons,
    group: doc.group,
    register: pricingData.register,
    transfer: pricingData.transfer,
    renew: pricingData.renew,
    grace_period: pricingData.grace_period,
    redemption_period: pricingData.redemption_period,
    currency_code: pricingData.currency_code,
    currency_prefix: pricingData.currency_prefix,
    currency_suffix: pricingData.currency_suffix
  };
}

/**
 * Get pricing for multiple TLDs in parallel
 * @param {Array<string>} tlds - Array of TLD strings (e.g., ['.com', '.net', '.org'])
 * @param {string} currency - Currency code ('USD' or 'PKR')
 * @returns {Promise<Map<string, Object>>} - Map of TLD to pricing data
 */
async function getPricingForTlds(tlds, currency = 'USD') {
  if (!Array.isArray(tlds) || tlds.length === 0) {
    return new Map();
  }

  // Normalize TLDs (remove leading dots)
  const normalizedTlds = tlds.map(tld => 
    tld.startsWith('.') ? tld.slice(1) : tld
  );

  try {
    // Fetch all pricing data in a single query
    const docs = await TldPricing.find({ 
      tld: { $in: normalizedTlds } 
    }).lean();

    // Create a map for quick lookup with currency-specific pricing
    const pricingMap = new Map();
    docs.forEach(doc => {
      const pricingData = currency === 'PKR' ? doc.pricing_pkr : doc.pricing_usd;
      
      pricingMap.set(doc.tld, {
        tld: doc.tld,
        categories: doc.categories,
        addons: doc.addons,
        group: doc.group,
        register: pricingData.register,
        transfer: pricingData.transfer,
        renew: pricingData.renew,
        grace_period: pricingData.grace_period,
        redemption_period: pricingData.redemption_period,
        currency_code: pricingData.currency_code,
        currency_prefix: pricingData.currency_prefix,
        currency_suffix: pricingData.currency_suffix
      });
    });

    return pricingMap;
  } catch (error) {
    console.error('❌ Failed to fetch pricing for TLDs:', error.message);
    return new Map();
  }
}

/**
 * Check if pricing data is stale
 * @param {Date} lastSyncDate - Last sync date
 * @returns {boolean} - True if stale
 */
function isPricingStale(lastSyncDate) {
  if (!lastSyncDate) return true;
  
  const now = new Date();
  const hoursSinceSync = (now - new Date(lastSyncDate)) / (1000 * 60 * 60);
  
  return hoursSinceSync > STALENESS_THRESHOLD_HOURS;
}

/**
 * Detect and mark stale pricing data
 * @returns {Promise<Object>} - Count of stale records
 */
async function detectStalePricing() {
  try {
    const staleThreshold = new Date(Date.now() - STALENESS_THRESHOLD_HOURS * 60 * 60 * 1000);
    
    const result = await TldPricing.updateMany(
      { 
        last_sync_date: { $lt: staleThreshold },
        sync_status: 'fresh'
      },
      { 
        $set: { sync_status: 'stale' } 
      }
    );

    if (result.modifiedCount > 0) {
      console.warn(`⚠️  Marked ${result.modifiedCount} TLD pricing records as stale`);
    }

    return {
      staleCount: result.modifiedCount || 0
    };
  } catch (error) {
    console.error('❌ Failed to detect stale pricing:', error.message);
    return { staleCount: 0, error: error.message };
  }
}

/**
 * Get pricing health status
 * @returns {Promise<Object>} - Health status information
 */
async function getPricingHealth() {
  try {
    const [totalCount, freshCount, staleCount, failedCount, lastSync] = await Promise.all([
      TldPricing.countDocuments(),
      TldPricing.countDocuments({ sync_status: 'fresh' }),
      TldPricing.countDocuments({ sync_status: 'stale' }),
      TldPricing.countDocuments({ sync_status: 'failed' }),
      TldPricing.findOne().sort({ last_sync_date: -1 }).select('last_sync_date exchange_rate exchange_rate_date').lean()
    ]);

    const exchangeRateAge = lastSync?.exchange_rate_date 
      ? Math.floor((Date.now() - new Date(lastSync.exchange_rate_date)) / (1000 * 60 * 60))
      : null;

    return {
      status: staleCount === 0 && failedCount === 0 ? 'healthy' : 'degraded',
      total_tlds: totalCount,
      fresh_tlds: freshCount,
      stale_tlds: staleCount,
      failed_tlds: failedCount,
      last_sync: lastSync?.last_sync_date || null,
      exchange_rate: lastSync?.exchange_rate || null,
      exchange_rate_age_hours: exchangeRateAge
    };
  } catch (error) {
    console.error('❌ Failed to get pricing health:', error.message);
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Validate pricing data freshness and trigger refresh if needed
 * @returns {Promise<Object>} - Validation result
 */
async function validatePricingFreshness() {
  try {
    const health = await getPricingHealth();
    
    if (health.stale_tlds > 0) {
      console.warn(`⚠️  Found ${health.stale_tlds} stale TLD pricing records`);
      
      // Trigger refresh if configured
      if (cfg.AUTO_REFRESH_STALE_PRICING) {
        console.log('🔄 Auto-refreshing stale pricing data...');
        const result = await upsertAllTldPricing();
        return {
          validated: true,
          refreshed: true,
          result
        };
      }
    }

    return {
      validated: true,
      refreshed: false,
      health
    };
  } catch (error) {
    console.error('❌ Failed to validate pricing freshness:', error.message);
    return {
      validated: false,
      error: error.message
    };
  }
}

module.exports = {
  fetchTldPricingFromWHMCS,
  upsertAllTldPricing,
  getPricingForTld,
  getPricingForTlds,
  getCurrencyFromPhoneNumber,
  detectStalePricing,
  getPricingHealth,
  validatePricingFreshness,
  isPricingStale
};


