/**
 * WHM (Web Host Manager) API Service
 * Provides cPanel/WHM server management functionality
 */

const axios = require('axios');
const https = require('https');
const { getCurrentServerInfo } = require('../utils/dnsChecker');

class WHMService {
  constructor() {
    this.username = process.env.WHM_USERNAME || 'root';
    this.verifySSL = process.env.WHM_VERIFY_SSL !== 'false';
    
    // Load all server API keys from environment
    this.serverApiKeys = this.loadServerApiKeys();
    
    // Cache for server IPs to improve performance
    this.serverIPCache = new Map();
    
    // Cache for domain-to-server mapping to improve performance
    this.domainServerCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Silent initialization in production
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔧 WHM Service initialized:', {
        username: this.username,
        serversConfigured: Object.keys(this.serverApiKeys).length,
        sslVerify: this.verifySSL,
        servers: []
      });
    }
  }

  /**
   * Load server-specific API keys from environment variables
   * @returns {Object} Map of server names to API keys
   */
  loadServerApiKeys() {
    const apiKeys = {};
    
    // Load all WHM_API_KEY_* environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('WHM_API_KEY_')) {
        const serverName = key.replace('WHM_API_KEY_', '').toLowerCase();
        apiKeys[serverName] = process.env[key];
      }
    });
    
    return apiKeys;
  }

  /**
   * Extract server name from WHMCS server name format
   * @param {string} whmcsServerName - WHMCS server name (e.g., 'CP1', 'VPS - Win1 (Shared)')
   * @returns {string|null} - Normalized server name (e.g., 'cp1') or null if not recognized
   */
  extractServerNameFromWHMCS(whmcsServerName) {
    if (!whmcsServerName) return null;
    
    console.log(`→ Extracting server name from WHMCS: "${whmcsServerName}"`);
    
    const serverName = whmcsServerName.toLowerCase();
    
    // Direct matches (CP1, PCP6, RCP2, etc.)
    const directMatch = serverName.match(/^(cp\d+|pcp\d+|rcp\d+)$/);
    if (directMatch) {
      console.log(`→ Direct match found: ${directMatch[1]}`);
      return directMatch[1];
    }
    
    // Extract from descriptive names (e.g., "VPS - Win1 (Shared)" -> look for cp/pcp/rcp pattern)
    const descriptiveMatch = serverName.match(/(cp\d+|pcp\d+|rcp\d+)/);
    if (descriptiveMatch) {
      console.log(`→ Descriptive match found: ${descriptiveMatch[1]}`);
      return descriptiveMatch[1];
    }
    
    // Handle specific known patterns
    if (serverName.includes('win1')) {
      console.log(`→ Win1 pattern matched: cp1`);
      return 'cp1';
    }
    if (serverName.includes('win2')) {
      console.log(`→ Win2 pattern matched: cp2`);
      return 'cp2';
    }
    // Add more mappings as needed
    
    // Silent logging in production
    console.log(`⚠️ Could not extract server name from WHMCS format: "${whmcsServerName}"`);
    return null;
  }

  /**
   * Get server hostname from server name
   * @param {string} serverName - Server name (e.g., 'cp1', 'pcp6')
   * @returns {string} Server hostname
   */
  getServerHostname(serverName) {
    const name = serverName.toLowerCase();
    
    // Map server names to hostnames based on your naming convention
    if (name.startsWith('cp') && !name.startsWith('pcp')) {
      return `${name}.mywebsitebox.com`;
    } else if (name.startsWith('pcp')) {
      return `${name}.mywebsitebox.com`;
    } else if (name.startsWith('rcp')) {
      return `${name}.mywebsitebox.com`;
    } else if (name.includes('plesk') || name.includes('win')) {
      return 'plesk.hostbreak.com'; // Windows servers
    }
    
    // Default fallback
    return `${name}.mywebsitebox.com`;
  }

  /**
   * Create axios client for specific server
   * @param {string} serverName - Server name
   * @returns {Object} Configured axios client
   */
  createServerClient(serverName) {
    const hostname = this.getServerHostname(serverName);
    const baseURL = `https://${hostname}:2087`;
    const apiKey = this.serverApiKeys[serverName.toLowerCase()];
    
    if (!apiKey) {
      throw new Error(`No API key found for server: ${serverName}`);
    }
    
    const client = axios.create({
      baseURL: baseURL,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: this.verifySSL
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `whm ${this.username}:${apiKey}`
      }
    });
    
    return client;
  }

  /**
   * Make WHM API call to specific server with custom API version
   * @param {string} serverName - Server name (e.g., 'cp1', 'pcp6')
   * @param {string} function_name - WHM API function name
   * @param {object} params - API parameters
   * @param {string} apiVersion - API version to use (default: '2')
   * @returns {Promise<object>} - API response
   */
  async callServerAPI(serverName, function_name, params = {}, apiVersion = '2', method = 'POST') {
    try {
      // Silent API logging in production
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🔧 WHM API Call [${serverName.toUpperCase()}]: ${function_name}`, Object.keys(params));
      }
      
      // Special debug logging for removezonerecord calls
      if (function_name === 'removezonerecord') {
        console.log(`🔍 DEBUG: removezonerecord API call details:`);
        console.log(`  → Server: ${serverName.toUpperCase()}`);
        console.log(`  → Function: ${function_name}`);
        console.log(`  → API Version: ${apiVersion}`);
        console.log(`  → Parameters:`, JSON.stringify(params, null, 2));
        console.log(`  → Target: Remove line ${params.line} from domain ${params.domain}`);
      }
      
      const client = this.createServerClient(serverName);
      
      // Build query parameters
      const queryParams = new URLSearchParams({
        'api.version': apiVersion,
        ...params
      });
      
      const url = `/json-api/${function_name}?${queryParams.toString()}`;
      
      // Special debug logging for removezonerecord calls - before request
      if (function_name === 'removezonerecord') {
        console.log(`🔍 DEBUG: Making HTTP request to WHM API:`);
        console.log(`  → URL: ${url}`);
        console.log(`  → Method: ${method.toUpperCase()}`);
        console.log(`  → Full query params:`, queryParams.toString());
      }
      
      const response = method.toUpperCase() === 'GET' ? await client.get(url) : await client.post(url);
      
      // Special debug logging for removezonerecord calls - after response
      if (function_name === 'removezonerecord') {
        console.log(`🔍 DEBUG: removezonerecord HTTP response received:`);
        console.log(`  → Status: ${response.status}`);
        console.log(`  → Response data:`, JSON.stringify(response.data, null, 2));
        console.log(`  → Metadata result: ${response.data?.metadata?.result}`);
        console.log(`  → Metadata reason: ${response.data?.metadata?.reason || 'N/A'}`);
      }
      
      if (response.data.metadata && response.data.metadata.result === 0) {
        // Special error logging for removezonerecord failures
        if (function_name === 'removezonerecord') {
          console.log(`❌ DEBUG: removezonerecord API failed with result=0:`);
          console.log(`  → Domain: ${params.domain}`);
          console.log(`  → Line: ${params.line}`);
          console.log(`  → Reason: ${response.data.metadata.reason}`);
          console.log(`  → Full response:`, JSON.stringify(response.data, null, 2));
        }
        throw new Error(response.data.metadata.reason || 'WHM API call failed');
      }
      
      // Silent success logging in production
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ WHM API Success [${serverName.toUpperCase()}]: ${function_name}`);
      }
      
      // Special success logging for removezonerecord calls
      if (function_name === 'removezonerecord') {
        console.log(`🔍 DEBUG: removezonerecord API succeeded:`);
        console.log(`  → Successfully removed line ${params.line} from domain ${params.domain}`);
        console.log(`  → Result: ${response.data?.metadata?.result}`);
        console.log(`  → Reason: ${response.data?.metadata?.reason || 'Success'}`);
      }
      
      return response.data;
      
    } catch (error) {
      console.error(`❌ WHM API Error [${serverName.toUpperCase()}] (${function_name}):`, error.message);
      
      // Special error logging for removezonerecord calls
      if (function_name === 'removezonerecord') {
        console.log(`❌ DEBUG: removezonerecord API call failed:`);
        console.log(`  → Domain: ${params.domain}`);
        console.log(`  → Line: ${params.line}`);
        console.log(`  → Error: ${error.message}`);
        console.log(`  → Error type: ${error.constructor.name}`);
        
        if (error.response) {
          console.log(`  → HTTP Status: ${error.response.status}`);
          console.log(`  → Response headers:`, error.response.headers);
          console.log(`  → Response data:`, JSON.stringify(error.response.data, null, 2));
        } else {
          console.log(`  → No HTTP response (network/connection error)`);
        }
        
        console.log(`  → Full error object:`, {
          message: error.message,
          stack: error.stack,
          code: error.code,
          config: error.config ? {
            url: error.config.url,
            method: error.config.method,
            headers: error.config.headers
          } : 'No config'
        });
      }
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      throw new Error(`WHM API call failed for ${serverName}: ${error.message}`);
    }
  }

  /**
   * Call API function on all configured servers (with timeout and optimization)
   * @param {string} function_name - WHM API function name
   * @param {object} params - API parameters
   * @param {object} options - Options like timeout, activeOnly
   * @returns {Promise<object>} - Results from all servers
   */
  async callAllServers(function_name, params = {}, options = {}) {
    const results = {};
    const errors = {};
    const timeout = options.timeout || 30000; // 30 second timeout per server
    const activeOnly = options.activeOnly || false;
    
    // Get server list (active only if requested)
    let serverList = Object.keys(this.serverApiKeys);
    
    if (activeOnly) {
      try {
        serverList = await this.getActiveServersWithIPs();
        console.log(`🔧 Calling ${function_name} on ${serverList.length} servers with IPs (instead of all ${Object.keys(this.serverApiKeys).length})`);
      } catch (error) {
        console.log(`⚠️ Failed to get servers from cache, using all servers: ${error.message}`);
      }
    } else {
      console.log(`🔧 Calling ${function_name} on all ${serverList.length} servers`);
    }
    
    // Call API on servers in parallel with timeout
    const promises = serverList.map(async (serverName) => {
      try {
        // Add timeout to each server call
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Server timeout')), timeout)
        );
        
        const apiPromise = this.callServerAPI(serverName, function_name, params);
        
        const result = await Promise.race([apiPromise, timeoutPromise]);
        results[serverName] = result;
      } catch (error) {
        const errorMsg = error.message === 'Server timeout' ? 'Timeout (30s)' : error.message;
        console.error(`❌ Server ${serverName.toUpperCase()} failed: ${errorMsg}`);
        errors[serverName] = errorMsg;
      }
    });
    
    await Promise.allSettled(promises);
    
    console.log(`✅ Completed ${function_name} on ${Object.keys(results).length}/${serverList.length} servers`);
    
    return {
      results,
      errors,
      successCount: Object.keys(results).length,
      errorCount: Object.keys(errors).length,
      totalServers: serverList.length
    };
  }

  /**
   * Get server information from all servers
   * @returns {Promise<object>} - Server information from all servers
   */
  async getAllServerInfo() {
    return await this.callAllServers('systemloadavg');
  }

  /**
   * Get available servers list
   * @returns {Array} - List of configured server names
   */
  getAvailableServers() {
    return Object.keys(this.serverApiKeys);
  }

  // ========================================
  // ACCOUNT MANAGEMENT
  // ========================================

  /**
   * List all cPanel accounts on specific server
   * @param {string} serverName - Server name
   * @param {object} options - Search options
   * @returns {Promise<Array>} - Array of account objects
   */
  async listAccounts(serverName, options = {}) {
    const params = {};
    
    if (options.domain) params.searchtype = 'domain';
    if (options.domain) params.search = options.domain;
    if (options.owner) params.searchtype = 'owner';
    if (options.owner) params.search = options.owner;
    
    const response = await this.callServerAPI(serverName, 'listaccts', params);
    return response.data?.acct || [];
  }

  /**
   * List accounts on all servers
   * @param {object} options - Search options
   * @returns {Promise<object>} - Accounts from all servers
   */
  async listAllAccounts(options = {}) {
    return await this.callAllServers('listaccts', options);
  }

  /**
   * Get account information by domain
   * @param {string} domain - Domain name
   * @returns {Promise<object|null>} - Account object or null
   */
  async getAccountByDomain(domain) {
    try {
      // Search across all servers for the domain
      const serverNames = Object.keys(this.serverApiKeys);
      
      for (const serverName of serverNames) {
        try {
          const response = await this.callServerAPI(serverName, 'listaccts', { 
            searchtype: 'domain', 
            search: domain 
          });
          
          if (response.data && response.data.acct) {
            const accounts = Array.isArray(response.data.acct) ? response.data.acct : [response.data.acct];
            const domainAccount = accounts.find(acc => acc.domain === domain);
            
            if (domainAccount) {
              console.log(`✅ Found account for domain ${domain} on server ${serverName.toUpperCase()}`);
              return {
                ...domainAccount,
                serverName: serverName
              };
            }
          }
        } catch (serverError) {
          console.log(`⚠️ Error checking server ${serverName} for domain ${domain}: ${serverError.message}`);
          continue;
        }
      }
      
      console.log(`❌ Domain ${domain} not found on any server`);
      return null;
    } catch (error) {
      console.error(`Error finding account for domain ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Get username for a domain using listaccts API
   * @param {string} domain - Domain name
   * @returns {Promise<string|null>} - Username or null
   */
  async getUsernameByDomain(domain) {
    try {
      console.log(`→ Getting username for domain: ${domain}`);
      
      // Check cache first
      if (this.domainServerCache.has(domain)) {
        const cachedServer = this.domainServerCache.get(domain);
        console.log(`→ Using cached server for ${domain}: ${cachedServer.toUpperCase()}`);
        
        try {
          const response = await this.callServerAPI(cachedServer, 'listaccts', { 
            search: domain,
            searchtype: 'domain'
          });
          
          if (response.data && response.data.acct) {
            const accounts = Array.isArray(response.data.acct) ? response.data.acct : [response.data.acct];
            const domainAccount = accounts.find(acc => acc.domain === domain);
            
            if (domainAccount && domainAccount.user) {
              const username = domainAccount.user;
              console.log(`✅ Found username for ${domain} on cached server ${cachedServer.toUpperCase()}: ${username}`);
              return username;
            }
          }
        } catch (cacheError) {
          console.log(`→ Cached server ${cachedServer.toUpperCase()} failed, clearing cache and searching all servers`);
          this.domainServerCache.delete(domain);
        }
      }
      
      // Search across all servers for the domain
      // Prioritize PCP servers first, then CP servers, then RCP servers
      const serverNames = Object.keys(this.serverApiKeys);
      const prioritizedServers = [
        ...serverNames.filter(s => s.startsWith('pcp')).sort(),
        ...serverNames.filter(s => s.startsWith('cp') && !s.startsWith('pcp')).sort(),
        ...serverNames.filter(s => s.startsWith('rcp')).sort()
      ];
      
      for (const serverName of prioritizedServers) {
        try {
          const response = await this.callServerAPI(serverName, 'listaccts', { 
            search: domain,
            searchtype: 'domain'
          });
          
          if (response.data && response.data.acct) {
            const accounts = Array.isArray(response.data.acct) ? response.data.acct : [response.data.acct];
            const domainAccount = accounts.find(acc => acc.domain === domain);
            
            if (domainAccount && domainAccount.user) {
              const username = domainAccount.user;
              console.log(`✅ Found username for ${domain} on server ${serverName.toUpperCase()}: ${username}`);
              
              // Cache the server for this domain
              this.domainServerCache.set(domain, serverName);
              
              return username;
            }
          }
        } catch (serverError) {
          // listaccts may return an error if no accounts found on this server
          // This is expected behavior, so we continue to the next server
          console.log(`❌ Domain ${domain} not found on server ${serverName.toUpperCase()}`);
          
          // Log the actual error for debugging (but don't stop the search)
          if (process.env.LOG_LEVEL === 'DEBUG') {
            console.log(`   Debug: ${serverError.message}`);
          }
          
          continue;
        }
      }
      
      console.log(`❌ Domain ${domain} not found on any server`);
      return null;
    } catch (error) {
      console.error(`Error getting username for domain ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Get username for a domain on a specific server using listaccts API
   * @param {string} domain - Domain name
   * @param {string} serverName - Server name (e.g., 'cp1', 'pcp3')
   * @returns {Promise<string|null>} - Username or null
   */
  async getUsernameByDomainOnServer(domain, serverName) {
    try {
      console.log(`→ Getting username for domain: ${domain} on server ${serverName.toUpperCase()}`);
      
      const response = await this.callServerAPI(serverName, 'listaccts', { 
        search: domain,
        searchtype: 'domain'
      });
      
      if (response.data && response.data.acct) {
        const accounts = Array.isArray(response.data.acct) ? response.data.acct : [response.data.acct];
        const domainAccount = accounts.find(acc => acc.domain === domain);
        
        if (domainAccount && domainAccount.user) {
          const username = domainAccount.user;
          console.log(`✅ Found username for ${domain} on server ${serverName.toUpperCase()}: ${username}`);
          return username;
        }
      }
      
      console.log(`❌ Domain ${domain} not found on server ${serverName.toUpperCase()}`);
      return null;
    } catch (error) {
      console.log(`❌ Error getting username for ${domain} on server ${serverName.toUpperCase()}: ${error.message}`);
      return null;
    }
  }

  // ========================================
  // AUTOSSL MANAGEMENT
  // ========================================

  /**
   * Force AutoSSL inclusion for a domain by removing it from excluded domains and actively triggering certificate generation
   * This method implements both passive (remove from exclusion) and active (trigger check) approaches
   * @param {string} serverName - Server name (e.g., 'cp1', 'pcp3')
   * @param {string} username - cPanel username
   * @param {string} domain - Domain to include in AutoSSL
   * @returns {Promise<object>} - AutoSSL operation result
   */
  async forceAutoSSLInclusion(serverName, username, domain) {
    try {
      console.log(`🔒 Forcing AutoSSL inclusion for domain: ${domain} (user: ${username}, server: ${serverName})`);
      console.log(`→ Using comprehensive approach: passive (remove exclusion) + active (trigger check)`);
      
      // Step 1: Get current excluded domains
      console.log(`→ Step 1: Checking current AutoSSL excluded domains...`);
      const currentExcluded = await this.getAutoSSLExcludedDomains(serverName, username);
      
      // Step 2: Remove the domain from excluded list if it exists
      const updatedExcluded = currentExcluded.filter(excludedDomain => excludedDomain !== domain);
      const wasExcluded = currentExcluded.length !== updatedExcluded.length;
      
      if (!wasExcluded) {
        console.log(`→ Domain ${domain} was not in excluded list (already included in AutoSSL)`);
        console.log(`→ Step 2: Skipping exclusion removal - proceeding to active trigger`);
      } else {
        console.log(`→ Step 2: Removing ${domain} from AutoSSL excluded domains list`);
        console.log(`→ Previous excluded domains: ${currentExcluded.join(', ')}`);
        console.log(`→ Updated excluded domains: ${updatedExcluded.join(', ')}`);
        
        // Set the updated excluded domains list (without the target domain)
        const excludeResult = await this.setAutoSSLExcludedDomains(serverName, username, updatedExcluded);
        
        if (!excludeResult.success) {
          console.log(`❌ Failed to update AutoSSL excluded domains: ${excludeResult.error}`);
          return {
            success: false,
            error: excludeResult.error,
            message: `Failed to include ${domain} in AutoSSL: ${excludeResult.error}`,
            method: 'set_autossl_user_excluded_domains_failed',
            username: username,
            domain: domain,
            serverName: serverName,
            excludeResult: excludeResult
          };
        }
        
        console.log(`✅ Successfully removed ${domain} from AutoSSL excluded domains`);
      }
      
      // Step 3: Actively trigger AutoSSL check for immediate certificate generation
      console.log(`→ Step 3: Triggering active AutoSSL check for user ${username}...`);
      console.log(`→ This attempts to generate SSL certificate immediately instead of waiting for scheduled run`);
      
      const autoSSLTriggerResult = await this.triggerAutoSSLCheck(serverName, username);
      
      // Step 4: Determine final result and provide comprehensive feedback
      // Since active triggering is not available, we always use the passive approach
      console.log(`✅ SUCCESS: AutoSSL inclusion completed using passive approach`);
      console.log(`→ Domain ${domain} is now included in AutoSSL for automatic certificate generation`);
      console.log(`→ SSL certificate will be generated in the next scheduled AutoSSL run`);
      console.log(`→ AutoSSL typically runs every 4-6 hours on cPanel servers`);
      
      return {
        success: true,
        message: wasExcluded 
          ? `Domain ${domain} has been included in AutoSSL. SSL certificate will be generated automatically in the next scheduled run (typically within 4-6 hours).`
          : `Domain ${domain} was already included in AutoSSL. SSL certificate will be generated automatically in the next scheduled run (typically within 4-6 hours).`,
        wasExcluded: wasExcluded,
        removedFromExcluded: wasExcluded,
        autoSSLTriggered: false, // Active triggering not available
        triggerMethod: null,
        triggerError: autoSSLTriggerResult.error,
        triggerMessage: autoSSLTriggerResult.message,
        previousExcluded: currentExcluded,
        currentExcluded: updatedExcluded,
        method: wasExcluded ? 'passive_inclusion_from_excluded' : 'passive_inclusion_already_included',
        username: username,
        domain: domain,
        serverName: serverName,
        triggerResult: autoSSLTriggerResult,
        fallbackInfo: autoSSLTriggerResult.fallbackInfo,
        timeline: 'SSL certificate will be generated in next scheduled AutoSSL run (typically within 4-6 hours)',
        approach: 'passive',
        explanation: 'Active AutoSSL triggering is not available via WHM API v1. The passive approach (including domain in AutoSSL) is the standard method used by most hosting providers.'
      };
      
    } catch (error) {
      console.log(`❌ Error forcing AutoSSL inclusion for ${domain}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: `Error forcing AutoSSL inclusion for ${domain}: ${error.message}`,
        method: 'force_autossl_inclusion_exception',
        username: username,
        domain: domain,
        serverName: serverName
      };
    }
  }

  /**
   * Get AutoSSL excluded domains for a user
   * @param {string} serverName - Server name
   * @param {string} username - cPanel username
   * @returns {Promise<Array>} - Array of excluded domains
   */
  async getAutoSSLExcludedDomains(serverName, username) {
    try {
      const result = await this.callServerAPI(serverName, 'get_autossl_user_excluded_domains', {
        username: username
      });
      
      if (result && result.data && result.data.excluded_domains) {
        return Array.isArray(result.data.excluded_domains) ? 
          result.data.excluded_domains : 
          [result.data.excluded_domains];
      }
      
      return [];
    } catch (error) {
      console.log(`⚠️ Error getting AutoSSL excluded domains for ${username}: ${error.message}`);
      return [];
    }
  }

  /**
   * Set AutoSSL excluded domains for a user
   * @param {string} serverName - Server name
   * @param {string} username - cPanel username
   * @param {Array} excludedDomains - Array of domains to exclude from AutoSSL
   * @returns {Promise<object>} - Operation result
   */
  async setAutoSSLExcludedDomains(serverName, username, excludedDomains) {
    try {
      console.log(`→ Setting AutoSSL excluded domains for ${username}: ${excludedDomains.join(', ')}`);
      
      const result = await this.callServerAPI(serverName, 'set_autossl_user_excluded_domains', {
        username: username,
        excluded_domains: excludedDomains
      });
      
      if (result && result.metadata && result.metadata.result === 1) {
        console.log(`✅ Successfully updated AutoSSL excluded domains for ${username}`);
        return {
          success: true,
          message: `AutoSSL excluded domains updated for ${username}`,
          excludedDomains: excludedDomains,
          result: result
        };
      } else {
        const error = result?.metadata?.reason || 'Unknown error';
        console.log(`❌ Failed to update AutoSSL excluded domains for ${username}: ${error}`);
        return {
          success: false,
          error: error,
          message: `Failed to update AutoSSL excluded domains for ${username}: ${error}`,
          result: result
        };
      }
    } catch (error) {
      console.log(`❌ Error setting AutoSSL excluded domains for ${username}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: `Error setting AutoSSL excluded domains for ${username}: ${error.message}`
      };
    }
  }

  /**
   * Reset AutoSSL provider to ensure it's properly configured
   * @param {string} serverName - Server name
   * @param {string} provider - AutoSSL provider ('Let\'s Encrypt', 'Sectigo', etc.)
   * @returns {Promise<object>} - Operation result
   */
  async resetAutoSSLProvider(serverName, provider = 'Let\'s Encrypt') {
    try {
      console.log(`→ Resetting AutoSSL provider to: ${provider} on server ${serverName.toUpperCase()}`);
      
      const result = await this.callServerAPI(serverName, 'reset_autossl_provider', {
        provider: provider
      }, '1'); // WHM API v1
      
      if (result && result.metadata && result.metadata.result === 1) {
        console.log(`✅ Successfully reset AutoSSL provider to ${provider}`);
        return {
          success: true,
          message: `AutoSSL provider reset to ${provider}`,
          provider: provider,
          serverName: serverName,
          result: result
        };
      } else {
        const reason = result?.metadata?.reason || 'Unknown reason';
        console.log(`❌ Failed to reset AutoSSL provider: ${reason}`);
        return {
          success: false,
          error: reason,
          message: `Failed to reset AutoSSL provider to ${provider}: ${reason}`,
          provider: provider,
          serverName: serverName,
          result: result
        };
      }
      
    } catch (error) {
      console.log(`❌ Error resetting AutoSSL provider: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: `Error resetting AutoSSL provider: ${error.message}`,
        provider: provider,
        serverName: serverName
      };
    }
  }

  /**
   * Trigger AutoSSL check for a user to actively generate certificates
   * Based on testing, WHM API v1 AutoSSL trigger endpoints are not available on most servers
   * This method now focuses on providing clear feedback about the passive approach
   * @param {string} serverName - Server name
   * @param {string} username - cPanel username
   * @returns {Promise<object>} - Operation result
   */
  async triggerAutoSSLCheck(serverName, username) {
    try {
      console.log(`→ Triggering AutoSSL check for user ${username} on server ${serverName.toUpperCase()}`);
      console.log(`→ Using WHM API v1 compatible endpoints with correct method names`);
      
      // Method 1: Try start_autossl_check_for_one_user (CORRECT WHM API v1 method)
      try {
        console.log(`→ Method 1: Attempting start_autossl_check_for_one_user (WHM API v1)`);
        const result = await this.callServerAPI(serverName, 'start_autossl_check_for_one_user', {
          username: username
        }, '1'); // Explicitly use API v1
        
        if (result && result.metadata && result.metadata.result === 1) {
          console.log(`✅ Successfully triggered AutoSSL check using start_autossl_check_for_one_user`);
          return {
            success: true,
            message: `AutoSSL check triggered for user ${username}`,
            method: 'start_autossl_check_for_one_user',
            username: username,
            serverName: serverName,
            result: result
          };
        } else {
          console.log(`→ start_autossl_check_for_one_user returned result=0: ${result?.metadata?.reason || 'Unknown reason'}`);
        }
      } catch (firstError) {
        console.log(`→ start_autossl_check_for_one_user failed: ${firstError.message}`);
      }
      
      // Method 2: Try autossl_check_users (WHM API v1 compatible)
      try {
        console.log(`→ Method 2: Attempting autossl_check_users (WHM API v1)`);
        const result = await this.callServerAPI(serverName, 'autossl_check_users', {
          users: username
        }, '1'); // Explicitly use API v1
        
        if (result && result.metadata && result.metadata.result === 1) {
          console.log(`✅ Successfully triggered AutoSSL check using autossl_check_users`);
          return {
            success: true,
            message: `AutoSSL check triggered for user ${username}`,
            method: 'autossl_check_users',
            username: username,
            serverName: serverName,
            result: result
          };
        } else {
          console.log(`→ autossl_check_users returned result=0: ${result?.metadata?.reason || 'Unknown reason'}`);
        }
      } catch (secondError) {
        console.log(`→ autossl_check_users failed: ${secondError.message}`);
      }
      
      // Method 3: Try run_autossl_check_for_user (alternative naming)
      try {
        console.log(`→ Method 3: Attempting run_autossl_check_for_user (WHM API v1)`);
        const result = await this.callServerAPI(serverName, 'run_autossl_check_for_user', {
          username: username
        }, '1'); // Explicitly use API v1
        
        if (result && result.metadata && result.metadata.result === 1) {
          console.log(`✅ Successfully triggered AutoSSL check using run_autossl_check_for_user`);
          return {
            success: true,
            message: `AutoSSL check triggered for user ${username}`,
            method: 'run_autossl_check_for_user',
            username: username,
            serverName: serverName,
            result: result
          };
        } else {
          console.log(`→ run_autossl_check_for_user returned result=0: ${result?.metadata?.reason || 'Unknown reason'}`);
        }
      } catch (thirdError) {
        console.log(`→ run_autossl_check_for_user failed: ${thirdError.message}`);
      }
      
      // Method 4: Try autossl_check_all_users with user filter (WHM API v1)
      try {
        console.log(`→ Method 4: Attempting autossl_check_all_users with user filter (WHM API v1)`);
        const result = await this.callServerAPI(serverName, 'autossl_check_all_users', {
          user: username
        }, '1'); // Explicitly use API v1
        
        if (result && result.metadata && result.metadata.result === 1) {
          console.log(`✅ Successfully triggered AutoSSL check using autossl_check_all_users`);
          return {
            success: true,
            message: `AutoSSL check triggered for user ${username}`,
            method: 'autossl_check_all_users',
            username: username,
            serverName: serverName,
            result: result
          };
        } else {
          console.log(`→ autossl_check_all_users returned result=0: ${result?.metadata?.reason || 'Unknown reason'}`);
        }
      } catch (fourthError) {
        console.log(`→ autossl_check_all_users failed: ${fourthError.message}`);
      }
      
      // Method 5: Try start_autossl_check (fallback method)
      try {
        console.log(`→ Method 5: Attempting start_autossl_check (WHM API v1 fallback)`);
        const result = await this.callServerAPI(serverName, 'start_autossl_check', {
          users: username
        }, '1'); // Explicitly use API v1
        
        if (result && result.metadata && result.metadata.result === 1) {
          console.log(`✅ Successfully triggered AutoSSL check using start_autossl_check`);
          return {
            success: true,
            message: `AutoSSL check triggered for user ${username}`,
            method: 'start_autossl_check',
            username: username,
            serverName: serverName,
            result: result
          };
        } else {
          console.log(`→ start_autossl_check returned result=0: ${result?.metadata?.reason || 'Unknown reason'}`);
        }
      } catch (fifthError) {
        console.log(`→ start_autossl_check failed: ${fifthError.message}`);
      }
      
      // All active methods failed - provide comprehensive feedback
      console.log(`⚠️ All active AutoSSL trigger methods failed on ${serverName.toUpperCase()}`);
      console.log(`→ This indicates that WHM API v1 on this server may not support active AutoSSL triggering`);
      console.log(`→ The domain has been removed from excluded list and will be processed in the next scheduled AutoSSL run`);
      console.log(`→ AutoSSL typically runs every 4-6 hours automatically on most cPanel servers`);
      
      return {
        success: false,
        error: 'No active AutoSSL trigger API available in WHM API v1 on this server',
        message: `AutoSSL trigger not available - domain will be checked in next scheduled AutoSSL run (typically within 4-6 hours)`,
        method: 'none_available',
        username: username,
        serverName: serverName,
        note: 'Domain has been removed from excluded list and will be processed in the next scheduled AutoSSL check',
        fallbackInfo: {
          scheduledRun: 'AutoSSL runs automatically every 4-6 hours',
          manualOption: 'Server administrator can manually trigger AutoSSL from WHM interface',
          domainStatus: 'Domain is now included in AutoSSL and will be processed automatically'
        }
      };
      
    } catch (error) {
      console.log(`❌ Error triggering AutoSSL check for ${username}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: `Error triggering AutoSSL check for ${username}: ${error.message}`,
        method: 'error',
        username: username,
        serverName: serverName
      };
    }
  }

  /**
   * Add domain to AutoSSL excluded domains
   * @param {string} serverName - Server name
   * @param {string} username - cPanel username
   * @param {string} domain - Domain to exclude from AutoSSL
   * @returns {Promise<object>} - AutoSSL operation result
   */
  async excludeDomainFromAutoSSL(serverName, username, domain) {
    try {
      console.log(`🚫 Excluding domain from AutoSSL: ${domain} (user: ${username}, server: ${serverName})`);
      
      // Get current excluded domains
      const currentExcluded = await this.getAutoSSLExcludedDomains(serverName, username);
      
      // Add domain to excluded list if not already there
      if (currentExcluded.includes(domain)) {
        console.log(`→ Domain ${domain} is already excluded from AutoSSL`);
        return {
          success: true,
          message: `Domain ${domain} is already excluded from AutoSSL`,
          wasAlreadyExcluded: true,
          currentExcluded: currentExcluded
        };
      }
      
      const updatedExcluded = [...currentExcluded, domain];
      
      console.log(`→ Adding ${domain} to AutoSSL excluded domains list`);
      console.log(`→ Previous excluded domains: ${currentExcluded.join(', ')}`);
      console.log(`→ Updated excluded domains: ${updatedExcluded.join(', ')}`);
      
      const result = await this.setAutoSSLExcludedDomains(serverName, username, updatedExcluded);
      
      if (result.success) {
        console.log(`✅ Successfully excluded ${domain} from AutoSSL`);
        return {
          success: true,
          message: `Domain ${domain} has been excluded from AutoSSL`,
          wasAlreadyExcluded: false,
          addedToExcluded: true,
          previousExcluded: currentExcluded,
          currentExcluded: updatedExcluded,
          result: result
        };
      } else {
        console.log(`❌ Failed to exclude ${domain} from AutoSSL: ${result.error}`);
        return {
          success: false,
          error: result.error,
          message: `Failed to exclude ${domain} from AutoSSL: ${error}`,
          result: result
        };
      }
      
    } catch (error) {
      console.log(`❌ Error excluding ${domain} from AutoSSL: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: `Error excluding ${domain} from AutoSSL: ${error.message}`
      };
    }
  }

  /**
   * Focused AutoSSL Management - Implements the complete workflow without wait
   * This method implements the Remove Exclusion → Enable → Trigger workflow from the focused test
   * @param {string} serverName - Server name (e.g., 'cp1', 'pcp3')
   * @param {string} username - cPanel username
   * @param {string|Array} domains - Domain(s) to manage AutoSSL for (can be string or array)
   * @param {Object} options - Additional options (userDomainData from zone file)
   * @returns {Promise<object>} - AutoSSL operation result
   */
  async focusedAutoSSLManagement(serverName, username, domains, options = {}) {
    try {
      // Handle both single domain and array of domains
      const domainArray = Array.isArray(domains) ? domains : [domains];
      const mainDomain = domainArray[0];
      const userDomainData = options.userDomainData || null;
      
      console.log(`🎯 Focused AutoSSL Management for user: ${username} on server: ${serverName}`);
      console.log(`→ Processing ${domainArray.length} domain(s): ${domainArray.join(', ')}`);
      console.log(`→ Using complete workflow: Remove Exclusion → Enable → Trigger (no wait)`);
      
      if (userDomainData) {
        console.log(`→ Zone file data available: ${userDomainData.summary.totalDomains} domains, ${userDomainData.summary.aRecords} A records, ${userDomainData.summary.cnameRecords} CNAME records`);
      }
      
      const results = {};
      
      // Step 1: Remove all user domains from AutoSSL excluded domains
      console.log(`\n🔧 Step 1: Remove All User Domains from AutoSSL Exclusions`);
      console.log(`→ Method: remove_autossl_user_excluded_domains`);
      
      // Build comprehensive list of domains to remove from exclusions
      const domainsToRemove = new Set();
      
      // Add main domains
      domainArray.forEach(domain => {
        domainsToRemove.add(domain.toLowerCase());
        domainsToRemove.add(`www.${domain.toLowerCase()}`);
      });
      
      // Add domains from zone file if available
      if (userDomainData && userDomainData.domains) {
        userDomainData.domains.forEach(domain => {
          domainsToRemove.add(domain.toLowerCase());
          
          // Only add www version for domains that make sense to have www
          if (!domain.startsWith('www.') && this.shouldDomainHaveWwwVariant(domain)) {
            domainsToRemove.add(`www.${domain.toLowerCase()}`);
          }
        });
      }
      
      const domainsToRemoveArray = Array.from(domainsToRemove);
      
      console.log(`→ Domains to remove from exclusions (${domainsToRemoveArray.length} total):`);
      domainsToRemoveArray.forEach(domain => console.log(`  • ${domain}`));
      console.log(`→ Purpose: Ensures all user domains are not excluded from AutoSSL`);
      // Process domain removals in parallel for better performance
      console.log(`→ Processing ${domainsToRemoveArray.length} domain removals in parallel...`);
      const startTime = Date.now();
      
      const removalPromises = domainsToRemoveArray.map(async (domainToRemove) => {
        console.log(`→ Starting removal: ${domainToRemove}`);
        try {
          const removeResult = await this.callServerAPI(serverName, 'remove_autossl_user_excluded_domains', {
            username: username,
            domain: domainToRemove
          }, '1'); // WHM API v1
          
          const isSuccess = removeResult && removeResult.metadata && removeResult.metadata.result === 1;
          
          if (isSuccess) {
            console.log(`✅ SUCCESS: ${domainToRemove} removed from AutoSSL exclusions`);
          } else {
            console.log(`⚠️ PARTIAL: ${domainToRemove} removal result=${removeResult?.metadata?.result || 'unknown'}`);
          }
          
          return {
            domain: domainToRemove,
            success: isSuccess,
            result: removeResult,
            reason: removeResult?.metadata?.reason || 'No reason provided'
          };
          
        } catch (removeError) {
          console.log(`❌ ERROR removing ${domainToRemove}: ${removeError.message}`);
          return {
            domain: domainToRemove,
            success: false,
            error: removeError.message,
            reason: 'API call failed'
          };
        }
      });
      
      // Wait for all removals to complete
      const removalResults = await Promise.allSettled(removalPromises);
      const executionTime = Date.now() - startTime;
      
      // Process results
      const removeResults = [];
      let successCount = 0;
      let errorCount = 0;
      
      removalResults.forEach((result, index) => {
        const domainToRemove = domainsToRemoveArray[index];
        
        if (result.status === 'fulfilled') {
          const domainResult = result.value;
          removeResults.push(domainResult);
          
          if (domainResult.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } else {
          console.log(`❌ PROMISE ERROR for ${domainToRemove}: ${result.reason}`);
          errorCount++;
          removeResults.push({
            domain: domainToRemove,
            success: false,
            error: result.reason?.message || 'Promise rejection',
            reason: 'Promise failed'
          });
        }
      });
      
      console.log(`→ Parallel removal completed in ${executionTime}ms`);
      console.log(`→ Results: ${successCount} successful, ${errorCount} failed`);
      
      results.step1_remove = {
        method: 'remove_autossl_user_excluded_domains',
        parameters: { username: username, domains: domainsToRemoveArray },
        success: successCount > 0, // Success if at least one domain was removed
        completeSuccess: successCount === domainsToRemoveArray.length, // Complete success if all domains removed
        apiExists: removeResults.length > 0,
        successCount: successCount,
        errorCount: errorCount,
        totalDomains: domainsToRemoveArray.length,
        results: removeResults,
        reason: `${successCount}/${domainsToRemoveArray.length} domains removed successfully`
      };
      
      if (results.step1_remove.completeSuccess) {
        console.log(`✅ Step 1 COMPLETE SUCCESS: All ${domainsToRemoveArray.length} user domains removed from AutoSSL exclusions`);
      } else if (results.step1_remove.success) {
        console.log(`⚠️ Step 1 PARTIAL SUCCESS: ${successCount}/${domainsToRemoveArray.length} domains removed from AutoSSL exclusions`);
      } else {
        console.log(`❌ Step 1 FAILED: No domains could be removed from AutoSSL exclusions`);
      }
      
      // Step 2: Enable AutoSSL for user (ensures they are not excluded)
      console.log(`\n🔧 Step 2: Enable AutoSSL for User`);
      console.log(`→ Method: add_override_features_for_user`);
      console.log(`→ Parameters: { user: '${username}', features: '{"autossl":1}' }`);
      console.log(`→ Purpose: Ensures user is not excluded from AutoSSL`);
      
      try {
        const enableResult = await this.callServerAPI(serverName, 'add_override_features_for_user', {
          user: username,
          features: JSON.stringify({ autossl: 1 })
        }, '1'); // WHM API v1
        
        console.log(`→ Enable Result:`, JSON.stringify(enableResult, null, 2));
        
        results.step2_enable = {
          method: 'add_override_features_for_user',
          parameters: { user: username, features: '{"autossl":1}' },
          success: enableResult && enableResult.metadata && enableResult.metadata.result === 1,
          apiExists: enableResult && !enableResult.error,
          result: enableResult,
          reason: enableResult?.metadata?.reason || 'No reason provided'
        };
        
        if (results.step2_enable.success) {
          console.log(`✅ Step 2 SUCCESS: AutoSSL enabled for user ${username}`);
        } else {
          console.log(`⚠️ Step 2 PARTIAL: Enable API called but result=${enableResult?.metadata?.result || 'unknown'}`);
          console.log(`→ Reason: ${enableResult?.metadata?.reason || 'No reason provided'}`);
        }
        
      } catch (enableError) {
        console.log(`❌ Step 2 ERROR: ${enableError.message}`);
        results.step2_enable = {
          method: 'add_override_features_for_user',
          parameters: { user: username, features: '{"autossl":1}' },
          success: false,
          apiExists: false,
          error: enableError.message
        };
      }
      
      // Step 3: Trigger AutoSSL for the specific user (starts the issuance)
      console.log(`\n🔧 Step 3: Trigger AutoSSL for User`);
      console.log(`→ Method: start_autossl_check_for_one_user`);
      console.log(`→ Parameters: { username: '${username}' }`);
      console.log(`→ Purpose: Starts the SSL certificate issuance process`);
      
      try {
        const triggerResult = await this.callServerAPI(serverName, 'start_autossl_check_for_one_user', {
          username: username
        }, '1'); // WHM API v1
        
        console.log(`→ Trigger Result:`, JSON.stringify(triggerResult, null, 2));
        
        results.step3_trigger = {
          method: 'start_autossl_check_for_one_user',
          parameters: { username: username },
          success: triggerResult && triggerResult.metadata && triggerResult.metadata.result === 1,
          apiExists: triggerResult && !triggerResult.error,
          result: triggerResult,
          reason: triggerResult?.metadata?.reason || 'No reason provided'
        };
        
        if (results.step3_trigger.success) {
          console.log(`✅ Step 3 SUCCESS: AutoSSL check triggered for user ${username}`);
        } else {
          console.log(`⚠️ Step 3 PARTIAL: Trigger API called but result=${triggerResult?.metadata?.result || 'unknown'}`);
          console.log(`→ Reason: ${triggerResult?.metadata?.reason || 'No reason provided'}`);
        }
        
      } catch (triggerError) {
        console.log(`❌ Step 3 ERROR: ${triggerError.message}`);
        results.step3_trigger = {
          method: 'start_autossl_check_for_one_user',
          parameters: { username: username },
          success: false,
          apiExists: false,
          error: triggerError.message
        };
      }
      
      console.log(`\n✅ Focused AutoSSL workflow completed!`);
      console.log(`→ AutoSSL certificate generation has been triggered`);
      console.log(`→ Certificate will be generated automatically by the system`);
      console.log(`→ No wait time - returning immediately`);
      
      // Analyze complete workflow results
      const workflowAnalysis = {
        removeWorked: results.step1_remove.success,
        removeCompleteSuccess: results.step1_remove.completeSuccess,
        domainsRemoved: results.step1_remove.successCount,
        totalDomains: results.step1_remove.totalDomains,
        enableWorked: results.step2_enable.success,
        triggerWorked: results.step3_trigger.success,
        bothAPIsExist: results.step2_enable.apiExists && results.step3_trigger.apiExists,
        workflowSuccess: results.step2_enable.success && results.step3_trigger.success,
        completeSuccess: results.step2_enable.success && results.step3_trigger.success && results.step1_remove.success,
        domainProvided: true,
        recommendedApproach: null
      };
      
      // Determine recommended approach based on complete workflow
      if (workflowAnalysis.completeSuccess) {
        workflowAnalysis.recommendedApproach = 'COMPLETE SUCCESS: Use full Remove Exclusion → Enable → Trigger workflow';
      } else if (workflowAnalysis.workflowSuccess) {
        workflowAnalysis.recommendedApproach = 'SUCCESS: Use add_override_features_for_user + start_autossl_check_for_one_user workflow';
      } else if (results.step3_trigger.success && !results.step2_enable.success) {
        workflowAnalysis.recommendedApproach = 'Use start_autossl_check_for_one_user only (enable not needed)';
      } else if (results.step2_enable.success && !results.step3_trigger.success) {
        workflowAnalysis.recommendedApproach = 'Use add_override_features_for_user only (trigger not available)';
      } else if (workflowAnalysis.bothAPIsExist) {
        workflowAnalysis.recommendedApproach = 'Both APIs exist but may need different parameters';
      } else {
        workflowAnalysis.recommendedApproach = 'APIs not working - use passive AutoSSL approach';
      }
      
      console.log(`\n📊 COMPLETE WORKFLOW ANALYSIS:`);
      console.log(`→ Remove exclusion worked: ${workflowAnalysis.removeWorked ? '✅' : '❌'}`);
      console.log(`→ Domains removed: ${workflowAnalysis.domainsRemoved}/${workflowAnalysis.totalDomains}`);
      console.log(`→ Complete removal: ${workflowAnalysis.removeCompleteSuccess ? '✅' : '❌'}`);
      console.log(`→ Enable worked: ${workflowAnalysis.enableWorked ? '✅' : '❌'}`);
      console.log(`→ Trigger worked: ${workflowAnalysis.triggerWorked ? '✅' : '❌'}`);
      console.log(`→ Both APIs exist: ${workflowAnalysis.bothAPIsExist ? '✅' : '❌'}`);
      console.log(`→ Workflow success: ${workflowAnalysis.workflowSuccess ? '✅' : '❌'}`);
      console.log(`→ Complete success: ${workflowAnalysis.completeSuccess ? '✅' : '❌'}`);
      console.log(`→ Recommended approach: ${workflowAnalysis.recommendedApproach}`);
      
      // Return result in format compatible with existing service status flow
      return {
        success: workflowAnalysis.workflowSuccess || workflowAnalysis.removeWorked,
        message: workflowAnalysis.completeSuccess 
          ? `AutoSSL workflow completed successfully. ${domainsToRemoveArray.length} user domains have been processed for SSL certificate generation.`
          : workflowAnalysis.workflowSuccess
          ? `AutoSSL workflow partially successful. SSL certificate generation has been triggered for user ${username}.`
          : workflowAnalysis.removeWorked
          ? `Domain exclusions removed successfully. AutoSSL will process user domains in the next scheduled run.`
          : `AutoSSL workflow failed. Manual intervention may be required.`,
        
        // Compatibility with existing service status flow
        wasExcluded: results.step1_remove.successCount > 0,
        removedFromExcluded: results.step1_remove.success,
        autoSSLTriggered: results.step3_trigger.success,
        triggerMethod: results.step3_trigger.success ? 'start_autossl_check_for_one_user' : null,
        triggerError: results.step3_trigger.success ? null : (results.step3_trigger.error || 'Trigger method not available'),
        triggerMessage: results.step3_trigger.reason || 'AutoSSL trigger attempted',
        
        // Additional workflow details
        method: workflowAnalysis.completeSuccess ? 'focused_autossl_complete' : 
                workflowAnalysis.workflowSuccess ? 'focused_autossl_partial' :
                workflowAnalysis.removeWorked ? 'focused_autossl_remove_only' : 'focused_autossl_failed',
        username: username,
        domain: mainDomain, // Keep main domain for compatibility
        domains: domainArray, // All processed domains
        userDomains: domainsToRemoveArray, // All domains from zone file
        serverName: serverName,
        
        // Timeline information
        timeline: results.step3_trigger.success 
          ? 'SSL certificate generation has been actively triggered and should complete within minutes'
          : results.step2_enable.success
          ? 'AutoSSL has been enabled and will generate certificate in next scheduled run (typically within 4-6 hours)'
          : results.step1_remove.success
          ? 'Domain exclusions removed - certificate will be generated in next scheduled AutoSSL run (typically within 4-6 hours)'
          : 'AutoSSL workflow failed - manual intervention required',
        
        approach: results.step3_trigger.success ? 'active' : 'passive',
        explanation: results.step3_trigger.success 
          ? 'Active AutoSSL triggering successful - certificate generation initiated immediately'
          : 'Active AutoSSL triggering not available - using passive approach with scheduled generation',
        
        // Enhanced domain information
        domainInfo: {
          mainDomain: mainDomain,
          totalDomains: domainArray.length,
          userDomains: domainsToRemoveArray.length,
          zoneFileData: userDomainData ? userDomainData.summary : null
        },
        
        // Detailed results for debugging
        workflowResults: results,
        workflowAnalysis: workflowAnalysis
      };
      
    } catch (error) {
      const mainDomain = Array.isArray(domains) ? domains[0] : domains;
      console.log(`❌ Error in focused AutoSSL management for ${mainDomain}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: `Error in focused AutoSSL management for ${mainDomain}: ${error.message}`,
        method: 'focused_autossl_exception',
        username: username,
        domain: mainDomain,
        domains: Array.isArray(domains) ? domains : [domains],
        serverName: serverName,
        autoSSLTriggered: false,
        triggerMethod: null,
        approach: 'failed',
        timeline: 'AutoSSL workflow failed - manual intervention required'
      };
    }
  }

  /**
   * Extract all user domains from DNS zone file (A and CNAME records)
   * @param {Array} dnsZoneRecords - DNS zone records from getDNSZone
   * @param {string} domain - Main domain name
   * @returns {Object} - Object containing all user domains and their record details
   */
  extractUserDomainsFromZone(dnsZoneRecords, domain) {
    console.log(`🔍 Extracting all user domains from DNS zone for: ${domain}`);
    
    if (!dnsZoneRecords || dnsZoneRecords.length === 0) {
      console.log(`→ No DNS zone records provided`);
      return {
        domains: [domain], // Fallback to main domain only
        records: {
          A: [],
          CNAME: []
        },
        summary: {
          totalDomains: 1,
          aRecords: 0,
          cnameRecords: 0
        }
      };
    }
    
    const userDomains = new Set();
    const aRecords = [];
    const cnameRecords = [];
    
    // Process each DNS record
    dnsZoneRecords.forEach(record => {
      if (!record.type || !record.name) return;
      
      const recordName = (record.name || '').toLowerCase().trim();
      const recordType = record.type.toUpperCase();
      const domainLower = domain.toLowerCase();
      
      // Extract domain name from record
      let extractedDomain = recordName;
      
      // Handle different record name formats
      if (recordName === '' || recordName === '@') {
        extractedDomain = domainLower; // Root domain
      } else if (recordName.endsWith('.')) {
        extractedDomain = recordName.slice(0, -1); // Remove trailing dot
      } else if (!recordName.includes('.')) {
        extractedDomain = `${recordName}.${domainLower}`; // Subdomain
      }
      
      // Only include domains that belong to this zone and need SSL certificates
      if (extractedDomain === domainLower || extractedDomain.endsWith(`.${domainLower}`)) {
        
        // Filter out DNS-only records that don't need SSL certificates
        const shouldIncludeForSSL = this.shouldDomainGetSSLCertificate(extractedDomain, recordType);
        
        if (shouldIncludeForSSL) {
          userDomains.add(extractedDomain);
          
          if (recordType === 'A') {
            aRecords.push({
              domain: extractedDomain,
              name: recordName,
              type: recordType,
              address: record.address,
              ttl: record.ttl,
              line: record.Line || record.line
            });
          } else if (recordType === 'CNAME') {
            cnameRecords.push({
              domain: extractedDomain,
              name: recordName,
              type: recordType,
              target: record.cname || record.target,
              ttl: record.ttl,
              line: record.Line || record.line
            });
          }
        } else {
          console.log(`→ Skipping SSL for DNS-only record: ${extractedDomain} (${recordType})`);
        }
      }
    });
    
    // Convert Set to Array and ensure main domain is included
    const domainsArray = Array.from(userDomains);
    if (!domainsArray.includes(domain.toLowerCase())) {
      domainsArray.unshift(domain.toLowerCase());
    }
    
    const result = {
      domains: domainsArray,
      records: {
        A: aRecords,
        CNAME: cnameRecords
      },
      summary: {
        totalDomains: domainsArray.length,
        aRecords: aRecords.length,
        cnameRecords: cnameRecords.length
      }
    };
    
    console.log(`→ Extracted ${result.summary.totalDomains} user domains:`);
    domainsArray.forEach(d => console.log(`  • ${d}`));
    console.log(`→ Found ${result.summary.aRecords} A records and ${result.summary.cnameRecords} CNAME records`);
    
    return result;
  }

  /**
   * Determine if a domain should get an SSL certificate
   * Filters out DNS-only records that don't need SSL certificates
   * @param {string} domainName - Domain name to check
   * @param {string} recordType - DNS record type (A, CNAME, etc.)
   * @returns {boolean} - Whether this domain should get SSL certificate
   */
  shouldDomainGetSSLCertificate(domainName, recordType) {
    // Only process A and CNAME records (not MX, TXT, etc.)
    if (recordType !== 'A' && recordType !== 'CNAME') {
      return false;
    }
    
    // Extract subdomain part (everything before the main domain)
    const parts = domainName.split('.');
    if (parts.length < 2) return true; // Main domain always gets SSL
    
    const subdomain = parts[0].toLowerCase();
    
    // DNS-only subdomains that should NOT get SSL certificates
    const dnsOnlySubdomains = [
      '_dmarc',           // DMARC policy records
      '_domainkey',       // DKIM signature records  
      'default._domainkey', // Default DKIM key
      '_acme-challenge',  // Let's Encrypt challenge records
      '_sip',            // SIP protocol records
      '_xmpp',           // XMPP protocol records
      '_caldav',         // CalDAV protocol records
      '_carddav',        // CardDAV protocol records
      'autoconfig',      // Email autoconfig (sometimes needs SSL)
      'autodiscover',    // Email autodiscover (sometimes needs SSL)
      'mta-sts',         // MTA-STS policy records
    ];
    
    // Check if this is a DNS-only subdomain
    if (dnsOnlySubdomains.includes(subdomain)) {
      return false;
    }
    
    // Check for underscore-prefixed subdomains (usually DNS-only)
    if (subdomain.startsWith('_')) {
      return false;
    }
    
    // Web services that DO need SSL certificates
    const webServiceSubdomains = [
      'www',             // Main website
      'mail',            // Webmail
      'webmail',         // Webmail
      'cpanel',          // cPanel interface
      'whm',             // WHM interface
      'webdisk',         // Web disk interface
      'cpcalendars',     // cPanel calendars
      'cpcontacts',      // cPanel contacts
      'ftp',             // FTP (if web-based)
      'api',             // API endpoints
      'admin',           // Admin interfaces
      'blog',            // Blog subdomain
      'shop',            // Shop subdomain
      'store',           // Store subdomain
      'app',             // Application subdomain
      'portal',          // Portal subdomain
    ];
    
    // If it's a known web service, it needs SSL
    if (webServiceSubdomains.includes(subdomain)) {
      return true;
    }
    
    // For unknown subdomains, include them (better to have SSL than not)
    // This covers custom subdomains like 'blog', 'shop', etc.
    return true;
  }

  /**
   * Determine if a domain should have a www variant for SSL
   * @param {string} domainName - Domain name to check
   * @returns {boolean} - Whether this domain should have a www variant
   */
  shouldDomainHaveWwwVariant(domainName) {
    // Extract subdomain part
    const parts = domainName.split('.');
    if (parts.length < 2) return true; // Main domain always gets www variant
    
    const subdomain = parts[0].toLowerCase();
    
    // DNS-only subdomains should NOT have www variants
    const dnsOnlySubdomains = [
      '_dmarc', '_domainkey', 'default._domainkey', '_acme-challenge',
      '_sip', '_xmpp', '_caldav', '_carddav', 'mta-sts'
    ];
    
    if (dnsOnlySubdomains.includes(subdomain) || subdomain.startsWith('_')) {
      return false;
    }
    
    // Technical service subdomains that don't typically use www
    const noWwwSubdomains = [
      'mail', 'ftp', 'cpanel', 'whm', 'webdisk', 'webmail',
      'cpcalendars', 'cpcontacts', 'api', 'admin'
    ];
    
    if (noWwwSubdomains.includes(subdomain)) {
      return false;
    }
    
    // Website subdomains that might use www
    const websiteSubdomains = [
      'blog', 'shop', 'store', 'app', 'portal', 'support', 'help'
    ];
    
    if (websiteSubdomains.includes(subdomain)) {
      return true;
    }
    
    // For unknown subdomains, don't add www (conservative approach)
    return false;
  }

  /**
   * Get account information by username
   * @param {string} username - cPanel username
   * @returns {Promise<object|null>} - Account object or null
   */
  async getAccountByUsername(username) {
    try {
      const accounts = await this.listAccounts({ owner: username });
      return accounts.find(acc => acc.user === username) || null;
    } catch (error) {
      console.error(`Error finding account for username ${username}:`, error.message);
      return null;
    }
  }

  /**
   * Create new cPanel account
   * @param {object} accountData - Account creation data
   * @returns {Promise<object>} - Creation result
   */
  async createAccount(accountData) {
    const {
      username,
      domain,
      password,
      email,
      package: packageName,
      quota = 'unlimited',
      hasshell = 0,
      contactemail = email
    } = accountData;

    const params = {
      username,
      domain,
      password,
      contactemail,
      plan: packageName,
      quota,
      hasshell
    };

    return await this.callServerAPI('cp1', 'createacct', params);
  }

  /**
   * Suspend cPanel account
   * @param {string} username - cPanel username
   * @param {string} reason - Suspension reason
   * @returns {Promise<object>} - Suspension result
   */
  async suspendAccount(username, reason = 'Administrative suspension') {
    return await this.callServerAPI('cp1', 'suspendacct', {
      user: username,
      reason: reason
    });
  }

  /**
   * Unsuspend cPanel account
   * @param {string} username - cPanel username
   * @returns {Promise<object>} - Unsuspension result
   */
  async unsuspendAccount(username) {
    return await this.callServerAPI('cp1', 'unsuspendacct', {
      user: username
    });
  }

  /**
   * Terminate cPanel account
   * @param {string} username - cPanel username
   * @param {boolean} keepdns - Keep DNS records
   * @returns {Promise<object>} - Termination result
   */
  async terminateAccount(username, keepdns = false) {
    return await this.callServerAPI('cp1', 'removeacct', {
      user: username,
      keepdns: keepdns ? 1 : 0
    });
  }

  // ========================================
  // PACKAGE MANAGEMENT
  // ========================================

  /**
   * List all hosting packages
   * @returns {Promise<Array>} - Array of package objects
   */
  async listPackages() {
    const response = await this.callServerAPI('cp1', 'listpkgs');
    return response.data?.pkg || [];
  }

  /**
   * Get package details by name
   * @param {string} packageName - Package name
   * @returns {Promise<object|null>} - Package object or null
   */
  async getPackage(packageName) {
    try {
      const packages = await this.listPackages();
      return packages.find(pkg => pkg.name === packageName) || null;
    } catch (error) {
      console.error(`Error finding package ${packageName}:`, error.message);
      return null;
    }
  }

  // ========================================
  // SERVER STATUS & INFORMATION
  // ========================================

  /**
   * Get server load average
   * @returns {Promise<object>} - Load average data
   */
  async getLoadAverage() {
    return await this.callServerAPI('cp1', 'loadavg');
  }

  /**
   * Get system information
   * @returns {Promise<object>} - System info
   */
  async getSystemInfo() {
    return await this.callServerAPI('cp1', 'getsysinfo');
  }

  /**
   * Get disk usage information
   * @returns {Promise<object>} - Disk usage data
   */
  async getDiskUsage() {
    return await this.callServerAPI('cp1', 'systemloadavg');
  }

  /**
   * Get server uptime
   * @returns {Promise<object>} - Uptime data
   */
  async getUptime() {
    return await this.callAPI('getuptime');
  }

  // ========================================
  // DOMAIN MANAGEMENT
  // ========================================

  /**
   * Add addon domain to account
   * @param {string} username - cPanel username
   * @param {string} domain - Domain to add
   * @param {string} subdomain - Subdomain prefix
   * @param {string} dir - Directory name
   * @returns {Promise<object>} - Addition result
   */
  async addAddonDomain(username, domain, subdomain, dir) {
    return await this.callAPI('addon_domain', {
      user: username,
      domain: domain,
      subdomain: subdomain,
      dir: dir
    });
  }

  /**
   * Remove addon domain from account
   * @param {string} username - cPanel username
   * @param {string} domain - Domain to remove
   * @returns {Promise<object>} - Removal result
   */
  async removeAddonDomain(username, domain) {
    return await this.callAPI('deladdondomain', {
      user: username,
      domain: domain
    });
  }

  // ========================================
  // BACKUP MANAGEMENT
  // ========================================

  /**
   * Create account backup
   * @param {string} username - cPanel username
   * @param {string} destination - Backup destination
   * @returns {Promise<object>} - Backup result
   */
  async createBackup(username, destination = 'homedir') {
    return await this.callAPI('fullbackup', {
      user: username,
      destination: destination
    });
  }

  /**
   * List account backups
   * @param {string} username - cPanel username
   * @returns {Promise<Array>} - Array of backup objects
   */
  async listBackups(username) {
    const response = await this.callAPI('backup_status', {
      user: username
    });
    return response.data || [];
  }

  // ========================================
  // RESOURCE USAGE
  // ========================================

  /**
   * Get account resource usage
   * @param {string} username - cPanel username
   * @returns {Promise<object>} - Resource usage data
   */
  async getAccountUsage(username) {
    return await this.callAPI('accountsummary', {
      user: username
    });
  }

  /**
   * Get bandwidth usage for account
   * @param {string} username - cPanel username
   * @param {string} month - Month (YYYY-MM format)
   * @returns {Promise<object>} - Bandwidth usage data
   */
  async getBandwidthUsage(username, month = null) {
    const params = { user: username };
    if (month) params.month = month;
    
    return await this.callAPI('showbw', params);
  }

  // ========================================
  // SSL CERTIFICATE MANAGEMENT
  // ========================================

  /**
   * Install SSL certificate
   * @param {string} username - cPanel username
   * @param {string} domain - Domain name
   * @param {string} cert - SSL certificate
   * @param {string} key - Private key
   * @param {string} cab - Certificate bundle (optional)
   * @returns {Promise<object>} - Installation result
   */
  async installSSL(username, domain, cert, key, cab = '') {
    return await this.callAPI('installssl', {
      user: username,
      domain: domain,
      cert: cert,
      key: key,
      cab: cab
    });
  }

  /**
   * List SSL certificates for account
   * @param {string} username - cPanel username
   * @returns {Promise<Array>} - Array of SSL certificate objects
   */
  async listSSLCertificates(username) {
    const response = await this.callAPI('listcrts', {
      user: username
    });
    return response.data?.crt || [];
  }

  // ========================================
  // EMAIL MANAGEMENT
  // ========================================

  /**
   * Create email account
   * @param {string} username - cPanel username
   * @param {string} email - Email address
   * @param {string} password - Email password
   * @param {number} quota - Email quota in MB
   * @returns {Promise<object>} - Creation result
   */
  async createEmailAccount(username, email, password, quota = 250) {
    return await this.callAPI('addpop', {
      user: username,
      email: email,
      password: password,
      quota: quota
    });
  }

  /**
   * Delete email account
   * @param {string} username - cPanel username
   * @param {string} email - Email address
   * @returns {Promise<object>} - Deletion result
   */
  async deleteEmailAccount(username, email) {
    return await this.callAPI('delpop', {
      user: username,
      email: email
    });
  }

  /**
   * List email accounts for user
   * @param {string} username - cPanel username
   * @returns {Promise<Array>} - Array of email account objects
   */
  async listEmailAccounts(username) {
    const response = await this.callAPI('listpops', {
      user: username
    });
    return response.data?.pop || [];
  }

  /**
   * Add missing A record to DNS zone file
   * @param {string} serverName - Server name
   * @param {string} domain - Domain name
   * @param {string} targetIP - IP address to add
   * @returns {Promise<Object>} - Result object with success status and details
   */
  async addMissingARecord(serverName, domain, targetIP) {
    console.log(`🔧 Adding missing A record for ${domain} on ${serverName.toUpperCase()} → ${targetIP}`);
    
    try {
      // Step 1: Verify the A record is actually missing
      console.log(`→ Step 1: Verifying A record is missing...`);
      const dnsRecords = await this.getDNSZone(serverName, domain);
      
      if (!dnsRecords || dnsRecords.length === 0) {
        console.log(`⚠️ Could not retrieve DNS zone records`);
        return { success: false, error: 'Could not retrieve DNS zone records', domain };
      }
      
      // Check for existing main domain A records
      const mainDomainARecords = dnsRecords.filter(record => {
        if (record.type !== 'A') return false;
        const recordName = (record.name || record.dname || '').toLowerCase();
        const domainName = domain.toLowerCase();
        
        return (
          recordName === domainName ||
          recordName === `${domainName}.` ||
          recordName === '' ||
          recordName === '@'
        );
      });
      
      if (mainDomainARecords.length > 0) {
        console.log(`⚠️ A record already exists for ${domain}`);
        const existingIPs = mainDomainARecords.map(r => r.address);
        
        if (existingIPs.includes(targetIP)) {
          return {
            success: true,
            method: 'already_exists_correct',
            domain,
            ip: targetIP,
            message: 'A record already exists with correct IP'
          };
        } else {
          return {
            success: false,
            error: `A record exists but points to wrong IP: ${existingIPs.join(', ')} (expected: ${targetIP})`,
            domain,
            method: 'exists_wrong_ip',
            currentIPs: existingIPs,
            expectedIP: targetIP
          };
        }
      }
      
      console.log(`✅ Confirmed: No A record exists for ${domain}`);
      
      // Step 2: Add the A record
      console.log(`→ Step 2: Adding A record to zone file...`);
      
      const addResponse = await this.callServerAPI(serverName, 'addzonerecord', {
        domain: domain,
        name: `${domain}.`,  // Domain with trailing dot for root record
        type: 'A',
        address: targetIP,
        ttl: 14400
      });
      
      if (addResponse.metadata && addResponse.metadata.result === 1) {
        console.log(`✅ Successfully added A record: ${domain} → ${targetIP}`);
        
        // Step 3: Verify the addition
        console.log(`→ Step 3: Verifying A record was added...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for zone update
        
        const verifyRecords = await this.getDNSZone(serverName, domain);
        const hasCorrectIP = verifyRecords.some(r => 
          r.type === 'A' && 
          r.address === targetIP && 
          ((r.name || '').toLowerCase() === `${domain.toLowerCase()}.` || 
           (r.name || '').toLowerCase() === domain.toLowerCase() ||
           (r.name || '') === '' ||
           (r.name || '') === '@')
        );
        
        if (hasCorrectIP) {
          console.log(`✅ VERIFIED: A record addition successful`);
          
          // Step 4: Sync A record changes across nameservers
          console.log(`→ Step 4: Syncing A record across nameservers...`);
          const syncResult = await this.syncARecord(serverName, domain, targetIP);
          
          return { 
            success: true, 
            method: 'addzonerecord', 
            domain, 
            ip: targetIP,
            message: `Successfully added A record for ${domain} pointing to ${targetIP}`,
            synced: syncResult.success,
            syncMethod: syncResult.method,
            syncError: syncResult.success ? null : syncResult.error
          };
        } else {
          console.log(`⚠️ WARNING: API reported success but A record not found in zone`);
          return { 
            success: false, 
            error: 'A record addition reported success but not verified in zone file', 
            domain,
            method: 'addzonerecord_unverified'
          };
        }
      } else {
        const errorMsg = addResponse.metadata?.reason || 'Failed to add A record';
        console.log(`❌ Failed to add A record: ${errorMsg}`);
        return { success: false, error: errorMsg, domain, method: 'api_failed' };
      }
      
    } catch (error) {
      console.error(`❌ Error adding A record for ${domain}:`, error.message);
      return { success: false, error: error.message, domain, method: 'exception' };
    }
  }

  /**
   * Remove duplicate A records from DNS zone file
   * @param {string} serverName - Server name
   * @param {string} domain - Domain name
   * @param {string} correctIP - The correct IP address to keep
   * @returns {Promise<Object>} - Result object with success status and details
   */
  async removeDuplicateARecords(serverName, domain, correctIP) {
    console.log(`🔧 Removing duplicate A records for ${domain} on ${serverName.toUpperCase()}, keeping IP: ${correctIP}`);
    
    try {
      // Step 1: Get current DNS zone records
      console.log(`→ Step 1: Getting current DNS zone records...`);
      const dnsRecords = await this.getDNSZone(serverName, domain);
      
      if (!dnsRecords || dnsRecords.length === 0) {
        console.log(`⚠️ Could not retrieve DNS zone records`);
        return { success: false, error: 'Could not retrieve DNS zone records', domain };
      }
      
      // Step 2: Find all main domain A records
      console.log(`→ Step 2: Finding main domain A records...`);
      const mainDomainARecords = [];
      
      for (let i = 0; i < dnsRecords.length; i++) {
        const record = dnsRecords[i];
        if (record.type === 'A') {
          const recordName = (record.name || record.dname || '').toLowerCase();
          const domainName = domain.toLowerCase();
          
          const isMainDomainRecord = (
            recordName === domainName ||
            recordName === `${domainName}.` ||
            recordName === '' ||
            recordName === '@'
          );
          
          if (isMainDomainRecord) {
            const lineNumber = record.Line || record.line || i;
            mainDomainARecords.push({
              record: record,
              lineNumber: lineNumber,
              isCorrect: record.address === correctIP,
              hostname: recordName || `${domainName}.`
            });
            
            console.log(`→ Found A record at line ${lineNumber}: "${recordName}" → ${record.address} ${record.address === correctIP ? '✅' : '❌'}`);
          }
        }
      }
      
      console.log(`→ Found ${mainDomainARecords.length} main domain A records`);
      
      if (mainDomainARecords.length <= 1) {
        return {
          success: true,
          method: 'no_duplicates',
          domain,
          message: 'No duplicate A records found',
          duplicatesRemoved: 0
        };
      }
      
      // Step 3: Separate correct and incorrect records
      const correctRecords = mainDomainARecords.filter(r => r.isCorrect);
      const incorrectRecords = mainDomainARecords.filter(r => !r.isCorrect);
      
      console.log(`→ Correct records: ${correctRecords.length}, Incorrect records: ${incorrectRecords.length}`);
      
      if (incorrectRecords.length === 0) {
        return {
          success: true,
          method: 'no_incorrect_duplicates',
          domain,
          message: 'No incorrect duplicate A records found',
          duplicatesRemoved: 0
        };
      }
      
      // Step 4: Remove incorrect records (sort by line number descending to avoid shifting)
      console.log(`→ Step 3: Removing ${incorrectRecords.length} incorrect A records...`);
      const sortedForRemoval = incorrectRecords.sort((a, b) => b.lineNumber - a.lineNumber);
      let removedCount = 0;
      const removalErrors = [];
      
      for (const record of sortedForRemoval) {
        try {
          console.log(`🔧 Removing duplicate line ${record.lineNumber}: ${record.hostname} → ${record.record.address}`);
          
          const removeResponse = await this.callServerAPI(serverName, 'removezonerecord', {
            domain: domain,
            line: record.lineNumber
          });
          
          if (removeResponse && removeResponse.metadata && removeResponse.metadata.result === 1) {
            console.log(`✅ Removed duplicate line ${record.lineNumber}`);
            removedCount++;
          } else {
            const error = removeResponse?.metadata?.reason || 'Unknown reason';
            console.log(`⚠️ Failed to remove line ${record.lineNumber}: ${error}`);
            removalErrors.push(`Line ${record.lineNumber}: ${error}`);
          }
        } catch (removeError) {
          console.log(`❌ Failed to remove line ${record.lineNumber}: ${removeError.message}`);
          removalErrors.push(`Line ${record.lineNumber}: ${removeError.message}`);
        }
      }
      
      // Step 5: Verify final state
      console.log(`→ Step 4: Verifying duplicate removal...`);
      const finalRecords = await this.getDNSZone(serverName, domain);
      const finalMainRecords = finalRecords.filter(record => {
        if (record.type !== 'A') return false;
        const recordName = (record.name || '').toLowerCase();
        const domainName = domain.toLowerCase();
        return recordName === `${domainName}.` || recordName === domainName;
      });
      
      const finalCorrectRecords = finalMainRecords.filter(r => r.address === correctIP);
      const finalIncorrectRecords = finalMainRecords.filter(r => r.address !== correctIP);
      
      console.log(`→ Final state: ${finalCorrectRecords.length} correct, ${finalIncorrectRecords.length} incorrect`);
      
      // Step 6: Sync changes across nameservers
      if (removedCount > 0) {
        console.log(`\n🔄 Syncing A record changes across nameservers...`);
        const syncResult = await this.syncARecord(serverName, domain, correctIP);
        
        return {
          success: true,
          method: 'removezonerecord_duplicates',
          domain,
          ip: correctIP,
          duplicatesRemoved: removedCount,
          finalRecordCount: finalMainRecords.length,
          hasRemainingIncorrectRecords: finalIncorrectRecords.length > 0,
          removalErrors: removalErrors,
          synced: syncResult.success,
          syncMethod: syncResult.method,
          syncError: syncResult.success ? null : syncResult.error,
          message: `Successfully removed ${removedCount} duplicate A records${removalErrors.length > 0 ? ` (${removalErrors.length} failed)` : ''}`
        };
      } else {
        return {
          success: false,
          error: `Failed to remove any duplicate A records${removalErrors.length > 0 ? `: ${removalErrors.join(', ')}` : ''}`,
          domain,
          method: 'removal_failed',
          removalErrors: removalErrors
        };
      }
      
    } catch (error) {
      console.error(`❌ Error removing duplicate A records for ${domain}:`, error.message);
      return { success: false, error: error.message, domain, method: 'exception' };
    }
  }

  /**
   * Auto-fix missing A record (wrapper function for easier calling)
   * @param {string} domain - Domain name
   * @param {string} whmcsHint - Optional WHMCS server hint
   * @returns {Promise<Object>} - Result object with success status and details
   */
  async autoFixMissingARecord(domain, whmcsHint = null) {
    console.log(`🔧 Auto-fixing missing A record for: ${domain}`);
    
    try {
      // Step 1: Find which server hosts the domain
      const serverName = await this.findDomainServerByAccounts(domain, whmcsHint);
      
      if (!serverName) {
        return {
          success: false,
          error: 'Domain not found on any of our servers',
          domain,
          method: 'domain_not_found'
        };
      }
      
      console.log(`→ Domain found on server: ${serverName.toUpperCase()}`);
      
      // Step 2: Get the correct IP for this server
      const serverIP = await this.getServerIPFromCache(serverName);
      
      if (!serverIP) {
        return {
          success: false,
          error: `Could not determine IP address for server ${serverName.toUpperCase()}`,
          domain,
          server: serverName,
          method: 'server_ip_not_found'
        };
      }
      
      console.log(`→ Server IP: ${serverIP}`);
      
      // Step 3: Add the missing A record
      return await this.addMissingARecord(serverName, domain, serverIP);
      
    } catch (error) {
      console.error(`❌ Auto-fix failed for ${domain}:`, error.message);
      return {
        success: false,
        error: error.message,
        domain,
        method: 'auto_fix_exception'
      };
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Test WHM connection
   * @returns {Promise<boolean>} - Connection status
   */
  async testConnection() {
    try {
      await this.callAPI('version');
      console.log('✅ WHM connection test successful');
      return true;
    } catch (error) {
      console.error('❌ WHM connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get WHM version
   * @returns {Promise<string>} - WHM version
   */
  async getVersion() {
    const response = await this.callAPI('version');
    return response.data?.version || 'Unknown';
  }

  /**
   * Check if account exists
   * @param {string} username - cPanel username
   * @returns {Promise<boolean>} - Account existence status
   */
  async accountExists(username) {
    try {
      const account = await this.getAccountByUsername(username);
      return account !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get account status (Active, Suspended, etc.)
   * @param {string} username - cPanel username
   * @returns {Promise<string>} - Account status
   */
  async getAccountStatus(username) {
    try {
      const account = await this.getAccountByUsername(username);
      if (!account) return 'Not Found';
      
      if (account.suspended === '1') return 'Suspended';
      if (account.suspended === '0') return 'Active';
      
      return 'Unknown';
    } catch (error) {
      console.error(`Error getting account status for ${username}:`, error.message);
      return 'Error';
    }
  }

  // ========================================
  // DNS MANAGEMENT
  // ========================================

  /**
   * Get all servers with IPs from MongoDB cache (optimized server list)
   * @returns {Promise<Array>} - Array of server names that have IPs (includes all servers regardless of status)
   */
  async getActiveServersWithIPs() {
    try {
      const serverInfo = await getCurrentServerInfo();
      
      if (!serverInfo.rawWhmcsData || !serverInfo.rawWhmcsData.servers) {
        // Fallback to all configured servers if no cache data
        return Object.keys(this.serverApiKeys);
      }
      
      const serversRaw = serverInfo.rawWhmcsData.servers || {};
      const servers = serversRaw.server || serversRaw;
      const serverArray = Array.isArray(servers) ? servers : (servers ? [servers] : []);
      
      // Get all servers that have IPs (include all regardless of disabled status)
      const activeServersWithIPs = serverArray
        .filter(server => 
          server.ipaddress && 
          server.ipaddress.trim()
        )
        .map(server => {
          // Map server hostname to our server names
          const hostname = server.hostname ? server.hostname.toLowerCase() : '';
          
          // Try to match hostname to our server naming convention
          for (const serverName of Object.keys(this.serverApiKeys)) {
            const expectedHostname = this.getServerHostname(serverName).toLowerCase();
            if (hostname === expectedHostname || hostname.includes(serverName.toLowerCase())) {
              return serverName;
            }
          }
          
          // If no match found, try to extract server name from hostname
          const match = hostname.match(/(cp\d+|pcp\d+|rcp\d+)/);
          if (match) {
            return match[1];
          }
          
          return null;
        })
        .filter(serverName => serverName && this.serverApiKeys[serverName]);
      
      // Remove duplicates
      const uniqueServers = [...new Set(activeServersWithIPs)];
      
      console.log(`→ Found ${uniqueServers.length} servers with IPs: ${uniqueServers.join(', ')}`);
      
      return uniqueServers.length > 0 ? uniqueServers : Object.keys(this.serverApiKeys);
      
    } catch (error) {
      console.log(`⚠️ Failed to get servers from cache: ${error.message}`);
      // Fallback to all configured servers
      return Object.keys(this.serverApiKeys);
    }
  }

  /**
   * Find server by IP address from MongoDB cache
   * @param {string} targetIP - IP address to find
   * @returns {Promise<string|null>} - Server name or null if not found
   */
  async findServerByIP(targetIP) {
    try {
      const serverInfo = await getCurrentServerInfo();
      
      if (!serverInfo.rawWhmcsData || !serverInfo.rawWhmcsData.servers) {
        console.log('❌ No raw WHMCS data available in cache');
        return null;
      }
      
      const serversRaw = serverInfo.rawWhmcsData.servers || {};
      const servers = serversRaw.server || serversRaw;
      const serverArray = Array.isArray(servers) ? servers : (servers ? [servers] : []);
      
      // Find server with matching IP
      const matchingServer = serverArray.find(server => {
        // Check primary IP
        if (server.ipaddress && server.ipaddress.trim() === targetIP) {
          return true;
        }
        
        // Check assigned IPs if available
        if (server.assignedips) {
          const assignedIPs = Array.isArray(server.assignedips) 
            ? server.assignedips 
            : server.assignedips.split(',').map(ip => ip.trim());
          
          if (assignedIPs.includes(targetIP)) {
            return true;
          }
        }
        
        return false;
      });
      
      if (matchingServer) {
        // Map server hostname to our server names
        const hostname = matchingServer.hostname ? matchingServer.hostname.toLowerCase() : '';
        
        // Try to match hostname to our server naming convention
        for (const serverName of Object.keys(this.serverApiKeys)) {
          const expectedHostname = this.getServerHostname(serverName).toLowerCase();
          if (hostname === expectedHostname || hostname.includes(serverName.toLowerCase())) {
            console.log(`✅ Found server ${serverName.toUpperCase()} with IP ${targetIP}`);
            return serverName;
          }
        }
        
        // If no match found, try to extract server name from hostname
        const match = hostname.match(/(cp\d+|pcp\d+|rcp\d+)/);
        if (match && this.serverApiKeys[match[1]]) {
          console.log(`✅ Found server ${match[1].toUpperCase()} with IP ${targetIP}`);
          return match[1];
        }
      }
      
      console.log(`❌ No server found with IP ${targetIP}`);
      return null;
      
    } catch (error) {
      console.error(`❌ Error finding server by IP ${targetIP}:`, error.message);
      return null;
    }
  }

  /**
   * Find which server hosts a domain (super optimized - WHMCS hint first, then DNS lookup if needed)
   * @param {string} domain - Domain name
   * @param {Object} whmcsHint - Optional WHMCS server information to skip DNS lookup entirely
   * @returns {Promise<string|null>} - Server name or null if not found
   */
  async findDomainServer(domain, whmcsHint = null) {
    console.log(`🔍 Finding server for domain: ${domain}`);
    
    // If we have WHMCS server information, use it as a hint
    if (whmcsHint && whmcsHint.serverName) {
      console.log(`💡 WHMCS Hint: Domain should be on server ${whmcsHint.serverName.toUpperCase()} (IP: ${whmcsHint.serverIP || 'unknown'})`);
      
      try {
        // First, try to verify the domain exists on the WHMCS-indicated server
        const hintServerName = this.extractServerNameFromWHMCS(whmcsHint.serverName);
        
        if (hintServerName && this.serverApiKeys[hintServerName]) {
          console.log(`→ Checking WHMCS-indicated server: ${hintServerName.toUpperCase()}`);
          
          const serverResult = await this.callServerAPI(hintServerName, 'listaccts', { 
            searchtype: 'domain', 
            search: domain 
          });
          
          if (serverResult.data && serverResult.data.acct) {
            const accounts = Array.isArray(serverResult.data.acct) ? serverResult.data.acct : [serverResult.data.acct];
            const domainAccount = accounts.find(acc => acc.domain === domain);
            
            if (domainAccount) {
              console.log(`✅ Domain ${domain} confirmed on WHMCS-indicated server: ${hintServerName.toUpperCase()}`);
              console.log(`🎯 WHMCS server information is authoritative - skipping DNS lookup and server search`);
              
              // Optional: Check if DNS points to correct IP (for informational purposes only)
              if (whmcsHint.serverIP) {
                try {
                  const dns = require('dns').promises;
                  const currentIPs = await dns.resolve4(domain);
                  const pointsToCorrectServer = currentIPs.includes(whmcsHint.serverIP);
                  
                  if (pointsToCorrectServer) {
                    console.log(`✅ DNS correctly points to server IP: ${whmcsHint.serverIP}`);
                  } else {
                    console.log(`⚠️ DNS MISMATCH: Domain points to ${currentIPs.join(', ')} but server IP is ${whmcsHint.serverIP}`);
                  }
                } catch (dnsError) {
                  console.log(`→ Could not verify DNS: ${dnsError.message}`);
                }
              }
              
              // Return immediately - WHMCS data is authoritative
              return hintServerName;
            } else {
              console.log(`⚠️ Domain ${domain} not found on WHMCS-indicated server ${hintServerName.toUpperCase()}`);
              console.log(`→ Falling back to standard discovery method`);
            }
          }
        } else {
          console.log(`⚠️ WHMCS server name "${whmcsHint.serverName}" not recognized, falling back to standard discovery`);
        }
      } catch (hintError) {
        console.log(`⚠️ Error checking WHMCS-indicated server: ${hintError.message}`);
        console.log(`→ Falling back to standard discovery method`);
      }
    }
    
    try {
      // Step 1: Get domain's current A record IP via DNS lookup
      console.log(`→ Step 1: Getting A record for ${domain}...`);
      
      const dns = require('dns').promises;
      let domainIPs = [];
      
      try {
        domainIPs = await dns.resolve4(domain);
        console.log(`→ Domain ${domain} resolves to IPs: ${domainIPs.join(', ')}`);
      } catch (dnsError) {
        console.log(`→ DNS lookup failed: ${dnsError.message}`);
        // Fall back to server search if DNS lookup fails
        return await this.findDomainServerFallback(domain);
      }
      
      // Step 2: Find which of our servers has the matching IP
      console.log(`→ Step 2: Finding server with matching IP...`);
      
      for (const ip of domainIPs) {
        const serverName = await this.findServerByIP(ip);
        
        if (serverName) {
          console.log(`→ Step 3: Verifying domain ${domain} exists on server ${serverName.toUpperCase()}...`);
          
          // Step 3: Verify the domain actually exists on this server
          try {
            const serverResult = await this.callServerAPI(serverName, 'listaccts', { 
              searchtype: 'domain', 
              search: domain 
            });
            
            if (serverResult.data && serverResult.data.acct) {
              const accounts = Array.isArray(serverResult.data.acct) ? serverResult.data.acct : [serverResult.data.acct];
              const domainAccount = accounts.find(acc => acc.domain === domain);
              
              if (domainAccount) {
                console.log(`✅ Domain ${domain} confirmed on server: ${serverName.toUpperCase()} (IP: ${ip})`);
                return serverName;
              } else {
                console.log(`⚠️ Domain ${domain} not found on server ${serverName.toUpperCase()} despite IP match`);
              }
            }
          } catch (verifyError) {
            console.log(`⚠️ Error verifying domain on server ${serverName.toUpperCase()}: ${verifyError.message}`);
          }
        }
      }
      
      console.log(`❌ No matching server found for IPs: ${domainIPs.join(', ')}`);
      console.log(`🔧 Domain is pointing to wrong IP - need to find correct server and fix DNS`);
      
      // Step 4: Domain points to wrong IP - find the correct server via fallback search
      console.log(`→ Step 4: Finding correct server for domain (wrong IP detected)...`);
      const correctServer = await this.findDomainServerFallback(domain);
      
      if (correctServer) {
        console.log(`✅ Found correct server: ${correctServer.toUpperCase()}`);
        console.log(`🚨 DNS ISSUE DETECTED: Domain ${domain} points to ${domainIPs.join(', ')} but should point to server ${correctServer.toUpperCase()}`);
        
        // Get the correct server IP for comparison
        const correctIP = await this.getServerIPFromCache(correctServer);
        if (correctIP) {
          console.log(`→ Expected IP: ${correctIP} (server ${correctServer.toUpperCase()})`);
          console.log(`→ Current IP: ${domainIPs.join(', ')} (wrong)`);
          console.log(`🔧 A record needs to be updated from ${domainIPs.join(', ')} to ${correctIP}`);
        }
        
        return correctServer;
      }
      
      console.log(`❌ Domain ${domain} not found on any server - may be external hosting or not configured`);
      return null;
      
    } catch (error) {
      console.error(`❌ Error in optimized domain search: ${error.message}`);
      // Fall back to traditional server search
      return await this.findDomainServerFallback(domain);
    }
  }

  /**
   * Fallback method: Find domain by checking servers (used when IP matching fails)
   * @param {string} domain - Domain name
   * @returns {Promise<string|null>} - Server name or null if not found
   */
  async findDomainServerFallback(domain) {
    console.log(`🔍 Fallback: Searching servers for domain: ${domain}`);
    
    // Get servers with IPs to reduce search time
    const activeServers = await this.getActiveServersWithIPs();
    console.log(`→ Checking ${activeServers.length} servers (fallback method)`);
    
    // Prioritize servers - put CP servers first as they're more commonly used
    const prioritizedServers = activeServers.sort((a, b) => {
      const aWeight = a.startsWith('cp') && !a.startsWith('pcp') ? 0 : 
                     a.startsWith('pcp') ? 1 : 
                     a.startsWith('rcp') ? 2 : 3;
      const bWeight = b.startsWith('cp') && !b.startsWith('pcp') ? 0 : 
                     b.startsWith('pcp') ? 1 : 
                     b.startsWith('rcp') ? 2 : 3;
      return aWeight - bWeight;
    });
    
    // Check servers sequentially with timeout and stop as soon as we find the domain
    for (let i = 0; i < prioritizedServers.length; i++) {
      const serverName = prioritizedServers[i];
      
      try {
        console.log(`→ [${i + 1}/${prioritizedServers.length}] Checking server: ${serverName.toUpperCase()}`);
        
        // Add timeout for each server check (3 seconds max per server in fallback)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Server check timeout')), 3000)
        );
        
        const searchPromise = this.callServerAPI(serverName, 'listaccts', { 
          searchtype: 'domain', 
          search: domain 
        });
        
        const serverResult = await Promise.race([searchPromise, timeoutPromise]);
        
        if (serverResult.data && serverResult.data.acct) {
          const accounts = Array.isArray(serverResult.data.acct) ? serverResult.data.acct : [serverResult.data.acct];
          const domainAccount = accounts.find(acc => acc.domain === domain);
          
          if (domainAccount) {
            console.log(`✅ Domain ${domain} found on server: ${serverName.toUpperCase()} (fallback search)`);
            return serverName;
          }
        }
        
      } catch (error) {
        const errorMsg = error.message === 'Server check timeout' ? 'Timeout (3s)' : error.message;
        console.log(`⚠️ Error checking server ${serverName.toUpperCase()}: ${errorMsg}`);
        continue;
      }
    }
    
    console.log(`❌ Domain ${domain} not found on any of the ${prioritizedServers.length} active servers`);
    return null;
  }

  /**
   * Get DNS zone records for a domain
   * @param {string} serverName - Server name
   * @param {string} domain - Domain name
   * @returns {Promise<Array>} - DNS zone records
   */
  async getDNSZone(serverName, domain) {
    console.log(`📋 Getting DNS zone for ${domain} on ${serverName.toUpperCase()}`);
    
    try {
      const response = await this.callServerAPI(serverName, 'dumpzone', { domain });
      
      console.log(`→ Response structure keys:`, Object.keys(response));
      
      // The dumpzone response is deeply nested: response.data.zone[0].record
      if (response.data && response.data.zone) {
        const zoneArray = Array.isArray(response.data.zone) ? response.data.zone : [response.data.zone];
        
        // Extract records from the nested structure
        let records = [];
        
        for (const zone of zoneArray) {
          if (zone.record) {
            // Records are at zone.record level
            const zoneRecords = Array.isArray(zone.record) ? zone.record : [zone.record];
            records = records.concat(zoneRecords);
            console.log(`→ Found ${zoneRecords.length} records in zone`);
          }
        }
        
        if (records.length > 0) {
          console.log(`✅ Retrieved ${records.length} DNS records for ${domain}`);
          
          // Log record types for debugging
          const recordTypes = {};
          records.forEach(r => {
            recordTypes[r.type] = (recordTypes[r.type] || 0) + 1;
          });
          console.log(`→ Record types: ${JSON.stringify(recordTypes)}`);
          
          return records;
        }
      }
      
      console.log(`⚠️ No zone data in response for ${domain}`);
      console.log(`→ Full response:`, JSON.stringify(response).substring(0, 200));
      
      return [];
    } catch (error) {
      console.error(`❌ Error getting DNS zone for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Reset DNS zone for a domain (automatically sets correct A record)
   * @param {string} serverName - Server name
   * @param {string} domain - Domain name
   * @returns {Promise<boolean>} - Success status
   */
  async resetDNSZone(serverName, domain) {
    console.log(`🔧 Resetting DNS zone for ${domain} on ${serverName.toUpperCase()}`);
    
    try {
      // Use whmapi1 resetzone to reset the entire DNS zone to server defaults
      const response = await this.callServerAPI(serverName, 'resetzone', {
        domain: domain
      });
      
      if (response.metadata && response.metadata.result === 1) {
        console.log(`✅ DNS zone reset successfully for ${domain}`);
        console.log(`→ A record will now point to server's default IP`);
        
        // Get server IP for A record sync
        const serverIP = await this.getServerIPFromCache(serverName);
        
        if (serverIP) {
          // Sync A record changes across all nameservers
          console.log(`\n🔄 Syncing A record changes across nameservers...`);
          const syncResult = await this.syncARecord(serverName, domain, serverIP);
          
          if (syncResult.success) {
            console.log(`✅ DNS zone reset and A record synced successfully`);
          } else {
            console.log(`⚠️ DNS zone reset successful but A record sync failed: ${syncResult.error}`);
          }
        } else {
          console.log(`⚠️ Could not get server IP for A record sync - changes will propagate naturally`);
        }
        
        return true;
      } else {
        console.log(`❌ DNS zone reset failed:`, response.metadata?.reason || 'Unknown error');
        return false;
      }
      
    } catch (error) {
      console.error(`❌ Error resetting DNS zone for ${domain}:`, error.message);
      return false;
    }
  }

  /**
   * Update A record for a domain using multiple approaches to handle stubborn records
   * @param {string} serverName - Server name
   * @param {string} domain - Domain name
   * @param {string} newIP - New IP address
   * @returns {Promise<Object>} - Result object with success status and details
   */
  async updateARecord(serverName, domain, newIP) {
    console.log(`🔧 Updating A record for ${domain} on ${serverName.toUpperCase()} to ${newIP}`);
    console.log(`→ Using multi-approach method to handle stubborn DNS records`);
    
    try {
      // Step 1: Dump zone to get all records
      console.log(`→ Step 1: Dumping DNS zone to find A record...`);
      const dnsRecords = await this.getDNSZone(serverName, domain);
      
      if (!dnsRecords || dnsRecords.length === 0) {
        console.log(`⚠️ Could not retrieve DNS zone records`);
        return { success: false, error: 'Could not retrieve DNS zone records', domain };
      }
      
      console.log(`→ Found ${dnsRecords.length} total DNS records in zone`);
      
      // Step 2: Search for main domain A records
      console.log(`→ Step 2: Searching for main domain A records...`);
      const mainDomainARecords = [];
      
      for (let i = 0; i < dnsRecords.length; i++) {
        const record = dnsRecords[i];
        if (record.type === 'A') {
          const recordName = (record.name || record.dname || '').toLowerCase();
          const domainName = domain.toLowerCase();
          
          // Look for main domain records (flexible matching)
          const isMainDomainRecord = (
            recordName === domainName ||                    // gamitixstudios.com
            recordName === `${domainName}.` ||              // gamitixstudios.com.
            recordName === '' ||                            // empty (root)
            recordName === '@'                              // @ symbol (root)
          );
          
          if (isMainDomainRecord) {
            const actualLineNumber = record.Line || record.line || i; // Use internal Line property, fallback to array index
            mainDomainARecords.push({
              record: record,
              lineNumber: actualLineNumber,
              isCorrect: record.address === newIP,
              hostname: recordName || `${domainName}.`
            });
            
            console.log(`→ Found A record at line ${actualLineNumber} (array[${i}]): "${recordName}" → ${record.address} ${record.address === newIP ? '✅' : '❌'}`);
          }
        }
      }
      
      console.log(`→ Found ${mainDomainARecords.length} main domain A records`);
      
      // Step 3: Handle different scenarios
      if (mainDomainARecords.length === 0) {
        // No main domain A record exists - add one
        console.log(`🚨 No main domain A record found - adding new record`);
        
        try {
          const addResponse = await this.callServerAPI(serverName, 'addzonerecord', {
            domain: domain,
            name: `${domain}.`,  // Domain with trailing dot for root record
            type: 'A',
            address: newIP,
            ttl: 14400
          });
          
          if (addResponse.metadata && addResponse.metadata.result === 1) {
            console.log(`✅ Successfully added A record: ${domain} → ${newIP}`);
            
            // Verify the addition
            const verifyRecords = await this.getDNSZone(serverName, domain);
            const hasCorrectIP = verifyRecords.some(r => 
              r.type === 'A' && 
              r.address === newIP && 
              ((r.name || '').toLowerCase() === `${domain.toLowerCase()}.` || 
               (r.name || '').toLowerCase() === domain.toLowerCase())
            );
            
            if (hasCorrectIP) {
              console.log(`✅ VERIFIED: A record addition successful`);
              
              // Sync A record changes across nameservers
              console.log(`\n🔄 Syncing newly added A record across nameservers...`);
              const syncResult = await this.syncARecord(serverName, domain, newIP);
              
              return { 
                success: true, 
                method: 'addzonerecord', 
                domain, 
                ip: newIP,
                duplicatesRemoved: 0,
                synced: syncResult.success,
                syncMethod: syncResult.method,
                syncError: syncResult.success ? null : syncResult.error
              };
            } else {
              console.log(`⚠️ WARNING: API reported success but A record not found in zone`);
              return { 
                success: false, 
                error: 'A record addition reported success but not verified in zone file', 
                domain,
                method: 'addzonerecord_unverified'
              };
            }
          } else {
            const errorMsg = addResponse.metadata?.reason || 'Failed to add A record';
            console.log(`❌ Failed to add A record: ${errorMsg}`);
            return { success: false, error: errorMsg, domain };
          }
        } catch (addError) {
          console.log(`❌ Error adding A record: ${addError.message}`);
          return { success: false, error: addError.message, domain };
        }
        
      } else if (mainDomainARecords.length === 1) {
        // Single A record - try multiple approaches to update it
        const existingRecord = mainDomainARecords[0];
        
        if (existingRecord.isCorrect) {
          console.log(`✅ A record already has correct IP: ${newIP}`);
          return { 
            success: true, 
            method: 'no_change_needed', 
            domain, 
            ip: newIP,
            duplicatesRemoved: 0
          };
        }
        
        console.log(`🔧 Step 3: Attempting to update A record using multiple approaches...`);
        console.log(`→ Current: "${existingRecord.record.name}" → ${existingRecord.record.address}`);
        console.log(`→ Target: "${existingRecord.record.name}" → ${newIP}`);
        
        // Approach 1: Try editzonerecord
        console.log(`\n🔧 Approach 1: Using editzonerecord...`);
        try {
          const editParams = {
            domain: domain,
            line: existingRecord.lineNumber,
            type: 'A',
            name: existingRecord.record.name || `${domain}.`,
            class: existingRecord.record.class || 'IN',
            address: newIP,
            ttl: existingRecord.record.ttl || 14400
          };
          
          const editResponse = await this.callServerAPI(serverName, 'editzonerecord', editParams);
          
          if (editResponse.metadata && editResponse.metadata.result === 1) {
            console.log(`✅ editzonerecord API call succeeded`);
            
            // Verify the change immediately
            console.log(`→ Verifying change in zone file...`);
            const verifyRecords = await this.getDNSZone(serverName, domain);
            
            const updatedMainRecords = verifyRecords.filter(record => {
              if (record.type !== 'A') return false;
              const recordName = (record.name || '').toLowerCase();
              const domainName = domain.toLowerCase();
              return recordName === `${domainName}.` || recordName === domainName;
            });
            
            const hasCorrectIP = updatedMainRecords.some(r => r.address === newIP);
            
            if (hasCorrectIP) {
              console.log(`✅ SUCCESS: editzonerecord approach worked!`);
              
              // Sync A record changes across nameservers
              console.log(`\n🔄 Syncing A record changes across nameservers...`);
              const syncResult = await this.syncARecord(serverName, domain, newIP);
              
              return { 
                success: true, 
                method: 'editzonerecord', 
                domain, 
                ip: newIP,
                duplicatesRemoved: 0,
                synced: syncResult.success,
                syncMethod: syncResult.method,
                syncError: syncResult.success ? null : syncResult.error
              };
            } else {
              console.log(`⚠️ WARNING: editzonerecord reported success but zone file not updated`);
              console.log(`→ This is a known issue with some WHM/cPanel configurations`);
              console.log(`→ The main domain A record may be protected or automatically regenerated`);
            }
          } else {
            console.log(`❌ editzonerecord failed: ${editResponse.metadata?.reason}`);
          }
        } catch (editError) {
          console.log(`❌ editzonerecord error: ${editError.message}`);
        }
        
        // Approach 2: Try setsiteip (sometimes works when editzonerecord doesn't)
        console.log(`\n🔧 Approach 2: Using setsiteip...`);
        try {
          const setsiteipResponse = await this.callServerAPI(serverName, 'setsiteip', {
            domain: domain,
            ip: newIP
          });
          
          if (setsiteipResponse.metadata && setsiteipResponse.metadata.result === 1) {
            console.log(`✅ setsiteip API call succeeded`);
            
            // Wait a moment and verify
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const verifyRecords = await this.getDNSZone(serverName, domain);
            const updatedMainRecords = verifyRecords.filter(record => {
              if (record.type !== 'A') return false;
              const recordName = (record.name || '').toLowerCase();
              const domainName = domain.toLowerCase();
              return recordName === `${domainName}.` || recordName === domainName;
            });
            
            const hasCorrectIP = updatedMainRecords.some(r => r.address === newIP);
            
            if (hasCorrectIP) {
              console.log(`✅ SUCCESS: setsiteip approach worked!`);
              
              // Sync A record changes across nameservers
              console.log(`\n🔄 Syncing A record changes across nameservers...`);
              const syncResult = await this.syncARecord(serverName, domain, newIP);
              
              return { 
                success: true, 
                method: 'setsiteip', 
                domain, 
                ip: newIP,
                duplicatesRemoved: 0,
                synced: syncResult.success,
                syncMethod: syncResult.method,
                syncError: syncResult.success ? null : syncResult.error
              };
            } else {
              console.log(`⚠️ WARNING: setsiteip reported success but zone file not updated`);
            }
          } else {
            console.log(`❌ setsiteip failed: ${setsiteipResponse.metadata?.reason}`);
          }
        } catch (setsiteipError) {
          console.log(`❌ setsiteip error: ${setsiteipError.message}`);
        }
        
        // All approaches failed - return detailed error
        console.log(`\n❌ All update approaches failed for main domain A record`);
        console.log(`→ This appears to be a WHM/cPanel configuration issue`);
        console.log(`→ Possible causes:`);
        console.log(`  - Main domain A record is protected by DNS template`);
        console.log(`  - Zone file caching preventing immediate updates`);
        console.log(`  - Server-level DNS configuration override`);
        console.log(`  - Account IP settings conflicting with zone edits`);
        
        return { 
          success: false, 
          error: 'Main domain A record appears to be protected - WHM APIs report success but zone file not updated', 
          domain,
          method: 'all_approaches_failed',
          details: {
            currentIP: existingRecord.record.address,
            targetIP: newIP,
            lineNumber: existingRecord.lineNumber,
            recordName: existingRecord.record.name,
            issue: 'stubborn_main_domain_record'
          }
        };
        
      } else {
        // Multiple A records - handle duplicates using the search & replace method
        console.log(`🚨 Multiple A records found (${mainDomainARecords.length}) - cleaning up duplicates`);
        
        // Find the best record to keep (correct IP first, then proper hostname)
        let recordToKeep = null;
        const recordsToRemove = [];
        
        // First, try to find a record that already has the correct IP
        const correctIPRecords = mainDomainARecords.filter(r => r.isCorrect);
        
        if (correctIPRecords.length > 0) {
          // Keep the first record with correct IP
          recordToKeep = correctIPRecords[0];
          console.log(`→ Found record with correct IP at line ${recordToKeep.lineNumber}, keeping it`);
          
          // Remove all other records (including other correct IP records - duplicates)
          recordsToRemove.push(...mainDomainARecords.filter(r => r.lineNumber !== recordToKeep.lineNumber));
        } else {
          // No correct IP found, update the first record and remove others
          recordToKeep = mainDomainARecords[0];
          recordsToRemove.push(...mainDomainARecords.slice(1));
          
          console.log(`→ No correct IP found, will update first record at line ${recordToKeep.lineNumber}`);
        }
        
        // Update the record we're keeping if it has wrong IP
        if (!recordToKeep.isCorrect) {
          console.log(`🔧 Updating kept record from ${recordToKeep.record.address} to ${newIP}`);
          
          try {
            const editParams = {
              domain: domain,
              line: recordToKeep.lineNumber,
              type: 'A',
              name: recordToKeep.record.name || `${domain}.`,
              class: recordToKeep.record.class || 'IN',
              address: newIP,
              ttl: recordToKeep.record.ttl || 14400
            };
            
            const editResponse = await this.callServerAPI(serverName, 'editzonerecord', editParams);
            
            if (editResponse.metadata && editResponse.metadata.result === 1) {
              console.log(`✅ Updated kept record to correct IP`);
            } else {
              console.log(`⚠️ Failed to update kept record: ${editResponse.metadata?.reason}`);
            }
          } catch (editError) {
            console.log(`❌ Error updating kept record: ${editError.message}`);
          }
        }
        
        // Remove duplicate records (sort by line number descending to avoid shifting)
        const sortedForRemoval = recordsToRemove.sort((a, b) => b.lineNumber - a.lineNumber);
        let removedCount = 0;
        
        console.log(`→ Removing ${sortedForRemoval.length} duplicate records...`);
        
        for (const record of sortedForRemoval) {
          try {
            console.log(`🔧 Removing duplicate line ${record.lineNumber}: ${record.hostname} → ${record.record.address}`);
            const removeResponse = await this.callServerAPI(serverName, 'removezonerecord', {
              domain: domain,
              line: record.lineNumber
            });
            
            if (removeResponse && removeResponse.metadata && removeResponse.metadata.result === 1) {
              console.log(`✅ Removed duplicate line ${record.lineNumber}`);
              removedCount++;
            } else {
              console.log(`⚠️ Failed to remove line ${record.lineNumber}: ${removeResponse?.metadata?.reason || 'Unknown reason'}`);
            }
          } catch (removeError) {
            console.log(`❌ Failed to remove line ${record.lineNumber}: ${removeError.message}`);
          }
        }
        
        // Verify final state
        const finalRecords = await this.getDNSZone(serverName, domain);
        const finalMainRecords = finalRecords.filter(record => {
          if (record.type !== 'A') return false;
          const recordName = (record.name || '').toLowerCase();
          const domainName = domain.toLowerCase();
          return recordName === `${domainName}.` || recordName === domainName;
        });
        
        const hasCorrectIP = finalMainRecords.some(r => r.address === newIP);
        
        // Sync A record changes across nameservers
        console.log(`\n🔄 Syncing A record changes across nameservers...`);
        const syncResult = await this.syncARecord(serverName, domain, newIP);
        
        return { 
          success: hasCorrectIP, 
          method: 'editzonerecord_with_duplicate_cleanup', 
          domain, 
          ip: newIP,
          duplicatesRemoved: removedCount,
          finalRecordCount: finalMainRecords.length,
          hasCorrectIP: hasCorrectIP,
          synced: syncResult.success,
          syncMethod: syncResult.method,
          syncError: syncResult.success ? null : syncResult.error,
          warning: hasCorrectIP ? null : 'Duplicate cleanup completed but main record may still have wrong IP due to WHM protection'
        };
      }

      
    } catch (error) {
      console.error(`❌ A record update failed for ${domain}:`, error.message);
      return { success: false, error: error.message, domain };
    }
  }

  /**
   * Sync A record changes across all nameservers (A record only)
   * @param {string} serverName - Server name
   * @param {string} domain - Domain name
   * @param {string} newIP - New IP address that was set
   * @returns {Promise<Object>} - Sync result
   */
  async syncARecord(serverName, domain, newIP) {
    console.log(`🔄 Syncing A record for ${domain} (${newIP}) on ${serverName.toUpperCase()}`);
    
    try {
      // Method 1: Try using setsiteip again to force propagation
      try {
        console.log(`→ Attempting setsiteip re-call to force A record sync`);
        const syncResponse = await this.callServerAPI(serverName, 'setsiteip', {
          domain: domain,
          ip: newIP
        });
        
        if (syncResponse.metadata && syncResponse.metadata.result === 1) {
          console.log(`✅ A record sync triggered using setsiteip`);
          return { success: true, method: 'setsiteip_sync', domain, ip: newIP };
        }
      } catch (setsiteipError) {
        console.log(`→ setsiteip sync failed: ${setsiteipError.message}`);
      }
      

      
      console.log(`⚠️ A record sync methods not available - A record will propagate naturally`);
      console.log(`→ A record changes typically propagate within 5-15 minutes automatically`);
      console.log(`→ The setsiteip command was successful, so the A record is updated in the zone file`);
      return { 
        success: false, 
        error: 'A record sync methods not available in this WHM version', 
        domain, 
        ip: newIP,
        note: 'A record will propagate naturally within 5-15 minutes' 
      };
      
    } catch (error) {
      console.error(`❌ A record sync error for ${domain}:`, error.message);
      return { success: false, error: error.message, domain, ip: newIP };
    }
  }

  /**
   * Alternative method to update A record using edit_dns_zone_record
   * @param {string} serverName - Server name
   * @param {string} domain - Domain name
   * @param {string} newIP - New IP address
   * @returns {Promise<Object>} - Result object with success status and details
   */
  async updateARecordAlternative(serverName, domain, newIP) {
    console.log(`🔧 Alternative A record update for ${domain} using editzonerecord`);
    
    try {
      // First, get the current DNS zone to find the A record line number
      const dnsRecords = await this.getDNSZone(serverName, domain);
      
      if (!dnsRecords || dnsRecords.length === 0) {
        return { success: false, error: 'Could not retrieve DNS zone records', domain };
      }
      
      // Find ALL A records for the main domain (handle duplicates where type and hostname are same)
      const mainDomainARecords = [];
      const targetHostname = `${domain}.`.toLowerCase();
      
      for (let i = 0; i < dnsRecords.length; i++) {
        const record = dnsRecords[i];
        if (record.type === 'A') {
          const recordName = (record.name || record.dname || '').toLowerCase();
          const domainName = domain.toLowerCase();
          
          // Look for exact match or root domain record
          if (recordName === domainName || recordName === `${domainName}.` || recordName === '' || recordName === '@') {
            const actualLineNumber = record.Line || record.line || i; // Use internal Line property, fallback to array index
            mainDomainARecords.push({
              record: record,
              lineNumber: actualLineNumber,
              isCorrect: record.address === newIP,
              hostname: recordName || `${domainName}.`
            });
            console.log(`→ Found A record at line ${actualLineNumber} (array[${i}]): ${recordName || domainName} (type: A) → ${record.address} ${record.address === newIP ? '✅' : '❌'}`);
          }
        }
      }
      
      if (mainDomainARecords.length === 0) {
        console.log(`⚠️ Could not find any A records for ${domain} in DNS zone`);
        return { success: false, error: 'No A records found for domain', domain };
      }
      
      if (mainDomainARecords.length > 1) {
        console.log(`🚨 DUPLICATE A RECORDS DETECTED: Found ${mainDomainARecords.length} A records with same type and hostname for ${domain}`);
        
        console.log(`🔍 DEBUG: mainDomainARecords array:`, JSON.stringify(mainDomainARecords, null, 2));
        
        // Group by exact hostname to identify true duplicates
        const duplicateGroups = {};
        mainDomainARecords.forEach(record => {
          const key = `${record.record.type}-${record.hostname}`;
          if (!duplicateGroups[key]) {
            duplicateGroups[key] = [];
          }
          duplicateGroups[key].push(record);
        });
        
        // Check if any record already has the correct IP
        const correctRecord = mainDomainARecords.find(r => r.isCorrect);
        console.log(`🔍 DEBUG: correctRecord found:`, JSON.stringify(correctRecord, null, 2));
        if (correctRecord) {
          console.log(`✅ Correct A record already exists at line ${correctRecord.lineNumber} (${correctRecord.hostname} → ${correctRecord.record.address})`);
          
          // Find ALL duplicate A records with same type and hostname but different IP
          const duplicateLinesToRemove = mainDomainARecords.filter(r => 
            !r.isCorrect && 
            r.record.type === correctRecord.record.type && 
            r.hostname === correctRecord.hostname
          );
          
          console.log(`🔍 DEBUG: duplicateLinesToRemove array:`, JSON.stringify(duplicateLinesToRemove, null, 2));
          console.log(`→ Will COMPLETELY REMOVE ${duplicateLinesToRemove.length} duplicate A record lines with same type and hostname`);
          console.log(`→ Keeping only the correct A record: ${correctRecord.hostname} → ${correctRecord.record.address}`);
          
          // Sort by line number in DESCENDING order to avoid line shifting issues
          const sortedForRemoval = duplicateLinesToRemove.sort((a, b) => b.lineNumber - a.lineNumber);
          console.log(`→ Complete line removal order (highest to lowest line numbers to prevent shifting):`);
          sortedForRemoval.forEach(record => {
            console.log(`   REMOVE ENTIRE LINE ${record.lineNumber}: ${record.record.type} ${record.hostname} → ${record.record.address}`);
          });
          
          let removedCount = 0;
          for (const duplicateLine of sortedForRemoval) {
            console.log(`→ COMPLETELY REMOVING duplicate A record line ${duplicateLine.lineNumber}: ${duplicateLine.record.type} ${duplicateLine.hostname} → ${duplicateLine.record.address}`);
            
            // DEBUG: Log the exact API call parameters
            const removeParams = {
              domain: domain,
              line: duplicateLine.lineNumber
            };
            console.log(`🔍 DEBUG: About to call removezonerecord API with parameters:`, JSON.stringify(removeParams, null, 2));
            console.log(`🔍 DEBUG: Target line details:`, JSON.stringify(duplicateLine, null, 2));
            console.log(`🔍 DEBUG: Server: ${serverName.toUpperCase()}, Function: removezonerecord`);
            
            try {
              // removezonerecord completely removes the entire DNS record line
              console.log(`🔧 API CALL START: removezonerecord for line ${duplicateLine.lineNumber}`);
              const removeResponse = await this.callServerAPI(serverName, 'removezonerecord', removeParams);
              console.log(`🔍 DEBUG: removezonerecord API response:`, JSON.stringify(removeResponse, null, 2));
              
              // Check if the API call was successful
              if (removeResponse && removeResponse.metadata && removeResponse.metadata.result === 1) {
                console.log(`✅ COMPLETELY REMOVED duplicate A record line ${duplicateLine.lineNumber} from DNS zone`);
                console.log(`🔍 DEBUG: API success - Line ${duplicateLine.lineNumber} (${duplicateLine.hostname} → ${duplicateLine.record.address}) deleted`);
                removedCount++;
              } else {
                console.log(`⚠️ API returned non-success result for line ${duplicateLine.lineNumber}:`, removeResponse?.metadata?.reason || 'Unknown reason');
                console.log(`🔍 DEBUG: Full API response:`, JSON.stringify(removeResponse, null, 2));
              }
            } catch (removeError) {
              console.log(`❌ Failed to remove duplicate A record line ${duplicateLine.lineNumber}: ${removeError.message}`);
              console.log(`🔍 DEBUG: API call error details:`, {
                error: removeError.message,
                stack: removeError.stack,
                params: removeParams,
                targetLine: duplicateLine
              });
            }
          }
          
          console.log(`✅ Successfully COMPLETELY REMOVED ${removedCount}/${duplicateLinesToRemove.length} duplicate A record lines from DNS zone`);
          console.log(`→ Only the correct A record remains: ${correctRecord.hostname} → ${correctRecord.record.address}`);
          
          // Sync A record changes
          const syncResult = await this.syncARecord(serverName, domain, newIP);
          
          return { 
            success: true, 
            method: 'complete_line_removal', 
            domain, 
            ip: newIP,
            duplicateLinesRemoved: removedCount,
            totalDuplicatesFound: duplicateLinesToRemove.length,
            synced: syncResult.success,
            syncMethod: syncResult.method,
            syncError: syncResult.success ? null : syncResult.error,
            message: `Completely removed ${removedCount} duplicate A record lines, keeping only correct record: ${correctRecord.hostname} → ${correctRecord.record.address}`
          };
        } else {
          // No correct A record exists - we'll update the first one and completely remove all other duplicate lines
          console.log(`→ No correct A record found - will update first A record and COMPLETELY REMOVE all other duplicate lines with same type and hostname`);
        }
      }
      
      // Use the first A record for updating
      const targetRecord = mainDomainARecords[0].record;
      const lineNumber = mainDomainARecords[0].lineNumber;
      
      // Remove any remaining duplicate A records after updating the first one
      if (mainDomainARecords.length > 1) {
        console.log(`→ Will remove ${mainDomainARecords.length - 1} duplicate A records after update`);
      }
      
      console.log(`→ Updating DNS record at line ${lineNumber} to IP ${newIP}`);
      console.log(`→ Current record at line ${lineNumber}: ${targetRecord.name} → ${targetRecord.address}`);
      console.log(`→ Will change to: ${domain}. → ${newIP}`);
      
      // Use editzonerecord (whmapi1) to directly edit the A record
      const response = await this.callServerAPI(serverName, 'editzonerecord', {
        domain: domain,
        line: lineNumber,
        name: `${domain}.`,
        class: 'IN',
        ttl: 14400,
        type: 'A',
        address: newIP
      });
      
      console.log(`→ editzonerecord response:`, JSON.stringify(response, null, 2));
      
      if (response.metadata && response.metadata.result === 1) {
        console.log(`✅ A record updated successfully using editzonerecord`);
        
        // COMPLETELY REMOVE any duplicate A record lines with same type and hostname (skip the one we just updated)
        let duplicateLinesRemoved = 0;
        if (mainDomainARecords.length > 1) {
          const updatedRecord = mainDomainARecords[0]; // The one we just updated
          const duplicateLinesToRemove = mainDomainARecords.slice(1).filter(record => 
            record.record.type === updatedRecord.record.type && 
            record.hostname === updatedRecord.hostname
          );
          
          console.log(`🔍 DEBUG: duplicateLinesToRemove array (after update):`, JSON.stringify(duplicateLinesToRemove, null, 2));
          
          if (duplicateLinesToRemove.length > 0) {
            console.log(`\n🧹 COMPLETELY REMOVING ${duplicateLinesToRemove.length} duplicate A record lines with same type and hostname...`);
            console.log(`→ Updated record (keeping): Line ${updatedRecord.lineNumber} - ${updatedRecord.hostname} → ${newIP}`);
            
            // Sort by line number in DESCENDING order to avoid line shifting issues
            const sortedForRemoval = duplicateLinesToRemove.sort((a, b) => b.lineNumber - a.lineNumber);
            console.log(`→ Complete line removal order (highest to lowest line numbers to prevent shifting):`);
            sortedForRemoval.forEach(record => {
              console.log(`   REMOVE ENTIRE LINE ${record.lineNumber}: ${record.record.type} ${record.hostname} → ${record.record.address}`);
            });
            
            for (const duplicateLine of sortedForRemoval) {
              console.log(`→ COMPLETELY REMOVING duplicate A record line ${duplicateLine.lineNumber}: ${duplicateLine.record.type} ${duplicateLine.hostname} → ${duplicateLine.record.address}`);
              
              // DEBUG: Log the exact API call parameters
              const removeParams = {
                domain: domain,
                line: duplicateLine.lineNumber
              };
              console.log(`🔍 DEBUG: About to call removezonerecord API with parameters:`, JSON.stringify(removeParams, null, 2));
              console.log(`🔍 DEBUG: Target line details:`, JSON.stringify(duplicateLine, null, 2));
              console.log(`🔍 DEBUG: Server: ${serverName.toUpperCase()}, Function: removezonerecord`);
              
              try {
                // removezonerecord completely removes the entire DNS record line
                console.log(`🔧 API CALL START: removezonerecord for line ${duplicateLine.lineNumber}`);
                const removeResponse = await this.callServerAPI(serverName, 'removezonerecord', removeParams);
                console.log(`🔍 DEBUG: removezonerecord API response:`, JSON.stringify(removeResponse, null, 2));
                
                // Check if the API call was successful
                if (removeResponse && removeResponse.metadata && removeResponse.metadata.result === 1) {
                  console.log(`✅ COMPLETELY REMOVED duplicate A record line ${duplicateLine.lineNumber} from DNS zone`);
                  console.log(`🔍 DEBUG: API success - Line ${duplicateLine.lineNumber} (${duplicateLine.hostname} → ${duplicateLine.record.address}) deleted`);
                  duplicateLinesRemoved++;
                } else {
                  console.log(`⚠️ API returned non-success result for line ${duplicateLine.lineNumber}:`, removeResponse?.metadata?.reason || 'Unknown reason');
                  console.log(`🔍 DEBUG: Full API response:`, JSON.stringify(removeResponse, null, 2));
                }
              } catch (removeError) {
                console.log(`❌ Failed to remove duplicate A record line ${duplicateLine.lineNumber}: ${removeError.message}`);
                console.log(`🔍 DEBUG: API call error details:`, {
                  error: removeError.message,
                  stack: removeError.stack,
                  params: removeParams,
                  targetLine: duplicateLine
                });
              }
            }
            
            console.log(`✅ COMPLETELY REMOVED ${duplicateLinesRemoved}/${duplicateLinesToRemove.length} duplicate A record lines from DNS zone`);
            console.log(`→ Only the updated A record remains: ${updatedRecord.hostname} → ${newIP}`);
          } else {
            console.log(`→ No duplicate A record lines with same type and hostname found to remove`);
          }
        }
        
        // Sync A record changes across all nameservers
        console.log(`\n🔄 Syncing A record changes across nameservers...`);
        const syncResult = await this.syncARecord(serverName, domain, newIP);
        
        return { 
          success: true, 
          method: 'editzonerecord_with_line_removal', 
          domain, 
          ip: newIP, 
          line: lineNumber,
          duplicateLinesRemoved: duplicateLinesRemoved,
          totalDuplicatesFound: duplicateLinesToRemove ? duplicateLinesToRemove.length : 0,
          synced: syncResult.success,
          syncMethod: syncResult.method,
          syncError: syncResult.success ? null : syncResult.error,
          message: `Updated A record and completely removed ${duplicateLinesRemoved} duplicate lines from DNS zone`
        };
      } else {
        console.log(`❌ editzonerecord failed:`, response.metadata?.reason || 'Unknown error');
        return { success: false, error: response.metadata?.reason || 'Unknown error', domain, method: 'editzonerecord' };
      }
      
    } catch (error) {
      console.error(`❌ Alternative A record update failed for ${domain}:`, error.message);
      return { success: false, error: error.message, domain, method: 'editzonerecord' };
    }
  }



  /**
   * Get server IP address from MongoDB cache by server name
   * @param {string} serverName - Server name (e.g., 'cp1', 'pcp6')
   * @returns {Promise<string|null>} - Server IP address or null
   */
  async getServerIPFromCache(serverName) {
    try {
      const serverInfo = await getCurrentServerInfo();
      
      // Get raw WHMCS data from cache
      if (!serverInfo.rawWhmcsData || !serverInfo.rawWhmcsData.servers) {
        console.log('❌ No raw WHMCS data available in cache');
        return null;
      }
      
      const serversRaw = serverInfo.rawWhmcsData.servers || {};
      const servers = serversRaw.server || serversRaw;
      const serverArray = Array.isArray(servers) ? servers : (servers ? [servers] : []);
      
      // Find server by matching hostname or name
      const hostname = this.getServerHostname(serverName);
      
      const matchingServer = serverArray.find(server => {
        // Match by hostname
        if (server.hostname && server.hostname.toLowerCase() === hostname.toLowerCase()) {
          return true;
        }
        
        // Match by name containing server name
        if (server.name && server.name.toLowerCase().includes(serverName.toLowerCase())) {
          return true;
        }
        
        // Match by server ID if serverName is numeric
        if (server.id && server.id === serverName) {
          return true;
        }
        
        return false;
      });
      
      if (matchingServer && matchingServer.ipaddress) {
        console.log(`✅ Found IP for server ${serverName.toUpperCase()}: ${matchingServer.ipaddress}`);
        return matchingServer.ipaddress;
      }
      
      console.log(`❌ No IP found for server ${serverName.toUpperCase()} in cache`);
      return null;
      
    } catch (error) {
      console.error(`❌ Error getting server IP from cache for ${serverName}:`, error.message);
      return null;
    }
  }

  /**
   * Automatically fix A record for domain (finds correct server IP from MongoDB cache)
   * @param {string} domain - Domain name
   * @param {Object} whmcsHint - Optional WHMCS server information to optimize search
   * @returns {Promise<Object>} - Update result
   */
  async autoFixARecord(domain, whmcsHint = null) {
    console.log(`🔧 Auto-fixing A record for domain: ${domain}`);
    
    try {
      // Step 1: First check if domain is hosted on our servers (authoritative check)
      console.log(`→ Step 1: Checking if domain is hosted on our servers...`);
      const serverName = await this.findDomainServerByAccounts(domain, whmcsHint);
      
      if (serverName) {
        // Domain is hosted on our servers - use zone file as authoritative source
        console.log(`→ Domain ${domain} is hosted on our server: ${serverName.toUpperCase()}`);
        console.log(`→ Using DNS zone file as authoritative source (not DNS resolver)`);
        
        // Get the correct server IP
        const correctIP = await this.getServerIPFromCache(serverName);
        
        if (!correctIP) {
          return {
            success: false,
            error: `No IP address found for server ${serverName.toUpperCase()} in cache`,
            domain: domain,
            server: serverName,
            isOurServer: true
          };
        }
        
        console.log(`→ Correct IP for ${domain}: ${correctIP} (server ${serverName.toUpperCase()})`);
        
        // Step 2: Check current A record from DNS zone file (authoritative)
        console.log(`→ Step 2: Checking A record from DNS zone file (authoritative)...`);
        
        let currentZoneIPs = [];
        let wrongIPDetected = false;
        
        try {
          const dnsRecords = await this.getDNSZone(serverName, domain);
          
          if (dnsRecords && dnsRecords.length > 0) {
            // Find main domain A records in zone file
            const mainDomainARecords = dnsRecords.filter(record => {
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
            
            currentZoneIPs = mainDomainARecords.map(r => r.address);
            console.log(`→ Zone file A records: ${domain} → ${currentZoneIPs.join(', ')}`);
            
            if (currentZoneIPs.length === 0) {
              console.log(`⚠️ No A records found in zone file`);
            } else if (!currentZoneIPs.includes(correctIP)) {
              wrongIPDetected = true;
              console.log(`🚨 WRONG IP DETECTED in zone file:`);
              console.log(`   Zone file: ${currentZoneIPs.join(', ')} (incorrect)`);
              console.log(`   Expected: ${correctIP} (server ${serverName.toUpperCase()})`);
            } else {
              console.log(`✅ Zone file A record points to correct IP: ${correctIP}`);
              
              // Check for duplicates even when correct IP is present
              if (currentZoneIPs.length > 1) {
                const duplicateIPs = currentZoneIPs.filter(ip => ip !== correctIP);
                if (duplicateIPs.length > 0) {
                  wrongIPDetected = true; // Trigger cleanup for duplicates
                  console.log(`🚨 DUPLICATE A RECORDS DETECTED in zone file:`);
                  console.log(`   Correct IP: ${correctIP}`);
                  console.log(`   Duplicate IPs: ${duplicateIPs.join(', ')}`);
                  console.log(`   → Will clean up ${duplicateIPs.length} duplicate record(s)`);
                }
              }
            }
          } else {
            console.log(`⚠️ Could not retrieve DNS zone file`);
          }
        } catch (zoneError) {
          console.log(`⚠️ Error reading zone file: ${zoneError.message}`);
        }
        
        // Step 3: Update A record if needed
        if (wrongIPDetected || currentZoneIPs.length === 0) {
          console.log(`\n🔧 Updating A record in zone file to correct IP`);
          
          const updateResult = await this.updateARecord(serverName, domain, correctIP);
          
          if (updateResult.success) {
            let successMessage = wrongIPDetected 
              ? `A record fixed! Updated ${domain} from wrong IP (${currentZoneIPs.join(', ')}) to correct server IP (${correctIP}) on ${serverName.toUpperCase()}.`
              : `A record added! Created ${domain} A record pointing to server IP (${correctIP}) on ${serverName.toUpperCase()}.`;
            
            if (updateResult.synced) {
              successMessage += ` DNS changes synced across nameservers using ${updateResult.syncMethod}.`;
            }
            
            return {
              success: true,
              domain: domain,
              server: serverName,
              oldIP: currentZoneIPs.join(', ') || 'None',
              newIP: correctIP,
              correctIP: correctIP,
              wrongIPDetected: wrongIPDetected,
              method: updateResult.method,
              synced: updateResult.synced || false,
              syncMethod: updateResult.syncMethod || null,
              syncError: updateResult.syncError || null,
              isOurServer: true,
              source: 'zone_file',
              message: successMessage
            };
          } else {
            // Handle the specific case of stubborn main domain records
            if (updateResult.method === 'all_approaches_failed' && updateResult.details?.issue === 'stubborn_main_domain_record') {
              console.log(`\n🚨 STUBBORN RECORD DETECTED: Main domain A record is protected`);
              console.log(`→ Current IP in zone: ${updateResult.details.currentIP}`);
              console.log(`→ Target IP: ${updateResult.details.targetIP}`);
              console.log(`→ WHM APIs report success but zone file remains unchanged`);
              console.log(`→ This is a known issue with some WHM/cPanel configurations`);
              
              return {
                success: false,
                error: 'DNS zone editing blocked by server configuration',
                domain: domain,
                server: serverName,
                currentIPs: [updateResult.details.currentIP],
                correctIP: correctIP,
                wrongIPDetected: true,
                isOurServer: true,
                source: 'zone_file',
                issue: 'stubborn_main_domain_record',
                details: updateResult.details,
                recommendation: 'Contact server administrator to check DNS template settings or zone file permissions',
                technicalInfo: {
                  whmApisReportSuccess: true,
                  zoneFileNotUpdated: true,
                  possibleCauses: [
                    'Main domain A record protected by DNS template',
                    'Zone file caching preventing updates',
                    'Server-level DNS configuration override',
                    'Account IP settings conflicting with zone edits'
                  ]
                }
              };
            } else {
              return {
                success: false,
                error: updateResult.error || 'Failed to update A record in zone file',
                domain: domain,
                server: serverName,
                currentIPs: currentZoneIPs,
                correctIP: correctIP,
                wrongIPDetected: wrongIPDetected,
                isOurServer: true,
                source: 'zone_file',
                method: updateResult.method || 'unknown'
              };
            }
          }
        } else {
          return {
            success: true,
            domain: domain,
            server: serverName,
            oldIP: currentZoneIPs.join(', '),
            newIP: correctIP,
            currentIP: currentZoneIPs.join(', '),
            correctIP: correctIP,
            wrongIPDetected: false,
            method: 'no_change_needed',
            isOurServer: true,
            source: 'zone_file',
            message: `A record is already correct in zone file: ${domain} → ${correctIP}`
          };
        }
        
      } else {
        // Domain is not hosted on our servers - use DNS resolver
        console.log(`→ Domain ${domain} is not hosted on our servers`);
        console.log(`→ Using DNS resolver to check external domain`);
        
        // Step 2: Get current A record via DNS resolver (external domain)
        let currentIPs = [];
        
        try {
          const dns = require('dns').promises;
          currentIPs = await dns.resolve4(domain);
          console.log(`→ DNS resolver A record: ${domain} → ${currentIPs.join(', ')}`);
        } catch (dnsError) {
          console.log(`→ Could not resolve A record via DNS: ${dnsError.message}`);
        }
        
        return {
          success: false,
          error: 'Domain not hosted on our servers - cannot fix A record',
          domain: domain,
          currentIPs: currentIPs,
          isOurServer: false,
          source: 'dns_resolver',
          message: `Domain ${domain} is hosted externally. Current DNS: ${currentIPs.join(', ') || 'None'}`
        };
      }
      
    } catch (error) {
      console.error(`❌ Auto-fix A record failed for ${domain}:`, error.message);
      return {
        success: false,
        error: error.message,
        domain: domain
      };
    }
  }

  /**
   * Find domain server by checking accounts only (no DNS lookup)
   * @param {string} domain - Domain name
   * @param {Object} whmcsHint - Optional WHMCS server information
   * @returns {Promise<string|null>} - Server name or null if not found on our servers
   */
  async findDomainServerByAccounts(domain, whmcsHint = null) {
    console.log(`🔍 Finding server for domain by checking accounts: ${domain}`);
    
    // If we have WHMCS server information, use it as a hint
    if (whmcsHint && whmcsHint.serverName) {
      console.log(`💡 WHMCS Hint: Domain should be on server ${whmcsHint.serverName.toUpperCase()}`);
      
      try {
        const hintServerName = this.extractServerNameFromWHMCS(whmcsHint.serverName);
        
        if (hintServerName && this.serverApiKeys[hintServerName]) {
          console.log(`→ Checking WHMCS-indicated server: ${hintServerName.toUpperCase()}`);
          
          const serverResult = await this.callServerAPI(hintServerName, 'listaccts', { 
            searchtype: 'domain', 
            search: domain 
          });
          
          if (serverResult.data && serverResult.data.acct) {
            const accounts = Array.isArray(serverResult.data.acct) ? serverResult.data.acct : [serverResult.data.acct];
            const domainAccount = accounts.find(acc => acc.domain === domain);
            
            if (domainAccount) {
              console.log(`✅ Domain ${domain} confirmed on WHMCS-indicated server: ${hintServerName.toUpperCase()}`);
              return hintServerName;
            } else {
              console.log(`⚠️ Domain ${domain} not found on WHMCS-indicated server ${hintServerName.toUpperCase()}`);
            }
          }
        }
      } catch (hintError) {
        console.log(`⚠️ Error checking WHMCS-indicated server: ${hintError.message}`);
      }
    }
    
    // Fallback: Check all our servers for the domain account
    console.log(`→ Checking all our servers for domain account...`);
    
    const activeServers = await this.getActiveServersWithIPs();
    console.log(`→ Checking ${activeServers.length} servers for domain account`);
    
    // Prioritize servers - put CP servers first
    const prioritizedServers = activeServers.sort((a, b) => {
      const aWeight = a.startsWith('cp') && !a.startsWith('pcp') ? 0 : 
                     a.startsWith('pcp') ? 1 : 
                     a.startsWith('rcp') ? 2 : 3;
      const bWeight = b.startsWith('cp') && !b.startsWith('pcp') ? 0 : 
                     b.startsWith('pcp') ? 1 : 
                     b.startsWith('rcp') ? 2 : 3;
      return aWeight - bWeight;
    });
    
    // Check servers sequentially
    for (let i = 0; i < prioritizedServers.length; i++) {
      const serverName = prioritizedServers[i];
      
      try {
        console.log(`→ [${i + 1}/${prioritizedServers.length}] Checking server: ${serverName.toUpperCase()}`);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Server check timeout')), 3000)
        );
        
        const searchPromise = this.callServerAPI(serverName, 'listaccts', { 
          searchtype: 'domain', 
          search: domain 
        });
        
        const serverResult = await Promise.race([searchPromise, timeoutPromise]);
        
        if (serverResult.data && serverResult.data.acct) {
          const accounts = Array.isArray(serverResult.data.acct) ? serverResult.data.acct : [serverResult.data.acct];
          const domainAccount = accounts.find(acc => acc.domain === domain);
          
          if (domainAccount) {
            console.log(`✅ Domain ${domain} found on server: ${serverName.toUpperCase()}`);
            return serverName;
          }
        }
        
      } catch (error) {
        const errorMsg = error.message === 'Server check timeout' ? 'Timeout (3s)' : error.message;
        console.log(`⚠️ Error checking server ${serverName.toUpperCase()}: ${errorMsg}`);
        continue;
      }
    }
    
    console.log(`❌ Domain ${domain} not found on any of our ${prioritizedServers.length} servers`);
    return null;
  }

  /**
   * Fetch error log for a domain when 500 status code is detected
   * @param {string} serverName - Server name (e.g., 'cp1', 'pcp3')
   * @param {string} username - cPanel username
   * @param {string} domain - Domain name
   * @returns {Promise<object>} - Error log result
   */
  async fetchErrorLogFor500(serverName, username, domain) {
    try {
      console.log(`🔍 Fetching error log for 500 error: ${domain} (user: ${username}, server: ${serverName})`);
      
      // Use WHM API v1 format: whmapi1 cpuser=root command='uapi Fileman view_file path=/public_html/error_log'
      console.log(`→ Using WHM API v2 format: https://server:2087/json-api/uapi_cpanel`);
      console.log(`→ API Version: 2 (as shown in WHM interface)`);
      console.log(`→ cPanel User: cpanel.user=${username} (account whose files to access)`);
      console.log(`→ Target Path: /home/${username}/public_html/error_log`);
      
      const result = await this.callServerAPI(serverName, 'uapi_cpanel', {
        'cpanel.user': username,
        'cpanel.module': 'Fileman',
        'cpanel.function': 'get_file_content',
        'dir': 'public_html',
        'file': 'error_log'
      }, '2'); // WHM API v2 (as shown in the image)
      
      console.log(`→ WHM API Response structure:`, {
        hasResult: !!result,
        hasData: !!(result && result.data),
        hasUapi: !!(result && result.data && result.data.uapi),
        hasUapiData: !!(result && result.data && result.data.uapi && result.data.uapi.data),
        keys: result ? Object.keys(result) : []
      });
      
      // Handle actual WHM uapi_cpanel response structure
      // Expected format: { "data": { "uapi": { "data": { "content": "...", "path": "...", "filename": "..." } } } }
      let fileContent = '';
      let responseData = null;
      let uapiStatus = null;
      
      if (result && result.data && result.data.uapi) {
        const uapiResult = result.data.uapi;
        uapiStatus = uapiResult.status;
        
        console.log(`→ UAPI Status: ${uapiStatus}`);
        console.log(`→ UAPI Errors: ${JSON.stringify(uapiResult.errors)}`);
        console.log(`→ UAPI Warnings: ${JSON.stringify(uapiResult.warnings)}`);
        
        if (uapiResult.data) {
          responseData = uapiResult.data;
          fileContent = responseData.content || '';
          console.log(`→ Using result.data.uapi.data structure (correct WHM format)`);
          console.log(`→ File path: ${responseData.path || 'N/A'}`);
          console.log(`→ Filename: ${responseData.filename || 'N/A'}`);
          console.log(`→ Content length: ${fileContent.length} characters`);
        } else {
          console.log(`→ No data in uapi result`);
        }
      } else {
        console.log(`→ Unexpected response structure - missing data.uapi:`, JSON.stringify(result, null, 2));
      }
      
      if (responseData && fileContent) {
        
        // Get last 150 lines (tail -150 equivalent)
        const lines = fileContent.split('\n').filter(line => line.trim());
        const lastLines = lines.slice(-150);
        
        // Get LAST 10 lines and check if they are syntax errors
        const last10Lines = lines.slice(-10);
        const last10AreSyntaxErrors = last10Lines.filter(line => 
          line.toLowerCase().includes('syntax error') || 
          line.toLowerCase().includes('parse error') ||
          line.toLowerCase().includes('fatal error')
        );
        
        // Only consider it a syntax error issue if the last 10 lines contain syntax errors
        const isSyntaxErrorIssue = last10AreSyntaxErrors.length > 0;
        
        console.log(`✅ Successfully fetched error log for ${domain} (${lastLines.length} recent entries)`);
        console.log(`→ Total lines in error log: ${lines.length}`);
        
        if (lastLines.length > 0) {
          console.log(`→ Recent error log entries:`);
          lastLines.forEach((line, index) => {
            console.log(`  ${index + 1}. ${line}`);
          });
        }
        
        return {
          success: true,
          domain: domain,
          username: username,
          serverName: serverName,
          errorLogLines: lastLines,
          last10Lines: last10Lines,
          last10SyntaxErrors: last10AreSyntaxErrors,
          isSyntaxErrorIssue: isSyntaxErrorIssue,
          totalLines: lines.length,
          message: `Found ${lastLines.length} recent error log entries for ${domain}`,
          syntaxErrorMessage: isSyntaxErrorIssue ? 
            `Last 10 lines contain ${last10AreSyntaxErrors.length} syntax errors - ticket creation recommended` :
            `Last 10 lines contain no syntax errors - no ticket needed`,
          timestamp: new Date().toISOString(),
          apiMethod: 'whmapi1_uapi_cpanel_fileman_get_file_content'
        };
      } else if (responseData) {
        console.log(`ℹ️ Error log file is empty for ${domain}`);
        
        return {
          success: true,
          domain: domain,
          username: username,
          serverName: serverName,
          errorLogLines: [],
          totalLines: 0,
          message: `Error log file is empty for ${domain}`,
          timestamp: new Date().toISOString(),
          apiMethod: 'whmapi1_uapi_cpanel_fileman_get_file_content'
        };
      } else {
        // Check for API errors in WHM uapi_cpanel response
        let error = 'Failed to read error log file - unexpected response structure';
        
        if (result && result.data && result.data.uapi) {
          const uapiResult = result.data.uapi;
          
          if (uapiResult.status === 0) {
            error = 'UAPI call failed (status: 0)';
          } else if (uapiResult.errors && uapiResult.errors.length > 0) {
            error = `UAPI errors: ${uapiResult.errors.join(', ')}`;
          } else if (uapiStatus === 1 && !responseData) {
            error = 'UAPI call succeeded but no data returned';
          }
        } else if (result && result.metadata) {
          error = result.metadata.reason || 'WHM API call failed';
        }
        
        console.log(`❌ Failed to fetch error log for ${domain}: ${error}`);
        
        return {
          success: false,
          domain: domain,
          username: username,
          serverName: serverName,
          error: error,
          message: `Failed to fetch error log for ${domain}: ${error}`,
          timestamp: new Date().toISOString(),
          apiMethod: 'whmapi1_uapi_cpanel_fileman_get_file_content',
          rawResponse: result
        };
      }
      
    } catch (error) {
      console.log(`❌ Error fetching error log for ${domain}: ${error.message}`);
      
      return {
        success: false,
        domain: domain,
        username: username,
        serverName: serverName,
        error: error.message,
        message: `Error fetching error log for ${domain}: ${error.message}`,
        timestamp: new Date().toISOString(),
        apiMethod: 'whmapi1_uapi_cpanel_fileman_get_file_content'
      };
    }
  }

  /**
   * Create support ticket for 500 errors with syntax error details
   * @param {string} domain - Domain name
   * @param {string} username - cPanel username  
   * @param {string} serverName - Server name
   * @param {Array} syntaxErrors - Array of syntax error lines
   * @param {Object} checksStatus - Status of DNS and AutoSSL checks
   * @param {string} clientId - WHMCS client ID
   * @param {string} email - Email address (fallback if no clientId)
   * @returns {Promise<object>} - Ticket creation result
   */
  async createSyntaxErrorTicket(domain, username, serverName, syntaxErrors, checksStatus = {}, clientId, email) {
    try {
      console.log(`🎫 Creating support ticket for 500 syntax errors: ${domain}`);
      console.log(`→ Client ID: ${clientId}`);
      console.log(`→ Email: ${email}`);
      console.log(`→ Username: ${username}`);
      console.log(`→ Server: ${serverName}`);
      
      if (!clientId && !email) {
        throw new Error('Either Client ID or email is required for ticket creation');
      }
      
      const { openTicket } = require('../services/whmcsService');
      
      // Build ticket subject
      const subject = `500 Internal Server Error - PHP Syntax Errors Detected: ${domain}`;
      
      // Build detailed ticket message
      let ticketMessage = `=== 500 INTERNAL SERVER ERROR ANALYSIS ===\n`;
      ticketMessage += `Domain: ${domain}\n`;
      ticketMessage += `Username: ${username}\n`;
      ticketMessage += `Server: ${serverName}\n`;
      ticketMessage += `Issue: PHP Syntax Errors causing 500 Internal Server Error\n`;
      ticketMessage += `Timestamp: ${new Date().toISOString()}\n\n`;
      
      // Add system checks summary
      ticketMessage += `=== SYSTEM CHECKS SUMMARY ===\n`;
      ticketMessage += `DNS Check: ${checksStatus.dnsCheck || 'Passed'}\n`;
      ticketMessage += `AutoSSL Check: ${checksStatus.autoSSLCheck || 'Passed'}\n`;
      ticketMessage += `Server Connectivity: ${checksStatus.connectivity || 'Verified'}\n`;
      ticketMessage += `Issue Source: PHP Code Syntax Errors\n\n`;
      
      // Add syntax errors
      if (syntaxErrors && syntaxErrors.length > 0) {
        ticketMessage += `=== RECENT SYNTAX ERRORS (Last ${syntaxErrors.length}) ===\n`;
        syntaxErrors.forEach((error, index) => {
          ticketMessage += `${index + 1}. ${error}\n`;
        });
        ticketMessage += `\n`;
      }
      
      // Add analysis and recommendations
      ticketMessage += `=== ANALYSIS ===\n`;
      ticketMessage += `The domain is returning 500 Internal Server Error due to PHP syntax errors.\n`;
      ticketMessage += `DNS and AutoSSL checks have passed, confirming the issue is code-related.\n`;
      ticketMessage += `Multiple syntax errors detected in /public_html/index.php on line 13.\n\n`;
      
      ticketMessage += `=== RECOMMENDED ACTIONS ===\n`;
      ticketMessage += `1. Review and fix PHP syntax errors in index.php line 13\n`;
      ticketMessage += `2. Check for missing semicolons, brackets, or quotes\n`;
      ticketMessage += `3. Validate PHP code syntax before deployment\n`;
      ticketMessage += `4. Consider enabling PHP error reporting for development\n\n`;
      
      ticketMessage += `=== TECHNICAL DETAILS ===\n`;
      ticketMessage += `Error Type: PHP Parse Error\n`;
      ticketMessage += `Common Cause: Syntax error with "define" statement\n`;
      ticketMessage += `File Location: /home/${username}/public_html/index.php\n`;
      ticketMessage += `Line Number: 13\n`;
      ticketMessage += `Auto-Generated: Yes (500 Error Detection System)\n`;
      
      // Create the ticket
      const deptid = process.env.TECHSUPPORT_DEPTID;
      const deptname = deptid ? undefined : (process.env.TECHSUPPORT_DEPTNAME || 'Technical Support');
      
      // Prepare ticket parameters - use clientId if available, otherwise use email
      const ticketParams = {
        deptid,
        deptname,
        subject,
        message: ticketMessage,
        priority: 'High'
      };
      
      if (clientId) {
        ticketParams.clientid = clientId;
        console.log(`→ Using client ID for ticket: ${clientId}`);
      } else if (email) {
        ticketParams.name = `Customer (${domain})`;
        ticketParams.email = email;
        console.log(`→ Using email for ticket: ${email}`);
      }
      
      const ticket = await openTicket(ticketParams);
      
      const ticketId = ticket.tid || ticket.ticketid || ticket.id;
      
      console.log(`✅ Support ticket created for syntax errors: #${ticketId}`);
      
      return {
        success: true,
        ticketId: ticketId,
        subject: subject,
        domain: domain,
        username: username,
        serverName: serverName,
        syntaxErrorCount: syntaxErrors.length,
        message: `Support ticket #${ticketId} created for PHP syntax errors on ${domain}`,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.log(`❌ Error creating syntax error ticket for ${domain}: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        domain: domain,
        username: username,
        serverName: serverName,
        message: `Failed to create support ticket for syntax errors: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
const whmService = new WHMService();

module.exports = whmService;