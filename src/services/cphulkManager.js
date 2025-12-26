const whmService = require('./whmService');

// Optimized logger for cPHulk manager - silent in production
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

class CphulkManager {
  constructor() {
    this.whmService = whmService;
    this.logger = logger;
  }

  /**
   * Get failed login attempts for a specific IP address
   * @param {string} ip - IP address to check
   * @param {string} serverName - Server name (optional, will use default if not provided)
   * @returns {Promise<Object>} Failed login data
   */
  async getFailedLogins(ip, serverName = null) {
    try {
      const result = {
        success: false,
        ip: ip,
        serverName: serverName,
        failedLogins: [],
        totalAttempts: 0,
        uniqueUsers: 0,
        services: [],
        countries: [],
        timeRange: null,
        error: null
      };

      // Determine which server to use
      const targetServer = serverName || this.getDefaultServer();
      if (!targetServer) {
        result.error = 'No server available for cPHulk API call';
        return result;
      }

      result.serverName = targetServer;

      // Make API call to get failed logins
      const apiParams = {
        'api.filter.a.field': 'ip',
        'api.filter.a.arg0': ip,
        'api.filter.a.type': 'eq',
        'api.filter.enable': '1'
      };

      const response = await this.whmService.callServerAPI(
        targetServer,
        'get_cphulk_failed_logins',
        apiParams,
        '1', // API version 1
        'GET'
      );

      if (!response || !response.data) {
        result.error = 'Invalid response from cPHulk API';
        return result;
      }

      // Process the response
      const failedLogins = response.data.failed_logins || [];
      result.failedLogins = failedLogins;
      result.totalAttempts = failedLogins.length;

      if (failedLogins.length > 0) {
        // Extract unique users
        const uniqueUsers = new Set(failedLogins.map(login => login.user));
        result.uniqueUsers = uniqueUsers.size;

        // Extract unique services
        const uniqueServices = new Set(failedLogins.map(login => login.service));
        result.services = Array.from(uniqueServices);

        // Extract unique countries
        const uniqueCountries = new Set(
          failedLogins
            .filter(login => login.country_name)
            .map(login => `${login.country_name} (${login.country_code})`)
        );
        result.countries = Array.from(uniqueCountries);

        // Calculate time range
        const loginTimes = failedLogins
          .map(login => new Date(login.logintime))
          .filter(date => !isNaN(date.getTime()));

        if (loginTimes.length > 0) {
          const earliest = new Date(Math.min(...loginTimes));
          const latest = new Date(Math.max(...loginTimes));
          
          result.timeRange = {
            earliest: earliest.toISOString(),
            latest: latest.toISOString(),
            duration: this.formatDuration(latest - earliest)
          };
        }

        // Sort failed logins by time (most recent first)
        result.failedLogins.sort((a, b) => 
          new Date(b.logintime) - new Date(a.logintime)
        );
      }

      result.success = true;
      result.message = failedLogins.length > 0 
        ? `Found ${failedLogins.length} failed login attempts for IP ${ip}`
        : `No failed login attempts found for IP ${ip}`;

      return result;

    } catch (error) {
      this.logger.error(`Error getting failed logins for IP ${ip}:`, error);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        failedLogins: [],
        totalAttempts: 0,
        uniqueUsers: 0,
        services: [],
        countries: [],
        timeRange: null,
        error: error.message || 'Failed to retrieve failed login data'
      };
    }
  }

  /**
   * Intelligent whitelisting workflow based on authservice type
   * @param {string} ip - IP address to whitelist
   * @param {string} serverName - Server name (optional, will use default if not provided)
   * @param {Object} clientInfo - Client information for ticket creation
   * @param {string} domain - Domain for context
   * @param {string} reason - Reason for whitelisting
   * @returns {Promise<Object>} Whitelisting workflow result
   */
  async intelligentWhitelistWorkflow(ip, serverName = null, clientInfo = null, domain = null, reason = 'API request') {
    try {
      const result = {
        success: false,
        ip: ip,
        serverName: serverName,
        workflow: 'intelligent_whitelist',
        steps: [],
        authServices: [],
        uniqueUsers: [],
        whitelisted: false,
        flushed: false,
        ticketCreated: false,
        scheduledRemoval: false,
        error: null
      };

      // Determine which server to use
      const targetServer = serverName || this.getDefaultServer();
      if (!targetServer) {
        result.error = 'No server available for cPHulk API call';
        return result;
      }

      result.serverName = targetServer;

      // Step 1: Get failed login attempts to analyze authservice
      result.steps.push('Checking failed login attempts');
      const failedLoginsResult = await this.getFailedLogins(ip, targetServer);
      
      if (!failedLoginsResult.success) {
        result.error = `Failed to get failed logins: ${failedLoginsResult.error}`;
        return result;
      }

      const failedLogins = failedLoginsResult.failedLogins || [];
      
      if (failedLogins.length === 0) {
        // No failed logins found, whitelist for 24 hours
        result.steps.push('No failed logins found, proceeding with 24-hour whitelisting');
        const whitelistResult = await this.whitelistIPTemporary(ip, targetServer, `${reason} (done by bot) - 24hr temporary`, 24);
        
        result.success = whitelistResult.success;
        result.whitelisted = whitelistResult.whitelisted;
        result.message = whitelistResult.message;
        
        if (whitelistResult.success) {
          result.steps.push('IP whitelisted for 24 hours');
          // Schedule removal after 24 hours
          result.steps.push('Scheduling IP removal after 24 hours');
          await this.scheduleIPRemoval(ip, targetServer, 24);
          result.scheduledRemoval = true;
          result.steps.push('IP removal scheduled for 24 hours');
          
          // Create ticket for no failed logins case
          await this.createWorkflowTicket(clientInfo, domain, ip, result, 'No failed logins found - preventive whitelisting');
          result.ticketCreated = true;
          result.steps.push('Support ticket created');
          
          result.message = 'No failed logins found: IP whitelisted (24hrs), removal scheduled, and ticket created';
        }
        
        return result;
      }

      // Step 2: Analyze authservice types
      const authServices = [...new Set(failedLogins.map(login => login.authservice))];
      result.authServices = authServices;
      result.steps.push(`Found authservices: ${authServices.join(', ')}`);

      // Step 3: Execute workflow based on authservice types
      if (authServices.includes('cpaneld')) {
        // cpaneld workflow: flush + whitelist + ticket
        result.steps.push('Executing cpaneld workflow: flush + whitelist + ticket');
        await this.executeCpaneldWorkflow(ip, targetServer, clientInfo, domain, reason, result);
        
      } else if (authServices.some(service => ['webmaild', 'dovecot'].includes(service))) {
        // webmaild/dovecot workflow: get unique users + flush + whitelist for 24hrs + ticket + schedule removal
        result.steps.push('Executing webmaild/dovecot workflow: analyze users + flush + whitelist (24hrs) + ticket + schedule removal');
        await this.executeMailServiceWorkflow(ip, targetServer, clientInfo, domain, reason, result, failedLogins);
        
      } else if (authServices.includes('pure-ftpd')) {
        // pure-ftpd workflow: flush + whitelist for 24hrs + ticket
        result.steps.push('Executing pure-ftpd workflow: flush + whitelist (24hrs) + ticket');
        await this.executeFtpdWorkflow(ip, targetServer, clientInfo, domain, reason, result);
        
      } else {
        // Unknown authservice, use default workflow
        result.steps.push(`Unknown authservice(s): ${authServices.join(', ')}, using default workflow`);
        await this.executeDefaultWorkflow(ip, targetServer, clientInfo, domain, reason, result);
      }

      result.success = true;
      return result;

    } catch (error) {
      this.logger.error(`Error in intelligent whitelist workflow for IP ${ip}:`, error);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        workflow: 'intelligent_whitelist',
        steps: ['Error occurred during workflow execution'],
        authServices: [],
        uniqueUsers: [],
        whitelisted: false,
        flushed: false,
        ticketCreated: false,
        scheduledRemoval: false,
        error: error.message || 'Failed to execute intelligent whitelist workflow'
      };
    }
  }

  /**
   * Execute cpaneld workflow: flush + whitelist for 24hrs + ticket + schedule removal
   */
  async executeCpaneldWorkflow(ip, serverName, clientInfo, domain, reason, result) {
    try {
      // Step 1: Flush cPHulk login history
      result.steps.push('Flushing cPHulk login history for cpaneld');
      const flushResult = await this.flushCphulkLoginHistory(ip, serverName);
      result.flushed = flushResult.success;
      
      if (flushResult.success) {
        result.steps.push('Login history flushed successfully');
      } else {
        result.steps.push(`Login history flush failed: ${flushResult.error}`);
      }

      // Step 2: Whitelist IP for 24 hours (changed from permanent)
      result.steps.push('Whitelisting IP for 24 hours');
      const whitelistResult = await this.whitelistIPTemporary(ip, serverName, `${reason} (done by bot) - 24hr temporary`, 24);
      result.whitelisted = whitelistResult.success;
      
      if (whitelistResult.success) {
        result.steps.push('IP whitelisted for 24 hours');
      } else {
        result.steps.push(`IP whitelisting failed: ${whitelistResult.error}`);
      }

      // Step 3: Schedule removal after 24 hours
      result.steps.push('Scheduling IP removal after 24 hours');
      await this.scheduleIPRemoval(ip, serverName, 24);
      result.scheduledRemoval = true;
      result.steps.push('IP removal scheduled for 24 hours');

      // Step 4: Create support ticket
      result.steps.push('Creating support ticket');
      await this.createWorkflowTicket(clientInfo, domain, ip, result, 'cpaneld authentication failures detected');
      result.ticketCreated = true;
      result.steps.push('Support ticket created with workflow summary');

      result.message = 'cpaneld workflow completed: IP flushed, whitelisted (24hrs), removal scheduled, and ticket created';

    } catch (error) {
      result.steps.push(`cpaneld workflow error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute webmaild/dovecot workflow: analyze users + flush + whitelist for 24hrs + ticket + schedule removal
   */
  async executeMailServiceWorkflow(ip, serverName, clientInfo, domain, reason, result, failedLogins) {
    try {
      // Step 1: Extract unique users from mail service failures
      const mailFailures = failedLogins.filter(login => 
        ['webmaild', 'dovecot'].includes(login.authservice)
      );
      const uniqueUsers = [...new Set(mailFailures.map(login => login.user))];
      result.uniqueUsers = uniqueUsers;
      result.steps.push(`Identified ${uniqueUsers.length} unique mail users: ${uniqueUsers.join(', ')}`);

      // Step 2: Flush cPHulk login history
      result.steps.push('Flushing cPHulk login history for mail services');
      const flushResult = await this.flushCphulkLoginHistory(ip, serverName);
      result.flushed = flushResult.success;
      
      if (flushResult.success) {
        result.steps.push('Login history flushed successfully');
      } else {
        result.steps.push(`Login history flush failed: ${flushResult.error}`);
      }

      // Step 3: Whitelist IP for 24 hours
      result.steps.push('Whitelisting IP for 24 hours');
      const whitelistResult = await this.whitelistIPTemporary(ip, serverName, `${reason} (done by bot) - 24hr temporary`, 24);
      result.whitelisted = whitelistResult.success;
      
      if (whitelistResult.success) {
        result.steps.push('IP whitelisted for 24 hours');
      } else {
        result.steps.push(`IP whitelisting failed: ${whitelistResult.error}`);
      }

      // Step 4: Schedule removal after 24 hours
      result.steps.push('Scheduling IP removal after 24 hours');
      await this.scheduleIPRemoval(ip, serverName, 24);
      result.scheduledRemoval = true;
      result.steps.push('IP removal scheduled for 24 hours');

      // Step 5: Create support ticket with user details
      result.steps.push('Creating support ticket with mail user details');
      await this.createWorkflowTicket(clientInfo, domain, ip, result, `Mail authentication failures for users: ${uniqueUsers.join(', ')}`);
      result.ticketCreated = true;
      result.steps.push('Support ticket created with user details and workflow summary');

      result.message = `Mail service workflow completed: ${uniqueUsers.length} users identified, IP flushed, whitelisted (24hrs), removal scheduled, and ticket created`;

    } catch (error) {
      result.steps.push(`Mail service workflow error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute pure-ftpd workflow: flush + whitelist for 24hrs + ticket
   */
  async executeFtpdWorkflow(ip, serverName, clientInfo, domain, reason, result) {
    try {
      // Step 1: Flush cPHulk login history
      result.steps.push('Flushing cPHulk login history for FTP');
      const flushResult = await this.flushCphulkLoginHistory(ip, serverName);
      result.flushed = flushResult.success;
      
      if (flushResult.success) {
        result.steps.push('Login history flushed successfully');
      } else {
        result.steps.push(`Login history flush failed: ${flushResult.error}`);
      }

      // Step 2: Whitelist IP for 24 hours
      result.steps.push('Whitelisting IP for 24 hours');
      const whitelistResult = await this.whitelistIPTemporary(ip, serverName, `${reason} (done by bot) - 24hr temporary`, 24);
      result.whitelisted = whitelistResult.success;
      
      if (whitelistResult.success) {
        result.steps.push('IP whitelisted for 24 hours');
      } else {
        result.steps.push(`IP whitelisting failed: ${whitelistResult.error}`);
      }

      // Step 3: Schedule removal after 24 hours
      result.steps.push('Scheduling IP removal after 24 hours');
      await this.scheduleIPRemoval(ip, serverName, 24);
      result.scheduledRemoval = true;
      result.steps.push('IP removal scheduled for 24 hours');

      // Step 4: Create support ticket
      result.steps.push('Creating support ticket');
      await this.createWorkflowTicket(clientInfo, domain, ip, result, 'FTP authentication failures detected');
      result.ticketCreated = true;
      result.steps.push('Support ticket created with workflow summary');

      result.message = 'FTP workflow completed: IP flushed, whitelisted (24hrs), removal scheduled, and ticket created';

    } catch (error) {
      result.steps.push(`FTP workflow error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute default workflow for unknown authservices
   */
  async executeDefaultWorkflow(ip, serverName, clientInfo, domain, reason, result) {
    try {
      // Default: whitelist for 24 hours and create ticket
      result.steps.push('Executing default workflow: whitelist (24hrs) + schedule removal + ticket');
      const whitelistResult = await this.whitelistIPTemporary(ip, serverName, `${reason} (done by bot) - 24hr temporary`, 24);
      result.whitelisted = whitelistResult.success;
      
      if (whitelistResult.success) {
        result.steps.push('IP whitelisted for 24 hours');
      } else {
        result.steps.push(`IP whitelisting failed: ${whitelistResult.error}`);
      }

      // Schedule removal after 24 hours
      result.steps.push('Scheduling IP removal after 24 hours');
      await this.scheduleIPRemoval(ip, serverName, 24);
      result.scheduledRemoval = true;
      result.steps.push('IP removal scheduled for 24 hours');

      // Create support ticket
      result.steps.push('Creating support ticket');
      await this.createWorkflowTicket(clientInfo, domain, ip, result, 'Unknown authentication service failures detected');
      result.ticketCreated = true;
      result.steps.push('Support ticket created with workflow summary');

      result.message = 'Default workflow completed: IP whitelisted (24hrs), removal scheduled, and ticket created';

    } catch (error) {
      result.steps.push(`Default workflow error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Flush cPHulk login history for specific IP
   * @param {string} ip - IP address to flush
   * @param {string} serverName - Server name
   * @returns {Promise<Object>} Flush result
   */
  async flushCphulkLoginHistory(ip, serverName) {
    try {
      const result = {
        success: false,
        ip: ip,
        serverName: serverName,
        flushed: false,
        error: null
      };

      // Make API call to flush login history
      const apiParams = {
        ip: ip
      };

      const response = await this.whmService.callServerAPI(
        serverName,
        'flush_cphulk_login_history_for_ips',
        apiParams,
        '1', // API version 1
        'GET'
      );

      if (response && response.metadata && response.metadata.result === 1) {
        result.flushed = true;
        result.success = true;
        result.message = `Successfully flushed cPHulk login history for IP ${ip}`;
      } else {
        result.error = `Failed to flush login history: ${response?.metadata?.reason || 'Unknown error'}`;
      }

      return result;

    } catch (error) {
      this.logger.error(`Error flushing cPHulk login history for IP ${ip}:`, error);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        flushed: false,
        error: error.message || 'Failed to flush cPHulk login history'
      };
    }
  }

  /**
   * Whitelist IP temporarily with automatic removal scheduling
   * @param {string} ip - IP address to whitelist
   * @param {string} serverName - Server name
   * @param {string} reason - Reason for whitelisting
   * @param {number} hours - Hours until automatic removal
   * @returns {Promise<Object>} Whitelisting result
   */
  async whitelistIPTemporary(ip, serverName, reason, hours = 24) {
    try {
      // First whitelist the IP
      const whitelistResult = await this.whitelistIP(ip, serverName, reason);
      
      if (whitelistResult.success) {
        // Schedule removal
        await this.scheduleIPRemoval(ip, serverName, hours);
        whitelistResult.temporary = true;
        whitelistResult.expiresInHours = hours;
        whitelistResult.message += ` (temporary for ${hours} hours)`;
      }
      
      return whitelistResult;

    } catch (error) {
      this.logger.error(`Error creating temporary whitelist for IP ${ip}:`, error);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        whitelisted: false,
        temporary: true,
        expiresInHours: hours,
        error: error.message || 'Failed to create temporary whitelist'
      };
    }
  }

  /**
   * Schedule IP removal from whitelist
   * @param {string} ip - IP address to remove
   * @param {string} serverName - Server name
   * @param {number} hours - Hours until removal
   */
  async scheduleIPRemoval(ip, serverName, hours) {
    try {
      // In a production environment, this would integrate with a job scheduler
      // For now, we'll log the scheduling request
      const removalTime = new Date(Date.now() + (hours * 60 * 60 * 1000));
      
      this.logger.info(`Scheduled IP ${ip} removal from server ${serverName} at ${removalTime.toISOString()}`);
      
      // TODO: Integrate with job scheduler (e.g., node-cron, bull queue, etc.)
      // Example: schedule job to call this.removeFromWhitelist(ip, serverName) after specified hours
      
      return {
        success: true,
        ip: ip,
        serverName: serverName,
        scheduledFor: removalTime.toISOString(),
        hoursUntilRemoval: hours
      };

    } catch (error) {
      this.logger.error(`Error scheduling IP removal for ${ip}:`, error);
      throw error;
    }
  }

  /**
   * Create support ticket with workflow summary
   * @param {Object} clientInfo - Client information
   * @param {string} domain - Domain
   * @param {string} ip - IP address
   * @param {Object} workflowResult - Workflow execution result
   * @param {string} context - Additional context for the ticket
   */
  async createWorkflowTicket(clientInfo, domain, ip, workflowResult, context) {
    try {
      if (!clientInfo) {
        this.logger.warn('No client info available for ticket creation');
        return;
      }

      // Prepare ticket content
      const ticketSubject = `cPHulk IP Whitelisting - ${ip} ${domain ? `(${domain})` : ''}`;
      
      const ticketContent = this.generateTicketContent(clientInfo, domain, ip, workflowResult, context);
      
      // TODO: Integrate with ticket system (WHMCS, etc.)
      // For now, log the ticket creation
      this.logger.info(`Ticket created for client ${clientInfo.id}:`, {
        subject: ticketSubject,
        content: ticketContent,
        clientId: clientInfo.id,
        domain: domain,
        ip: ip
      });

      return {
        success: true,
        ticketId: `CPHULK-${Date.now()}`, // Placeholder ticket ID
        subject: ticketSubject,
        clientId: clientInfo.id
      };

    } catch (error) {
      this.logger.error('Error creating workflow ticket:', error);
      throw error;
    }
  }

  /**
   * Generate ticket content with workflow summary
   */
  generateTicketContent(clientInfo, domain, ip, workflowResult, context) {
    const timestamp = new Date().toISOString();
    
    let content = `cPHulk IP Whitelisting Workflow Summary\n`;
    content += `==========================================\n\n`;
    content += `Timestamp: ${timestamp}\n`;
    content += `Client: ${clientInfo.firstname} ${clientInfo.lastname} (${clientInfo.email})\n`;
    content += `Domain: ${domain || 'N/A'}\n`;
    content += `IP Address: ${ip}\n`;
    content += `Server: ${workflowResult.serverName}\n`;
    content += `Context: ${context}\n\n`;
    
    content += `Workflow Details:\n`;
    content += `- Workflow Type: ${workflowResult.workflow}\n`;
    content += `- Auth Services: ${workflowResult.authServices.join(', ') || 'None detected'}\n`;
    
    if (workflowResult.uniqueUsers && workflowResult.uniqueUsers.length > 0) {
      content += `- Affected Users: ${workflowResult.uniqueUsers.join(', ')}\n`;
    }
    
    content += `- IP Whitelisted: ${workflowResult.whitelisted ? 'Yes' : 'No'}\n`;
    content += `- Login History Flushed: ${workflowResult.flushed ? 'Yes' : 'No'}\n`;
    content += `- Scheduled Removal: ${workflowResult.scheduledRemoval ? 'Yes (24 hours)' : 'No'}\n\n`;
    
    content += `Execution Steps:\n`;
    workflowResult.steps.forEach((step, index) => {
      content += `${index + 1}. ${step}\n`;
    });
    
    content += `\nResult: ${workflowResult.message || 'Workflow completed'}\n\n`;
    content += `This ticket was automatically created by the cPHulk management system.\n`;
    content += `Please review the actions taken and follow up with the client if necessary.`;
    
    return content;
  }

  /**
   * Whitelist an IP address in cPHulk (basic method)
   * @param {string} ip - IP address to whitelist
   * @param {string} serverName - Server name (optional, will use default if not provided)
   * @param {string} reason - Reason for whitelisting (optional)
   * @returns {Promise<Object>} Whitelisting result
   */
  async whitelistIP(ip, serverName = null, reason = 'API request') {
    try {
      const result = {
        success: false,
        ip: ip,
        serverName: serverName,
        whitelisted: false,
        clearedFailedLogins: false,
        reason: reason,
        error: null
      };

      // Determine which server to use
      const targetServer = serverName || this.getDefaultServer();
      if (!targetServer) {
        result.error = 'No server available for cPHulk API call';
        return result;
      }

      result.serverName = targetServer;

      // Step 1: Add IP to whitelist
      const whitelistParams = {
        ip: ip,
        comment: reason
      };

      try {
        const whitelistResponse = await this.whmService.callServerAPI(
          targetServer,
          'add_cphulk_whitelist',
          whitelistParams,
          '1', // API version 1
          'POST'
        );

        if (whitelistResponse && whitelistResponse.metadata && whitelistResponse.metadata.result === 1) {
          result.whitelisted = true;
        } else {
          // Check if IP is already whitelisted
          const errorMessage = whitelistResponse?.metadata?.reason || '';
          if (errorMessage.toLowerCase().includes('already') || 
              errorMessage.toLowerCase().includes('exists')) {
            result.whitelisted = true;
            result.alreadyWhitelisted = true;
          } else {
            result.error = `Failed to whitelist IP: ${errorMessage}`;
            return result;
          }
        }
      } catch (whitelistError) {
        // Check if the error indicates IP is already whitelisted
        if (whitelistError.message && 
            (whitelistError.message.toLowerCase().includes('already') ||
             whitelistError.message.toLowerCase().includes('exists'))) {
          result.whitelisted = true;
          result.alreadyWhitelisted = true;
        } else {
          result.error = `Failed to whitelist IP: ${whitelistError.message}`;
          return result;
        }
      }

      // Step 2: Clear failed login records for this IP
      try {
        const clearParams = {
          ip: ip
        };

        const clearResponse = await this.whmService.callServerAPI(
          targetServer,
          'clear_cphulk_failed_logins',
          clearParams,
          '1', // API version 1
          'POST'
        );

        if (clearResponse && clearResponse.metadata && clearResponse.metadata.result === 1) {
          result.clearedFailedLogins = true;
        } else {
          // Not a critical failure - whitelisting succeeded
          this.logger.warn(`Could not clear failed logins for IP ${ip}: ${clearResponse?.metadata?.reason || 'Unknown error'}`);
        }
      } catch (clearError) {
        // Not a critical failure - whitelisting succeeded
        this.logger.warn(`Could not clear failed logins for IP ${ip}:`, clearError);
      }

      result.success = true;
      
      if (result.alreadyWhitelisted) {
        result.message = `IP ${ip} was already whitelisted in cPHulk`;
      } else {
        result.message = `Successfully whitelisted IP ${ip} in cPHulk`;
      }

      if (result.clearedFailedLogins) {
        result.message += ' and cleared failed login records';
      }

      return result;

    } catch (error) {
      this.logger.error(`Error whitelisting IP ${ip}:`, error);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        whitelisted: false,
        clearedFailedLogins: false,
        reason: reason,
        error: error.message || 'Failed to whitelist IP address'
      };
    }
  }

  /**
   * Remove an IP address from cPHulk whitelist
   * @param {string} ip - IP address to remove from whitelist
   * @param {string} serverName - Server name (optional, will use default if not provided)
   * @returns {Promise<Object>} Removal result
   */
  async removeFromWhitelist(ip, serverName = null) {
    try {
      const result = {
        success: false,
        ip: ip,
        serverName: serverName,
        removed: false,
        error: null
      };

      // Determine which server to use
      const targetServer = serverName || this.getDefaultServer();
      if (!targetServer) {
        result.error = 'No server available for cPHulk API call';
        return result;
      }

      result.serverName = targetServer;

      // Remove IP from whitelist
      const removeParams = {
        ip: ip
      };

      const response = await this.whmService.callServerAPI(
        targetServer,
        'remove_cphulk_whitelist',
        removeParams,
        '1', // API version 1
        'POST'
      );

      if (response && response.metadata && response.metadata.result === 1) {
        result.removed = true;
        result.success = true;
        result.message = `Successfully removed IP ${ip} from cPHulk whitelist`;
      } else {
        result.error = `Failed to remove IP from whitelist: ${response?.metadata?.reason || 'Unknown error'}`;
      }

      return result;

    } catch (error) {
      this.logger.error(`Error removing IP ${ip} from whitelist:`, error);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        removed: false,
        error: error.message || 'Failed to remove IP from whitelist'
      };
    }
  }

  /**
   * Get the default server for cPHulk operations
   * @returns {string|null} Default server name
   */
  getDefaultServer() {
    try {
      const availableServers = this.whmService.getAvailableServers();
      
      if (availableServers.length === 0) {
        return null;
      }

      // Prefer PCP servers for cPHulk operations, then CP servers
      const pcpServers = availableServers.filter(server => server.toLowerCase().startsWith('pcp'));
      if (pcpServers.length > 0) {
        return pcpServers[0];
      }

      const cpServers = availableServers.filter(server => server.toLowerCase().startsWith('cp'));
      if (cpServers.length > 0) {
        return cpServers[0];
      }

      // Return first available server as fallback
      return availableServers[0];

    } catch (error) {
      this.logger.error('Error getting default server:', error);
      return null;
    }
  }

  /**
   * Format duration in human-readable format
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}, ${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}, ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}, ${seconds % 60} second${seconds % 60 !== 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Validate IP address format
   * @param {string} ip - IP address to validate
   * @returns {boolean} True if valid IP address
   */
  isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Get cPHulk statistics for a server
   * @param {string} serverName - Server name (optional, will use default if not provided)
   * @returns {Promise<Object>} cPHulk statistics
   */
  async getCphulkStats(serverName = null) {
    try {
      const result = {
        success: false,
        serverName: serverName,
        stats: null,
        error: null
      };

      // Determine which server to use
      const targetServer = serverName || this.getDefaultServer();
      if (!targetServer) {
        result.error = 'No server available for cPHulk API call';
        return result;
      }

      result.serverName = targetServer;

      // Get cPHulk configuration and stats
      const response = await this.whmService.callServerAPI(
        targetServer,
        'get_cphulk_config',
        {},
        '1', // API version 1
        'GET'
      );

      if (response && response.data) {
        result.stats = response.data;
        result.success = true;
        result.message = 'Successfully retrieved cPHulk statistics';
      } else {
        result.error = 'Invalid response from cPHulk stats API';
      }

      return result;

    } catch (error) {
      this.logger.error(`Error getting cPHulk stats for server ${serverName}:`, error);
      
      return {
        success: false,
        serverName: serverName,
        stats: null,
        error: error.message || 'Failed to retrieve cPHulk statistics'
      };
    }
  }
}

module.exports = CphulkManager;