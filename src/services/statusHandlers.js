const { 
  findRelatedUnpaidInvoice,
  amountFromInvoice,
  getProductNamesList,
  extractInvoiceIdFromText
} = require('../utils/helpers');

const { getInvoice } = require('./whmcsService');

/**
 * Main handler for service status logic
 */
async function handleServiceStatus(params) {
  const {
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
  } = params;

  // CASE 1: ACTIVE SERVICE
  if (status === 'Active') {
    return handleActiveService(params);
  }

  // CASE 2: CHECK FOR DOMAIN AND HOSTING STATUS COMBINATIONS
  if (domainStatus && hostingStatus) {
    const result = await handleCombinedStatus(params);
    if (result) return result;
  }

  // CASE 3: ONLY DOMAIN EXISTS (no hosting)
  if (domainStatus && !hostingStatus) {
    return handleDomainOnly(params);
  }

  // CASE 4: ONLY HOSTING EXISTS (no domain registration)
  if (!domainStatus && hostingStatus) {
    const result = await handleHostingOnly(params);
    if (result) return result;
  }

  // CASE 5: SUSPENDED SERVICE
  if (status === 'Suspended') {
    return await handleSuspendedService(params);
  }

  // CASE 6: TERMINATED/CANCELLED SERVICE
  if (status === 'Terminated' || status === 'Cancelled') {
    return handleTerminatedService(params);
  }

  // CASE 7: PENDING SERVICE
  if (status === 'Pending') {
    return handlePendingService(params);
  }

  return null; // Let controller handle default
}

/**
 * Handle active service status
 */
function handleActiveService(params) {
  const { serviceName, nextDueDate, domainStatus, hostingStatus } = params;
  
  let message = '';
  let combinedStatus = 'Active';
  
  // Check if both domain and hosting exist
  if (domainStatus && hostingStatus) {
    if (domainStatus.status === 'Active' && hostingStatus.status === 'Active') {
      message = `Your domain and hosting for ${serviceName} are both Active. Next renewal is due on ${nextDueDate || domainStatus.nextDueDate}.`;
      
      // Add info about multiple products if applicable
      if (hostingStatus.totalProducts > 1) {
        const activeProducts = getProductNamesList(hostingStatus, ['Active']);
        const inactiveCount = hostingStatus.totalProducts - hostingStatus.statusCounts.Active;
        
        if (inactiveCount > 0) {
          message += ` Your active hosting: ${activeProducts}. You also have ${inactiveCount} inactive product${inactiveCount > 1 ? 's' : ''} (old services).`;
        } else {
          message += ` Active products: ${activeProducts}.`;
        }
      }
    } else if (domainStatus.status !== 'Active' && hostingStatus.status === 'Active') {
      combinedStatus = 'Partial';
      message = `Your hosting for ${serviceName} is Active, but your domain is ${domainStatus.status}. Domain renewal due: ${domainStatus.nextDueDate}.`;
    } else if (domainStatus.status === 'Active' && hostingStatus.status !== 'Active') {
      combinedStatus = 'Partial';
      message = `Your domain for ${serviceName} is Active, but your hosting is ${hostingStatus.status}. Hosting renewal due: ${hostingStatus.nextDueDate}.`;
    }
  } else if (domainStatus && !hostingStatus) {
    // Domain only
    message = `Your domain ${serviceName} is Active. Next renewal is due on ${domainStatus.nextDueDate}.`;
  } else if (hostingStatus && !domainStatus) {
    // Hosting only
    message = `Your hosting for ${serviceName} is Active. Next renewal is due on ${hostingStatus.nextDueDate}.`;
    
    // Add info about multiple products if applicable
    if (hostingStatus.totalProducts > 1) {
      const activeProducts = getProductNamesList(hostingStatus, ['Active']);
      const inactiveCount = hostingStatus.totalProducts - hostingStatus.statusCounts.Active;
      
      if (inactiveCount > 0) {
        message += ` Your active hosting: ${activeProducts}. You also have ${inactiveCount} inactive product${inactiveCount > 1 ? 's' : ''} (old services).`;
      } else {
        message += ` Active products: ${activeProducts}.`;
      }
    }
  } else {
    // Single service (original logic)
    message = nextDueDate 
      ? `Your hosting for ${serviceName} is Active. It's fully paid and next renewal is due on ${nextDueDate}.`
      : `Your service ${serviceName} is Active and fully operational.`;
  }
  
  return {
    success: true,
    status: combinedStatus,
    service: serviceName,
    domainStatus: domainStatus ? domainStatus.status : null,
    hostingStatus: hostingStatus ? hostingStatus.status : null,
    nextDueDate: nextDueDate,
    billingIssue: false,
    actionRequired: null,
    message: message
  };
}

/**
 * Handle combined domain and hosting status
 */
async function handleCombinedStatus(params) {
  const { serviceName, domainStatus, hostingStatus, clientId } = params;
  
  const domainInactive = ['Suspended', 'Expired', 'Cancelled', 'Terminated', 'Pending'].includes(domainStatus.status);
  const hostingInactive = ['Suspended', 'Expired', 'Cancelled', 'Terminated', 'Pending'].includes(hostingStatus.status);
  
  // BOTH INACTIVE
  if (domainInactive && hostingInactive) {
    let message = `Both your domain and hosting for ${serviceName} are inactive. Domain status: ${domainStatus.status}, Hosting status: ${hostingStatus.status}. Please contact support or renew your services to restore access.`;
    
    // Add details about multiple products if applicable
    if (hostingStatus.totalProducts > 1) {
      const inactiveProducts = getProductNamesList(hostingStatus, ['Suspended', 'Expired', 'Terminated', 'Cancelled']);
      message += ` Affected products: ${inactiveProducts}.`;
    }
    
    return {
      success: true,
      status: 'Inactive',
      service: serviceName,
      domainStatus: domainStatus.status,
      hostingStatus: hostingStatus.status,
      billingIssue: true,
      actionRequired: 'payment',
      message: message
    };
  }
  
  // ONLY DOMAIN INACTIVE
  if (domainInactive && !hostingInactive) {
    let message = `Your domain ${serviceName} is ${domainStatus.status}, but your hosting is ${hostingStatus.status}. Please renew your domain to avoid losing it.`;
    
    // Add details about multiple products if applicable
    if (hostingStatus.totalProducts > 1) {
      const activeProducts = getProductNamesList(hostingStatus, ['Active']);
      message += ` Active hosting: ${activeProducts}.`;
    }
    
    return {
      success: true,
      status: 'Partial',
      service: serviceName,
      domainStatus: domainStatus.status,
      hostingStatus: hostingStatus.status,
      billingIssue: true,
      actionRequired: 'renew_domain',
      message: message
    };
  }
  
  // ONLY HOSTING INACTIVE
  if (!domainInactive && hostingInactive) {
    let message = `Your hosting for ${serviceName} is ${hostingStatus.status}, but your domain is ${domainStatus.status}. Please renew your hosting to restore service.`;
    
    // Add product names
    if (hostingStatus.totalProducts > 1) {
      const inactiveProducts = getProductNamesList(hostingStatus, ['Suspended', 'Expired', 'Terminated', 'Cancelled']);
      message += ` Affected products: ${inactiveProducts}.`;
    } else if (hostingStatus.allProducts && hostingStatus.allProducts.length > 0) {
      message += ` Product: ${hostingStatus.allProducts[0].name}.`;
    }
    
    const response = {
      success: true,
      status: 'Partial',
      service: serviceName,
      domainStatus: domainStatus.status,
      hostingStatus: hostingStatus.status,
      billingIssue: true,
      actionRequired: 'renew_hosting',
      message: message
    };
    
    // If hosting is suspended, check for invoice details
    if (hostingStatus.status === 'Suspended') {
      await addInvoiceDetails(response, clientId, serviceName, hostingStatus);
    }
    
    return response;
  }
  
  return null;
}

/**
 * Handle domain-only status
 */
function handleDomainOnly(params) {
  const { serviceName, domainStatus } = params;
  
  const domainInactive = ['Suspended', 'Expired', 'Cancelled', 'Terminated'].includes(domainStatus.status);
  
  if (domainInactive) {
    const message = `Your domain ${serviceName} is ${domainStatus.status}. Please renew your domain to keep it active.`;
    return {
      success: true,
      status: domainStatus.status,
      service: serviceName,
      domainStatus: domainStatus.status,
      hostingStatus: null,
      billingIssue: true,
      actionRequired: 'renew_domain',
      message: message
    };
  }
  
  return null;
}

/**
 * Handle hosting-only status
 */
async function handleHostingOnly(params) {
  const { serviceName, hostingStatus, clientId } = params;
  
  const hostingInactive = ['Suspended', 'Expired', 'Cancelled', 'Terminated', 'Pending'].includes(hostingStatus.status);
  
  if (hostingInactive) {
    let message = `Your hosting for ${serviceName} is ${hostingStatus.status}. Please renew your hosting to restore service.`;
    
    // Add product name
    if (hostingStatus.allProducts && hostingStatus.allProducts.length > 0) {
      const productName = hostingStatus.allProducts[0].name;
      message += ` Product: ${productName}.`;
    }
    
    const response = {
      success: true,
      status: hostingStatus.status,
      service: serviceName,
      domainStatus: null,
      hostingStatus: hostingStatus.status,
      billingIssue: true,
      actionRequired: 'renew_hosting',
      message: message
    };
    
    // If suspended, check for invoice details
    if (hostingStatus.status === 'Suspended') {
      await addInvoiceDetails(response, clientId, serviceName, hostingStatus);
    }
    
    return response;
  }
  
  return null;
}

/**
 * Handle suspended service
 */
async function handleSuspendedService(params) {
  const { serviceName, nextDueDate, suspensionReason, svc, clientId, hostingStatus } = params;
  
  let invoiceId = null;
  let amountDue = null;
  let unpaidInvoice = null;
  let isBillingIssue = false;

  // Try to extract invoice ID from suspension reason
  const hintedId = extractInvoiceIdFromText(suspensionReason);
  if (hintedId) {
    try {
      unpaidInvoice = await getInvoice(hintedId);
      invoiceId = unpaidInvoice.invoiceid || unpaidInvoice.id;
      amountDue = amountFromInvoice(unpaidInvoice);
      isBillingIssue = true;
    } catch (err) {
      // Invoice from reason not found, continue searching
    }
  }

  // If no invoice found yet, search for unpaid invoices
  if (!unpaidInvoice) {
    unpaidInvoice = await findRelatedUnpaidInvoice(clientId, { 
      domain: svc.domain, 
      serviceId: svc.id 
    });
    
    if (unpaidInvoice) {
      invoiceId = unpaidInvoice.invoiceid || unpaidInvoice.id;
      amountDue = amountFromInvoice(unpaidInvoice);
      isBillingIssue = true;
    }
  }

  // Check if next due date is in the past (indicates overdue)
  if (!unpaidInvoice && nextDueDate) {
    const dueDate = new Date(nextDueDate);
    const now = new Date();
    if (dueDate < now) {
      // Service is overdue, likely billing issue even if we can't find invoice
      isBillingIssue = true;
    }
  }

  // SUSPENDED - BILLING ISSUE (Overdue Payment)
  if (isBillingIssue && invoiceId) {
    const amountDueNum = amountDue ? Number(amountDue) : 0;
    const amountFormatted = Number.isFinite(amountDueNum) ? amountDueNum.toFixed(2) : '0.00';
    
    // Calculate termination date (15 days from due date)
    let terminationWarning = '';
    let daysUntilTermination = null;
    if (nextDueDate) {
      const dueDate = new Date(nextDueDate);
      const terminationDate = new Date(dueDate);
      terminationDate.setDate(terminationDate.getDate() + 15);
      
      const now = new Date();
      const diffTime = terminationDate - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) {
        daysUntilTermination = diffDays;
        terminationWarning = ` Your service will be terminated in ${diffDays} day${diffDays !== 1 ? 's' : ''} if payment is not received.`;
      } else if (diffDays === 0) {
        terminationWarning = ' Your service will be terminated today if payment is not received.';
      } else {
        terminationWarning = ' Your service is overdue for termination.';
      }
    }
    
    let message = `Your service is Suspended due to non-payment of the renewal invoice. Please pay the outstanding invoice #${invoiceId} for PKR ${amountFormatted} to reactivate your hosting.${terminationWarning}`;
    
    // Add product name if available
    if (hostingStatus && hostingStatus.allProducts) {
      const suspendedProducts = getProductNamesList(hostingStatus, ['Suspended']);
      if (suspendedProducts) {
        message += ` Suspended product: ${suspendedProducts}.`;
      }
    }
    
    return {
      success: true,
      status: 'Suspended',
      service: serviceName,
      billingIssue: true,
      reason: suspensionReason || 'Overdue Invoice',
      invoiceId: invoiceId,
      amountDue: amountDueNum,
      daysUntilTermination: daysUntilTermination,
      actionRequired: 'payment',
      message: message
    };
  }

  // SUSPENDED - BILLING ISSUE (No specific invoice found)
  if (isBillingIssue && !invoiceId) {
    const message = `Your service is suspended (likely due to overdue payment). Please check your billing or let me know if you'd like to settle any unpaid invoices.`;
    
    return {
      success: true,
      status: 'Suspended',
      service: serviceName,
      billingIssue: true,
      reason: suspensionReason || 'Payment Issue',
      actionRequired: 'payment',
      message: message
    };
  }

  // SUSPENDED - OTHER REASON (TOS violation, abuse, manual suspension)
  if (suspensionReason && !isBillingIssue) {
    const message = `Your service is suspended by our team: Reason – ${suspensionReason}. Please contact support to resolve this.`;
    
    return {
      success: true,
      status: 'Suspended',
      service: serviceName,
      billingIssue: false,
      reason: suspensionReason,
      actionRequired: 'contact_support',
      message: message
    };
  }

  // SUSPENDED - UNKNOWN REASON
  const message = `Your service is suspended. Please contact our support team for assistance.`;
  
  return {
    success: true,
    status: 'Suspended',
    service: serviceName,
    billingIssue: false,
    reason: 'Unknown',
    actionRequired: 'contact_support',
    message: message
  };
}

/**
 * Handle terminated/cancelled service
 */
function handleTerminatedService(params) {
  const { status, serviceName, domainStatus, hostingStatus, svc } = params;
  
  // Check if we have separate domain and hosting status
  if (domainStatus && hostingStatus) {
    const domainTerminated = ['Terminated', 'Cancelled'].includes(domainStatus.status);
    const hostingTerminated = ['Terminated', 'Cancelled'].includes(hostingStatus.status);
    
    if (domainTerminated && hostingTerminated) {
      const message = `Both your domain and hosting for ${serviceName} have been terminated. They are no longer active.`;
      return {
        success: true,
        status: 'Terminated',
        service: serviceName,
        domainStatus: domainStatus.status,
        hostingStatus: hostingStatus.status,
        billingIssue: false,
        actionRequired: null,
        message: message
      };
    } else if (domainTerminated && !hostingTerminated) {
      const message = `Your domain ${serviceName} has been ${domainStatus.status.toLowerCase()}, but your hosting is ${hostingStatus.status}. Please contact support if you need to restore the domain.`;
      return {
        success: true,
        status: 'Partial',
        service: serviceName,
        domainStatus: domainStatus.status,
        hostingStatus: hostingStatus.status,
        billingIssue: false,
        actionRequired: 'contact_support',
        message: message
      };
    } else if (!domainTerminated && hostingTerminated) {
      const message = `Your hosting for ${serviceName} has been ${hostingStatus.status.toLowerCase()}, but your domain is ${domainStatus.status}. Please contact support if you need to restore the hosting.`;
      return {
        success: true,
        status: 'Partial',
        service: serviceName,
        domainStatus: domainStatus.status,
        hostingStatus: hostingStatus.status,
        billingIssue: false,
        actionRequired: 'contact_support',
        message: message
      };
    }
  }
  
  // Single service termination
  const terminationDate = svc.termination_date || svc.domainstatus;
  const message = terminationDate
    ? `This service was ${status.toLowerCase()} on ${terminationDate}. It is no longer active.`
    : `This service ${serviceName} is ${status.toLowerCase()}. It is no longer active.`;
  
  return {
    success: true,
    status: status,
    service: serviceName,
    billingIssue: false,
    terminationDate: terminationDate,
    actionRequired: null,
    message: message
  };
}

/**
 * Handle pending service
 */
function handlePendingService(params) {
  const { serviceName, domainStatus, hostingStatus } = params;
  
  // Check if we have separate domain and hosting status
  if (domainStatus && hostingStatus) {
    const domainPending = domainStatus.status === 'Pending';
    const hostingPending = hostingStatus.status === 'Pending';
    
    if (domainPending && hostingPending) {
      const message = `Both your domain and hosting for ${serviceName} are pending setup. They should be active soon.`;
      return {
        success: true,
        status: 'Pending',
        service: serviceName,
        domainStatus: domainStatus.status,
        hostingStatus: hostingStatus.status,
        billingIssue: false,
        actionRequired: null,
        message: message
      };
    } else if (domainPending && !hostingPending) {
      const message = `Your domain ${serviceName} is pending setup, but your hosting is ${hostingStatus.status}. The domain should be active soon.`;
      return {
        success: true,
        status: 'Partial',
        service: serviceName,
        domainStatus: domainStatus.status,
        hostingStatus: hostingStatus.status,
        billingIssue: false,
        actionRequired: null,
        message: message
      };
    } else if (!domainPending && hostingPending) {
      const message = `Your hosting for ${serviceName} is pending setup, but your domain is ${domainStatus.status}. The hosting should be active soon.`;
      return {
        success: true,
        status: 'Partial',
        service: serviceName,
        domainStatus: domainStatus.status,
        hostingStatus: hostingStatus.status,
        billingIssue: false,
        actionRequired: null,
        message: message
      };
    }
  }
  
  // Single service pending
  const message = `Your order is still pending setup. It should be active soon; if it's taking too long, let us know.`;
  
  return {
    success: true,
    status: 'Pending',
    service: serviceName,
    billingIssue: false,
    actionRequired: null,
    message: message
  };
}

/**
 * Helper to add invoice details to response
 */
async function addInvoiceDetails(response, clientId, serviceName, hostingStatus) {
  try {
    const unpaidInvoice = await findRelatedUnpaidInvoice(clientId, { 
      domain: serviceName, 
      serviceId: hostingStatus.productId 
    });
    
    if (unpaidInvoice) {
      const invoiceId = unpaidInvoice.invoiceid || unpaidInvoice.id;
      const amountDue = amountFromInvoice(unpaidInvoice);
      const amountDueNum = amountDue ? Number(amountDue) : 0;
      const amountFormatted = Number.isFinite(amountDueNum) ? amountDueNum.toFixed(2) : '0.00';
      
      // Calculate termination warning
      let terminationWarning = '';
      let daysUntilTermination = null;
      if (hostingStatus.nextDueDate) {
        const dueDate = new Date(hostingStatus.nextDueDate);
        const terminationDate = new Date(dueDate);
        terminationDate.setDate(terminationDate.getDate() + 15);
        
        const now = new Date();
        const diffTime = terminationDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) {
          daysUntilTermination = diffDays;
          terminationWarning = ` Your service will be terminated in ${diffDays} day${diffDays !== 1 ? 's' : ''} if payment is not received.`;
        } else if (diffDays === 0) {
          terminationWarning = ' Your service will be terminated today if payment is not received.';
        } else {
          terminationWarning = ' Your service is overdue for termination.';
        }
      }
      
      // Update message with invoice details
      response.message = `Your hosting for ${serviceName} is Suspended due to non-payment. Please pay invoice #${invoiceId} for PKR ${amountFormatted} to reactivate.${terminationWarning}`;
      if (hostingStatus.allProducts && hostingStatus.allProducts.length > 0) {
        response.message += ` Product: ${hostingStatus.allProducts[0].name}.`;
      }
      
      response.invoiceId = invoiceId;
      response.amountDue = amountDueNum;
      response.dueDate = hostingStatus.nextDueDate;
      if (daysUntilTermination !== null) {
        response.daysUntilTermination = daysUntilTermination;
      }
    }
  } catch (err) {
    // Could not find invoice, keep original message
  }
}

module.exports = {
  handleServiceStatus
};
