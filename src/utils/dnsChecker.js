const dns = require('dns').promises;

/**
 * DNS Propagation and Nameserver Checker
 * Helps distinguish between "Site Down" and "Propagation" issues
 */

// Static nameservers removed - now relies entirely on MongoDB cache for nameserver data

/**
 * Common third-party DNS providers with their nameserver patterns
 * Comprehensive list to identify external DNS management
 */
const KNOWN_DNS_PROVIDERS = {
  // Major Cloud Providers
  'cloudflare': [
    'ns1.cloudflare.com', 'ns2.cloudflare.com', 'ns3.cloudflare.com', 'ns4.cloudflare.com',
    'ns5.cloudflare.com', 'ns6.cloudflare.com', 'ns7.cloudflare.com',
    'cloudflare.com'
  ],
  'aws': [
    'ns-1.awsdns-00.com', 'ns-2.awsdns-00.net', 'ns-3.awsdns-00.org', 'ns-4.awsdns-00.co.uk',
    'ns1.amzndns.com', 'ns2.amzndns.com', 'ns1.amzndns.net', 'ns2.amzndns.net',
    'ns1.amzndns.org', 'ns2.amzndns.org', 'ns1.amzndns.co.uk', 'ns2.amzndns.co.uk',
    'awsdns-', 'awsdns', 'amzndns'
  ],
  'google': [
    'ns-cloud-a1.googledomains.com', 'ns-cloud-a2.googledomains.com', 'ns-cloud-a3.googledomains.com', 'ns-cloud-a4.googledomains.com',
    'ns1.google.com', 'ns2.google.com', 'ns3.google.com', 'ns4.google.com',
    'googledomains.com', 'google.com'
  ],
  'azure': [
    'ns1-01.azure-dns.com', 'ns2-01.azure-dns.net', 'ns3-01.azure-dns.org', 'ns4-01.azure-dns.info',
    'azure-dns.com', 'azure-dns.net', 'azure-dns.org', 'azure-dns.info'
  ],
  
  // Domain Registrars
  'godaddy': [
    'ns1.godaddy.com', 'ns2.godaddy.com', 'ns3.godaddy.com', 'ns4.godaddy.com',
    'ns01.domaincontrol.com', 'ns02.domaincontrol.com',
    'godaddy.com', 'domaincontrol.com'
  ],
  'namecheap': [
    'dns1.registrar-servers.com', 'dns2.registrar-servers.com', 'dns3.registrar-servers.com', 'dns4.registrar-servers.com',
    'ns1.namecheap.com', 'ns2.namecheap.com', 'ns3.namecheap.com',
    'registrar-servers.com', 'namecheap.com'
  ],
  'enom': [
    'ns1.enom.com', 'ns2.enom.com', 'ns3.enom.com', 'ns4.enom.com',
    'enom.com'
  ],
  'network_solutions': [
    'ns1.netsolhost.com', 'ns2.netsolhost.com', 'ns3.netsolhost.com',
    'netsolhost.com', 'networksolutions.com'
  ],
  'hover': [
    'ns1.hover.com', 'ns2.hover.com',
    'hover.com'
  ],
  'porkbun': [
    'curitiba.ns.porkbun.com', 'fortaleza.ns.porkbun.com', 'maceio.ns.porkbun.com', 'salvador.ns.porkbun.com',
    'porkbun.com'
  ],
  
  // Specialized DNS Providers
  'dnsimple': [
    'ns1.dnsimple.com', 'ns2.dnsimple.com', 'ns3.dnsimple.com', 'ns4.dnsimple.com',
    'dnsimple.com'
  ],
  'dnsmadeeasy': [
    'ns1.dnsmadeeasy.com', 'ns2.dnsmadeeasy.com', 'ns3.dnsmadeeasy.com', 'ns4.dnsmadeeasy.com',
    'dnsmadeeasy.com'
  ],
  'route53': [
    'ns-1.awsdns-00.com', 'ns-2.awsdns-00.net', 'ns-3.awsdns-00.org', 'ns-4.awsdns-00.co.uk',
    'awsdns'
  ],
  'ns1': [
    'dns1.p01.nsone.net', 'dns2.p01.nsone.net', 'dns3.p01.nsone.net', 'dns4.p01.nsone.net',
    'nsone.net'
  ],
  'easydns': [
    'ns1.easydns.com', 'ns2.easydns.com', 'ns3.easydns.org', 'ns4.easydns.info',
    'easydns.com', 'easydns.org', 'easydns.info'
  ],
  'zoneedit': [
    'ns1.zoneedit.com', 'ns2.zoneedit.com', 'ns3.zoneedit.com',
    'zoneedit.com'
  ],
  
  // Hosting Providers with DNS
  'bluehost': [
    'ns1.bluehost.com', 'ns2.bluehost.com',
    'bluehost.com'
  ],
  'hostgator': [
    'ns1.hostgator.com', 'ns2.hostgator.com', 'ns3.hostgator.com', 'ns4.hostgator.com',
    'hostgator.com'
  ],
  'siteground': [
    'ns1.siteground.net', 'ns2.siteground.net',
    'siteground.net'
  ],
  'dreamhost': [
    'ns1.dreamhost.com', 'ns2.dreamhost.com', 'ns3.dreamhost.com',
    'dreamhost.com'
  ],
  'a2hosting': [
    'ns1.a2hosting.com', 'ns2.a2hosting.com', 'ns3.a2hosting.com', 'ns4.a2hosting.com',
    'a2hosting.com'
  ],
  'inmotionhosting': [
    'ns1.inmotionhosting.com', 'ns2.inmotionhosting.com',
    'inmotionhosting.com'
  ],
  
  // CDN Providers
  'maxcdn': [
    'ns1.maxcdn.com', 'ns2.maxcdn.com',
    'maxcdn.com'
  ],
  'keycdn': [
    'ns1.keycdn.com', 'ns2.keycdn.com',
    'keycdn.com'
  ],
  
  // International Providers
  'ovh': [
    'dns1.ovh.net', 'dns2.ovh.net', 'ns1.ovh.net', 'ns2.ovh.net',
    'ovh.net', 'ovh.com'
  ],
  'hetzner': [
    'ns1.first-ns.de', 'ns2.first-ns.de', 'ns3.first-ns.de',
    'first-ns.de', 'hetzner.de'
  ],
  'digitalocean': [
    'ns1.digitalocean.com', 'ns2.digitalocean.com', 'ns3.digitalocean.com',
    'digitalocean.com'
  ],
  'linode': [
    'ns1.linode.com', 'ns2.linode.com', 'ns3.linode.com', 'ns4.linode.com', 'ns5.linode.com',
    'linode.com'
  ],
  'vultr': [
    'ns1.vultr.com', 'ns2.vultr.com',
    'vultr.com'
  ],
  
  // Free DNS Services
  'afraid': [
    'ns1.afraid.org', 'ns2.afraid.org', 'ns3.afraid.org', 'ns4.afraid.org',
    'afraid.org'
  ],
  'freedns': [
    'ns1.freedns.afraid.org', 'ns2.freedns.afraid.org', 'ns3.freedns.afraid.org', 'ns4.freedns.afraid.org',
    'freedns.afraid.org'
  ],
  'he': [
    'ns1.he.net', 'ns2.he.net', 'ns3.he.net', 'ns4.he.net', 'ns5.he.net',
    'he.net'
  ],
  
  // Enterprise DNS
  'ultradns': [
    'pdns1.ultradns.net', 'pdns2.ultradns.net', 'pdns3.ultradns.org', 'pdns4.ultradns.org',
    'ultradns.net', 'ultradns.org'
  ],
  'akamai': [
    'use1.akam.net', 'use2.akam.net', 'use3.akam.net', 'use4.akam.net',
    'akam.net', 'akamai.net'
  ],
  'dyn': [
    'ns1.p01.dynect.net', 'ns2.p01.dynect.net', 'ns3.p01.dynect.net', 'ns4.p01.dynect.net',
    'dynect.net'
  ],
  
  // Regional Providers
  '1and1': [
    'ns1.1and1.com', 'ns2.1and1.com',
    '1and1.com'
  ],
  'strato': [
    'ns1.strato.de', 'ns2.strato.de',
    'strato.de'
  ],
  'gandi': [
    'ns1.gandi.net', 'ns2.gandi.net', 'ns3.gandi.net',
    'gandi.net'
  ],
  'ovh_ca': [
    'ns1.ovh.ca', 'ns2.ovh.ca',
    'ovh.ca'
  ]
};

// Static server configuration removed - now relies entirely on MongoDB cache and WHMCS data

/**
 * Domain registrar detection based on nameservers
 */
const REGISTRAR_PATTERNS = {
  'godaddy': ['godaddy.com', 'domaincontrol.com'],
  'namecheap': ['namecheap.com', 'registrar-servers.com'],
  'cloudflare': ['cloudflare.com'],
  'google': ['googledomains.com', 'google.com'],
  'enom': ['enom.com'],
  'network_solutions': ['networksolutions.com', 'netsolhost.com'],
  'hover': ['hover.com'],
  'porkbun': ['porkbun.com'],
  'gandi': ['gandi.net'],
  'ovh': ['ovh.net', 'ovh.com'],
  'aws': ['awsdns', 'amzndns'],
  'azure': ['azure-dns.com', 'azure-dns.net'],
  'dnsimple': ['dnsimple.com'],
  'dnsmadeeasy': ['dnsmadeeasy.com']
};

// Dynamic server information (loaded from WHMCS)
let DYNAMIC_SERVER_INFO = null;
let LAST_SERVER_UPDATE = null;
const SERVER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get current server IPs (dynamic from WHMCS via MongoDB cache)
 */
async function getCurrentServerIPs() {
  try {
    const serverInfo = await getCurrentServerInfo();
    return serverInfo.serverIPs || [];
  } catch (error) {
    console.log('⚠️ Failed to get server IPs from cache:', error.message);
    return [];
  }
}

/**
 * Get current mail servers (dynamic from WHMCS via MongoDB cache)
 */
async function getCurrentMailServers() {
  try {
    const serverInfo = await getCurrentServerInfo();
    return serverInfo.mailServers || [];
  } catch (error) {
    console.log('⚠️ Failed to get mail servers from cache:', error.message);
    return [];
  }
}

/**
 * Get current nameservers (dynamic from WHMCS via MongoDB cache)
 */
async function getCurrentNameservers() {
  try {
    const serverInfo = await getCurrentServerInfo();
    const nameservers = serverInfo.nameservers || [];
    
    // If no nameservers from cache, return default hostbreak.com nameservers
    if (nameservers.length === 0) {
      console.log('⚠️ No nameservers from cache, using default hostbreak.com nameservers');
      return [
        'ns1.hostbreak.com',
        'ns2.hostbreak.com', 
        'ns3.hostbreak.com',
        'ns4.hostbreak.com',
        'ns5.hostbreak.com',
        'ns6.hostbreak.com'
      ];
    }
    
    return nameservers;
  } catch (error) {
    console.log('⚠️ Failed to get nameservers from cache:', error.message);
    // Return default nameservers as fallback
    return [
      'ns1.hostbreak.com',
      'ns2.hostbreak.com', 
      'ns3.hostbreak.com',
      'ns4.hostbreak.com',
      'ns5.hostbreak.com',
      'ns6.hostbreak.com'
    ];
  }
}

/**
 * Detect domain registrar based on nameservers
 * @param {Array} nameservers - Array of nameserver hostnames
 * @returns {string|null} Detected registrar name or null
 */
function detectRegistrar(nameservers) {
  if (!nameservers || nameservers.length === 0) return null;
  
  const normalizedNS = nameservers.map(ns => ns.toLowerCase().replace(/\.$/, ''));
  
  for (const [registrar, patterns] of Object.entries(REGISTRAR_PATTERNS)) {
    for (const pattern of patterns) {
      if (normalizedNS.some(ns => ns.includes(pattern))) {
        return registrar;
      }
    }
  }
  
  return null;
}

/**
 * Get current server information from MongoDB cache (optimized)
 */
async function getCurrentServerInfo() {
  try {
    // Import here to avoid circular dependency
    const { getServerDataOptimized } = require('../services/mongoServerService');
    
    console.log('📦 Getting server information from MongoDB cache');
    const serverData = await getServerDataOptimized();
    
    console.log(`→ Server info loaded: ${serverData.serverIPs.length} IPs, ${serverData.mailServers.length} mail servers, ${serverData.nameservers.length} nameservers (source: ${serverData.source})`);
    
    return serverData;
    
  } catch (error) {
    console.log('⚠️ Failed to get server info from MongoDB cache:', error.message);
    
    // Fallback to in-memory cache if available
    const now = Date.now();
    if (DYNAMIC_SERVER_INFO && LAST_SERVER_UPDATE && (now - LAST_SERVER_UPDATE) < SERVER_CACHE_TTL) {
      console.log('→ Using in-memory cached server info as fallback');
      return DYNAMIC_SERVER_INFO;
    }
    
    // No static fallback - return empty arrays if cache fails
    console.log('→ No server data available - cache and WHMCS both failed');
    return {
      serverIPs: [],
      mailServers: [],
      nameservers: [],
      lastUpdated: new Date().toISOString(),
      source: 'no_data_available'
    };
  }
}

/**
 * Perform comprehensive DNS record lookups with nameserver-first workflow
 * @param {string} domain - Domain to check
 * @returns {Object} Complete DNS record information with workflow-based analysis
 */
async function performComprehensiveDNSLookup(domain) {
  console.log(`🔍 Performing comprehensive DNS lookup for: ${domain}`);
  
  const results = {
    domain: domain,
    timestamp: new Date().toISOString(),
    records: {
      A: [],
      MX: [],
      NS: []
    },
    serverMatches: {
      aRecordsMatchOurServers: false,
      mxRecordsMatchOurServers: false,
      nsRecordsMatchOurServers: false,
      matchingARecords: [],
      matchingMXRecords: [],
      matchingNSRecords: []
    },
    workflow: {
      step: 'nameserver_check',
      recommendation: null,
      message: null,
      actionRequired: null
    },
    errors: {}
  };
  
  // STEP 1: Check NS records first (workflow priority)
  try {
    const nsRecords = await dns.resolveNs(domain);
    results.records.NS = nsRecords;
    console.log(`→ NS records:`, nsRecords);
    
    // Check if NS records match our nameservers (get from MongoDB cache)
    const normalizedNS = nsRecords.map(ns => ns.toLowerCase().replace(/\.$/, ''));
    
    // Get expected nameservers from MongoDB cache
    const expectedNameservers = await getCurrentNameservers();
    const normalizedExpected = expectedNameservers.map(ns => ns.toLowerCase());
    
    const matchingNSRecords = normalizedNS.filter(ns => 
      normalizedExpected.some(expected => ns.includes(expected) || expected.includes(ns))
    );
    results.serverMatches.matchingNSRecords = matchingNSRecords;
    results.serverMatches.nsRecordsMatchOurServers = matchingNSRecords.length > 0;
    
    if (matchingNSRecords.length > 0) {
      console.log(`✅ NS records match our servers:`, matchingNSRecords);
    } else {
      console.log(`❌ NS records don't match our servers`);
    }
  } catch (error) {
    console.log(`→ NS record lookup failed:`, error.message);
    results.errors.NS = error.message;
  }
  
  // STEP 2: Check A records
  try {
    const aRecords = await dns.resolve4(domain);
    results.records.A = aRecords;
    console.log(`→ A records:`, aRecords);
    
    // Check if A records match our server IPs (dynamic from WHMCS)
    const ourServerIPs = await getCurrentServerIPs();
    const matchingARecords = aRecords.filter(ip => ourServerIPs.includes(ip));
    results.serverMatches.matchingARecords = matchingARecords;
    results.serverMatches.aRecordsMatchOurServers = matchingARecords.length > 0;
    
    if (matchingARecords.length > 0) {
      console.log(`✅ A records match our servers:`, matchingARecords);
    } else {
      console.log(`❌ A records don't match our servers`);
    }
  } catch (error) {
    console.log(`→ A record lookup failed:`, error.message);
    results.errors.A = error.message;
  }
  
  // STEP 3: Apply workflow logic (NS first, then A record)
  const nsMatch = results.serverMatches.nsRecordsMatchOurServers;
  const aMatch = results.serverMatches.aRecordsMatchOurServers;
  
  // Detect registrar for better recommendations
  const detectedRegistrar = detectRegistrar(results.records.NS);
  const registrarName = detectedRegistrar ? detectedRegistrar.charAt(0).toUpperCase() + detectedRegistrar.slice(1) : 'your domain registrar';
  
  if (!nsMatch && aMatch) {
    // Case 1: A record matches ✅ but nameserver doesn't ❌
    // Recommendation: Check MX record at registrar
    results.workflow.step = 'nameserver_mismatch_check_mx';
    results.workflow.recommendation = 'check_mx_at_registrar';
    results.workflow.actionRequired = 'check_mx_records';
    results.workflow.registrar = detectedRegistrar;
    results.workflow.message = `Your website points to our servers (${results.serverMatches.matchingARecords.join(', ')}) but your nameservers are managed by ${registrarName}. Please check and update your MX records at ${registrarName} to ensure email delivery works correctly.`;
    console.log(`🚨 WORKFLOW: A record matches but NS doesn't - recommend checking MX at ${registrarName}`);
  } else if (nsMatch && !aMatch) {
    // Case 2: Nameserver matches ✅ but A record doesn't ❌  
    // Automatically attempt to fix A record using WHM with correct server IP
    results.workflow.step = 'a_record_mismatch_auto_fix';
    results.workflow.recommendation = 'auto_update_a_record';
    results.workflow.actionRequired = 'auto_fixing';
    
    console.log(`🔧 WORKFLOW: NS matches but A record doesn't - attempting automatic A record fix with server-specific IP`);
  } else if (nsMatch && aMatch && results.records.A.length > 1) {
    // Case 2b: Nameserver matches ✅ and A record matches ✅ but multiple A records exist (duplicates)
    // Check if there are duplicate A records that need cleanup
    const matchingARecords = results.serverMatches.matchingARecords || [];
    const allARecords = results.records.A || [];
    const nonMatchingARecords = allARecords.filter(ip => !matchingARecords.includes(ip));
    
    if (nonMatchingARecords.length > 0) {
      results.workflow.step = 'duplicate_a_records_cleanup';
      results.workflow.recommendation = 'auto_cleanup_duplicates';
      results.workflow.actionRequired = 'auto_fixing';
      
      console.log(`🔧 WORKFLOW: NS and A record match but duplicate A records detected - attempting automatic cleanup`);
      console.log(`   → Correct A records: ${matchingARecords.join(', ')}`);
      console.log(`   → Duplicate A records: ${nonMatchingARecords.join(', ')}`);
    } else {
      // All A records are correct, just multiple of the same IP
      results.workflow.step = 'multiple_correct_a_records';
      results.workflow.recommendation = 'none';
      results.workflow.actionRequired = 'none';
      results.workflow.message = `✅ DNS is correctly configured. Multiple A records found but all point to correct servers.`;
      console.log(`✅ WORKFLOW: Multiple A records found but all are correct - no action needed`);
      return results;
    }
    
    try {
      // Import WHM service for A record fixing
      const whmService = require('../services/whmService');
      
      // Attempt automatic A record fix (will find correct server and use its IP)
      const fixResult = await whmService.autoFixARecord(domain);
      
      if (fixResult.success) {
        results.workflow.autoFixResult = fixResult;
        results.workflow.actionRequired = 'completed';
        
        const newIP = fixResult.newIP || fixResult.correctIP || 'unknown';
        const oldIP = fixResult.oldIP || fixResult.currentIP || 'unknown';
        results.workflow.message = `✅ A record automatically updated! Your nameservers are correctly set and we've updated your A record from ${oldIP} to ${newIP} on server ${fixResult.server.toUpperCase()}. Your website should now point to the correct server.`;
        console.log(`✅ WORKFLOW: A record auto-fix successful - ${domain} → ${newIP} (server: ${fixResult.server})`);
        
        // Update the A records in results to reflect the change
        const newIPs = newIP.includes(',') ? newIP.split(', ') : [newIP];
        results.records.A = newIPs;
        results.serverMatches.aRecordsMatchOurServers = true;
        results.serverMatches.matchingARecords = newIPs;
      } else {
        results.workflow.autoFixResult = fixResult;
        results.workflow.actionRequired = 'manual_update';
        
        let errorDetails = '';
        if (fixResult.server) {
          errorDetails = ` (Domain found on server ${fixResult.server.toUpperCase()})`;
        }
        
        results.workflow.message = `⚠️ Automatic A record update failed: ${fixResult.error}${errorDetails}. Your nameservers are correctly set to our servers, but your website points elsewhere (${results.records.A.join(', ')}). Please manually update your A record using cPanel DNS Zone Editor.`;
        console.log(`❌ WORKFLOW: A record auto-fix failed - ${fixResult.error}`);
      }
    } catch (error) {
      console.log(`❌ WORKFLOW: A record auto-fix error - ${error.message}`);
      results.workflow.autoFixResult = { success: false, error: error.message };
      results.workflow.actionRequired = 'manual_update';
      results.workflow.message = `⚠️ Automatic A record update encountered an error: ${error.message}. Your nameservers are correctly set to our servers, but your website points elsewhere (${results.records.A.join(', ')}). Please manually update your A record using WHM/cPanel DNS Zone Editor.`;
    }
  } else if (nsMatch && aMatch) {
    // Case 3: Both match ✅✅ - Perfect configuration
    results.workflow.step = 'all_configured_correctly';
    results.workflow.recommendation = 'none';
    results.workflow.actionRequired = null;
    results.workflow.message = `Your domain is correctly configured. Both nameservers and website point to our servers.`;
    console.log(`✅ WORKFLOW: Domain correctly configured`);
  } else {
    // Case 4: Both don't match ❌❌ - Update nameservers
    // Recommendation: Update nameservers to our servers
    results.workflow.step = 'both_mismatch_update_nameservers';
    results.workflow.recommendation = 'update_nameservers_to_ours';
    results.workflow.actionRequired = 'update_nameservers';
    results.workflow.registrar = detectedRegistrar;
    results.workflow.message = `Your domain is managed externally. Please update your nameservers to our servers: ${(await getCurrentNameservers()).join(', ')} at ${registrarName} to use our hosting services.`;
    console.log(`ℹ️ WORKFLOW: Both don't match - recommend updating nameservers to ours at ${registrarName}`);
  }
  
  // STEP 4: Check MX records (supplementary) - DISABLED
  // MX record checking disabled - not critical for hosting verification
  // Clients may use external email services, so MX mismatch is not an error
  /*
  try {
    const mxRecords = await dns.resolveMx(domain);
    results.records.MX = mxRecords;
    console.log(`→ MX records:`, mxRecords);
    
    // Check if MX records match our mail servers (dynamic from WHMCS)
    const ourMailServers = await getCurrentMailServers();
    const matchingMXRecords = mxRecords.filter(mx => {
      const exchangeLower = mx.exchange.toLowerCase().replace(/\.$/, '');
      return ourMailServers.some(ourMail => {
        const ourMailLower = ourMail.toLowerCase();
        return exchangeLower.includes(ourMailLower) || ourMailLower.includes(exchangeLower);
      });
    });
    results.serverMatches.matchingMXRecords = matchingMXRecords;
    results.serverMatches.mxRecordsMatchOurServers = matchingMXRecords.length > 0;
    
    if (matchingMXRecords.length > 0) {
      console.log(`✅ MX records match our servers:`, matchingMXRecords);
    } else {
      console.log(`❌ MX records don't match our servers`);
    }
  } catch (error) {
    console.log(`→ MX record lookup failed:`, error.message);
    results.errors.MX = error.message;
  }
  */
  
  return results;
}

/**
 * Check DNS propagation and nameserver configuration for a domain
 * @param {string} domain - Domain to check
 * @param {Array} whmcsNameservers - Optional nameservers from WHMCS (faster than DNS lookup)
 * @returns {Object} DNS analysis result
 */
async function checkDNSPropagation(domain, whmcsNameservers = null) {
  console.log(`🔍 Checking DNS propagation for: ${domain}`);
  
  try {
    let nsRecords = [];
    let dataSource = 'dns_lookup';
    
    // Step 1: Try live DNS lookup first (most current data)
    try {
      nsRecords = await dns.resolveNs(domain);
      dataSource = 'dns_lookup';
      console.log(`→ Found NS records via live DNS lookup:`, nsRecords);
    } catch (dnsError) {
      // Step 2: Fallback to WHMCS nameservers if DNS lookup fails
      if (whmcsNameservers && Array.isArray(whmcsNameservers) && whmcsNameservers.length > 0) {
        nsRecords = whmcsNameservers;
        dataSource = 'whmcs_fallback';
        console.log(`→ DNS lookup failed, using WHMCS nameservers:`, nsRecords);
        console.log(`→ DNS error was:`, dnsError.message);
      } else {
        // No WHMCS data available, re-throw the DNS error
        throw dnsError;
      }
    }
    
    // Step 2: Normalize nameserver names (remove trailing dots, lowercase)
    const normalizedNS = nsRecords.map(ns => ns.toLowerCase().replace(/\.$/, ''));
    
    // Get expected nameservers from MongoDB cache
    const expectedNameservers = await getCurrentNameservers();
    const normalizedExpected = expectedNameservers.map(ns => ns.toLowerCase());
    
    // Step 3: Check if domain uses our nameservers
    const usesOurNS = normalizedNS.some(ns => 
      normalizedExpected.some(expected => ns.includes(expected) || expected.includes(ns))
    );
    
    // Step 4: Identify third-party DNS provider
    let dnsProvider = null;
    let providerConfidence = 0;
    
    for (const [provider, servers] of Object.entries(KNOWN_DNS_PROVIDERS)) {
      let matches = 0;
      let totalChecks = 0;
      
      for (const ns of normalizedNS) {
        for (const server of servers) {
          totalChecks++;
          const serverLower = server.toLowerCase();
          
          // Exact match (highest confidence)
          if (ns === serverLower) {
            matches += 3;
          }
          // NS contains server pattern (high confidence)
          else if (ns.includes(serverLower)) {
            matches += 2;
          }
          // Server pattern contains NS (medium confidence)
          else if (serverLower.includes(ns)) {
            matches += 1;
          }
        }
      }
      
      // Calculate confidence score
      const confidence = matches / Math.max(totalChecks, 1);
      
      if (matches > 0 && confidence > providerConfidence) {
        dnsProvider = provider;
        providerConfidence = confidence;
      }
    }
    
    // Step 5: Determine diagnosis
    let diagnosis = 'unknown';
    let message = '';
    let actionRequired = null;
    let isHostingIssue = false;
    let isExternalDNS = false;
    
    if (usesOurNS) {
      diagnosis = 'hosting_issue';
      isHostingIssue = true;
      message = `Domain ${domain} is properly configured with our nameservers (${normalizedNS.join(', ')}). The issue is likely hosting-related, not DNS propagation.`;
      actionRequired = 'check_hosting';
    } else if (dnsProvider) {
      diagnosis = 'external_dns';
      isExternalDNS = true;
      message = `Domain ${domain} is using ${dnsProvider.toUpperCase()} DNS management (${normalizedNS.join(', ')}). Any cPanel DNS changes will have no effect. You need to manage DNS records through ${dnsProvider.toUpperCase()}.`;
      actionRequired = 'manage_external_dns';
    } else {
      diagnosis = 'custom_dns';
      isExternalDNS = true;
      message = `Domain ${domain} is using custom nameservers (${normalizedNS.join(', ')}). Any cPanel DNS changes will have no effect. You need to manage DNS records through your DNS provider.`;
      actionRequired = 'manage_external_dns';
    }
    
    // Step 6: Perform comprehensive DNS record lookup (A, MX, NS)
    let comprehensiveDNS = null;
    try {
      if (dataSource === 'dns_lookup') {
        // Only do comprehensive lookup if we successfully did live DNS lookup
        comprehensiveDNS = await performComprehensiveDNSLookup(domain);
        
        // Enhance diagnosis with server matching information
        if (comprehensiveDNS.serverMatches.aRecordsMatchOurServers && usesOurNS) {
          message += ` Website is pointing to our servers.`;
        } else if (comprehensiveDNS.serverMatches.aRecordsMatchOurServers && !usesOurNS) {
          message += ` Website points to our servers but DNS is managed externally.`;
        } else if (!comprehensiveDNS.serverMatches.aRecordsMatchOurServers && usesOurNS) {
          message += ` DNS managed by us but website points elsewhere.`;
        }
        
        if (comprehensiveDNS.serverMatches.mxRecordsMatchOurServers) {
          message += ` Email is configured with our mail servers.`;
        } else if (comprehensiveDNS.records.MX.length > 0) {
          message += ` Email is managed externally.`;
        }
      }
    } catch (dnsLookupError) {
      console.log(`→ Comprehensive DNS lookup failed:`, dnsLookupError.message);
    }

    return {
      success: true,
      domain: domain,
      propagated: true,
      nameservers: normalizedNS,
      expectedNameservers: normalizedExpected,
      usesOurNameservers: usesOurNS,
      dnsProvider: dnsProvider,
      diagnosis: diagnosis,
      isHostingIssue: isHostingIssue,
      isExternalDNS: isExternalDNS,
      actionRequired: actionRequired,
      message: message,
      dataSource: dataSource, // dns_lookup, whmcs_fallback, or dns_error
      comprehensiveDNS: comprehensiveDNS // A, MX, NS records with server matching
    };
    
  } catch (error) {
    console.log(`→ DNS lookup failed:`, error.message);
    
    // Try WHMCS fallback for propagation issues
    if ((error.code === 'ENOTFOUND' || error.code === 'ENODATA') && 
        whmcsNameservers && Array.isArray(whmcsNameservers) && whmcsNameservers.length > 0) {
      
      console.log(`→ Domain not propagating, but WHMCS has nameserver data. Using WHMCS fallback.`);
      
      // Use WHMCS data to provide some analysis
      const normalizedNS = whmcsNameservers.map(ns => ns.toLowerCase().replace(/\.$/, ''));
      
      // Get expected nameservers from MongoDB cache
      const expectedNameservers = await getCurrentNameservers();
      const normalizedExpected = expectedNameservers.map(ns => ns.toLowerCase());
      
      const usesOurNS = normalizedNS.some(ns => 
        normalizedExpected.some(expected => ns.includes(expected) || expected.includes(ns))
      );
      
      let dnsProvider = null;
      for (const [provider, servers] of Object.entries(KNOWN_DNS_PROVIDERS)) {
        const matchesProvider = normalizedNS.some(ns => 
          servers.some(server => ns.includes(server.toLowerCase()) || server.toLowerCase().includes(ns))
        );
        if (matchesProvider) {
          dnsProvider = provider;
          break;
        }
      }
      
      let diagnosis = 'not_propagated_whmcs';
      let message = `Domain ${domain} is not propagating yet, but WHMCS shows nameservers: ${normalizedNS.join(', ')}. `;
      
      if (usesOurNS) {
        message += `These are our nameservers, so propagation should complete soon.`;
      } else if (dnsProvider) {
        message += `These are ${dnsProvider.toUpperCase()} nameservers. Check ${dnsProvider.toUpperCase()} for DNS management.`;
      } else {
        message += `These are custom nameservers. Check with your DNS provider.`;
      }
      
      return {
        success: true,
        domain: domain,
        propagated: false,
        nameservers: normalizedNS,
        expectedNameservers: normalizedExpected,
        usesOurNameservers: usesOurNS,
        dnsProvider: dnsProvider,
        diagnosis: diagnosis,
        isHostingIssue: false,
        isExternalDNS: !usesOurNS,
        actionRequired: 'wait_propagation',
        message: message,
        dataSource: 'whmcs_fallback',
        error: error.code
      };
    }
    
    // Handle different error types (no WHMCS fallback available)
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      // Get expected nameservers from MongoDB cache for error response
      const expectedNameservers = await getCurrentNameservers();
      
      return {
        success: true,
        domain: domain,
        propagated: false,
        nameservers: [],
        expectedNameservers: expectedNameservers,
        usesOurNameservers: false,
        dnsProvider: null,
        diagnosis: 'not_propagated',
        isHostingIssue: false,
        isExternalDNS: false,
        actionRequired: 'wait_propagation',
        message: `Domain ${domain} is not propagating yet. DNS records are not found. This usually takes 24-48 hours after domain registration or nameserver changes.`,
        dataSource: 'dns_error',
        error: error.code
      };
    }
    
    // Other DNS errors
    // Get expected nameservers from MongoDB cache for error response
    const expectedNameservers = await getCurrentNameservers();
    
    return {
      success: false,
      domain: domain,
      propagated: false,
      nameservers: [],
      expectedNameservers: expectedNameservers,
      usesOurNameservers: false,
      dnsProvider: null,
      diagnosis: 'dns_error',
      isHostingIssue: false,
      isExternalDNS: false,
      actionRequired: 'contact_support',
      message: `Unable to check DNS for ${domain}. Error: ${error.message}`,
      dataSource: 'dns_error',
      error: error.code || error.message
    };
  }
}

/**
 * Quick check if domain is using our nameservers
 * @param {string} domain - Domain to check
 * @returns {boolean} True if using our nameservers
 */
async function isUsingOurNameservers(domain) {
  try {
    const result = await checkDNSPropagation(domain);
    return result.usesOurNameservers;
  } catch (error) {
    console.log(`→ Quick NS check failed for ${domain}:`, error.message);
    return false;
  }
}

/**
 * Get human-readable DNS status for service status responses
 * @param {string} domain - Domain to check
 * @param {Array} whmcsNameservers - Optional nameservers from WHMCS
 * @returns {Object} Simplified DNS status
 */
async function getDNSStatus(domain, whmcsNameservers = null) {
  const result = await checkDNSPropagation(domain, whmcsNameservers);
  
  return {
    propagated: result.propagated,
    usesOurNameservers: result.usesOurNameservers,
    isExternalDNS: result.isExternalDNS,
    diagnosis: result.diagnosis,
    actionRequired: result.actionRequired,
    shortMessage: getShortDNSMessage(result)
  };
}

/**
 * Get short DNS message for inclusion in service status
 * @param {Object} dnsResult - Result from checkDNSPropagation
 * @returns {string} Short message
 */
function getShortDNSMessage(dnsResult) {
  switch (dnsResult.diagnosis) {
    case 'hosting_issue':
      return 'DNS is properly configured. Issue is hosting-related.';
    case 'external_dns':
      return `DNS managed externally${dnsResult.dnsProvider ? ` via ${dnsResult.dnsProvider.toUpperCase()}` : ''}. cPanel DNS changes won't work.`;
    case 'custom_dns':
      return 'DNS managed by custom nameservers. cPanel DNS changes won\'t work.';
    case 'not_propagated':
      return 'Domain not propagating yet. Wait 24-48 hours.';
    case 'not_propagated_whmcs':
      return 'Domain not propagating yet, but WHMCS shows nameserver config.';
    case 'dns_error':
      return 'Unable to check DNS status.';
    default:
      return 'DNS status unknown.';
  }
}

module.exports = {
  checkDNSPropagation,
  performComprehensiveDNSLookup,
  isUsingOurNameservers,
  getDNSStatus,
  getCurrentServerInfo,
  getCurrentServerIPs,
  getCurrentMailServers,
  getCurrentNameservers,
  detectRegistrar,
  KNOWN_DNS_PROVIDERS,
  REGISTRAR_PATTERNS
};