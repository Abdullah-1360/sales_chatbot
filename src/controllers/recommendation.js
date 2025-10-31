const planMatcher = require('../services/planMatcher');
const whmcs      = require('../services/whmcs');
const Joi        = require('joi');

/* ---------- validation schema ---------- */
const bodySchema = Joi.object({
  purpose: Joi.string().valid('Blog', 'Business Site', 'Ecommerce', 'Portfolio', 'Other').required(),
  websites_count: Joi.string().valid('1', '2-3', '4-10', '10+').required(),
  tech_stack: Joi.string().valid('Linux', 'Windows').required(),
  cms: Joi.string().valid('WordPress', 'WooCommerce', 'None').required(),
  email_needed: Joi.boolean().required(),
  storage_needed_gb: Joi.number().integer().min(1).required(),
  monthly_budget: Joi.number().integer().min(0).required(),
  free_domain: Joi.boolean().required(),
  migrate_from_existing_host: Joi.boolean().required(),
});

/* ---------- main controller ---------- */
exports.recommend = async (req, res, next) => {
  try {
    const answers = await bodySchema.validateAsync(req.body);

    /* 1.  choose WHMCS group */
    const { gid } = planMatcher(answers);

    /* 2.  fetch + primary filters */
    let plans = await whmcs.getProductsByGid(gid);
    plans = plans.filter(p => parseInt(p.diskspace) >= answers.storage_needed_gb);

    // convert price once for comparison (dollars)
    plans = plans.map(p => ({
      ...p,
      priceNum: Number(p.pricing.USD.monthly)
    }));
    plans = plans.filter(p => p.priceNum <= answers.monthly_budget);

    /* 3.  free-domain soft constraint */
    if (answers.free_domain) {
      const withDomain = plans.filter(p => p.freedomain);
      if (withDomain.length) plans = withDomain;
    }

    if (!plans.length) return res.json({ matches: [] });

    /* 4.  centre-middle slice → cheaper + mid + higher */
    plans.sort((a, b) => a.priceNum - b.priceNum);
    const mid   = Math.floor(plans.length / 2);
    const start = Math.max(0, mid - 1);
    const end   = Math.min(plans.length, mid + 2);
    const three = plans.slice(start, end);

    // strip helper before sending
    three.forEach(p => delete p.priceNum);
    res.json({ matches: three });
  } catch (e) {
    next(e);
  }
};