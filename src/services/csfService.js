/**
 * ConfigServer Security & Firewall (CSF) API Service
 * Provides CSF firewall management functionality
 */

const axios = require('axios');
const https = require('https');

class CSFService {
  constructor() {
    this.username = process.env.WHM_USERNAME || 'root';
    this.verifySSL = process.env.WHM_VERIFY_SSL !== 'false';
    
    // Load server API keys from WHM service
    this.serverApiKeys = this.loadServerApiKeys();
    
    // CSF API endpoints
    this.csfEndpoints = {
      grepip: '/cgi/configserver/csf.cgi',
      allow: '/cgi/configserver/csf.cgi',
      deny: '/cgi/configserver/csf.cgi'
    };
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔧 CSF Service initialized:', {
        username: this.username,
        serversConfigured: Object.keys(this.serverApiKeys).length,
        sslVerify: this.verifySSL
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
   * Create axios client for CSF API calls
   * @param {string} serverName - Server name
   * @returns {Object} Configured axios client
   */
  createCSFClient(serverName) {
    const hostname = this.getServerHostname(serverName);
    const baseURL = `https://${hostname}:2087`;
    const apiKey = this.serverApiKeys[serverName.toLowerCase()];
    
    if (!apiKey) {
      throw new Error(`No API key found for server: ${serverName}`);
    }
    
    const client = axios.create({
      baseURL: baseURL,
      timeout: 15000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: this.verifySSL
      }),
      headers: {
        'Authorization': `whm ${this.username}:${apiKey}`,
        'User-Agent': 'cPHulk-Manager/1.0'
      }
    });
    
    return client;
  }

  /**
   * Check if IP exists in CSF firewall rules (allow/deny lists)
   * @param {string} ip - IP address to check
   * @param {string} serverName - Server name (required)
   * @returns {Promise<Object>} CSF grep result
   */
  async grepIP(ip, serverName) {
    if (!serverName) {
      throw new Error('Server name is required for CSF operations');
    }
    try {
      const client = this.createCSFClient(serverName);
      
      console.log(`→ Checking IP ${ip} in CSF firewall rules on server ${serverName}`);
      
      // Use POST method with form data for CSF grep action
      const formData = new URLSearchParams();
      formData.append('action', 'grep');
      formData.append('ip', ip);
      
      const response = await client.post(this.csfEndpoints.grepip, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Parse CSF response
      const result = this.parseCSFResponse(response.data, ip);
      
      console.log(`→ CSF grep result for IP ${ip}:`, {
        found: result.found,
        rules: result.rules.length,
        inAllowList: result.inAllowList,
        inDenyList: result.inDenyList
      });

      return {
        success: true,
        ip: ip,
        serverName: serverName,
        found: result.found,
        rules: result.rules,
        inAllowList: result.inAllowList,
        inDenyList: result.inDenyList,
        summary: result.summary,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error checking IP ${ip} in CSF:`, error.message);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        error: error.message,
        found: false,
        rules: [],
        inAllowList: false,
        inDenyList: false,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Parse CSF API response with enhanced reason detection
   * @param {string} responseData - Raw CSF response
   * @param {string} ip - IP address that was searched
   * @returns {Object} Parsed result with detailed analysis
   */
  parseCSFResponse(responseData, ip) {
    const result = {
      found: false,
      rules: [],
      inAllowList: false,
      inDenyList: false,
      blockReasons: [],
      blockType: null,
      blockSource: null,
      blockDate: null,
      summary: 'IP not found in any CSF rules'
    };

    try {
      // CSF responses can be HTML or plain text
      const responseText = responseData.toString();
      
      // Debug logging to see actual response
      if (process.env.NODE_ENV !== 'production') {
        console.log(`→ CSF Raw Response for IP ${ip}:`);
        console.log(`   Response length: ${responseText.length} characters`);
        console.log(`   Contains IP: ${responseText.includes(ip)}`);
      }
      
      // Check if response contains IP matches
      if (responseText.includes(ip)) {
        result.found = true;
        
        // Parse different types of CSF rules
        const lines = responseText.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          if (trimmedLine.includes(ip)) {
            console.log(`→ Found line containing IP: ${trimmedLine}`);
            
            // Determine rule type based on content
            let ruleType = 'unknown';
            let ruleFile = 'unknown';
            
            // Check for various CSF file patterns
            if (trimmedLine.includes('csf.allow') || trimmedLine.includes('/csf.allow') || 
                (trimmedLine.includes('allow') && !trimmedLine.includes('deny'))) {
              ruleType = 'allow';
              ruleFile = 'csf.allow';
              result.inAllowList = true;
            } else if (trimmedLine.includes('csf.deny') || trimmedLine.includes('/csf.deny') || 
                       trimmedLine.includes('deny') || trimmedLine.includes('blocked') ||
                       trimmedLine.includes('DROP') || trimmedLine.includes('REJECT') ||
                       trimmedLine.includes('DENYIN') || trimmedLine.includes('DENYOUT')) {
              ruleType = 'deny';
              ruleFile = 'csf.deny';
              result.inDenyList = true;
              
              // Parse block reasons and details
              this.parseBlockReason(trimmedLine, result);
              
            } else if (trimmedLine.includes('csf.ignore') || trimmedLine.includes('/csf.ignore')) {
              ruleType = 'ignore';
              ruleFile = 'csf.ignore';
            } else if (trimmedLine.includes('csf.temp') || trimmedLine.includes('/tmp/')) {
              ruleType = 'temporary';
              ruleFile = 'csf.temp';
              result.inDenyList = true; // Temporary blocks are still blocks
            }
            
            // Special handling for iptables rules that indicate blocking
            if (trimmedLine.includes('filter') && (trimmedLine.includes('DENYIN') || trimmedLine.includes('DENYOUT'))) {
              if (!result.inDenyList) { // Only set if not already detected from csf.deny
                ruleType = 'iptables_deny';
                ruleFile = 'iptables';
                result.inDenyList = true;
                
                // Try to infer block type from iptables rule
                if (!result.blockType) {
                  result.blockType = 'iptables_block';
                  result.blockSource = 'iptables';
                  if (!result.blockReasons) result.blockReasons = [];
                  result.blockReasons.push('Blocked by iptables firewall rule');
                }
              }
            }
            
            result.rules.push({
              type: ruleType,
              file: ruleFile,
              line: trimmedLine,
              ip: ip
            });
          }
        }
        
        // Generate enhanced summary
        if (result.inAllowList && result.inDenyList) {
          result.summary = `IP ${ip} found in both allow and deny lists`;
        } else if (result.inAllowList) {
          result.summary = `IP ${ip} is in CSF allow list`;
        } else if (result.inDenyList) {
          const reasonText = result.blockReasons && Array.isArray(result.blockReasons) && result.blockReasons.length > 0 ? ` (${result.blockReasons.join(', ')})` : '';
          result.summary = `IP ${ip} is blocked by CSF${reasonText}`;
        } else {
          result.summary = `IP ${ip} found in CSF rules but not in allow/deny lists`;
        }
      } else {
        // Check if the response indicates "no matches" or similar
        const lowerResponse = responseText.toLowerCase();
        if (lowerResponse.includes('no matches') || 
            lowerResponse.includes('not found') || 
            lowerResponse.includes('no results')) {
          result.summary = `IP ${ip} not found in CSF rules (confirmed by CSF)`;
        }
      }
      
    } catch (parseError) {
      console.error('Error parsing CSF response:', parseError.message);
      result.summary = 'Error parsing CSF response';
    }

    return result;
  }

  /**
   * Parse block reason from CSF deny line
   * @param {string} line - CSF deny line
   * @param {Object} result - Result object to populate
   */
  parseBlockReason(line, result) {
    // Initialize blockReasons array if not exists
    if (!result.blockReasons || !Array.isArray(result.blockReasons)) {
      result.blockReasons = [];
    }
    
    // Parse different block reason patterns
    
    // Pattern: "lfd: (service) Failed login from IP"
    const lfdMatch = line.match(/lfd:\s*\(([^)]+)\)\s*Failed\s+([^:]+).*?(\d+)\s+in\s+the\s+last\s+(\d+)\s+secs/i);
    if (lfdMatch) {
      result.blockType = 'lfd_failed_login';
      result.blockSource = 'lfd';
      result.blockReasons.push(`Failed ${lfdMatch[2]} (${lfdMatch[1]}): ${lfdMatch[3]} attempts in ${lfdMatch[4]} seconds`);
      return; // Found specific pattern, return early
    }
    
    // Pattern: "Manually denied"
    if (line.includes('Manually denied')) {
      result.blockType = 'manual';
      result.blockSource = 'manual';
      result.blockReasons.push('Manually blocked by administrator');
      return;
    }
    
    // Pattern: "cPHulk" blocks
    if (line.includes('cPHulk') || line.includes('cpanel')) {
      result.blockType = 'cphulk';
      result.blockSource = 'cphulk';
      if (line.includes('Failed cPanel login')) {
        result.blockReasons.push('cPanel login failures detected by cPHulk');
      } else {
        result.blockReasons.push('cPHulk security block');
      }
      return;
    }
    
    // Pattern: "SSH" blocks
    if (line.includes('sshd') || line.includes('SSH')) {
      result.blockType = 'ssh';
      result.blockSource = 'lfd';
      result.blockReasons.push('SSH login failures');
      return;
    }
    
    // Pattern: "FTP" blocks
    if (line.includes('ftp') || line.includes('FTP')) {
      result.blockType = 'ftp';
      result.blockSource = 'lfd';
      result.blockReasons.push('FTP login failures');
      return;
    }
    
    // Pattern: "Mail" blocks
    if (line.includes('mail') || line.includes('smtp') || line.includes('pop') || line.includes('imap')) {
      result.blockType = 'mail';
      result.blockSource = 'lfd';
      result.blockReasons.push('Mail service login failures');
      return;
    }
    
    // Pattern: Generic CSF deny entry
    if (line.includes('csf.deny:')) {
      // Extract the comment part after the #
      const commentMatch = line.match(/csf\.deny:\s*[^\s]+\s*#\s*(.+)/);
      if (commentMatch) {
        const comment = commentMatch[1].trim();
        
        // Try to parse the comment for more specific information
        if (comment.includes('lfd:')) {
          result.blockType = 'lfd';
          result.blockSource = 'lfd';
          result.blockReasons.push(`LFD block: ${comment}`);
        } else if (comment.includes('Manually denied')) {
          result.blockType = 'manual';
          result.blockSource = 'manual';
          result.blockReasons.push('Manually blocked by administrator');
        } else {
          result.blockType = 'csf_deny';
          result.blockSource = 'csf';
          result.blockReasons.push(comment);
        }
      } else {
        // No comment found, generic CSF deny
        result.blockType = 'csf_deny';
        result.blockSource = 'csf';
        result.blockReasons.push('Blocked by CSF firewall');
      }
      return;
    }
    
    // Pattern: iptables rules (DENYIN, DENYOUT, DROP, REJECT)
    if (line.includes('DENYIN') || line.includes('DENYOUT') || line.includes('DROP') || line.includes('REJECT')) {
      if (!result.blockType) { // Only set if not already set
        result.blockType = 'iptables';
        result.blockSource = 'iptables';
        result.blockReasons.push('Blocked by iptables firewall rule');
      }
      return;
    }
    
    // Extract date if present
    const dateMatch = line.match(/(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})/);
    if (dateMatch) {
      result.blockDate = dateMatch[1];
    }
    
    // Extract country/location info
    const locationMatch = line.match(/\(([A-Z]{2})\/([^/]+)\/([^)]+)\)/);
    if (locationMatch) {
      result.location = {
        countryCode: locationMatch[1],
        country: locationMatch[2],
        node: locationMatch[3]
      };
    }
  }

  /**
   * Add IP to CSF allow list
   * @param {string} ip - IP address to allow
   * @param {string} serverName - Server name (required)
   * @param {string} comment - Optional comment for the rule
   * @returns {Promise<Object>} CSF allow result
   */
  async allowIP(ip, serverName, comment = 'Added via API') {
    if (!serverName) {
      throw new Error('Server name is required for CSF operations');
    }
    try {
      const client = this.createCSFClient(serverName);
      
      console.log(`→ Adding IP ${ip} to CSF allow list on server ${serverName}`);
      
      // Use POST method with form data for CSF allow action
      const formData = new URLSearchParams();
      formData.append('action', 'qallow');
      formData.append('ip', ip);
      formData.append('comment', comment);
      
      const response = await client.post(this.csfEndpoints.allow, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return {
        success: true,
        ip: ip,
        serverName: serverName,
        action: 'allow',
        comment: comment,
        message: `IP ${ip} added to CSF allow list`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error adding IP ${ip} to CSF allow list:`, error.message);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        action: 'allow',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Remove IP from CSF deny list
   * @param {string} ip - IP address to remove from deny list
   * @param {string} serverName - Server name (required)
   * @returns {Promise<Object>} CSF unblock result
   */
  async unblockIP(ip, serverName) {
    if (!serverName) {
      throw new Error('Server name is required for CSF operations');
    }
    try {
      const client = this.createCSFClient(serverName);
      
      console.log(`→ Removing IP ${ip} from CSF deny list on server ${serverName}`);
      
      // Use POST method with form data for CSF unblock action
      const formData = new URLSearchParams();
      formData.append('action', 'kill');
      formData.append('ip', ip);
      
      const response = await client.post(this.csfEndpoints.deny, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return {
        success: true,
        ip: ip,
        serverName: serverName,
        action: 'unblock',
        message: `IP ${ip} removed from CSF deny list`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error removing IP ${ip} from CSF deny list:`, error.message);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        action: 'unblock',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Test CSF API response format (debug method)
   * @param {string} ip - IP address to test
   * @param {string} serverName - Server name
   * @returns {Promise<Object>} Raw CSF response for debugging
   */
  async debugCSFResponse(ip, serverName) {
    if (!serverName) {
      throw new Error('Server name is required for CSF operations');
    }

    try {
      const client = this.createCSFClient(serverName);
      
      console.log(`→ DEBUG: Testing CSF API response for IP ${ip} on server ${serverName}`);
      
      // Use POST method with form data for CSF grep action
      const formData = new URLSearchParams();
      formData.append('action', 'grep');
      formData.append('ip', ip);
      
      const response = await client.post(this.csfEndpoints.grepip, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const responseText = response.data.toString();
      
      return {
        success: true,
        ip: ip,
        serverName: serverName,
        rawResponse: responseText,
        responseLength: responseText.length,
        containsIP: responseText.includes(ip),
        statusCode: response.status,
        headers: response.headers,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error in CSF debug for IP ${ip}:`, error.message);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get detailed CSF deny file content for better block reason analysis
   * @param {string} ip - IP address to check
   * @param {string} serverName - Server name
   * @returns {Promise<Object>} CSF deny file analysis
   */
  async getCSFDenyDetails(ip, serverName) {
    try {
      const client = this.createCSFClient(serverName);
      
      console.log(`→ Getting CSF deny file details for IP ${ip} on server ${serverName}`);
      
      // Use CSF deny file view action
      const formData = new URLSearchParams();
      formData.append('action', 'deny');
      
      const response = await client.post(this.csfEndpoints.grepip, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const responseText = response.data.toString();
      
      // Look for the IP in the deny file content
      const lines = responseText.split('\n');
      const ipLines = lines.filter(line => line.includes(ip));
      
      const denyDetails = {
        found: ipLines.length > 0,
        entries: [],
        blockType: null,
        blockSource: null,
        blockReasons: []
      };
      
      for (const line of ipLines) {
        if (line.includes('#')) {
          // Parse comment section for block details
          const commentMatch = line.match(/([^#]+)#\s*(.+)/);
          if (commentMatch) {
            const ipPart = commentMatch[1].trim();
            const comment = commentMatch[2].trim();
            
            denyDetails.entries.push({
              ip: ipPart,
              comment: comment,
              fullLine: line.trim()
            });
            
            // Parse the comment for block type
            if (comment.includes('lfd:')) {
              denyDetails.blockType = 'lfd';
              denyDetails.blockSource = 'lfd';
              
              // Extract specific lfd reason
              if (comment.includes('Failed cPanel login')) {
                denyDetails.blockReasons.push('Failed cPanel login attempts');
              } else if (comment.includes('Failed')) {
                denyDetails.blockReasons.push('Failed login attempts');
              } else {
                denyDetails.blockReasons.push('LFD security block');
              }
            } else if (comment.includes('Manually denied')) {
              denyDetails.blockType = 'manual';
              denyDetails.blockSource = 'manual';
              denyDetails.blockReasons.push('Manually blocked by administrator');
            } else {
              denyDetails.blockType = 'csf_deny';
              denyDetails.blockSource = 'csf';
              denyDetails.blockReasons.push(comment);
            }
          }
        }
      }
      
      return denyDetails;
      
    } catch (error) {
      console.error(`Error getting CSF deny details for IP ${ip}:`, error.message);
      return {
        found: false,
        entries: [],
        blockType: null,
        blockSource: null,
        blockReasons: [],
        error: error.message
      };
    }
  }

  /**
   * Comprehensive IP analysis combining CSF grep and deny file details
   * @param {string} ip - IP address to analyze
   * @param {string} serverName - Server name (required)
   * @returns {Promise<Object>} Comprehensive analysis result
   */
  async analyzeIP(ip, serverName) {
    if (!serverName) {
      throw new Error('Server name is required for CSF operations');
    }
    try {
      console.log(`→ Starting comprehensive IP analysis for ${ip} on server ${serverName}`);
      
      // Step 1: Check CSF firewall rules (grep)
      const csfResult = await this.grepIP(ip, serverName);
      
      // Step 2: Get detailed deny file information if IP is blocked
      let denyDetails = null;
      if (csfResult.success && csfResult.inDenyList) {
        console.log(`→ Getting detailed CSF deny file information for blocked IP ${ip}`);
        denyDetails = await this.getCSFDenyDetails(ip, serverName);
        
        // Merge deny file details with grep results for better analysis
        if (denyDetails.found && denyDetails.blockType) {
          csfResult.blockType = denyDetails.blockType;
          csfResult.blockSource = denyDetails.blockSource;
          csfResult.blockReasons = denyDetails.blockReasons;
          
          // Update summary with better information
          const reasonText = denyDetails.blockReasons && Array.isArray(denyDetails.blockReasons) && denyDetails.blockReasons.length > 0 ? ` (${denyDetails.blockReasons.join(', ')})` : '';
          csfResult.summary = `IP ${ip} is blocked by CSF${reasonText}`;
        }
      }
      
      const analysis = {
        success: true,
        ip: ip,
        serverName: serverName,
        csf: csfResult,
        denyFileDetails: denyDetails,
        recommendations: [],
        riskLevel: 'low',
        timestamp: new Date().toISOString()
      };

      // Generate recommendations based on CSF status
      if (csfResult.inDenyList) {
        analysis.riskLevel = 'high';
        analysis.recommendations.push({
          type: 'warning',
          message: 'IP is currently blocked by CSF firewall',
          action: 'IP will be automatically unblocked and whitelisted'
        });
        
        // Add specific recommendations based on block type
        if (csfResult.blockType === 'lfd' || csfResult.blockType === 'lfd_failed_login') {
          analysis.recommendations.push({
            type: 'security',
            message: 'IP was blocked due to failed login attempts',
            action: 'Review login credentials and check for automated scripts with outdated passwords'
          });
        } else if (csfResult.blockType === 'manual') {
          analysis.recommendations.push({
            type: 'info',
            message: 'IP was manually blocked by administrator',
            action: 'Manual block will be removed as requested'
          });
        }
      }

      if (csfResult.inAllowList) {
        analysis.recommendations.push({
          type: 'info',
          message: 'IP is already in CSF allow list',
          action: 'CSF firewall will not block this IP'
        });
      }

      if (!csfResult.found) {
        analysis.recommendations.push({
          type: 'info',
          message: 'IP not found in CSF rules',
          action: 'Consider adding to CSF allow list for additional protection'
        });
      }

      return analysis;

    } catch (error) {
      console.error(`Error analyzing IP ${ip}:`, error.message);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        error: error.message,
        riskLevel: 'unknown',
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = CSFService;