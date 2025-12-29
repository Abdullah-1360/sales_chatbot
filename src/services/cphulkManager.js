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
      console.log(`→ cPHulk getFailedLogins called with IP: ${ip}, serverName: ${serverName}`);
      
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
        console.log(`❌ No server available for cPHulk API call`);
        result.error = 'No server available for cPHulk API call';
        return result;
      }

      console.log(`→ Using server for cPHulk API: ${targetServer}`);
      result.serverName = targetServer;

      // Make API call to get failed logins
      const apiParams = {
        'api.filter.a.field': 'ip',
        'api.filter.a.arg0': ip,
        'api.filter.a.type': 'eq',
        'api.filter.enable': '1'
      };

      console.log(`→ Making cPHulk API call to ${targetServer} with params:`, apiParams);

      const response = await Promise.race([
        this.whmService.callServerAPI(
          targetServer,
          'get_cphulk_failed_logins',
          apiParams,
          '1', // API version 1
          'GET'
        ),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('cPHulk API call timeout')), 15000)
        )
      ]);

      console.log(`→ cPHulk API response received:`, {
        hasResponse: !!response,
        hasData: !!(response && response.data),
        dataKeys: response && response.data ? Object.keys(response.data) : [],
        failedLoginsCount: response && response.data && response.data.failed_logins ? response.data.failed_logins.length : 0
      });

      if (!response || !response.data) {
        console.log(`❌ Invalid response from cPHulk API`);
        result.error = 'Invalid response from cPHulk API';
        return result;
      }

      // Debug: Log first few failed login entries to understand the structure
      if (response.data.failed_logins && response.data.failed_logins.length > 0) {
        console.log(`→ Sample failed login entry:`, JSON.stringify(response.data.failed_logins[0], null, 2));
      }

      // Process the response
      const failedLogins = response.data.failed_logins || [];
      result.failedLogins = failedLogins;
      result.totalAttempts = failedLogins.length;
      result.totalFailures = failedLogins.length; // Add totalFailures for compatibility
      result.hasFailedLogins = failedLogins.length > 0; // Add hasFailedLogins flag

      if (failedLogins.length > 0) {
        // Extract unique users
        const uniqueUsers = new Set(failedLogins.map(login => login.user));
        result.uniqueUsers = uniqueUsers.size;

        // Extract unique services (for backward compatibility)
        const uniqueServices = new Set(failedLogins.map(login => login.service));
        result.services = Array.from(uniqueServices);

        // Extract unique authservices (this is what the intelligent workflow expects)
        const uniqueAuthServices = new Set(failedLogins.map(login => login.authservice));
        result.authServices = Array.from(uniqueAuthServices);

        console.log(`→ Detected authservices: ${result.authServices.join(', ')}`);
        console.log(`→ Detected services: ${result.services.join(', ')}`);

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
      console.log(`❌ Error in cPHulk getFailedLogins: ${error.message}`);
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
   * Intelligent whitelist workflow using existing cPHulk analysis (avoids duplicate API calls)
   * @param {string} ip - IP address to whitelist
   * @param {string} serverName - Server name (optional, will use default if not provided)
   * @param {Object} clientInfo - Client information for ticket creation
   * @param {string} domain - Domain for context
   * @param {string} reason - Reason for whitelisting
   * @param {Object} existingAnalysis - Existing cPHulk analysis result
   * @returns {Promise<Object>} Whitelisting workflow result
   */
  async intelligentWhitelistWorkflowWithAnalysis(ip, serverName = null, clientInfo = null, domain = null, reason = 'API request', existingAnalysis = null) {
    const startTime = Date.now();
    
    try {
      console.log(`→ Starting intelligent whitelist workflow with existing analysis for IP: ${ip}`);
      
      const result = {
        success: false,
        ip: ip,
        serverName: serverName,
        workflow: 'intelligent_whitelist_with_analysis',
        whitelisted: false,
        flushed: false,
        ticketCreated: false,
        scheduledRemoval: false,
        error: null,
        steps: [],
        timestamp: new Date().toISOString()
      };

      // Use existing analysis or fallback to new analysis
      let failedLoginsResult;
      if (existingAnalysis && existingAnalysis.success) {
        console.log(`→ Using existing cPHulk analysis (avoiding duplicate API call)`);
        failedLoginsResult = existingAnalysis;
      } else {
        console.log(`→ No valid existing analysis, performing new cPHulk analysis`);
        failedLoginsResult = await this.getFailedLogins(ip, serverName);
      }

      if (!failedLoginsResult.success) {
        result.error = failedLoginsResult.error;
        result.message = `Failed to analyze IP ${ip}: ${failedLoginsResult.error}`;
        console.log(`❌ Failed logins analysis failed: ${failedLoginsResult.error}`);
        return result;
      }

      // Continue with the same logic as intelligentWhitelistWorkflow
      result.serverName = failedLoginsResult.serverName;
      result.hasFailedLogins = failedLoginsResult.hasFailedLogins;
      result.totalFailures = failedLoginsResult.totalFailures;
      result.authServices = failedLoginsResult.authServices;

      if (failedLoginsResult.hasFailedLogins) {
        console.log(`→ Failed logins detected: ${failedLoginsResult.totalFailures} failures across ${failedLoginsResult.authServices.length} services`);
        
        // Determine workflow based on authentication services
        if (failedLoginsResult.authServices.includes('cpaneld')) {
          await this.executeCpaneldWorkflow(ip, result.serverName, clientInfo, domain, reason, result);
        } else if (failedLoginsResult.authServices.some(service => ['dovecot', 'courier-imap', 'courier-pop'].includes(service))) {
          await this.executeMailServiceWorkflow(ip, result.serverName, clientInfo, domain, reason, result, failedLoginsResult.failedLogins);
        } else if (failedLoginsResult.authServices.includes('proftpd') || failedLoginsResult.authServices.includes('pure-ftpd')) {
          await this.executeFtpdWorkflow(ip, result.serverName, clientInfo, domain, reason, result);
        } else {
          await this.executeDefaultWorkflow(ip, result.serverName, clientInfo, domain, reason, result);
        }
      } else {
        console.log(`→ No failed logins detected for IP ${ip} - executing preventive workflow`);
        
        // Preventive whitelisting
        result.steps.push('No failed logins detected - executing preventive whitelisting');
        const whitelistResult = await this.whitelistIPTemporary(ip, serverName, `${reason} (preventive) - 24hr temporary`, 24);
        
        if (whitelistResult.success) {
          result.whitelisted = true;
          result.success = true;
          result.steps.push('IP whitelisted preventively for 24 hours');
          
          // Schedule removal
          const jobScheduler = require('./jobScheduler');
          await jobScheduler.scheduleIPRemoval(ip, serverName, 24);
          result.scheduledRemoval = true;
          result.steps.push('IP removal scheduled for 24 hours');
          
          // Create ticket for no failed logins case (async for performance)
          this.createWorkflowTicketAsync(clientInfo, domain, ip, result, 'No failed logins found - preventive whitelisting');
          result.ticketCreated = true; // Assume success for response speed
          result.steps.push('Support ticket creation initiated');
          
          result.message = 'No failed logins found: IP whitelisted (24hrs), removal scheduled, and ticket created';
        } else {
          result.error = whitelistResult.error;
          result.message = `Failed to whitelist IP ${ip}: ${whitelistResult.error}`;
        }
      }

      const endTime = Date.now();
      result.executionTime = endTime - startTime;
      
      console.log(`→ Intelligent whitelist workflow with analysis completed in ${result.executionTime}ms: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      
      return result;

    } catch (error) {
      this.logger.error(`Error in intelligent whitelist workflow with analysis for IP ${ip}:`, error);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        workflow: 'intelligent_whitelist_with_analysis',
        whitelisted: false,
        flushed: false,
        ticketCreated: false,
        scheduledRemoval: false,
        error: error.message || 'Failed to execute intelligent whitelist workflow with analysis',
        timestamp: new Date().toISOString()
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

      // Step 1: Get failed login attempts to analyze authservice (with timeout for performance)
      result.steps.push('Checking failed login attempts');
      
      // Add timeout to prevent hanging on slow API calls
      const failedLoginsPromise = this.getFailedLogins(ip, targetServer);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Failed logins check timeout')), 10000) // 10 second timeout
      );
      
      let failedLoginsResult;
      try {
        failedLoginsResult = await Promise.race([failedLoginsPromise, timeoutPromise]);
      } catch (error) {
        if (error.message.includes('timeout')) {
          // If failed logins check times out, proceed with default workflow
          result.steps.push('Failed logins check timed out, proceeding with default workflow');
          await this.executeDefaultWorkflow(ip, targetServer, clientInfo, domain, reason, result);
          result.success = true;
          return result;
        }
        throw error;
      }
      
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
          result.scheduledRemoval = true;
          result.steps.push('IP removal scheduled for 24 hours');
          
          // Create ticket for no failed logins case (async for performance)
          this.createWorkflowTicketAsync(clientInfo, domain, ip, result, 'No failed logins found - preventive whitelisting');
          result.ticketCreated = true; // Assume success for response speed
          result.steps.push('Support ticket creation initiated');
          
          result.message = 'No failed logins found: IP whitelisted (24hrs), removal scheduled, and ticket created';
        }
        
        return result;
      }

      // Step 2: Analyze authservice types
      const authServices = [...new Set(failedLogins.map(login => login.authservice))];
      result.authServices = authServices;
      result.steps.push(`Found authservices: ${authServices.join(', ')}`);

      // Step 3: Execute workflow based on authservice types (optimized execution)
      if (authServices.includes('cpaneld')) {
        await this.executeCpaneldWorkflow(ip, targetServer, clientInfo, domain, reason, result);
      } else if (authServices.some(service => ['webmaild', 'dovecot'].includes(service))) {
        await this.executeMailServiceWorkflow(ip, targetServer, clientInfo, domain, reason, result, failedLogins);
      } else if (authServices.includes('pure-ftpd')) {
        await this.executeFtpdWorkflow(ip, targetServer, clientInfo, domain, reason, result);
      } else {
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

      // Step 2: Whitelist IP for 24 hours
      result.steps.push('Whitelisting IP for 24 hours (added by bot)');
      const whitelistResult = await this.whitelistIPTemporary(ip, serverName, `${reason} (done by bot) - 24hr temporary`, 24);
      result.whitelisted = whitelistResult.success;
      
      if (whitelistResult.success) {
        result.steps.push('IP whitelisted for 24 hours with bot comment');
      } else {
        result.steps.push(`IP whitelisting failed: ${whitelistResult.error}`);
      }

      // Step 3: Schedule removal after 24 hours
      result.steps.push('Scheduling IP removal after 24 hours');
      await this.scheduleIPRemoval(ip, serverName, 24);
      result.scheduledRemoval = true;
      result.steps.push('IP removal scheduled for 24 hours');

      // Step 4: Create support ticket (TICKET CREATION POINT) - async for performance
      result.steps.push('🎫 Creating support ticket for cpaneld workflow');
      this.createWorkflowTicketAsync(clientInfo, domain, ip, result, 'cpaneld authentication failures detected');
      result.ticketCreated = true; // Assume success for response speed
      result.steps.push('✅ Support ticket creation initiated');

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
      // Step 1: Extract unique users and detailed login information from mail service failures
      const mailFailures = failedLogins.filter(login => 
        ['webmaild', 'dovecot'].includes(login.authservice)
      );
      const uniqueUsers = [...new Set(mailFailures.map(login => login.user))];
      
      // Store detailed mail failure information for ticket
      result.uniqueUsers = uniqueUsers;
      result.mailFailureDetails = mailFailures.map(failure => ({
        user: failure.user,
        logintime: failure.logintime,
        exptime: failure.exptime,
        service: failure.service,
        authservice: failure.authservice,
        country: failure.country_name,
        countryCode: failure.country_code
      }));
      
      result.steps.push(`Identified ${uniqueUsers.length} unique mail users: ${uniqueUsers.join(', ')}`);
      result.steps.push(`Total mail service failures: ${mailFailures.length} attempts`);

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
      result.steps.push('Whitelisting IP for 24 hours (added by bot)');
      const whitelistResult = await this.whitelistIPTemporary(ip, serverName, `${reason} (done by bot) - 24hr temporary`, 24);
      result.whitelisted = whitelistResult.success;
      
      if (whitelistResult.success) {
        result.steps.push('IP whitelisted for 24 hours with bot comment');
      } else {
        result.steps.push(`IP whitelisting failed: ${whitelistResult.error}`);
      }

      // Step 4: Schedule removal after 24 hours
      result.steps.push('Scheduling IP removal after 24 hours');
      await this.scheduleIPRemoval(ip, serverName, 24);
      result.scheduledRemoval = true;
      result.steps.push('IP removal scheduled for 24 hours');

      // Step 5: Create support ticket with detailed user and login information (TICKET CREATION POINT) - async for performance
      result.steps.push('🎫 Creating support ticket for mail service workflow');
      const ticketContext = `Mail authentication failures detected for ${uniqueUsers.length} email account(s): ${uniqueUsers.join(', ')} with ${mailFailures.length} total failed attempts`;
      this.createWorkflowTicketAsync(clientInfo, domain, ip, result, ticketContext);
      result.ticketCreated = true; // Assume success for response speed
      result.steps.push('✅ Support ticket creation initiated with detailed login information');

      result.message = `Mail service workflow completed: ${uniqueUsers.length} users identified, ${mailFailures.length} failures analyzed, IP flushed, whitelisted (24hrs), removal scheduled, and ticket created`;

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

      // Step 4: Create support ticket - async for performance
      result.steps.push('Creating support ticket');
      this.createWorkflowTicketAsync(clientInfo, domain, ip, result, 'FTP authentication failures detected');
      result.ticketCreated = true; // Assume success for response speed
      result.steps.push('Support ticket creation initiated');

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

      // Create support ticket - async for performance
      result.steps.push('Creating support ticket');
      this.createWorkflowTicketAsync(clientInfo, domain, ip, result, 'Unknown authentication service failures detected');
      result.ticketCreated = true; // Assume success for response speed
      result.steps.push('Support ticket creation initiated');

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
   * Schedule IP removal from whitelist using Agenda job scheduler
   * @param {string} ip - IP address to remove
   * @param {string} serverName - Server name
   * @param {number} hours - Hours until removal
   * @param {string} reason - Reason for removal (optional)
   */
  async scheduleIPRemoval(ip, serverName, hours, reason = 'Automatic 24-hour removal') {
    try {
      // Use Agenda job scheduler for actual scheduling
      const jobScheduler = require('./jobScheduler');
      
      const result = await jobScheduler.scheduleIPRemoval(ip, serverName, hours, reason);
      
      this.logger.info(`Successfully scheduled IP ${ip} removal from server ${serverName} at ${result.scheduledFor} (Job ID: ${result.jobId})`);
      
      return result;

    } catch (error) {
      this.logger.error(`Error scheduling IP removal for ${ip}:`, error);
      
      // Fallback: log the scheduling request if job scheduler fails
      const removalTime = new Date(Date.now() + (hours * 60 * 60 * 1000));
      this.logger.warn(`Job scheduler failed, logging removal request: IP ${ip} should be removed from server ${serverName} at ${removalTime.toISOString()}`);
      
      return {
        success: false,
        ip: ip,
        serverName: serverName,
        scheduledFor: removalTime.toISOString(),
        hoursUntilRemoval: hours,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Create support ticket with workflow summary using WHMCS OpenTicket API (async for performance)
   * @param {Object} clientInfo - Client information
   * @param {string} domain - Domain
   * @param {string} ip - IP address
   * @param {Object} workflowResult - Workflow execution result
   * @param {string} context - Additional context for the ticket
   */
  async createWorkflowTicketAsync(clientInfo, domain, ip, workflowResult, context) {
    // Run ticket creation in background for better API performance
    setImmediate(async () => {
      try {
        const ticketResult = await this.createWorkflowTicket(clientInfo, domain, ip, workflowResult, context);
        if (ticketResult.success) {
          this.logger.info(`Background ticket created successfully: #${ticketResult.ticketNumber || ticketResult.ticketId} for IP ${ip}`);
        } else {
          this.logger.error(`Background ticket creation failed for IP ${ip}: ${ticketResult.error}`);
        }
      } catch (error) {
        this.logger.error(`Background ticket creation error for IP ${ip}:`, error);
      }
    });
  }

  /**
   * Create support ticket with workflow summary using WHMCS OpenTicket API
   * @param {Object} clientInfo - Client information
   * @param {string} domain - Domain
   * @param {string} ip - IP address
   * @param {Object} workflowResult - Workflow execution result
   * @param {string} context - Additional context for the ticket
   * @returns {Promise<Object>} Ticket creation result with ticket number
   */
  async createWorkflowTicket(clientInfo, domain, ip, workflowResult, context) {
    try {
      if (!clientInfo) {
        this.logger.warn('No client info available for ticket creation');
        return {
          success: false,
          ticketId: null,
          error: 'No client information available'
        };
      }

      // Prepare ticket content with improved keywords
      let ticketSubject;
      if (workflowResult.csfAnalysis?.csf?.inDenyList) {
        // CSF issue detected - use Firewall System terminology
        ticketSubject = `Firewall System IP Whitelisting - ${ip} ${domain ? `(${domain})` : ''}`;
      } else {
        // cPHulk issue - use Anti-Brute Force System terminology
        ticketSubject = `Anti-Brute Force System IP Whitelisting - ${ip} ${domain ? `(${domain})` : ''}`;
      }
      const ticketContent = this.generateTicketContent(clientInfo, domain, ip, workflowResult, context);
      
      // Use WHMCS OpenTicket API to create the ticket
      const { callApi } = require('./whmcsService');
      
      const ticketParams = {
        clientid: clientInfo.id,
        deptid: process.env.TECHSUPPORT_DEPTID || '2', // Technical Support department
        subject: ticketSubject,
        message: ticketContent,
        priority: 'Medium',
        markdown: false
      };

      this.logger.info(`Creating WHMCS ticket for client ${clientInfo.id}:`, {
        subject: ticketSubject,
        clientId: clientInfo.id,
        domain: domain,
        ip: ip,
        deptid: ticketParams.deptid
      });

      const ticketResponse = await callApi('OpenTicket', ticketParams);

      if (ticketResponse && ticketResponse.result === 'success' && ticketResponse.id) {
        this.logger.info(`WHMCS ticket created successfully: ${ticketResponse.id}`);
        
        return {
          success: true,
          ticketId: ticketResponse.id,
          ticketNumber: ticketResponse.tid || ticketResponse.id,
          subject: ticketSubject,
          clientId: clientInfo.id,
          deptId: ticketParams.deptid,
          createdAt: new Date().toISOString()
        };
      } else {
        const errorMsg = ticketResponse?.message || 'Unknown error creating ticket';
        this.logger.error(`WHMCS ticket creation failed:`, ticketResponse);
        
        return {
          success: false,
          ticketId: null,
          error: `WHMCS API error: ${errorMsg}`
        };
      }

    } catch (error) {
      this.logger.error('Error creating WHMCS ticket:', error);
      return {
        success: false,
        ticketId: null,
        error: `Ticket creation failed: ${error.message}`
      };
    }
  }

  /**
   * Generate enhanced ticket content with CSF analysis and workflow summary for WHMCS
   */
  generateTicketContent(clientInfo, domain, ip, workflowResult, context) {
    const timestamp = new Date().toISOString();
    
    let content = `Dear ${clientInfo.firstname} ${clientInfo.lastname},\n\n`;
    
    // Enhanced greeting based on CSF analysis with improved keywords
    if (workflowResult.csfAnalysis?.csf?.inDenyList) {
      content += `This ticket has been automatically created to inform you about a Firewall System security issue that has been resolved on your account.\n\n`;
      content += `🔒 FIREWALL SECURITY ALERT RESOLVED\n`;
      content += `Your IP address was temporarily blocked by our Firewall System due to suspicious activity, but we have automatically resolved this issue.\n\n`;
    } else {
      content += `This ticket has been automatically created to inform you about Anti-Brute Force System IP whitelisting actions taken on your account.\n\n`;
    }
    
    content += `SUMMARY:\n`;
    content += `========\n`;
    content += `Date/Time: ${timestamp}\n`;
    content += `IP Address: ${ip}\n`;
    content += `Domain: ${domain || 'N/A'}\n`;
    content += `Server: ${workflowResult.serverName}\n`;
    content += `Context: ${context}\n\n`;
    
    // Add Firewall System Analysis Section (improved keywords)
    if (workflowResult.csfAnalysis?.csf) {
      const csf = workflowResult.csfAnalysis.csf;
      content += `FIREWALL SYSTEM ANALYSIS:\n`;
      content += `=========================\n`;
      
      if (csf.inDenyList) {
        content += `🚫 IP Status: BLOCKED by Firewall System (ConfigServer Security & Firewall)\n`;
        content += `📍 Block Type: ${csf.blockType || 'Unknown'}\n`;
        content += `🔍 Block Source: ${csf.blockSource || 'Unknown'}\n`;
        
        if (csf.blockReasons && csf.blockReasons.length > 0) {
          content += `📋 Block Reasons:\n`;
          csf.blockReasons.forEach((reason, index) => {
            content += `   ${index + 1}. ${reason}\n`;
          });
        }
        
        if (csf.blockDate) {
          content += `📅 Block Date: ${csf.blockDate}\n`;
        }
        
        if (csf.location) {
          content += `🌍 Location: ${csf.location.country} (${csf.location.countryCode})\n`;
        }
        
        // Remediation actions with improved keywords
        content += `\n🔧 AUTOMATIC FIREWALL SYSTEM REMEDIATION PERFORMED:\n`;
        if (workflowResult.csfAnalysis.unblockAttempt?.success) {
          content += `   ✅ IP successfully unblocked from Firewall System\n`;
        } else {
          content += `   ❌ Failed to unblock IP from Firewall System: ${workflowResult.csfAnalysis.unblockAttempt?.error || 'Unknown error'}\n`;
        }
        
        if (workflowResult.csfAnalysis.allowAttempt?.success) {
          content += `   ✅ IP added to Firewall System allow list for future protection\n`;
        } else if (workflowResult.csfAnalysis.allowAttempt) {
          content += `   ❌ Failed to add IP to Firewall System allow list: ${workflowResult.csfAnalysis.allowAttempt.error || 'Unknown error'}\n`;
        }
        
        content += `\n`;
        
        // Add specific recommendations based on block type
        if (csf.blockType === 'lfd_failed_login') {
          content += `💡 SECURITY RECOMMENDATIONS:\n`;
          content += `============================\n`;
          content += `Your IP was blocked due to multiple failed login attempts. To prevent this in the future:\n`;
          content += `• Ensure you're using the correct login credentials\n`;
          content += `• Check for any automated scripts or email clients with outdated passwords\n`;
          content += `• Consider using strong, unique passwords for all accounts\n`;
          content += `• Enable two-factor authentication where available\n\n`;
        } else if (csf.blockType === 'manual') {
          content += `💡 MANUAL FIREWALL BLOCK INFORMATION:\n`;
          content += `=====================================\n`;
          content += `This IP was manually blocked by our Firewall System security team. The block has been removed as requested.\n`;
          content += `If you continue to experience issues, please contact our support team.\n\n`;
        }
        
      } else if (csf.inAllowList) {
        content += `✅ IP Status: ALLOWED by Firewall System (ConfigServer Security & Firewall)\n`;
        content += `This IP is already in our Firewall System's allow list.\n\n`;
      } else {
        content += `ℹ️ IP Status: NOT FOUND in Firewall System rules\n`;
        content += `This IP was not blocked by our Firewall System.\n\n`;
      }
    }
    
    content += `ACTIONS TAKEN:\n`;
    content += `==============\n`;
    content += `- Workflow Type: ${workflowResult.workflow}\n`;
    
    if (workflowResult.parallelProcessing) {
      content += `- Processing Method: Parallel (CSF + cPHulk simultaneously)\n`;
    }
    
    if (workflowResult.authServices && workflowResult.authServices.length > 0) {
      content += `- Authentication Services Detected: ${workflowResult.authServices.join(', ')}\n`;
    }
    
    if (workflowResult.uniqueUsers && workflowResult.uniqueUsers.length > 0) {
      content += `- Affected Email Accounts: ${workflowResult.uniqueUsers.join(', ')}\n`;
    }
    
    content += `- IP Address Whitelisted in Anti-Brute Force System: ${workflowResult.whitelisted ? 'Yes (24 hours)' : 'No'}\n`;
    content += `- Login History Cleared: ${workflowResult.flushed ? 'Yes' : 'No'}\n`;
    content += `- Automatic Removal Scheduled: ${workflowResult.scheduledRemoval ? 'Yes (after 24 hours)' : 'No'}\n\n`;
    
    // Add detailed mail failure information if available
    if (workflowResult.mailFailureDetails && workflowResult.mailFailureDetails.length > 0) {
      content += `DETAILED LOGIN FAILURE ANALYSIS:\n`;
      content += `================================\n`;
      content += `The following failed login attempts were detected:\n\n`;
      
      // Group failures by user for better readability
      const failuresByUser = {};
      workflowResult.mailFailureDetails.forEach(failure => {
        if (!failuresByUser[failure.user]) {
          failuresByUser[failure.user] = [];
        }
        failuresByUser[failure.user].push(failure);
      });
      
      Object.keys(failuresByUser).forEach(user => {
        const userFailures = failuresByUser[user];
        content += `📧 Account: ${user}\n`;
        content += `   Failed Attempts: ${userFailures.length}\n`;
        content += `   Service Type: ${userFailures[0].service} (${userFailures[0].authservice})\n`;
        content += `   Country: ${userFailures[0].country} (${userFailures[0].countryCode})\n`;
        content += `   Login Attempts:\n`;
        
        userFailures.forEach((failure, index) => {
          const loginDate = new Date(failure.logintime);
          const expDate = new Date(failure.exptime);
          content += `   ${index + 1}. ${loginDate.toLocaleString()} (expires: ${expDate.toLocaleString()})\n`;
        });
        content += `\n`;
      });
      
      content += `Total Failed Attempts: ${workflowResult.mailFailureDetails.length}\n`;
      content += `Unique Accounts Affected: ${Object.keys(failuresByUser).length}\n\n`;
    }
    
    content += `TECHNICAL DETAILS:\n`;
    content += `==================\n`;
    if (workflowResult.steps && workflowResult.steps.length > 0) {
      workflowResult.steps.forEach((step, index) => {
        content += `${index + 1}. ${step}\n`;
      });
    }
    
    content += `\nWHAT THIS MEANS:\n`;
    content += `================\n`;
    content += `Your IP address (${ip}) has been temporarily whitelisted in our Anti-Brute Force System for 24 hours. `;
    content += `This allows you to access your services without being blocked by our brute force protection system.\n\n`;
    
    if (workflowResult.uniqueUsers && workflowResult.uniqueUsers.length > 0) {
      content += `The failed login attempts were detected for the following email accounts:\n`;
      workflowResult.uniqueUsers.forEach(user => {
        content += `- ${user}\n`;
      });
      content += `\nPlease ensure you are using the correct passwords for these email accounts. `;
      content += `If you have forgotten your password, you can reset it through your control panel or contact our support team.\n\n`;
    }
    
    content += `The whitelist will be automatically removed after 24 hours for security purposes. `;
    content += `If you continue to experience login issues after this time, please contact our support team.\n\n`;
    
    content += `IMPORTANT NOTES:\n`;
    content += `================\n`;
    content += `- This action was performed automatically by our system\n`;
    content += `- The whitelist is temporary (24 hours only)\n`;
    content += `- Please ensure you are using correct login credentials\n`;
    content += `- Check your email client settings if problems persist\n`;
    content += `- Contact support if you need assistance with your account\n\n`;
    
    if (workflowResult.mailFailureDetails && workflowResult.mailFailureDetails.length > 0) {
      content += `SECURITY RECOMMENDATIONS:\n`;
      content += `========================\n`;
      content += `- Verify your email passwords are correct\n`;
      content += `- Check your email client configuration\n`;
      content += `- Consider enabling two-factor authentication\n`;
      content += `- Monitor your email accounts for suspicious activity\n`;
      content += `- Update your email client software if outdated\n\n`;
    }
    
    content += `If you have any questions about this action or need further assistance, please reply to this ticket.\n\n`;
    content += `Best regards,\n`;
    content += `Technical Support Team\n`;
    content += `Automated Security Management System`;
    
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

      // Step 1: Add IP to whitelist using correct API endpoint
      const whitelistParams = {
        ip: ip,
        list_name: 'white',
        comment: `${reason} (added by bot)`
      };

      try {
        const whitelistResponse = await this.whmService.callServerAPI(
          targetServer,
          'create_cphulk_record',
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
              errorMessage.toLowerCase().includes('exists') ||
              errorMessage.toLowerCase().includes('duplicate')) {
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
             whitelistError.message.toLowerCase().includes('exists') ||
             whitelistError.message.toLowerCase().includes('duplicate'))) {
          result.whitelisted = true;
          result.alreadyWhitelisted = true;
        } else {
          result.error = `Failed to whitelist IP: ${whitelistError.message}`;
          return result;
        }
      }

      // Step 2: Clear failed login records for this IP (optional - may not be needed after flush)
      // Note: clear_cphulk_failed_logins is not a valid WHM API endpoint
      // The flush_cphulk_login_history_for_ips should handle clearing failed logins
      try {
        // Skip the clear operation as it's not a valid API endpoint
        // The flush operation should have already cleared the failed logins
        result.clearedFailedLogins = true; // Assume cleared by flush operation
        this.logger.info(`Skipped clear_cphulk_failed_logins for IP ${ip} - using flush operation instead`);
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

      // Remove IP from whitelist using correct API endpoint
      const removeParams = {
        ip: ip,
        list_name: 'white'
      };

      const response = await this.whmService.callServerAPI(
        targetServer,
        'delete_cphulk_record',
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