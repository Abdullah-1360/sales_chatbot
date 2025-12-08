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
    serviceId: req.body.serviceId,
    hasIssue: !!req.body.issue
  });
  
  try {
    const { clientId, domain, serviceId, issue } = req.body || {};
    
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
    
    // If billingIssue is false and issue is provided, create support ticket
    if (result && !result.billingIssue && issue) {
      console.log('→ Creating support ticket for non-billing issue');
      
      const { openTicket } = require('../services/whmcsService');
      
      const deptid = process.env.TECHSUPPORT_DEPTID;
      // Only use deptname if deptid is not provided (deptid takes priority)
      const deptname = deptid ? undefined : (process.env.TECHSUPPORT_DEPTNAME || 'Technical Support');
      const subject = `Issue with ${serviceName}`;
      
      // Build detailed ticket message
      let ticketMessage = `=== SERVICE ISSUE REPORTED ===\n`;
      ticketMessage += `Service: ${serviceName}\n`;
      ticketMessage += `Status: ${result.status}\n`;
      if (domain) {
        ticketMessage += `Domain: ${domain}\n`;
      }
      if (serviceId) {
        ticketMessage += `Service ID: ${serviceId}\n`;
      }
      if (result.domainStatus) {
        ticketMessage += `Domain Status: ${result.domainStatus}\n`;
      }
      if (result.hostingStatus) {
        ticketMessage += `Hosting Status: ${result.hostingStatus}\n`;
      }
      if (nextDueDate) {
        ticketMessage += `Next Due Date: ${nextDueDate}\n`;
      }
      
      ticketMessage += `\n=== ISSUE DESCRIPTION ===\n`;
      ticketMessage += String(issue);
      
      try {
        const ticket = await openTicket({
          deptid,
          deptname,
          subject,
          message: ticketMessage,
          clientid: clientId,
          priority: 'High',
          serviceid: svc.id
        });
        
        const ticketId = ticket.tid || ticket.ticketid || ticket.id;
        console.log('→ Support ticket created:', ticketId);
        
        // Add ticket info to response
        result.ticketCreated = true;
        result.ticketId = ticketId;
        result.message += ` I've opened a support ticket (#${ticketId}) for our technical team to investigate your issue.`;
        
      } catch (ticketError) {
        console.log('⚠️  Warning: Could not create support ticket:', ticketError.message);
        result.ticketCreated = false;
        result.ticketError = ticketError.message;
      }
    }
    
    if (result) {
      return res.json(result);
    }
    
    // Default fallback
    let message = `Your service ${serviceName} status is ${status}.`;
    
    // If issue provided but no result, create ticket anyway
    if (issue) {
      console.log('→ Creating support ticket for issue (default fallback)');
      
      const { openTicket } = require('../services/whmcsService');
      
      const deptid = process.env.TECHSUPPORT_DEPTID;
      // Only use deptname if deptid is not provided (deptid takes priority)
      const deptname = deptid ? undefined : (process.env.TECHSUPPORT_DEPTNAME || 'Technical Support');
      const subject = `Issue with ${serviceName}`;
      
      let ticketMessage = `=== SERVICE ISSUE REPORTED ===\n`;
      ticketMessage += `Service: ${serviceName}\n`;
      ticketMessage += `Status: ${status}\n`;
      if (domain) {
        ticketMessage += `Domain: ${domain}\n`;
      }
      if (serviceId) {
        ticketMessage += `Service ID: ${serviceId}\n`;
      }
      if (nextDueDate) {
        ticketMessage += `Next Due Date: ${nextDueDate}\n`;
      }
      
      ticketMessage += `\n=== ISSUE DESCRIPTION ===\n`;
      ticketMessage += String(issue);
      
      try {
        const ticket = await openTicket({
          deptid,
          deptname,
          subject,
          message: ticketMessage,
          clientid: clientId,
          priority: 'High',
          serviceid: svc.id
        });
        
        const ticketId = ticket.tid || ticket.ticketid || ticket.id;
        console.log('→ Support ticket created:', ticketId);
        
        message += ` I've opened a support ticket (#${ticketId}) for our technical team to investigate your issue.`;
        
        return res.json({
          success: true,
          status: status,
          service: serviceName,
          nextDueDate: nextDueDate,
          billingIssue: false,
          actionRequired: null,
          ticketCreated: true,
          ticketId: ticketId,
          message: message
        });
      } catch (ticketError) {
        console.log('⚠️  Warning: Could not create support ticket:', ticketError.message);
      }
    }
    
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

/**
 * Get all services/products for a client (email only)
 */
exports.getMyServices = async (req, res, next) => {
  console.log('[POST /api/myServices]', { 
    clientId: req.body.clientId,
    resolvedFrom: req.body._resolvedFrom
  });
  
  try {
    const { clientId } = req.body || {};
    
    if (!clientId) {
      console.log('✗ Missing clientId');
      return res.status(400).json({ 
        success: false, 
        error: 'email or clientId required' 
      });
    }

    // Get all products for client
    const productsData = await getClientsProducts(clientId);
    const productsRaw = productsData.products || {};
    const products = productsRaw.product || productsRaw;
    const productArray = Array.isArray(products) ? products : (products ? [products] : []);
    
    console.log(`→ Found ${productArray.length} products for client ${clientId}`);
    
    // Format products with essential info
    const formattedProducts = productArray.map(p => ({
      id: p.id,
      domain: p.domain,
      productName: p.name || p.productname,
      status: toMessageStatus(p.status),
      nextDueDate: p.nextduedate,
      billingCycle: p.billingcycle,
      amount: p.amount,
      registrationDate: p.regdate
    }));
    
    // Group by status
    const byStatus = {
      Active: formattedProducts.filter(p => p.status === 'Active'),
      Suspended: formattedProducts.filter(p => p.status === 'Suspended'),
      Pending: formattedProducts.filter(p => p.status === 'Pending'),
      Other: formattedProducts.filter(p => !['Active', 'Suspended', 'Pending'].includes(p.status))
    };
    
    return res.json({
      success: true,
      clientId: clientId,
      totalServices: productArray.length,
      services: formattedProducts,
      summary: {
        active: byStatus.Active.length,
        suspended: byStatus.Suspended.length,
        pending: byStatus.Pending.length,
        other: byStatus.Other.length
      },
      byStatus: byStatus
    });

  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Get all domains for a client (email only)
 */
exports.getMyDomains = async (req, res, next) => {
  console.log('[POST /api/myDomains]', { 
    clientId: req.body.clientId,
    resolvedFrom: req.body._resolvedFrom
  });
  
  try {
    const { clientId } = req.body || {};
    
    if (!clientId) {
      console.log('✗ Missing clientId');
      return res.status(400).json({ 
        success: false, 
        error: 'email or clientId required' 
      });
    }

    // Get all domains for client
    const domainsData = await getClientsDomains(clientId);
    const domainsRaw = domainsData.domains || {};
    const domains = domainsRaw.domain || domainsRaw;
    const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
    
    console.log(`→ Found ${domainArray.length} domains for client ${clientId}`);
    
    // Format domains with essential info
    const formattedDomains = domainArray.map(d => ({
      id: d.id,
      domain: d.domain || d.domainname,
      status: toMessageStatus(d.status),
      registrationDate: d.registrationdate,
      expiryDate: d.expirydate,
      nextDueDate: d.nextduedate,
      registrar: d.registrar
    }));
    
    // Group by status
    const byStatus = {
      Active: formattedDomains.filter(d => d.status === 'Active'),
      Expired: formattedDomains.filter(d => d.status === 'Expired'),
      Pending: formattedDomains.filter(d => d.status === 'Pending'),
      Other: formattedDomains.filter(d => !['Active', 'Expired', 'Pending'].includes(d.status))
    };
    
    return res.json({
      success: true,
      clientId: clientId,
      totalDomains: domainArray.length,
      domains: formattedDomains,
      summary: {
        active: byStatus.Active.length,
        expired: byStatus.Expired.length,
        pending: byStatus.Pending.length,
        other: byStatus.Other.length
      },
      byStatus: byStatus
    });

  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Get complete account overview (email only)
 * Returns a single array with id and name only
 */
exports.getMyAccount = async (req, res, next) => {
  console.log('[POST /api/myAccount]', { 
    clientId: req.body.clientId,
    resolvedFrom: req.body._resolvedFrom
  });
  
  try {
    const { clientId } = req.body || {};
    
    if (!clientId) {
      console.log('✗ Missing clientId');
      return res.status(400).json({ 
        success: false, 
        error: 'email or clientId required' 
      });
    }

    // Fetch products and domains in parallel
    const [productsData, domainsData] = await Promise.all([
      getClientsProducts(clientId).catch(() => ({ products: [] })),
      getClientsDomains(clientId).catch(() => ({ domains: [] }))
    ]);
    
    // Parse products
    const productsRaw = productsData.products || {};
    const products = productsRaw.product || productsRaw;
    const productArray = Array.isArray(products) ? products : (products ? [products] : []);
    
    // Parse domains
    const domainsRaw = domainsData.domains || {};
    const domains = domainsRaw.domain || domainsRaw;
    const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
    
    console.log(`→ Found ${productArray.length} products and ${domainArray.length} domains for client ${clientId}`);
    
    // Create single array with id and name only
    const items = [];
    
    // Add services (use product name)
    productArray.forEach(p => {
      items.push({
        id: p.id,
        name: p.name || p.productname || p.domain || `Service #${p.id}`
      });
    });
    
    // Add domains (use domain name)
    domainArray.forEach(d => {
      items.push({
        id: d.id,
        name: d.domain || d.domainname || `Domain #${d.id}`
      });
    });
    
    console.log(`→ Returning ${items.length} total items`);
    
    return res.json({
      success: true,
      clientId: clientId,
      totalItems: items.length,
      items: items
    });

  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

module.exports = exports;
