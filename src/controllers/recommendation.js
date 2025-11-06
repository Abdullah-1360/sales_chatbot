const planMatcher = require('../services/planMatcher');
const whmcs      = require('../services/whmcs');
const Joi        = require('joi');
const { getTierFromPlan, getTierRank } = require('../utils/tierHelper');
const { findNearestNeighbors } = require('../services/nearestNeighbor');
const { calculateConfidence } = require('../services/confidenceScorer');
const { selectThreePlans } = require('../services/planSelector');

/* ---------- validation schema ---------- */
const bodySchema = Joi.object({
  // Make fields optional and provide sensible defaults so an empty body is accepted
  purpose: Joi.string().valid('Blog', 'Business Site', 'Ecommerce', 'Portfolio', 'Other').default('Blog'),
  websites_count: Joi.string().default('1'), // accept any string, default to single site
  tech_stack: Joi.string().valid('Linux', 'Windows').default('Linux'),
  cms: Joi.string().valid('WordPress', 'WooCommerce', 'None').default('None'),
  email_needed: Joi.boolean().allow(null).default(false),
  storage_needed_gb: Joi.number().integer().min(1).default(10),
  monthly_budget: Joi.number().integer().min(0).default(0),
  free_domain: Joi.boolean().default(false),
  migrate_from_existing_host: Joi.boolean().default(false),
  email_deliverability_priority: Joi.boolean().default(false)
});

/* ---------- main controller ---------- */
exports.recommend = async (req, res, next) => {
  const clientTimeout = parseInt(req.headers['Timeout']) || 30000;
  console.log('🔍 Recommendation request received with body:', req.body);
  try {
    const answers = await bodySchema.validateAsync(req.body);
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