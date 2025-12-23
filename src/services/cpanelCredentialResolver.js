const { getClientsProducts, getClientsDetails } = require('./whmcsService');
const whmService = require('./whmService');
const winston = require('winston');

class CpanelCredentialResolver {
  constructor() {
    this.whmService = whmService;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  /**
   * Resolve cPanel credentials from domain and client identification
   * @param {string} domain - Domain name
   * @param {string} email - Client email (optional)
   * @param {string} phone - Client phone (optional)
   * @returns {Promise<object>} - Resolved credentials and server info
   */
  async resolveCpanelCredentials(domain, email = null, phone = null) {
    try {
      this.logger.info(`Resolving cPanel credentials for domain: ${domain}`);
      
      const result = {
        success: false,
        domain,
        clientInfo: null,
        serverInfo: null,
        cpanelCredentials: null,
        error: null
      };

      // Step 1: Find the client by email or phone
      let clientId = null;
      if (email) {
        this.logger.info(`Looking up client by email: ${email}`);
        const clientDetails = await this.findClientByEmail(email);
        if (clientDetails) {
          clientId = clientDetails.id;
          result.clientInfo = clientDetails;
          this.logger.info(`Found client by email: ${clientId}`);
        }
      }

      if (!clientId && phone) {
        this.logger.info(`Looking up client by phone: ${phone}`);
        const clientDetails = await this.findClientByPhone(phone);
        if (clientDetails) {
          clientId = clientDetails.id;
          result.clientInfo = clientDetails;
          this.logger.info(`Found client by phone: ${clientId}`);
        }
      }

      if (!clientId) {
        // Try to find client by domain ownership
        this.logger.info(`Looking up client by domain ownership: ${domain}`);
        const clientDetails = await this.findClientByDomain(domain);
        if (clientDetails) {
          clientId = clientDetails.id;
          result.clientInfo = clientDetails;
          this.logger.info(`Found client by domain ownership: ${clientId}`);
        }
      }

      if (!clientId) {
        result.error = 'Client not found with provided email, phone, or domain ownership';
        return result;
      }

      // Step 2: Find hosting service for the domain
      this.logger.info(`Finding hosting service for domain: ${domain}`);
      const hostingService = await this.findHostingServiceForDomain(clientId, domain);
      
      if (!hostingService) {
        result.error = `No hosting service found for domain: ${domain}`;
        return result;
      }

      this.logger.info(`Found hosting service: ${hostingService.id} on server: ${hostingService.server || 'undefined'}`);
      
      // Enhanced logging for debugging server field issues
      if (!hostingService.server || hostingService.server === 'undefined') {
        this.logger.warn(`WHMCS hosting service has undefined server field:`, {
          serviceId: hostingService.id,
          domain: hostingService.domain,
          server: hostingService.server,
          serverid: hostingService.serverid,
          servername: hostingService.servername,
          servertype: hostingService.servertype,
          status: hostingService.status,
          product: hostingService.product
        });
      }

      // Step 3: Get server information and cPanel credentials
      const serverInfo = await this.getServerInfo(hostingService.server, domain, clientId);
      if (!serverInfo) {
        result.error = `Server information not found for: ${hostingService.server}. Unable to resolve server using fallback methods.`;
        result.details = {
          domain,
          clientLookup: 'found',
          serverLookup: 'not_found',
          hostingService: {
            id: hostingService.id,
            server: hostingService.server,
            serverid: hostingService.serverid,
            servername: hostingService.servername
          }
        };
        return result;
      }

      result.serverInfo = serverInfo;

      // Step 4: Get cPanel username from WHM
      const cpanelUsername = await this.getCpanelUsername(domain, serverInfo.serverName);
      if (!cpanelUsername) {
        result.error = `cPanel username not found for domain: ${domain}`;
        return result;
      }

      // Step 5: Generate or retrieve cPanel password
      const cpanelPassword = await this.getCpanelPassword(cpanelUsername, serverInfo.serverName);
      if (!cpanelPassword) {
        result.error = `Unable to retrieve cPanel password for user: ${cpanelUsername}`;
        return result;
      }

      result.cpanelCredentials = {
        host: serverInfo.hostname,
        port: 2083,
        username: cpanelUsername,
        password: cpanelPassword
      };

      result.success = true;
      this.logger.info(`Successfully resolved cPanel credentials for domain: ${domain}`);
      
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
      this.logger.warn(`Error finding client by email: ${error.message}`);
      return null;
    }
  }

  /**
   * Find client by phone number
   */
  async findClientByPhone(phone) {
    try {
      // WHMCS doesn't have direct phone search, so we'll need to implement
      // a custom search or use a different approach
      this.logger.warn('Phone-based client lookup not yet implemented');
      return null;
    } catch (error) {
      this.logger.warn(`Error finding client by phone: ${error.message}`);
      return null;
    }
  }

  /**
   * Find client by domain ownership (through hosting services)
   */
  async findClientByDomain(domain) {
    try {
      // This would require searching through all clients' products
      // For now, we'll return null and rely on email/phone lookup
      this.logger.warn('Domain-based client lookup not yet implemented');
      return null;
    } catch (error) {
      this.logger.warn(`Error finding client by domain: ${error.message}`);
      return null;
    }
  }

  /**
   * Find hosting service for a specific domain
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

      // Look for hosting products that match the domain
      for (const product of productList) {
        if (product.groupname && product.groupname.toLowerCase().includes('hosting')) {
          // Check if domain matches
          if (product.domain === domain || 
              product.dedicatedip === domain ||
              (product.customfields && this.checkCustomFieldsForDomain(product.customfields, domain))) {
            
            this.logger.info(`Found hosting service: ${product.id} on server: ${product.server || 'undefined'}`);
            
            // Enhanced logging for debugging server field issues
            if (!product.server || product.server === 'undefined') {
              this.logger.warn(`WHMCS product has undefined server field:`, {
                productId: product.id,
                domain: product.domain,
                server: product.server,
                serverid: product.serverid,
                servername: product.servername,
                servertype: product.servertype,
                status: product.status,
                productname: product.productname,
                groupname: product.groupname
              });
            }
            
            return {
              id: product.id,
              domain: product.domain,
              server: product.server,
              serverid: product.serverid,
              status: product.status,
              product: product.productname,
              // Add additional fields for debugging
              servername: product.servername,
              servertype: product.servertype,
              dedicatedip: product.dedicatedip
            };
          }
        }
      }

      // If no exact match, look for any hosting product for this client
      // This can help identify if the domain is associated differently
      const anyHostingProduct = productList.find(product => 
        product.groupname && product.groupname.toLowerCase().includes('hosting')
      );

      if (anyHostingProduct) {
        this.logger.warn(`No exact domain match found, but client has hosting product: ${anyHostingProduct.id} for domain: ${anyHostingProduct.domain}`);
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
   * Get server information from server name with enhanced fallback logic
   */
  async getServerInfo(serverName, domain = null, clientId = null) {
    try {
      if (!serverName || serverName === 'undefined' || serverName.trim() === '') {
        this.logger.warn('Server name is empty or undefined - attempting fallback methods');
        
        // Fallback 1: Try to determine server from domain DNS resolution
        if (domain) {
          this.logger.info(`Attempting to determine server from domain DNS: ${domain}`);
          const serverFromDNS = await this.getServerFromDomainDNS(domain);
          if (serverFromDNS) {
            this.logger.info(`Successfully determined server from DNS: ${serverFromDNS.serverName}`);
            return serverFromDNS;
          }
        }
        
        // Fallback 2: Try to get server from WHMCS servers list
        if (clientId) {
          this.logger.info(`Attempting to determine server from WHMCS servers for client: ${clientId}`);
          const serverFromWHMCS = await this.getServerFromWHMCSList(clientId);
          if (serverFromWHMCS) {
            this.logger.info(`Successfully determined server from WHMCS: ${serverFromWHMCS.serverName}`);
            return serverFromWHMCS;
          }
        }
        
        // Fallback 3: Use default server (first available server)
        this.logger.warn('Using default server as fallback');
        const defaultServer = await this.getDefaultServer();
        if (defaultServer) {
          this.logger.info(`Using default server: ${defaultServer.serverName}`);
          return defaultServer;
        }
        
        this.logger.error('All server resolution methods failed');
        return null;
      }

      // Extract server name from WHMCS format
      const normalizedServerName = this.whmService.extractServerNameFromWHMCS(serverName);
      if (!normalizedServerName) {
        this.logger.warn(`Could not normalize server name: ${serverName}`);
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
   * Attempt to determine server from domain DNS resolution
   */
  async getServerFromDomainDNS(domain) {
    try {
      const dns = require('dns').promises;
      
      // Resolve domain to IP address
      const addresses = await dns.resolve4(domain);
      if (!addresses || addresses.length === 0) {
        return null;
      }
      
      const domainIP = addresses[0];
      this.logger.info(`Domain ${domain} resolves to IP: ${domainIP}`);
      
      // Get available servers and their IPs
      const availableServers = this.whmService.getAvailableServers();
      
      // Try to match IP to server
      for (const serverName of availableServers) {
        try {
          const hostname = this.whmService.getServerHostname(serverName);
          const serverAddresses = await dns.resolve4(hostname);
          
          if (serverAddresses.includes(domainIP)) {
            this.logger.info(`Matched domain IP ${domainIP} to server ${serverName} (${hostname})`);
            return {
              serverName: serverName,
              hostname: hostname,
              originalName: `dns_resolved_${serverName}`,
              resolvedFromDNS: true,
              domainIP: domainIP
            };
          }
        } catch (serverDNSError) {
          // Continue to next server if DNS resolution fails
          continue;
        }
      }
      
      return null;
    } catch (error) {
      this.logger.warn(`DNS resolution failed for domain ${domain}: ${error.message}`);
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
      this.logger.warn(`Failed to get server from WHMCS list: ${error.message}`);
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
      this.logger.warn(`Failed to get default server: ${error.message}`);
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
   * Get or generate cPanel password
   * Note: For security reasons, we'll use a temporary password approach
   */
  async getCpanelPassword(username, serverName) {
    try {
      // Option 1: Generate a temporary password and set it
      const tempPassword = this.generateTemporaryPassword();
      
      // Use WHM API to set temporary password
      const result = await this.whmService.callServerAPI(serverName, 'passwd', {
        user: username,
        password: tempPassword  // Changed from 'pass' to 'password'
      });

      if (result && result.metadata && result.metadata.result === 1) {
        this.logger.info(`Temporary password set for user: ${username}`);
        return tempPassword;
      }

      // Option 2: If password reset fails, return null
      // In production, you might want to use a different approach
      this.logger.warn(`Failed to set temporary password for user: ${username}`);
      return null;

    } catch (error) {
      this.logger.error(`Error getting/setting cPanel password: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate a secure temporary password
   */
  generateTemporaryPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return password;
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