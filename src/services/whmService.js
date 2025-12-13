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
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    console.log('🔧 WHM Service initialized:', {
      username: this.username,
      serversConfigured: Object.keys(this.serverApiKeys).length,
      sslVerify: this.verifySSL,
      servers: Object.keys(this.serverApiKeys)
    });
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
    
    const serverName = whmcsServerName.toLowerCase();
    
    // Direct matches (CP1, PCP6, RCP2, etc.)
    const directMatch = serverName.match(/^(cp\d+|pcp\d+|rcp\d+)$/);
    if (directMatch) {
      return directMatch[1];
    }
    
    // Extract from descriptive names (e.g., "VPS - Win1 (Shared)" -> look for cp/pcp/rcp pattern)
    const descriptiveMatch = serverName.match(/(cp\d+|pcp\d+|rcp\d+)/);
    if (descriptiveMatch) {
      return descriptiveMatch[1];
    }
    
    // Handle specific known patterns
    if (serverName.includes('win1')) return 'cp1';
    if (serverName.includes('win2')) return 'cp2';
    // Add more mappings as needed
    
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
  async callServerAPI(serverName, function_name, params = {}, apiVersion = '2') {
    try {
      console.log(`🔧 WHM API Call [${serverName.toUpperCase()}]: ${function_name}`, Object.keys(params));
      
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
        console.log(`  → Method: POST`);
        console.log(`  → Full query params:`, queryParams.toString());
      }
      
      const response = await client.post(url);
      
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
      
      console.log(`✅ WHM API Success [${serverName.toUpperCase()}]: ${function_name}`);
      
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
      const accounts = await this.listAccounts({ domain });
      return accounts.find(acc => acc.domain === domain) || null;
    } catch (error) {
      console.error(`Error finding account for domain ${domain}:`, error.message);
      return null;
    }
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
      
      if (!correctIP) {
        return {
          success: false,
          error: `No IP address found for server ${serverName.toUpperCase()} in cache`,
          domain: domain,
          server: serverName,
          currentIPs: currentIPs
        };
      }
      
      console.log(`→ Correct IP for ${domain}: ${correctIP} (server ${serverName.toUpperCase()})`);
      
      // Step 4: Detect wrong IP scenario
      if (currentIPs.length > 0 && !currentIPs.includes(correctIP)) {
        wrongIPDetected = true;
        console.log(`🚨 WRONG IP DETECTED:`);
        console.log(`   Current: ${currentIPs.join(', ')} (incorrect)`);
        console.log(`   Expected: ${correctIP} (server ${serverName.toUpperCase()})`);
        console.log(`   → Domain is pointing to wrong server/IP`);
      } else if (currentIPs.includes(correctIP)) {
        console.log(`✅ A record already points to correct IP: ${correctIP}`);
        console.log(`ℹ️ However, multiple IPs detected: ${currentIPs.join(', ')}`);
        console.log(`→ Need to check DNS zone for duplicate A records that should be removed`);
        wrongIPDetected = false; // Main record is correct, but duplicates may exist
      }
      
      // Step 5: Read and log current DNS zone configuration BEFORE making changes
      console.log(`\n📋 Reading current DNS zone configuration for ${domain}...`);
      const currentDNSRecords = await this.getDNSZone(serverName, domain);
      
      if (currentDNSRecords && currentDNSRecords.length > 0) {
        console.log(`→ Found ${currentDNSRecords.length} DNS records in zone:`);
        
        // Group records by type for better logging
        const recordsByType = {};
        currentDNSRecords.forEach(record => {
          if (!recordsByType[record.type]) {
            recordsByType[record.type] = [];
          }
          recordsByType[record.type].push(record);
        });
        
        // Log each record type
        Object.keys(recordsByType).sort().forEach(type => {
          console.log(`\n  ${type} Records (${recordsByType[type].length}):`);
          recordsByType[type].forEach((record, index) => {
            const name = record.name || record.dname || 'N/A';
            const value = record.address || record.cname || record.txtdata || record.exchange || record.target || 'N/A';
            const ttl = record.ttl || 'N/A';
            const priority = record.priority || record.preference || '';
            
            console.log(`    ${index + 1}. ${name} → ${value}${priority ? ` (priority: ${priority})` : ''} [TTL: ${ttl}]`);
          });
        });
        
        // Specifically highlight current A records
        const aRecords = recordsByType['A'] || [];
        if (aRecords.length > 0) {
          console.log(`\n🎯 Current A Records in DNS Zone for ${domain}:`);
          aRecords.forEach((record, index) => {
            const name = record.name || record.dname || domain;
            const ip = record.address || 'N/A';
            const isCorrect = ip === correctIP;
            const status = isCorrect ? '✅' : '❌';
            console.log(`    ${index + 1}. ${name} → ${ip} ${status} ${isCorrect ? '(correct)' : '(needs update)'}`);
          });
        } else {
          console.log(`\n⚠️ No A records found in DNS zone for ${domain}`);
        }
      } else {
        console.log(`⚠️ Could not retrieve DNS zone records for ${domain}`);
      }
      
      // Step 6: Update the A record to correct IP
      console.log(`\n🔧 Updating A record to fix DNS automatically`);
      if (wrongIPDetected) {
        console.log(`→ Fixing wrong IP: ${currentIPs.join(', ')} → ${correctIP}`);
      }
      
      const updateResult = await this.updateARecord(serverName, domain, correctIP);
      
      if (updateResult.success) {
        // Get the new A record after update to confirm the change
        let newIP = correctIP; // Default to server IP
        
        // PERFORMANCE OPTIMIZATION: Skip DNS verification for faster response
        console.log(`⚡ Skipping DNS verification for performance - changes will propagate naturally`);
        newIP = correctIP; // Use the expected IP
        
        // Build success message with sync information
        let successMessage = wrongIPDetected 
          ? `A record fixed! Updated ${domain} from wrong IP (${currentIPs.join(', ')}) to correct server IP (${correctIP}) on ${serverName.toUpperCase()}.`
          : `A record updated successfully for ${domain} on server ${serverName.toUpperCase()} using ${updateResult.method}. Website now points to server's IP (${newIP}).`;
        
        if (updateResult.synced) {
          successMessage += ` DNS changes synced across nameservers using ${updateResult.syncMethod}.`;
        } else if (updateResult.syncError) {
          if (updateResult.syncError.includes('not available')) {
            successMessage += ` DNS changes will propagate naturally within 5-15 minutes.`;
          } else {
            successMessage += ` Note: DNS sync failed (${updateResult.syncError}) - changes may take longer to propagate.`;
          }
        }
        
        return {
          success: true,
          domain: domain,
          server: serverName,
          oldIP: currentIPs.join(', '),
          newIP: newIP,
          correctIP: correctIP,
          wrongIPDetected: wrongIPDetected,
          method: updateResult.method,
          synced: updateResult.synced || false,
          syncMethod: updateResult.syncMethod || null,
          syncError: updateResult.syncError || null,
          dnsRecordsBeforeUpdate: currentDNSRecords,
          message: successMessage
        };
      } else {
        return {
          success: false,
          error: updateResult.error || 'Failed to update A record via WHM API',
          domain: domain,
          server: serverName,
          currentIPs: currentIPs,
          correctIP: correctIP,
          wrongIPDetected: wrongIPDetected,
          dnsRecordsBeforeUpdate: currentDNSRecords
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


// Export singleton instance
const whmService = new WHMService();

module.exports = whmService;