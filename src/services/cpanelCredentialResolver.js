const { getClientsProducts, getClientsDetails } = require('./whmcsService');
const whmService = require('./whmService');
const { normalizePhone, phonesMatch, maskPhone } = require('../utils/phoneNormalizer');

// Optimized logger for credential resolver - silent in production
const logger = (() => {
  const winston = require('winston');
  
  // Silent logger in production for maximum performance
  if (process.env.NODE_ENV === 'production') {
    return {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    };
  }
  
  // Minimal logging in development
  return winston.createLogger({
    level: 'error', // Only log errors in development
    format: winston.format.simple(),
    transports: [
      new winston.transports.Console({
        silent: process.env.NODE_ENV === 'test'
      })
    ]
  });
})();

// Optimized cache with better memory management
const clientCache = new Map();
const serverCache = new Map();
const dnsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 500; // Prevent memory bloat

// Optimized cache cleanup with LRU eviction
let lastCacheCleanup = Date.now();
const CACHE_CLEANUP_INTERVAL = 60000; // 1 minute

function cleanupCaches() {
  const now = Date.now();
  
  // Only cleanup if interval has passed
  if (now - lastCacheCleanup < CACHE_CLEANUP_INTERVAL) return;
  
  [clientCache, serverCache, dnsCache].forEach(cache => {
    // Remove expired entries
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        cache.delete(key);
      }
    }
    
    // If cache is still too large, remove oldest entries (LRU)
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, cache.size - MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => cache.delete(key));
    }
  });
  
  lastCacheCleanup = now;
}

class CpanelCredentialResolver {
  constructor() {
    this.whmService = whmService;
    this.logger = logger;
  }

  /**
   * Optimized credential resolution with parallel email/domain lookup and phone verification
   */
  async resolveCpanelCredentials(domain, email = null, phone = null) {
    try {
      // Trigger cache cleanup if needed (non-blocking)
      cleanupCaches();
      
      const result = {
        success: false,
        domain,
        clientInfo: null,
        serverInfo: null,
        cpanelCredentials: null,
        error: null
      };

      // Step 1: PARALLEL client lookup with email AND domain
      let clientId = null;
      let foundClient = null;
      let resolvedFrom = null;
      
      // PARALLEL RESOLUTION: Try email AND domain simultaneously
      const parallelTasks = [];
      
      // Task 1: Email lookup (if provided)
      if (email) {
        const cacheKey = `client:email:${email}`;
        const cached = clientCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
          // Use cached result immediately
          foundClient = cached.data;
          clientId = cached.data.id;
          resolvedFrom = 'email_cache';
        } else {
          // Add to parallel tasks
          parallelTasks.push(
            Promise.race([
              this.findClientByEmail(email),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Email lookup timeout')), 10000)
              )
            ])
              .then(result => ({ type: 'email', success: true, data: result, cacheKey }))
              .catch(error => ({ type: 'email', success: false, error: error.message }))
          );
        }
      }
      
      // Task 2: Domain lookup (always try in parallel with email)
      if (!foundClient) { // Only if not found in cache
        parallelTasks.push(
          Promise.race([
            this.findClientByDomain(domain),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Domain lookup timeout')), 15000)
            )
          ])
            .then(result => ({ type: 'domain', success: true, data: result }))
            .catch(error => ({ type: 'domain', success: false, error: error.message }))
        );
      }
      
      // Execute parallel lookups if we have tasks
      if (parallelTasks.length > 0 && !foundClient) {
        const lookupResults = await Promise.allSettled(parallelTasks);
        
        // Process results - prioritize successful resolutions
        let emailResult = null;
        let domainResult = null;
        
        for (const result of lookupResults) {
          if (result.status === 'fulfilled' && result.value.success && result.value.data) {
            if (result.value.type === 'email') {
              emailResult = result.value;
            } else if (result.value.type === 'domain') {
              domainResult = result.value;
            }
          }
        }
        
        // Determine which resolution to use - handle edge cases
        if (emailResult && domainResult) {
          // Both resolved - check if they match
          if (emailResult.data.id === domainResult.data.id) {
            foundClient = emailResult.data;
            clientId = emailResult.data.id;
            resolvedFrom = 'email+domain';
            
            // Cache email result
            if (clientCache.size < MAX_CACHE_SIZE && emailResult.cacheKey) {
              clientCache.set(emailResult.cacheKey, {
                data: foundClient,
                timestamp: Date.now()
              });
            }
          } else {
            // Edge case: Different clients found - prioritize domain over email
            // This handles cases where email is wrong but domain is correct
            foundClient = domainResult.data;
            clientId = domainResult.data.id;
            resolvedFrom = 'domain_priority';
          }
        } else if (emailResult) {
          // Only email resolved - domain was wrong or lookup failed
          foundClient = emailResult.data;
          clientId = emailResult.data.id;
          resolvedFrom = 'email';
          
          // Cache email result
          if (clientCache.size < MAX_CACHE_SIZE && emailResult.cacheKey) {
            clientCache.set(emailResult.cacheKey, {
              data: foundClient,
              timestamp: Date.now()
            });
          }
        } else if (domainResult) {
          // Only domain resolved - email was wrong or not provided
          foundClient = domainResult.data;
          clientId = domainResult.data.id;
          resolvedFrom = 'domain';
        }
      }
      
      // Strategy 2: Try phone lookup if still no client found
      if (!foundClient && phone) {
        try {
          foundClient = await Promise.race([
            this.findClientByPhone(phone),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Phone lookup timeout')), 10000)
            )
          ]);
          
          if (foundClient) {
            clientId = foundClient.id;
            resolvedFrom = 'phone';
          }
        } catch (error) {
          // Phone lookup failed
          foundClient = null;
        }
      }

      // If we found a client but phone was provided, verify phone number
      if (foundClient && phone && foundClient.phonenumber) {
        if (!phonesMatch(phone, foundClient.phonenumber)) {
          // Phone number doesn't match - return specific error format
          result.error = {
            type: 'phone_verification_failed',
            message: `Phone number verification failed. Please contact us using the registered number: ${maskPhone(foundClient.phonenumber)}`,
            registeredPhone: maskPhone(foundClient.phonenumber)
          };
          return result;
        }
      }

      // If still no client found, return error
      if (!clientId) {
        result.error = 'Client not found with provided email, phone, or domain ownership';
        return result;
      }

      result.clientInfo = foundClient;
      result.resolvedFrom = resolvedFrom; // Track how client was resolved

      // Step 2: Find hosting service (with caching and timeout)
      const hostingCacheKey = `hosting:${clientId}:${domain}`;
      let hostingService = null;
      
      const cachedHosting = clientCache.get(hostingCacheKey);
      if (cachedHosting && (Date.now() - cachedHosting.timestamp < CACHE_TTL)) {
        hostingService = cachedHosting.data;
      } else {
        try {
          hostingService = await Promise.race([
            this.findHostingServiceForDomain(clientId, domain),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Hosting service lookup timeout')), 15000)
            )
          ]);
          
          if (hostingService && clientCache.size < MAX_CACHE_SIZE) {
            clientCache.set(hostingCacheKey, {
              data: hostingService,
              timestamp: Date.now()
            });
          }
        } catch (error) {
          hostingService = null;
        }
      }
      
      if (!hostingService) {
        console.log(`❌ No hosting service found for domain: ${domain} (clientId: ${clientId})`);
        result.error = `No hosting service found for domain: ${domain}`;
        return result;
      }
      
      console.log(`→ Found hosting service for ${domain}:`, {
        id: hostingService.id,
        server: hostingService.server,
        status: hostingService.status,
        name: hostingService.name || hostingService.productname
      });

      // Step 3: Get server information (with caching and timeout)
      let serverInfo = null;
      try {
        serverInfo = await Promise.race([
          this.getServerInfoCached(hostingService.server, domain, clientId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Server info lookup timeout')), 10000)
          )
        ]);
      } catch (error) {
        serverInfo = null;
      }
      
      if (!serverInfo) {
        result.error = `Server information not found for: ${hostingService.server}`;
        return result;
      }

      result.serverInfo = serverInfo;

      // Step 4: Get cPanel username (with caching and timeout)
      const usernameCacheKey = `username:${domain}:${serverInfo.serverName}`;
      let cpanelUsername = null;
      
      const cachedUsername = serverCache.get(usernameCacheKey);
      if (cachedUsername && (Date.now() - cachedUsername.timestamp < CACHE_TTL)) {
        cpanelUsername = cachedUsername.data;
      } else {
        try {
          cpanelUsername = await Promise.race([
            this.getCpanelUsername(domain, serverInfo.serverName),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Username lookup timeout')), 10000)
            )
          ]);
          
          if (cpanelUsername && serverCache.size < MAX_CACHE_SIZE) {
            serverCache.set(usernameCacheKey, {
              data: cpanelUsername,
              timestamp: Date.now()
            });
          }
        } catch (error) {
          cpanelUsername = null;
        }
      }
      
      if (!cpanelUsername) {
        result.error = `cPanel username not found for domain: ${domain}`;
        return result;
      }

      // Build credentials object
      result.cpanelCredentials = {
        host: serverInfo.hostname,
        port: 2083,
        username: cpanelUsername,
        password: null // Password setting disabled
      };

      result.success = true;
      
      return result;

    } catch (error) {
      this.logger.error(`Error resolving cPanel credentials: ${error.message}`);
      return {
        success: false,
        domain,
        error: error.message,
        clientInfo: null,
        serverInfo: null,
        cpanelCredentials: null
      };
    }
  }

  /**
   * Find client by email address
   */
  async findClientByEmail(email) {
    try {
      const clientDetails = await getClientsDetails({ email });
      
      if (clientDetails && clientDetails.client) {
        return {
          id: clientDetails.client.id,
          email: clientDetails.client.email,
          firstname: clientDetails.client.firstname,
          lastname: clientDetails.client.lastname
        };
      }
      
      return null;
    } catch (error) {
      // Silent error handling in production
      return null;
    }
  }

  /**
   * Find client by phone number
   */
  async findClientByPhone(phone) {
    try {
      // Normalize phone number for comparison
      const normalizedPhone = normalizePhone(phone);
      
      // WHMCS doesn't have direct phone search, so we need to search by phone number
      // Using GetClientsDetails with phonenumber parameter
      const clientDetails = await getClientsDetails({ phonenumber: phone });
      
      if (clientDetails && clientDetails.client) {
        return {
          id: clientDetails.client.id,
          email: clientDetails.client.email,
          firstname: clientDetails.client.firstname,
          lastname: clientDetails.client.lastname,
          phonenumber: clientDetails.client.phonenumber
        };
      }
      
      return null;
    } catch (error) {
      // If direct phone search fails, try searching all clients (fallback)
      return await this.findClientByPhoneFallback(phone);
    }
  }

  /**
   * Fallback method to find client by phone number by searching through clients
   */
  async findClientByPhoneFallback(phone) {
    try {
      const normalizedPhone = normalizePhone(phone);
      
      // This is a more expensive operation - search through clients
      // We'll limit this to avoid performance issues
      const { getClientsDetails } = require('./whmcsService');
      
      // Try searching with different phone number formats
      const phoneVariations = this.generatePhoneVariations(phone);
      
      for (const phoneVariation of phoneVariations) {
        try {
          const clientDetails = await getClientsDetails({ phonenumber: phoneVariation });
          if (clientDetails && clientDetails.client) {
            return {
              id: clientDetails.client.id,
              email: clientDetails.client.email,
              firstname: clientDetails.client.firstname,
              lastname: clientDetails.client.lastname,
              phonenumber: clientDetails.client.phonenumber
            };
          }
        } catch (searchError) {
          // Continue to next variation
          continue;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Normalize phone number for comparison
   */
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    
    // Remove all non-digit characters except +
    let normalized = phone.replace(/[^\d+]/g, '');
    
    // If it starts with +1, remove the +1 for US numbers
    if (normalized.startsWith('+1')) {
      normalized = normalized.substring(2);
    } else if (normalized.startsWith('1') && normalized.length === 11) {
      // Remove leading 1 for US numbers
      normalized = normalized.substring(1);
    }
    
    return normalized;
  }

  /**
   * Generate phone number variations for search
   */
  generatePhoneVariations(phone) {
    const normalized = normalizePhone(phone);
    const variations = [
      phone, // Original format
      normalized, // Normalized format
      `+92${normalized}`, // With +92 prefix for Pakistani numbers
      `92${normalized}`, // With 92 prefix
      `0${normalized}`, // With 0 prefix (local Pakistani format)
      `+1${normalized}`, // With +1 prefix for US numbers
      `1${normalized}`, // With 1 prefix
      `(${normalized.substring(0,3)}) ${normalized.substring(3,6)}-${normalized.substring(6)}`, // (123) 456-7890
      `${normalized.substring(0,3)}-${normalized.substring(3,6)}-${normalized.substring(6)}`, // 123-456-7890
      `${normalized.substring(0,3)}.${normalized.substring(3,6)}.${normalized.substring(6)}`, // 123.456.7890
      `${normalized.substring(0,3)} ${normalized.substring(3,6)} ${normalized.substring(6)}` // 123 456 7890
    ];
    
    // Remove duplicates and empty strings
    return [...new Set(variations.filter(v => v && v.length > 0))];
  }

  /**
   * Mask phone number for display (show first 3 and last 2 digits)
   */
  maskPhoneNumber(phone) {
    if (!phone) return '';
    
    const normalized = this.normalizePhoneNumber(phone);
    if (normalized.length < 5) return phone; // Too short to mask meaningfully
    
    if (normalized.length === 10) {
      // US format: 1234567890 -> 123*****90
      return `${normalized.substring(0, 3)}*****${normalized.substring(8)}`;
    } else if (normalized.length > 10) {
      // International format: show first 3 and last 2
      return `${normalized.substring(0, 3)}*****${normalized.substring(normalized.length - 2)}`;
    } else {
      // Shorter numbers: show first 2 and last 2
      return `${normalized.substring(0, 2)}***${normalized.substring(normalized.length - 2)}`;
    }
  }

  /**
   * Find client by domain ownership (through hosting services)
   */
  async findClientByDomain(domain) {
    try {
      // Search through WHMCS products to find the domain owner
      const { callApi } = require('./whmcsService');
      
      // Method 1: Search for products with this domain and get full details
      try {
        // Search for hosting products that match this domain
        const searchResult = await callApi('GetClientsProducts', { 
          domain: domain,
          limitnum: 50,
          stats: true // Include additional statistics and details
        });
        
        if (searchResult && searchResult.products && searchResult.products.product) {
          const products = Array.isArray(searchResult.products.product) 
            ? searchResult.products.product 
            : [searchResult.products.product];
          
          // Find the first active hosting product
          const hostingProduct = products.find(product => 
            product.groupname && 
            product.groupname.toLowerCase().includes('hosting') &&
            (product.status === 'Active' || product.status === 'Suspended')
          );
          
          if (hostingProduct && (hostingProduct.userid || hostingProduct.clientid)) {
            const clientId = hostingProduct.userid || hostingProduct.clientid;
            
            // Get client details for this user
            const { getClientsDetails } = require('./whmcsService');
            const clientDetails = await getClientsDetails({ clientid: clientId });
            
            if (clientDetails && clientDetails.client) {
              return {
                id: clientDetails.client.id,
                email: clientDetails.client.email,
                firstname: clientDetails.client.firstname,
                lastname: clientDetails.client.lastname,
                phonenumber: clientDetails.client.phonenumber
              };
            }
          }
        }
      } catch (searchError) {
        // Continue with alternative method
      }
      
      // Method 2: Search through all clients and their products
      try {
        // Get a list of clients and check their products
        const clientsResult = await callApi('GetClients', { 
          limitnum: 100,
          limitstart: 0
        });
        
        if (clientsResult && clientsResult.clients && clientsResult.clients.client) {
          const clients = Array.isArray(clientsResult.clients.client) 
            ? clientsResult.clients.client 
            : [clientsResult.clients.client];
          
          // Check each client's products for the domain
          for (const client of clients.slice(0, 20)) { // Limit to first 20 clients for performance
            try {
              const clientProducts = await callApi('GetClientsProducts', {
                clientid: client.id,
                limitnum: 50
              });
              
              if (clientProducts && clientProducts.products && clientProducts.products.product) {
                const products = Array.isArray(clientProducts.products.product) 
                  ? clientProducts.products.product 
                  : [clientProducts.products.product];
                
                const matchingProduct = products.find(product => 
                  product.domain === domain ||
                  (product.customfields && this.checkCustomFieldsForDomain(product.customfields, domain))
                );
                
                if (matchingProduct && (matchingProduct.userid || matchingProduct.clientid)) {
                  const clientId = matchingProduct.userid || matchingProduct.clientid;
                  
                  // Get full client details
                  const { getClientsDetails } = require('./whmcsService');
                  const clientDetails = await getClientsDetails({ clientid: clientId });
                  
                  if (clientDetails && clientDetails.client) {
                    return {
                      id: clientDetails.client.id,
                      email: clientDetails.client.email,
                      firstname: clientDetails.client.firstname,
                      lastname: clientDetails.client.lastname,
                      phonenumber: clientDetails.client.phonenumber
                    };
                  }
                }
              }
            } catch (clientError) {
              // Continue to next client
              continue;
            }
          }
        }
      } catch (clientsError) {
        // Continue to return null
      }
      
      return null;
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Fallback method to find client by searching through all active hosting products
   */
  async findClientByDomainFallback(domain) {
    try {
      // This is expensive - search through clients' products
      // We'll implement a limited search to avoid performance issues
      
      // For now, return null to avoid expensive operations
      // This can be enhanced later if needed
      return null;
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Optimized hosting service lookup with better server resolution
   */
  async findHostingServiceForDomain(clientId, domain) {
    try {
      // First try to get products for this specific domain (more efficient)
      console.log(`→ Looking for hosting service for domain: ${domain} (clientId: ${clientId})`);
      
      const products = await getClientsProducts(clientId, { domain: domain });
      
      if (products && products.products) {
        const productList = products.products.product || products.products;
        const productArray = Array.isArray(productList) ? productList : [productList];
        
        if (productArray.length > 0) {
          // Prefer Active services over others
          let selectedProduct = productArray.find(p => p.status === 'Active') || productArray[0];
          
          console.log(`→ Found hosting product for ${domain}:`, {
            id: selectedProduct.id,
            server: selectedProduct.server,
            servername: selectedProduct.servername,
            serverid: selectedProduct.serverid,
            status: selectedProduct.status,
            productname: selectedProduct.productname
          });
          
          return {
            id: selectedProduct.id,
            domain: selectedProduct.domain,
            server: selectedProduct.servername || selectedProduct.server, // Prefer servername over server
            serverid: selectedProduct.serverid,
            status: selectedProduct.status,
            product: selectedProduct.productname,
            servername: selectedProduct.servername,
            servertype: selectedProduct.servertype,
            dedicatedip: selectedProduct.dedicatedip
          };
        }
      }
      
      // Fallback: Get all active products and search for domain match
      console.log(`→ Fallback: Searching all active products for ${domain}`);
      const allProducts = await getClientsProducts(clientId, { status: 'Active' });
      
      if (!allProducts || !allProducts.products || !allProducts.products.product) {
        return null;
      }

      const productList = Array.isArray(allProducts.products.product) 
        ? allProducts.products.product 
        : [allProducts.products.product];

      // Fast lookup for hosting products
      for (const product of productList) {
        if (product.groupname && product.groupname.toLowerCase().includes('hosting')) {
          if (product.domain === domain || 
              product.dedicatedip === domain ||
              (product.customfields && this.checkCustomFieldsForDomain(product.customfields, domain))) {
            
            console.log(`→ Found matching hosting product for ${domain}:`, {
              id: product.id,
              server: product.server,
              servername: product.servername,
              serverid: product.serverid,
              status: product.status,
              productname: product.productname
            });
            
            return {
              id: product.id,
              domain: product.domain,
              server: product.servername || product.server, // Prefer servername over server
              serverid: product.serverid,
              status: product.status,
              product: product.productname,
              servername: product.servername,
              servertype: product.servertype,
              dedicatedip: product.dedicatedip
            };
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Error finding hosting service: ${error.message}`);
      return null;
    }
  }

  /**
   * Check custom fields for domain matches
   */
  checkCustomFieldsForDomain(customFields, domain) {
    if (!customFields || !customFields.customfield) {
      return false;
    }

    const fields = Array.isArray(customFields.customfield) 
      ? customFields.customfield 
      : [customFields.customfield];

    return fields.some(field => 
      field.value && field.value.toLowerCase().includes(domain.toLowerCase())
    );
  }

  /**
   * Optimized server info resolution with reduced fallback attempts
   */
  async getServerInfo(serverName, domain = null, clientId = null) {
    try {
      console.log(`→ getServerInfo called with serverName: "${serverName}"`);
      
      if (!serverName || serverName === 'undefined' || serverName.trim() === '') {
        console.log(`→ Empty server name, trying fallbacks`);
        // Fast fallback: try DNS resolution first (most likely to succeed)
        if (domain) {
          const serverFromDNS = await this.getServerFromDomainDNS(domain);
          if (serverFromDNS) {
            return serverFromDNS;
          }
        }
        
        // Fallback to default server
        const defaultServer = await this.getDefaultServer();
        if (defaultServer) {
          return defaultServer;
        }
        
        return null;
      }

      // Fast path for valid server names
      const normalizedServerName = this.whmService.extractServerNameFromWHMCS(serverName);
      console.log(`→ Normalized server name: "${normalizedServerName}"`);
      
      if (!normalizedServerName) {
        console.log(`❌ Could not normalize server name: "${serverName}"`);
        return null;
      }

      const hostname = this.whmService.getServerHostname(normalizedServerName);
      console.log(`→ Server hostname: "${hostname}"`);
      
      const serverInfo = {
        serverName: normalizedServerName,
        hostname: hostname,
        originalName: serverName
      };
      
      console.log(`→ Returning server info:`, serverInfo);
      return serverInfo;
    } catch (error) {
      console.log(`❌ Error in getServerInfo: ${error.message}`);
      this.logger.error(`Error getting server info: ${error.message}`);
      return null;
    }
  }

  /**
   * Optimized server info resolution with caching
   */
  async getServerInfoCached(serverName, domain = null, clientId = null) {
    const cacheKey = `serverinfo:${serverName}:${domain || 'nodomain'}`;
    
    // Check cache first
    const cached = serverCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return cached.data;
    }
    
    // Get server info
    const serverInfo = await this.getServerInfo(serverName, domain, clientId);
    
    // Cache result
    if (serverInfo) {
      serverCache.set(cacheKey, {
        data: serverInfo,
        timestamp: Date.now()
      });
    }
    
    return serverInfo;
  }

  /**
   * Optimized DNS resolution with caching
   */
  async getServerFromDomainDNS(domain) {
    const cacheKey = `dns:${domain}`;
    
    // Check cache first
    const cached = dnsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return cached.data;
    }
    
    try {
      const dns = require('dns').promises;
      
      // Set timeout for DNS resolution
      const addresses = await Promise.race([
        dns.resolve4(domain),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('DNS timeout')), 5000)
        )
      ]);
      
      if (!addresses || addresses.length === 0) {
        return null;
      }
      
      const domainIP = addresses[0];
      const availableServers = this.whmService.getAvailableServers();
      
      // Parallel DNS resolution for servers
      const serverPromises = availableServers.map(async (serverName) => {
        try {
          const hostname = this.whmService.getServerHostname(serverName);
          const serverAddresses = await Promise.race([
            dns.resolve4(hostname),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Server DNS timeout')), 3000)
            )
          ]);
          
          if (serverAddresses.includes(domainIP)) {
            return {
              serverName: serverName,
              hostname: hostname,
              originalName: `dns_resolved_${serverName}`,
              resolvedFromDNS: true,
              domainIP: domainIP
            };
          }
        } catch (error) {
          // Continue to next server
        }
        return null;
      });
      
      const results = await Promise.all(serverPromises);
      const match = results.find(result => result !== null);
      
      // Cache result (even if null)
      dnsCache.set(cacheKey, {
        data: match || null,
        timestamp: Date.now()
      });
      
      return match || null;
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Attempt to get server from WHMCS servers list
   */
  async getServerFromWHMCSList(clientId) {
    try {
      const { getServers } = require('./whmcsService');
      
      // Get all servers from WHMCS
      const serversResponse = await getServers();
      if (!serversResponse || !serversResponse.servers) {
        return null;
      }
      
      const servers = Array.isArray(serversResponse.servers.server) 
        ? serversResponse.servers.server 
        : [serversResponse.servers.server];
      
      // Find the first active server
      const activeServer = servers.find(server => 
        server.active === '1' || server.active === 1
      );
      
      if (activeServer && activeServer.name) {
        const normalizedServerName = this.whmService.extractServerNameFromWHMCS(activeServer.name);
        if (normalizedServerName) {
          const hostname = this.whmService.getServerHostname(normalizedServerName);
          
          return {
            serverName: normalizedServerName,
            hostname: hostname,
            originalName: activeServer.name,
            resolvedFromWHMCS: true,
            whmcsServerId: activeServer.id
          };
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get default server (first available server)
   */
  async getDefaultServer() {
    try {
      const availableServers = this.whmService.getAvailableServers();
      if (availableServers.length === 0) {
        return null;
      }
      
      const defaultServerName = availableServers[0];
      const hostname = this.whmService.getServerHostname(defaultServerName);
      
      return {
        serverName: defaultServerName,
        hostname: hostname,
        originalName: `default_${defaultServerName}`,
        isDefault: true
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get cPanel username for domain from WHM
   */
  async getCpanelUsername(domain, serverName) {
    try {
      console.log(`→ WHMCS provided server name for ${domain}: ${serverName}`);
      return await this.whmService.getUsernameByDomainOnServer(domain, serverName);
    } catch (error) {
      this.logger.error(`Error getting cPanel username: ${error.message}`);
      return null;
    }
  }

  /**
   * Get cPanel password - removed password setting logic
   * Note: Password setting has been removed for security reasons
   */
  async getCpanelPassword(username, serverName) {
    try {
      // Password setting logic has been removed
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate client ownership of domain
   */
  async validateClientOwnership(clientInfo, domain, email, phone) {
    try {
      // Validate that the provided email/phone matches the client
      if (email && clientInfo.email !== email) {
        return {
          valid: false,
          reason: 'Email does not match client record'
        };
      }

      // Additional validation can be added here
      return {
        valid: true,
        reason: 'Client ownership validated'
      };

    } catch (error) {
      return {
        valid: false,
        reason: `Validation error: ${error.message}`
      };
    }
  }
}

module.exports = CpanelCredentialResolver;