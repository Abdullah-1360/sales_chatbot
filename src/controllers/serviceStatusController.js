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
        
        // Step 1: Check if we control the DNS (nameservers) first
        console.log(`→ Step 1: Checking DNS nameserver control...`);
        
        const dnsLookup = await performComprehensiveDNSLookup(domain);
        const usesOurNameservers = dnsLookup.serverMatches.nsRecordsMatchOurServers;
        
        console.log(`→ Uses our nameservers: ${usesOurNameservers ? '✅' : '❌'}`);
        console.log(`→ Current nameservers: ${dnsLookup.records.NS.join(', ')}`);
        
        let currentARecords = [];
        let dnsZoneRecords = [];
        let isOurServer = false;
        let domainServer = null;
        
        if (usesOurNameservers) {
          // We control DNS - use zone file as authoritative source
          console.log(`→ Step 2: We control DNS - checking if domain is hosted on our servers`);
          
          // Create WHMCS hint from hosting status
          const whmcsHint = {
            serverName: hostingStatus.serverName,
            serverIP: hostingStatus.serverIP,
            serverId: hostingStatus.serverId,
            serverHostname: hostingStatus.serverHostname
          };
          
          domainServer = await whmService.findDomainServerByAccounts(domain, whmcsHint);
          
          if (domainServer) {
            isOurServer = true;
            console.log(`→ Domain hosted on our server: ${domainServer.toUpperCase()}`);
            console.log(`→ Step 3: Getting A records from DNS zone file (authoritative)`);
            
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
            // We control DNS but domain not hosted on our servers - use DNS lookup
            console.log(`→ Domain not hosted on our servers but we control DNS`);
            console.log(`→ Step 3: Getting A records via DNS resolver (external hosting)`);
            
            currentARecords = dnsLookup.records.A || [];
            console.log(`→ DNS resolver A records: ${currentARecords.join(', ')}`);
          }
        } else {
          // External DNS management - use DNS resolver only, NO zone file checking
          console.log(`→ Step 2: External DNS management - using DNS resolver only`);
          console.log(`→ DNS managed externally (e.g., Cloudflare, external registrar)`);
          console.log(`→ Skipping zone file analysis - not applicable for external DNS`);
          
          currentARecords = dnsLookup.records.A || [];
          console.log(`→ DNS resolver A records: ${currentARecords.join(', ')}`);
          
          // For external DNS, we don't need to check server hosting details
          // We only care about the DNS records and providing instructions
          isOurServer = false;
          domainServer = null;
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
          console.log(`→ Step 3: Analyzing zone file records (we control DNS)`);
          
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
          console.log(`→ Step 3: Analyzing DNS records (we control DNS, external hosting)`);
          
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
          console.log(`→ Step 3: Analyzing DNS records (external DNS management)`);
          
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
          dataSource: usesOurNameservers && isOurServer ? 'zone_file' : 'dns_resolver',
          
          // DNS Zone Results (only for internal DNS management)
          domainServer: domainServer,
          isOurServer: isOurServer,
          zoneARecords: (usesOurNameservers && isOurServer && dnsZoneRecords) ? dnsZoneRecords.filter(r => r.type === 'A') : [],
          mainARecord: mainARecord,
          zoneARecordIP: mainARecord ? (mainARecord.address || mainARecord.target) : null,
          zoneMatchesServer: mainARecord ? (mainARecord.address === expectedServerIP || mainARecord.target === expectedServerIP) : false,
          
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
        if (usesOurNameservers && isOurServer) {
          // We control DNS and host the domain - zone file is authoritative
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
            
            // AUTO-FIX: Automatically remove duplicate A records with wrong IPs
            console.log(`\n🔧 AUTO-FIX: Attempting to remove duplicate A records with wrong IPs...`);
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
              
              console.log(`→ Found ${correctRecords.length} correct A records and ${incorrectRecords.length} incorrect A records`);
              
              let removedCount = 0;
              let removalErrors = [];
              
              // Remove incorrect records (sort by line number descending to avoid shifting)
              const sortedIncorrectRecords = incorrectRecords.sort((a, b) => 
                (b.Line || b.line || 0) - (a.Line || a.line || 0)
              );
              
              for (const record of sortedIncorrectRecords) {
                const lineNumber = record.Line || record.line;
                if (!lineNumber) {
                  console.log(`⚠️ Skipping record without line number: ${record.name} → ${record.address}`);
                  continue;
                }
                
                try {
                  console.log(`🔧 Removing duplicate A record at line ${lineNumber}: ${record.name || domain} → ${record.address}`);
                  
                  const removeResult = await whmService.callServerAPI(domainServer, 'removezonerecord', {
                    domain: domain,
                    line: lineNumber
                  });
                  
                  if (removeResult && removeResult.metadata && removeResult.metadata.result === 1) {
                    console.log(`✅ Successfully removed duplicate A record at line ${lineNumber}`);
                    removedCount++;
                  } else {
                    const error = removeResult?.metadata?.reason || 'Unknown error';
                    console.log(`❌ Failed to remove duplicate A record at line ${lineNumber}: ${error}`);
                    removalErrors.push(`Line ${lineNumber}: ${error}`);
                  }
                } catch (removeError) {
                  console.log(`❌ Error removing duplicate A record at line ${lineNumber}: ${removeError.message}`);
                  removalErrors.push(`Line ${lineNumber}: ${removeError.message}`);
                }
              }
              
              if (removedCount > 0) {
                console.log(`✅ AUTO-FIX SUCCESS: Removed ${removedCount} duplicate A records`);
                
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
              console.log(`❌ DNS Analysis: Zone file A record points to ${mainARecord.address} but should be ${expectedServerIP}`);
              
              // AUTO-FIX: Automatically update wrong A record since we control the DNS
              console.log(`\n🔧 AUTO-FIX: Attempting to update wrong A record...`);
              try {
                const whmService = require('../services/whmService');
                const updateResult = await whmService.updateARecord(domainServer, domain, expectedServerIP);
                
                if (updateResult.success) {
                  console.log(`✅ AUTO-FIX SUCCESS: Updated A record for ${domain}: ${mainARecord.address} → ${expectedServerIP}`);
                  
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
                  
                  console.log(`→ DNS Zone Analysis Updated: A record automatically corrected and verified`);
                } else {
                  console.log(`❌ AUTO-FIX FAILED: ${updateResult.error}`);
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
              console.log(`❌ DNS Analysis: No A record found in zone file, should point to ${expectedServerIP}`);
              
              // AUTO-FIX: Automatically add missing A record since we control the DNS
              console.log(`\n🔧 AUTO-FIX: Attempting to add missing A record...`);
              try {
                const whmService = require('../services/whmService');
                const addResult = await whmService.addMissingARecord(domainServer, domain, expectedServerIP);
                
                if (addResult.success) {
                  console.log(`✅ AUTO-FIX SUCCESS: Added A record for ${domain} → ${expectedServerIP}`);
                  
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
        } else {
          // External DNS management - DNS resolver is the only source
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
            console.log(`✅ DNS Analysis: External DNS (${providerName}) A record correctly points to server IP ${expectedServerIP}`);
          } else {
            dnsZoneAnalysis.dnsConsistent = false;
            if (currentARecords.length > 0) {
              dnsZoneAnalysis.issue = `A record points to wrong server (managed by ${providerName})`;
              dnsZoneAnalysis.recommendation = `Update A record at ${providerName} to point to ${expectedServerIP}`;
              console.log(`❌ DNS Analysis: External DNS (${providerName}) points to ${currentARecords.join(', ')} but should be ${expectedServerIP}`);
              
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
              console.log(`❌ DNS Analysis: External DNS (${providerName}) has no A record, should point to ${expectedServerIP}`);
              
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
        
        // Log detailed analysis
        console.log(`→ DNS Zone Analysis Results:`);
        console.log(`  Expected Server IP: ${expectedServerIP}`);
        console.log(`  Data Source: ${dnsZoneAnalysis.dataSource === 'zone_file' ? 'Zone File (Our Server)' : 'DNS Resolver (External)'}`);
        console.log(`  Current DNS A Records: ${currentARecords.join(', ') || 'None'}`);
        if (usesOurNameservers && isOurServer) {
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
    
    console.log(`→ Testing DNS zone analysis for: ${domain}`);
    
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
        console.log(`→ Domain hosted on our server: ${domainServer.toUpperCase()}`);
        
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
                console.log(`✅ AUTO-FIX SUCCESS: Updated A record for ${domain}`);
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
            console.log(`\n🔧 AUTO-FIX: Attempting to add missing A record...`);
            try {
              const addResult = await whmService.addMissingARecord(domainServer, domain, expectedServerIP);
              
              if (addResult.success) {
                console.log(`✅ AUTO-FIX SUCCESS: Added A record for ${domain}`);
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
    
    console.log(`✅ DNS zone analysis completed for ${domain}`);
    
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

module.exports = exports;
