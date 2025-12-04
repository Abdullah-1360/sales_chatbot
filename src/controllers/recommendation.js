const planMatcher = require('../services/planMatcher');
const whmcs      = require('../services/whmcs');
const Joi        = require('joi');
const { getTierFromPlan, getTierRank } = require('../utils/tierHelper');
const { findNearestNeighbors } = require('../services/nearestNeighbor');
const { calculateConfidence } = require('../services/confidenceScorer');
const { selectThreePlans } = require('../services/planSelector');
const { filterPlansByRequirements } = require('../services/requirementsAnalyzer');
const { createLogger } = require('../utils/logger');

const logger = createLogger('RECOMMENDATION');

/**
 * Normalize None/null/NULL/empty values to proper defaults
 * @param {Object} data - Input data that may contain 'None', 'null', 'NULL', or empty values
 * @returns {Object} - Normalized data
 */
function normalizeNoneValues(data) {
  const normalized = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Normalize string 'None', 'NULL', 'null' - leave actual null/undefined alone
    // They will be handled by Joi defaults
    if (value === 'None' || value === 'NULL' || value === 'null') {
      // Set appropriate defaults based on field type
      switch (key) {
        case 'purpose':
          // Don't set default here, let Joi handle it
          normalized[key] = undefined;
          break;
        case 'websites_count':
          normalized[key] = '1';
          break;
        case 'email_needed':
        case 'free_domain':
        case 'migrate_from_existing_host':
        case 'needs_reseller':
        case 'needs_ssl':
        case 'needs_windows':
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
        case 'other_requirements':
          normalized[key] = '';
          break;
        default:
          normalized[key] = undefined;
      }
    } else {
      // Keep the original value (including null, undefined, empty string)
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
  // If null/undefined, defaults to 'Other' to avoid assumptions
  purpose: Joi.string().allow(null, '').default('Other'),
  websites_count: Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.any().valid(null)
  ).default(null), // null means "don't filter by website count"
  storage_needed_gb: Joi.alternatives().try(
    Joi.number().integer().min(0),
    Joi.string(),
    Joi.any().valid(null)
  ).default(10),
  free_domain: Joi.boolean().allow(null).default(false),
  
  // Special routing flags
  needs_reseller: Joi.boolean().allow(null).default(false),
  needs_ssl: Joi.boolean().allow(null).default(false),
  needs_windows: Joi.boolean().allow(null).default(false),
  
  // Other requirements - free text for intelligent parsing
  other_requirements: Joi.string().allow('', null).optional()
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
    let { gid, minTier, reasoning } = planMatcher(answers);
    
    logger.info('Plan matcher result', { gid, minTier, reasoning, answers });

    /* 1.  fetch products for determined group */
    logger.debug(`Fetching products for GID ${gid}`);
    let allPlans = await whmcs.getProductsByGid(gid);
    
    // Filter out hidden plans (PID 238, 250)
    const hiddenPids = [238, 250];
    allPlans = allPlans.filter(p => !hiddenPids.includes(parseInt(p.pid)));
    
    // Filter Windows plans based on needs_windows parameter
    if (answers.needs_windows === true) {
      // User wants ONLY Windows plans (should already be routed to GID 25)
      const windowsPlans = allPlans.filter(p => 
        p.name && p.name.toLowerCase().includes('windows')
      );
      
      if (windowsPlans.length > 0) {
        allPlans = windowsPlans;
        logger.info(`Filtered for Windows plans only: ${allPlans.length} plans found in GID ${gid}`);
      } else {
        logger.warn(`Windows plans requested but none found in GID ${gid}`);
        return res.json([]);
      }
    } else {
      // User wants NON-Windows plans (default behavior)
      const nonWindowsPlans = allPlans.filter(p => 
        !p.name || !p.name.toLowerCase().includes('windows')
      );
      
      if (nonWindowsPlans.length > 0) {
        allPlans = nonWindowsPlans;
        logger.info(`Filtered out Windows plans: ${allPlans.length} non-Windows plans remaining`);
      } else {
        logger.warn('Only Windows plans available in this GID, but non-Windows requested');
        // Keep all plans as fallback
      }
    }
    
    if (!allPlans.length) {
      logger.warn(`No plans found for GID ${gid}`);
      return res.json([]);
    }
    
    logger.info(`Found ${allPlans.length} plans for GID ${gid} (after filtering hidden plans)`);

    /* 2. Storage filtering with flexible thresholds */
    // Find plans that meet or exceed storage requirement
    let storageMatches = allPlans.filter(p => {
      const diskspace = p.diskspace;
      // Handle unlimited storage
      if (diskspace === 'unlimited' || diskspace === 'Unlimited') return true;
      return parseInt(diskspace) >= answers.storage_needed_gb;
    });
    
    logger.info(`Exact storage matches: ${storageMatches.length} plans`);
    
    // Use more flexible fallback if few matches
    if (storageMatches.length < 3) {
      // Find closest matches (at least 60% of requirement)
      const threshold = Math.max(5, answers.storage_needed_gb * 0.6);
      const fallbackMatches = allPlans.filter(p => {
        const diskspace = p.diskspace;
        if (diskspace === 'unlimited' || diskspace === 'Unlimited') return true;
        const storage = parseInt(diskspace);
        return storage >= threshold;
      });
      
      // Use fallback if it gives us more options
      if (fallbackMatches.length > storageMatches.length) {
        storageMatches = fallbackMatches;
        logger.info(`Using fallback with threshold ${threshold}GB: ${storageMatches.length} plans`);
      }
      
      // If still very few matches, be even more flexible (40%)
      if (storageMatches.length < 3) {
        const minThreshold = Math.max(5, answers.storage_needed_gb * 0.4);
        const minMatches = allPlans.filter(p => {
          const diskspace = p.diskspace;
          if (diskspace === 'unlimited' || diskspace === 'Unlimited') return true;
          const storage = parseInt(diskspace);
          return storage >= minThreshold;
        });
        
        if (minMatches.length > storageMatches.length) {
          storageMatches = minMatches;
          logger.info(`Using minimum threshold ${minThreshold}GB: ${storageMatches.length} plans`);
        }
      }
      
      // Last resort: use all plans
      if (storageMatches.length === 0) {
        storageMatches = allPlans;
        logger.info('No matches found, showing all available plans');
      }
    }
    
    logger.info(`After storage filter: ${storageMatches.length} plans`);
    
    /* 3. Filter by tier from websites_count (flexible filter) */
    let exactMatches;
    
    // Skip tier filtering if websites_count is null (user doesn't care about website count)
    if (answers.websites_count === null) {
      exactMatches = storageMatches;
      logger.info(`Skipping tier filter (websites_count is null): using all ${storageMatches.length} storage matches`);
    } else {
      let tierMatches = storageMatches.filter(p => getTierRank(getTierFromPlan(p)) >= getTierRank(minTier));
      
      // If tier filter is too restrictive, be more flexible
      exactMatches = tierMatches;
      if (tierMatches.length < 3) {
        // Try one tier lower
        const lowerTierRank = getTierRank(minTier) - 1;
        if (lowerTierRank >= 0) {
          const flexibleMatches = storageMatches.filter(p => getTierRank(getTierFromPlan(p)) >= lowerTierRank);
          if (flexibleMatches.length > tierMatches.length) {
            exactMatches = flexibleMatches;
            logger.info(`Tier filter too restrictive, using one tier lower: ${flexibleMatches.length} plans`);
          }
        }
        
        // If still too few, use all storage matches
        if (exactMatches.length < 3) {
          exactMatches = storageMatches;
          logger.info(`Using all storage matches for better selection: ${storageMatches.length} plans`);
        }
      }
      
      logger.info(`After tier filter: ${tierMatches.length} strict matches, using ${exactMatches.length} plans`);
    }

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

    /* 5. Apply other_requirements filter if provided */
    if (answers.other_requirements && answers.other_requirements.trim()) {
      logger.info('Applying other_requirements filter', { 
        requirements: answers.other_requirements 
      });
      
      // Filter and score plans based on other requirements
      exactMatches = filterPlansByRequirements(exactMatches, answers.other_requirements);
      
      logger.info(`After other_requirements filter: ${exactMatches.length} plans`);
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
      
      // Sort by requirements match score (if available), then confidence, then price
      finalPlans = plansWithConfidence
        .sort((a, b) => {
          // First priority: requirements match score (if other_requirements provided)
          if (a.requirementsMatchScore !== undefined && b.requirementsMatchScore !== undefined) {
            const reqDiff = b.requirementsMatchScore - a.requirementsMatchScore;
            if (Math.abs(reqDiff) > 5) return reqDiff;
          }
          
          // Second priority: confidence score
          const confDiff = b.confidence - a.confidence;
          if (Math.abs(confDiff) > 1) return confDiff;
          
          // Third priority: lower price for ties
          const priceA = parseFloat(a.pricing?.PKR?.monthly || a.pricing?.PKR?.annually / 12 || 999999);
          const priceB = parseFloat(b.pricing?.PKR?.monthly || b.pricing?.PKR?.annually / 12 || 999999);
          return priceA - priceB;
        })
        .slice(0, 3);
      
      logger.info(`Selected ${finalPlans.length} final plans from exact matches`);
      
      // Log confidence and requirements match stats
      if (finalPlans.length > 0) {
        const confidences = finalPlans.map(p => p.confidence);
        const avgConfidence = (confidences.reduce((a,b) => a+b, 0) / confidences.length).toFixed(2);
        
        const logData = {
          min: Math.min(...confidences),
          max: Math.max(...confidences),
          avg: avgConfidence,
          planCount: finalPlans.length
        };
        
        if (finalPlans[0].requirementsMatchScore !== undefined) {
          const reqScores = finalPlans.map(p => p.requirementsMatchScore);
          logData.requirementsScores = {
            min: Math.min(...reqScores),
            max: Math.max(...reqScores),
            avg: (reqScores.reduce((a,b) => a+b, 0) / reqScores.length).toFixed(2)
          };
        }
        
        logger.info('Confidence scores calculated', logData);
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
        
        const planCard = {
          name: plan.name || 'Unknown Plan',
          description: description,
          price: Math.round(pkrPrice),
          link: plan.link || 'https://portal.hostbreak.com'
        };
        
        // Include requirements match score if available
        if (plan.requirementsMatchScore !== undefined) {
          planCard.requirementsMatchScore = plan.requirementsMatchScore;
        }
        
        // Include matched capabilities if available
        if (plan.matchedCapabilities) {
          planCard.matchedCapabilities = plan.matchedCapabilities;
        }
        
        return planCard;
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