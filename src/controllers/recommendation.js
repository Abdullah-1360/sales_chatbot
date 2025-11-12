const planMatcher = require('../services/planMatcher');
const whmcs      = require('../services/whmcs');
const Joi        = require('joi');
const { getTierFromPlan, getTierRank } = require('../utils/tierHelper');
const { findNearestNeighbors } = require('../services/nearestNeighbor');
const { calculateConfidence } = require('../services/confidenceScorer');
const { selectThreePlans } = require('../services/planSelector');
const { createLogger } = require('../utils/logger');

const logger = createLogger('RECOMMENDATION');

/**
 * Normalize None/null/NULL values to proper defaults
 * @param {Object} data - Input data that may contain 'None', null, or 'NULL' values
 * @returns {Object} - Normalized data
 */
function normalizeNoneValues(data) {
  const normalized = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Check if value is 'None', 'NULL', null, or undefined
    if (value === 'None' || value === 'NULL' || value === null || value === undefined) {
      // Set appropriate defaults based on field type
      switch (key) {
        case 'purpose':
          normalized[key] = 'Blog';
          break;
        case 'websites_count':
          normalized[key] = '1';
          break;
        case 'email_needed':
        case 'free_domain':
        case 'migrate_from_existing_host':
          normalized[key] = false;
          break;
        case 'storage_needed_gb':
          normalized[key] = 10;
          break;
        case 'monthly_budget':
          normalized[key] = 0;
          break;
        default:
          normalized[key] = value;
      }
    } else {
      normalized[key] = value;
    }
  }
  
  return normalized;
}

/* ---------- validation schema ---------- */
const bodySchema = Joi.object({
  // Core matching criteria: diskspace, websites_count, free_domain, purpose
  purpose: Joi.string().valid('Blog', 'Business Site', 'Ecommerce', 'Portfolio', 'Other').default('Blog'),
  websites_count: Joi.alternatives().try(
    Joi.string(),
    Joi.number()
  ).default('1'),
  storage_needed_gb: Joi.alternatives().try(
    Joi.number().integer().min(0),
    Joi.string()
  ).default(10),
  free_domain: Joi.boolean().allow(null).default(false),
  
  // Special routing flags
  needs_reseller: Joi.boolean().allow(null).default(false),
  needs_ssl: Joi.boolean().allow(null).default(false)
});

/* ---------- main controller ---------- */
exports.recommend = async (req, res, next) => {
  const clientTimeout = parseInt(req.headers['Timeout']) || 30000;
  const startTime = Date.now();
  
  logger.info('Recommendation request received', { 
    body: req.body,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  try {
    // Normalize None/null/NULL values before validation
    const normalizedBody = normalizeNoneValues(req.body);
    logger.debug('Normalized request body', normalizedBody);
    
    const answers = await bodySchema.validateAsync(normalizedBody);
    const { gid, minTier, reasoning } = planMatcher(answers);
    
    logger.info('Plan matcher result', { gid, minTier, reasoning, answers });

    /* 1.  fetch products for determined group */
    logger.debug(`Fetching products for GID ${gid}`);
    let allPlans = await whmcs.getProductsByGid(gid);
    
    if (!allPlans.length) {
      logger.warn(`No plans found for GID ${gid}`);
      return res.json({ matches: [] });
    }
    
    logger.info(`Found ${allPlans.length} plans for GID ${gid}`);

    /* 2. Smart storage filtering with progressive fallback */
    // First, try to find plans that meet or exceed storage requirement
    let storageMatches = allPlans.filter(p => {
      const diskspace = p.diskspace;
      // Handle unlimited storage
      if (diskspace === 'unlimited' || diskspace === 'Unlimited') return true;
      return parseInt(diskspace) >= answers.storage_needed_gb;
    });
    
    logger.info(`Exact storage matches: ${storageMatches.length} plans`);
    
    // If we have fewer than 3 matches, progressively expand the search
    if (storageMatches.length < 3) {
      // For small storage requests (< 20GB), show all plans in the GID
      // For larger requests, be more selective
      if (answers.storage_needed_gb < 20) {
        // Show all plans for small storage needs - user can upgrade
        storageMatches = allPlans;
        logger.info('Small storage request, showing all plans');
      } else {
        // For larger requests, include plans that are at least 20% of requirement
        const threshold = Math.max(5, answers.storage_needed_gb * 0.2); // Minimum 5GB or 20% of requested
        const nearMatches = allPlans.filter(p => {
          const diskspace = p.diskspace;
          if (diskspace === 'unlimited' || diskspace === 'Unlimited') return true;
          const storage = parseInt(diskspace);
          return storage >= threshold && storage < answers.storage_needed_gb;
        });
        
        // Combine exact matches with near matches
        storageMatches = [...storageMatches, ...nearMatches];
        logger.info(`Expanded storage filter: ${storageMatches.length} plans (threshold: ${threshold}GB)`);
        
        // If still fewer than 3, use all plans
        if (storageMatches.length < 3) {
          storageMatches = allPlans;
          logger.info('Still insufficient matches, using all plans');
        }
      }
    }
    
    logger.info(`After storage filter: ${storageMatches.length} plans`);
    
    /* 3. Filter by tier from websites_count (soft filter with fallback) */
    let tierMatches = storageMatches.filter(p => getTierRank(getTierFromPlan(p)) >= getTierRank(minTier));
    
    // If tier filtering is too aggressive (< 3 plans), use storage matches instead
    let exactMatches = tierMatches.length >= 3 ? tierMatches : storageMatches;
    logger.info(`After tier filter: ${tierMatches.length} plans, using ${exactMatches.length} plans`);

    /* 4. Prefer plans with free domain if requested (soft filter) */
    if (answers.free_domain) {
      const withDomain = exactMatches.filter(p => p.freedomain);
      if (withDomain.length >= 3) {
        exactMatches = withDomain;
        logger.info(`Free domain filter applied: ${withDomain.length} plans`);
      }
    }

    let finalPlans = [];
    
    if (exactMatches.length > 0) {
      /* Exact matches found - calculate confidence and select 3 plans */
      logger.info(`Found ${exactMatches.length} exact matches`);
      
      const plansWithConfidence = exactMatches.map(p => ({
        ...p,
        confidence: calculateConfidence(p, { ...answers, minTier })
      }));
      
      // Select top 3 plans by confidence score
      finalPlans = plansWithConfidence
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);
      
      logger.info(`Selected ${finalPlans.length} final plans`);
      
      // Log confidence stats
      if (finalPlans.length > 0) {
        const confidences = finalPlans.map(p => p.confidence);
        const avgConfidence = (confidences.reduce((a,b) => a+b, 0) / confidences.length).toFixed(2);
        logger.info('Confidence scores calculated', {
          min: Math.min(...confidences),
          max: Math.max(...confidences),
          avg: avgConfidence,
          planCount: finalPlans.length
        });
      }
      
    } else {
      /* No exact matches - use nearest neighbor within same GID */
      logger.info(`No exact matches, searching for nearest neighbors within GID ${gid}`);
      
      finalPlans = findNearestNeighbors(allPlans, { ...answers, minTier });
      
      if (finalPlans.length > 0) {
        const confidences = finalPlans.map(p => p.confidence);
        const avgConfidence = (confidences.reduce((a,b) => a+b, 0) / confidences.length).toFixed(2);
        logger.info('Nearest neighbor confidence scores', {
          min: Math.min(...confidences),
          max: Math.max(...confidences),
          avg: avgConfidence,
          planCount: finalPlans.length
        });
      } else {
        logger.warn('No viable nearest neighbors found (all below 40% confidence threshold)');
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Recommendation completed', {
      matchCount: finalPlans.length,
      duration: `${duration}ms`,
      gid,
      minTier
    });

    // Format response as cards
    const cardResponse = formatAsCards(finalPlans, gid);
    res.json(cardResponse);
  } catch (e) {
    logger.error('Error in recommendation', {
      error: e.message,
      stack: e.stack,
      body: req.body
    });
    next(e);
  }
};

/**
 * Extract features from plan description
 * @param {string} description - Plan description text
 * @param {number} limit - Maximum number of features to extract
 * @returns {Array<string>} - Array of feature strings
 */
function extractFeatures(description, limit = 5) {
  if (!description) return [];
  
  let features = [];
  
  // First, try splitting by newlines
  const lines = description.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length > 1) {
    // Multi-line description - each line is a feature
    features = lines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove common bullet points, markers, and trailing punctuation
        return line
          .replace(/^[-•*✓✔√►▸▹▪▫⦿⦾◆◇○●]\s*/g, '')
          .replace(/^\d+[\.)]\s*/g, '')
          .replace(/^<[^>]+>/g, '')
          .replace(/[,;]+$/g, '') // Remove trailing commas/semicolons
          .trim();
      })
      .filter(line => line.length > 3 && line.length < 150); // Reasonable feature length
  } else {
    // Single line description - split by commas
    features = description
      .split(/,/)
      .map(f => f.trim())
      .filter(f => f.length > 3 && f.length < 150)
      .map(f => f.replace(/[,;]+$/g, '').trim()); // Clean up
  }
  
  // Return first N features
  return features.slice(0, limit);
}

/**
 * Format plans as card response
 * @param {Array} plans - Array of plan objects
 * @param {number} gid - Group ID
 * @returns {Object} - Formatted card response
 */
function formatAsCards(plans, gid) {
  try {
    if (!plans || plans.length === 0) {
      return {
        version: "v1",
        content: {
          messages: [
            {
              type: "text",
              text: "No hosting plans found matching your requirements.",
              buttons: []
            }
          ],
        actions:[

        ],
        quick_replies:[
          
        ]
        }
      };
    }

  // Get plan type from GID
  const planTypes = {
    1: 'cpanel',
    2: 'reseller',
    6: 'ssl',
    20: 'wordpress',
    21: 'woocommerce',
    25: 'business',
    26: 'reseller',
    28: 'windows'
  };
  const planType = planTypes[gid] || 'hosting';

  // Convert plans to text messages with buttons
  const textMessages = plans.map(plan => {
    try {
      // Get pricing in PKR (assuming USD to PKR conversion)
      const usdPrice = parseFloat(plan.pricing?.USD?.monthly || 0);
      const pkrPrice =( plan.pricing?.PKR?.annually )/12
        ? parseFloat((plan.pricing.PKR.annually)/12) 
        : (usdPrice * 280); // Default conversion rate
    
      // Format storage nicely
      const storage = plan.diskspace;
      const storageDisplay = storage === 'unlimited' || storage === 'Unlimited' 
        ? '∞ Unlimited' 
        : `${storage}GB SSD`;
      
      // Extract features from description
      const features = extractFeatures(plan.description || '', 10); // Get more, we'll filter
      
      // Build key features list (storage + free domain + description features)
      const keyFeatures = [];
      
      // Add storage as first feature
      const storageFeature = `${storageDisplay} Storage`;
      keyFeatures.push(storageFeature);
      
      // Add free domain if available
      if (plan.freedomain) {
        keyFeatures.push('Free Domain Included');
      }
      
      // Add features from description, avoiding duplicates
      const storageKeywords = ['storage', 'disk', 'ssd', 'nvme', 'gb'];
      const domainKeywords = ['domain', 'free .com', 'free .pk'];
      
      for (const feature of features) {
        if (keyFeatures.length >= 5) break; // Limit to 5 features
        
        const featureLower = feature.toLowerCase();
        
        // Skip if it's a duplicate of storage info
        const isDuplicateStorage = storageKeywords.some(kw => 
          featureLower.includes(kw) && featureLower.includes('gb')
        );
        
        // Skip if it's a duplicate of domain info
        const isDuplicateDomain = plan.freedomain && domainKeywords.some(kw => 
          featureLower.includes(kw)
        );
        
        // Skip if already added
        const isAlreadyAdded = keyFeatures.some(existing => 
          existing.toLowerCase() === featureLower
        );
        
        if (!isDuplicateStorage && !isDuplicateDomain && !isAlreadyAdded) {
          keyFeatures.push(feature);
        }
      }
      
      // Format features text
      const featuresText = keyFeatures.length > 0 
        ? '\n\n' + keyFeatures.map(f => `✓ ${f}`).join('\n')
        : '';
      
      // Build text with plan name, price, and features
      const text = `${plan.name || 'Unknown Plan'}\n@PKR ${Math.round(pkrPrice)}/month${featuresText}`;

      return {
        type: "text",
        text: text,
        buttons: [
          {
            type: "url",
            caption: "Get This Plan",
            url: plan.link
          }
        ]
      };
    } catch (error) {
      logger.error('Error formatting plan message', {
        error: error.message,
        plan: plan.name,
        pid: plan.pid
      });
      // Return a minimal message on error
      return {
        type: "text",
        text: `${plan.name || 'Plan'}\nError loading plan details`,
        buttons: [
          {
            type: "url",
            caption: "View Details",
            url: plan.link || 'https://portal.hostbreak.com'
          }
        ]
      };
    }
  }).filter(message => message !== null);

    return {
      version: "v1",
      content: {
        messages: textMessages,
        actions:[

        ],
        quick_replies:[

        ]
      }
    };
  } catch (error) {
    logger.error('Error in formatAsCards', {
      error: error.message,
      stack: error.stack,
      gid,
      planCount: plans?.length
    });
    // Return empty cards on error
    return {
      version: "v1",
      content: {
        messages: [],
        actions:[

        ],
        quick_replies:[
          
        ]
      }
    };
  }
}

/* ---------- helper: map WHMCS plan → tier (deprecated - use tierHelper) ---------- */
// Kept for backward compatibility if needed elsewhere
function tierOfPlan(product) {
  return getTierFromPlan(product);
}