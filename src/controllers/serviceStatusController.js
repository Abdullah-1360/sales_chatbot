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
            duplicateCount: productArray.length,
            // Username will be fetched separately for AutoSSL management
            username: null
          };
          
          // Fetch username for AutoSSL management from the specific hosting server
          if (domain && hostingStatus.serverName) {
            try {
              console.log(`→ Fetching username for domain ${domain} from hosting server ${hostingStatus.serverName}...`);
              const whmService = require('../services/whmService');
              
              // Extract server name from hosting status (e.g., "PCP3 (Premium)" -> "pcp3")
              const serverName = whmService.extractServerNameFromWHMCS(hostingStatus.serverName);
              
              if (serverName) {
                console.log(`→ Using hosting server: ${serverName.toUpperCase()}`);
                const username = await whmService.getUsernameByDomainOnServer(domain, serverName);
                
                if (username) {
                  hostingStatus.username = username;
                  console.log(`✅ Username found for ${domain} on ${serverName.toUpperCase()}: ${username}`);
                } else {
                  console.log(`⚠️ Username not found for domain ${domain} on server ${serverName.toUpperCase()}`);
                }
              } else {
                console.log(`⚠️ Could not extract server name from: ${hostingStatus.serverName}`);
              }
            } catch (usernameError) {
              console.log(`⚠️ Error fetching username for ${domain}: ${usernameError.message}`);
            }
          }
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
    let userDomainData = null; // Initialize userDomainData for zone file domain extraction
    
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
        
        // Step 2: Check if domain is hosted on our servers (regardless of nameserver control)
        console.log(`→ Step 2: Checking if domain is hosted on our servers...`);
        console.log(`→ Note: We can read zone files for hosted domains even with external DNS management`);
        
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
          console.log(`→ Step 3: Getting zone file data (available for hosted domains)`);
          
          dnsZoneRecords = await whmService.getDNSZone(domainServer, domain);
          
          // Extract all user domains from zone file for AutoSSL processing
          console.log(`→ DEBUG: dnsZoneRecords length: ${dnsZoneRecords ? dnsZoneRecords.length : 'null'}`);
          if (dnsZoneRecords && dnsZoneRecords.length > 0) {
            console.log(`→ Extracting all user domains from zone file for AutoSSL management...`);
            console.log(`→ DEBUG: Zone records sample: ${JSON.stringify(dnsZoneRecords.slice(0, 3).map(r => ({type: r.type, name: r.name})))}`);
            userDomainData = whmService.extractUserDomainsFromZone(dnsZoneRecords, domain);
            console.log(`→ Found ${userDomainData.summary.totalDomains} user domains in zone file`);
            console.log(`→ DEBUG: Extracted domains: ${userDomainData.domains.join(', ')}`);
          } else {
            console.log(`→ DEBUG: No zone records available for domain extraction`);
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
            console.log(`→ Zone file A records: ${currentARecords.join(', ')}`);
            
            if (usesOurNameservers) {
              console.log(`→ DNS Control: We manage nameservers - zone file is authoritative`);
            } else {
              console.log(`→ DNS Control: External nameservers - zone file available but not authoritative`);
              console.log(`→ Note: Zone file data will be used for AutoSSL domain extraction`);
            }
          } else {
            console.log(`→ No A records found in zone file`);
            // Fallback to DNS resolver for A records
            currentARecords = dnsLookup.records.A || [];
            console.log(`→ Fallback to DNS resolver A records: ${currentARecords.join(', ')}`);
          }
        } else {
          // Domain not hosted on our servers - use DNS resolver only
          console.log(`→ Domain not hosted on our servers - using DNS resolver only`);
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
        } else if (isOurServer && !usesOurNameservers) {
          // External DNS management but domain hosted on our servers - we have zone file access
          console.log(`→ External DNS with hosted domain - zone file available for AutoSSL but not authoritative for DNS`);
          
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
            console.log(`✅ DNS Analysis: External DNS (${providerName}) correctly points to server. Zone file available for AutoSSL.`);
          } else {
            dnsZoneAnalysis.dnsConsistent = false;
            if (zonePointsToServer) {
              dnsZoneAnalysis.issue = `External DNS (${providerName}) points to wrong IP, but zone file has correct IP`;
              dnsZoneAnalysis.recommendation = `Update A record in ${providerName} to point to ${expectedServerIP}`;
              console.log(`❌ DNS Analysis: External DNS points to wrong IP but zone file is correct`);
            } else {
              dnsZoneAnalysis.issue = `External DNS (${providerName}) points to wrong IP`;
              dnsZoneAnalysis.recommendation = `Update A record in ${providerName} to point to ${expectedServerIP}`;
              console.log(`❌ DNS Analysis: External DNS points to wrong IP ${currentARecords.join(', ')} (should be ${expectedServerIP})`);
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

    // Domain Reachability Check - Only if DNS A record check passes
    let reachabilityAnalysis = null;
    if (domain && dnsZoneAnalysis && dnsZoneAnalysis.aRecordMatchesServer) {
      console.log(`\n🔍 Domain Reachability Check for ${domain}...`);
      console.log(`→ DNS A record check passed - proceeding with reachability test`);
      
      try {
        const reachabilityService = require('../services/reachabilityService');
        
        // Perform comprehensive reachability check
        const reachabilityResult = await reachabilityService.checkDomainReachability(domain);
        
        reachabilityAnalysis = {
          domain: domain,
          timestamp: reachabilityResult.timestamp,
          
          // Overall reachability status
          reachable: reachabilityResult.overall.reachable,
          method: reachabilityResult.overall.method,
          responseTime: reachabilityResult.overall.responseTime,
          statusCode: reachabilityResult.overall.statusCode,
          
          // SSL certificate information only
          ssl: {
            valid: reachabilityResult.ssl?.valid || false,
            validFrom: reachabilityResult.ssl?.validFrom || null,
            validTo: reachabilityResult.ssl?.validTo || null,
            daysUntilExpiry: reachabilityResult.ssl?.daysUntilExpiry || null,
            issuer: reachabilityResult.ssl?.issuer || null,
            warnings: reachabilityResult.ssl?.warnings || [],
            error: reachabilityResult.ssl?.error || null
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
            console.log(`✅ Domain Reachability: ${domain} is reachable via ${reachabilityAnalysis.method.toUpperCase()} (Status: ${reachabilityAnalysis.statusCode}, Response: ${reachabilityAnalysis.responseTime}ms)`);
          } else {
            console.log(`✅ Domain Reachability: ${domain} is reachable via ${reachabilityAnalysis.method.toUpperCase()} (Response: ${reachabilityAnalysis.responseTime}ms)`);
          }
        } else {
          reachabilityAnalysis.issue = 'Domain is not reachable';
          reachabilityAnalysis.recommendation = 'Check server status, firewall settings, and web server configuration';
          console.log(`❌ Domain Reachability: ${domain} is not reachable via ${reachabilityAnalysis.method || 'any method'}`);
          
          // Log SSL errors for troubleshooting
          if (reachabilityAnalysis.ssl.error) {
            console.log(`  → SSL error: ${reachabilityAnalysis.ssl.error}`);
          }
        }
        
        // Log detailed reachability results
        console.log(`→ Domain Reachability Results:`);
        console.log(`  Overall Reachable: ${reachabilityAnalysis.reachable ? '✅' : '❌'}`);
        console.log(`  Best Method: ${reachabilityAnalysis.method || 'None'}`);
        console.log(`  Response Time: ${reachabilityAnalysis.responseTime || 'N/A'}ms`);
        console.log(`  Status Code: ${reachabilityAnalysis.statusCode || 'N/A'}`);
        console.log(`  SSL: ${reachabilityAnalysis.ssl.valid ? '✅' : '❌'} (${reachabilityAnalysis.ssl.daysUntilExpiry ? `expires in ${reachabilityAnalysis.ssl.daysUntilExpiry} days` : 'invalid'})`);
        
        // Log SSL warnings if any
        if (reachabilityAnalysis.ssl.warnings && reachabilityAnalysis.ssl.warnings.length > 0) {
          console.log(`  SSL Warnings: ${reachabilityAnalysis.ssl.warnings.join(', ')}`);
        }
        
        // Error Log Fetching for 500 Status Codes
        if (reachabilityAnalysis.statusCode === 500 && hostingStatus && hostingStatus.username && hostingStatus.serverName) {
          console.log(`\n🚨 500 Internal Server Error detected - Fetching error log...`);
          console.log(`→ Domain: ${domain}`);
          console.log(`→ Username: ${hostingStatus.username}`);
          console.log(`→ Server: ${hostingStatus.serverName}`);
          
          try {
            const whmService = require('../services/whmService');
            
            // Extract server name for WHM API call
            const serverName = whmService.extractServerNameFromWHMCS(hostingStatus.serverName);
            
            if (serverName) {
              console.log(`→ Fetching error log from server: ${serverName.toUpperCase()}`);
              
              const errorLogResult = await whmService.fetchErrorLogFor500(serverName, hostingStatus.username, domain);
              
              if (errorLogResult.success) {
                console.log(`✅ Error log fetched successfully: ${errorLogResult.errorLogLines.length} recent entries`);
                console.log(`→ Last 10 lines analysis: ${errorLogResult.last10SyntaxErrors.length} of 10 lines are syntax errors`);
                console.log(`→ Syntax error issue detected: ${errorLogResult.isSyntaxErrorIssue}`);
                
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
                  console.log(`\n🎫 Syntax errors in last 10 lines - Creating support ticket...`);
                  console.log(`→ Found ${errorLogResult.last10SyntaxErrors.length} syntax errors in last 10 lines`);
                  
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
                      console.log(`✅ Support ticket created: #${ticketResult.ticketId}`);
                      
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
                  
                  // Log syntax errors for debugging
                  console.log(`→ Syntax errors in last 10 lines:`);
                  errorLogResult.last10SyntaxErrors.forEach((line, index) => {
                    console.log(`  ${index + 1}. ${line}`);
                  });
                  
                } else {
                  // No syntax errors in last 10 lines, show general error log info
                  console.log(`→ Last 10 lines do not contain syntax errors - no ticket created`);
                  console.log(`→ Last 10 lines:`);
                  errorLogResult.last10Lines.forEach((line, index) => {
                    console.log(`  ${index + 1}. ${line}`);
                  });
                  
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
              console.log(`⚠️ Could not extract server name from: ${hostingStatus.serverName}`);
              
              reachabilityAnalysis.errorLog = {
                fetched: false,
                success: false,
                error: 'Could not determine server name for error log fetching',
                message: 'Server name extraction failed'
              };
            }
            
          } catch (errorLogError) {
            console.log(`❌ Error during error log fetching: ${errorLogError.message}`);
            
            reachabilityAnalysis.errorLog = {
              fetched: false,
              success: false,
              error: errorLogError.message,
              message: `Error during error log fetching: ${errorLogError.message}`
            };
          }
        } else if (reachabilityAnalysis.statusCode === 500) {
          console.log(`\n⚠️ 500 Internal Server Error detected but cannot fetch error log:`);
          if (!hostingStatus) {
            console.log(`→ No hosting status available - domain may not be hosted with us`);
          } else if (!hostingStatus.username) {
            console.log(`→ Username not available for domain ${domain}`);
          } else if (!hostingStatus.serverName) {
            console.log(`→ Server name not available`);
          }
          
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
        
        // Quota Check - Check inode and disk usage before AutoSSL
        let quotaAnalysis = null;
        if (hostingStatus && hostingStatus.username && hostingStatus.serverName) {
          console.log(`\n📊 Checking Quota Usage for ${domain}...`);
          console.log(`→ Username: ${hostingStatus.username}`);
          console.log(`→ Server: ${hostingStatus.serverName}`);
          
          try {
            const whmService = require('../services/whmService');
            
            // Extract server name for cPanel API call
            const serverName = whmService.extractServerNameFromWHMCS(hostingStatus.serverName);
            
            if (serverName) {
              console.log(`→ Fetching quota info from server: ${serverName.toUpperCase()}`);
              
              const quotaResult = await whmService.callServerAPI(serverName, 'cpanel', {
                'cpanel_jsonapi_user': hostingStatus.username,
                'cpanel_jsonapi_module': 'Quota',
                'cpanel_jsonapi_func': 'get_quota_info',
                'cpanel_jsonapi_apiversion': '3'
              }, '2', 'GET'); // Use GET method for cPanel JSON API
              
              console.log(`→ Quota API Response structure:`, {
                hasResult: !!quotaResult,
                hasData: !!(quotaResult && quotaResult.data),
                keys: quotaResult ? Object.keys(quotaResult) : [],
                dataKeys: quotaResult && quotaResult.data ? Object.keys(quotaResult.data) : []
              });
              
              // Debug: Log the first few levels of the response to understand structure
              if (quotaResult && quotaResult.data) {
                console.log(`→ Response data keys:`, Object.keys(quotaResult.data));
                if (quotaResult.data.result) {
                  console.log(`→ Response data.result keys:`, Object.keys(quotaResult.data.result));
                  if (quotaResult.data.result.data) {
                    console.log(`→ Response data.result.data keys:`, Object.keys(quotaResult.data.result.data));
                  }
                }
              }
              
              // Parse quota response - handle cPanel JSON API response structure
              if (quotaResult) {
                let quotaData = null;
                
                console.log(`→ Parsing quota data from cPanel JSON API response...`);
                console.log(`→ Response structure check:`, {
                  hasData: !!quotaResult.data,
                  hasResult: !!quotaResult.result,
                  hasResultData: !!(quotaResult.result && quotaResult.result.data),
                  topLevelKeys: Object.keys(quotaResult),
                  func: quotaResult.func,
                  module: quotaResult.module,
                  apiversion: quotaResult.apiversion
                });
                
                // Handle cPanel JSON API direct response structure
                if (quotaResult.result && quotaResult.result.data) {
                  // Direct structure: { func: "get_quota_info", result: { data: {...} } }
                  quotaData = quotaResult.result.data;
                  console.log(`→ ✅ Found quota data at: result.data (direct cPanel response)`);
                } else if (quotaResult.data && quotaResult.data.uapi && quotaResult.data.uapi.result && quotaResult.data.uapi.result.data) {
                  // WHM wrapped structure: { data: { uapi: { result: { data: {...} } } } }
                  quotaData = quotaResult.data.uapi.result.data;
                  console.log(`→ ✅ Found quota data at: data.uapi.result.data (WHM wrapped)`);
                } else if (quotaResult.data && quotaResult.data.cpanelresult && quotaResult.data.cpanelresult.data) {
                  // Alternative structure: { data: { cpanelresult: { data: {...} } } }
                  quotaData = quotaResult.data.cpanelresult.data;
                  console.log(`→ ✅ Found quota data at: data.cpanelresult.data`);
                } else if (quotaResult.data && quotaResult.data.data) {
                  // Simple nested structure: { data: { data: {...} } }
                  quotaData = quotaResult.data.data;
                  console.log(`→ ✅ Found quota data at: data.data`);
                } else {
                  console.log(`→ ❌ Could not find quota data in expected cPanel JSON API structure`);
                  console.log(`→ Top-level keys:`, Object.keys(quotaResult));
                  if (quotaResult.result) {
                    console.log(`→ Available keys at result level:`, Object.keys(quotaResult.result));
                    if (quotaResult.result.data) {
                      console.log(`→ Available keys at result.data level:`, Object.keys(quotaResult.result.data));
                    }
                  }
                  if (quotaResult.data) {
                    console.log(`→ Available keys at data level:`, Object.keys(quotaResult.data));
                  }
                }
                
                if (quotaData && typeof quotaData === 'object') {
                  console.log(`→ Quota data keys found:`, Object.keys(quotaData));
                  console.log(`→ Raw quota values:`, {
                    megabytes_used: quotaData.megabytes_used,
                    megabyte_limit: quotaData.megabyte_limit,
                    inodes_used: quotaData.inodes_used,
                    inode_limit: quotaData.inode_limit,
                    under_quota_overall: quotaData.under_quota_overall,
                    under_megabyte_limit: quotaData.under_megabyte_limit,
                    under_inode_limit: quotaData.under_inode_limit
                  });
                } else {
                  console.log(`→ ❌ Could not extract valid quota data from response`);
                }
                
                if (quotaData && typeof quotaData === 'object') {
                  quotaAnalysis = {
                    username: hostingStatus.username,
                    serverName: serverName,
                    
                    // Disk usage
                    megabytesUsed: parseFloat(quotaData.megabytes_used) || 0,
                    megabytesLimit: parseFloat(quotaData.megabyte_limit) || 0,
                    megabytesRemain: parseFloat(quotaData.megabytes_remain) || 0,
                    underMegabyteLimit: quotaData.under_megabyte_limit === '1',
                    
                    // Inode usage
                    inodesUsed: parseInt(quotaData.inodes_used) || 0,
                    inodeLimit: parseInt(quotaData.inode_limit) || 0,
                    inodesRemain: parseInt(quotaData.inodes_remain) || 0,
                    underInodeLimit: quotaData.under_inode_limit === '1',
                    
                    // Overall quota status
                    underQuotaOverall: quotaData.under_quota_overall === '1',
                    
                    // Analysis
                    quotaExceeded: false,
                    issue: null,
                    recommendation: null
                  };
                } else {
                  console.log(`⚠️ Invalid quota data structure`);
                  quotaAnalysis = {
                    username: hostingStatus.username,
                    serverName: serverName,
                    error: 'Invalid quota data structure in API response',
                    quotaExceeded: false,
                    issue: 'Quota data parsing failed',
                    recommendation: 'Contact support for quota information'
                  };
                }
                
                // Only proceed with quota analysis if we have valid data (no error)
                if (!quotaAnalysis.error) {
                  // Check if quota limits are exceeded
                  // Only consider exceeded if limits are set (not 0/unlimited) and the under_limit flags are false
                  const diskExceeded = quotaAnalysis.megabytesLimit > 0 && !quotaAnalysis.underMegabyteLimit;
                  const inodeExceeded = quotaAnalysis.inodeLimit > 0 && !quotaAnalysis.underInodeLimit;
                
                console.log(`→ Quota limit analysis:`);
                console.log(`  Disk limit: ${quotaAnalysis.megabytesLimit}MB (${quotaAnalysis.megabytesLimit > 0 ? 'limited' : 'unlimited'})`);
                console.log(`  Disk exceeded: ${diskExceeded} (under_limit: ${quotaAnalysis.underMegabyteLimit})`);
                console.log(`  Inode limit: ${quotaAnalysis.inodeLimit} (${quotaAnalysis.inodeLimit > 0 ? 'limited' : 'unlimited'})`);
                console.log(`  Inode exceeded: ${inodeExceeded} (under_limit: ${quotaAnalysis.underInodeLimit})`);
                
                if (diskExceeded || inodeExceeded) {
                  quotaAnalysis.quotaExceeded = true;
                  
                  let issues = [];
                  if (diskExceeded) {
                    const diskPercent = quotaAnalysis.megabytesLimit > 0 ? 
                      ((quotaAnalysis.megabytesUsed / quotaAnalysis.megabytesLimit) * 100).toFixed(1) : 
                      '0.0';
                    issues.push(`Disk usage: ${quotaAnalysis.megabytesUsed}MB / ${quotaAnalysis.megabytesLimit}MB (${diskPercent}%)`);
                  }
                  if (inodeExceeded) {
                    const inodePercent = quotaAnalysis.inodeLimit > 0 ? 
                      ((quotaAnalysis.inodesUsed / quotaAnalysis.inodeLimit) * 100).toFixed(1) : 
                      '0.0';
                    issues.push(`Inode usage: ${quotaAnalysis.inodesUsed} / ${quotaAnalysis.inodeLimit} (${inodePercent}%)`);
                  }
                  
                  quotaAnalysis.issue = `Account quota limit exceeded: ${issues.join(', ')}`;
                  quotaAnalysis.recommendation = 'Please upgrade your hosting plan to increase your quota limits';
                  
                  console.log(`🚨 Quota Exceeded: ${quotaAnalysis.issue}`);
                  
                  // Create support ticket for quota issue
                  console.log(`\n🎫 Creating support ticket for quota limit exceeded...`);
                  
                  try {
                    const checksStatus = {
                      dnsCheck: dnsZoneAnalysis?.dnsConsistent ? 'Passed' : 'Issues detected',
                      reachabilityCheck: reachabilityAnalysis?.reachable ? 'Server reachable' : 'Connectivity issues',
                      quotaCheck: 'Failed - Quota limits exceeded'
                    };
                    
                    const { openTicket } = require('../services/whmcsService');
                    
                    const deptid = process.env.TECHSUPPORT_DEPTID;
                    const deptname = deptid ? undefined : (process.env.TECHSUPPORT_DEPTNAME || 'Technical Support');
                    const subject = `Quota Limit Exceeded - ${domain}`;
                    
                    let ticketMessage = `=== QUOTA LIMIT EXCEEDED ===\n`;
                    ticketMessage += `Domain: ${domain}\n`;
                    ticketMessage += `Username: ${hostingStatus.username}\n`;
                    ticketMessage += `Server: ${hostingStatus.serverName}\n\n`;
                    
                    ticketMessage += `=== QUOTA USAGE DETAILS ===\n`;
                    if (diskExceeded) {
                      const diskPercent = quotaAnalysis.megabytesLimit > 0 ? 
                        ((quotaAnalysis.megabytesUsed / quotaAnalysis.megabytesLimit) * 100).toFixed(1) : 
                        '0.0';
                      ticketMessage += `Disk Usage: ${quotaAnalysis.megabytesUsed}MB / ${quotaAnalysis.megabytesLimit}MB (${diskPercent}% used)\n`;
                      ticketMessage += `Disk Remaining: ${quotaAnalysis.megabytesRemain}MB\n`;
                    }
                    if (inodeExceeded) {
                      const inodePercent = quotaAnalysis.inodeLimit > 0 ? 
                        ((quotaAnalysis.inodesUsed / quotaAnalysis.inodeLimit) * 100).toFixed(1) : 
                        '0.0';
                      ticketMessage += `Inode Usage: ${quotaAnalysis.inodesUsed} / ${quotaAnalysis.inodeLimit} (${inodePercent}% used)\n`;
                      ticketMessage += `Inodes Remaining: ${quotaAnalysis.inodesRemain}\n`;
                    }
                    
                    ticketMessage += `\n=== SYSTEM CHECKS STATUS ===\n`;
                    Object.entries(checksStatus).forEach(([check, status]) => {
                      ticketMessage += `${check}: ${status}\n`;
                    });
                    
                    ticketMessage += `\n=== ISSUE FOUND ===\n`;
                    ticketMessage += `The account has exceeded its quota limits. This may cause issues with website functionality, email delivery, and SSL certificate generation.\n\n`;
                    ticketMessage += `RECOMMENDATION: Customer needs to upgrade their hosting plan to increase quota limits or clean up unnecessary files to free up space.\n`;
                    
                    const ticket = await openTicket({
                      deptid,
                      deptname,
                      subject,
                      message: ticketMessage,
                      clientid: clientId,
                      priority: 'High',
                      serviceid: hostingStatus.productId
                    });
                    
                    const ticketId = ticket.tid || ticket.ticketid || ticket.id;
                    console.log(`✅ Support ticket created for quota issue: #${ticketId}`);
                    
                    quotaAnalysis.supportTicket = {
                      created: true,
                      success: true,
                      ticketId: ticketId,
                      subject: subject,
                      message: 'Support ticket created for quota limit exceeded',
                      timestamp: new Date().toISOString()
                    };
                    
                  } catch (ticketError) {
                    console.log(`❌ Failed to create support ticket for quota issue: ${ticketError.message}`);
                    
                    quotaAnalysis.supportTicket = {
                      created: true,
                      success: false,
                      error: ticketError.message,
                      message: `Failed to create support ticket: ${ticketError.message}`,
                      timestamp: new Date().toISOString()
                    };
                  }
                  
                  // Return early with quota exceeded response - don't proceed to AutoSSL
                  console.log(`→ Quota limits exceeded - skipping AutoSSL check`);
                  
                  // Add quota analysis to reachability analysis
                  if (reachabilityAnalysis) {
                    reachabilityAnalysis.quotaAnalysis = quotaAnalysis;
                    reachabilityAnalysis.recommendation = `${quotaAnalysis.issue}. ${quotaAnalysis.recommendation}. ${reachabilityAnalysis.recommendation || ''}`;
                  }
                  
                  // Import status handlers and return quota exceeded response
                  const statusHandlers = require('../services/statusHandlers');
                  
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
                  
                  // Override the result with quota-specific message
                  if (result) {
                    result.quotaExceeded = true;
                    result.quotaAnalysis = quotaAnalysis;
                    result.message = `Your hosting account has exceeded its quota limits. ${quotaAnalysis.issue}. Please upgrade your hosting plan to resolve this issue.`;
                    
                    if (quotaAnalysis.supportTicket && quotaAnalysis.supportTicket.success) {
                      result.message += ` A support ticket (#${quotaAnalysis.supportTicket.ticketId}) has been created to assist you with upgrading your plan.`;
                    }
                    
                    return res.json(result);
                  }
                  
                  // Fallback response for quota exceeded
                  return res.json({
                    success: true,
                    status: status,
                    service: serviceName,
                    quotaExceeded: true,
                    quotaAnalysis: quotaAnalysis,
                    message: `Your hosting account has exceeded its quota limits. ${quotaAnalysis.issue}. Please upgrade your hosting plan to resolve this issue.${quotaAnalysis.supportTicket && quotaAnalysis.supportTicket.success ? ` A support ticket (#${quotaAnalysis.supportTicket.ticketId}) has been created to assist you.` : ''}`
                  });
                  
                } else {
                  quotaAnalysis.issue = null;
                  quotaAnalysis.recommendation = 'Quota usage is within limits';
                  
                  console.log(`✅ Quota Check: Usage within limits`);
                  
                  const diskDisplay = quotaAnalysis.megabytesLimit > 0 ? 
                    `${quotaAnalysis.megabytesUsed}MB / ${quotaAnalysis.megabytesLimit}MB (${((quotaAnalysis.megabytesUsed / quotaAnalysis.megabytesLimit) * 100).toFixed(1)}%)` :
                    `${quotaAnalysis.megabytesUsed}MB / Unlimited`;
                    
                  const inodeDisplay = quotaAnalysis.inodeLimit > 0 ? 
                    `${quotaAnalysis.inodesUsed} / ${quotaAnalysis.inodeLimit} (${((quotaAnalysis.inodesUsed / quotaAnalysis.inodeLimit) * 100).toFixed(1)}%)` :
                    `${quotaAnalysis.inodesUsed} / Unlimited`;
                  
                  console.log(`→ Disk: ${diskDisplay}`);
                  console.log(`→ Inodes: ${inodeDisplay}`);
                }
                
                } else {
                  // Error in quota data parsing - log and continue
                  console.log(`⚠️ Quota analysis error: ${quotaAnalysis.error}`);
                }
                
              } else {
                console.log(`⚠️ No quota result received from cPanel JSON API`);
                quotaAnalysis = {
                  username: hostingStatus.username,
                  serverName: serverName,
                  error: 'No quota result received from cPanel JSON API',
                  quotaExceeded: false,
                  issue: 'Quota check failed - no API response',
                  recommendation: 'Contact support for quota information'
                };
              }
              
            } else {
              console.log(`⚠️ Could not extract server name from: ${hostingStatus.serverName}`);
              quotaAnalysis = {
                username: hostingStatus.username,
                error: 'Could not determine server name for quota check',
                quotaExceeded: false,
                issue: 'Quota check unavailable',
                recommendation: 'Server information not available for quota check'
              };
            }
            
          } catch (quotaError) {
            console.log(`❌ Error during quota check: ${quotaError.message}`);
            quotaAnalysis = {
              username: hostingStatus.username,
              error: quotaError.message,
              quotaExceeded: false,
              issue: 'Quota check failed',
              recommendation: 'Contact support for quota information'
            };
          }
        }

        // File Permissions Check - Check file/directory permissions before AutoSSL
        let filePermissionsAnalysis = null;
        if (hostingStatus && hostingStatus.username && hostingStatus.serverName && (!quotaAnalysis || !quotaAnalysis.quotaExceeded)) {
          console.log(`\n📁 Checking File Permissions for ${domain}...`);
          console.log(`→ Username: ${hostingStatus.username}`);
          console.log(`→ Server: ${hostingStatus.serverName}`);
          console.log(`→ Directory: /public_html`);
          
          try {
            const whmService = require('../services/whmService');
            
            // Extract server name for cPanel API call
            const serverName = whmService.extractServerNameFromWHMCS(hostingStatus.serverName);
            
            if (serverName) {
              console.log(`→ Fetching file list from server: ${serverName.toUpperCase()}`);
              
              const fileListResult = await whmService.callServerAPI(serverName, 'cpanel', {
                'cpanel_jsonapi_user': hostingStatus.username,
                'cpanel_jsonapi_module': 'Fileman',
                'cpanel_jsonapi_func': 'list_files',
                'cpanel_jsonapi_apiversion': '3',
                'dir': '/public_html'
              }, '2', 'GET'); // Use GET method for cPanel JSON API
              
              console.log(`→ File list API Response structure:`, {
                hasResult: !!fileListResult,
                hasResultData: !!(fileListResult && fileListResult.result && fileListResult.result.data),
                topLevelKeys: fileListResult ? Object.keys(fileListResult) : [],
                func: fileListResult ? fileListResult.func : undefined
              });
              
              // Parse file list response
              if (fileListResult && fileListResult.result && fileListResult.result.data) {
                const fileList = fileListResult.result.data;
                console.log(`→ ✅ Found file list data: ${fileList.length} items`);
                
                // Analyze file permissions
                const permissionIssues = [];
                let totalFiles = 0;
                let totalDirs = 0;
                let correctFiles = 0;
                let correctDirs = 0;
                
                fileList.forEach(item => {
                  const { type, nicemode, file, fullpath } = item;
                  
                  if (type === 'file') {
                    totalFiles++;
                    if (nicemode === '0644') {
                      correctFiles++;
                    } else {
                      permissionIssues.push({
                        type: 'file',
                        name: file,
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
                        name: file,
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
                  
                  console.log(`🚨 Permission Issues Found: ${permissionIssues.length} items with incorrect permissions`);
                  console.log(`→ Files: ${correctFiles}/${totalFiles} correct (${totalFiles - correctFiles} issues)`);
                  console.log(`→ Directories: ${correctDirs}/${totalDirs} correct (${totalDirs - correctDirs} issues)`);
                  
                  // Log first few permission issues for debugging
                  permissionIssues.slice(0, 5).forEach((issue, index) => {
                    console.log(`  ${index + 1}. ${issue.type}: ${issue.name} (${issue.currentMode} → ${issue.expectedMode})`);
                  });
                  
                  if (permissionIssues.length > 5) {
                    console.log(`  ... and ${permissionIssues.length - 5} more issues`);
                  }
                  
                  // AUTO-FIX: Automatically correct file permissions using cPanel fileop API
                  console.log(`\n🔧 AUTO-FIX: Correcting file permissions automatically...`);
                  console.log(`→ Will fix ${permissionIssues.length} permission issues in parallel`);
                  
                  try {
                    // Prepare parallel API calls for permission fixes
                    const permissionFixPromises = permissionIssues.map(async (issue) => {
                      const { type, name, path, currentMode, expectedMode } = issue;
                      
                      // Determine the relative path from public_html
                      let relativePath;
                      if (path.includes('/public_html/')) {
                        // Extract path relative to public_html
                        relativePath = path.split('/public_html/')[1] || name;
                      } else {
                        // Fallback to just the filename
                        relativePath = name;
                      }
                      
                      console.log(`→ Fixing ${type}: ${name} (${currentMode} → ${expectedMode})`);
                      console.log(`→ DEBUG: Full path: ${path}`);
                      console.log(`→ DEBUG: Relative path: ${relativePath}`);
                      
                      try {
                        console.log(`→ DEBUG: Attempting chmod for ${relativePath} with mode ${expectedMode}`);
                        
                        const chmodResult = await whmService.callServerAPI(serverName, 'cpanel', {
                          'cpanel_jsonapi_user': hostingStatus.username,
                          'cpanel_jsonapi_module': 'Fileman',
                          'cpanel_jsonapi_func': 'fileop',
                          'cpanel_jsonapi_apiversion': '2',
                          'op': 'chmod',
                          'metadata': expectedMode.replace('0', ''), // Remove leading 0 (644 instead of 0644)
                          'sourcefiles': `public_html/${relativePath}`
                        }, '2', 'GET');
                        
                        console.log(`→ DEBUG: chmod API response:`, {
                          hasResult: !!chmodResult,
                          hasResultData: !!(chmodResult && chmodResult.result),
                          status: chmodResult?.result?.status,
                          errors: chmodResult?.result?.errors,
                          warnings: chmodResult?.result?.warnings,
                          topLevelKeys: chmodResult ? Object.keys(chmodResult) : []
                        });
                        
                        // Parse cPanel API v2 response structure
                        let success = false;
                        let error = 'Unknown error';
                        
                        if (chmodResult && chmodResult.cpanelresult && chmodResult.cpanelresult.data) {
                          // Check each item in the data array for success
                          const dataItems = chmodResult.cpanelresult.data;
                          const targetPath = `/home/${hostingStatus.username}/public_html/${relativePath}`;
                          
                          // Find the result for our specific file/directory
                          const targetResult = dataItems.find(item => item.src === targetPath);
                          
                          if (targetResult && targetResult.result === 1) {
                            success = true;
                            console.log(`✅ Fixed ${type}: ${name} → ${expectedMode}`);
                          } else if (targetResult && targetResult.result === 0) {
                            error = `chmod operation failed for ${targetPath}`;
                          } else {
                            error = `No result found for ${targetPath} in response data`;
                          }
                        } else if (chmodResult?.result?.errors && chmodResult.result.errors.length > 0) {
                          error = chmodResult.result.errors.join(', ');
                        } else if (chmodResult?.result?.status === 0) {
                          error = 'API returned status 0 (failed)';
                        } else {
                          error = 'Unexpected response structure';
                        }
                        
                        if (success) {
                          return {
                            success: true,
                            item: issue,
                            relativePath: relativePath,
                            message: `Successfully changed ${type} ${name} from ${currentMode} to ${expectedMode}`
                          };
                        } else {
                          console.log(`❌ Failed to fix ${type}: ${name} - ${error}`);
                          console.log(`→ DEBUG: Full chmod response:`, JSON.stringify(chmodResult, null, 2));
                          
                          return {
                            success: false,
                            item: issue,
                            relativePath: relativePath,
                            error: error,
                            message: `Failed to change ${type} ${name}: ${error}`
                          };
                        }
                      } catch (chmodError) {
                        console.log(`❌ Error fixing ${type}: ${name} - ${chmodError.message}`);
                        return {
                          success: false,
                          item: issue,
                          relativePath: relativePath,
                          error: chmodError.message,
                          message: `Error changing ${type} ${name}: ${chmodError.message}`
                        };
                      }
                    });
                    
                    // Execute all permission fixes in parallel
                    console.log(`→ Executing ${permissionFixPromises.length} permission fixes in parallel...`);
                    const fixResults = await Promise.all(permissionFixPromises);
                    
                    // Analyze results
                    const successfulFixes = fixResults.filter(result => result.success);
                    const failedFixes = fixResults.filter(result => !result.success);
                    
                    console.log(`✅ Permission fix results: ${successfulFixes.length} successful, ${failedFixes.length} failed`);
                    
                    // Update file permissions analysis with fix results
                    filePermissionsAnalysis.autoFix = {
                      attempted: true,
                      totalIssues: permissionIssues.length,
                      successfulFixes: successfulFixes.length,
                      failedFixes: failedFixes.length,
                      fixResults: fixResults,
                      method: 'cPanel fileop chmod API',
                      timestamp: new Date().toISOString()
                    };
                    
                    if (successfulFixes.length === permissionIssues.length) {
                      // All permissions fixed successfully
                      filePermissionsAnalysis.hasPermissionIssues = false;
                      filePermissionsAnalysis.issue = null;
                      filePermissionsAnalysis.recommendation = `All file permissions automatically corrected (${successfulFixes.length} items fixed)`;
                      filePermissionsAnalysis.autoFix.success = true;
                      filePermissionsAnalysis.autoFix.message = `Successfully fixed all ${successfulFixes.length} permission issues automatically`;
                      
                      console.log(`✅ AUTO-FIX SUCCESS: All ${successfulFixes.length} permission issues corrected automatically`);
                      
                    } else if (successfulFixes.length > 0) {
                      // Partial success
                      filePermissionsAnalysis.issue = `${failedFixes.length} file permission issues could not be automatically corrected`;
                      filePermissionsAnalysis.recommendation = `${successfulFixes.length} permissions fixed automatically, ${failedFixes.length} require manual correction`;
                      filePermissionsAnalysis.autoFix.success = false;
                      filePermissionsAnalysis.autoFix.message = `Partially successful: ${successfulFixes.length} fixed, ${failedFixes.length} failed`;
                      
                      console.log(`⚠️ AUTO-FIX PARTIAL: ${successfulFixes.length} fixed, ${failedFixes.length} failed`);
                      
                      // Log failed fixes
                      failedFixes.forEach((fix, index) => {
                        console.log(`  Failed ${index + 1}: ${fix.item.type} ${fix.item.name} - ${fix.error}`);
                      });
                      
                    } else {
                      // All fixes failed
                      filePermissionsAnalysis.issue = `Failed to automatically correct ${permissionIssues.length} file permission issues`;
                      filePermissionsAnalysis.recommendation = 'Manual file permission correction required - automatic fix failed';
                      filePermissionsAnalysis.autoFix.success = false;
                      filePermissionsAnalysis.autoFix.message = `All ${permissionIssues.length} permission fixes failed`;
                      
                      console.log(`❌ AUTO-FIX FAILED: All ${permissionIssues.length} permission fixes failed`);
                    }
                    
                  } catch (autoFixError) {
                    console.log(`❌ AUTO-FIX ERROR: ${autoFixError.message}`);
                    
                    filePermissionsAnalysis.autoFix = {
                      attempted: true,
                      success: false,
                      error: autoFixError.message,
                      message: `Error during automatic permission fix: ${autoFixError.message}`,
                      method: 'cPanel fileop chmod API',
                      timestamp: new Date().toISOString()
                    };
                    
                    filePermissionsAnalysis.recommendation = `Failed to automatically correct file permissions: ${autoFixError.message}. Manual correction required.`;
                  }
                  
                  // Continue to AutoSSL check if permissions were fixed successfully
                  if (filePermissionsAnalysis.autoFix && filePermissionsAnalysis.autoFix.success) {
                    console.log(`→ File permissions corrected automatically - continuing to AutoSSL check`);
                  } else {
                    console.log(`→ File permission issues remain - skipping AutoSSL check`);
                    
                    // Add file permissions analysis to reachability analysis
                    if (reachabilityAnalysis) {
                      reachabilityAnalysis.filePermissionsAnalysis = filePermissionsAnalysis;
                      reachabilityAnalysis.recommendation = `${filePermissionsAnalysis.issue}. ${filePermissionsAnalysis.recommendation}. ${reachabilityAnalysis.recommendation || ''}`;
                    }
                    
                    // Import status handlers and return permission issues response
                    const statusHandlers = require('../services/statusHandlers');
                    
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
                    
                    // Override the result with permission-specific message
                    if (result) {
                      result.filePermissionIssues = true;
                      result.filePermissionsAnalysis = filePermissionsAnalysis;
                      result.message = `File permission issues detected. ${filePermissionsAnalysis.autoFix.message}. ${filePermissionsAnalysis.recommendation}`;
                      
                      return res.json(result);
                    }
                    
                    // Fallback response for permission issues
                    return res.json({
                      success: true,
                      status: status,
                      service: serviceName,
                      filePermissionIssues: true,
                      filePermissionsAnalysis: filePermissionsAnalysis,
                      message: `File permission issues detected. ${filePermissionsAnalysis.autoFix.message}. ${filePermissionsAnalysis.recommendation}`
                    });
                  }
                  
                } else {
                  filePermissionsAnalysis.issue = null;
                  filePermissionsAnalysis.recommendation = 'All file and directory permissions are correct';
                  
                  console.log(`✅ File Permissions Check: All permissions are correct`);
                  console.log(`→ Files: ${correctFiles}/${totalFiles} with correct permissions (0644)`);
                  console.log(`→ Directories: ${correctDirs}/${totalDirs} with correct permissions (0755)`);
                }
                
              } else {
                console.log(`⚠️ Failed to parse file list data from cPanel JSON API response`);
                filePermissionsAnalysis = {
                  username: hostingStatus.username,
                  serverName: serverName,
                  directory: '/public_html',
                  error: 'Failed to parse file list data from cPanel JSON API response',
                  hasPermissionIssues: false,
                  issue: 'File permissions check failed - invalid API response',
                  recommendation: 'Contact support for file permissions verification'
                };
              }
              
            } else {
              console.log(`⚠️ Could not extract server name from: ${hostingStatus.serverName}`);
              filePermissionsAnalysis = {
                username: hostingStatus.username,
                error: 'Could not determine server name for file permissions check',
                hasPermissionIssues: false,
                issue: 'File permissions check unavailable',
                recommendation: 'Server information not available for file permissions check'
              };
            }
            
          } catch (filePermError) {
            console.log(`❌ Error during file permissions check: ${filePermError.message}`);
            filePermissionsAnalysis = {
              username: hostingStatus.username,
              error: filePermError.message,
              hasPermissionIssues: false,
              issue: 'File permissions check failed',
              recommendation: 'Contact support for file permissions verification'
            };
          }
        }

        // Focused AutoSSL Management - Complete workflow without wait
        if (!reachabilityAnalysis.ssl.valid && hostingStatus && hostingStatus.username && hostingStatus.serverName) {
          console.log(`\n🎯 SSL Certificate Invalid - Starting Focused AutoSSL Management...`);
          console.log(`→ Domain: ${domain}`);
          console.log(`→ Username: ${hostingStatus.username}`);
          console.log(`→ Server: ${hostingStatus.serverName}`);
          console.log(`→ SSL Issues: ${reachabilityAnalysis.ssl.warnings.join(', ')}`);
          console.log(`→ Using complete workflow: Remove Exclusion → Enable → Trigger (no wait)`);
          
          try {
            const whmService = require('../services/whmService');
            
            // Extract server name for AutoSSL API call (e.g., "PCP3 (Premium)" -> "pcp3")
            const serverName = whmService.extractServerNameFromWHMCS(hostingStatus.serverName);
            
            if (!serverName) {
              throw new Error(`Could not extract server name from: ${hostingStatus.serverName}`);
            }
            
            console.log(`→ Using extracted server name for focused AutoSSL: ${serverName.toUpperCase()}`);
            
            // Get user domain data from DNS zone analysis for comprehensive AutoSSL processing
            const userDomainDataFromAnalysis = dnsZoneAnalysis?.userDomainData || null;
            const domainsToProcess = userDomainDataFromAnalysis?.domains || [domain];
            
            console.log(`→ DEBUG: dnsZoneAnalysis exists: ${!!dnsZoneAnalysis}`);
            console.log(`→ DEBUG: userDomainData from analysis: ${!!userDomainDataFromAnalysis}`);
            console.log(`→ DEBUG: domains to process: ${JSON.stringify(domainsToProcess)}`);
            console.log(`→ Processing AutoSSL for ${domainsToProcess.length} user domains`);
            
            if (userDomainDataFromAnalysis) {
              console.log(`→ Zone file contains: ${userDomainDataFromAnalysis.summary.totalDomains} domains, ${userDomainDataFromAnalysis.summary.aRecords} A records, ${userDomainDataFromAnalysis.summary.cnameRecords} CNAME records`);
              console.log(`→ All extracted domains: ${userDomainDataFromAnalysis.domains.join(', ')}`);
            } else {
              console.log(`→ No zone file domain data available - using fallback to main domain only`);
              console.log(`→ This may happen if: zone file is empty, external DNS, or domain not hosted on our servers`);
            }
            
            const autoSSLResult = await whmService.focusedAutoSSLManagement(
              serverName, 
              hostingStatus.username, 
              domainsToProcess,
              { userDomainData: userDomainDataFromAnalysis }
            );
            
            if (autoSSLResult.success) {
              console.log(`✅ Focused AutoSSL Management Completed: ${autoSSLResult.message}`);
              
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
          console.log(`\n⚠️ SSL Certificate Invalid but Focused AutoSSL cannot be managed:`);
          if (!hostingStatus) {
            console.log(`→ No hosting status available - domain may not be hosted with us`);
          } else if (!hostingStatus.username) {
            console.log(`→ Username not available for domain ${domain} - cannot manage focused AutoSSL`);
          } else if (!hostingStatus.serverName) {
            console.log(`→ Server name not available - cannot determine focused AutoSSL server`);
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
      console.log(`\n⏭️ Skipping reachability check for ${domain}`);
      console.log(`→ DNS A record check failed - domain does not point to our servers`);
      console.log(`→ Reachability check not applicable for domains not pointing to our infrastructure`);
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
    
    console.log(`→ Testing syntax error ticket creation for: ${domain}`);
    
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
    
    console.log(`✅ Syntax error ticket test completed for ${domain}`);
    
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
    
    console.log(`→ Testing error log fetching for: ${domain}`);
    
    const whmService = require('../services/whmService');
    const result = await whmService.fetchErrorLogFor500(serverName, username, domain);
    
    console.log(`✅ Error log fetch test completed for ${domain}`);
    
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
