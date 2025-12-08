const { getInvoice, getInvoices, getClientsProducts, getClientsDomains } = require('../services/whmcsService');

/**
 * Convert WHMCS status to message-friendly status
 */
function toMessageStatus(status) {
  if (!status) return 'Unknown';
  return status;
}

/**
 * Get service/product for a client by serviceId or domain
 */
async function getServiceForClient({ clientId, domain, serviceId }) {
  if (serviceId) {
    const data = await getClientsProducts(clientId, { serviceid: serviceId });
    const items = data.products?.product || data.products || [];
    return items.length ? items[0] : null;
  }
  
  if (domain) {
    // First try hosting products with domain filter (more efficient)
    const data = await getClientsProducts(clientId, { domain: domain });
    const items = data.products?.product || data.products || [];
    
    if (items.length > 0) {
      // If multiple matches, prefer Active over others
      if (items.length > 1) {
        const active = items.find(m => m.status === 'Active');
        if (active) return active;
        
        // Otherwise prefer Suspended over Terminated/Cancelled
        const suspended = items.find(m => m.status === 'Suspended');
        if (suspended) return suspended;
      }
      
      return items[0];
    }
    
    // FALLBACK: Try domain registrations (if not found in hosting products)
    const domainData = await getClientsDomains(clientId, { domain: domain });
    const domainsRaw = domainData.domains || [];
    // Handle both array and object with domain property
    const domains = domainsRaw.domain || domainsRaw;
    const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
    
    if (domainArray.length > 0) {
      // Convert domain object to service-like object for consistency
      const domainObj = domainArray[0];
      return {
        id: domainObj.id,
        domain: domainObj.domainname || domainObj.domain,
        status: domainObj.status,
        nextduedate: domainObj.nextduedate,
        registrationdate: domainObj.registrationdate,
        expirydate: domainObj.expirydate,
        type: 'domain', // Mark as domain registration
        ...domainObj
      };
    }
  }
  
  return null;
}

/**
 * Get domain for a client
 */
async function getDomainForClient({ clientId, domain }) {
  if (!domain) return null;
  const data = await getClientsDomains(clientId, { domain });
  const items = data.domains || [];
  return items.length ? items[0] : null;
}

/**
 * Extract invoice ID from text (e.g., suspension reason)
 */
function extractInvoiceIdFromText(text) {
  if (!text) return null;
  const m = String(text).match(/invoice\s*#?(\d+)/i);
  return m ? m[1] : null;
}

/**
 * Calculate amount due from invoice
 */
function amountFromInvoice(inv) {
  const total = inv.total || inv.amount || inv.subtotal;
  if (inv.balance !== undefined) return Number(inv.balance);
  if (total !== undefined && inv.amountpaid !== undefined) {
    const due = Number(total) - Number(inv.amountpaid);
    return Number.isFinite(due) ? due : Number(total);
  }
  return Number(total) || 0;
}

/**
 * Find related unpaid invoice for a service or domain
 * Properly parses invoice items and matches by relid (related ID)
 */
async function findRelatedUnpaidInvoice(clientId, { domain, serviceId, domainId }) {
  const list = await getInvoices({ userid: clientId, status: 'Unpaid', limitnum: 50 });
  const arr = (list.invoices && (list.invoices.invoice || list.invoices.invoices)) || [];
  
  for (const inv of arr) {
    const id = inv.id || inv.invoiceid || inv.invoicenum;
    if (!id) continue;
    
    try {
      const detail = await getInvoice(id);
      
      // Parse invoice items
      const items = detail.items?.item || [];
      const itemArray = Array.isArray(items) ? items : (items ? [items] : []);
      
      // Check each item for a match
      for (const item of itemArray) {
        const itemRelId = String(item.relid || '');
        const itemType = String(item.type || '').toLowerCase();
        const itemDescription = String(item.description || '').toLowerCase();
        
        // Match by service ID (for hosting/services)
        if (serviceId && itemRelId === String(serviceId)) {
          console.log(`→ Found invoice #${id} with matching service ID ${serviceId} (type: ${itemType})`);
          return detail;
        }
        
        // Match by domain ID (for domain registrations)
        if (domainId && itemRelId === String(domainId)) {
          console.log(`→ Found invoice #${id} with matching domain ID ${domainId} (type: ${itemType})`);
          return detail;
        }
        
        // Fallback: Match by domain name in description
        if (domain && itemDescription.includes(String(domain).toLowerCase())) {
          console.log(`→ Found invoice #${id} with domain "${domain}" in description`);
          return detail;
        }
      }
    } catch (err) {
      console.log(`→ Error checking invoice ${id}:`, err.message);
    }
  }
  
  return null;
}

/**
 * Generate product names list for messages
 */
function getProductNamesList(hostingStatus, statusFilter = null) {
  if (!hostingStatus || !hostingStatus.allProducts) return '';
  
  let products = hostingStatus.allProducts;
  if (statusFilter) {
    products = products.filter(p => statusFilter.includes(p.status));
  }
  
  if (products.length === 0) return '';
  if (products.length === 1) return products[0].name;
  if (products.length === 2) return `${products[0].name} and ${products[1].name}`;
  
  // More than 2 products
  const names = products.map(p => p.name);
  const lastProduct = names.pop();
  return `${names.join(', ')}, and ${lastProduct}`;
}

module.exports = {
  toMessageStatus,
  getServiceForClient,
  getDomainForClient,
  extractInvoiceIdFromText,
  amountFromInvoice,
  findRelatedUnpaidInvoice,
  getProductNamesList
};
