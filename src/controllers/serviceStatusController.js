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
 * Create a minimal response format focusing only on issues and actions needed
 */
function createSimplifiedResponse(originalResponse, additionalData = {}) {
  const { dnsZoneAnalysis, reachabilityAnalysis } = additionalData;
  
  // Base response with only essential info
  const simplified = {
    success: originalResponse.success,
    status: originalResponse.status,
    service: originalResponse.service,
    message: cleanMessage(originalResponse.message)
  };
  
  // Add server info only if there are issues or it's needed for context
  // Note: Server details removed for security - no longer exposing serverId, serverName, serverIP, username
  
  // Add billing info only if there's a billing issue
  if (originalResponse.billingIssue) {
    simplified.billingIssue = true;
    if (originalResponse.invoiceId) simplified.invoiceId = originalResponse.invoiceId;
    if (originalResponse.amountDue) simplified.amountDue = originalResponse.amountDue;
    if (originalResponse.daysUntilTermination) simplified.daysUntilTermination = originalResponse.daysUntilTermination;
  }
  
  // Add action required only if there's an action needed
  if (originalResponse.actionRequired) {
    simplified.actionRequired = originalResponse.actionRequired;
  }
  
  // Add next due date only if service is active or there's a renewal needed
  if (originalResponse.nextDueDate && (originalResponse.status === 'Active' || originalResponse.billingIssue)) {
    simplified.nextDueDate = originalResponse.nextDueDate;
  }
  
  // Add DNS info only if there are issues or fixes applied
  if (dnsZoneAnalysis && (!dnsZoneAnalysis.dnsConsistent || dnsZoneAnalysis.autoFixed || dnsZoneAnalysis.issue)) {
    simplified.dnsIssue = {
      issue: dnsZoneAnalysis.issue,
      recommendation: dnsZoneAnalysis.recommendation
    };
    
    // Add provider info if external DNS needs updating
    if (dnsZoneAnalysis.dnsProvider && !dnsZoneAnalysis.usesOurNameservers) {
      simplified.dnsIssue.provider = dnsZoneAnalysis.providerName;
    }
    
    // Add auto-fix info if something was fixed
    if (dnsZoneAnalysis.autoFixed) {
      simplified.dnsFixed = dnsZoneAnalysis.autoFixMessage;
    }
  }
  
  // Add reachability info only if there are issues
  if (reachabilityAnalysis && (!reachabilityAnalysis.reachable || reachabilityAnalysis.statusCode >= 400)) {
    simplified.siteIssue = {
      reachable: reachabilityAnalysis.reachable,
      issue: reachabilityAnalysis.issue,
      recommendation: reachabilityAnalysis.recommendation
    };
    
    if (reachabilityAnalysis.statusCode) {
      simplified.siteIssue.statusCode = reachabilityAnalysis.statusCode;
    }
  }
  
  // Add SSL info only if there are warnings or it's expiring soon
  if (reachabilityAnalysis && reachabilityAnalysis.ssl) {
    const ssl = reachabilityAnalysis.ssl;
    if (!ssl.valid || ssl.daysUntilExpiry <= 30 || (ssl.warnings && ssl.warnings.length > 0)) {
      simplified.sslIssue = {
        valid: ssl.valid,
        daysUntilExpiry: ssl.daysUntilExpiry,
        warnings: ssl.warnings,
        error: ssl.error
      };
    }
  }
  
  // Add support ticket info only if one was created
  if (originalResponse.ticketCreated && originalResponse.ticketId) {
    simplified.ticketCreated = originalResponse.ticketId;
  }
  
  return simplified;
}

/**
 * Clean message by removing verbose confirmations of things working correctly
 */
function cleanMessage(message) {
  if (!message) return message;
  
  // Remove verbose DNS confirmations
  let cleaned = message
    .replace(/\s*DNS Info: DNS managed externally via [A-Z]+\. cPanel DNS changes won't work\./g, '')
    .replace(/\s*Both website and email are configured with our servers\./g, '')
    .replace(/\s*Both website and email point to our servers\./g, '')
    .replace(/\s*Website points to our servers\./g, '')
    .replace(/\s*Email points to our servers\./g, '')
    .replace(/\s*Email is configured with our servers\./g, '')
    .replace(/\s*DNS Configuration: [^.]*correctly[^.]*\./g, '')
    .replace(/\s*✅ DNS Configuration: [^.]*\./g, '')
    .replace(/\s*Zone file available for AutoSSL processing\./g, '')
    .replace(/\s*DNS and AutoSSL checks passed - issue is code-related\./g, '')
    .replace(/\s*All file and directory permissions are correct\./g, '')
    .replace(/\s*Quota usage is within limits\./g, '')
    .replace(/\s*DNS correctly configured via [A-Z]+\./g, '');
  
  // Clean up extra spaces and periods
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
  
  return cleaned;
}

/**
 * Check service status for a domain or serviceId
 * Handles both domain registration and hosting product status
 */
exports.checkServiceStatus = async (req, res, next) => {
  // console.log('[POST /api/serviceStatus]', { 
  //   clientId: req.body.clientId, 
  //   domain: req.body.domain, 
  //   serviceId: req.body.serviceId,
  //   hasIssue: !!req.body.issue
  // });
  
  try {
    const { clientId, domain, serviceId, issue } = req.body || {};
    
    // Validate required parameters
    if (!clientId || (!domain && !serviceId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'clientId and domain or serviceId required' 
      });
    }

    // Parallelize initial WHMCS API calls
    const initialPromises = [];
    
    // Always get service/product from WHMCS
    initialPromises.push(
      getServiceForClient({ clientId, domain, serviceId })
        .then(result => ({ type: 'service', data: result }))
        .catch(error => ({ type: 'service', error }))
    );
    
    // If domain provided, also fetch domain registration and hosting products in parallel
    if (domain && !serviceId) {
      initialPromises.push(
        getClientsDomains(clientId, { domain: domain })
          .then(result => ({ type: 'domains', data: result }))
          .catch(error => ({ type: 'domains', error }))
      );
      
      initialPromises.push(
        getClientsProducts(clientId, { domain: domain })
          .then(result => ({ type: 'products', data: result }))
          .catch(error => ({ type: 'products', error }))
      );
    }
    
    // Execute all initial API calls in parallel
    const initialResults = await Promise.all(initialPromises);
    
    // Process results
    const serviceResult = initialResults.find(r => r.type === 'service');
    const domainsResult = initialResults.find(r => r.type === 'domains');
    const productsResult = initialResults.find(r => r.type === 'products');
    
    // Get service/product from WHMCS
    const svc = serviceResult?.data;
    
    // Service not found
    if (!svc) {
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
      // Process domain registration status - handle duplicate domains
      if (domainsResult?.data && !domainsResult.error) {
        try {
          const domainData = domainsResult.data;
          const domainsRaw = domainData.domains || [];
          const domains = domainsRaw.domain || domainsRaw;
          const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
          
          if (domainArray.length > 0) {
            // console.log(`→ Found ${domainArray.length} domain record(s) for ${domain}`);
            
            // If multiple domains found, select the best one based on status priority:
            // Priority: active > grace > redemption > expired
            let selectedDomain = domainArray[0];
            
            if (domainArray.length > 1) {
              
              // Define status priority (lower number = higher priority)
              const getStatusPriority = (status) => {
                const statusLower = (status || '').toLowerCase();
                if (statusLower === 'active') return 1;
                if (statusLower === 'grace') return 2;
                if (statusLower === 'redemption') return 3;
                if (statusLower === 'expired') return 4;
                // Other statuses (pending, cancelled, etc.) get lower priority
                return 5;
              };
              
              // Sort by: Status priority first, then by expiry date (descending)
              const sortedDomains = domainArray.sort((a, b) => {
                // Priority 1: Status priority (active > grace > redemption > expired)
                const aPriority = getStatusPriority(a.status);
                const bPriority = getStatusPriority(b.status);
                
                if (aPriority !== bPriority) {
                  return aPriority - bPriority; // Lower priority number = higher priority
                }
                
                // Priority 2: Expiry date (furthest in future = most recent renewal)
                const aExpiry = new Date(a.expirydate || 0).getTime();
                const bExpiry = new Date(b.expirydate || 0).getTime();
                
                return bExpiry - aExpiry; // Most recent expiry first
              });
              
              selectedDomain = sortedDomains[0];
              
              // console.log(`→ Selected domain record using priority system:`);
              // console.log(`  Status: ${selectedDomain.status} (Priority: ${getStatusPriority(selectedDomain.status)})`);
              // console.log(`  Expiry: ${selectedDomain.expirydate}`);
              // console.log(`  Other records: ${domainArray.length - 1} duplicate(s)`);
              
              // Log other domains for reference with their priorities
              sortedDomains.slice(1).forEach((d, idx) => {
                // console.log(`  Duplicate ${idx + 1}: Status=${d.status} (Priority: ${getStatusPriority(d.status)}), Expiry=${d.expirydate}`);
              });
            }
            
            domainStatus = {
              status: toMessageStatus(selectedDomain.status),
              nextDueDate: selectedDomain.nextduedate,
              expiryDate: selectedDomain.expirydate,
              // Capture WHMCS nameserver data
              nameservers: [
                selectedDomain.nameserver1,
                selectedDomain.nameserver2,
                selectedDomain.nameserver3,
                selectedDomain.nameserver4
              ].filter(ns => ns && ns.trim()), // Remove empty nameservers
              // Track if this was a duplicate selection
              isDuplicate: domainArray.length > 1,
              duplicateCount: domainArray.length
            };
          }
        } catch (err) {
          // Domain registration not found, that's okay
        }
      }
      
      // Process hosting product status - check ALL products for this domain
      if (productsResult?.data && !productsResult.error) {
        try {
          const productsData = productsResult.data;
          const productsRaw = productsData.products || {};
          const products = productsRaw.product || productsRaw;
          const productArray = Array.isArray(products) ? products : (products ? [products] : []);
          
          if (productArray.length > 0) {
            // console.log(`→ Found ${productArray.length} hosting product(s) for ${domain}`);
            
            // Collect ALL products with their statuses and server information
            const allProducts = productArray.map(p => ({
              id: p.id,
              name: p.name || p.productname,
              status: toMessageStatus(p.status),
              nextDueDate: p.nextduedate,
              expiryDate: p.expirydate,
              suspensionReason: p.suspensionreason || '',
              rawStatus: p.status,
              // Server information from WHMCS
              serverId: p.serverid,
              serverName: p.servername,
              serverIP: p.serverip,
              serverHostname: p.serverhostname
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
            // Priority: Active > Grace > Redemption > Expired > Suspended > Pending > Terminated/Cancelled
            // If multiple products with same status, use expiry date (furthest in future)
            
            // Define status priority for hosting products (lower number = higher priority)
            const getHostingStatusPriority = (status) => {
              const statusLower = (status || '').toLowerCase();
              if (statusLower === 'active') return 1;
              if (statusLower === 'grace') return 2;
              if (statusLower === 'redemption') return 3;
              if (statusLower === 'expired') return 4;
              if (statusLower === 'suspended') return 5;
              if (statusLower === 'pending') return 6;
              if (statusLower === 'terminated' || statusLower === 'cancelled') return 7;
              // Other statuses get lower priority
              return 8;
            };
            
            // Sort all products by priority and expiry date
            const sortedProducts = allProducts.sort((a, b) => {
              // Priority 1: Status priority (active > grace > redemption > expired > suspended > pending > terminated/cancelled)
              const aPriority = getHostingStatusPriority(a.status);
              const bPriority = getHostingStatusPriority(b.status);
              
              if (aPriority !== bPriority) {
                return aPriority - bPriority; // Lower priority number = higher priority
              }
              
              // Priority 2: Expiry date (furthest in future = most recent renewal)
              const aExpiry = new Date(a.expiryDate || 0).getTime();
              const bExpiry = new Date(b.expiryDate || 0).getTime();
              
              return bExpiry - aExpiry; // Most recent expiry first
            });
            
            const primaryProduct = sortedProducts[0];
            
            if (allProducts.length > 1) {
              // console.log(`→ Multiple hosting products found, selected using priority system:`);
              // console.log(`  Status: ${primaryProduct.status} (Priority: ${getHostingStatusPriority(primaryProduct.status)})`);
              // console.log(`  ID: ${primaryProduct.id}`);
              // console.log(`  Server: ${primaryProduct.serverName || 'N/A'} (ID: ${primaryProduct.serverId || 'N/A'})`);
              // console.log(`  Server IP: ${primaryProduct.serverIP || 'N/A'}`);
              // console.log(`  Expiry: ${primaryProduct.expiryDate}`);
              // console.log(`  Other products: ${allProducts.length - 1} duplicate(s)`);
              
              // Log other products for reference with their priorities
              sortedProducts.slice(1).forEach((p, idx) => {
                // console.log(`  Product ${idx + 1}: Status=${p.status} (Priority: ${getHostingStatusPriority(p.status)}), ID=${p.id}, Server=${p.serverName || 'N/A'}, Expiry=${p.expiryDate}`);
              });
            } else {
              // console.log(`→ Single hosting product found:`);
              // console.log(`  Status: ${primaryProduct.status}`);
              // console.log(`  ID: ${primaryProduct.id}`);
              // console.log(`  Server: ${primaryProduct.serverName || 'N/A'} (ID: ${primaryProduct.serverId || 'N/A'})`);
              // console.log(`  Server IP: ${primaryProduct.serverIP || 'N/A'}`);
              // console.log(`  Server Hostname: ${primaryProduct.serverHostname || 'N/A'}`);
            }
            
            hostingStatus = {
              status: primaryProduct.status,
              nextDueDate: primaryProduct.nextDueDate,
              expiryDate: primaryProduct.expiryDate,
              suspensionReason: primaryProduct.suspensionReason,
              totalProducts: productArray.length,
              productId: primaryProduct.id,
              // Server information from WHMCS
              serverId: primaryProduct.serverId,
              serverName: primaryProduct.serverName,
              serverIP: primaryProduct.serverIP,
              serverHostname: primaryProduct.serverHostname,
              allProducts: allProducts,
              statusCounts: statusCounts,
              isDuplicate: productArray.length > 1,
              duplicateCount: productArray.length,
              // Username will be fetched separately for AutoSSL management
              username: null
            };
          }
        } catch (err) {
          // No hosting found, that's okay
        }
      }
      
      // Fetch username for AutoSSL management from the specific hosting server
      if (domain && hostingStatus && hostingStatus.serverName) {
        try {
          // console.log(`→ Fetching username for domain ${domain} from hosting server ${hostingStatus.serverName}...`);
          const whmService = require('../services/whmService');
          
          // Extract server name from hosting status (e.g., "PCP3 (Premium)" -> "pcp3")
          const serverName = whmService.extractServerNameFromWHMCS(hostingStatus.serverName);
          
          if (serverName) {
            // console.log(`→ Using hosting server: ${serverName.toUpperCase()}`);
            const username = await whmService.getUsernameByDomainOnServer(domain, serverName);
            
            if (username) {
              hostingStatus.username = username;
              // console.log(`✅ Username found for ${domain} on ${serverName.toUpperCase()}: ${username}`);
            } else {
              // console.log(`⚠️ Username not found for domain ${domain} on server ${serverName.toUpperCase()}`);
            }
          } else {
            // console.log(`⚠️ Could not extract server name from: ${hostingStatus.serverName}`);
          }
        } catch (usernameError) {
          // console.log(`⚠️ Error fetching username for ${domain}: ${usernameError.message}`);
        }
      }
    }
    
    // console.log('→ Service:', serviceName, 'Status:', status, 
    //             domainStatus ? `Domain: ${domainStatus.status}` : '', 
    //             hostingStatus ? `Hosting: ${hostingStatus.status}${hostingStatus.totalProducts > 1 ? ` (${hostingStatus.totalProducts} products found)` : ''}` : '',
    //             hostingStatus && hostingStatus.serverName ? `Server: ${hostingStatus.serverName}` : '');

    // Parallelize DNS Zone Analysis and Domain Server Discovery
    let dnsZoneAnalysis = null;
    let userDomainData = null; // Initialize userDomainData for zone file domain extraction
    
    if (domain && hostingStatus && hostingStatus.serverIP) {
      // console.log(`\n🔍 Analyzing DNS zone for ${domain}...`);
      
      try {
        // Import DNS and WHM services for zone analysis
        const { performComprehensiveDNSLookup } = require('../utils/dnsChecker');
        const whmService = require('../services/whmService');
        
        // Parallelize DNS lookup and domain server discovery
        const dnsAnalysisPromises = [];
        
        // Step 1: Check if we control the DNS (nameservers) first
        // console.log(`→ Step 1: Checking DNS nameserver control...`);
        dnsAnalysisPromises.push(
          performComprehensiveDNSLookup(domain)
            .then(result => ({ type: 'dnsLookup', data: result }))
            .catch(error => ({ type: 'dnsLookup', error }))
        );
        
        // Step 2: Check if domain is hosted on our servers (regardless of nameserver control)
        // console.log(`→ Step 2: Checking if domain is hosted on our servers...`);
        // console.log(`→ Note: We can read zone files for hosted domains even with external DNS management`);
        
        // Create WHMCS hint from hosting status
        const whmcsHint = {
          serverName: hostingStatus.serverName,
          serverIP: hostingStatus.serverIP,
          serverId: hostingStatus.serverId,
          serverHostname: hostingStatus.serverHostname
        };
        
        dnsAnalysisPromises.push(
          whmService.findDomainServerByAccounts(domain, whmcsHint)
            .then(result => ({ type: 'domainServer', data: result }))
            .catch(error => ({ type: 'domainServer', error }))
        );
        
        // Execute DNS analysis in parallel
        const dnsAnalysisResults = await Promise.all(dnsAnalysisPromises);
        
        // Process results
        const dnsLookupResult = dnsAnalysisResults.find(r => r.type === 'dnsLookup');
        const domainServerResult = dnsAnalysisResults.find(r => r.type === 'domainServer');
        
        const dnsLookup = dnsLookupResult?.data;
        const domainServer = domainServerResult?.data;
        
        if (!dnsLookup) {
          throw new Error('DNS lookup failed');
        }
        
        const usesOurNameservers = dnsLookup.serverMatches.nsRecordsMatchOurServers;
        
        // console.log(`→ Uses our nameservers: ${usesOurNameservers ? '✅' : '❌'}`);
        // console.log(`→ Current nameservers: ${dnsLookup.records.NS.join(', ')}`);
        
        let currentARecords = [];
        let dnsZoneRecords = [];
        let isOurServer = false;
        
        if (domainServer) {
          isOurServer = true;
          // console.log(`→ Domain hosted on our server: ${domainServer.toUpperCase()}`);
          // console.log(`→ Step 3: Getting zone file data (available for hosted domains)`);
          
          dnsZoneRecords = await whmService.getDNSZone(domainServer, domain);
          
          // Extract all user domains from zone file for AutoSSL processing
          // console.log(`→ DEBUG: dnsZoneRecords length: ${dnsZoneRecords ? dnsZoneRecords.length : 'null'}`);
          if (dnsZoneRecords && dnsZoneRecords.length > 0) {
            // console.log(`→ Extracting all user domains from zone file for AutoSSL management...`);
            // console.log(`→ DEBUG: Zone records sample: ${JSON.stringify(dnsZoneRecords.slice(0, 3).map(r => ({type: r.type, name: r.name})))}`);
            userDomainData = whmService.extractUserDomainsFromZone(dnsZoneRecords, domain);
            // console.log(`→ Found ${userDomainData.summary.totalDomains} user domains in zone file`);
            // console.log(`→ DEBUG: Extracted domains: ${userDomainData.domains.join(', ')}`);
          } else {
            // console.log(`→ DEBUG: No zone records available for domain extraction`);
          }
          
          // Extract A records from zone file for DNS analysis
          if (dnsZoneRecords && dnsZoneRecords.length > 0) {
            const mainDomainARecords = dnsZoneRecords.filter(record => {
              if (record.type !== 'A') return false;
              
              const recordName = (record.name || '').toLowerCase();
              const domainName = domain.toLowerCase();
              
              return (
                recordName === domainName ||
                recordName === `${domainName}.` ||
                recordName === '' ||
                recordName === '@'
              );
            });
            
            currentARecords = mainDomainARecords.map(r => r.address);
            // console.log(`→ Zone file A records: ${currentARecords.join(', ')}`);
            
            if (usesOurNameservers) {
              // console.log(`→ DNS Control: We manage nameservers - zone file is authoritative`);
            } else {
              // console.log(`→ DNS Control: External nameservers - zone file available but not authoritative`);
              // console.log(`→ Note: Zone file data will be used for AutoSSL domain extraction`);
            }
          } else {
            // console.log(`→ No A records found in zone file`);
            // Fallback to DNS resolver for A records
            currentARecords = dnsLookup.records.A || [];
            // console.log(`→ Fallback to DNS resolver A records: ${currentARecords.join(', ')}`);
          }
        } else {
          // Domain not hosted on our servers - use DNS resolver only
          // console.log(`→ Domain not hosted on our servers - using DNS resolver only`);
          // console.log(`→ DNS managed externally (e.g., Cloudflare, external registrar)`);
          // console.log(`→ Skipping zone file analysis - not applicable for external DNS`);
          
          currentARecords = dnsLookup.records.A || [];
          // console.log(`→ DNS resolver A records: ${currentARecords.join(', ')}`);
          
          // For external DNS, we don't need to check server hosting details
          // We only care about the DNS records and providing instructions
          isOurServer = false;
        }
        
        // Step 3: Analyze A records based on DNS control
        const expectedServerIP = hostingStatus.serverIP;
        
        let mainARecord = null;
        let mainDomainARecords = [];
        let correctARecords = [];
        let incorrectARecords = [];
        let hasDuplicates = false;
        let hasIncorrectRecords = false;
        
        if (usesOurNameservers && isOurServer && dnsZoneRecords.length > 0) {
          // We control DNS and host the domain - analyze zone file records
          
          const zoneARecords = dnsZoneRecords.filter(record => record.type === 'A');
          
          // Find ALL A records for the main domain
          mainDomainARecords = zoneARecords.filter(record => {
            const name = (record.name || record.dname || '').toLowerCase();
            const domainName = domain.toLowerCase();
            return name === domainName || name === `${domainName}.` || name === '' || name === '@';
          });
          
          // For backward compatibility, keep mainARecord as the first one
          mainARecord = mainDomainARecords[0] || null;
          
          // Analyze correct A records in zone file
          correctARecords = mainDomainARecords.filter(record => 
            (record.address || record.target) === expectedServerIP
          );
          
          incorrectARecords = mainDomainARecords.filter(record => 
            (record.address || record.target) !== expectedServerIP
          );
          
          hasDuplicates = mainDomainARecords.length > 1;
          hasIncorrectRecords = incorrectARecords.length > 0;
          
        } else if (usesOurNameservers && !isOurServer) {
          // We control DNS but domain not hosted on our servers - use DNS lookup
          // console.log(`→ Step 3: Analyzing DNS records (we control DNS, external hosting)`);
          
          if (currentARecords.length > 0) {
            mainDomainARecords = currentARecords.map((ip, index) => ({
              name: domain,
              type: 'A',
              address: ip,
              source: 'dns_resolver'
            }));
            
            mainARecord = mainDomainARecords[0];
            
            // Check which DNS records match expected server IP
            correctARecords = mainDomainARecords.filter(record => 
              record.address === expectedServerIP
            );
            
            incorrectARecords = mainDomainARecords.filter(record => 
              record.address !== expectedServerIP
            );
            
            hasDuplicates = mainDomainARecords.length > 1;
            hasIncorrectRecords = incorrectARecords.length > 0;
          }
          
        } else {
          // External DNS management - only analyze DNS lookup results for suggestions
          // console.log(`→ Step 3: Analyzing DNS records (external DNS management)`);
          
          if (currentARecords.length > 0) {
            // Create simple analysis for external DNS - no zone file operations
            mainARecord = {
              name: domain,
              type: 'A',
              address: currentARecords[0],
              source: 'external_dns'
            };
            
            // For external DNS, we don't analyze duplicates or do complex operations
            // We just check if any A record points to our server
            const pointsToOurServer = currentARecords.includes(expectedServerIP);
            
            if (pointsToOurServer) {
              correctARecords = [{ address: expectedServerIP }];
            } else {
              correctARecords = [];
            }
            
            // For external DNS, we don't manage duplicates
            hasDuplicates = false;
            hasIncorrectRecords = false;
          }
        }
        
        dnsZoneAnalysis = {
          domain: domain,
          expectedServerIP: expectedServerIP,
          serverName: hostingStatus.serverName,
          serverId: hostingStatus.serverId,
          
          // DNS Lookup Results
          currentARecords: currentARecords,
          aRecordMatchesServer: currentARecords.includes(expectedServerIP),
          
          // DNS Control Information
          usesOurNameservers: usesOurNameservers,
          dataSource: isOurServer ? 'zone_file' : 'dns_resolver',
          
          // DNS Zone Results (available for hosted domains regardless of nameserver control)
          domainServer: domainServer,
          isOurServer: isOurServer,
          zoneARecords: (isOurServer && dnsZoneRecords) ? dnsZoneRecords.filter(r => r.type === 'A') : [],
          mainARecord: mainARecord,
          zoneARecordIP: mainARecord ? (mainARecord.address || mainARecord.target) : null,
          zoneMatchesServer: mainARecord ? (mainARecord.address === expectedServerIP || mainARecord.target === expectedServerIP) : false,
          
          // User Domain Data from Zone File (for AutoSSL processing)
          userDomainData: userDomainData,
          
          // Duplicate Analysis (only for internal DNS management)
          mainDomainARecords: mainDomainARecords,
          totalARecords: mainDomainARecords.length,
          correctARecords: correctARecords.length,
          incorrectARecords: incorrectARecords.length,
          hasDuplicates: hasDuplicates,
          hasIncorrectRecords: hasIncorrectRecords,
          duplicateIPs: incorrectARecords.map(record => record.address || record.target),
          
          // Analysis
          dnsConsistent: false,
          issue: null,
          recommendation: null
        };
        
        // Determine DNS consistency and issues based on data source
        if (isOurServer && usesOurNameservers) {
          // We control DNS and host the domain - zone file is authoritative
          const zonePointsToServer = dnsZoneAnalysis.zoneMatchesServer;
          
          if (zonePointsToServer && !dnsZoneAnalysis.hasIncorrectRecords) {
            dnsZoneAnalysis.dnsConsistent = true;
            dnsZoneAnalysis.issue = null;
            dnsZoneAnalysis.recommendation = 'A record is correctly configured in zone file';
            // console.log(`✅ DNS Analysis: Zone file A record correctly points to server IP ${expectedServerIP}`);
          } else if (zonePointsToServer && dnsZoneAnalysis.hasIncorrectRecords) {
            dnsZoneAnalysis.dnsConsistent = false;
            dnsZoneAnalysis.issue = `Duplicate A records in zone file (${dnsZoneAnalysis.totalARecords} total: ${dnsZoneAnalysis.correctARecords} correct, ${dnsZoneAnalysis.incorrectARecords} incorrect)`;
            dnsZoneAnalysis.recommendation = 'Remove duplicate A records with wrong IPs from zone file';
            // console.log(`🚨 DNS Analysis: Correct IP in zone file but duplicate A records with wrong IPs detected`);
            // console.log(`   → Total A records: ${dnsZoneAnalysis.totalARecords}`);
            // console.log(`   → Correct records: ${dnsZoneAnalysis.correctARecords} (pointing to ${expectedServerIP})`);
            // console.log(`   → Duplicate records: ${dnsZoneAnalysis.incorrectARecords} (pointing to ${dnsZoneAnalysis.duplicateIPs.join(', ')})`);
            
            // AUTO-FIX: Automatically remove duplicate A records with wrong IPs
            // console.log(`\n🔧 AUTO-FIX: Attempting to remove duplicate A records with wrong IPs...`);
            try {
              const whmService = require('../services/whmService');
              
              // Get fresh zone data to find line numbers for incorrect records
              const freshZoneRecords = await whmService.getDNSZone(domainServer, domain);
              
              // Find all main domain A records with their line numbers
              const allMainDomainARecords = freshZoneRecords.filter(record => {
                if (record.type !== 'A') return false;
                const recordName = (record.name || '').toLowerCase();
                const domainName = domain.toLowerCase();
                return (
                  recordName === domainName ||
                  recordName === `${domainName}.` ||
                  recordName === '' ||
                  recordName === '@'
                );
              });
              
              // Separate correct and incorrect records
              const correctRecords = allMainDomainARecords.filter(record => 
                record.address === expectedServerIP
              );
              const incorrectRecords = allMainDomainARecords.filter(record => 
                record.address !== expectedServerIP
              );
              
              
              let removedCount = 0;
              let removalErrors = [];
              
              // Remove incorrect records (sort by line number descending to avoid shifting)
              const sortedIncorrectRecords = incorrectRecords.sort((a, b) => 
                (b.Line || b.line || 0) - (a.Line || a.line || 0)
              );
              
              for (const record of sortedIncorrectRecords) {
                const lineNumber = record.Line || record.line;
                if (!lineNumber) {
                  // console.log(`⚠️ Skipping record without line number: ${record.name} → ${record.address}`);
                  continue;
                }
                
                try {
                  // console.log(`🔧 Removing duplicate A record at line ${lineNumber}: ${record.name || domain} → ${record.address}`);
                  
                  const removeResult = await whmService.callServerAPI(domainServer, 'removezonerecord', {
                    domain: domain,
                    line: lineNumber
                  });
                  
                  if (removeResult && removeResult.metadata && removeResult.metadata.result === 1) {
                    // console.log(`✅ Successfully removed duplicate A record at line ${lineNumber}`);
                    removedCount++;
                  } else {
                    const error = removeResult?.metadata?.reason || 'Unknown error';
                    // console.log(`❌ Failed to remove duplicate A record at line ${lineNumber}: ${error}`);
                    removalErrors.push(`Line ${lineNumber}: ${error}`);
                  }
                } catch (removeError) {
                  // console.log(`❌ Error removing duplicate A record at line ${lineNumber}: ${removeError.message}`);
                  removalErrors.push(`Line ${lineNumber}: ${removeError.message}`);
                }
              }
              
              if (removedCount > 0) {
                // console.log(`✅ AUTO-FIX SUCCESS: Removed ${removedCount} duplicate A records`);
                
                // Update the analysis to reflect the successful cleanup
                dnsZoneAnalysis.issue = `Duplicate A records were detected and automatically removed (${removedCount} duplicates removed)`;
                dnsZoneAnalysis.recommendation = 'Duplicate A records automatically removed from DNS zone';
                dnsZoneAnalysis.dnsConsistent = true;
                dnsZoneAnalysis.autoFixed = true;
                dnsZoneAnalysis.autoFixMethod = 'removezonerecord_duplicates';
                dnsZoneAnalysis.autoFixMessage = `Automatically removed ${removedCount} duplicate A records with wrong IPs`;
                dnsZoneAnalysis.duplicatesRemoved = removedCount;
                
                if (removalErrors.length > 0) {
                  dnsZoneAnalysis.autoFixWarnings = removalErrors;
                  dnsZoneAnalysis.recommendation += ` (${removalErrors.length} records failed to remove)`;
                }
                
                console.log(`→ DNS Zone Analysis Updated: Duplicate A records automatically removed`);
              } else {
                console.log(`❌ AUTO-FIX FAILED: No duplicate A records were removed`);
                dnsZoneAnalysis.autoFixAttempted = true;
                dnsZoneAnalysis.autoFixError = removalErrors.length > 0 ? 
                  `Failed to remove duplicates: ${removalErrors.join(', ')}` : 
                  'No duplicate records could be removed';
                dnsZoneAnalysis.recommendation = `Failed to automatically remove duplicate A records. Manual removal required.`;
              }
              
            } catch (autoFixError) {
              console.log(`❌ AUTO-FIX ERROR: ${autoFixError.message}`);
              dnsZoneAnalysis.autoFixAttempted = true;
              dnsZoneAnalysis.autoFixError = autoFixError.message;
              dnsZoneAnalysis.recommendation = `Error during automatic duplicate removal: ${autoFixError.message}. Manual removal required.`;
            }
          } else if (!zonePointsToServer) {
            dnsZoneAnalysis.dnsConsistent = false;
            if (mainARecord) {
              dnsZoneAnalysis.issue = 'Zone file A record points to wrong IP';
              dnsZoneAnalysis.recommendation = 'Update A record in DNS zone to correct server IP';
              
              // AUTO-FIX: Automatically update wrong A record since we control the DNS
              try {
                const whmService = require('../services/whmService');
                const updateResult = await whmService.updateARecord(domainServer, domain, expectedServerIP);
                
                if (updateResult.success) {
                  // console.log(`✅ AUTO-FIX SUCCESS: Updated A record for ${domain}: ${mainARecord.address} → ${expectedServerIP}`);
                  
                  // Update the analysis to reflect the successful update
                  dnsZoneAnalysis.issue = 'A record pointed to wrong IP but has been automatically corrected';
                  dnsZoneAnalysis.recommendation = 'A record automatically updated in DNS zone';
                  dnsZoneAnalysis.dnsConsistent = true;
                  dnsZoneAnalysis.zoneARecordIP = expectedServerIP;
                  dnsZoneAnalysis.zoneMatchesServer = true;
                  dnsZoneAnalysis.autoFixed = true;
                  dnsZoneAnalysis.autoFixMethod = updateResult.method;
                  dnsZoneAnalysis.autoFixMessage = updateResult.message || `Updated A record from ${mainARecord.address} to ${expectedServerIP}`;
                  dnsZoneAnalysis.oldIP = mainARecord.address;
                  
                  // console.log(`→ DNS Zone Analysis Updated: A record automatically corrected and verified`);
                } else {
                  // console.log(`❌ AUTO-FIX FAILED: ${updateResult.error}`);
                  dnsZoneAnalysis.autoFixAttempted = true;
                  dnsZoneAnalysis.autoFixError = updateResult.error;
                  dnsZoneAnalysis.recommendation = `Failed to automatically update A record: ${updateResult.error}. Manual update required.`;
                }
              } catch (autoFixError) {
                console.log(`❌ AUTO-FIX ERROR: ${autoFixError.message}`);
                dnsZoneAnalysis.autoFixAttempted = true;
                dnsZoneAnalysis.autoFixError = autoFixError.message;
                dnsZoneAnalysis.recommendation = `Error during automatic A record update: ${autoFixError.message}. Manual update required.`;
              }
            } else {
              dnsZoneAnalysis.issue = 'No A record found in zone file';
              dnsZoneAnalysis.recommendation = 'Add A record to DNS zone pointing to correct server IP';
              
              // AUTO-FIX: Automatically add missing A record since we control the DNS
              try {
                const whmService = require('../services/whmService');
                const addResult = await whmService.addMissingARecord(domainServer, domain, expectedServerIP);
                
                if (addResult.success) {
                  // console.log(`✅ AUTO-FIX SUCCESS: Added A record for ${domain} → ${expectedServerIP}`);
                  
                  // Update the analysis to reflect the successful addition
                  dnsZoneAnalysis.issue = 'A record was missing but has been automatically added';
                  dnsZoneAnalysis.recommendation = 'A record automatically added to DNS zone';
                  dnsZoneAnalysis.dnsConsistent = true;
                  dnsZoneAnalysis.zoneARecordIP = expectedServerIP;
                  dnsZoneAnalysis.zoneMatchesServer = true;
                  dnsZoneAnalysis.autoFixed = true;
                  dnsZoneAnalysis.autoFixMethod = addResult.method;
                  dnsZoneAnalysis.autoFixMessage = addResult.message;
                  
                  console.log(`→ DNS Zone Analysis Updated: A record automatically added and verified`);
                } else {
                  console.log(`❌ AUTO-FIX FAILED: ${addResult.error}`);
                  dnsZoneAnalysis.autoFixAttempted = true;
                  dnsZoneAnalysis.autoFixError = addResult.error;
                  dnsZoneAnalysis.recommendation = `Failed to automatically add A record: ${addResult.error}. Manual addition required.`;
                }
              } catch (autoFixError) {
                console.log(`❌ AUTO-FIX ERROR: ${autoFixError.message}`);
                dnsZoneAnalysis.autoFixAttempted = true;
                dnsZoneAnalysis.autoFixError = autoFixError.message;
                dnsZoneAnalysis.recommendation = `Error during automatic A record addition: ${autoFixError.message}. Manual addition required.`;
              }
            }
          }
        } else if (isOurServer && !usesOurNameservers) {
          // External DNS management but domain hosted on our servers - we have zone file access
          
          const dnsPointsToServer = dnsZoneAnalysis.aRecordMatchesServer;
          const zonePointsToServer = dnsZoneAnalysis.zoneMatchesServer;
          
          // Detect DNS provider from nameservers
          const { detectRegistrar } = require('../utils/dnsChecker');
          const dnsProvider = detectRegistrar(dnsLookup.records.NS);
          const providerName = dnsProvider ? dnsProvider.toUpperCase() : 'external DNS provider';
          
          dnsZoneAnalysis.dnsProvider = dnsProvider;
          dnsZoneAnalysis.providerName = providerName;
          
          if (dnsPointsToServer) {
            dnsZoneAnalysis.dnsConsistent = true;
            dnsZoneAnalysis.issue = null;
            dnsZoneAnalysis.recommendation = `DNS correctly configured via ${providerName}. Zone file available for AutoSSL processing.`;
            // console.log(`✅ DNS Analysis: External DNS (${providerName}) correctly points to server. Zone file available for AutoSSL.`);
          } else {
            dnsZoneAnalysis.dnsConsistent = false;
            if (zonePointsToServer) {
              dnsZoneAnalysis.issue = `External DNS (${providerName}) points to wrong IP, but zone file has correct IP`;
              dnsZoneAnalysis.recommendation = `Update A record in ${providerName} to point to ${expectedServerIP}`;
              // console.log(`❌ DNS Analysis: External DNS points to wrong IP but zone file is correct`);
            } else {
              dnsZoneAnalysis.issue = `External DNS (${providerName}) points to wrong IP`;
              dnsZoneAnalysis.recommendation = `Update A record in ${providerName} to point to ${expectedServerIP}`;
              // console.log(`❌ DNS Analysis: External DNS points to wrong IP ${currentARecords.join(', ')} (should be ${expectedServerIP})`);
            }
          }
        } else {
          // External DNS management and not hosted on our servers - DNS resolver only
          const dnsPointsToServer = dnsZoneAnalysis.aRecordMatchesServer;
          
          // Detect DNS provider from nameservers
          const { detectRegistrar } = require('../utils/dnsChecker');
          const dnsProvider = detectRegistrar(dnsLookup.records.NS);
          const providerName = dnsProvider ? dnsProvider.toUpperCase() : 'external DNS provider';
          
          dnsZoneAnalysis.dnsProvider = dnsProvider;
          dnsZoneAnalysis.providerName = providerName;
          
          if (dnsPointsToServer) {
            dnsZoneAnalysis.dnsConsistent = true;
            dnsZoneAnalysis.issue = null;
            dnsZoneAnalysis.recommendation = `DNS correctly configured via ${providerName}`;
            // console.log(`✅ DNS Analysis: External DNS (${providerName}) A record correctly points to server IP ${expectedServerIP}`);
          } else {
            dnsZoneAnalysis.dnsConsistent = false;
            if (currentARecords.length > 0) {
              dnsZoneAnalysis.issue = `A record points to wrong server (managed by ${providerName})`;
              dnsZoneAnalysis.recommendation = `Update A record at ${providerName} to point to ${expectedServerIP}`;
              // console.log(`❌ DNS Analysis: External DNS (${providerName}) points to ${currentARecords.join(', ')} but should be ${expectedServerIP}`);
              
              // Add specific instructions based on provider
              if (dnsProvider === 'cloudflare') {
                dnsZoneAnalysis.instructions = [
                  'Log in to Cloudflare dashboard',
                  'Navigate to DNS settings for your domain',
                  `Update the A record to point to ${expectedServerIP}`,
                  'Ensure the record is not proxied (gray cloud) for hosting'
                ];
              } else if (dnsProvider === 'godaddy') {
                dnsZoneAnalysis.instructions = [
                  'Log in to GoDaddy account',
                  'Go to DNS Management for your domain',
                  `Update the A record to point to ${expectedServerIP}`,
                  'Save changes and wait for propagation'
                ];
              } else {
                dnsZoneAnalysis.instructions = [
                  `Log in to your ${providerName} account`,
                  'Navigate to DNS management for your domain',
                  `Update the A record to point to ${expectedServerIP}`,
                  'Save changes and wait for propagation (usually 1-4 hours)'
                ];
              }
            } else {
              dnsZoneAnalysis.issue = `No A record found (managed by ${providerName})`;
              dnsZoneAnalysis.recommendation = `Add A record at ${providerName} pointing to ${expectedServerIP}`;
              
              // Add specific instructions for adding A record
              if (dnsProvider === 'cloudflare') {
                dnsZoneAnalysis.instructions = [
                  'Log in to Cloudflare dashboard',
                  'Navigate to DNS settings for your domain',
                  'Add a new A record:',
                  `  - Name: @ (or leave blank for root domain)`,
                  `  - Content: ${expectedServerIP}`,
                  '  - Proxy status: DNS only (gray cloud)',
                  'Save the record'
                ];
              } else {
                dnsZoneAnalysis.instructions = [
                  `Log in to your ${providerName} account`,
                  'Navigate to DNS management for your domain',
                  'Add a new A record:',
                  `  - Name: @ or root domain`,
                  `  - Value/Target: ${expectedServerIP}`,
                  '  - TTL: 3600 (1 hour) or default',
                  'Save changes'
                ];
              }
            }
          }
        }
        
        // Log detailed analysis - keep only essential error logging
        if (!dnsZoneAnalysis.dnsConsistent) {
          console.log(`⚠️ DNS Issue: ${dnsZoneAnalysis.issue}`);
        }
        
      } catch (dnsError) {
        console.log(`⚠️ DNS zone analysis failed: ${dnsError.message}`);
        dnsZoneAnalysis = {
          domain: domain,
          expectedServerIP: hostingStatus.serverIP,
          error: dnsError.message,
          dnsConsistent: false,
          issue: 'DNS analysis failed',
          recommendation: 'Contact support for DNS troubleshooting'
        };
      }
    }

    // Parallelize Domain Reachability Check and Server Analysis
    let reachabilityAnalysis = null;
    let quotaAnalysis = null;
    let filePermissionsAnalysis = null;
    
    if (domain && dnsZoneAnalysis && dnsZoneAnalysis.aRecordMatchesServer) {
      
      try {
        const reachabilityService = require('../services/reachabilityService');
        const whmService = require('../services/whmService');
        
        // Parallelize reachability check and server analysis
        const serverAnalysisPromises = [];
        
        // Always perform reachability check
        serverAnalysisPromises.push(
          reachabilityService.checkDomainReachability(domain)
            .then(result => ({ type: 'reachability', data: result }))
            .catch(error => ({ type: 'reachability', error }))
        );
        
        // If we have hosting status and username, also check quota and file permissions
        if (hostingStatus && hostingStatus.username && hostingStatus.serverName) {
          const serverName = whmService.extractServerNameFromWHMCS(hostingStatus.serverName);
          
          if (serverName) {
            // Quota check
            serverAnalysisPromises.push(
              whmService.callServerAPI(serverName, 'cpanel', {
                'cpanel_jsonapi_user': hostingStatus.username,
                'cpanel_jsonapi_module': 'Quota',
                'cpanel_jsonapi_func': 'getquota',
                'cpanel_jsonapi_apiversion': '2'
              }, '2', 'GET')
                .then(result => ({ type: 'quota', data: result, serverName }))
                .catch(error => ({ type: 'quota', error, serverName }))
            );
            
            // File permissions check
            serverAnalysisPromises.push(
              whmService.callServerAPI(serverName, 'cpanel', {
                'cpanel_jsonapi_user': hostingStatus.username,
                'cpanel_jsonapi_module': 'Fileman',
                'cpanel_jsonapi_func': 'listfiles',
                'cpanel_jsonapi_apiversion': '2',
                'dir': 'public_html',
                'types': 'file,dir',
                'showdotfiles': '0'
              }, '2', 'GET')
                .then(result => ({ type: 'filePermissions', data: result, serverName }))
                .catch(error => ({ type: 'filePermissions', error, serverName }))
            );
          }
        }
        
        // Execute all server analysis in parallel
        const serverAnalysisResults = await Promise.all(serverAnalysisPromises);
        
        // Process reachability results
        const reachabilityResult = serverAnalysisResults.find(r => r.type === 'reachability');
        if (reachabilityResult?.data) {
          const reachabilityData = reachabilityResult.data;
          
          reachabilityAnalysis = {
            domain: domain,
            timestamp: reachabilityData.timestamp,
            
            // Overall reachability status
            reachable: reachabilityData.overall.reachable,
            method: reachabilityData.overall.method,
            responseTime: reachabilityData.overall.responseTime,
            statusCode: reachabilityData.overall.statusCode,
            
            // SSL certificate information only
            ssl: {
              valid: reachabilityData.ssl?.valid || false,
              validFrom: reachabilityData.ssl?.validFrom || null,
              validTo: reachabilityData.ssl?.validTo || null,
              daysUntilExpiry: reachabilityData.ssl?.daysUntilExpiry || null,
              issuer: reachabilityData.ssl?.issuer || null,
              warnings: reachabilityData.ssl?.warnings || [],
              error: reachabilityData.ssl?.error || null
            },
            
            // Analysis
            issue: null,
            recommendation: null
          };
          
          // Determine issues and recommendations
          if (reachabilityAnalysis.reachable) {
            reachabilityAnalysis.issue = null;
            reachabilityAnalysis.recommendation = `Domain is reachable via ${reachabilityAnalysis.method.toUpperCase()}`;
            
            if (reachabilityAnalysis.statusCode) {
              // console.log(`✅ Domain Reachability: ${domain} is reachable via ${reachabilityAnalysis.method.toUpperCase()} (Status: ${reachabilityAnalysis.statusCode}, Response: ${reachabilityAnalysis.responseTime}ms)`);
            } else {
              // console.log(`✅ Domain Reachability: ${domain} is reachable via ${reachabilityAnalysis.method.toUpperCase()} (Response: ${reachabilityAnalysis.responseTime}ms)`);
            }
          } else {
            reachabilityAnalysis.issue = 'Domain is not reachable';
            reachabilityAnalysis.recommendation = 'Check server status, firewall settings, and web server configuration';
            
            // Log SSL errors for troubleshooting
            if (reachabilityAnalysis.ssl.error) {
              console.log(`SSL error for ${domain}: ${reachabilityAnalysis.ssl.error}`);
            }
          }
          
          // Handle 500 errors with error log fetching
          if (reachabilityAnalysis.statusCode === 500 && hostingStatus && hostingStatus.username && hostingStatus.serverName) {
            console.log(`🚨 500 Internal Server Error detected for ${domain} - Fetching error log...`);
            
            try {
              const whmService = require('../services/whmService');
              
              // Extract server name for WHM API call
              const serverName = whmService.extractServerNameFromWHMCS(hostingStatus.serverName);
              
              if (serverName) {
                // console.log(`→ Fetching error log from server: ${serverName.toUpperCase()}`);
                
                const errorLogResult = await whmService.fetchErrorLogFor500(serverName, hostingStatus.username, domain);
                
                if (errorLogResult.success) {
                  // Add error log information to reachability analysis
                  reachabilityAnalysis.errorLog = {
                    fetched: true,
                    success: true,
                    lines: errorLogResult.errorLogLines,
                    last10Lines: errorLogResult.last10Lines,
                    last10SyntaxErrors: errorLogResult.last10SyntaxErrors,
                    isSyntaxErrorIssue: errorLogResult.isSyntaxErrorIssue,
                    totalLines: errorLogResult.totalLines,
                    message: errorLogResult.message,
                    syntaxErrorMessage: errorLogResult.syntaxErrorMessage,
                    timestamp: errorLogResult.timestamp
                  };
                  
                  // Check if LAST 10 LINES contain syntax errors and create support ticket
                  if (errorLogResult.isSyntaxErrorIssue && errorLogResult.last10SyntaxErrors.length > 0) {
                    try {
                      // Prepare checks status for ticket
                      const checksStatus = {
                        dnsCheck: dnsZoneAnalysis?.dnsConsistent ? 'Passed' : 'Issues detected',
                        autoSSLCheck: reachabilityAnalysis?.ssl?.valid ? 'SSL Valid' : 'SSL Issues detected',
                        connectivity: reachabilityAnalysis?.reachable ? 'Server reachable' : 'Connectivity issues'
                      };
                      
                      const ticketResult = await whmService.createSyntaxErrorTicket(
                        domain, 
                        hostingStatus.username, 
                        serverName, 
                        errorLogResult.last10SyntaxErrors,
                        checksStatus,
                        clientId,
                        req.body.email // Pass email as fallback
                      );
                      
                      if (ticketResult.success) {
                        reachabilityAnalysis.supportTicket = {
                          created: true,
                          success: true,
                          ticketId: ticketResult.ticketId,
                          subject: ticketResult.subject,
                          message: ticketResult.message,
                          timestamp: ticketResult.timestamp
                        };
                        
                        reachabilityAnalysis.recommendation = `500 Internal Server Error caused by PHP syntax errors. Support ticket #${ticketResult.ticketId} has been automatically created with error details. DNS and AutoSSL checks passed - issue is code-related.`;
                      } else {
                        console.log(`❌ Failed to create support ticket: ${ticketResult.error}`);
                        
                        reachabilityAnalysis.supportTicket = {
                          created: true,
                          success: false,
                          error: ticketResult.error,
                          message: ticketResult.message,
                          timestamp: ticketResult.timestamp
                        };
                        
                        reachabilityAnalysis.recommendation = `500 Internal Server Error caused by PHP syntax errors. Failed to create support ticket automatically: ${ticketResult.error}. Please contact support manually.`;
                      }
                      
                    } catch (ticketError) {
                      console.log(`❌ Error during ticket creation: ${ticketError.message}`);
                      
                      reachabilityAnalysis.supportTicket = {
                        created: false,
                        success: false,
                        error: ticketError.message,
                        message: `Error during ticket creation: ${ticketError.message}`
                      };
                    }
                  } else {
                    // No syntax errors in last 10 lines
                    if (errorLogResult.errorLogLines.length > 0) {
                      reachabilityAnalysis.recommendation = `500 Internal Server Error detected. Error log entries found but last 10 lines do not contain syntax errors. Manual investigation required.`;
                    } else {
                      reachabilityAnalysis.recommendation = `500 Internal Server Error detected. Error log is empty - this may be a recent issue or logging may be disabled.`;
                    }
                  }
                  
                } else {
                  console.log(`❌ Failed to fetch error log: ${errorLogResult.error}`);
                  
                  reachabilityAnalysis.errorLog = {
                    fetched: true,
                    success: false,
                    error: errorLogResult.error,
                    message: errorLogResult.message,
                    timestamp: errorLogResult.timestamp
                  };
                  
                  reachabilityAnalysis.recommendation = `500 Internal Server Error detected. Unable to fetch error log: ${errorLogResult.error}. Check server error logs manually.`;
                }
                
              } else {
                console.log(`⚠️ Could not extract server name from hosting status`);
                
                reachabilityAnalysis.errorLog = {
                  fetched: false,
                  success: false,
                  error: 'Could not determine server name for error log fetching',
                  message: 'Server name extraction failed'
                };
              }
              
            } catch (errorLogError) {
              reachabilityAnalysis.errorLog = {
                fetched: false,
                success: false,
                error: errorLogError.message,
                message: `Error during error log fetching: ${errorLogError.message}`
              };
            }
          } else if (reachabilityAnalysis.statusCode === 500) {
            reachabilityAnalysis.errorLog = {
              fetched: false,
              success: false,
              error: 'Error log fetching not available',
              message: !hostingStatus ? 'Domain not hosted with us' : 
                      !hostingStatus.username ? 'Username not available' : 
                      'Server information not available'
            };
            
            reachabilityAnalysis.recommendation = `500 Internal Server Error detected. Unable to fetch error log automatically. Please check server error logs manually or contact support.`;
          }
        }
        
        // Process quota results
        const quotaResult = serverAnalysisResults.find(r => r.type === 'quota');
        if (quotaResult?.data && !quotaResult.error) {
          const quotaData = quotaResult.data;
          const serverName = quotaResult.serverName;
          
          // Process quota analysis similar to existing logic
          if (quotaData && quotaData.data) {
            const quotaInfo = quotaData.data;
            
            // Extract quota information
            const diskUsed = parseFloat(quotaInfo.disk_used_bytes || 0);
            const diskLimit = parseFloat(quotaInfo.disk_limit_bytes || 0);
            const inodesUsed = parseInt(quotaInfo.inodes_used || 0);
            const inodesLimit = parseInt(quotaInfo.inodes_limit || 0);
            
            const diskUsagePercent = diskLimit > 0 ? (diskUsed / diskLimit) * 100 : 0;
            const inodesUsagePercent = inodesLimit > 0 ? (inodesUsed / inodesLimit) * 100 : 0;
            
            quotaAnalysis = {
              username: hostingStatus.username,
              serverName: serverName,
              diskUsed: diskUsed,
              diskLimit: diskLimit,
              diskUsagePercent: diskUsagePercent,
              inodesUsed: inodesUsed,
              inodesLimit: inodesLimit,
              inodesUsagePercent: inodesUsagePercent,
              quotaExceeded: diskUsagePercent >= 100 || inodesUsagePercent >= 100,
              nearQuotaLimit: diskUsagePercent >= 90 || inodesUsagePercent >= 90,
              issue: null,
              recommendation: null
            };
            
            if (quotaAnalysis.quotaExceeded) {
              if (diskUsagePercent >= 100 && inodesUsagePercent >= 100) {
                quotaAnalysis.issue = 'Both disk space and inode quota exceeded';
                quotaAnalysis.recommendation = 'Clean up files and directories to free up both disk space and inodes';
              } else if (diskUsagePercent >= 100) {
                quotaAnalysis.issue = 'Disk space quota exceeded';
                quotaAnalysis.recommendation = 'Clean up large files to free up disk space';
              } else if (inodesUsagePercent >= 100) {
                quotaAnalysis.issue = 'Inode quota exceeded (too many files/directories)';
                quotaAnalysis.recommendation = 'Remove unnecessary files and directories to free up inodes';
              }
            } else if (quotaAnalysis.nearQuotaLimit) {
              quotaAnalysis.issue = 'Approaching quota limits';
              quotaAnalysis.recommendation = 'Consider cleaning up files or upgrading hosting plan';
            } else {
              quotaAnalysis.recommendation = 'Quota usage is within limits';
            }
          }
        }
        
        // Process file permissions results
        const filePermissionsResult = serverAnalysisResults.find(r => r.type === 'filePermissions');
        if (filePermissionsResult?.data && !filePermissionsResult.error) {
          const fileListData = filePermissionsResult.data;
          const serverName = filePermissionsResult.serverName;
          
          // Process file permissions analysis similar to existing logic
          if (fileListData && fileListData.cpanelresult && fileListData.cpanelresult.data) {
            const fileList = fileListData.cpanelresult.data;
            
            let totalFiles = 0;
            let totalDirs = 0;
            let correctFiles = 0;
            let correctDirs = 0;
            const permissionIssues = [];
            
            fileList.forEach(file => {
              const { file: fileName, fullpath, nicemode, type } = file;
              
              if (type === 'file') {
                totalFiles++;
                if (nicemode === '0644') {
                  correctFiles++;
                } else {
                  permissionIssues.push({
                    type: 'file',
                    name: fileName,
                    path: fullpath,
                    currentMode: nicemode,
                    expectedMode: '0644',
                    issue: `File has incorrect permissions: ${nicemode} (should be 0644)`
                  });
                }
              } else if (type === 'dir') {
                totalDirs++;
                if (nicemode === '0755') {
                  correctDirs++;
                } else {
                  permissionIssues.push({
                    type: 'directory',
                    name: fileName,
                    path: fullpath,
                    currentMode: nicemode,
                    expectedMode: '0755',
                    issue: `Directory has incorrect permissions: ${nicemode} (should be 0755)`
                  });
                }
              }
            });
            
            filePermissionsAnalysis = {
              username: hostingStatus.username,
              serverName: serverName,
              directory: '/public_html',
              totalItems: fileList.length,
              totalFiles: totalFiles,
              totalDirs: totalDirs,
              correctFiles: correctFiles,
              correctDirs: correctDirs,
              permissionIssues: permissionIssues,
              hasPermissionIssues: permissionIssues.length > 0,
              issue: null,
              recommendation: null
            };
            
            if (permissionIssues.length > 0) {
              filePermissionsAnalysis.issue = `Found ${permissionIssues.length} file/directory permission issues in /public_html`;
              filePermissionsAnalysis.recommendation = 'File and directory permissions need to be corrected for proper website functionality';
            } else {
              filePermissionsAnalysis.issue = null;
              filePermissionsAnalysis.recommendation = 'All file and directory permissions are correct';
            }
          }
        }
        
        // Note: Error Log Fetching, Quota Check and File Permissions Check have been moved to parallel execution above
        // in the serverAnalysisPromises section for better performance

        // Focused AutoSSL Management - Complete workflow without wait
        if (!reachabilityAnalysis.ssl.valid && hostingStatus && hostingStatus.username && hostingStatus.serverName) {
          // console.log(`\n🎯 SSL Certificate Invalid - Starting Focused AutoSSL Management...`);
          // console.log(`→ Domain: ${domain}`);
          // console.log(`→ Username: ${hostingStatus.username}`);
          // console.log(`→ Server: ${hostingStatus.serverName}`);
          // console.log(`→ SSL Issues: ${reachabilityAnalysis.ssl.warnings.join(', ')}`);
          // console.log(`→ Using complete workflow: Remove Exclusion → Enable → Trigger (no wait)`);
          
          try {
            const whmService = require('../services/whmService');
            
            // Extract server name for AutoSSL API call (e.g., "PCP3 (Premium)" -> "pcp3")
            const serverName = whmService.extractServerNameFromWHMCS(hostingStatus.serverName);
            
            if (!serverName) {
              throw new Error(`Could not extract server name from: ${hostingStatus.serverName}`);
            }
            
            // console.log(`→ Using extracted server name for focused AutoSSL: ${serverName.toUpperCase()}`);
            
            // Get user domain data from DNS zone analysis for comprehensive AutoSSL processing
            const userDomainDataFromAnalysis = dnsZoneAnalysis?.userDomainData || null;
            const domainsToProcess = userDomainDataFromAnalysis?.domains || [domain];
            
            // console.log(`→ DEBUG: dnsZoneAnalysis exists: ${!!dnsZoneAnalysis}`);
            // console.log(`→ DEBUG: userDomainData from analysis: ${!!userDomainDataFromAnalysis}`);
            // console.log(`→ DEBUG: domains to process: ${JSON.stringify(domainsToProcess)}`);
            // console.log(`→ Processing AutoSSL for ${domainsToProcess.length} user domains`);
            
            if (userDomainDataFromAnalysis) {
              // console.log(`→ Zone file contains: ${userDomainDataFromAnalysis.summary.totalDomains} domains, ${userDomainDataFromAnalysis.summary.aRecords} A records, ${userDomainDataFromAnalysis.summary.cnameRecords} CNAME records`);
              // console.log(`→ All extracted domains: ${userDomainDataFromAnalysis.domains.join(', ')}`);
            } else {
              // console.log(`→ No zone file domain data available - using fallback to main domain only`);
              // console.log(`→ This may happen if: zone file is empty, external DNS, or domain not hosted on our servers`);
            }
            
            const autoSSLResult = await whmService.focusedAutoSSLManagement(
              serverName, 
              hostingStatus.username, 
              domainsToProcess,
              { userDomainData: userDomainDataFromAnalysis }
            );
            
            if (autoSSLResult.success) {
              // console.log(`✅ Focused AutoSSL Management Completed: ${autoSSLResult.message}`);
              
              // Determine the action taken based on the result
              let actionTaken = 'unknown';
              let timeline = autoSSLResult.timeline || 'Certificate will be processed automatically';
              
              if (autoSSLResult.autoSSLTriggered) {
                actionTaken = 'active_trigger_success';
                timeline = autoSSLResult.timeline || 'SSL certificate generation has been actively triggered and should complete within minutes';
              } else if (autoSSLResult.removedFromExcluded || autoSSLResult.wasExcluded) {
                actionTaken = 'passive_inclusion_success';
                timeline = autoSSLResult.timeline || 'SSL certificate will be generated in next scheduled AutoSSL run (typically within 4-6 hours)';
              }
              
              // Add comprehensive AutoSSL information to reachability analysis
              reachabilityAnalysis.autoSSL = {
                attempted: true,
                success: true,
                message: autoSSLResult.message,
                method: autoSSLResult.method,
                triggerMethod: autoSSLResult.triggerMethod || null,
                actionTaken: actionTaken,
                wasExcluded: autoSSLResult.wasExcluded,
                autoSSLTriggered: autoSSLResult.autoSSLTriggered,
                timeline: timeline,
                approach: autoSSLResult.approach,
                serverName: autoSSLResult.serverName,
                username: autoSSLResult.username,
                domain: autoSSLResult.domain,
                workflowSuccess: autoSSLResult.workflowAnalysis?.workflowSuccess || false,
                completeSuccess: autoSSLResult.workflowAnalysis?.completeSuccess || false,
                domainsProcessed: autoSSLResult.workflowAnalysis?.domainsRemoved || 0
              };
              
              // Update recommendation with specific action taken
              if (autoSSLResult.autoSSLTriggered) {
                reachabilityAnalysis.recommendation = `SSL certificate issues detected. AutoSSL certificate generation has been actively triggered using ${autoSSLResult.triggerMethod}. ${timeline}. ${reachabilityAnalysis.recommendation}`;
              } else {
                reachabilityAnalysis.recommendation = `SSL certificate issues detected. Domain has been processed for AutoSSL certificate generation. ${timeline}. ${autoSSLResult.explanation || 'AutoSSL workflow completed successfully.'}. ${reachabilityAnalysis.recommendation}`;
              }
              
            } else {
              console.log(`❌ Focused AutoSSL Management Failed: ${autoSSLResult.error}`);
              
              reachabilityAnalysis.autoSSL = {
                attempted: true,
                success: false,
                error: autoSSLResult.error,
                message: autoSSLResult.message,
                method: autoSSLResult.method,
                triggerError: autoSSLResult.triggerError || null,
                approach: autoSSLResult.approach || 'failed',
                timeline: autoSSLResult.timeline || 'AutoSSL workflow failed',
                serverName: autoSSLResult.serverName,
                username: autoSSLResult.username,
                domain: autoSSLResult.domain
              };
              
              reachabilityAnalysis.recommendation = `SSL certificate issues detected. Focused AutoSSL management failed: ${autoSSLResult.error}. Please contact support for manual SSL certificate installation. ${reachabilityAnalysis.recommendation}`;
            }
            
          } catch (autoSSLError) {
            console.log(`❌ Focused AutoSSL Management Error: ${autoSSLError.message}`);
            
            reachabilityAnalysis.autoSSL = {
              attempted: true,
              success: false,
              error: autoSSLError.message,
              message: `Error during focused AutoSSL management: ${autoSSLError.message}`,
              method: 'focused_autossl_exception',
              approach: 'failed',
              timeline: 'AutoSSL workflow failed - manual intervention required'
            };
            
            reachabilityAnalysis.recommendation = `SSL certificate issues detected. Error during focused AutoSSL management: ${autoSSLError.message}. Please contact support for manual SSL certificate installation. ${reachabilityAnalysis.recommendation}`;
          }
        } else if (!reachabilityAnalysis.ssl.valid) {
          // console.log(`\n⚠️ SSL Certificate Invalid but Focused AutoSSL cannot be managed:`);
          if (!hostingStatus) {
            // console.log(`→ No hosting status available - domain may not be hosted with us`);
          } else if (!hostingStatus.username) {
            // console.log(`→ Username not available for domain ${domain} - cannot manage focused AutoSSL`);
          } else if (!hostingStatus.serverName) {
            // console.log(`→ Server name not available - cannot determine focused AutoSSL server`);
          }
          
          // Add focused AutoSSL unavailable information
          reachabilityAnalysis.autoSSL = {
            attempted: false,
            success: false,
            error: 'Focused AutoSSL management not available',
            message: !hostingStatus ? 'Domain not hosted with us' : 
                    !hostingStatus.username ? 'Username not available' : 
                    'Server information not available',
            method: 'not_applicable',
            approach: 'unavailable',
            timeline: 'AutoSSL management not possible - manual SSL certificate installation required'
          };
        }
        
        // Add quota and file permissions analysis to reachability analysis if available
        if (reachabilityAnalysis) {
          if (quotaAnalysis) {
            reachabilityAnalysis.quotaAnalysis = quotaAnalysis;
            
            if (quotaAnalysis.quotaExceeded) {
              reachabilityAnalysis.recommendation = `${quotaAnalysis.issue}. ${quotaAnalysis.recommendation}. ${reachabilityAnalysis.recommendation || ''}`;
            } else if (quotaAnalysis.recommendation) {
              reachabilityAnalysis.recommendation = `${quotaAnalysis.recommendation}. ${reachabilityAnalysis.recommendation || ''}`;
            }
          }
          
          if (filePermissionsAnalysis) {
            reachabilityAnalysis.filePermissionsAnalysis = filePermissionsAnalysis;
            
            if (filePermissionsAnalysis.hasPermissionIssues) {
              reachabilityAnalysis.recommendation = `${filePermissionsAnalysis.issue}. ${filePermissionsAnalysis.recommendation}. ${reachabilityAnalysis.recommendation || ''}`;
            } else if (filePermissionsAnalysis.recommendation) {
              reachabilityAnalysis.recommendation = `${filePermissionsAnalysis.recommendation}. ${reachabilityAnalysis.recommendation || ''}`;
            }
          }
        }
        
      } catch (reachabilityError) {
        console.log(`⚠️ Domain reachability check failed: ${reachabilityError.message}`);
        reachabilityAnalysis = {
          domain: domain,
          reachable: false,
          error: reachabilityError.message,
          issue: 'Reachability check failed',
          recommendation: 'Contact support for connectivity troubleshooting'
        };
      }
    } else if (domain && dnsZoneAnalysis && !dnsZoneAnalysis.aRecordMatchesServer) {
      // console.log(`\n⏭️ Skipping reachability check for ${domain}`);
      // console.log(`→ DNS A record check failed - domain does not point to our servers`);
      // console.log(`→ Reachability check not applicable for domains not pointing to our infrastructure`);
    }

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
      dnsZoneAnalysis,
      reachabilityAnalysis,
      svc,
      clientId,
      domain,
      serviceId
    });
    
    // If billingIssue is false and issue is provided, create support ticket
    if (result && !result.billingIssue && issue) {
      
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
        
        // Add ticket info to response
        result.ticketCreated = true;
        result.ticketId = ticketId;
        result.message += ` I've opened a support ticket (#${ticketId}) for our technical team to investigate your issue.`;
        
      } catch (ticketError) {
        console.log('⚠️ Warning: Could not create support ticket:', ticketError.message);
        result.ticketCreated = false;
        result.ticketError = ticketError.message;
      }
    }
    
    if (result) {
      // Create simplified response format
      const simplifiedResponse = createSimplifiedResponse(result, {
        dnsZoneAnalysis,
        reachabilityAnalysis,
        domainStatus,
        hostingStatus
      });
      return res.json(simplifiedResponse);
    }
    
    // Default fallback
    let message = `Your service ${serviceName} status is ${status}.`;
    
    // If issue provided but no result, create ticket anyway
    if (issue) {
      
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
        console.log('⚠️ Warning: Could not create support ticket:', ticketError.message);
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
  try {
    const { clientId } = req.body || {};
    
    if (!clientId) {
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
    
    // console.log(`→ Found ${productArray.length} products for client ${clientId}`);
    
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
  try {
    const { clientId } = req.body || {};
    
    if (!clientId) {
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
    
    // console.log(`→ Found ${domainArray.length} domains for client ${clientId}`);
    
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
    
    // console.log(`→ Found ${productArray.length} products and ${domainArray.length} domains for client ${clientId}`);
    
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
    
    // console.log(`→ Returning ${items.length} total items`);
    
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

/**
 * Test DNS zone analysis with auto-fix (for testing purposes)
 */
exports.testDNSZoneAnalysis = async (req, res, next) => {
  console.log('[POST /api/test-dns-zone-analysis]', { 
    domain: req.body.domain,
    serverName: req.body.serverName
  });
  
  try {
    const { domain, serverName } = req.body || {};
    
    if (!domain) {
      console.log('✗ Missing domain parameter');
      return res.status(400).json({ 
        success: false, 
        error: 'domain parameter required' 
      });
    }
    
    // Mock hosting status for testing
    let mockHostingStatus;
    if (serverName === 'pcp3') {
      mockHostingStatus = {
        serverName: 'pcp3',
        serverIP: '135.181.231.205',
        serverId: 18,
        serverHostname: 'pcp3.mywebsitebox.com'
      };
    } else {
      mockHostingStatus = {
        serverName: serverName || 'cp1',
        serverIP: '95.217.204.85',
        serverId: 6,
        serverHostname: 'cp1.mywebsitebox.com'
      };
    }
    
    // console.log(`→ Testing DNS zone analysis for: ${domain}`);
    
    // Perform the same DNS zone analysis as in service status
    let dnsZoneAnalysis = null;
    
    try {
      const whmService = require('../services/whmService');
      
      const whmcsHint = {
        serverName: mockHostingStatus.serverName,
        serverIP: mockHostingStatus.serverIP,
        serverId: mockHostingStatus.serverId,
        serverHostname: mockHostingStatus.serverHostname
      };
      
      const domainServer = await whmService.findDomainServerByAccounts(domain, whmcsHint);
      
      if (domainServer) {
        // console.log(`→ Domain hosted on our server: ${domainServer.toUpperCase()}`);
        
        const dnsZoneRecords = await whmService.getDNSZone(domainServer, domain);
        const expectedServerIP = mockHostingStatus.serverIP;
        
        // Find main domain A records
        const mainDomainARecords = dnsZoneRecords.filter(record => {
          if (record.type !== 'A') return false;
          const recordName = (record.name || '').toLowerCase();
          const domainName = domain.toLowerCase();
          return (
            recordName === domainName ||
            recordName === `${domainName}.` ||
            recordName === '' ||
            recordName === '@'
          );
        });
        
        const mainARecord = mainDomainARecords[0] || null;
        
        dnsZoneAnalysis = {
          domain: domain,
          expectedServerIP: expectedServerIP,
          serverName: mockHostingStatus.serverName,
          domainServer: domainServer,
          isOurServer: true,
          dataSource: 'zone_file',
          mainARecord: mainARecord,
          zoneARecordIP: mainARecord ? mainARecord.address : null,
          zoneMatchesServer: mainARecord ? (mainARecord.address === expectedServerIP) : false,
          dnsConsistent: false,
          issue: null,
          recommendation: null
        };
        
        // Apply the same logic as in service status
        const zonePointsToServer = dnsZoneAnalysis.zoneMatchesServer;
        
        if (zonePointsToServer) {
          dnsZoneAnalysis.dnsConsistent = true;
          dnsZoneAnalysis.issue = null;
          dnsZoneAnalysis.recommendation = 'A record is correctly configured in zone file';
        } else if (!zonePointsToServer) {
          dnsZoneAnalysis.dnsConsistent = false;
          if (mainARecord) {
            dnsZoneAnalysis.issue = 'Zone file A record points to wrong IP';
            dnsZoneAnalysis.recommendation = 'Update A record in DNS zone to correct server IP';
            
            // AUTO-FIX: Update wrong A record
            console.log(`\n🔧 AUTO-FIX: Attempting to update wrong A record...`);
            try {
              const updateResult = await whmService.updateARecord(domainServer, domain, expectedServerIP);
              
              if (updateResult.success) {
                // console.log(`✅ AUTO-FIX SUCCESS: Updated A record for ${domain}`);
                dnsZoneAnalysis.issue = 'A record pointed to wrong IP but has been automatically corrected';
                dnsZoneAnalysis.recommendation = 'A record automatically updated in DNS zone';
                dnsZoneAnalysis.dnsConsistent = true;
                dnsZoneAnalysis.zoneARecordIP = expectedServerIP;
                dnsZoneAnalysis.zoneMatchesServer = true;
                dnsZoneAnalysis.autoFixed = true;
                dnsZoneAnalysis.autoFixMethod = updateResult.method;
                dnsZoneAnalysis.autoFixMessage = updateResult.message;
                dnsZoneAnalysis.oldIP = mainARecord.address;
              } else {
                dnsZoneAnalysis.autoFixAttempted = true;
                dnsZoneAnalysis.autoFixError = updateResult.error;
              }
            } catch (autoFixError) {
              dnsZoneAnalysis.autoFixAttempted = true;
              dnsZoneAnalysis.autoFixError = autoFixError.message;
            }
          } else {
            dnsZoneAnalysis.issue = 'No A record found in zone file';
            dnsZoneAnalysis.recommendation = 'Add A record to DNS zone pointing to correct server IP';
            
            // AUTO-FIX: Add missing A record
            // console.log(`\n🔧 AUTO-FIX: Attempting to add missing A record...`);
            try {
              const addResult = await whmService.addMissingARecord(domainServer, domain, expectedServerIP);
              
              if (addResult.success) {
                // console.log(`✅ AUTO-FIX SUCCESS: Added A record for ${domain}`);
                dnsZoneAnalysis.issue = 'A record was missing but has been automatically added';
                dnsZoneAnalysis.recommendation = 'A record automatically added to DNS zone';
                dnsZoneAnalysis.dnsConsistent = true;
                dnsZoneAnalysis.zoneARecordIP = expectedServerIP;
                dnsZoneAnalysis.zoneMatchesServer = true;
                dnsZoneAnalysis.autoFixed = true;
                dnsZoneAnalysis.autoFixMethod = addResult.method;
                dnsZoneAnalysis.autoFixMessage = addResult.message;
              } else {
                dnsZoneAnalysis.autoFixAttempted = true;
                dnsZoneAnalysis.autoFixError = addResult.error;
              }
            } catch (autoFixError) {
              dnsZoneAnalysis.autoFixAttempted = true;
              dnsZoneAnalysis.autoFixError = autoFixError.message;
            }
          }
        }
      } else {
        return res.status(404).json({
          success: false,
          error: 'Domain not found on our servers'
        });
      }
      
    } catch (error) {
      console.error('❌ DNS zone analysis error:', error.message);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
    
    // console.log(`✅ DNS zone analysis completed for ${domain}`);
    
    return res.json({
      success: true,
      domain: domain,
      dnsZoneAnalysis: dnsZoneAnalysis
    });
    
  } catch (error) {
    console.error('❌ Test DNS zone analysis error:', error.message);
    next(error);
  }
};

/**
 * Test syntax error ticket creation (for testing purposes)
 */
exports.testSyntaxErrorTicket = async (req, res, next) => {
  console.log('[POST /api/test-syntax-error-ticket]', { 
    domain: req.body.domain,
    username: req.body.username,
    serverName: req.body.serverName,
    email: req.body.email
  });
  
  try {
    const { domain, username, serverName, email, clientId } = req.body || {};
    
    if (!domain || !username || !serverName) {
      console.log('✗ Missing required parameters');
      return res.status(400).json({ 
        success: false, 
        error: 'domain, username, and serverName parameters required' 
      });
    }
    
    // console.log(`→ Testing syntax error ticket creation for: ${domain}`);
    
    const whmService = require('../services/whmService');
    
    // First get error log to check for syntax errors
    const errorLogResult = await whmService.fetchErrorLogFor500(serverName, username, domain);
    
    if (!errorLogResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch error log',
        details: errorLogResult.error
      });
    }
    
    if (!errorLogResult.isSyntaxErrorIssue) {
      return res.json({
        success: true,
        ticketCreated: false,
        reason: 'Last 10 lines do not contain syntax errors - no ticket needed',
        errorLog: errorLogResult
      });
    }
    
    // Create ticket for syntax errors
    const checksStatus = {
      dnsCheck: 'Passed (test)',
      autoSSLCheck: 'SSL Valid (test)',
      connectivity: 'Server reachable (test)'
    };
    
    const ticketResult = await whmService.createSyntaxErrorTicket(
      domain, 
      username, 
      serverName, 
      errorLogResult.last10SyntaxErrors,
      checksStatus,
      clientId,
      email
    );
    
    // console.log(`✅ Syntax error ticket test completed for ${domain}`);
    
    return res.json({
      success: true,
      domain: domain,
      username: username,
      serverName: serverName,
      errorLog: errorLogResult,
      ticket: ticketResult
    });
    
  } catch (error) {
    console.error('❌ Test syntax error ticket creation error:', error.message);
    next(error);
  }
};

/**
 * Test error log fetching for 500 errors (for testing purposes)
 */
exports.testErrorLogFetching = async (req, res, next) => {
  console.log('[POST /api/test-error-log]', { 
    domain: req.body.domain,
    username: req.body.username,
    serverName: req.body.serverName
  });
  
  try {
    const { domain, username, serverName } = req.body || {};
    
    if (!domain || !username || !serverName) {
      console.log('✗ Missing required parameters');
      return res.status(400).json({ 
        success: false, 
        error: 'domain, username, and serverName parameters required' 
      });
    }
    
    // console.log(`→ Testing error log fetching for: ${domain}`);
    
    const whmService = require('../services/whmService');
    const result = await whmService.fetchErrorLogFor500(serverName, username, domain);
    
    // console.log(`✅ Error log fetch test completed for ${domain}`);
    
    return res.json({
      success: true,
      domain: domain,
      username: username,
      serverName: serverName,
      errorLog: result
    });
    
  } catch (error) {
    console.error('❌ Test error log fetching error:', error.message);
    next(error);
  }
};

/**
 * Test domain reachability (for testing purposes)
 */
exports.testReachability = async (req, res, next) => {
  console.log('[POST /api/test-reachability]', { 
    domain: req.body.domain
  });
  
  try {
    const { domain } = req.body || {};
    
    if (!domain) {
      console.log('✗ Missing domain parameter');
      return res.status(400).json({ 
        success: false, 
        error: 'domain parameter required' 
      });
    }
    
    console.log(`→ Testing reachability for: ${domain}`);
    
    const reachabilityService = require('../services/reachabilityService');
    const result = await reachabilityService.checkDomainReachability(domain);
    
    console.log(`✅ Reachability test completed for ${domain}`);
    
    return res.json({
      success: true,
      domain: domain,
      reachability: {
        reachable: result.overall.reachable,
        method: result.overall.method,
        responseTime: result.overall.responseTime,
        statusCode: result.overall.statusCode,
        ssl: {
          valid: result.ssl?.valid || false,
          validFrom: result.ssl?.validFrom || null,
          validTo: result.ssl?.validTo || null,
          daysUntilExpiry: result.ssl?.daysUntilExpiry || null,
          issuer: result.ssl?.issuer || null,
          warnings: result.ssl?.warnings || [],
          error: result.ssl?.error || null
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Test reachability error:', error.message);
    next(error);
  }
};

module.exports = exports;
