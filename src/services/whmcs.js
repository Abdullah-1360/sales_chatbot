const axios = require('axios');
const NodeCache = require('node-cache');
const cfg = require('../config');
const fixture = require('../_fixtures/whmcs-products.json');

const cache = new NodeCache({ stdTTL: cfg.WHMCS_CACHE_TTL });

async function callWhmcs(action, params = {}) {
  if (cfg.USE_FIXTURE) return fixture;

  const qs = new URLSearchParams({
    api_user: cfg.WHMCS_API_USER,
    api_pass: cfg.WHMCS_API_PASS,
    action,
    response_format: 'json',
    ...params,
  }).toString();

  const key = `${action}:${JSON.stringify(params)}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const { data } = await axios.post(cfg.WHMCS_URL, qs, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (data.result !== 'success') throw new Error(`WHMCS: ${data.message}`);
    cache.set(key, data);
    return data;
  } catch (err) {
    console.warn('WHMCS call failed, using fixture', err.message);
    return fixture;
  }
}
exports.getProductsByGid = async (gid) => {
  const data = await callWhmcs('GetProducts', { gid, hidden: 0 });
  // keep only products that really belong to the requested group
  return (data.products?.product || []).filter(p => String(p.gid) === String(gid));
};