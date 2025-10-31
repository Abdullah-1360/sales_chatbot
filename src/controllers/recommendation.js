const planMatcher = require('../services/planMatcher');
const whmcs      = require('../services/whmcs');
const Joi        = require('joi');

/* ---------- validation schema ---------- */
const bodySchema = Joi.object({
  purpose: Joi.string().valid('Blog', 'Business Site', 'Ecommerce', 'Portfolio', 'Other').required(),
  websites_count: Joi.string().required(), // ← accept any string
  tech_stack: Joi.string().valid('Linux', 'Windows').required(),
  cms: Joi.string().valid('WordPress', 'WooCommerce', 'None').required(),
  email_needed: Joi.boolean().required(),
  storage_needed_gb: Joi.number().integer().min(1).required(),
  monthly_budget: Joi.number().integer().min(0).required(),
  free_domain: Joi.boolean().required(),
  migrate_from_existing_host: Joi.boolean().required(),
  email_deliverability_priority: Joi.boolean().default(false)
});

/* ---------- main controller ---------- */
exports.recommend = async (req, res, next) => {
  console.log('🔍 Recommendation request received with body:', req.body);
  try {
    const answers = await bodySchema.validateAsync(req.body);
    const { gid, minTier } = planMatcher(answers);

    /* 1.  fetch products for determined group */
    let plans = await whmcs.getProductsByGid(gid);

    /* 2.  storage hard filter */
    plans = plans.filter(p => parseInt(p.diskspace) >= answers.storage_needed_gb);

    /* 3.  tier filter (entry ≤ mid ≤ upper) */
    const tierRank = { entry: 1, mid: 2, upper: 3 };
    plans = plans.filter(p => tierRank[tierOfPlan(p)] >= tierRank[minTier]);

    /* 4.  budget hard filter */
    plans = plans.map(p => ({ ...p, priceNum: Number(p.pricing.USD.monthly) }))
                 .filter(p => p.priceNum <= answers.monthly_budget);

    /* 5.  free-domain soft constraint */
    if (answers.free_domain) {
      const withDomain = plans.filter(p => p.freedomain);
      if (withDomain.length) plans = withDomain;   // keep only if any exist
    }

    if (!plans.length) return res.json({ matches: [] });

    /* 6.  return up-to-3 plans, cheapest first */
    plans.sort((a, b) => a.priceNum - b.priceNum);
    const three = plans.slice(0, 3);
    three.forEach(p => delete p.priceNum);

    res.json({ matches: three });
  } catch (e) {
    next(e);
  }
};

/* ---------- helper: map WHMCS plan → tier ---------- */
function tierOfPlan(product) {
  const name = product.name.toLowerCase();
  if (name.includes('starter') || name.includes('lite') || name.includes('basic')) return 'entry';
  if (name.includes('plus') || name.includes('standard')) return 'mid';
  return 'upper';   // pro, advanced, ultimate, enterprise, etc.
}