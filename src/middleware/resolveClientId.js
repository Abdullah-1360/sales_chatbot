const { callApi, getClientsDetails } = require('../services/whmcsService');

/**
 * Middleware to resolve clientId from domain or email
 * Adds clientId to req.body if found
 */
async function resolveClientId(req, res, next) {
  try {
    const body = req.body || {};
    
    // If clientId already exists, continue
    if (body.clientId) {
      return next();
    }

    const { domain, email } = body;

    // If neither domain nor email provided, continue (let endpoint handle validation)
    if (!domain && !email) {
      return next();
    }

    // CASE 1: Resolve from email
    if (email) {
      try {
        const clientData = await getClientsDetails({ email });
        
        if (clientData && clientData.userid) {
          req.body.clientId = String(clientData.userid);
          req.body._resolvedFrom = 'email';
          return next();
        }
        
        return res.status(404).json({
          success: false,
          error: 'No client found with that email address'
        });
      } catch (err) {
        return res.status(404).json({
          success: false,
          error: 'No client found with that email address'
        });
      }
    }

    // CASE 2: Resolve from domain
    if (domain) {
      try {
        // Try GetClientsDomains first (more specific for domains)
        const domainsData = await callApi('GetClientsDomains', { domain });
        
        if (domainsData && domainsData.domains) {
          // Handle both array and object with domain property
          const domainsRaw = domainsData.domains;
          const domains = domainsRaw.domain || domainsRaw;
          const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
          
          if (domainArray.length > 0) {
            // Check if multiple clients own this domain
            const uniqueUserIds = [...new Set(domainArray.map(d => String(d.userid)))];
            
            if (uniqueUserIds.length > 1) {
              return res.status(400).json({
                success: false,
                error: 'Multiple clients found for this domain. Please provide email or clientId for clarification.',
                clientIds: uniqueUserIds
              });
            }
            
            req.body.clientId = uniqueUserIds[0];
            req.body._resolvedFrom = 'domain';
            return next();
          }
        }
        
        // Fallback: Try GetClientsProducts with domain parameter
        const productsData = await callApi('GetClientsProducts', { domain });
        
        if (productsData && productsData.products) {
          const productsRaw = productsData.products;
          const products = productsRaw.product || productsRaw;
          const productArray = Array.isArray(products) ? products : (products ? [products] : []);
          
          if (productArray.length > 0) {
            // Check if multiple clients own products with this domain
            const uniqueUserIds = [...new Set(productArray.map(p => String(p.userid || p.clientid)))];
            
            if (uniqueUserIds.length > 1) {
              return res.status(400).json({
                success: false,
                error: 'Multiple clients found for this domain. Please provide email or clientId for clarification.',
                clientIds: uniqueUserIds
              });
            }
            
            req.body.clientId = uniqueUserIds[0];
            req.body._resolvedFrom = 'domain';
            return next();
          }
        }
        
        return res.status(404).json({
          success: false,
          error: 'No client found with that domain'
        });
      } catch (err) {
        return res.status(404).json({
          success: false,
          error: 'No client found with that domain'
        });
      }
    }

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Error resolving client information',
      details: err.message
    });
  }
}

module.exports = resolveClientId;
