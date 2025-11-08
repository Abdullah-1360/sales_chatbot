/**
 * Domain Availability Service using WHMCS API
 * Uses DomainWhois and GetDomainSuggestions actions
 */

const axios = require('axios');
const cfg = require('../config');
const { getPricingForTld } = require('./tldPricing');
const TldPricing = require('../models/TldPricing');

/**
 * Cache for TLD list used in extraction
 */
let tldListCache = null;
let tldListCacheTime = null;
const TLD_LIST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get list of all TLDs from database for TLD extraction
 */
async function getTldListForExtraction() {
  // Return cached list if still valid
  if (tldListCache && tldListCacheTime && (Date.now() - tldListCacheTime < TLD_LIST_CACHE_TTL)) {
    return tldListCache;
  }

  try {
    const docs = await TldPricing.find({}, { tld: 1, _id: 0 }).lean();
    const tlds = docs.map(doc => doc.tld.toLowerCase()).filter(Boolean);
    
    // Cache the results
    tldListCache = tlds;
    tldListCacheTime = Date.now();
    
    return tlds;
  } catch (error) {
    console.error('❌ Failed to load TLDs for extraction:', error.message);
    // Return cached data if available
    if (tldListCache) return tldListCache;
    // Fallback to empty array
    return [];
  }
}

/**
 * Extract TLD from domain name, handling multi-level TLDs like .com.pk
 * This function checks against actual TLDs in the database
 * @param {string} domain - Full domain name (e.g., "example.com.pk")
 * @returns {Promise<string>} - TLD with leading dot (e.g., ".com.pk")
 */
async function extractTld(domain) {
  const parts = domain.toLowerCase().split('.');
  
  if (parts.length < 2) {
    return null; // Invalid domain
  }

  // Get all TLDs from database
  const allTlds = await getTldListForExtraction();
  
  // Check for multi-level TLDs first (longest match)
  // Try 3-level TLD (e.g., .com.pk from example.com.pk)
  if (parts.length >= 3) {
    const lastThree = parts.slice(-3).join('.');
    if (allTlds.includes(lastThree)) {
      return `.${lastThree}`;
    }
  }
  
  // Try 2-level TLD (e.g., .co.uk from example.co.uk)
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (allTlds.includes(lastTwo)) {
      return `.${lastTwo}`;
    }
  }
  
  // Default: return last part as TLD (e.g., .com from example.com)
  const lastPart = parts[parts.length - 1];
  return `.${lastPart}`;
}

/**
 * Synchronous version of extractTld for cases where we can't use async
 * Falls back to heuristic-based detection
 */
function extractTldSync(domain) {
  const parts = domain.toLowerCase().split('.');
  
  if (parts.length < 2) {
    return null;
  }
  
  // Check for common two-level TLDs
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    const secondLevel = parts[parts.length - 2];
    
    // Common second-level domains that form multi-level TLDs
    const commonSecondLevels = [
      'com', 'net', 'org', 'edu', 'gov', 'co', 'ac', 'sch', 
      'gos', 'ae', 'pe', 'za', 'nz', 'uk', 'se', 'qc'
    ];
    
    if (commonSecondLevels.includes(secondLevel)) {
      return `.${lastTwo}`;
    }
  }
  
  // Default: return last part
  return `.${parts[parts.length - 1]}`;
}

/**
 * Call WHMCS API
 */
async function callWhmcsAPI(action, params = {}) {
  const formData = new URLSearchParams({
    action,
    responsetype: 'json',
    identifier: cfg.WHMCS_API_IDENTIFIER,
    secret: cfg.WHMCS_API_SECRET,
    ...params
  });

  try {
    const { data } = await axios.post(cfg.WHMCS_URL, formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    });

    if (data.result !== 'success') {
      throw new Error(data.message || `WHMCS API error for ${action}`);
    }

    return data;
  } catch (error) {
    console.error(`WHMCS API call failed (${action}):`, error.message);
    throw error;
  }
}

/**
 * Get TLDs from MongoDB with caching
 */
let cachedTlds = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTldsFromMongoDB() {
  // Return cached TLDs if still valid
  if (cachedTlds && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL)) {
    return cachedTlds;
  }

  try {
    const docs = await TldPricing.find({}, { tld: 1, _id: 0 }).lean();
    
    if (!docs || docs.length === 0) {
      console.warn('⚠️  No TLDs found in MongoDB. Have you run the pricing sync?');
      console.warn('⚠️  Run: npm run sync:tlds');
      // Return fallback list
      return ['.com', '.net', '.org', '.pk', '.co', '.io', '.biz', '.info', '.app', '.dev', '.tech', '.online'];
    }

    const tlds = docs.map(doc => {
      const tld = doc.tld;
      // Ensure TLD starts with dot for WHMCS API format
      return tld.startsWith('.') ? tld : `.${tld}`;
    }).filter(Boolean);
    
    // Cache the results
    cachedTlds = tlds;
    cacheTimestamp = Date.now();
    
    console.log(`✅ Loaded ${tlds.length} TLDs from MongoDB`);
    return tlds;
  } catch (error) {
    console.error('❌ Failed to load TLDs from MongoDB:', error.message);
    
    // If we have cached data, use it even if expired
    if (cachedTlds && cachedTlds.length > 0) {
      console.warn('⚠️  Using expired cached TLDs');
      return cachedTlds;
    }
    
    // Last resort: fallback to default TLDs
    console.warn('⚠️  Using fallback TLD list');
    return ['.com', '.net', '.org', '.pk', '.co', '.io', '.biz', '.info', '.app', '.dev', '.tech', '.online'];
  }
}

/**
 * Check domain availability using WHMCS DomainWhois action
 * Response format: { result: "success", status: "available" | "registered" | "invalid" }
 */
async function checkDomainAvailability(domain) {
  console.log(`🔍  WHMCS DomainWhois check for: ${domain}`);

  try {
    const data = await callWhmcsAPI('DomainWhois', { domain });

    // WHMCS returns status: "available" | "registered" | "invalid"
    const status = data.status || 'registered';
    const isAvailable = status.toLowerCase() === 'available';

    return {
      domain,
      available: isAvailable,
      source: 'whmcs',
      status: status,
      registrar: data.registrar || null,
      expirationDate: data.expirationDate || null,
      creationDate: data.creationDate || null
    };
  } catch (error) {
    console.error(`⚠️  DomainWhois failed for ${domain}:`, error.message);
    // On error, assume domain is taken for safety
    return {
      domain,
      available: false,
      source: 'whmcs_error',
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Get domain suggestions using WHMCS GetDomainSuggestions action
 * Prioritizes TLDs from the same country/category
 */
async function getDomainSuggestions(searchTerm, tlds, limit = 20) {
  try {
    // Get TLDs from MongoDB if not provided
    let effectiveTlds = tlds;
    if (!effectiveTlds) {
      // Extract TLD from search term to prioritize related TLDs
      const originalTld = await extractTld(searchTerm);
      const originalTldWithoutDot = originalTld ? originalTld.slice(1) : null;
      
      const tldList = await getTldsFromMongoDB();
      
      // Prioritize TLDs based on the original TLD
      const prioritizedTlds = prioritizeTlds(originalTldWithoutDot, tldList);
      
      // Use top 30 prioritized TLDs for suggestions
      effectiveTlds = prioritizedTlds.slice(0, 30).map(t => t.startsWith('.') ? t.slice(1) : t).join(',');
    }

    const data = await callWhmcsAPI('GetDomainSuggestions', {
      searchTerm,
      tlds: effectiveTlds,
      limit: limit.toString()
    });

    // WHMCS returns suggestions in suggestions array
    const suggestions = data.suggestions || [];
    
    return suggestions.map(s => {
      // Handle both string and object formats
      if (typeof s === 'string') {
        return s;
      }
      return s.domain || s.name || s;
    }).filter(Boolean);
  } catch (error) {
    console.error(`⚠️  GetDomainSuggestions failed for ${searchTerm}:`, error.message);
    // Fallback to basic suggestions if API fails
    return await generateFallbackSuggestions(searchTerm);
  }
}

/**
 * Prioritize TLDs based on the original TLD
 * @param {string} originalTld - Original TLD (e.g., "pk", "com.pk")
 * @param {Array<string>} allTlds - All available TLDs
 * @returns {Array<string>} - Prioritized TLD list
 */
function prioritizeTlds(originalTld, allTlds) {
  if (!originalTld) return allTlds;
  
  const prioritized = [];
  const regular = [];
  
  // Extract country code if it's a multi-level TLD (e.g., "pk" from "com.pk")
  const parts = originalTld.split('.');
  const countryCode = parts[parts.length - 1];
  
  allTlds.forEach(tld => {
    const tldWithoutDot = tld.startsWith('.') ? tld.slice(1) : tld;
    
    // Skip the original TLD
    if (tldWithoutDot === originalTld) return;
    
    // Prioritize TLDs from the same country
    if (tldWithoutDot.endsWith(`.${countryCode}`) || tldWithoutDot === countryCode) {
      prioritized.push(tld);
    } else {
      regular.push(tld);
    }
  });
  
  // Return prioritized TLDs first, then regular ones
  return [...prioritized, ...regular];
}

/**
 * Generate name variations (hyphenated, numbered, etc.)
 * @param {string} name - Domain name without TLD
 * @returns {Array<string>} - Array of name variations
 */
function generateNameVariations(name) {
  const variations = [];
  
  // Add hyphenated version if name has multiple words (camelCase or no hyphens)
  if (name.length > 3 && !name.includes('-')) {
    // Try to split camelCase: nayatel -> naya-tel
    const hyphenated = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    if (hyphenated !== name) {
      variations.push(hyphenated);
    }
    
    // Try common split points
    if (name.length >= 6) {
      const mid = Math.floor(name.length / 2);
      variations.push(`${name.slice(0, mid)}-${name.slice(mid)}`);
    }
  }
  
  // Add numbered variations
  for (let i = 1; i <= 5; i++) {
    variations.push(`${name}${i}`);
  }
  
  // Add "get", "my", "the" prefixes
  variations.push(`get${name}`);
  variations.push(`my${name}`);
  variations.push(`the${name}`);
  
  return variations;
}

/**
 * Fallback suggestion generator if WHMCS API fails
 * Prioritizes variations with the SAME TLD first
 * @param {String} searchTerm - Can be a domain name (e.g., "example") or full domain (e.g., "example.com.pk")
 */
async function generateFallbackSuggestions(searchTerm) {
  // Extract name and original TLD if it's a full domain
  const originalTld = await extractTld(searchTerm);
  const originalTldWithoutDot = originalTld ? originalTld.slice(1) : null;
  
  // Get the domain name without TLD
  let name = searchTerm;
  if (originalTld) {
    name = searchTerm.slice(0, -(originalTld.length));
  }
  
  const suggestions = [];
  
  // PRIORITY 1: Variations with the SAME TLD (if original TLD exists)
  if (originalTld) {
    const nameVariations = generateNameVariations(name);
    nameVariations.forEach(variation => {
      suggestions.push(`${variation}${originalTld}`);
    });
  }
  
  // PRIORITY 2: Same name with related TLDs (same country)
  const allTlds = await getTldsFromMongoDB();
  const prioritizedTlds = prioritizeTlds(originalTldWithoutDot, allTlds);
  
  // Add top 10 related TLDs with the same name
  prioritizedTlds.slice(0, 10).forEach(tld => {
    suggestions.push(`${name}${tld}`);
  });

  return suggestions.slice(0, 20);
}

/**
 * Check multiple domains in parallel using WHMCS API
 */
async function checkMultipleDomains(domains, concurrency = 5) {
  console.log(`🔍  Parallel check of ${domains.length} domains (concurrency=${concurrency})`);

  const results = new Array(domains.length);
  const queue = domains.map((d, i) => ({ d, i }));

  const runWindow = async () => {
    const chunk = queue.splice(0, concurrency);
    if (!chunk.length) return;
    
    await Promise.all(
      chunk.map(async ({ d, i }) => {
        results[i] = await checkDomainAvailability(d);
      })
    );
  };

  while (queue.length) {
    await runWindow();
    // Small delay to avoid rate limiting
    if (queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/* ------------------------------------------------------------- */
/* 6.  Main public wrapper with phone number support              */
/* ------------------------------------------------------------- */
async function getDomainAvailability(domain, phoneNumber = null) {
  try {
    // Determine currency based on phone number
    const { getCurrencyFromPhoneNumber } = require('./tldPricing');
    const currency = getCurrencyFromPhoneNumber(phoneNumber);
    
    console.log(`\n🔍  Real-time check for: ${domain} (Currency: ${currency})\n`);
    const primary = await checkDomainAvailability(domain);

    if (primary.available) {
      // fetch price for the base domain's TLD in parallel
      const tld = await extractTld(domain);
      const [pricingDoc] = await Promise.all([
        getPricingForTld(tld, currency)
      ]);
      console.log(`✅  ${domain} is available!`);
      return {
        success: true,
        domain,
        available: true,
        message: 'Domain is available for registration!',
        suggestions: [],
        source: primary.source,
        pricing: pricingDoc ? {
          tld: pricingDoc.tld,
          register: pricingDoc.register,
          renew: pricingDoc.renew,
          transfer: pricingDoc.transfer,
          grace_period: pricingDoc.grace_period,
          redemption_period: pricingDoc.redemption_period,
          currency: pricingDoc.currency_code || 'PKR'
        } : null
      };
    }

    console.log(`❌  ${domain} is taken. Getting suggestions…`);
    
    // Generate smart suggestions with same TLD priority
    // First, try name variations with the same TLD
    const originalTld = await extractTld(domain);
    const name = originalTld ? domain.slice(0, -(originalTld.length)) : domain;
    
    const sameTldSuggestions = [];
    if (originalTld) {
      const nameVariations = generateNameVariations(name);
      nameVariations.forEach(variation => {
        sameTldSuggestions.push(`${variation}${originalTld}`);
      });
    }
    
    // Then get suggestions from WHMCS for other TLDs
    const whmcsSuggestions = await getDomainSuggestions(name, undefined, 15);
    
    // Combine: same TLD variations first, then WHMCS suggestions
    const allSuggestions = [...sameTldSuggestions, ...whmcsSuggestions];
    const suggestions = [...new Set(allSuggestions)]; // Remove duplicates
    
    // Check first 10 suggestions in parallel
    const checked = await checkMultipleDomains(suggestions.slice(0, 10), 10);
    const available = checked.filter(r => r.available).map(r => r.domain);

    // parallel TLD pricing lookup for available suggestions with currency
    const uniqueTlds = [...new Set(await Promise.all(available.map(d => extractTld(d))))];
    const pricingDocs = await Promise.all(uniqueTlds.map(t => getPricingForTld(t, currency)));
    const tldToPricing = new Map();
    uniqueTlds.forEach((tld, i) => { if (pricingDocs[i]) tldToPricing.set(pricingDocs[i].tld, pricingDocs[i]); });

    const pricedSuggestions = await Promise.all(available.map(async d => {
      const tldWithDot = await extractTld(d);
      const t = tldWithDot ? tldWithDot.slice(1) : null; // Remove leading dot for lookup
      const p = tldToPricing.get(t);
      return {
        domain: d,
        tld: t,
        pricing: p ? {
          register: p.register,
          renew: p.renew,
          transfer: p.transfer,
          grace_period: p.grace_period,
          redemption_period: p.redemption_period,
          currency: p.currency_code || 'PKR'
        } : null
      };
    }));

    console.log(`📊  Found ${available.length} available alternatives out of ${checked.length} checked`);

    return {
      success: true,
      domain,
      available: false,
      message: 'Domain is not available',
      suggestions: available,
      suggestionsCount: available.length,
      pricedSuggestions,
      checkedSuggestions: checked.length,
      registrar: primary.registrar,
      expirationDate: primary.expirationDate,
      creationDate: primary.creationDate
    };
  } catch (error) {
    console.error('❌  Domain check failed:', error);
    return { success: false, domain, error: error.message, message: 'Unable to check domain availability' };
  }
}

/**
 * Clear the TLD cache to force reload from MongoDB
 */
function clearTldCache() {
  cachedTlds = null;
  cacheTimestamp = null;
  console.log('🔄 TLD cache cleared');
}

/* ------------------------------------------------------------- */
/* 7.  Exports                                                    */
/* ------------------------------------------------------------- */
module.exports = {
  getDomainAvailability,
  checkDomainAvailability,
  getDomainSuggestions,
  checkMultipleDomains,
  getTldsFromMongoDB,
  clearTldCache
};