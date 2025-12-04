const { 
  getClientsProducts, 
  getClientsDomains 
} = require('../services/whmcsService');

const { 
  toMessageStatus,
  getServiceForClient,
  extractInvoiceIdFromText,
  amountFromInvoice,
  findRelatedUnpaidInvoice,
  getProductNamesList
} = require('../utils/helpers');

/**
 * Check service status for a domain or serviceId
 * Handles both domain registration and hosting product status
 */
exports.checkServiceStatus = async (req, res, next) => {
  console.log('[POST /api/serviceStatus]', { 
    clientId: req.body.clientId, 
    domain: req.body.domain, 
    serviceId: req.body.serviceId 
  });
  
  try {
    const { clientId, domain, serviceId } = req.body || {};
    
    // Validate required parameters
    if (!clientId || (!domain && !serviceId)) {
      console.log('✗ Missing required parameters');
      return res.status(400).json({ 
        success: false, 
        error: 'clientId and domain or serviceId required' 
      });
    }

    // Get service/product from WHMCS
    const svc = await getServiceForClient({ clientId, domain, serviceId });
    
    // Service not found
    if (!svc) {
      console.log('✗ Service not found');
      return res.status(404).json({ 
        success: false, 
        error: `I couldn't find a service with that ${domain ? 'domain' : 'ID'} on your account.` 
      });
    }

    const status = toMessageStatus(svc.status);
    const serviceName = svc.domain || svc.name || 'service';
    const nextDueDate = svc.nextduedate || svc.nextinvoicedate;
    const suspensionReason = svc.suspensionreason || '';
    
    // Check if this is a domain registration or hosting product
    const isDomainRegistration = svc.type === 'domain';
    
    // If domain provided, check both domain registration AND hosting status
    let domainStatus = null;
    let hostingStatus = null;
    
    if (domain && !serviceId) {
      // Check domain registration status
      try {
        const domainData = await getClientsDomains(clientId, { domain: domain });
        const domainsRaw = domainData.domains || [];
        const domains = domainsRaw.domain || domainsRaw;
        const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
        if (domainArray.length > 0) {
          domainStatus = {
            status: toMessageStatus(domainArray[0].status),
            nextDueDate: domainArray[0].nextduedate,
            expiryDate: domainArray[0].expirydate
          };
        }
      } catch (err) {
        // Domain registration not found, that's okay
      }
      
      // Check hosting product status - check ALL products for this domain
      try {
        const productsData = await getClientsProducts(clientId, { domain: domain });
        const productsRaw = productsData.products || {};
        const products = productsRaw.product || productsRaw;
        const productArray = Array.isArray(products) ? products : (products ? [products] : []);
        
        if (productArray.length > 0) {
          // Collect ALL products with their statuses
          const allProducts = productArray.map(p => ({
            id: p.id,
            name: p.name || p.productname,
            status: toMessageStatus(p.status),
            nextDueDate: p.nextduedate,
            suspensionReason: p.suspensionreason || ''
          }));
          
          // Count products by status
          const statusCounts = {
            Active: allProducts.filter(p => p.status === 'Active').length,
            Suspended: allProducts.filter(p => p.status === 'Suspended').length,
            Pending: allProducts.filter(p => p.status === 'Pending').length,
            Expired: allProducts.filter(p => p.status === 'Expired').length,
            Terminated: allProducts.filter(p => p.status === 'Terminated').length,
            Cancelled: allProducts.filter(p => p.status === 'Cancelled').length
          };
          
          // Find the most relevant hosting product status for primary message
          // Priority: Active > Suspended > Pending > Expired > Terminated/Cancelled
          let primaryProduct = null;
          
          primaryProduct = allProducts.find(p => p.status === 'Active');
          if (!primaryProduct) {
            primaryProduct = allProducts.find(p => p.status === 'Suspended');
          }
          if (!primaryProduct) {
            primaryProduct = allProducts.find(p => p.status === 'Pending');
          }
          if (!primaryProduct) {
            primaryProduct = allProducts.find(p => p.status === 'Expired');
          }
          if (!primaryProduct) {
            primaryProduct = allProducts[0];
          }
          
          hostingStatus = {
            status: primaryProduct.status,
            nextDueDate: primaryProduct.nextDueDate,
            suspensionReason: primaryProduct.suspensionReason,
            totalProducts: productArray.length,
            productId: primaryProduct.id,
            allProducts: allProducts,
            statusCounts: statusCounts
          };
        }
      } catch (err) {
        // No hosting found, that's okay
      }
    }
    
    console.log('→ Service:', serviceName, 'Status:', status, 
                domainStatus ? `Domain: ${domainStatus.status}` : '', 
                hostingStatus ? `Hosting: ${hostingStatus.status}${hostingStatus.totalProducts > 1 ? ` (${hostingStatus.totalProducts} products found)` : ''}` : '');

    // Import status handlers
    const statusHandlers = require('../services/statusHandlers');
    
    // Handle different status scenarios
    const result = await statusHandlers.handleServiceStatus({
      status,
      serviceName,
      nextDueDate,
      suspensionReason,
      domainStatus,
      hostingStatus,
      svc,
      clientId,
      domain,
      serviceId
    });
    
    if (result) {
      return res.json(result);
    }
    
    // Default fallback
    const message = `Your service ${serviceName} status is ${status}.`;
    
    return res.json({
      success: true,
      status: status,
      service: serviceName,
      nextDueDate: nextDueDate,
      billingIssue: false,
      actionRequired: null,
      message: message
    });

  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

module.exports = exports;
