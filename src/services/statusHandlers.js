const { 
  findRelatedUnpaidInvoice,
  amountFromInvoice,
  getProductNamesList,
  extractInvoiceIdFromText
} = require('../utils/helpers');

const { getInvoice } = require('./whmcsService');
const { getDNSStatus, performComprehensiveDNSLookup } = require('../utils/dnsChecker');

/**
 * Perform comprehensive DNS analysis for service status with workflow-based recommendations
 * @param {string} serviceName - Domain name
 * @param {Array} whmcsNameservers - WHMCS nameservers if available
 * @returns {Object} Enhanced DNS status with comprehensive records and workflow recommendations
 */
async function getComprehensiveDNSStatus(serviceName, whmcsNameservers = null) {
  try {
    // Get basic DNS status first
    const basicDNSStatus = await getDNSStatus(serviceName, whmcsNameservers);
    
    // If basic DNS lookup was successful, get comprehensive records with workflow
    if (basicDNSStatus.propagated && basicDNSStatus.dataSource === 'dns_lookup') {
      const comprehensiveDNS = await performComprehensiveDNSLookup(serviceName);
      
      return {
        ...basicDNSStatus,
        comprehensiveDNS: comprehensiveDNS,
        workflow: comprehensiveDNS.workflow, // Include workflow recommendations
        serverAnalysis: {
          websitePointsToOurServers: comprehensiveDNS.serverMatches.aRecordsMatchOurServers,
          emailPointsToOurServers: comprehensiveDNS.serverMatches.mxRecordsMatchOurServers,
          dnsPointsToOurServers: comprehensiveDNS.serverMatches.nsRecordsMatchOurServers,
          matchingARecords: comprehensiveDNS.serverMatches.matchingARecords,
          matchingMXRecords: comprehensiveDNS.serverMatches.matchingMXRecords,
          matchingNSRecords: comprehensiveDNS.serverMatches.matchingNSRecords
        }
      };
    }
    
    // Return basic status if comprehensive lookup not possible
    return basicDNSStatus;
    
  } catch (error) {
    console.log('⚠️ Comprehensive DNS analysis failed:', error.message);
    // Fallback to basic DNS status
    return await getDNSStatus(serviceName, whmcsNameservers);
  }
}

/**
 * Helper function to add server, domain, and DNS zone information to response objects
 */
function addServerAndDomainInfo(response, domainStatus, hostingStatus, dnsZoneAnalysis = null, reachabilityAnalysis = null) {
  // Add server information if available from hosting status
  if (hostingStatus) {
    if (hostingStatus.serverId) response.serverId = hostingStatus.serverId;
    if (hostingStatus.serverName) response.serverName = hostingStatus.serverName;
    if (hostingStatus.serverIP) response.serverIP = hostingStatus.serverIP;
    if (hostingStatus.serverHostname) response.serverHostname = hostingStatus.serverHostname;
    if (hostingStatus.productId) response.hostingProductId = hostingStatus.productId;
    if (hostingStatus.totalProducts > 1) response.hostingProducts = hostingStatus.totalProducts;
    if (hostingStatus.username) response.username = hostingStatus.username;
  }
  
  // Add domain information if available
  if (domainStatus) {
    if (domainStatus.nextDueDate) response.domainNextDue = domainStatus.nextDueDate;
    if (domainStatus.expiryDate) response.domainExpiry = domainStatus.expiryDate;
    if (domainStatus.nameservers && domainStatus.nameservers.length > 0) response.domainNameservers = domainStatus.nameservers;
    if (domainStatus.duplicateCount > 1) response.domainDuplicates = domainStatus.duplicateCount;
  }
  
  // Add DNS zone analysis if available
  if (dnsZoneAnalysis) {
    response.dnsZoneAnalysis = {
      expectedServerIP: dnsZoneAnalysis.expectedServerIP,
      currentARecords: dnsZoneAnalysis.currentARecords,
      aRecordMatchesServer: dnsZoneAnalysis.aRecordMatchesServer,
      zoneARecordIP: dnsZoneAnalysis.zoneARecordIP,
      zoneMatchesServer: dnsZoneAnalysis.zoneMatchesServer,
      dnsConsistent: dnsZoneAnalysis.dnsConsistent,
      issue: dnsZoneAnalysis.issue,
      recommendation: dnsZoneAnalysis.recommendation
    };
    
    // Add external DNS information if available
    if (dnsZoneAnalysis.dnsProvider) {
      response.dnsZoneAnalysis.dnsProvider = dnsZoneAnalysis.dnsProvider;
      response.dnsZoneAnalysis.providerName = dnsZoneAnalysis.providerName;
    }
    
    if (dnsZoneAnalysis.instructions) {
      response.dnsZoneAnalysis.instructions = dnsZoneAnalysis.instructions;
    }
    
    // Add nameserver control information
    if (dnsZoneAnalysis.usesOurNameservers !== undefined) {
      response.dnsZoneAnalysis.usesOurNameservers = dnsZoneAnalysis.usesOurNameservers;
    }
    
    // Add auto-fix information if available
    if (dnsZoneAnalysis.autoFixed) {
      response.dnsZoneAnalysis.autoFixed = true;
      response.dnsZoneAnalysis.autoFixMethod = dnsZoneAnalysis.autoFixMethod;
      response.dnsZoneAnalysis.autoFixMessage = dnsZoneAnalysis.autoFixMessage;
      if (dnsZoneAnalysis.oldIP) {
        response.dnsZoneAnalysis.oldIP = dnsZoneAnalysis.oldIP;
      }
    }
    
    // Add auto-fix attempt information if failed
    if (dnsZoneAnalysis.autoFixAttempted && !dnsZoneAnalysis.autoFixed) {
      response.dnsZoneAnalysis.autoFixAttempted = true;
      response.dnsZoneAnalysis.autoFixError = dnsZoneAnalysis.autoFixError;
    }
    
    // Add error information if DNS analysis failed
    if (dnsZoneAnalysis.error) {
      response.dnsZoneAnalysis.error = dnsZoneAnalysis.error;
    }
  }
  
  // Add reachability analysis if available
  if (reachabilityAnalysis) {
    response.reachabilityAnalysis = {
      domain: reachabilityAnalysis.domain,
      reachable: reachabilityAnalysis.reachable,
      method: reachabilityAnalysis.method,
      responseTime: reachabilityAnalysis.responseTime,
      statusCode: reachabilityAnalysis.statusCode,
      issue: reachabilityAnalysis.issue,
      recommendation: reachabilityAnalysis.recommendation
    };
    
    // Add detailed check results
    if (reachabilityAnalysis.ping) {
      response.reachabilityAnalysis.ping = reachabilityAnalysis.ping;
    }
    
    if (reachabilityAnalysis.http) {
      response.reachabilityAnalysis.http = reachabilityAnalysis.http;
    }
    
    if (reachabilityAnalysis.ssl) {
      response.reachabilityAnalysis.ssl = reachabilityAnalysis.ssl;
    }
    
    if (reachabilityAnalysis.https) {
      response.reachabilityAnalysis.https = reachabilityAnalysis.https;
    }
    
    // Add AutoSSL information if available
    if (reachabilityAnalysis.autoSSL) {
      response.reachabilityAnalysis.autoSSL = reachabilityAnalysis.autoSSL;
    }
    
    // Add error information if reachability check failed
    if (reachabilityAnalysis.error) {
      response.reachabilityAnalysis.error = reachabilityAnalysis.error;
    }
  }
  
  return response;
}

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
    dnsZoneAnalysis,
    svc,
    clientId,
    domain,
    serviceId
  } = params;

  // CASE 1: ACTIVE SERVICE
  if (status === 'Active') {
    return await handleActiveService(params);
  }

  // CASE 2: CHECK FOR DOMAIN AND HOSTING STATUS COMBINATIONS
  if (domainStatus && hostingStatus) {
    const result = await handleCombinedStatus(params);
    if (result) return result;
  }

  // CASE 3: ONLY DOMAIN EXISTS (no hosting)
  if (domainStatus && !hostingStatus) {
    const result = await handleDomainOnly(params);
    if (result) return result;
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
async function handleActiveService(params) {
  const { serviceName, nextDueDate, domainStatus, hostingStatus, dnsZoneAnalysis } = params;
  
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
  
  let response = {
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
  
  // Add server, domain, and DNS zone information
  response = addServerAndDomainInfo(response, domainStatus, hostingStatus, dnsZoneAnalysis, params.reachabilityAnalysis);
  
  // Add comprehensive DNS analysis for active services (helps with "site down" issues)
  if (serviceName && serviceName.includes('.')) {
    try {
      // Use WHMCS nameservers if available from domainStatus
      const whmcsNameservers = (domainStatus && domainStatus.nameservers) ? domainStatus.nameservers : null;
      const dnsStatus = await getComprehensiveDNSStatus(serviceName, whmcsNameservers);
      
      response.dnsStatus = {
        propagated: dnsStatus.propagated,
        usesOurNameservers: dnsStatus.usesOurNameservers,
        isExternalDNS: dnsStatus.isExternalDNS,
        diagnosis: dnsStatus.diagnosis,
        dataSource: dnsStatus.dataSource
      };
      
      // Add comprehensive DNS analysis if available
      if (dnsStatus.serverAnalysis) {
        response.dnsStatus.serverAnalysis = dnsStatus.serverAnalysis;
        response.dnsStatus.records = dnsStatus.comprehensiveDNS ? {
          A: dnsStatus.comprehensiveDNS.records.A,
          MX: dnsStatus.comprehensiveDNS.records.MX,
          NS: dnsStatus.comprehensiveDNS.records.NS
        } : null;
      }
      
      // Add DNS info to message if relevant
      if (!dnsStatus.propagated) {
        response.message += ` Note: ${dnsStatus.shortMessage}`;
      } else if (dnsStatus.isExternalDNS) {
        response.message += ` DNS Info: ${dnsStatus.shortMessage}`;
      }
      
      // Add workflow-based recommendations to message
      if (dnsStatus.workflow) {
        const workflow = dnsStatus.workflow;
        
        if (workflow.step === 'nameserver_mismatch_check_mx') {
          // Case 1: A record matches ✅ but nameserver doesn't ❌
          response.message += ` ⚠️ DNS CONFIGURATION: ${workflow.message}`;
          response.actionRequired = workflow.actionRequired;
          response.dnsIssue = true;
          response.registrar = workflow.registrar;
        } else if (workflow.step === 'a_record_mismatch_use_whm') {
          // Case 2: Nameserver matches ✅ but A record doesn't ❌
          response.message += ` ⚠️ DNS UPDATE NEEDED: ${workflow.message}`;
          response.actionRequired = workflow.actionRequired;
          response.dnsIssue = true;
        } else if (workflow.step === 'all_configured_correctly') {
          // Case 3: Both match ✅✅ - Perfect configuration
          response.message += ` ✅ DNS Configuration: ${workflow.message}`;
        } else if (workflow.step === 'both_mismatch_update_nameservers') {
          // Case 4: Both don't match ❌❌ - Update nameservers
          response.message += ` ℹ️ NAMESERVER UPDATE: ${workflow.message}`;
          response.actionRequired = workflow.actionRequired;
          response.registrar = workflow.registrar;
        }
      } else if (dnsStatus.serverAnalysis) {
        // Fallback to old analysis if workflow not available
        const analysis = dnsStatus.serverAnalysis;
        if (analysis.websitePointsToOurServers && analysis.emailPointsToOurServers) {
          response.message += ` Both website and email are configured with our servers.`;
        } else if (analysis.websitePointsToOurServers && !analysis.emailPointsToOurServers) {
          response.message += ` Website points to our servers, but email is managed elsewhere.`;
        } else if (!analysis.websitePointsToOurServers && analysis.emailPointsToOurServers) {
          response.message += ` Email points to our servers, but website is hosted elsewhere.`;
        } else if (!analysis.websitePointsToOurServers && !analysis.emailPointsToOurServers) {
          response.message += ` Neither website nor email are pointing to our servers.`;
        }
      }
    } catch (err) {
      // DNS check failed, don't break the response
      console.log('⚠️ DNS check failed for active service:', err.message);
    }
  }
  
  return response;
}

/**
 * Handle combined domain and hosting status
 */
async function handleCombinedStatus(params) {
  const { serviceName, domainStatus, hostingStatus, dnsZoneAnalysis, clientId } = params;
  
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
    
    let response = {
      success: true,
      status: 'Inactive',
      service: serviceName,
      domainStatus: domainStatus.status,
      hostingStatus: hostingStatus.status,
      billingIssue: true,
      actionRequired: 'payment',
      message: message
    };
    
    // Add server, domain, and DNS zone information
    return addServerAndDomainInfo(response, domainStatus, hostingStatus, dnsZoneAnalysis, params.reachabilityAnalysis);
  }
  
  // ONLY DOMAIN INACTIVE
  if (domainInactive && !hostingInactive) {
    let message = `Your domain ${serviceName} is ${domainStatus.status}, but your hosting is ${hostingStatus.status}. Please renew your domain to avoid losing it.`;
    
    // Add details about multiple products if applicable
    if (hostingStatus.totalProducts > 1) {
      const activeProducts = getProductNamesList(hostingStatus, ['Active']);
      message += ` Active hosting: ${activeProducts}.`;
    }
    
    const response = {
      success: true,
      status: 'Partial',
      service: serviceName,
      domainStatus: domainStatus.status,
      hostingStatus: hostingStatus.status,
      billingIssue: true,
      actionRequired: 'renew_domain',
      message: message
    };
    
    // Add comprehensive DNS check if hosting is active (helps with "site down" issues)
    if (hostingStatus.status === 'Active' && serviceName && serviceName.includes('.')) {
      try {
        // Use WHMCS nameservers if available from domainStatus
        const whmcsNameservers = (domainStatus && domainStatus.nameservers) ? domainStatus.nameservers : null;
        const dnsStatus = await getComprehensiveDNSStatus(serviceName, whmcsNameservers);
        
        response.dnsStatus = {
          propagated: dnsStatus.propagated,
          usesOurNameservers: dnsStatus.usesOurNameservers,
          isExternalDNS: dnsStatus.isExternalDNS,
          diagnosis: dnsStatus.diagnosis,
          dataSource: dnsStatus.dataSource
        };
        
        // Add comprehensive DNS analysis if available
        if (dnsStatus.serverAnalysis) {
          response.dnsStatus.serverAnalysis = dnsStatus.serverAnalysis;
          response.dnsStatus.records = dnsStatus.comprehensiveDNS ? {
            A: dnsStatus.comprehensiveDNS.records.A,
            MX: dnsStatus.comprehensiveDNS.records.MX,
            NS: dnsStatus.comprehensiveDNS.records.NS
          } : null;
        }
        
        // Add DNS info to message if relevant
        if (!dnsStatus.propagated) {
          response.message += ` DNS Note: ${dnsStatus.shortMessage}`;
        } else if (dnsStatus.isExternalDNS) {
          response.message += ` DNS Info: ${dnsStatus.shortMessage}`;
        }
        
        // Add server analysis to message
        if (dnsStatus.serverAnalysis) {
          const analysis = dnsStatus.serverAnalysis;
          if (analysis.websitePointsToOurServers) {
            response.message += ` Website points to our servers.`;
          } else {
            response.message += ` Website points elsewhere.`;
          }
        }
      } catch (err) {
        console.log('⚠️ DNS check failed for partial service:', err.message);
      }
    }
    
    return response;
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
    
    // Add comprehensive DNS check if domain is active (helps with "site down" issues)
    if (domainStatus.status === 'Active' && serviceName && serviceName.includes('.')) {
      try {
        // Use WHMCS nameservers from domainStatus
        const whmcsNameservers = domainStatus.nameservers || null;
        const dnsStatus = await getComprehensiveDNSStatus(serviceName, whmcsNameservers);
        
        response.dnsStatus = {
          propagated: dnsStatus.propagated,
          usesOurNameservers: dnsStatus.usesOurNameservers,
          isExternalDNS: dnsStatus.isExternalDNS,
          diagnosis: dnsStatus.diagnosis,
          dataSource: dnsStatus.dataSource
        };
        
        // Add comprehensive DNS analysis if available
        if (dnsStatus.serverAnalysis) {
          response.dnsStatus.serverAnalysis = dnsStatus.serverAnalysis;
          response.dnsStatus.records = dnsStatus.comprehensiveDNS ? {
            A: dnsStatus.comprehensiveDNS.records.A,
            MX: dnsStatus.comprehensiveDNS.records.MX,
            NS: dnsStatus.comprehensiveDNS.records.NS
          } : null;
        }
        
        // Add DNS info to message if relevant
        if (!dnsStatus.propagated) {
          response.message += ` DNS Note: ${dnsStatus.shortMessage}`;
        } else if (dnsStatus.isExternalDNS) {
          response.message += ` DNS Info: ${dnsStatus.shortMessage}`;
        }
        
        // Add server analysis to message
        if (dnsStatus.serverAnalysis) {
          const analysis = dnsStatus.serverAnalysis;
          if (analysis.websitePointsToOurServers) {
            response.message += ` Website points to our servers.`;
          }
          if (analysis.emailPointsToOurServers) {
            response.message += ` Email is configured with our servers.`;
          }
        }
      } catch (err) {
        console.log('⚠️ DNS check failed for partial service:', err.message);
      }
    }
    
    return response;
  }
  
  return null;
}

/**
 * Handle domain-only status
 */
async function handleDomainOnly(params) {
  const { serviceName, domainStatus, clientId } = params;
  
  const domainInactive = ['Suspended', 'Expired', 'Cancelled', 'Terminated'].includes(domainStatus.status);
  
  // Handle active domain-only case with DNS checking
  if (!domainInactive && domainStatus.status === 'Active') {
    const response = {
      success: true,
      status: 'Active',
      service: serviceName,
      domainStatus: domainStatus.status,
      hostingStatus: null,
      billingIssue: false,
      actionRequired: null,
      message: `Your domain ${serviceName} is Active. Next renewal is due on ${domainStatus.nextDueDate}.`
    };
    
    // Add comprehensive DNS check for active domain (helps with "site down" issues)
    if (serviceName && serviceName.includes('.')) {
      try {
        // Use WHMCS nameservers from domainStatus
        const whmcsNameservers = domainStatus.nameservers || null;
        const dnsStatus = await getComprehensiveDNSStatus(serviceName, whmcsNameservers);
        
        response.dnsStatus = {
          propagated: dnsStatus.propagated,
          usesOurNameservers: dnsStatus.usesOurNameservers,
          isExternalDNS: dnsStatus.isExternalDNS,
          diagnosis: dnsStatus.diagnosis,
          dataSource: dnsStatus.dataSource
        };
        
        // Add comprehensive DNS analysis if available
        if (dnsStatus.serverAnalysis) {
          response.dnsStatus.serverAnalysis = dnsStatus.serverAnalysis;
          response.dnsStatus.records = dnsStatus.comprehensiveDNS ? {
            A: dnsStatus.comprehensiveDNS.records.A,
            MX: dnsStatus.comprehensiveDNS.records.MX,
            NS: dnsStatus.comprehensiveDNS.records.NS
          } : null;
        }
        
        // Add DNS info to message if relevant
        if (!dnsStatus.propagated) {
          response.message += ` Note: ${dnsStatus.shortMessage}`;
        } else if (dnsStatus.isExternalDNS) {
          response.message += ` DNS Info: ${dnsStatus.shortMessage}`;
        }
        
        // Add server analysis to message
        if (dnsStatus.serverAnalysis) {
          const analysis = dnsStatus.serverAnalysis;
          if (analysis.websitePointsToOurServers && analysis.emailPointsToOurServers) {
            response.message += ` Both website and email point to our servers.`;
          } else if (analysis.websitePointsToOurServers) {
            response.message += ` Website points to our servers.`;
          } else if (analysis.emailPointsToOurServers) {
            response.message += ` Email points to our servers.`;
          }
        }
      } catch (err) {
        console.log('⚠️ DNS check failed for active domain:', err.message);
      }
    }
    
    return response;
  }
  
  if (domainInactive) {
    let message = `Your domain ${serviceName} is ${domainStatus.status}. Please renew your domain to keep it active.`;
    
    const response = {
      success: true,
      status: domainStatus.status,
      service: serviceName,
      domainStatus: domainStatus.status,
      hostingStatus: null,
      billingIssue: true,
      actionRequired: 'renew_domain',
      message: message
    };
    
    // ✅ ADD: Look for renewal invoice for expired domains
    if (domainStatus.status === 'Expired') {
      try {
        const unpaidInvoice = await findRelatedUnpaidInvoice(clientId, { 
          domain: serviceName 
        });
        
        if (unpaidInvoice) {
          const invoiceId = unpaidInvoice.invoiceid || unpaidInvoice.id;
          const amountDue = amountFromInvoice(unpaidInvoice);
          const amountDueNum = amountDue ? Number(amountDue) : 0;
          
          response.invoiceId = invoiceId;
          response.amountDue = amountDueNum;
          response.dueDate = unpaidInvoice.duedate;
          response.message = `Your domain ${serviceName} is Expired. Please pay renewal invoice #${invoiceId} for ${amountDue} to renew your domain.`;
        }
      } catch (err) {
        console.log('⚠️ Could not find renewal invoice for expired domain:', err.message);
      }
    }
    
    return response;
  }
  
  return null;
}

/**
 * Handle hosting-only status
 */
async function handleHostingOnly(params) {
  const { serviceName, hostingStatus, dnsZoneAnalysis, clientId } = params;
  
  const hostingInactive = ['Suspended', 'Expired', 'Cancelled', 'Terminated', 'Pending'].includes(hostingStatus.status);
  
  if (hostingInactive) {
    let message = `Your hosting for ${serviceName} is ${hostingStatus.status}. Please renew your hosting to restore service.`;
    
    // Add product name
    if (hostingStatus.allProducts && hostingStatus.allProducts.length > 0) {
      const productName = hostingStatus.allProducts[0].name;
      message += ` Product: ${productName}.`;
    }
    
    let response = {
      success: true,
      status: hostingStatus.status,
      service: serviceName,
      domainStatus: null,
      hostingStatus: hostingStatus.status,
      billingIssue: true,
      actionRequired: 'renew_hosting',
      message: message
    };
    
    // Add server, domain, and DNS zone information
    response = addServerAndDomainInfo(response, null, hostingStatus, dnsZoneAnalysis, params.reachabilityAnalysis);
    
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
