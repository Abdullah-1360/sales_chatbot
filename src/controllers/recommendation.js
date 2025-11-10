const planMatcher = require('../services/planMatcher');
const whmcs      = require('../services/whmcs');
const Joi        = require('joi');
const { getTierFromPlan, getTierRank } = require('../utils/tierHelper');
const { findNearestNeighbors } = require('../services/nearestNeighbor');
const { calculateConfidence } = require('../services/confidenceScorer');
const { selectThreePlans } = require('../services/planSelector');

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
        case 'tech_stack':
          normalized[key] = 'Linux';
          break;
        case 'cms':
          normalized[key] = 'None';
          break;
        case 'email_needed':
        case 'free_domain':
        case 'migrate_from_existing_host':
        case 'email_deliverability_priority':
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
  // Make fields optional and provide sensible defaults so an empty body is accepted
  purpose: Joi.string().valid('Blog', 'Business Site', 'Ecommerce', 'Portfolio', 'Other', 'None').default('Blog'),
  websites_count: Joi.alternatives().try(
    Joi.string(),
    Joi.number()
  ).default('1'), // accept string or number, default to single site
  tech_stack: Joi.string().valid('Linux', 'Windows', 'None').default('Linux'),
  cms: Joi.string().valid('WordPress', 'WooCommerce', 'None').default('None'),
  email_needed: Joi.boolean().allow(null).default(false),
  storage_needed_gb: Joi.alternatives().try(
    Joi.number().integer().min(0),
    Joi.string()
  ).default(10),
  monthly_budget: Joi.alternatives().try(
    Joi.number().min(0),
    Joi.string()
  ).default(0),
  free_domain: Joi.boolean().allow(null).default(false),
  migrate_from_existing_host: Joi.boolean().allow(null).default(false),
  email_deliverability_priority: Joi.boolean().allow(null).default(false)
});

/* ---------- main controller ---------- */
exports.recommend = async (req, res, next) => {
  const clientTimeout = parseInt(req.headers['Timeout']) || 30000;
  console.log('🔍 Recommendation request received with body:', req.body);
  try {
    // Normalize None/null/NULL values before validation
    const normalizedBody = normalizeNoneValues(req.body);
    console.log('📝 Normalized body:', normalizedBody);
    
    const answers = await bodySchema.validateAsync(normalizedBody);
    const { gid, minTier } = planMatcher(answers);

    /* 1.  fetch products for determined group */
    let allPlans = await whmcs.getProductsByGid(gid);
    
    if (!allPlans.length) {
      console.log('⚠️  No plans found for GID:', gid);
      return res.json({ matches: [] });
    }

    /* 2.  Try exact match with hard filters first */
    let exactMatches = allPlans.filter(p => parseInt(p.diskspace) >= answers.storage_needed_gb);
    
    /* 3.  tier filter (entry ≤ mid ≤ upper) */
    exactMatches = exactMatches.filter(p => getTierRank(getTierFromPlan(p)) >= getTierRank(minTier));

    /* 4.  budget hard filter */
    exactMatches = exactMatches.filter(p => Number(p.pricing.USD.monthly) <= answers.monthly_budget);

    /* 5.  free-domain soft constraint */
    if (answers.free_domain) {
      const withDomain = exactMatches.filter(p => p.freedomain);
      if (withDomain.length) exactMatches = withDomain;
    }

    let finalPlans = [];
    
    if (exactMatches.length > 0) {
      /* Exact matches found - calculate confidence and select 3 plans */
      console.log(`✅ Found ${exactMatches.length} exact matches`);
      
      const plansWithConfidence = exactMatches.map(p => ({
        ...p,
        confidence: calculateConfidence(p, { ...answers, minTier })
      }));
      
      // Select 3 plans: best fit, one cheaper, one higher
      finalPlans = selectThreePlans(plansWithConfidence, answers.monthly_budget);
      
      // Log confidence stats
      if (finalPlans.length > 0) {
        const confidences = finalPlans.map(p => p.confidence);
        console.log(`📊 Confidence scores: min=${Math.min(...confidences)}, max=${Math.max(...confidences)}, avg=${(confidences.reduce((a,b) => a+b, 0) / confidences.length).toFixed(2)}`);
      }
      
    } else {
      /* No exact matches - use nearest neighbor within same GID */
      console.log('🔄 No exact matches, searching for nearest neighbors within GID:', gid);
      
      finalPlans = findNearestNeighbors(allPlans, { ...answers, minTier });
      
      if (finalPlans.length > 0) {
        const confidences = finalPlans.map(p => p.confidence);
        console.log(`📊 Nearest neighbor confidence scores: min=${Math.min(...confidences)}, max=${Math.max(...confidences)}, avg=${(confidences.reduce((a,b) => a+b, 0) / confidences.length).toFixed(2)}`);
      } else {
        console.log('⚠️  No viable nearest neighbors found (all below 40% confidence threshold)');
      }
    }

    res.json({ matches: finalPlans });
  } catch (e) {
    console.error('❌ Error in recommendation:', e);
    next(e);
  }
};

/* ---------- helper: map WHMCS plan → tier (deprecated - use tierHelper) ---------- */
// Kept for backward compatibility if needed elsewhere
function tierOfPlan(product) {
  return getTierFromPlan(product);
}