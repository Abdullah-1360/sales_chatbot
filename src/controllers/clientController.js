const { getClientsProducts, getClientsDomains } = require('../services/whmcsService');

/**
 * Get client's products
 */
exports.getClientProducts = async (req, res, next) => {
  console.log(`[GET /clients/${req.params.clientId}/products]`, req.query);
  try {
    const { status } = req.query;
    const data = await getClientsProducts(req.params.clientId, status ? { status } : {});
    const products = data.products?.product || data.products || [];
    const count = Array.isArray(products) ? products.length : (products ? 1 : 0);
    console.log('→ Found:', count, 'products');
    res.json({ ok: true, ...data });
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Get client's domains
 */
exports.getClientDomains = async (req, res, next) => {
  console.log(`[GET /clients/${req.params.clientId}/domains]`, req.query);
  try {
    const { status } = req.query;
    const data = await getClientsDomains(req.params.clientId, status ? { status } : {});
    const domains = data.domains || [];
    const count = Array.isArray(domains) ? domains.length : (domains ? 1 : 0);
    console.log('→ Found:', count, 'domains');
    res.json({ ok: true, ...data });
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Get client's service status overview
 */
exports.getClientServiceStatus = async (req, res, next) => {
  console.log(`[GET /clients/${req.params.clientId}/service-status]`);
  try {
    const [products, domains] = await Promise.all([
      getClientsProducts(req.params.clientId),
      getClientsDomains(req.params.clientId)
    ]);
    
    // Handle products - can be array or single object
    const productList = products.products?.product || products.products || [];
    const productArray = Array.isArray(productList) ? productList : [productList];
    const productStatuses = productArray.map(p => ({ 
      id: p.id, 
      name: p.name, 
      status: p.status 
    }));
    
    // Handle domains - can be array or single object
    const domainList = domains.domains?.domain || domains.domains || [];
    const domainArray = Array.isArray(domainList) ? domainList : [domainList];
    const domainStatuses = domainArray.map(d => ({ 
      id: d.id, 
      domain: d.domainname || d.domain, 
      status: d.status 
    }));
    
    console.log('→ Products:', productStatuses.length, 'Domains:', domainStatuses.length);
    res.json({ ok: true, products: productStatuses, domains: domainStatuses });
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

module.exports = exports;
