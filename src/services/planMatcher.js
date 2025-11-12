// src/services/planMatcher.js
const { PURPOSE, STORAGE_TIER } = require('../config/constants');

/**
 * Enhanced plan matcher with robust routing logic
 * Routes based on: purpose, websites_count, storage_needed_gb, needs_ssl, needs_reseller
 * 
 * @param {Object} answers - User requirements
 * @returns {Object} { gid, minTier, reasoning } - Matched group ID, minimum tier, and reasoning
 */
module.exports = function planMatcher(answers) {
  const { purpose, websites_count, needs_reseller, needs_ssl, storage_needed_gb } = answers;

  // 1. Normalize and analyze inputs
  const cleanCount = normaliseCount(websites_count);
  const minTier = tierOf(cleanCount);
  const storageTier = getStorageTier(storage_needed_gb);
  const isHighVolume = cleanCount === '10+';
  const isMultiSite = cleanCount !== '1';

  // 2. Priority-based routing (order matters!)
  
  // PRIORITY 1: SSL Certificates (if specifically requested)
  if (needs_ssl === true) {
    return { 
      gid: 6, 
      minTier, 
      reasoning: 'SSL certificate requested' 
    };
  }
  
  // PRIORITY 2: Reseller Hosting (for managing multiple client sites)
  if (needs_reseller) {
    return { 
      gid: 2, 
      minTier, 
      reasoning: 'Reseller hosting for managing client sites' 
    };
  }
  
  // PRIORITY 3: Purpose-based routing with enhanced logic
  
  // E-commerce sites → WooCommerce Hosting (GID 21)
  // Best for online stores with shopping cart, payments, inventory
  if (purpose === PURPOSE.ECOM) {
    return { 
      gid: 21, 
      minTier, 
      reasoning: 'E-commerce site requires WooCommerce optimized hosting' 
    };
  }
  
  // Blog sites → WordPress Hosting (GID 20)
  // Optimized for content management, blogging, and WordPress performance
  if (purpose === PURPOSE.BLOG) {
    return { 
      gid: 20, 
      minTier, 
      reasoning: 'Blog site optimized for WordPress hosting' 
    };
  }
  
  // Portfolio sites → WordPress Hosting (GID 20)
  // Great for showcasing work with visual themes and galleries
  if (purpose === PURPOSE.PORTFOLIO) {
    return { 
      gid: 20, 
      minTier, 
      reasoning: 'Portfolio site works best with WordPress hosting' 
    };
  }
  
  // Business sites with high requirements → Business Hosting (GID 25)
  // For professional sites with higher traffic, storage, or multiple sites
  if (purpose === PURPOSE.BUSINESS) {
    // Route to Business Hosting if high volume or large storage needs
    if (isHighVolume || storageTier === STORAGE_TIER.LARGE) {
      return { 
        gid: 25, 
        minTier, 
        reasoning: 'Business site with high volume/storage needs' 
      };
    }
    // Otherwise, WordPress Hosting is sufficient for most business sites
    return { 
      gid: 20, 
      minTier, 
      reasoning: 'Business site with standard requirements' 
    };
  }
  
  // PRIORITY 4: Intelligent fallback based on scale
  
  // High volume sites (10+ websites) → Business Hosting (GID 25)
  if (isHighVolume) {
    return { 
      gid: 25, 
      minTier, 
      reasoning: 'High volume hosting for 10+ websites' 
    };
  }
  
  // Large storage needs → Business Hosting (GID 25)
  if (storageTier === STORAGE_TIER.LARGE) {
    return { 
      gid: 25, 
      minTier, 
      reasoning: 'Large storage requirements (>50GB)' 
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
  
  // PRIORITY 5: Default fallback → cPanel Hosting (GID 1)
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

