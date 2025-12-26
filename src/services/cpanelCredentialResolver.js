const { getClientsProducts, getClientsDetails } = require('./whmcsService');
const whmService = require('./whmService');

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

// Cache for client lookups and server info
const clientCache = new Map();
const serverCache = new Map();
const dnsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Cache cleanup
setInterval(() => {
  const now = Date.now();
  [clientCache, serverCache, dnsCache].forEach(cache => {
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        cache.delete(key);
      }
    }
  });
}, 60000);

class CpanelCredentialResolver {
  constructor() {
    this.whmService = whmService;
    this.logger = logger;
  }

  /**
   * Optimized credential resolution with minimal logging
   */
  async resolveCpanelCredentials(domain, email = null, phone = null) {
    try {
      const result = {
        success: false,
        domain,
        clientInfo: null,
        serverInfo: null,
        cpanelCredentials: null,
        error: null
      };

      // Step 1: Parallel client lookup with caching
      let clientId = null;
      const clientPromises = [];
      
      if (email) {
        const cacheKey = `client:email:${email}`;
        const cached = clientCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
          clientId = cached.data.id;
          result.clientInfo = cached.data;
        } else {
          clientPromises.push(
            this.findClientByEmail(email).then(clientDetails => {
              if (clientDetails) {
                clientCache.set(cacheKey, {
                  data: clientDetails,
                  timestamp: Date.now()
                });
                return clientDetails;
              }
              return null;
            })
          );
        }
      }

      if (phone && !clientId) {
        clientPromises.push(this.findClientByPhone(phone));
      }

      // Execute parallel client lookups
      if (clientPromises.length > 0) {
        const clientResults = await Promise.all(clientPromises);
        const foundClient = clientResults.find(client => client !== null);
        
        if (foundClient) {
          clientId = foundClient.id;
          result.clientInfo = foundClient;
        }
      }

      // Fallback to domain lookup if no client found
      if (!clientId) {
        const clientDetails = await this.findClientByDomain(domain);
        if (clientDetails) {
          clientId = clientDetails.id;
          result.clientInfo = clientDetails;
        }
      }

      if (!clientId) {
        result.error = 'Client not found with provided email, phone, or domain ownership';
        return result;
      }

      // Step 2: Find hosting service (with caching)
      const hostingCacheKey = `hosting:${clientId}:${domain}`;
      let hostingService = null;
      
      const cachedHosting = clientCache.get(hostingCacheKey);
      if (cachedHosting && (Date.now() - cachedHosting.timestamp < CACHE_TTL)) {
        hostingService = cachedHosting.data;
      } else {
        hostingService = await this.findHostingServiceForDomain(clientId, domain);
        if (hostingService) {
          clientCache.set(hostingCacheKey, {
            data: hostingService,
            timestamp: Date.now()
          });
        }
      }
      
      if (!hostingService) {
        result.error = `No hosting service found for domain: ${domain}`;
        return result;
      }

      // Step 3: Get server information (with caching)
      const serverInfo = await this.getServerInfoCached(hostingService.server, domain, clientId);
      if (!serverInfo) {
        result.error = `Server information not found for: ${hostingService.server}`;
        return result;
      }

      result.serverInfo = serverInfo;

      // Step 4: Get cPanel username (with caching)
      const usernameCacheKey = `username:${domain}:${serverInfo.serverName}`;
      let cpanelUsername = null;
      
      const cachedUsername = serverCache.get(usernameCacheKey);
      if (cachedUsername && (Date.now() - cachedUsername.timestamp < CACHE_TTL)) {
        cpanelUsername = cachedUsername.data;
      } else {
        cpanelUsername = await this.getCpanelUsername(domain, serverInfo.serverName);
        if (cpanelUsername) {
          serverCache.set(usernameCacheKey, {
            data: cpanelUsername,
            timestamp: Date.now()
          });
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
      // WHMCS doesn't have direct phone search
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find client by domain ownership (through hosting services)
   */
  async findClientByDomain(domain) {
    try {
      // Domain-based client lookup not implemented
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Optimized hosting service lookup with reduced logging
   */
  async findHostingServiceForDomain(clientId, domain) {
    try {
      const products = await getClientsProducts(clientId, { status: 'Active' });
      
      if (!products || !products.products || !products.products.product) {
        return null;
      }

      const productList = Array.isArray(products.products.product) 
        ? products.products.product 
        : [products.products.product];

      // Fast lookup for hosting products
      for (const product of productList) {
        if (product.groupname && product.groupname.toLowerCase().includes('hosting')) {
          if (product.domain === domain || 
              product.dedicatedip === domain ||
              (product.customfields && this.checkCustomFieldsForDomain(product.customfields, domain))) {
            
            return {
              id: product.id,
              domain: product.domain,
              server: product.server,
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
      if (!serverName || serverName === 'undefined' || serverName.trim() === '') {
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
      if (!normalizedServerName) {
        return null;
      }

      const hostname = this.whmService.getServerHostname(normalizedServerName);
      
      return {
        serverName: normalizedServerName,
        hostname: hostname,
        originalName: serverName
      };
    } catch (error) {
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