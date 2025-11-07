const axios = require('axios');
const cfg = require('../config');
const TldPricing = require('../models/TldPricing');

/**
 * Fetch USD to PKR exchange rate from exchangerate.host
 */
async function fetchUsdToPkrRate() {
  try {
    const response = await axios.get('https://api.exchangerate.host/latest', {
      params: {
        base: 'USD',
        symbols: 'PKR'
      },
      timeout: 10000
    });

    if (response.data && response.data.success && response.data.rates && response.data.rates.PKR) {
      return {
        rate: parseFloat(response.data.rates.PKR),
        date: response.data.date ? new Date(response.data.date) : new Date()
      };
    }
    throw new Error('Invalid exchange rate response');
  } catch (error) {
    console.error('Failed to fetch exchange rate:', error.message);
    // Fallback to a default rate if API fails (you may want to adjust this)
    console.warn('Using fallback exchange rate: 278.50');
    return {
      rate: 278.50,
      date: new Date()
    };
  }
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
      // Round to 2 decimal places
      pkrPricing[key] = (usdAmount * exchangeRate).toFixed(2);
    } else {
      pkrPricing[key] = value; // Keep non-numeric values as-is
    }
  }
  return pkrPricing;
}

async function fetchTldPricingFromWHMCS() {
  const params = {
    action: 'GetTldPricing',
    responsetype: 'json',
    identifier: cfg.WHMCS_API_IDENTIFIER,
    secret: cfg.WHMCS_API_SECRET
  };

  const { data } = await axios.get(cfg.WHMCS_URL, { params });
  if (data.result !== 'success') {
    throw new Error(data.message || 'Failed to fetch TLD pricing');
  }
  return data; // matches domain_response.json shape
}

async function upsertAllTldPricing() {
  console.log('📡 Fetching TLD pricing from WHMCS...');
  const data = await fetchTldPricingFromWHMCS();

  console.log('💱 Fetching USD to PKR exchange rate...');
  const { rate: exchangeRate, date: exchangeDate } = await fetchUsdToPkrRate();
  console.log(`✅ Exchange rate: 1 USD = ${exchangeRate} PKR (as of ${exchangeDate.toISOString().split('T')[0]})`);

  const pricing = data.pricing || {};

  const ops = Object.entries(pricing).map(([tld, info]) => {
    // Convert USD prices to PKR
    const register = convertUsdToPkr(info.register, exchangeRate);
    const transfer = convertUsdToPkr(info.transfer, exchangeRate);
    const renew = convertUsdToPkr(info.renew, exchangeRate);
    
    // Convert grace_period and redemption_period if they have price fields
    let gracePeriod = {};
    if (info.grace_period && typeof info.grace_period === 'object') {
      gracePeriod = { ...info.grace_period };
      if (info.grace_period.price) {
        const priceMatch = info.grace_period.price.match(/\$?([\d.]+)/);
        if (priceMatch) {
          const usdAmount = parseFloat(priceMatch[1]);
          gracePeriod.price = `Rs ${(usdAmount * exchangeRate).toFixed(2)} PKR`;
        }
      }
    }

    let redemptionPeriod = {};
    if (info.redemption_period && typeof info.redemption_period === 'object') {
      redemptionPeriod = { ...info.redemption_period };
      if (info.redemption_period.price) {
        const priceMatch = info.redemption_period.price.match(/\$?([\d.]+)/);
        if (priceMatch) {
          const usdAmount = parseFloat(priceMatch[1]);
          redemptionPeriod.price = `Rs ${(usdAmount * exchangeRate).toFixed(2)} PKR`;
        }
      }
    }

    return {
      updateOne: {
        filter: { tld },
        update: {
          $set: {
            tld,
            categories: info.categories || [],
            addons: info.addons || {},
            group: info.group || '',
            // PKR pricing (converted from USD)
            register,
            transfer,
            renew,
            grace_period: gracePeriod,
            redemption_period: redemptionPeriod,
            // Exchange rate info
            exchange_rate: exchangeRate,
            exchange_rate_date: exchangeDate,
            raw: info
          }
        },
        upsert: true
      }
    };
  });

  if (ops.length === 0) return { matched: 0, upserted: 0, exchangeRate };

  console.log(`💾 Upserting ${ops.length} TLD pricing records with PKR conversion...`);
  const result = await TldPricing.bulkWrite(ops, { ordered: false });
  
  return {
    matched: result.matchedCount || 0,
    upserted: result.upsertedCount || 0,
    modified: result.modifiedCount || 0,
    exchangeRate,
    exchangeDate
  };
}

async function getPricingForTld(tld) {
  // tld may be like ".com" or "com". Normalize to no leading dot key in WHMCS JSON
  const key = tld.startsWith('.') ? tld.slice(1) : tld;
  const doc = await TldPricing.findOne({ tld: key }).lean();
  return doc || null;
}

module.exports = {
  fetchTldPricingFromWHMCS,
  upsertAllTldPricing,
  getPricingForTld
};


