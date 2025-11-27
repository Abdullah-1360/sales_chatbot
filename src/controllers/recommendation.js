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
 * Normalize None/null/NULL/empty values to proper defaults
 * @param {Object} data - Input data that may contain 'None', null, 'NULL', or empty values
 * @returns {Object} - Normalized data
 */
function normalizeNoneValues(data) {
  const normalized = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Check if value is 'None', 'NULL', null, undefined, or empty string
    if (value === 'None' || value === 'NULL' || value === null || value === undefined || value === '') {
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
        case 'needs_reseller':
        case 'needs_ssl':
          normalized[key] = false;
          break;
        case 'storage_needed_gb':
          normalized[key] = 10;
          break;
        case 'monthly_budget':
          normalized[key] = 0;
          break;
        case 'tech_stack':
        case 'cms':
          normalized[key] = '';
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
  // Purpose now accepts any string for natural language keyword detection
  // Standard values: 'Blog', 'Business Site', 'Ecommerce', 'Portfolio', 'Other'
  // Keywords: shop, store, personal, catalogue, corporate, application, certificate, secure, etc.
  purpose: Joi.string().default('Blog'),
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
    
    // Filter out hidden plans (PID 238, 250)
    const hiddenPids = [238, 250];
    allPlans = allPlans.filter(p => !hiddenPids.includes(parseInt(p.pid)));
    
    if (!allPlans.length) {
      logger.warn(`No plans found for GID ${gid}`);
      return res.json([]);
    }
    
    logger.info(`Found ${allPlans.length} plans for GID ${gid} (after filtering hidden plans)`);

    /* 2. Strict storage filtering - only show plans that meet requirements */
    // Find plans that meet or exceed storage requirement
    let storageMatches = allPlans.filter(p => {
      const diskspace = p.diskspace;
      // Handle unlimited storage
      if (diskspace === 'unlimited' || diskspace === 'Unlimited') return true;
      return parseInt(diskspace) >= answers.storage_needed_gb;
    });
    
    logger.info(`Exact storage matches: ${storageMatches.length} plans`);
    
    // Only use fallback if NO matches found at all
    if (storageMatches.length === 0) {
      // Find closest matches (at least 50% of requirement)
      const threshold = Math.max(5, answers.storage_needed_gb * 0.5);
      storageMatches = allPlans.filter(p => {
        const diskspace = p.diskspace;
        if (diskspace === 'unlimited' || diskspace === 'Unlimited') return true;
        const storage = parseInt(diskspace);
        return storage >= threshold;
      });
      
      logger.info(`No exact matches, using fallback with threshold ${threshold}GB: ${storageMatches.length} plans`);
      
      // If still no matches, use all plans as last resort
      if (storageMatches.length === 0) {
        storageMatches = allPlans;
        logger.info('No matches found, showing all available plans');
      }
    }
    
    logger.info(`After storage filter: ${storageMatches.length} plans`);
    
    /* 3. Filter by tier from websites_count (strict filter) */
    let tierMatches = storageMatches.filter(p => getTierRank(getTierFromPlan(p)) >= getTierRank(minTier));
    
    // Use tier matches if we have at least 2, otherwise use storage matches for nearest neighbor
    let exactMatches = tierMatches.length >= 2 ? tierMatches : storageMatches;
    logger.info(`After tier filter: ${tierMatches.length} plans, using ${exactMatches.length} plans`);

    /* 4. Filter by free domain if requested (strict filter) */
    if (answers.free_domain) {
      const withDomain = exactMatches.filter(p => p.freedomain);
      // Only apply filter if we have at least 2 matches, otherwise use nearest neighbor
      if (withDomain.length >= 2) {
        exactMatches = withDomain;
        logger.info(`Free domain filter applied: ${withDomain.length} plans`);
      } else if (withDomain.length === 1) {
        // Keep the one match but supplement with nearest neighbors later
        exactMatches = withDomain;
        logger.info(`Free domain filter applied: ${withDomain.length} plan (will supplement with neighbors)`);
      } else {
        logger.warn('Free domain requested but no plans with free domain found, using nearest neighbors');
      }
    }

    let finalPlans = [];
    
    if (exactMatches.length >= 3) {
      /* Sufficient exact matches found - calculate confidence and select 3 plans */
      logger.info(`Found ${exactMatches.length} exact matches`);
      
      const plansWithConfidence = exactMatches.map(p => ({
        ...p,
        confidence: calculateConfidence(p, { ...answers, minTier }),
        isExactMatch: true
      }));
      
      // Sort by confidence score, then by price (ascending) for ties
      finalPlans = plansWithConfidence
        .sort((a, b) => {
          const confDiff = b.confidence - a.confidence;
          if (Math.abs(confDiff) > 1) return confDiff;
          // For similar confidence, prefer lower price
          const priceA = parseFloat(a.pricing?.PKR?.monthly || a.pricing?.PKR?.annually / 12 || 999999);
          const priceB = parseFloat(b.pricing?.PKR?.monthly || b.pricing?.PKR?.annually / 12 || 999999);
          return priceA - priceB;
        })
        .slice(0, 3);
      
      logger.info(`Selected ${finalPlans.length} final plans from exact matches`);
      
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
      
    } else if (exactMatches.length > 0 && exactMatches.length < 3) {
      /* Few exact matches - combine with nearest neighbors to get 3 plans */
      logger.info(`Found only ${exactMatches.length} exact matches, supplementing with nearest neighbors`);
      
      const exactWithConfidence = exactMatches.map(p => ({
        ...p,
        confidence: calculateConfidence(p, { ...answers, minTier }),
        isExactMatch: true
      }));
      
      // Get nearest neighbors from remaining plans
      const remainingPlans = allPlans.filter(p => 
        !exactMatches.some(em => em.pid === p.pid)
      );
      
      const neighbors = findNearestNeighbors(remainingPlans, { ...answers, minTier }).map(p => ({
        ...p,
        isExactMatch: false
      }));
      
      // PRIORITY: Exact matches first, then neighbors
      // Sort exact matches by confidence
      const sortedExact = exactWithConfidence.sort((a, b) => b.confidence - a.confidence);
      
      // Sort neighbors by confidence
      const sortedNeighbors = neighbors.sort((a, b) => b.confidence - a.confidence);
      
      // Combine: all exact matches first, then fill with neighbors
      finalPlans = [...sortedExact, ...sortedNeighbors].slice(0, 3);
      
      logger.info(`Selected ${finalPlans.length} final plans (${exactMatches.length} exact + ${finalPlans.length - exactMatches.length} neighbors)`);
      
    } else {
      /* No exact matches - use nearest neighbor within same GID */
      logger.info(`No exact matches, searching for nearest neighbors within GID ${gid}`);
      
      finalPlans = findNearestNeighbors(allPlans, { ...answers, minTier }).map(p => ({
        ...p,
        isExactMatch: false
      }));
      
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
 * Format plans as simple JSON response
 * @param {Array} plans - Array of plan objects
 * @param {number} gid - Group ID
 * @returns {Array} - Array of formatted plans
 */
function formatAsCards(plans, gid) {
  try {
    if (!plans || plans.length === 0) {
      return [];
    }

    // Convert plans to simple format
    return plans.map(plan => {
      try {
        // Get pricing in PKR - calculate from annual/12 if monthly not available
        let pkrPrice = 0;
        
        if (plan.pricing?.PKR?.monthly && parseFloat(plan.pricing.PKR.monthly) > 0) {
          pkrPrice = parseFloat(plan.pricing.PKR.monthly);
        } else if (plan.pricing?.PKR?.annually && parseFloat(plan.pricing.PKR.annually) > 0) {
          pkrPrice = parseFloat(plan.pricing.PKR.annually) / 12;
        } else {
          // Fallback to USD conversion
          const usdPrice = parseFloat(plan.pricing?.USD?.monthly || 0);
          pkrPrice = usdPrice * 280;
        }
        
        // Return full description
        const description = plan.description || '';
        
        return {
          name: plan.name || 'Unknown Plan',
          description: description,
          price: Math.round(pkrPrice),
          link: plan.link || 'https://portal.hostbreak.com'
        };
      } catch (error) {
        logger.error('Error formatting plan', {
          error: error.message,
          plan: plan.name,
          pid: plan.pid
        });
        // Return minimal plan on error
        return {
          name: plan.name || 'Plan',
          description: 'Error loading plan details',
          price: 0,
          link: plan.link || 'https://portal.hostbreak.com'
        };
      }
    }).filter(plan => plan !== null);
  } catch (error) {
    logger.error('Error in formatAsCards', {
      error: error.message,
      stack: error.stack,
      gid,
      planCount: plans?.length
    });
    return [];
  }
}

/* ---------- helper: map WHMCS plan → tier (deprecated - use tierHelper) ---------- */
// Kept for backward compatibility if needed elsewhere
function tierOfPlan(product) {
  return getTierFromPlan(product);
}