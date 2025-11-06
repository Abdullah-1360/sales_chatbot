const axios = require('axios');
const NodeCache = require('node-cache');
const cfg = require('../config');
const Product = require('../models/Product');

const cache = new NodeCache({ stdTTL: cfg.WHMCS_CACHE_TTL });

// Load fixtures for test environment to avoid external HTTP calls
let testFixtures = null;
if (process.env.NODE_ENV === 'test') {
  try {
    testFixtures = require('../_fixtures/whmcs-products.json');
  } catch (err) {
    // ignore - tests may not include fixtures
    testFixtures = null;
  }
}

async function callWhmcs(action, params = {}) {
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
    console.error('WHMCS API call failed:', err.message);
    throw err;
  }
}

/**
 * Get products by GID from MongoDB
 * Falls back to WHMCS API if USE_MONGODB is false
 */
exports.getProductsByGid = async (gid) => {
  const useMongoDB = process.env.USE_MONGODB !== 'false'; // Default to true

  // If running tests, prefer fixture data to avoid external API calls
  if (process.env.NODE_ENV === 'test' && testFixtures) {
    const products = (testFixtures.products?.product || []).filter(p => String(p.gid) === String(gid));
    return products.map(p => ({
      pid: p.pid,
      gid: p.gid,
      name: p.name,
      description: p.description,
      diskspace: p.diskspace,
      freedomain: p.freedomain,
      pricing: p.pricing,
      link: p.link
    }));
  }

  if (useMongoDB) {
    try {
      // Fetch from MongoDB
      const products = await Product.find({ gid: String(gid) }).lean();
      
      // Transform to match WHMCS API format for backward compatibility
      return products.map(p => ({
        pid: p.pid,
        gid: p.gid,
        name: p.name,
        description: p.description,
        diskspace: p.diskspace,
        freedomain: p.freedomain,
        pricing: p.pricing,
        link: p.link
      }));
    } catch (err) {
      console.error('MongoDB query failed, falling back to WHMCS API:', err.message);
      // Fall through to WHMCS API call
    }
  }

  // Fallback to WHMCS API
  const data = await callWhmcs('GetProducts', { gid, hidden: 0 });
  return (data.products?.product || []).filter(p => String(p.gid) === String(gid));
};