// src/services/planMatcher.js
const { PURPOSE, STORAGE_TIER } = require('../config/constants');

/**
 * Keyword mappings for intelligent routing
 */
const KEYWORD_MAPPINGS = {
  ecommerce: ['shop', 'store', 'commerce', 'ecommerce', 'e-commerce', 'woocommerce', 'shopping', 'cart', 'payment', 'checkout', 'product'],
  wordpress: ['personal', 'catalogue', 'catalog', 'normal', 'blog', 'content', 'article', 'post', 'news', 'magazine'],
  business: ['business', 'corporate', 'application', 'app', 'saas', 'software', 'enterprise', 'professional', 'company'],
  ssl: ['certificate', 'cert', 'secure', 'ssl', 'https', 'security', 'encryption', 'tls'],
  windows: ['asp.net', 'asp', '.net', 'dotnet', '.net core', 'aspnet', 'c#', 'csharp', 'mssql', 'ms sql', 'iis', 'windows']
};

/**
 * Enhanced plan matcher with robust routing logic
 * Routes based on: purpose, websites_count, storage_needed_gb, needs_ssl, needs_reseller
 * Includes intelligent keyword detection for natural language input
 * 
 * @param {Object} answers - User requirements
 * @returns {Object} { gid, minTier, reasoning } - Matched group ID, minimum tier, and reasoning
 */
module.exports = function planMatcher(answers) {
  let { purpose, websites_count, needs_reseller, needs_ssl, needs_windows, storage_needed_gb } = answers;

  // 1. Normalize and analyze inputs
  const cleanCount = normaliseCount(websites_count);
  const minTier = tierOf(cleanCount);
  const storageTier = getStorageTier(storage_needed_gb);
  const isHighVolume = cleanCount === '10+';
  const isMultiSite = cleanCount !== '1';
  
  // Detect keywords in purpose field for intelligent routing
  const detectedIntent = detectKeywords(purpose);
  
  // Auto-detect Windows requirement from keywords
  // If ASP.NET, .NET, .NET Core, C#, MSSQL, IIS detected → set needs_windows = true
  if (detectedIntent === 'windows') {
    needs_windows = true;
    // Update answers object to reflect auto-detection
    answers.needs_windows = true;
  }

  // 2. Priority-based routing (order matters!)
  
  // PRIORITY 1: SSL Certificates (if specifically requested or detected)
  // Note: Windows filtering is handled in the controller
  if (needs_ssl === true || detectedIntent === 'ssl') {
    return { 
      gid: 6, 
      minTier, 
      reasoning: 'SSL certificate requested' 
    };
  }
  
  // PRIORITY 3: Reseller Hosting (for managing multiple client sites)
  if (needs_reseller) {
    return { 
      gid: 2, 
      minTier, 
      reasoning: 'Reseller hosting for managing client sites' 
    };
  }
  
  // PRIORITY 4: Keyword-based intelligent routing
  // Detects intent from natural language input
  
  // E-commerce keywords → WooCommerce Hosting (GID 21)
  // Keywords: shop, store, commerce, ecommerce, shopping, cart, payment
  if (detectedIntent === 'ecommerce' || purpose === PURPOSE.ECOM) {
    return { 
      gid: 21, 
      minTier, 
      reasoning: 'E-commerce/store detected - WooCommerce optimized hosting' 
    };
  }
  
  // Business/Corporate keywords → Business Hosting (GID 25)
  // Keywords: business, corporate, application, app, SaaS, software, enterprise
  // Always route to Business Hosting when business intent is detected
  if (detectedIntent === 'business' || purpose === PURPOSE.BUSINESS) {
    return { 
      gid: 25, 
      minTier, 
      reasoning: 'Business/corporate hosting requested' 
    };
  }
  
  // WordPress keywords → WordPress Hosting (GID 20)
  // Keywords: personal, catalogue, normal, blog, content
  if (detectedIntent === 'wordpress' || purpose === PURPOSE.BLOG || purpose === PURPOSE.PORTFOLIO) {
    return { 
      gid: 20, 
      minTier, 
      reasoning: 'Personal/blog/catalogue site - WordPress hosting' 
    };
  }
  
  // PRIORITY 5: Intelligent fallback based on scale
  
  // High volume sites (10+ websites) → Business Hosting (GID 25)
  if (isHighVolume) {
    return { 
      gid: 25, 
      minTier, 
      reasoning: 'High volume hosting for 10+ websites' 
    };
  }
  
  // Large storage needs (>50GB) → Business Hosting (GID 25)
  if (storageTier === STORAGE_TIER.LARGE) {
    return { 
      gid: 25, 
      minTier, 
      reasoning: 'Large storage requirements (>50GB)' 
    };
  }
  
  // High-parameter requests: upper tier + medium/large storage → Business Hosting (GID 25)
  // This catches requests like 4-10 websites with 40-50GB storage
  if (minTier === 'upper' && storageTier === STORAGE_TIER.MEDIUM && storage_needed_gb >= 40) {
    return { 
      gid: 25, 
      minTier, 
      reasoning: 'High-parameter requirements (4+ sites with 40+ GB storage)' 
    };
  }
  
  // Multi-site with medium storage → WordPress Hosting (GID 20)
  // Good balance for multiple sites without extreme requirements
  if (isMultiSite && storageTier === STORAGE_TIER.MEDIUM) {
    return { 
      gid: 20, 
      minTier, 
      reasoning: 'Multiple sites with moderate storage needs' 
    };
  }
  
  // PRIORITY 6: Default fallback → cPanel Hosting (GID 1)
  // General purpose hosting for simple sites or unspecified needs
  return { 
    gid: 1, 
    minTier, 
    reasoning: 'General purpose cPanel hosting' 
  };
};

/* ---------- helpers ---------- */

/**
 * Normalize website count input to standard ranges
 * Handles various input formats: numbers, strings, words
 */
function normaliseCount(raw) {
  const str = String(raw || '').toLowerCase().replace(/\s+/g, ''); // lower-case, no spaces

  // Single website
  if (str === '1' || str === 'one' || str === 'single') return '1';
  
  // 2-3 websites
  if (str === '2-3' || str === '2' || str === '3' || str === 'two' || str === 'three') return '2-3';
  
  // 4-10 websites
  if (str === '4-10' || str === '4' || str === '5' || str === '6' || str === '7' || str === '8' || str === '9' || str === '10' ||
      str === 'four' || str === 'five' || str === 'six' || str === 'seven' || str === 'eight' || str === 'nine' || str === 'ten') return '4-10';
  
  // 10+ websites (high volume)
  if (str === '10+' || str === 'unlimited' || str === 'infinity' || str === 'plus' || str.includes('unlimited') || str.includes('10+')) return '10+';
  
  // Handle numeric values > 10
  const numValue = parseInt(str);
  if (!isNaN(numValue) && numValue > 10) return '10+';
  if (!isNaN(numValue) && numValue >= 4) return '4-10';
  if (!isNaN(numValue) && numValue >= 2) return '2-3';

  return '1'; // safe fallback
}

/**
 * Determine hosting tier based on website count
 * Entry: 1 site, Mid: 2-3 sites, Upper: 4+ sites
 */
function tierOf(count) {
  if (count === '1')     return 'entry';
  if (count === '2-3')   return 'mid';
  return 'upper';        // 4-10 or 10+
}

/**
 * Categorize storage requirements into tiers
 * Small: < 20GB, Medium: 20-50GB, Large: > 50GB
 */
function getStorageTier(storageGb) {
  const storage = parseInt(storageGb) || 10;
  
  if (storage < 20) return STORAGE_TIER.SMALL;
  if (storage <= 50) return STORAGE_TIER.MEDIUM;
  return STORAGE_TIER.LARGE;
}

/**
 * Detect intent from keywords in purpose or other text fields
 * Analyzes text for keywords and returns the detected intent
 * 
 * @param {string} text - Text to analyze (purpose, description, etc.)
 * @returns {string|null} - Detected intent ('ecommerce', 'wordpress', 'business', 'ssl', 'windows') or null
 */
function detectKeywords(text) {
  if (!text || typeof text !== 'string') return null;
  
  const normalized = text.toLowerCase().trim();
  
  // Check each keyword category
  // Priority order: windows > ssl > ecommerce > business > wordpress
  
  // Windows keywords (highest priority - requires specific hosting)
  // ASP.NET, .NET, .NET Core, C#, MSSQL, IIS
  if (KEYWORD_MAPPINGS.windows.some(keyword => normalized.includes(keyword))) {
    return 'windows';
  }
  
  // SSL keywords (high priority for security needs)
  if (KEYWORD_MAPPINGS.ssl.some(keyword => normalized.includes(keyword))) {
    return 'ssl';
  }
  
  // E-commerce keywords (shop, store, commerce)
  if (KEYWORD_MAPPINGS.ecommerce.some(keyword => normalized.includes(keyword))) {
    return 'ecommerce';
  }
  
  // Business keywords (corporate, application, SaaS)
  if (KEYWORD_MAPPINGS.business.some(keyword => normalized.includes(keyword))) {
    return 'business';
  }
  
  // WordPress keywords (personal, catalogue, normal, blog)
  if (KEYWORD_MAPPINGS.wordpress.some(keyword => normalized.includes(keyword))) {
    return 'wordpress';
  }
  
  return null; // No keywords detected
}

