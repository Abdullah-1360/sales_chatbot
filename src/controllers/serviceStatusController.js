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
      // Check domain registration status - handle duplicate domains
      try {
        const domainData = await getClientsDomains(clientId, { domain: domain });
        const domainsRaw = domainData.domains || [];
        const domains = domainsRaw.domain || domainsRaw;
        const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
        
        if (domainArray.length > 0) {
          console.log(`→ Found ${domainArray.length} domain record(s) for ${domain}`);
          
          // If multiple domains found, select the best one based on status priority:
          // Priority: active > grace > redemption > expired
          let selectedDomain = domainArray[0];
          
          if (domainArray.length > 1) {
            console.log(`→ Multiple domain records found for ${domain}, selecting best one using priority system...`);
            
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
            
            console.log(`→ Selected domain record using priority system:`);
            console.log(`  Status: ${selectedDomain.status} (Priority: ${getStatusPriority(selectedDomain.status)})`);
            console.log(`  Expiry: ${selectedDomain.expirydate}`);
            console.log(`  Other records: ${domainArray.length - 1} duplicate(s)`);
            
            // Log other domains for reference with their priorities
            sortedDomains.slice(1).forEach((d, idx) => {
              console.log(`  Duplicate ${idx + 1}: Status=${d.status} (Priority: ${getStatusPriority(d.status)}), Expiry=${d.expirydate}`);
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
      
      // Check hosting product status - check ALL products for this domain
      try {
        const productsData = await getClientsProducts(clientId, { domain: domain });
        const productsRaw = productsData.products || {};
        const products = productsRaw.product || productsRaw;
        const productArray = Array.isArray(products) ? products : (products ? [products] : []);
        
        if (productArray.length > 0) {
          console.log(`→ Found ${productArray.length} hosting product(s) for ${domain}`);
          
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
            console.log(`→ Multiple hosting products found, selected using priority system:`);
            console.log(`  Status: ${primaryProduct.status} (Priority: ${getHostingStatusPriority(primaryProduct.status)})`);
            console.log(`  ID: ${primaryProduct.id}`);
            console.log(`  Server: ${primaryProduct.serverName || 'N/A'} (ID: ${primaryProduct.serverId || 'N/A'})`);
            console.log(`  Server IP: ${primaryProduct.serverIP || 'N/A'}`);
            console.log(`  Expiry: ${primaryProduct.expiryDate}`);
            console.log(`  Other products: ${allProducts.length - 1} duplicate(s)`);
            
            // Log other products for reference with their priorities
            sortedProducts.slice(1).forEach((p, idx) => {
              console.log(`  Product ${idx + 1}: Status=${p.status} (Priority: ${getHostingStatusPriority(p.status)}), ID=${p.id}, Server=${p.serverName || 'N/A'}, Expiry=${p.expiryDate}`);
            });
          } else {
            console.log(`→ Single hosting product found:`);
            console.log(`  Status: ${primaryProduct.status}`);
            console.log(`  ID: ${primaryProduct.id}`);
            console.log(`  Server: ${primaryProduct.serverName || 'N/A'} (ID: ${primaryProduct.serverId || 'N/A'})`);
            console.log(`  Server IP: ${primaryProduct.serverIP || 'N/A'}`);
            console.log(`  Server Hostname: ${primaryProduct.serverHostname || 'N/A'}`);
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
            duplicateCount: productArray.length
          };
        }
      } catch (err) {
        // No hosting found, that's okay
      }
    }
    
    console.log('→ Service:', serviceName, 'Status:', status, 
                domainStatus ? `Domain: ${domainStatus.status}` : '', 
                hostingStatus ? `Hosting: ${hostingStatus.status}${hostingStatus.totalProducts > 1 ? ` (${hostingStatus.totalProducts} products found)` : ''}` : '',
                hostingStatus && hostingStatus.serverName ? `Server: ${hostingStatus.serverName}` : '');

    // DNS Zone Analysis - Check if domain's A record matches server IP
    let dnsZoneAnalysis = null;
    if (domain && hostingStatus && hostingStatus.serverIP) {
      console.log(`\n🔍 Analyzing DNS zone for ${domain}...`);
      
      try {
        // Import DNS and WHM services for zone analysis
        const { performComprehensiveDNSLookup } = require('../utils/dnsChecker');
        const whmService = require('../services/whmService');
        
        // Step 1: Check if domain is hosted on our servers first
        console.log(`→ Step 1: Checking if domain is hosted on our servers`);
        
        // Create WHMCS hint from hosting status
        const whmcsHint = {
          serverName: hostingStatus.serverName,
          serverIP: hostingStatus.serverIP,
          serverId: hostingStatus.serverId,
          serverHostname: hostingStatus.serverHostname
        };
        
        const domainServer = await whmService.findDomainServerByAccounts(domain, whmcsHint);
        
        let currentARecords = [];
        let dnsZoneRecords = [];
        let isOurServer = false;
        
        if (domainServer) {
          // Domain is hosted on our servers - use zone file as authoritative source
          isOurServer = true;
          console.log(`→ Domain hosted on our server: ${domainServer.toUpperCase()}`);
          console.log(`→ Step 2: Getting A records from DNS zone file (authoritative)`);
          
          dnsZoneRecords = await whmService.getDNSZone(domainServer, domain);
          
          // Extract A records from zone file
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
            console.log(`→ Zone file A records: ${currentARecords.join(', ')}`);
          } else {
            console.log(`→ No A records found in zone file`);
          }
        } else {
          // Domain is not hosted on our servers - use DNS resolver
          console.log(`→ Domain not hosted on our servers`);
          console.log(`→ Step 2: Getting A records via DNS resolver (external domain)`);
          
          const dnsLookup = await performComprehensiveDNSLookup(domain);
          currentARecords = dnsLookup.records.A || [];
          console.log(`→ DNS resolver A records: ${currentARecords.join(', ')}`);
        }
        
        // Step 3: Analyze A records
        const expectedServerIP = hostingStatus.serverIP;
        
        let mainARecord = null;
        let mainDomainARecords = [];
        let correctARecords = [];
        
        if (isOurServer && dnsZoneRecords.length > 0) {
          // For our servers, analyze zone file records
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
        } else {
          // For external domains or when zone file is not available, create mock records from DNS lookup
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
          }
        }
        const incorrectARecords = mainDomainARecords.filter(record => 
          (record.address || record.target) !== expectedServerIP
        );
        
        const hasDuplicates = mainDomainARecords.length > 1;
        const hasIncorrectRecords = incorrectARecords.length > 0;
        
        dnsZoneAnalysis = {
          domain: domain,
          expectedServerIP: expectedServerIP,
          serverName: hostingStatus.serverName,
          serverId: hostingStatus.serverId,
          
          // DNS Lookup Results
          currentARecords: currentARecords,
          aRecordMatchesServer: currentARecords.includes(expectedServerIP),
          
          // DNS Zone Results
          domainServer: domainServer,
          isOurServer: isOurServer,
          dataSource: isOurServer ? 'zone_file' : 'dns_resolver',
          zoneARecords: isOurServer ? dnsZoneRecords.filter(r => r.type === 'A') : [],
          mainARecord: mainARecord,
          zoneARecordIP: mainARecord ? (mainARecord.address || mainARecord.target) : null,
          zoneMatchesServer: mainARecord ? (mainARecord.address === expectedServerIP || mainARecord.target === expectedServerIP) : false,
          
          // Duplicate Analysis
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
        if (isOurServer) {
          // For our servers, zone file is authoritative
          const zonePointsToServer = dnsZoneAnalysis.zoneMatchesServer;
          
          if (zonePointsToServer && !dnsZoneAnalysis.hasIncorrectRecords) {
            dnsZoneAnalysis.dnsConsistent = true;
            dnsZoneAnalysis.issue = null;
            dnsZoneAnalysis.recommendation = 'A record is correctly configured in zone file';
            console.log(`✅ DNS Analysis: Zone file A record correctly points to server IP ${expectedServerIP}`);
          } else if (zonePointsToServer && dnsZoneAnalysis.hasIncorrectRecords) {
            dnsZoneAnalysis.dnsConsistent = false;
            dnsZoneAnalysis.issue = `Duplicate A records in zone file (${dnsZoneAnalysis.totalARecords} total: ${dnsZoneAnalysis.correctARecords} correct, ${dnsZoneAnalysis.incorrectARecords} incorrect)`;
            dnsZoneAnalysis.recommendation = 'Remove duplicate A records with wrong IPs from zone file';
            console.log(`🚨 DNS Analysis: Correct IP in zone file but duplicate A records with wrong IPs detected`);
            console.log(`   → Total A records: ${dnsZoneAnalysis.totalARecords}`);
            console.log(`   → Correct records: ${dnsZoneAnalysis.correctARecords} (pointing to ${expectedServerIP})`);
            console.log(`   → Duplicate records: ${dnsZoneAnalysis.incorrectARecords} (pointing to ${dnsZoneAnalysis.duplicateIPs.join(', ')})`);
          } else if (!zonePointsToServer) {
            dnsZoneAnalysis.dnsConsistent = false;
            if (mainARecord) {
              dnsZoneAnalysis.issue = 'Zone file A record points to wrong IP';
              dnsZoneAnalysis.recommendation = 'Update A record in DNS zone to correct server IP';
              console.log(`❌ DNS Analysis: Zone file A record points to ${mainARecord.address} but should be ${expectedServerIP}`);
            } else {
              dnsZoneAnalysis.issue = 'No A record found in zone file';
              dnsZoneAnalysis.recommendation = 'Add A record to DNS zone pointing to correct server IP';
              console.log(`❌ DNS Analysis: No A record found in zone file, should point to ${expectedServerIP}`);
            }
          }
        } else {
          // For external domains, DNS resolver is the only source
          const dnsPointsToServer = dnsZoneAnalysis.aRecordMatchesServer;
          
          if (dnsPointsToServer) {
            dnsZoneAnalysis.dnsConsistent = true;
            dnsZoneAnalysis.issue = null;
            dnsZoneAnalysis.recommendation = 'External domain DNS is correctly configured';
            console.log(`✅ DNS Analysis: External domain A record correctly points to server IP ${expectedServerIP}`);
          } else {
            dnsZoneAnalysis.dnsConsistent = false;
            if (currentARecords.length > 0) {
              dnsZoneAnalysis.issue = 'External domain points to different server';
              dnsZoneAnalysis.recommendation = 'Contact domain owner to update A record to correct server IP';
              console.log(`❌ DNS Analysis: External domain points to ${currentARecords.join(', ')} but should be ${expectedServerIP}`);
            } else {
              dnsZoneAnalysis.issue = 'External domain has no A record';
              dnsZoneAnalysis.recommendation = 'Contact domain owner to add A record pointing to correct server IP';
              console.log(`❌ DNS Analysis: External domain has no A record, should point to ${expectedServerIP}`);
            }
          }
        }
        
        // Log detailed analysis
        console.log(`→ DNS Zone Analysis Results:`);
        console.log(`  Expected Server IP: ${expectedServerIP}`);
        console.log(`  Data Source: ${isOurServer ? 'Zone File (Our Server)' : 'DNS Resolver (External)'}`);
        console.log(`  Current DNS A Records: ${currentARecords.join(', ') || 'None'}`);
        if (isOurServer) {
          console.log(`  Zone A Record IP: ${dnsZoneAnalysis.zoneARecordIP || 'Not found'}`);
          if (dnsZoneAnalysis.hasDuplicates) {
            console.log(`  Zone A Records Count: ${dnsZoneAnalysis.totalARecords} (${dnsZoneAnalysis.correctARecords} correct, ${dnsZoneAnalysis.incorrectARecords} duplicates)`);
            if (dnsZoneAnalysis.duplicateIPs.length > 0) {
              console.log(`  Duplicate IPs: ${dnsZoneAnalysis.duplicateIPs.join(', ')}`);
            }
          }
        }
        console.log(`  DNS Consistent: ${dnsZoneAnalysis.dnsConsistent ? '✅' : '❌'}`);
        console.log(`  Issue: ${dnsZoneAnalysis.issue || 'None'}`);
        console.log(`  Recommendation: ${dnsZoneAnalysis.recommendation}`);
        
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
