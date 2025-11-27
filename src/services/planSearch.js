/**
 * Plan Search Service
 * Intelligent search for plans by name with partial matching and natural language parsing
 */

const Product = require('../models/Product');

/**
 * Keyword mapping for common search terms
 * Based on actual plan names in the system
 */
const KEYWORD_MAPPINGS = {
  // Hosting types
  'wordpress': ['wp', 'wordpress'],
  'wp': ['wp', 'wordpress'],
  'woocommerce': ['woocommerce', 'commerce'],
  'woo': ['woocommerce'],
  'ecommerce': ['woocommerce', 'commerce'],
  'e-commerce': ['woocommerce', 'commerce'],
  'shop': ['woocommerce', 'commerce'],
  'store': ['woocommerce', 'commerce'],
  'reseller': ['reseller', 'freedom'],
  'business': ['biz', 'business'],
  'biz': ['biz', 'business'],
  
  // Plan levels - Entry tier
  'starter': ['starter', 'entry', 'basic'],
  'entry': ['entry', 'starter', 'basic'],
  'basic': ['basic', 'entry', 'starter'],
  
  // Plan levels - Mid tier
  'standard': ['standard', 'pro'],
  'professional': ['pro', 'standard'],
  'pro': ['pro', 'standard'],
  
  // Plan levels - Upper tier
  'premium': ['premium', 'fantasy', 'max'],
  'ultimate': ['fantasy', 'ultimate', 'max', 'infinity'],
  'fantasy': ['fantasy', 'ultimate', 'premium'],
  'max': ['max', 'biz-max', 'infinity'],
  'infinity': ['infinity', 'biz-infinity', 'max'],
  
  // Business hosting specific (BIZ series)
  'biz5': ['biz-5', 'biz5'],
  'biz10': ['biz-10', 'biz10'],
  'biz15': ['biz-15', 'biz15'],
  'biz30': ['biz-30', 'biz30'],
  'bizmax': ['biz-max', 'bizmax', 'max'],
  'bizinfinity': ['biz-infinity', 'bizinfinity', 'infinity'],
  
  // WordPress hosting specific
  'personal': ['personal', 'wp personal'],
  'studio': ['studio', 'wp studio'],
  'agency': ['agency', 'wp agency'],
  'commerce': ['commerce', 'wp commerce', 'woocommerce'],
  
  // WooCommerce hosting specific
  'novice': ['novice', 'woocommerce novice'],
  'growth': ['growth', 'woocommerce growth'],
  'geek': ['geek', 'woocommerce geek'],
  
  // Reseller hosting specific
  'smarty': ['smarty', 'smarty reseller', 'smarty freedom'],
  'freedom': ['freedom', 'reseller'],
  
  // Budget/Price-related
  'cheap': ['entry', 'basic', 'starter', 'biz-5'],
  'budget': ['entry', 'basic', 'starter', 'biz-5'],
  'affordable': ['entry', 'basic', 'starter', 'biz-5'],
  'economical': ['entry', 'basic', 'starter'],
  'low-cost': ['entry', 'basic', 'starter'],
  'inexpensive': ['entry', 'basic', 'starter'],
  
  // Student/Beginner
  'student': ['entry', 'basic', 'starter', 'personal', 'novice'],
  'students': ['entry', 'basic', 'starter', 'personal', 'novice'],
  'beginner': ['entry', 'basic', 'starter', 'novice'],
  'beginners': ['entry', 'basic', 'starter', 'novice'],
  'learning': ['entry', 'basic', 'starter', 'novice'],
  'education': ['entry', 'basic', 'starter'],
  
  // Small/Simple
  'small': ['entry', 'basic', 'starter', 'biz-5', 'personal'],
  'simple': ['entry', 'basic', 'starter'],
  'minimal': ['entry', 'basic', 'starter'],
  'lite': ['entry', 'basic', 'starter'],
  'light': ['entry', 'basic', 'starter'],
  
  // Large/Advanced
  'large': ['fantasy', 'max', 'infinity', 'biz-max', 'biz-infinity'],
  'advanced': ['pro', 'fantasy', 'max', 'geek'],
  'enterprise': ['fantasy', 'max', 'infinity', 'biz-infinity'],
  'unlimited': ['infinity', 'biz-infinity', 'max'],
  
  // SSL/Security - Specific brands
  'ssl': ['ssl', 'certificate'],
  'certificate': ['ssl', 'certificate'],
  'wildcard': ['wildcard'],
  'rapidssl': ['rapid', 'rapidssl'],
  'rapid': ['rapid', 'rapidssl'],
  'geotrust': ['geotrust'],
  'quickssl': ['quickssl', 'geotrust'],
  'truebusiness': ['truebusiness', 'true business', 'geotrust'],
  'securesite': ['secure site', 'securesite'],
  'ev': ['ev', 'extended validation'],
  'secure': ['secure', 'ssl', 'secure site'],
  'security': ['ssl', 'certificate'],
  'multidomain': ['multidomain', 'multi'],
  
  // Platform
  'windows': ['windows'],
  'linux': ['plan', 'hosting'],
  
  // Features
  'free': ['free', 'trial'],
  'trial': ['trial', 'free'],
  'multi': ['multi', 'multidomain']
};

/**
 * Parse natural language query to extract filters
 * Examples:
 * - "wp pro with 2 years" -> {planName: "wp pro", period: "biennially"}
 * - "biz plan under 2000" -> {planName: "biz", maxPrice: 2000}
 * - "reseller with free domain" -> {planName: "reseller", freedomain: true}
 * - "wordpress 10gb annually" -> {planName: "wordpress", minSpace: 10, period: "annually"}
 */
function parseNaturalLanguageQuery(query) {
  const queryLower = query.toLowerCase().trim();
  const filters = {
    planName: '',
    minPrice: null,
    maxPrice: null,
    minSpace: null,
    maxSpace: null,
    freedomain: null,
    period: 'monthly'
  };

  let cleanQuery = queryLower;

  // Extract price filters
  const underPriceMatch = cleanQuery.match(/(?:under|below|less than|max|maximum|upto|up to)\s+(\d+)/);
  if (underPriceMatch) {
    filters.maxPrice = Number(underPriceMatch[1]);
    cleanQuery = cleanQuery.replace(underPriceMatch[0], '').trim();
  }

  const abovePriceMatch = cleanQuery.match(/(?:above|over|more than|min|minimum|from)\s+(\d+)/);
  if (abovePriceMatch) {
    filters.minPrice = Number(abovePriceMatch[1]);
    cleanQuery = cleanQuery.replace(abovePriceMatch[0], '').trim();
  }

  const exactPriceMatch = cleanQuery.match(/(?:price|cost|rs\.?|pkr)\s*(\d+)/);
  if (exactPriceMatch) {
    filters.minPrice = Number(exactPriceMatch[1]);
    filters.maxPrice = Number(exactPriceMatch[1]);
    cleanQuery = cleanQuery.replace(exactPriceMatch[0], '').trim();
  }

  // Extract diskspace filters
  const spaceMatch = cleanQuery.match(/(\d+)\s*(?:gb|g|space|storage|disk)/i);
  if (spaceMatch) {
    filters.minSpace = Number(spaceMatch[1]);
    cleanQuery = cleanQuery.replace(spaceMatch[0], '').trim();
  }

  // Extract period/billing cycle
  const periodPatterns = [
    { regex: /(?:3\s*years?|triennial|triennially)/i, value: 'triennially' },
    { regex: /(?:2\s*years?|biennial|biennially)/i, value: 'biennially' },
    { regex: /(?:1\s*year|annual|annually|yearly)/i, value: 'annually' },
    { regex: /(?:6\s*months?|semi|semiannual|semiannually)/i, value: 'semiannually' },
    { regex: /(?:3\s*months?|quarter|quarterly)/i, value: 'quarterly' },
    { regex: /(?:1\s*month|monthly)/i, value: 'monthly' }
  ];

  for (const pattern of periodPatterns) {
    if (pattern.regex.test(cleanQuery)) {
      filters.period = pattern.value;
      cleanQuery = cleanQuery.replace(pattern.regex, '').trim();
      break;
    }
  }

  // Extract free domain filter
  if (/(?:free\s+domain|freedomain|with\s+domain)/i.test(cleanQuery)) {
    filters.freedomain = true;
    cleanQuery = cleanQuery.replace(/(?:free\s+domain|freedomain|with\s+domain)/gi, '').trim();
  }

  // Clean up common filler words but keep important context
  cleanQuery = cleanQuery
    .replace(/\b(?:with|and|for|the|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If query becomes too short after cleaning, use original query
  if (cleanQuery.length < 3) {
    filters.planName = queryLower.replace(/\b(?:with|and|for|the|a|an)\b/gi, ' ').trim();
  } else {
    filters.planName = cleanQuery;
  }

  return filters;
}

/**
 * Expand search query using keyword mappings
 */
function expandSearchQuery(query) {
  const queryLower = query.toLowerCase().trim();
  const searchTerms = [queryLower];
  
  // Also add hyphenated version for multi-word queries
  if (queryLower.includes(' ')) {
    searchTerms.push(queryLower.replace(/\s+/g, '-'));
  }
  
  const words = queryLower.split(/\s+/).filter(w => w.length > 0);
  
  // Check each word for keyword mappings
  words.forEach(word => {
    if (!['plan', 'hosting', 'the', 'a', 'an', 'package', 'gb', 'storage'].includes(word)) {
      searchTerms.push(word);
      if (KEYWORD_MAPPINGS[word]) {
        searchTerms.push(...KEYWORD_MAPPINGS[word]);
      }
    }
  });
  
  // Also check the full query for mappings
  if (KEYWORD_MAPPINGS[queryLower]) {
    searchTerms.push(...KEYWORD_MAPPINGS[queryLower]);
  }
  
  return [...new Set(searchTerms)];
}

/**
 * Return full description
 */
function getFullDescription(description) {
  return description || '';
}

/**
 * Check if query explicitly mentions reseller or SSL
 */
function isResellerOrSSLQuery(query) {
  const queryLower = query.toLowerCase();
  const resellerKeywords = ['reseller', 'freedom', 'client', 'agency'];
  const sslKeywords = ['ssl', 'certificate', 'cert', 'secure', 'security', 'wildcard', 'rapidssl', 'geotrust'];
  
  const hasReseller = resellerKeywords.some(kw => queryLower.includes(kw));
  const hasSSL = sslKeywords.some(kw => queryLower.includes(kw));
  
  return { hasReseller, hasSSL };
}

/**
 * Search plans by name with intelligent partial matching
 */
async function searchPlansByName(planName) {
  if (!planName || typeof planName !== 'string') {
    throw new Error('Plan name is required');
  }

  const searchTerm = planName.trim();
  
  if (searchTerm.length === 0) {
    throw new Error('Plan name cannot be empty');
  }
  
  const expandedTerms = expandSearchQuery(searchTerm);
  const { hasReseller, hasSSL } = isResellerOrSSLQuery(searchTerm);

  try {
    const nameConditions = expandedTerms.map(term => ({
      name: { $regex: term, $options: 'i' }
    }));

    const results = await Product.find({
      $and: [
        {
          $or: [
            { hidden: { $exists: false } },
            { hidden: false }
          ]
        },
        {
          $or: nameConditions
        }
      ]
    }).lean();
    
    // Filter out reseller and SSL plans unless explicitly mentioned
    const filteredResults = results.filter(product => {
      const nameLower = product.name.toLowerCase();
      const isReseller = nameLower.includes('reseller') || nameLower.includes('freedom');
      const isSSL = nameLower.includes('ssl') || nameLower.includes('certificate') || 
                    nameLower.includes('secure site') || nameLower.includes('geotrust') || 
                    nameLower.includes('rapidssl');
      
      // Exclude reseller plans unless user mentioned reseller
      if (isReseller && !hasReseller) {
        return false;
      }
      
      // Exclude SSL plans unless user mentioned SSL/certificate
      if (isSSL && !hasSSL) {
        return false;
      }
      
      return true;
    });

    const scoredResults = filteredResults.map(product => {
      let score = 0;
      const nameLower = product.name.toLowerCase();
      const queryLower = searchTerm.toLowerCase();
      
      // Normalize both for comparison (replace hyphens/spaces)
      const nameNormalized = nameLower.replace(/[-\s]+/g, ' ').trim();
      const queryNormalized = queryLower.replace(/[-\s]+/g, ' ').trim();

      // HIGHEST PRIORITY: Check if all query words appear in the name
      const queryWords = queryNormalized.split(/\s+/);
      const allWordsMatch = queryWords.every(word => 
        nameNormalized.includes(word)
      );

      // Check for exact phrase match (with flexible spacing/hyphens)
      const exactPhraseMatch = nameNormalized.includes(queryNormalized) || 
                               nameLower.includes(queryLower.replace(/\s+/g, '-'));

      if (exactPhraseMatch && allWordsMatch) {
        // Exact phrase with all words = highest score
        score = 2000;
      } else if (allWordsMatch && queryWords.length > 1) {
        // All words present in multi-word query = very high score
        score = 1500;
      } else {
        // Fall back to individual term matching
        const allTerms = [queryLower, ...expandedTerms];
        let bestScore = 0;

        allTerms.forEach(term => {
          let termScore = 0;
          
          if (nameLower === term) {
            termScore = 1000;
          } else if (nameLower.startsWith(term)) {
            termScore = 500;
          } else if (nameLower.includes(` ${term} `) || nameLower.includes(` ${term}`) || nameLower.includes(`${term} `)) {
            termScore = 300;
          } else if (nameLower.includes(term)) {
            termScore = 200;
          }

          bestScore = Math.max(bestScore, termScore);
        });

        score = bestScore;
      }

      // Bonus for shorter names (more specific)
      score += Math.max(0, 50 - product.name.length);

      return {
        ...product,
        relevanceScore: score
      };
    });

    scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const exactMatch = scoredResults.find(
      product => product.name.toLowerCase() === searchTerm.toLowerCase()
    );

    if (exactMatch) {
      return [exactMatch];
    }

    return scoredResults.slice(0, 3);

  } catch (error) {
    console.error('Plan search error:', error);
    throw new Error(`Search failed: ${error.message}`);
  }
}

/**
 * Apply filters to search results
 */
function applyFilters(results, filters) {
  // If no filters specified, return all results
  const hasFilters = filters.minPrice || filters.maxPrice || filters.minSpace || filters.maxSpace || 
                     (filters.freedomain !== null && filters.freedomain !== undefined);
  
  if (!hasFilters) {
    return results;
  }

  const filtered = results.filter(product => {
    // Filter by price
    if (filters.minPrice || filters.maxPrice) {
      const period = filters.period || 'monthly';
      const price = product.pricing?.PKR?.[period];
      
      if (!price || Number(price) <= 0) {
        return false;
      }

      const priceNum = Number(price);
      
      if (filters.minPrice && priceNum < filters.minPrice) {
        return false;
      }
      
      if (filters.maxPrice && priceNum > filters.maxPrice) {
        return false;
      }
    }

    // Filter by diskspace (with some flexibility)
    if (filters.minSpace || filters.maxSpace) {
      const diskspace = Number(product.diskspace) || 0;
      
      // For minSpace, allow plans with at least 50% of requested space
      if (filters.minSpace) {
        const threshold = filters.minSpace * 0.5;
        if (diskspace < threshold) {
          return false;
        }
      }
      
      if (filters.maxSpace && diskspace > filters.maxSpace) {
        return false;
      }
    }

    // Filter by freedomain
    if (filters.freedomain !== null && filters.freedomain !== undefined) {
      if (product.freedomain !== filters.freedomain) {
        return false;
      }
    }

    return true;
  });
  
  // If filtering resulted in 0 results, return unfiltered results
  return filtered.length > 0 ? filtered : results;
}

/**
 * Format results with required fields
 */
function formatResults(results) {
  return results.map(product => {
    // Calculate monthly price
    let monthlyPrice = null;
    let annualPrice = null;
    
    if (product.pricing && product.pricing.PKR) {
      // Get monthly price
      if (product.pricing.PKR.monthly && Number(product.pricing.PKR.monthly) > 0) {
        monthlyPrice = Math.round(Number(product.pricing.PKR.monthly));
      } else if (product.pricing.PKR.annually && Number(product.pricing.PKR.annually) > 0) {
        monthlyPrice = Math.round(Number(product.pricing.PKR.annually) / 12);
      }
      
      // Get annual price
      if (product.pricing.PKR.annually && Number(product.pricing.PKR.annually) > 0) {
        annualPrice = Math.round(Number(product.pricing.PKR.annually));
      } else if (product.pricing.PKR.monthly && Number(product.pricing.PKR.monthly) > 0) {
        annualPrice = Math.round(Number(product.pricing.PKR.monthly) * 12);
      }
    }

    return {
      name: product.name,
      description: getFullDescription(product.description),
      diskspace: product.diskspace,
      freedomain: product.freedomain,
      price: {
        monthly: monthlyPrice,
        annual: annualPrice
      },
      link: product.link
    };
  });
}

/**
 * Search plans with natural language query and filters
 */
async function searchPlansWithFilters(query, providedFilters = {}) {
  try {
    // Parse natural language query
    const parsedFilters = parseNaturalLanguageQuery(query);
    
    // Merge with provided filters (provided filters take precedence)
    const filters = {
      ...parsedFilters,
      ...Object.fromEntries(
        Object.entries(providedFilters).filter(([_, v]) => v !== null && v !== undefined)
      )
    };

    // Try searching with parsed plan name first
    let results = await searchPlansByName(filters.planName || query);
    
    // If no results with parsed name, try with original query
    if (!results || results.length === 0) {
      console.log('No results with parsed name, trying original query');
      results = await searchPlansByName(query);
    }
    
    // If still no results, return empty array
    if (!results || results.length === 0) {
      return [];
    }
    
    // Apply filters (with fallback to unfiltered if no matches)
    const filteredResults = applyFilters(results, filters);
    
    // Format results
    return formatResults(filteredResults);
  } catch (error) {
    console.error('searchPlansWithFilters error:', error);
    // Return empty array on error instead of throwing
    return [];
  }
}

module.exports = {
  searchPlansByName,
  searchPlansWithFilters,
  parseNaturalLanguageQuery
};
