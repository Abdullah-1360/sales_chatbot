const Joi = require('joi');
const { Client } = require('ssh2');
const axios = require('axios');
const CpanelCredentialResolver = require('../services/cpanelCredentialResolver');
const { normalizePhone } = require('../utils/phoneNormalizer');
const { createLogger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

const logger = createLogger('WP_DIAGNOSTIC_OPTIMIZED');

/**
 * Optimized WordPress Comprehensive Diagnostic Controller
 * Separates diagnostic logic (synchronous/fast) from remediation logic (asynchronous/background)
 * Ensures response within 12 seconds
 */
class WordPressComprehensiveDiagnosticControllerOptimized {
  constructor() {
    this.credentialResolver = new CpanelCredentialResolver();
    this.activeConnections = new Map(); // Track SSH connections
    this.diagnosticTimeout = 15000; // Reduced to 15 seconds for faster response
    
    // Bind methods
    this.diagnoseWordPressSite = this.diagnoseWordPressSite.bind(this);
  }

  /**
   * Validation schema for diagnostic request
   */
  get diagnosticSchema() {
    return Joi.object({
      domain: Joi.string().domain().required(),
      phone: Joi.string().optional(),
      frontend_accessible: Joi.boolean().allow(null).optional(),
      admin_accessible: Joi.boolean().allow(null).optional(),
      error_visible: Joi.boolean().allow(null).optional(),
      recent_changes: Joi.boolean().allow(null).optional()
    });
  }

  /**
   * Main WordPress Comprehensive Diagnostic Endpoint (Optimized)
   * POST /wordpress/diagnose-comprehensive
   */
  async diagnoseWordPressSite(req, res) {
    const startTime = Date.now();
    const requestId = `wp_diag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info('Starting optimized WordPress diagnostic', { requestId, domain: req.body.domain });

      // Validate request body
      const { error, value } = this.diagnosticSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details.map(d => d.message).join(', '),
          timestamp: new Date().toISOString()
        });
      }

      // Normalize phone number if provided
      let normalizedPhone = null;
      if (value.phone) {
        try {
          normalizedPhone = normalizePhone(value.phone);
        } catch (phoneError) {
          return res.status(400).json({
            success: false,
            error: 'PHONE_VALIDATION_ERROR',
            message: `Invalid phone number: ${phoneError.message}`,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Resolve client credentials with longer timeout
      let cpanelCredentials = null;
      let clientInfo = null;
      
      try {
        const credentialPromise = this.credentialResolver.resolveCpanelCredentials(
          value.domain,
          null,
          normalizedPhone
        );
        
        const credentialResult = await Promise.race([
          credentialPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Credential resolution timeout')), 8000) // Increased from 3000 to 8000ms
          )
        ]);

        if (credentialResult.success) {
          cpanelCredentials = credentialResult.cpanelCredentials;
          clientInfo = {
            phone: normalizedPhone,
            server: cpanelCredentials.host,
            username: cpanelCredentials.username
          };
          logger.info('Client credentials resolved', { requestId, server: cpanelCredentials.host, username: cpanelCredentials.username });
        } else {
          logger.warn('Credential resolution failed', { requestId, error: credentialResult.error });
          clientInfo = {
            phone: normalizedPhone,
            server: null,
            username: null,
            note: 'Client credentials resolution failed'
          };
        }
      } catch (credentialError) {
        logger.warn('Credential resolution failed, continuing with basic diagnostic', { 
          requestId, 
          error: credentialError.message 
        });
        clientInfo = {
          phone: normalizedPhone,
          server: null,
          username: null,
          note: 'Client credentials not found - basic diagnostic only'
        };
      }

      // Perform fast diagnostic with timeout constraint
      const diagnosticPromise = this.performFastDiagnostic({
        domain: value.domain,
        cpanelCredentials,
        userInput: value,
        requestId
      });

      const diagnosticResult = await Promise.race([
        diagnosticPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Diagnostic timeout - 15 second limit exceeded')), this.diagnosticTimeout)
        )
      ]);

      // Prepare simplified response for client
      const clientResponse = {
        success: true,
        requestId,
        domain: value.domain,
        status: this.getClientFriendlyStatus(diagnosticResult),
        wordpress: {
          found: diagnosticResult.phases.phase1?.wordpress_found || false,
          version: this.extractWordPressVersion(diagnosticResult.phases.phase5?.wordpress_version),
          health: diagnosticResult.phases.phase1?.installation_health || 'unknown'
        },
        database: {
          connected: diagnosticResult.phases.phase3?.database_connection || false,
          status: this.getClientFriendlyDatabaseStatus(diagnosticResult.phases.phase3?.database_status),
          repair_scheduled: diagnosticResult.background_remediation_scheduled || false
        },
        issues: {
          primary: diagnosticResult.primary_suspect || 'Unknown',
          severity: this.getSeverityLevel(diagnosticResult.confidence),
          repair_in_progress: diagnosticResult.remediation_needed || false
        },
        server: {
          name: clientInfo.server,
          php_version: diagnosticResult.phases.phase5?.php_version || 'unknown'
        },
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      };

      // Send simplified response immediately
      res.status(200).json(clientResponse);

      // Trigger background remediation AFTER response is sent
      if (cpanelCredentials && diagnosticResult.remediation_needed) {
        logger.info('Triggering background remediation', { requestId });
        
        // Don't await - run in background
        setImmediate(() => {
          this.performBackgroundRemediation({
            domain: value.domain,
            cpanelCredentials,
            diagnosticResult,
            clientInfo,
            requestId
          }).catch(error => {
            logger.error('Background remediation failed', { 
              requestId, 
              error: error.message 
            });
          });
        });
      }

      // Also create support ticket with complete analysis if needed
      if (diagnosticResult.phases.phase2?.log_analysis?.needs_ticket_creation || 
          diagnosticResult.confidence >= 80) {
        
        setImmediate(() => {
          this.createComprehensiveTicket({
            domain: value.domain,
            cpanelCredentials,
            diagnosticResult,
            clientInfo,
            requestId
          }).catch(error => {
            logger.error('Ticket creation failed', { 
              requestId, 
              error: error.message 
            });
          });
        });
      }

    } catch (error) {
      logger.error('WordPress diagnostic error', { 
        requestId, 
        error: error.message,
        duration: Date.now() - startTime
      });
      
      return res.status(500).json({
        success: false,
        error: 'DIAGNOSTIC_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Perform fast diagnostic (must complete within 15 seconds)
   */
  async performFastDiagnostic({ domain, cpanelCredentials, userInput, requestId }) {
    const phases = {};
    let sshConnection = null;
    let remediation_needed = false;

    try {
      // Phase 1: WordPress Detection and SSH Connection (single connection)
      phases.phase1 = await this.phase1_WordPressDetection(domain, cpanelCredentials, requestId);
      
      // Get the established SSH connection from phase 1
      sshConnection = this.activeConnections.get(requestId);
      
      if (!phases.phase1.wordpress_found) {
        return {
          phases,
          primary_suspect: 'WordPress not installed',
          confidence: 95,
          remediation_needed: false,
          l1_classification: 'INSTALLATION_MISSING'
        };
      }

      // If we have config errors, prioritize fixing them (but don't wait for completion)
      if (phases.phase1.config_errors && phases.phase1.config_errors.length > 0) {
        // Start config fix in background, don't wait for it
        this.fixConfigParseError(sshConnection, requestId).catch(error => {
          logger.warn('Config fix failed in background', { requestId, error: error.message });
        });
      }

      // Phase 2: Error Log Analysis (reuse connection, keyword-based analysis)
      phases.phase2 = await this.phase2_ErrorLogAnalysis(sshConnection, requestId);
      
      // Phase 3: Database Connection Test (MySQL2 API, background remediation)
      phases.phase3 = await this.phase3_DatabaseConnectionTest(sshConnection, requestId);
      
      // Phases 4-6: Run in parallel for better performance
      const parallelPhases = await Promise.allSettled([
        this.phase4_CoreIntegrityCheck(sshConnection, requestId),
        this.phase5_VersionCheck(sshConnection, requestId),
        this.phase6_PluginThemeStatus(sshConnection, requestId)
      ]);
      
      // Extract results from parallel execution
      phases.phase4 = parallelPhases[0].status === 'fulfilled' ? parallelPhases[0].value : { 
        integrity_check_completed: false, 
        checksum_status: 'failed',
        error: parallelPhases[0].reason?.message || 'Phase 4 failed'
      };
      
      phases.phase5 = parallelPhases[1].status === 'fulfilled' ? parallelPhases[1].value : { 
        wordpress_version: null, 
        php_version: null,
        error: parallelPhases[1].reason?.message || 'Phase 5 failed'
      };
      
      phases.phase6 = parallelPhases[2].status === 'fulfilled' ? parallelPhases[2].value : { 
        active_plugins: [], 
        active_theme: null,
        error: parallelPhases[2].reason?.message || 'Phase 6 failed'
      };
      
      logger.info('Parallel phases completed', { 
        requestId, 
        phase4Status: parallelPhases[0].status,
        phase5Status: parallelPhases[1].status,
        phase6Status: parallelPhases[2].status
      });
      
      // Phase 7: Resource Limits (skip if config errors exist to avoid making them worse)
      if (!phases.phase1.config_errors || phases.phase1.config_errors.length === 0) {
        phases.phase7 = await this.phase7_ResourceLimits(sshConnection, requestId);
      } else {
        phases.phase7 = { 
          memory_limit_set: false, 
          max_memory_limit_set: false, 
          limits_applied: false,
          skipped: 'Config errors present'
        };
      }
      
      // Phase 8: Classification & Recommendations
      phases.phase8 = this.phase8_Classification(phases);

      // Determine if remediation is needed
      remediation_needed = this.needsRemediation(phases);

      return {
        phases,
        primary_suspect: phases.phase8.primary_suspect,
        confidence: phases.phase8.confidence,
        remediation_needed,
        l1_classification: phases.phase8.l1_classification,
        l2_classification: phases.phase8.l2_classification,
        recommendations: phases.phase8.recommendations
      };

    } catch (error) {
      logger.error('Fast diagnostic error', { requestId, error: error.message });
      throw error;
    } finally {
      // Keep SSH connection open for background remediation
      // Will be closed after background tasks complete
    }
  }

  /**
   * Phase 1: WordPress Detection via SSH (single connection approach)
   */
  async phase1_WordPressDetection(domain, cpanelCredentials, requestId) {
    const phase = {
      wordpress_found: false,
      version: null,
      path: null,
      installation_health: 'unknown',
      detection_method: 'ssh',
      config_errors: []
    };

    // Only try SSH detection - no HTTP fallback
    if (!cpanelCredentials) {
      phase.installation_health = 'no_credentials';
      return phase;
    }

    try {
      const sshConnection = await this.establishSSHConnection(cpanelCredentials, requestId);
      // Store credentials for reuse
      sshConnection._cpanelCredentials = cpanelCredentials;
      this.activeConnections.set(requestId, sshConnection);
      
      // First, check error_log to understand the current state
      const errorLogResult = await this.executeSSHCommand(
        sshConnection,
        `tail -50 /home/${cpanelCredentials.username}/public_html/error_log 2>/dev/null || echo "No error log found"`,
        requestId,
        3000
      );

      // Analyze error log for WordPress indicators and issues
      const hasWordPressErrors = errorLogResult.includes('wp-config.php') || 
                                errorLogResult.includes('wp-content') ||
                                errorLogResult.includes('wp-includes');
      
      const hasConfigErrors = errorLogResult.includes('wp-config.php') && 
                             errorLogResult.includes('Parse error');

      if (hasConfigErrors) {
        // Extract specific config errors
        const configErrorLines = errorLogResult.split('\n').filter(line => 
          line.includes('wp-config.php') && line.includes('Parse error')
        );
        phase.config_errors = configErrorLines.slice(0, 5); // Keep first 5 errors
      }

      // Try WordPress detection using same method as automated_wp_repair.js with better error handling
      const wpCheckResult = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${cpanelCredentials.username}/public_html && timeout 8 wp core verify-checksums --allow-root 2>&1 || echo "WP_CHECK_FAILED"`,
        requestId,
        10000 // 10 second timeout
      );

      if (wpCheckResult.includes('Success') && !wpCheckResult.includes('WP_CHECK_FAILED')) {
        phase.wordpress_found = true;
        phase.path = `/home/${cpanelCredentials.username}/public_html`;
        phase.installation_health = hasConfigErrors ? 'config_error' : 'healthy';
        
        // Get version with timeout
        try {
          const versionResult = await this.executeSSHCommand(
            sshConnection, 
            `cd /home/${cpanelCredentials.username}/public_html && timeout 5 wp core version --allow-root 2>&1 || echo "VERSION_FAILED"`, 
            requestId,
            7000
          );
          if (!versionResult.includes('VERSION_FAILED')) {
            phase.version = versionResult.trim();
          }
        } catch (versionError) {
          logger.warn('Failed to get WordPress version', { requestId, error: versionError.message });
        }
      } else if (hasWordPressErrors) {
        // WordPress files exist but have issues
        phase.wordpress_found = true;
        phase.path = `/home/${cpanelCredentials.username}/public_html`;
        phase.installation_health = 'corrupted';
      } else {
        // Check if WordPress files exist at all
        const fileCheckResult = await this.executeSSHCommand(
          sshConnection,
          `ls -la /home/${cpanelCredentials.username}/public_html/wp-config.php /home/${cpanelCredentials.username}/public_html/wp-load.php 2>/dev/null | wc -l`,
          requestId,
          2000
        );
        
        const fileCount = parseInt(fileCheckResult.trim());
        if (fileCount >= 2) {
          phase.wordpress_found = true;
          phase.path = `/home/${cpanelCredentials.username}/public_html`;
          phase.installation_health = 'detected_but_broken';
        } else {
          phase.installation_health = 'not_found';
        }
      }

      return phase;

    } catch (sshError) {
      logger.error('SSH WordPress detection failed', { requestId, error: sshError.message });
      phase.installation_health = 'ssh_error';
      return phase;
    }
  }

  /**
   * Fix wp-config.php parse error (immediate fix)
   */
  async fixConfigParseError(sshConnection, requestId) {
    if (!sshConnection) return { success: false, reason: 'No SSH connection' };

    try {
      logger.info('Fixing wp-config.php parse error', { requestId });
      
      // The error is: unexpected identifier "M", expecting ")" on line 94
      // This is likely from the WP_MEMORY_LIMIT setting we added
      // Let's check and fix the wp-config.php file
      
      const fixCommands = [
        `cd /home/${sshConnection._cpanelCredentials?.username}/public_html`,
        // First, backup the current wp-config.php
        'cp wp-config.php wp-config.php.backup.$(date +%Y%m%d_%H%M%S)',
        // Fix the parse error by properly setting memory limits - handle multiple variations
        `sed -i "s/define('WP_MEMORY_LIMIT', 512M);/define('WP_MEMORY_LIMIT', '512M');/g" wp-config.php`,
        `sed -i "s/define('WP_MAX_MEMORY_LIMIT', 512M);/define('WP_MAX_MEMORY_LIMIT', '512M');/g" wp-config.php`,
        `sed -i "s/define(\"WP_MEMORY_LIMIT\", 512M);/define('WP_MEMORY_LIMIT', '512M');/g" wp-config.php`,
        `sed -i "s/define(\"WP_MAX_MEMORY_LIMIT\", 512M);/define('WP_MAX_MEMORY_LIMIT', '512M');/g" wp-config.php`,
        // Also fix any other similar issues with unquoted values
        `sed -i "s/, 512M);/, '512M');/g" wp-config.php`,
        `sed -i "s/(512M)/(\'512M\')/g" wp-config.php`,
        // Remove any duplicate or malformed memory limit lines
        `grep -v "WP_MEMORY_LIMIT.*512M[^']" wp-config.php > wp-config.php.tmp && mv wp-config.php.tmp wp-config.php || true`
      ];

      const result = await this.executeSSHCommand(
        sshConnection,
        fixCommands.join(' && '),
        requestId,
        15000 // 15 second timeout
      );

      // Test the fix by checking PHP syntax
      try {
        const syntaxCheck = await this.executeSSHCommand(
          sshConnection,
          `cd /home/${sshConnection._cpanelCredentials?.username}/public_html && php -l wp-config.php`,
          requestId,
          5000
        );

        if (syntaxCheck.includes('No syntax errors detected')) {
          logger.info('wp-config.php parse error fixed successfully', { requestId });
          return { success: true, result: syntaxCheck };
        } else {
          logger.warn('wp-config.php syntax check failed after fix', { requestId, result: syntaxCheck });
          return { success: false, result: syntaxCheck };
        }
      } catch (syntaxError) {
        logger.warn('Could not verify wp-config.php syntax after fix', { requestId, error: syntaxError.message });
        return { success: true, result, note: 'Fix applied but syntax verification failed' };
      }

    } catch (error) {
      logger.error('Failed to fix wp-config.php parse error', { requestId, error: error.message });
      return { success: false, error: error.message };
    }
  }
  async phase2_ErrorLogAnalysis(sshConnection, requestId) {
    const phase = {
      errors_found: false,
      error_count: 0,
      critical_errors: [],
      recent_errors: [],
      error_keywords: {},
      log_analysis: null
    };

    if (!sshConnection) return phase;

    try {
      // Read last 50 lines of error log using same path pattern as automated_wp_repair.js
      const errorLogResult = await this.executeSSHCommand(
        sshConnection,
        `tail -50 /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html/error_log 2>/dev/null || echo "No error log found"`,
        requestId,
        2000 // 2 second timeout for error log
      );

      if (errorLogResult && !errorLogResult.includes('No error log found')) {
        const lines = errorLogResult.split('\n').filter(line => line.trim());
        phase.error_count = lines.length;
        phase.errors_found = lines.length > 0;
        
        // Keyword-based error analysis
        const errorKeywords = {
          database: ['database', 'mysql', 'connection', 'access denied', 'unknown database', 'table', 'sql'],
          memory: ['memory exhausted', 'fatal error', 'allowed memory size', 'memory limit'],
          plugin: ['plugin', 'wp-content/plugins', 'call to undefined function'],
          theme: ['theme', 'wp-content/themes', 'template'],
          config: ['wp-config.php', 'parse error', 'syntax error', 'unexpected'],
          permissions: ['permission denied', 'failed to open', 'no such file'],
          php: ['php fatal error', 'php parse error', 'php warning', 'deprecated']
        };

        // Count keyword occurrences
        phase.error_keywords = {};
        Object.keys(errorKeywords).forEach(category => {
          phase.error_keywords[category] = 0;
          errorKeywords[category].forEach(keyword => {
            const regex = new RegExp(keyword, 'gi');
            const matches = errorLogResult.match(regex);
            if (matches) {
              phase.error_keywords[category] += matches.length;
            }
          });
        });

        // Identify critical errors based on keywords
        phase.critical_errors = lines.filter(line => {
          const lowerLine = line.toLowerCase();
          return errorKeywords.database.some(keyword => lowerLine.includes(keyword)) ||
                 errorKeywords.memory.some(keyword => lowerLine.includes(keyword)) ||
                 errorKeywords.config.some(keyword => lowerLine.includes(keyword));
        }).slice(0, 10); // Limit to 10 most recent critical errors

        phase.recent_errors = lines.slice(-10); // Last 10 errors
        
        // Store full log for background analysis and ticket creation
        phase.log_analysis = {
          needs_background_analysis: true,
          needs_ticket_creation: phase.critical_errors.length > 5 || phase.error_keywords.database > 0,
          error_patterns_detected: phase.critical_errors.length > 0,
          full_log: errorLogResult // Store for ticket creation
        };
      }

    } catch (error) {
      logger.error('Phase 2 error log analysis failed', { requestId, error: error.message });
    }

    return phase;
  }

  /**
   * Phase 3: Database Connection Test (using MySQL2 API instead of SSH)
   */
  async phase3_DatabaseConnectionTest(sshConnection, requestId) {
    const phase = {
      database_connection: false,
      database_status: 'unknown',
      connection_details: null,
      remediation_applied: false,
      connection_method: 'mysql2_api',
      background_repair_scheduled: false
    };

    if (!sshConnection || !sshConnection._cpanelCredentials) {
      phase.database_status = 'no_credentials';
      return phase;
    }

    try {
      // Get wp-config.php database credentials first
      const wpConfigResult = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${sshConnection._cpanelCredentials.username}/public_html && grep -E "define.*DB_(NAME|USER|PASSWORD|HOST)" wp-config.php | head -4`,
        requestId,
        3000
      );

      if (!wpConfigResult || wpConfigResult.includes('No such file')) {
        phase.database_status = 'wp_config_not_found';
        return phase;
      }

      // Parse database credentials from wp-config.php
      const dbConfig = this.parseWpConfigDatabase(wpConfigResult);
      
      if (!dbConfig.database || !dbConfig.user) {
        phase.database_status = 'invalid_db_config';
        return phase;
      }

      // Use MySQL2 API for database connection testing with proper host management
      const MySQLClient = require('../lib/mysql');
      const mysqlClient = new MySQLClient();

      // Set up MySQL host management for remote connections
      const MySQLHostManagementStep = require('../steps/mysqlHostManagement');
      const mysqlHostManagement = new MySQLHostManagementStep();
      
      // Create cPanel client for host management
      const CpanelClient = require('../lib/cpanel');
      
      // Get the correct WHM API key for this server
      const serverName = sshConnection._cpanelCredentials.host.split('.')[0].toUpperCase(); // pcp3.mywebsitebox.com -> PCP3
      const whmTokenKey = `WHM_API_KEY_${serverName}`; // WHM_API_KEY_PCP3
      const whmToken = process.env[whmTokenKey] || process.env.WHM_TOKEN;
      
      if (!whmToken) {
        logger.warn('No WHM API key found for server', { requestId, serverName, tokenKey: whmTokenKey });
        phase.database_status = 'no_whm_token';
        return phase;
      }
      
      const cpanelClient = new CpanelClient(
        sshConnection._cpanelCredentials.host, 
        sshConnection._cpanelCredentials.username, 
        whmToken // Use WHM API key as password
      );
      
      // Step 1: Add local machine IP to MySQL hosts for remote connection
      const hostManagementResult = await mysqlHostManagement.addLocalMachineIPToMySQLHosts(cpanelClient);
      
      if (!hostManagementResult.success) {
        logger.warn('Failed to add local IP to MySQL hosts', { 
          requestId, 
          error: hostManagementResult.error 
        });
      } else {
        logger.info('Local IP added to MySQL hosts', { 
          requestId, 
          localIP: hostManagementResult.ip 
        });
      }
      
      // Step 2: Get server IP for direct MySQL connection
      let serverIP = null;
      try {
        serverIP = await mysqlHostManagement.getServerIP(sshConnection._cpanelCredentials.host);
        logger.info('Resolved server IP for database connection', { requestId, serverIP });
      } catch (ipError) {
        logger.warn('Failed to resolve server IP, using localhost', { requestId, error: ipError.message });
      }

      // Step 3: Test connection with MySQL2 (allow remote connections)
      const connectionResult = await mysqlClient.testConnectionPromise(dbConfig, serverIP);
      
      if (connectionResult.success) {
        phase.database_connection = true;
        phase.database_status = 'healthy';
        phase.connection_details = {
          host: connectionResult.connectionDetails.host,
          database: dbConfig.database,
          user: dbConfig.user,
          connection_method: 'mysql2_direct',
          mysql_host_added: hostManagementResult.success
        };
        
        logger.info('Database connection test successful via MySQL2', { requestId });
        
        // Schedule cleanup of MySQL host after diagnostic completes
        if (hostManagementResult.success) {
          setTimeout(async () => {
            try {
              await mysqlHostManagement.removeLocalMachineIPFromMySQLHosts(cpanelClient);
              logger.info('MySQL host cleanup completed', { requestId });
            } catch (cleanupError) {
              logger.warn('MySQL host cleanup failed', { requestId, error: cleanupError.message });
            }
          }, 300000); // 5 minutes cleanup delay
        }
      } else {
        phase.database_connection = false;
        phase.database_status = 'connection_failed';
        phase.connection_details = {
          error: connectionResult.error,
          errorCode: connectionResult.errorCode,
          mappedError: connectionResult.mappedError,
          mysql_host_added: hostManagementResult.success,
          local_ip: hostManagementResult.ip,
          parsed_config: {
            database: dbConfig.database,
            user: dbConfig.user,
            host: dbConfig.host,
            hasPassword: !!dbConfig.password
          }
        };
        
        // Check if this is an "Access denied" error which usually means user doesn't exist or wrong password
        if (connectionResult.errorCode === 'ER_ACCESS_DENIED_ERROR') {
          logger.info('Access denied error detected - likely user does not exist or wrong password', {
            requestId,
            user: dbConfig.user,
            database: dbConfig.database,
            error: connectionResult.error
          });
          phase.database_status = 'user_access_denied';
        }
        
        // Schedule background database repair using API instead of SSH
        // Only schedule if remediation is not already handling it
        if (!remediation_needed) {
          this.scheduleBackgroundDatabaseRepair(sshConnection._cpanelCredentials, dbConfig, requestId)
            .catch(error => {
              logger.warn('Failed to schedule background database repair', { requestId, error: error.message });
            });
          
          phase.background_repair_scheduled = true;
        } else {
          phase.background_repair_scheduled = false; // Will be handled by remediation
        }
        logger.info('Database connection failed, background repair scheduled', { 
          requestId,
          error: connectionResult.error,
          errorCode: connectionResult.errorCode,
          user: dbConfig.user,
          database: dbConfig.database
        });
        
        // Still schedule cleanup even if connection failed
        if (hostManagementResult.success) {
          setTimeout(async () => {
            try {
              await mysqlHostManagement.removeLocalMachineIPFromMySQLHosts(cpanelClient);
              logger.info('MySQL host cleanup completed after failed connection', { requestId });
            } catch (cleanupError) {
              logger.warn('MySQL host cleanup failed', { requestId, error: cleanupError.message });
            }
          }, 300000); // 5 minutes cleanup delay
        }
      }

    } catch (error) {
      logger.error('Phase 3 database connection test failed', { requestId, error: error.message });
      phase.database_status = 'test_failed';
      phase.connection_details = { error: error.message };
    }

    return phase;
  }

  /**
   * Parse database configuration from wp-config.php content
   */
  parseWpConfigDatabase(wpConfigContent) {
    const config = {
      database: null,
      user: null,
      password: null,
      host: 'localhost'
    };

    try {
      // Extract DB_NAME
      const dbNameMatch = wpConfigContent.match(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]*)['"]/);
      if (dbNameMatch) config.database = dbNameMatch[1];

      // Extract DB_USER
      const dbUserMatch = wpConfigContent.match(/define\s*\(\s*['"]DB_USER['"]\s*,\s*['"]([^'"]*)['"]/);
      if (dbUserMatch) config.user = dbUserMatch[1];

      // Extract DB_PASSWORD
      const dbPasswordMatch = wpConfigContent.match(/define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"]([^'"]*)['"]/);
      if (dbPasswordMatch) config.password = dbPasswordMatch[1];

      // Extract DB_HOST
      const dbHostMatch = wpConfigContent.match(/define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"]([^'"]*)['"]/);
      if (dbHostMatch) config.host = dbHostMatch[1];

      // Log parsed config for debugging (without password)
      logger.info('Parsed database configuration', {
        database: config.database,
        user: config.user,
        host: config.host,
        hasPassword: !!config.password
      });

    } catch (parseError) {
      logger.warn('Failed to parse wp-config.php database configuration', { error: parseError.message });
    }

    return config;
  }

  /**
   * Schedule background database repair using API instead of SSH
   */
  async scheduleBackgroundDatabaseRepair(cpanelCredentials, dbConfig, requestId) {
    // Don't await - run in background
    setTimeout(async () => {
      try {
        logger.info('Starting background database repair via API', { 
          requestId, 
          database: dbConfig.database,
          user: dbConfig.user 
        });
        
        // Use database user management API for repair
        const DatabaseUserManagementStep = require('../steps/databaseUserManagement');
        const dbUserManagement = new DatabaseUserManagementStep();
        
        // Create cPanel client for API operations
        const CpanelClient = require('../lib/cpanel');
        
        // Get the correct WHM API key for this server
        const serverName = cpanelCredentials.host.split('.')[0].toUpperCase(); // pcp3.mywebsitebox.com -> PCP3
        const whmTokenKey = `WHM_API_KEY_${serverName}`; // WHM_API_KEY_PCP3
        const whmToken = process.env[whmTokenKey] || process.env.WHM_TOKEN;
        
        if (!whmToken) {
          logger.error('No WHM API key found for background database repair', { 
            requestId, 
            serverName, 
            tokenKey: whmTokenKey 
          });
          return;
        }
        
        const cpanelClient = new CpanelClient(
          cpanelCredentials.host, 
          cpanelCredentials.username, 
          whmToken // Use WHM API key as password
        );
        
        // Check database and user status first
        const checkResult = await dbUserManagement.checkDatabaseAndUser(cpanelClient, dbConfig);
        
        logger.info('Database check result', { 
          requestId, 
          databaseExists: checkResult.databaseExists,
          userExists: checkResult.userExists,
          userInDatabase: checkResult.userInDatabase,
          issue: checkResult.issue
        });
        
        if (checkResult.issue === 'USER_NOT_IN_DATABASE' || 
            checkResult.issue === 'DATABASE_NOT_FOUND' ||
            checkResult.issue === 'CHECK_FAILED') {
          
          logger.info('Database user issue detected, creating new user and updating wp-config.php', { 
            requestId,
            issue: checkResult.issue,
            currentUser: dbConfig.user,
            database: dbConfig.database
          });
          
          // Get current wp-config.php content for updating
          let wpConfigContent = null;
          try {
            wpConfigContent = await cpanelClient.readFile('public_html/wp-config.php');
            logger.info('Successfully read wp-config.php for user creation', { requestId });
          } catch (readError) {
            logger.warn('Could not read wp-config.php, will proceed without content', { 
              requestId, 
              error: readError.message 
            });
          }
          
          // Try to fix database user issues by creating new user
          const repairResult = await dbUserManagement.manageDatabaseUser(
            cpanelClient, 
            dbConfig, 
            'public_html/wp-config.php',
            wpConfigContent, // Pass wp-config content for updating
            true  // Force create new user
          );
          
          if (repairResult.success) {
            logger.info('Background database repair completed successfully', { 
              requestId, 
              oldUser: dbConfig.user,
              newUser: repairResult.finalCredentials.username,
              database: repairResult.finalCredentials.database,
              actions: repairResult.actions,
              wpConfigUpdated: repairResult.wpConfigUpdated
            });
            
            // Test the new connection to verify it works
            try {
              const MySQLClient = require('../lib/mysql');
              const mysqlClient = new MySQLClient();
              
              const testResult = await mysqlClient.testConnectionPromise(repairResult.finalCredentials);
              
              if (testResult.success) {
                logger.info('New database user connection test successful', { 
                  requestId,
                  newUser: repairResult.finalCredentials.username
                });
              } else {
                logger.warn('New database user connection test failed', { 
                  requestId,
                  newUser: repairResult.finalCredentials.username,
                  error: testResult.error
                });
              }
            } catch (testError) {
              logger.warn('Could not test new database connection', { 
                requestId, 
                error: testError.message 
              });
            }
            
          } else {
            logger.warn('Background database repair failed', { 
              requestId, 
              error: repairResult.message,
              actions: repairResult.actions
            });
          }
        } else {
          logger.info('Database and user configuration appears valid, no repair needed', { 
            requestId,
            message: checkResult.message
          });
        }
        
      } catch (repairError) {
        logger.error('Background database repair error', { 
          requestId, 
          error: repairError.message,
          stack: repairError.stack
        });
      }
    }, 2000); // Start repair after 2 second delay to allow response to be sent
  }

  /**
   * Phase 5: Version Check (optimized)
   */
  async phase5_VersionCheck(sshConnection, requestId) {
    const phase = {
      wordpress_version: null,
      php_version: null,
      mysql_version: null,
      versions_compatible: true,
      update_available: false
    };

    if (!sshConnection) return phase;

    try {
      // Run version checks in parallel for better performance
      const versionTasks = [
        // WordPress version (already done in phase 1, but get more details)
        this.executeSSHCommand(
          sshConnection,
          `cd /home/${sshConnection._cpanelCredentials?.username}/public_html && timeout 3 wp core version --extra --allow-root 2>&1 || echo "WP_VERSION_FAILED"`,
          requestId,
          4000
        ).then(result => ({ type: 'wp', result })).catch(error => ({ type: 'wp', error: error.message })),
        
        // PHP version
        this.executeSSHCommand(
          sshConnection,
          'timeout 2 php -v | head -1 2>&1 || echo "PHP_VERSION_FAILED"',
          requestId,
          3000
        ).then(result => ({ type: 'php', result })).catch(error => ({ type: 'php', error: error.message })),
        
        // MySQL version  
        this.executeSSHCommand(
          sshConnection,
          'timeout 2 mysql --version 2>&1 || echo "MYSQL_VERSION_FAILED"',
          requestId,
          3000
        ).then(result => ({ type: 'mysql', result })).catch(error => ({ type: 'mysql', error: error.message }))
      ];

      const results = await Promise.allSettled(versionTasks);
      
      // Process results
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.result) {
          const { type, result: data } = result.value;
          
          switch (type) {
            case 'wp':
              if (!data.includes('WP_VERSION_FAILED')) {
                phase.wordpress_version = data.trim();
              }
              break;
            case 'php':
              if (!data.includes('PHP_VERSION_FAILED')) {
                const phpMatch = data.match(/PHP (\d+\.\d+\.\d+)/);
                phase.php_version = phpMatch ? phpMatch[1] : data.split(' ')[1] || 'unknown';
              }
              break;
            case 'mysql':
              if (!data.includes('MYSQL_VERSION_FAILED')) {
                const mysqlMatch = data.match(/(\d+\.\d+\.\d+)/);
                phase.mysql_version = mysqlMatch ? mysqlMatch[1] : 'unknown';
              }
              break;
          }
        }
      });

    } catch (error) {
      logger.error('Phase 5 version check failed', { requestId, error: error.message });
    }

    return phase;
  }

  /**
   * Phase 4: Core File Integrity Check (Non-blocking)
   */
  async phase4_CoreIntegrityCheck(sshConnection, requestId) {
    const phase = {
      integrity_check_completed: false,
      corrupted_files: [],
      missing_files: [],
      checksum_status: 'unknown'
    };

    if (!sshConnection) return phase;

    try {
      // Run core verify-checksums (don't fix, just record) using same method as automated_wp_repair.js
      const checksumResult = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html && wp core verify-checksums --allow-root`,
        requestId,
        5000 // 5 second timeout for this check
      );

      phase.integrity_check_completed = true;
      
      if (checksumResult.includes('Success')) {
        phase.checksum_status = 'valid';
      } else {
        phase.checksum_status = 'invalid';
        // Parse corrupted/missing files from output
        const lines = checksumResult.split('\n');
        phase.corrupted_files = lines.filter(line => 
          line.includes('should be') || line.includes('corrupted')
        );
        phase.missing_files = lines.filter(line => 
          line.includes('missing') || line.includes('not found')
        );
      }

    } catch (error) {
      logger.warn('Phase 4 core integrity check timeout or failed', { requestId, error: error.message });
      phase.checksum_status = 'timeout';
    }

    return phase;
  }

  /**
   * Phase 5: Parallel Database and Resource Checks
   */
  async phase5_ParallelChecks(sshConnection, requestId) {
    const phase = {
      database_connection: false,
      database_status: 'unknown',
      memory_usage: null,
      disk_usage: null,
      performance_metrics: {}
    };

    if (!sshConnection) return phase;

    try {
      // Run parallel checks
      const parallelTasks = [
        // Database connection test using same flags as automated_wp_repair.js
        this.executeSSHCommand(
          sshConnection,
          `cd /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html && wp db check --allow-root`,
          requestId,
          3000
        ).then(result => ({ type: 'db_check', result })).catch(error => ({ type: 'db_check', error: error.message })),
        
        // Memory usage
        this.executeSSHCommand(
          sshConnection,
          'free -m | grep Mem',
          requestId,
          2000
        ).then(result => ({ type: 'memory', result })).catch(error => ({ type: 'memory', error: error.message })),
        
        // Disk usage for the specific user's home directory
        this.executeSSHCommand(
          sshConnection,
          `df -h /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html | tail -1`,
          requestId,
          2000
        ).then(result => ({ type: 'disk', result })).catch(error => ({ type: 'disk', error: error.message }))
      ];

      const results = await Promise.allSettled(parallelTasks);
      
      // Process results
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.result) {
          const { type, result: data } = result.value;
          
          switch (type) {
            case 'db_check':
              phase.database_connection = !data.includes('Error');
              phase.database_status = phase.database_connection ? 'healthy' : 'error';
              break;
            case 'memory':
              const memMatch = data.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
              if (memMatch) {
                phase.memory_usage = {
                  total: parseInt(memMatch[1]),
                  used: parseInt(memMatch[2]),
                  free: parseInt(memMatch[3])
                };
              }
              break;
            case 'disk':
              const diskMatch = data.match(/(\d+)%/);
              if (diskMatch) {
                phase.disk_usage = parseInt(diskMatch[1]);
              }
              break;
          }
        }
      });

    } catch (error) {
      logger.error('Phase 5 parallel checks failed', { requestId, error: error.message });
    }

    return phase;
  }

  /**
   * Phase 6: Plugin/Theme Status (optimized with better error handling)
   */
  async phase6_PluginThemeStatus(sshConnection, requestId) {
    const phase = {
      active_plugins: [],
      inactive_plugins: [],
      active_theme: null,
      plugin_issues: [],
      theme_issues: []
    };

    if (!sshConnection) return phase;

    try {
      // Run plugin and theme checks in parallel
      const statusTasks = [
        // Get plugin list
        this.executeSSHCommand(
          sshConnection,
          `cd /home/${sshConnection._cpanelCredentials?.username}/public_html && timeout 5 wp plugin list --format=json --allow-root 2>&1 || echo "PLUGIN_LIST_FAILED"`,
          requestId,
          6000
        ).then(result => ({ type: 'plugins', result })).catch(error => ({ type: 'plugins', error: error.message })),

        // Get active theme
        this.executeSSHCommand(
          sshConnection,
          `cd /home/${sshConnection._cpanelCredentials?.username}/public_html && timeout 3 wp theme list --status=active --format=json --allow-root 2>&1 || echo "THEME_LIST_FAILED"`,
          requestId,
          4000
        ).then(result => ({ type: 'themes', result })).catch(error => ({ type: 'themes', error: error.message }))
      ];

      const results = await Promise.allSettled(statusTasks);
      
      // Process results
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.result) {
          const { type, result: data } = result.value;
          
          switch (type) {
            case 'plugins':
              if (!data.includes('PLUGIN_LIST_FAILED') && data.startsWith('[')) {
                try {
                  const plugins = JSON.parse(data);
                  phase.active_plugins = plugins.filter(p => p.status === 'active').map(p => p.name);
                  phase.inactive_plugins = plugins.filter(p => p.status === 'inactive').map(p => p.name);
                } catch (parseError) {
                  logger.warn('Failed to parse plugin list JSON', { requestId, error: parseError.message });
                }
              }
              break;
            case 'themes':
              if (!data.includes('THEME_LIST_FAILED') && data.startsWith('[')) {
                try {
                  const themes = JSON.parse(data);
                  phase.active_theme = themes[0]?.name || null;
                } catch (parseError) {
                  logger.warn('Failed to parse theme list JSON', { requestId, error: parseError.message });
                }
              }
              break;
          }
        }
      });

    } catch (error) {
      logger.warn('Phase 6 plugin/theme status check failed', { requestId, error: error.message });
    }

    return phase;
  }

  /**
   * Phase 7: Force Set Resource Limits (Immediate)
   */
  async phase7_ResourceLimits(sshConnection, requestId) {
    const phase = {
      memory_limit_set: false,
      max_memory_limit_set: false,
      limits_applied: false
    };

    if (!sshConnection) return phase;

    try {
      // Force set memory limits immediately using same flags as automated_wp_repair.js
      // Use proper quoting to avoid parse errors
      const memoryCommands = [
        `cd /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html`,
        `wp config set WP_MEMORY_LIMIT "'512M'" --raw --allow-root`,
        `wp config set WP_MAX_MEMORY_LIMIT "'512M'" --raw --allow-root`
      ];

      const result = await this.executeSSHCommand(
        sshConnection,
        memoryCommands.join(' && '),
        requestId,
        8000 // 8 second timeout
      );

      phase.memory_limit_set = !result.includes('Error');
      phase.max_memory_limit_set = !result.includes('Error');
      phase.limits_applied = phase.memory_limit_set && phase.max_memory_limit_set;

      logger.info('Resource limits applied', { requestId, success: phase.limits_applied });

    } catch (error) {
      logger.error('Phase 7 resource limits failed', { requestId, error: error.message });
    }

    return phase;
  }

  /**
   * Phase 8: Classification & Recommendations
   */
  phase8_Classification(phases) {
    const phase = {
      primary_suspect: 'unknown',
      confidence: 0,
      l1_classification: null,
      l2_classification: null,
      recommendations: []
    };

    // Analyze phases to determine primary issue
    if (!phases.phase1?.wordpress_found) {
      phase.primary_suspect = 'WordPress not installed';
      phase.confidence = 95;
      phase.l1_classification = 'INSTALLATION_MISSING';
      phase.recommendations.push('Install WordPress');
      return phase;
    }

    // Check for config errors first (highest priority)
    if (phases.phase1?.config_errors?.length > 0) {
      phase.primary_suspect = 'WordPress configuration errors';
      phase.confidence = 90;
      phase.l1_classification = 'CONFIG_ERROR';
      phase.l2_classification = 'PARSE_ERROR';
      phase.recommendations.push('Fix wp-config.php syntax errors');
      phase.recommendations.push('Backup and restore wp-config.php');
      return phase;
    }

    // Check installation health
    if (phases.phase1?.installation_health === 'corrupted') {
      phase.primary_suspect = 'WordPress core file corruption';
      phase.confidence = 85;
      phase.l1_classification = 'CORE_CORRUPTION';
      phase.recommendations.push('Restore WordPress core files');
      return phase;
    }

    // Check for database issues
    if (!phases.phase3?.database_connection || phases.phase2?.error_keywords?.database > 0) {
      phase.primary_suspect = 'Database connection issues';
      phase.confidence = 85;
      phase.l1_classification = 'DATABASE_ERROR';
      phase.l2_classification = phases.phase3?.remediation_applied ? 'REPAIRED' : 'CONNECTION_FAILED';
      phase.recommendations.push('Check database credentials');
      phase.recommendations.push('Verify database server status');
      return phase;
    }

    if (phases.phase2?.critical_errors?.length > 0) {
      const errorTypes = phases.phase2.critical_errors.join(' ').toLowerCase();
      
      if (errorTypes.includes('database')) {
        phase.primary_suspect = 'Database connection issues';
        phase.confidence = 85;
        phase.l1_classification = 'DATABASE_ERROR';
        phase.l2_classification = 'CONNECTION_FAILED';
      } else if (errorTypes.includes('memory')) {
        phase.primary_suspect = 'Memory exhaustion';
        phase.confidence = 80;
        phase.l1_classification = 'RESOURCE_ERROR';
        phase.l2_classification = 'MEMORY_LIMIT';
      } else if (errorTypes.includes('plugin')) {
        phase.primary_suspect = 'Plugin conflicts';
        phase.confidence = 75;
        phase.l1_classification = 'PLUGIN_ERROR';
        phase.l2_classification = 'CONFLICT_DETECTED';
      }
    }

    // Default if no specific issue found but WordPress is healthy
    if (phase.confidence === 0) {
      phase.primary_suspect = 'WordPress is healthy';
      phase.confidence = 80;
      phase.l1_classification = 'HEALTHY';
      phase.recommendations.push('Regular maintenance recommended');
    }

    return phase;
  }

  /**
   * Get client-friendly status message
   */
  getClientFriendlyStatus(diagnosticResult) {
    if (!diagnosticResult.phases.phase1?.wordpress_found) {
      return 'WordPress not detected';
    }
    
    if (diagnosticResult.phases.phase3?.database_connection) {
      return 'WordPress is healthy';
    }
    
    if (diagnosticResult.remediation_needed) {
      return 'Issues detected - repair in progress';
    }
    
    return 'WordPress detected with minor issues';
  }

  /**
   * Get client-friendly database status
   */
  getClientFriendlyDatabaseStatus(dbStatus) {
    const statusMap = {
      'healthy': 'Connected',
      'connection_failed': 'Connection failed',
      'user_access_denied': 'User access denied',
      'no_credentials': 'No credentials found',
      'invalid_db_config': 'Invalid configuration',
      'test_failed': 'Test failed',
      'unknown': 'Unknown'
    };
    
    return statusMap[dbStatus] || 'Unknown';
  }

  /**
   * Extract clean WordPress version
   */
  extractWordPressVersion(versionString) {
    if (!versionString) return 'unknown';
    
    const match = versionString.match(/WordPress version:\s*(\d+\.\d+(?:\.\d+)?)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Get severity level based on confidence
   */
  getSeverityLevel(confidence) {
    if (confidence >= 90) return 'Critical';
    if (confidence >= 70) return 'High';
    if (confidence >= 50) return 'Medium';
    return 'Low';
  }
  needsRemediation(phases) {
    return (
      !phases.phase1?.wordpress_found ||
      (phases.phase1?.config_errors?.length > 0) ||
      phases.phase1?.installation_health === 'corrupted' ||
      phases.phase2?.critical_errors?.length > 0 ||
      !phases.phase3?.database_connection ||
      phases.phase3?.database_status === 'connection_failed' ||
      phases.phase2?.error_keywords?.database > 0 ||
      phases.phase4?.checksum_status === 'invalid'
    );
  }

  /**
   * Establish SSH connection using the same method as automated_wp_repair.js
   */
  async establishSSHConnection(cpanelCredentials, requestId) {
    logger.info('Establishing SSH connection with key-based auth', { requestId, host: cpanelCredentials.host });
    
    try {
      // Step 1: Try SSH key-based authentication first
      const sshKeyName = `wp_diag_${requestId}_key`;
      
      try {
        const privateKey = await this.generateAndFetchSSHKey(cpanelCredentials, sshKeyName, requestId);
        
        if (privateKey) {
          const connection = await this.connectWithSSHKey(cpanelCredentials, privateKey, sshKeyName, requestId);
          
          // Store key name for cleanup
          connection._keyName = sshKeyName;
          connection._cpanelCredentials = cpanelCredentials;
          connection._useKeyAuth = true;
          
          return connection;
        }
      } catch (keyError) {
        logger.warn('SSH key authentication failed, trying password fallback', { 
          requestId, 
          error: keyError.message 
        });
      }

      // Step 2: Fallback to password authentication if key auth fails
      try {
        logger.info('Attempting password-based SSH connection', { requestId });
        const connection = await this.connectWithPassword(cpanelCredentials, requestId);
        connection._useKeyAuth = false;
        return connection;
      } catch (passwordError) {
        logger.warn('Password SSH authentication also failed', { 
          requestId, 
          error: passwordError.message 
        });
      }

      // Step 3: If both SSH methods fail, throw error but allow diagnostic to continue
      throw new Error('Both SSH key and password authentication failed');
      
    } catch (error) {
      logger.error('SSH connection establishment failed', { requestId, error: error.message });
      throw error;
    }
  }

  /**
   * Fallback password-based SSH connection using automated_wp_repair.js config
   */
  async connectWithPassword(cpanelCredentials, requestId) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('SSH password connection timeout'));
      }, 20000); // Same as automated_wp_repair.js

      conn.on('ready', () => {
        clearTimeout(timeout);
        logger.info('SSH connection established with password auth', { requestId, host: cpanelCredentials.host });
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('SSH password connection failed', { requestId, error: err.message });
        reject(err);
      });

      // Use exact same configuration as automated_wp_repair.js
      const config = {
        whm: {
          host: cpanelCredentials.host
        },
        cpanel: {
          user: cpanelCredentials.username,
          passphrase: '73v3nE1v!$'
        },
        ssh: {
          port: 22022
        }
      };
      
      logger.info('Attempting SSH connection with password using automated_wp_repair.js config', { 
        requestId, 
        host: config.whm.host,
        port: config.ssh.port,
        username: config.cpanel.user,
        hasPassphrase: !!config.cpanel.passphrase
      });

      // Try connection with exact same parameters as automated_wp_repair.js
      conn.connect({
        host: config.whm.host,
        port: config.ssh.port,
        username: config.cpanel.user,
        password: config.cpanel.passphrase, // Use passphrase as password
        readyTimeout: 20000,
        keepaliveInterval: 1000
      });
    });
  }

  /**
   * Generate SSH key via cPanel API and fetch private key
   * Uses exact same approach as automated_wp_repair.js
   */
  async generateAndFetchSSHKey(cpanelCredentials, keyName, requestId) {
    try {
      logger.info('Generating SSH key via cPanel API', { requestId, keyName });
      
      // Use exact same configuration as automated_wp_repair.js
      // Extract server name from hostname to get correct WHM token
      const serverName = cpanelCredentials.host.split('.')[0].toUpperCase(); // pcp3.mywebsitebox.com -> PCP3
      const whmTokenKey = `WHM_API_KEY_${serverName}`; // WHM_API_KEY_PCP3
      const whmToken = process.env[whmTokenKey] || process.env.WHM_TOKEN || 'DRBNK459UIU6DQQN3H9TQACJKAA78O6D';
      
      const config = {
        whm: {
          host: cpanelCredentials.host, // Use resolved host (pcp3.mywebsitebox.com)
          port: 2087,
          username: 'root',
          token: whmToken
        },
        cpanel: {
          user: cpanelCredentials.username, // Use resolved username (x98aailqrs)
          passphrase: '73v3nE1v!$'
        }
      };

      logger.info('Using exact config from automated_wp_repair.js', { 
        requestId, 
        host: config.whm.host, 
        port: config.whm.port,
        username: config.whm.username,
        tokenKey: whmTokenKey,
        tokenLength: config.whm.token.length,
        cpanelUser: config.cpanel.user
      });

      // Step 1: Generate SSH key (exact same as automated_wp_repair.js)
      const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
      const params = {
        'api.version': 1,
        user: config.cpanel.user,
        cpanel_jsonapi_user: config.cpanel.user,
        cpanel_jsonapi_module: 'SSH',
        cpanel_jsonapi_func: 'genkey',
        name: keyName,
        passphrase: config.cpanel.passphrase
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      logger.info('SSH key generation response', { 
        requestId, 
        status: response.status,
        hasData: !!response.data,
        hasCpanelResult: !!response.data?.cpanelresult
      });

      if (response.data.cpanelresult.data[0].result === 1) {
        logger.info('SSH key generated successfully', { 
          requestId, 
          keyName,
          reason: response.data.cpanelresult.data[0].reason
        });
      } else {
        throw new Error('Failed to generate SSH key: ' + (response.data.cpanelresult.data[0].reason || 'Unknown error'));
      }

      // Step 2: Authorize SSH key (exact same as automated_wp_repair.js)
      const authorizeParams = {
        'api.version': 1,
        user: config.cpanel.user,
        cpanel_jsonapi_user: config.cpanel.user,
        cpanel_jsonapi_module: 'SSH',
        cpanel_jsonapi_func: 'authkey',
        key: keyName,
        action: 'authorize'
      };

      const authorizeResponse = await axios.get(url, {
        params: authorizeParams,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (authorizeResponse.data.cpanelresult.data[0].status === 'authorized') {
        logger.info('SSH key authorized successfully', { requestId, keyName });
      } else {
        throw new Error('Failed to authorize SSH key');
      }

      // Step 3: Fetch private key (exact same as automated_wp_repair.js)
      const fetchParams = {
        'api.version': 1,
        user: config.cpanel.user,
        cpanel_jsonapi_user: config.cpanel.user,
        cpanel_jsonapi_module: 'SSH',
        cpanel_jsonapi_func: 'fetchkey',
        name: keyName
      };

      const fetchResponse = await axios.get(url, {
        params: fetchParams,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (fetchResponse.data.cpanelresult.data && fetchResponse.data.cpanelresult.data[0]) {
        const privateKey = fetchResponse.data.cpanelresult.data[0].key;
        logger.info('SSH private key fetched successfully', { requestId, keyName, keyLength: privateKey.length });
        return privateKey;
      } else {
        throw new Error('Failed to fetch private SSH key');
      }

    } catch (error) {
      logger.error('SSH key generation failed', { 
        requestId, 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data ? JSON.stringify(error.response.data).substring(0, 500) : 'No response data'
      });
      throw error;
    }
  }

  /**
   * Connect using SSH key (exact same method as automated_wp_repair.js)
   */
  async connectWithSSHKey(cpanelCredentials, privateKey, keyName, requestId) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('SSH key connection timeout'));
      }, 20000); // Same as automated_wp_repair.js

      conn.on('ready', () => {
        clearTimeout(timeout);
        logger.info('SSH connection established with key auth', { requestId, host: cpanelCredentials.host });
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('SSH key connection failed', { requestId, error: err.message });
        reject(err);
      });

      // Use exact same configuration as automated_wp_repair.js
      const config = {
        whm: {
          host: cpanelCredentials.host
        },
        cpanel: {
          user: cpanelCredentials.username,
          passphrase: '73v3nE1v!$'
        },
        ssh: {
          port: 22022
        }
      };

      logger.info('Connecting with SSH key using automated_wp_repair.js config', { 
        requestId, 
        host: config.whm.host,
        port: config.ssh.port,
        username: config.cpanel.user,
        keyLength: privateKey.length,
        hasPassphrase: !!config.cpanel.passphrase
      });

      // Connect using exact same parameters as automated_wp_repair.js
      conn.connect({
        host: config.whm.host,
        port: config.ssh.port,
        username: config.cpanel.user,
        privateKey: privateKey,
        passphrase: config.cpanel.passphrase,
        readyTimeout: 20000,
        keepaliveInterval: 1000
      });
    });
  }

  /**
   * Clean up SSH key after use (exact same as automated_wp_repair.js)
   */
  async cleanupSSHKey(connection, requestId) {
    if (!connection._useKeyAuth || !connection._keyName || !connection._cpanelCredentials) {
      logger.info('No SSH key cleanup needed', { requestId, useKeyAuth: connection._useKeyAuth });
      return;
    }

    try {
      logger.info('Cleaning up SSH key', { requestId, keyName: connection._keyName });
      
      const cpanelCredentials = connection._cpanelCredentials;
      
      // Use exact same configuration as automated_wp_repair.js
      const serverName = cpanelCredentials.host.split('.')[0].toUpperCase(); // pcp3.mywebsitebox.com -> PCP3
      const whmTokenKey = `WHM_API_KEY_${serverName}`; // WHM_API_KEY_PCP3
      const whmToken = process.env[whmTokenKey] || process.env.WHM_TOKEN || 'DRBNK459UIU6DQQN3H9TQACJKAA78O6D';
      
      const config = {
        whm: {
          host: cpanelCredentials.host,
          port: 2087,
          username: 'root',
          token: whmToken
        },
        cpanel: {
          user: cpanelCredentials.username
        }
      };

      const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
      const params = {
        'api.version': 1,
        user: config.cpanel.user,
        cpanel_jsonapi_user: config.cpanel.user,
        cpanel_jsonapi_module: 'SSH',
        cpanel_jsonapi_func: 'delkey',
        name: connection._keyName
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        }),
        timeout: 5000
      });

      if (response.data.cpanelresult.data && response.data.cpanelresult.data[0]) {
        logger.info('SSH key cleaned up successfully', { 
          requestId, 
          keyName: connection._keyName,
          deletedKey: response.data.cpanelresult.data[0].name
        });
      } else {
        logger.warn('SSH key cleanup response unclear', { requestId, keyName: connection._keyName });
      }

    } catch (error) {
      logger.warn('SSH key cleanup failed', { requestId, error: error.message });
    }
  }

  /**
   * Execute SSH command with timeout and better error handling
   */
  async executeSSHCommand(connection, command, requestId, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timeout after ${timeout}ms: ${command.substring(0, 100)}...`));
      }, timeout);

      connection.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }

        let output = '';
        let errorOutput = '';

        stream.on('close', (code) => {
          clearTimeout(timer);
          // Don't reject on non-zero exit codes, let the caller handle it
          // This prevents wp-cli commands from causing failures when they return useful error info
          if (code === 0 || output.trim() || errorOutput.trim()) {
            resolve(output + errorOutput); // Combine both outputs
          } else {
            reject(new Error(`Command failed with code ${code} and no output: ${command.substring(0, 100)}...`));
          }
        });

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        stream.on('error', (streamError) => {
          clearTimeout(timer);
          reject(streamError);
        });
      });
    });
  }

  /**
   * Background remediation (runs after response is sent)
   */
  async performBackgroundRemediation({ domain, cpanelCredentials, diagnosticResult, requestId }) {
    logger.info('Starting background remediation', { requestId });
    
    const sshConnection = this.activeConnections.get(requestId);
    
    try {
      const remediationTasks = [];

      // Task 1: Core file restoration if needed
      if (diagnosticResult.phases.phase4?.checksum_status === 'invalid') {
        remediationTasks.push(this.fixCoreFiles(sshConnection, requestId));
      }

      // Task 2: Database repair if needed (handled by background repair, not remediation)
      // Skip database repair in remediation to avoid duplication
      // if (!diagnosticResult.phases.phase3?.database_connection || 
      //     diagnosticResult.phases.phase3?.database_status === 'connection_failed') {
      //   remediationTasks.push(this.repairDatabase(sshConnection, requestId));
      // }

      // Task 3: Plugin/theme fixes if needed
      if (diagnosticResult.phases.phase6?.plugin_issues?.length > 0) {
        remediationTasks.push(this.fixPluginIssues(sshConnection, requestId));
      }

      // Task 4: Create support ticket if needed
      if (diagnosticResult.phases.phase2?.log_analysis?.needs_ticket_creation) {
        remediationTasks.push(this.createSupportTicket(
          domain, 
          cpanelCredentials, 
          diagnosticResult,
          requestId
        ));
      }

      // Execute all remediation tasks
      const results = await Promise.allSettled(remediationTasks);
      
      logger.info('Background remediation completed', { 
        requestId, 
        tasksCompleted: results.length,
        successful: results.filter(r => r.status === 'fulfilled').length
      });

    } catch (error) {
      logger.error('Background remediation error', { requestId, error: error.message });
    } finally {
      // Clean up SSH connection and key
      if (sshConnection) {
        // Clean up SSH key first
        await this.cleanupSSHKey(sshConnection, requestId);
        
        // Then close connection
        sshConnection.end();
        this.activeConnections.delete(requestId);
        logger.info('SSH connection and key cleaned up', { requestId });
      }
    }
  }

  /**
   * Fix core files (background task)
   */
  async fixCoreFiles(sshConnection, requestId) {
    logger.info('Fixing core files', { requestId });
    
    try {
      const result = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${sshConnection._cpanelCredentials?.username}/public_html && wp core download --force --allow-root`,
        requestId,
        30000 // 30 second timeout for core download
      );
      
      logger.info('Core files restored', { requestId });
      return { success: true, result };
    } catch (error) {
      logger.error('Core file restoration failed', { requestId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Repair database (background task using API instead of SSH)
   */
  async repairDatabase(sshConnection, requestId) {
    logger.info('Repairing database via API', { requestId });
    
    try {
      // Use API-based database repair instead of SSH
      const cpanelCredentials = sshConnection._cpanelCredentials;
      
      // Get wp-config.php database credentials
      const wpConfigResult = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${cpanelCredentials.username}/public_html && grep -E "define.*DB_(NAME|USER|PASSWORD|HOST)" wp-config.php | head -4`,
        requestId,
        5000
      );

      if (!wpConfigResult || wpConfigResult.includes('No such file')) {
        return { success: false, error: 'wp-config.php not found' };
      }

      const dbConfig = this.parseWpConfigDatabase(wpConfigResult);
      
      if (!dbConfig.database || !dbConfig.user) {
        return { success: false, error: 'Invalid database configuration' };
      }

      // Use database user management API for repair
      const DatabaseUserManagementStep = require('../steps/databaseUserManagement');
      const dbUserManagement = new DatabaseUserManagementStep();
      
      // Create cPanel client for API operations
      const CpanelClient = require('../lib/cpanel');
      
      // Get the correct WHM API key for this server
      const serverName = cpanelCredentials.host.split('.')[0].toUpperCase(); // pcp3.mywebsitebox.com -> PCP3
      const whmTokenKey = `WHM_API_KEY_${serverName}`; // WHM_API_KEY_PCP3
      const whmToken = process.env[whmTokenKey] || process.env.WHM_TOKEN;
      
      if (!whmToken) {
        return { success: false, error: `No WHM API key found for server ${serverName}` };
      }
      
      const cpanelClient = new CpanelClient(
        cpanelCredentials.host, 
        cpanelCredentials.username, 
        whmToken // Use WHM API key as password
      );
      
      // Check database and user status
      const checkResult = await dbUserManagement.checkDatabaseAndUser(cpanelClient, dbConfig);
      
      if (checkResult.issue) {
        logger.info('Database issue detected, creating new user and updating wp-config.php', {
          issue: checkResult.issue,
          currentUser: dbConfig.user,
          database: dbConfig.database
        });
        
        // Get current wp-config.php content for updating
        let wpConfigContent = null;
        try {
          wpConfigContent = await cpanelClient.readFile('public_html/wp-config.php');
          logger.info('Successfully read wp-config.php for user creation');
        } catch (readError) {
          logger.warn('Could not read wp-config.php, will proceed without content', { 
            error: readError.message 
          });
        }
        
        // Try to fix database user issues by creating new user
        const repairResult = await dbUserManagement.manageDatabaseUser(
          cpanelClient, 
          dbConfig, 
          'public_html/wp-config.php',
          wpConfigContent, // Pass wp-config content for updating
          true  // Force create new user
        );
        
        if (repairResult.success) {
          logger.info('Database repaired via API - new user created', { 
            oldUser: dbConfig.user,
            newUser: repairResult.finalCredentials.username,
            wpConfigUpdated: repairResult.wpConfigUpdated
          });
          return { 
            success: true, 
            result: `Database user created and wp-config.php updated: ${repairResult.finalCredentials.username}`,
            method: 'api_user_creation',
            oldUser: dbConfig.user,
            newUser: repairResult.finalCredentials.username,
            actions: repairResult.actions
          };
        } else {
          return { 
            success: false, 
            error: repairResult.message,
            method: 'api_user_creation',
            actions: repairResult.actions
          };
        }
      } else {
        // Database and user are fine, try MySQL repair commands via API
        const MySQLClient = require('../lib/mysql');
        const mysqlClient = new MySQLClient();
        
        // Test connection first
        const connectionResult = await mysqlClient.testConnectionPromise(dbConfig);
        
        if (connectionResult.success) {
          return { 
            success: true, 
            result: 'Database connection is healthy',
            method: 'mysql2_connection_test'
          };
        } else {
          return { 
            success: false, 
            error: connectionResult.error,
            method: 'mysql2_connection_test'
          };
        }
      }
      
    } catch (error) {
      logger.error('Database repair via API failed', { requestId, error: error.message });
      return { success: false, error: error.message, method: 'api_repair' };
    }
  }

  /**
   * Fix plugin issues (background task)
   */
  async fixPluginIssues(sshConnection, requestId) {
    logger.info('Fixing plugin issues', { requestId });
    
    try {
      // Update all plugins using same flags as automated_wp_repair.js
      const result = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${sshConnection._cpanelCredentials?.username}/public_html && wp plugin update --all --allow-root`,
        requestId,
        30000 // 30 second timeout
      );
      
      logger.info('Plugins updated', { requestId });
      return { success: true, result };
    } catch (error) {
      logger.error('Plugin fix failed', { requestId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze error log and create support ticket (background task)
   */
  async analyzeErrorLogAndCreateTicket(sshConnection, domain, cpanelCredentials, requestId) {
    logger.info('Analyzing error log for ticket creation', { requestId });
    
    try {
      // Read full error log using same path pattern as automated_wp_repair.js
      const fullErrorLog = await this.executeSSHCommand(
        sshConnection,
        `tail -200 /home/${sshConnection._cpanelCredentials?.username}/public_html/error_log 2>/dev/null || echo "No error log found"`,
        requestId,
        10000
      );

      if (fullErrorLog && !fullErrorLog.includes('No error log found')) {
        // Analyze errors and create ticket payload
        const ticketPayload = this.generateTicketPayload(fullErrorLog, domain, cpanelCredentials);
        
        // Here you would integrate with your ticket creation system
        logger.info('Support ticket payload generated', { 
          requestId, 
          domain,
          errorCount: fullErrorLog.split('\n').length
        });
        
        return { success: true, ticketPayload };
      }
      
      return { success: false, reason: 'No error log found' };
    } catch (error) {
      logger.error('Error log analysis failed', { requestId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate support ticket payload from error log
   */
  generateTicketPayload(errorLog, domain, cpanelCredentials) {
    const lines = errorLog.split('\n').filter(line => line.trim());
    
    // Analyze error patterns
    const errorPatterns = {
      database: lines.filter(line => /database|mysql|connection/i.test(line)),
      memory: lines.filter(line => /memory|exhausted|fatal/i.test(line)),
      plugin: lines.filter(line => /plugin|wp-content\/plugins/i.test(line)),
      theme: lines.filter(line => /theme|wp-content\/themes/i.test(line)),
      php: lines.filter(line => /php|fatal error|parse error/i.test(line))
    };

    let primaryIssue = 'General WordPress errors';
    let priority = 'Medium';

    // Determine primary issue and priority
    if (errorPatterns.database.length > 5) {
      primaryIssue = 'Database connectivity issues';
      priority = 'High';
    } else if (errorPatterns.memory.length > 3) {
      primaryIssue = 'Memory exhaustion errors';
      priority = 'High';
    } else if (errorPatterns.plugin.length > 5) {
      primaryIssue = 'Plugin conflicts';
      priority = 'Medium';
    }

    return {
      subject: `WordPress Diagnostic: ${primaryIssue} - ${domain}`,
      priority,
      domain,
      server: cpanelCredentials.host,
      username: cpanelCredentials.username,
      errorSummary: {
        totalErrors: lines.length,
        databaseErrors: errorPatterns.database.length,
        memoryErrors: errorPatterns.memory.length,
        pluginErrors: errorPatterns.plugin.length,
        themeErrors: errorPatterns.theme.length,
        phpErrors: errorPatterns.php.length
      },
      recentErrors: lines.slice(-20), // Last 20 errors
      recommendedActions: this.getRecommendedActions(errorPatterns)
    };
  }

  /**
   * Get recommended actions based on error patterns
   */
  getRecommendedActions(errorPatterns) {
    const actions = [];

    if (errorPatterns.database.length > 0) {
      actions.push('Check database connection settings');
      actions.push('Verify database user permissions');
    }

    if (errorPatterns.memory.length > 0) {
      actions.push('Increase PHP memory limit');
      actions.push('Optimize WordPress plugins');
    }

    if (errorPatterns.plugin.length > 0) {
      actions.push('Deactivate problematic plugins');
      actions.push('Update all plugins to latest versions');
    }

    if (errorPatterns.theme.length > 0) {
      actions.push('Switch to default theme temporarily');
      actions.push('Update theme to latest version');
    }

    return actions;
  }
  /**
   * Create comprehensive support ticket with complete analysis
   */
  async createComprehensiveTicket({ domain, cpanelCredentials, diagnosticResult, clientInfo, requestId }) {
    logger.info('Creating comprehensive support ticket', { requestId, domain });
    
    try {
      const ticketData = this.generateComprehensiveTicketData(domain, cpanelCredentials, diagnosticResult, clientInfo);
      
      const ticketPayload = {
        subject: ticketData.subject,
        message: ticketData.message,
        priority: ticketData.priority,
        department: 'Support',
        domain: domain,
        server: cpanelCredentials.host,
        username: cpanelCredentials.username,
        diagnostic_data: {
          request_id: requestId,
          complete_analysis: diagnosticResult,
          client_info: clientInfo,
          timestamp: new Date().toISOString()
        }
      };

      // Create ticket via WHMCS API
      const whmcsUrl = process.env.WHMCS_URL;
      const whmcsIdentifier = process.env.WHMCS_API_IDENTIFIER;
      const whmcsSecret = process.env.WHMCS_API_SECRET;

      if (whmcsUrl && whmcsIdentifier && whmcsSecret) {
        try {
          const axios = require('axios');
          
          const formData = new URLSearchParams();
          formData.append('action', 'OpenTicket');
          formData.append('identifier', whmcsIdentifier);
          formData.append('secret', whmcsSecret);
          formData.append('deptid', process.env.TECHSUPPORT_DEPTID || '2');
          formData.append('subject', ticketPayload.subject);
          formData.append('message', ticketPayload.message);
          formData.append('priority', ticketPayload.priority);
          formData.append('name', 'WordPress Diagnostic System');
          formData.append('email', 'support@hostbreak.com');
          formData.append('responsetype', 'json');

          const response = await axios.post(whmcsUrl, formData, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
          });

          if (response.data && response.data.result === 'success') {
            logger.info('Comprehensive support ticket created successfully', { 
              requestId, 
              domain,
              ticketId: response.data.id,
              ticketNumber: response.data.tid
            });
            
            return { 
              success: true, 
              ticketId: response.data.id,
              ticketNumber: response.data.tid,
              subject: ticketPayload.subject
            };
          } else {
            logger.error('Failed to create comprehensive support ticket via WHMCS', { 
              requestId, 
              error: response.data?.message || 'Unknown error',
              responseData: response.data
            });
          }
        } catch (apiError) {
          logger.error('WHMCS API error for comprehensive ticket', { 
            requestId, 
            error: apiError.message,
            status: apiError.response?.status,
            statusText: apiError.response?.statusText
          });
        }
      }

      // Fallback: Log comprehensive ticket data for manual processing
      logger.info('Comprehensive support ticket data (manual processing required)', { 
        requestId, 
        domain,
        ticketData: {
          subject: ticketPayload.subject,
          priority: ticketPayload.priority,
          server: ticketPayload.server,
          username: ticketPayload.username,
          complete_diagnostic: diagnosticResult
        }
      });
      
      return { 
        success: true, 
        method: 'logged_for_manual_processing',
        ticketData: ticketPayload
      };

    } catch (error) {
      logger.error('Failed to create comprehensive support ticket', { requestId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate comprehensive ticket data with complete analysis
   */
  generateComprehensiveTicketData(domain, cpanelCredentials, diagnosticResult, clientInfo) {
    const phases = diagnosticResult.phases;
    let priority = 'Medium';
    let subject = `WordPress Diagnostic Report - ${domain}`;
    let issueType = 'General Analysis';

    // Determine priority and issue type based on diagnostic results
    if (!phases.phase1?.wordpress_found) {
      priority = 'High';
      issueType = 'WordPress Not Found';
      subject = `WordPress Installation Missing - ${domain}`;
    } else if (phases.phase1?.config_errors?.length > 0) {
      priority = 'High';
      issueType = 'Configuration Error';
      subject = `WordPress Configuration Error - ${domain}`;
    } else if (!phases.phase3?.database_connection) {
      priority = 'High';
      issueType = 'Database Connection';
      subject = `WordPress Database Connection Issue - ${domain}`;
    } else if (phases.phase2?.error_keywords?.memory > 5) {
      priority = 'Medium';
      issueType = 'Memory Issues';
      subject = `WordPress Memory Issues - ${domain}`;
    }

    // Generate comprehensive message with complete analysis
    const message = this.generateComprehensiveTicketMessage(domain, cpanelCredentials, diagnosticResult, clientInfo, issueType);

    return {
      subject,
      message,
      priority,
      issueType,
      domain,
      server: cpanelCredentials.host,
      username: cpanelCredentials.username
    };
  }

  /**
   * Generate comprehensive ticket message with complete diagnostic data
   */
  generateComprehensiveTicketMessage(domain, cpanelCredentials, diagnosticResult, clientInfo, issueType) {
    const phases = diagnosticResult.phases;
    
    let message = `COMPREHENSIVE WORDPRESS DIAGNOSTIC REPORT\n`;
    message += `==========================================\n\n`;
    
    message += `Domain: ${domain}\n`;
    message += `Server: ${cpanelCredentials.host}\n`;
    message += `Username: ${cpanelCredentials.username}\n`;
    message += `Issue Type: ${issueType}\n`;
    message += `Diagnostic Time: ${new Date().toISOString()}\n`;
    message += `Request ID: ${diagnosticResult.requestId || 'N/A'}\n`;
    message += `Duration: ${diagnosticResult.duration || 'N/A'}ms\n\n`;

    message += `EXECUTIVE SUMMARY\n`;
    message += `=================\n`;
    message += `Primary Issue: ${diagnosticResult.primary_suspect || 'Unknown'}\n`;
    message += `Confidence Level: ${diagnosticResult.confidence || 0}%\n`;
    message += `Classification: ${diagnosticResult.l1_classification || 'Unknown'}\n`;
    message += `Sub-classification: ${diagnosticResult.l2_classification || 'N/A'}\n`;
    message += `Remediation Needed: ${diagnosticResult.remediation_needed ? 'Yes' : 'No'}\n\n`;

    message += `PHASE 1: WORDPRESS DETECTION\n`;
    message += `=============================\n`;
    message += `WordPress Found: ${phases.phase1?.wordpress_found ? 'Yes' : 'No'}\n`;
    message += `Version: ${phases.phase1?.version || 'Unknown'}\n`;
    message += `Installation Path: ${phases.phase1?.path || 'N/A'}\n`;
    message += `Installation Health: ${phases.phase1?.installation_health || 'Unknown'}\n`;
    message += `Detection Method: ${phases.phase1?.detection_method || 'Unknown'}\n`;
    if (phases.phase1?.config_errors?.length > 0) {
      message += `Configuration Errors: ${phases.phase1.config_errors.length}\n`;
      phases.phase1.config_errors.slice(0, 3).forEach((error, index) => {
        message += `  ${index + 1}. ${error.substring(0, 100)}...\n`;
      });
    }
    message += `\n`;

    message += `PHASE 2: ERROR LOG ANALYSIS\n`;
    message += `============================\n`;
    message += `Errors Found: ${phases.phase2?.errors_found ? 'Yes' : 'No'}\n`;
    message += `Total Error Count: ${phases.phase2?.error_count || 0}\n`;
    message += `Critical Errors: ${phases.phase2?.critical_errors?.length || 0}\n`;
    if (phases.phase2?.error_keywords) {
      message += `Error Categories:\n`;
      Object.entries(phases.phase2.error_keywords).forEach(([category, count]) => {
        if (count > 0) {
          message += `  - ${category.toUpperCase()}: ${count} occurrences\n`;
        }
      });
    }
    if (phases.phase2?.critical_errors?.length > 0) {
      message += `Recent Critical Errors:\n`;
      phases.phase2.critical_errors.slice(0, 3).forEach((error, index) => {
        message += `  ${index + 1}. ${error.substring(0, 150)}...\n`;
      });
    }
    message += `\n`;

    message += `PHASE 3: DATABASE CONNECTION\n`;
    message += `=============================\n`;
    message += `Database Connected: ${phases.phase3?.database_connection ? 'Yes' : 'No'}\n`;
    message += `Database Status: ${phases.phase3?.database_status || 'Unknown'}\n`;
    message += `Connection Method: ${phases.phase3?.connection_method || 'Unknown'}\n`;
    message += `Background Repair Scheduled: ${phases.phase3?.background_repair_scheduled ? 'Yes' : 'No'}\n`;
    if (phases.phase3?.connection_details) {
      const details = phases.phase3.connection_details;
      if (details.error) {
        message += `Connection Error: ${details.error}\n`;
        message += `Error Code: ${details.errorCode || 'Unknown'}\n`;
      }
      if (details.parsed_config) {
        message += `Database Name: ${details.parsed_config.database || 'Unknown'}\n`;
        message += `Database User: ${details.parsed_config.user || 'Unknown'}\n`;
        message += `Database Host: ${details.parsed_config.host || 'Unknown'}\n`;
      }
    }
    message += `\n`;

    message += `PHASE 4: CORE FILE INTEGRITY\n`;
    message += `=============================\n`;
    message += `Integrity Check Completed: ${phases.phase4?.integrity_check_completed ? 'Yes' : 'No'}\n`;
    message += `Checksum Status: ${phases.phase4?.checksum_status || 'Unknown'}\n`;
    message += `Corrupted Files: ${phases.phase4?.corrupted_files?.length || 0}\n`;
    message += `Missing Files: ${phases.phase4?.missing_files?.length || 0}\n`;
    message += `\n`;

    message += `PHASE 5: VERSION INFORMATION\n`;
    message += `=============================\n`;
    message += `WordPress Version: ${this.extractWordPressVersion(phases.phase5?.wordpress_version) || 'Unknown'}\n`;
    message += `PHP Version: ${phases.phase5?.php_version || 'Unknown'}\n`;
    message += `MySQL Version: ${phases.phase5?.mysql_version || 'Unknown'}\n`;
    message += `Versions Compatible: ${phases.phase5?.versions_compatible ? 'Yes' : 'No'}\n`;
    message += `\n`;

    message += `PHASE 6: PLUGINS & THEMES\n`;
    message += `==========================\n`;
    message += `Active Plugins: ${phases.phase6?.active_plugins?.length || 0}\n`;
    message += `Inactive Plugins: ${phases.phase6?.inactive_plugins?.length || 0}\n`;
    message += `Active Theme: ${phases.phase6?.active_theme || 'Unknown'}\n`;
    if (phases.phase6?.active_plugins?.length > 0) {
      message += `Plugin List: ${phases.phase6.active_plugins.slice(0, 5).join(', ')}\n`;
    }
    message += `\n`;

    message += `PHASE 7: RESOURCE LIMITS\n`;
    message += `=========================\n`;
    message += `Memory Limit Set: ${phases.phase7?.memory_limit_set ? 'Yes' : 'No'}\n`;
    message += `Max Memory Limit Set: ${phases.phase7?.max_memory_limit_set ? 'Yes' : 'No'}\n`;
    message += `Limits Applied: ${phases.phase7?.limits_applied ? 'Yes' : 'No'}\n`;
    message += `\n`;

    message += `RECOMMENDATIONS\n`;
    message += `===============\n`;
    if (diagnosticResult.recommendations) {
      diagnosticResult.recommendations.forEach((rec, index) => {
        message += `${index + 1}. ${rec}\n`;
      });
    } else {
      message += `No specific recommendations available.\n`;
    }
    message += `\n`;

    message += `REMEDIATION STATUS\n`;
    message += `==================\n`;
    message += `Background Remediation Scheduled: ${diagnosticResult.background_remediation_scheduled ? 'Yes' : 'No'}\n`;
    message += `Remediation Needed: ${diagnosticResult.remediation_needed ? 'Yes' : 'No'}\n`;
    message += `\n`;

    message += `This comprehensive diagnostic report was automatically generated by the WordPress Diagnostic System.\n`;
    message += `All technical details and raw diagnostic data are included for thorough analysis.\n`;

    return message;
  }
  async createSupportTicket(domain, cpanelCredentials, diagnosticResult, requestId) {
    logger.info('Creating support ticket for WordPress issues', { requestId, domain });
    
    try {
      const ticketData = this.generateTicketData(domain, cpanelCredentials, diagnosticResult);
      
      const ticketPayload = {
        subject: ticketData.subject,
        message: ticketData.message,
        priority: ticketData.priority,
        department: 'Support', // Technical support department
        domain: domain,
        server: cpanelCredentials.host,
        username: cpanelCredentials.username,
        diagnostic_data: {
          request_id: requestId,
          wordpress_found: diagnosticResult.phases.phase1?.wordpress_found,
          config_errors: diagnosticResult.phases.phase1?.config_errors?.length || 0,
          database_status: diagnosticResult.phases.phase3?.database_status,
          error_keywords: diagnosticResult.phases.phase2?.error_keywords,
          critical_errors_count: diagnosticResult.phases.phase2?.critical_errors?.length || 0
        }
      };

      // Create ticket via WHMCS API
      const whmcsUrl = process.env.WHMCS_URL;
      const whmcsIdentifier = process.env.WHMCS_API_IDENTIFIER;
      const whmcsSecret = process.env.WHMCS_API_SECRET;

      if (whmcsUrl && whmcsIdentifier && whmcsSecret) {
        try {
          const axios = require('axios');
          
          // Use form data for WHMCS API
          const formData = new URLSearchParams();
          formData.append('action', 'OpenTicket');
          formData.append('identifier', whmcsIdentifier);
          formData.append('secret', whmcsSecret);
          formData.append('deptid', process.env.TECHSUPPORT_DEPTID || '2');
          formData.append('subject', ticketPayload.subject);
          formData.append('message', ticketPayload.message);
          formData.append('priority', ticketPayload.priority);
          formData.append('name', 'WordPress Diagnostic System');
          formData.append('email', 'support@hostbreak.com');
          formData.append('responsetype', 'json');

          const response = await axios.post(whmcsUrl, formData, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
          });

          if (response.data && response.data.result === 'success') {
            logger.info('Support ticket created successfully', { 
              requestId, 
              domain,
              ticketId: response.data.id,
              ticketNumber: response.data.tid
            });
            
            return { 
              success: true, 
              ticketId: response.data.id,
              ticketNumber: response.data.tid,
              subject: ticketPayload.subject
            };
          } else {
            logger.error('Failed to create support ticket via WHMCS', { 
              requestId, 
              error: response.data?.message || 'Unknown error',
              responseData: response.data
            });
          }
        } catch (apiError) {
          logger.error('WHMCS API error', { 
            requestId, 
            error: apiError.message,
            status: apiError.response?.status,
            statusText: apiError.response?.statusText
          });
        }
      }

      // Fallback: Log ticket data for manual processing
      logger.info('Support ticket data (manual processing required)', { 
        requestId, 
        domain,
        ticketData: {
          subject: ticketPayload.subject,
          priority: ticketPayload.priority,
          server: ticketPayload.server,
          username: ticketPayload.username,
          errorSummary: ticketPayload.diagnostic_data
        }
      });
      
      return { 
        success: true, 
        method: 'logged_for_manual_processing',
        ticketData: ticketPayload
      };

    } catch (error) {
      logger.error('Failed to create support ticket', { requestId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate ticket data from diagnostic results
   */
  generateTicketData(domain, cpanelCredentials, diagnosticResult) {
    const phases = diagnosticResult.phases;
    let priority = 'Medium';
    let subject = `WordPress Issue - ${domain}`;
    let issueType = 'General';

    // Determine priority and issue type based on diagnostic results
    if (phases.phase1?.config_errors?.length > 0) {
      priority = 'High';
      issueType = 'Configuration Error';
      subject = `WordPress Configuration Error - ${domain}`;
    } else if (!phases.phase3?.database_connection) {
      priority = 'High';
      issueType = 'Database Connection';
      subject = `WordPress Database Connection Issue - ${domain}`;
    } else if (phases.phase2?.error_keywords?.memory > 5) {
      priority = 'Medium';
      issueType = 'Memory Issues';
      subject = `WordPress Memory Issues - ${domain}`;
    }

    // Generate detailed message
    const message = this.generateTicketMessage(domain, cpanelCredentials, diagnosticResult, issueType);

    return {
      subject,
      message,
      priority,
      issueType,
      domain,
      server: cpanelCredentials.host,
      username: cpanelCredentials.username
    };
  }

  /**
   * Generate detailed ticket message
   */
  generateTicketMessage(domain, cpanelCredentials, diagnosticResult, issueType) {
    const phases = diagnosticResult.phases;
    
    let message = `WordPress Diagnostic Report for ${domain}\n\n`;
    message += `Server: ${cpanelCredentials.host}\n`;
    message += `Username: ${cpanelCredentials.username}\n`;
    message += `Issue Type: ${issueType}\n`;
    message += `Diagnostic Time: ${new Date().toISOString()}\n\n`;

    message += `=== DIAGNOSTIC SUMMARY ===\n`;
    message += `WordPress Found: ${phases.phase1?.wordpress_found ? 'Yes' : 'No'}\n`;
    message += `WordPress Version: ${phases.phase1?.version || 'Unknown'}\n`;
    message += `Installation Health: ${phases.phase1?.installation_health}\n`;
    message += `Database Connection: ${phases.phase3?.database_connection ? 'Working' : 'Failed'}\n`;
    message += `Database Status: ${phases.phase3?.database_status}\n\n`;

    if (phases.phase1?.config_errors?.length > 0) {
      message += `=== CONFIGURATION ERRORS ===\n`;
      phases.phase1.config_errors.slice(0, 5).forEach((error, index) => {
        message += `${index + 1}. ${error}\n`;
      });
      message += `\n`;
    }

    if (phases.phase2?.error_keywords) {
      message += `=== ERROR ANALYSIS ===\n`;
      Object.entries(phases.phase2.error_keywords).forEach(([category, count]) => {
        if (count > 0) {
          message += `${category.toUpperCase()}: ${count} occurrences\n`;
        }
      });
      message += `\n`;
    }

    if (phases.phase2?.critical_errors?.length > 0) {
      message += `=== RECENT CRITICAL ERRORS ===\n`;
      phases.phase2.critical_errors.slice(0, 5).forEach((error, index) => {
        message += `${index + 1}. ${error}\n`;
      });
      message += `\n`;
    }

    message += `=== RECOMMENDED ACTIONS ===\n`;
    if (diagnosticResult.recommendations) {
      diagnosticResult.recommendations.forEach((rec, index) => {
        message += `${index + 1}. ${rec}\n`;
      });
    }

    message += `\nThis ticket was automatically generated by the WordPress Diagnostic System.\n`;
    message += `Request ID: ${diagnosticResult.requestId || 'N/A'}\n`;

    return message;
  }
}

module.exports = new WordPressComprehensiveDiagnosticControllerOptimized();