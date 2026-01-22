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
    this.diagnosticTimeout = 20000; // Increased to 20 seconds to accommodate all phases
    
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
          setTimeout(() => reject(new Error('Diagnostic timeout - 20 second limit exceeded')), this.diagnosticTimeout)
        )
      ]);

      // Prepare response
      const response = {
        success: true,
        requestId,
        domain: value.domain,
        client: clientInfo,
        diagnostic: diagnosticResult,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        background_remediation_scheduled: !!cpanelCredentials
      };

      // Send response immediately
      res.status(200).json(response);

      // Trigger background remediation AFTER response is sent
      if (cpanelCredentials && diagnosticResult.remediation_needed) {
        logger.info('Triggering background remediation', { requestId });
        
        // Don't await - run in background
        this.performBackgroundRemediation({
          domain: value.domain,
          cpanelCredentials,
          diagnosticResult,
          requestId
        }).catch(error => {
          logger.error('Background remediation failed', { 
            requestId, 
            error: error.message 
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
      // Phase 1: Basic WordPress Detection (Fast)
      phases.phase1 = await this.phase1_WordPressDetection(domain, cpanelCredentials, requestId);
      
      if (!phases.phase1.wordpress_found) {
        return {
          phases,
          primary_suspect: 'WordPress not installed',
          confidence: 95,
          remediation_needed: false,
          l1_classification: 'INSTALLATION_MISSING'
        };
      }

      // Establish single persistent SSH connection if credentials available
      if (cpanelCredentials) {
        try {
          sshConnection = await this.establishSSHConnection(cpanelCredentials, requestId);
          // Store credentials for use in SSH commands
          sshConnection._cpanelCredentials = cpanelCredentials;
          this.activeConnections.set(requestId, sshConnection);
          logger.info('SSH connection established for diagnostic', { requestId });
        } catch (sshError) {
          logger.error('SSH connection failed, continuing with limited diagnostic', { 
            requestId, 
            error: sshError.message 
          });
          // Continue without SSH connection for basic checks
        }
      }

      // Phase 2: Error Log Analysis (Fast)
      phases.phase2 = await this.phase2_ErrorLogAnalysis(sshConnection, requestId);
      
      // Phase 3: Version Check (Fast)
      phases.phase3 = await this.phase3_VersionCheck(sshConnection, requestId);
      
      // Phase 4: Core File Integrity (Non-blocking)
      phases.phase4 = await this.phase4_CoreIntegrityCheck(sshConnection, requestId);
      
      // Phase 5: Database & Resource Checks (Parallel)
      phases.phase5 = await this.phase5_ParallelChecks(sshConnection, requestId);
      
      // Phase 6: Plugin/Theme Status (Fast)
      phases.phase6 = await this.phase6_PluginThemeStatus(sshConnection, requestId);
      
      // Phase 7: Resource Limits (Immediate Fix)
      phases.phase7 = await this.phase7_ResourceLimits(sshConnection, requestId);
      
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
   * Phase 1: WordPress Detection via SSH or HTTP fallback
   */
  async phase1_WordPressDetection(domain, cpanelCredentials, requestId) {
    const phase = {
      wordpress_found: false,
      version: null,
      path: null,
      installation_health: 'unknown',
      detection_method: 'none'
    };

    // Try SSH detection first if credentials available
    if (cpanelCredentials) {
      try {
        const sshConnection = await this.establishSSHConnection(cpanelCredentials, requestId);
        
        // Navigate to root and check WordPress installation using same method as automated_wp_repair.js
        const commands = [
          `cd /home/${cpanelCredentials.username}/public_html`,
          'wp core verify-checksums --allow-root'
        ];

        const result = await this.executeSSHCommand(sshConnection, commands.join(' && '), requestId);
        
        logger.info('WordPress detection SSH result', { 
          requestId, 
          command: commands.join(' && '),
          result: result.substring(0, 500),
          resultLength: result.length
        });
        
        if (result.includes('Success') || (!result.includes('Error') && !result.includes('Warning: Could not find'))) {
          phase.wordpress_found = true;
          phase.path = `/home/${cpanelCredentials.username}/public_html`;
          phase.detection_method = 'ssh';
          
          // Get version using same path and flags as automated_wp_repair.js
          try {
            const versionResult = await this.executeSSHCommand(
              sshConnection, 
              `cd /home/${cpanelCredentials.username}/public_html && wp core version --allow-root`, 
              requestId,
              3000 // 3 second timeout
            );
            phase.version = versionResult.trim();
            phase.installation_health = 'healthy';
          } catch (versionError) {
            logger.warn('Failed to get WordPress version via SSH', { requestId, error: versionError.message });
            phase.installation_health = 'partial';
          }
        } else {
          // If verify-checksums fails, try is-installed as fallback
          try {
            const fallbackResult = await this.executeSSHCommand(
              sshConnection, 
              `cd /home/${cpanelCredentials.username}/public_html && wp core is-installed --allow-root && echo "WordPress Found" || echo "WordPress Not Detected"`, 
              requestId
            );
            
            if (fallbackResult.includes('WordPress Found')) {
              phase.wordpress_found = true;
              phase.path = `/home/${cpanelCredentials.username}/public_html`;
              phase.detection_method = 'ssh';
              phase.installation_health = 'detected_fallback';
            } else {
              phase.installation_health = 'not_found';
              phase.detection_method = 'ssh';
            }
          } catch (fallbackError) {
            phase.installation_health = 'error';
            phase.detection_method = 'ssh';
          }
        }

        return phase;

      } catch (sshError) {
        logger.warn('SSH WordPress detection failed, falling back to HTTP', { 
          requestId, 
          error: sshError.message 
        });
      }
    }

    // Fallback to HTTP detection
    try {
      logger.info('Attempting HTTP WordPress detection', { requestId, domain });
      
      const httpPromises = [
        // Try HTTPS first
        axios.get(`https://${domain}`, { 
          timeout: 5000,
          validateStatus: () => true,
          headers: {
            'User-Agent': 'WordPress-Diagnostic-Bot/1.0'
          }
        }).catch(() => null),
        
        // Try HTTP as fallback
        axios.get(`http://${domain}`, { 
          timeout: 5000,
          validateStatus: () => true,
          headers: {
            'User-Agent': 'WordPress-Diagnostic-Bot/1.0'
          }
        }).catch(() => null)
      ];

      const responses = await Promise.allSettled(httpPromises);
      
      for (const result of responses) {
        if (result.status === 'fulfilled' && result.value) {
          const response = result.value;
          const content = response.data || '';
          
          // Check for WordPress indicators
          const wpIndicators = [
            /wp-content/i,
            /wp-includes/i,
            /wordpress/i,
            /<meta name="generator" content="WordPress/i,
            /wp-json/i,
            /wp-admin/i
          ];

          const foundIndicators = wpIndicators.filter(pattern => pattern.test(content));
          
          if (foundIndicators.length >= 2) {
            phase.wordpress_found = true;
            phase.detection_method = 'http';
            phase.installation_health = 'detected';
            
            // Try to extract version from generator meta tag
            const versionMatch = content.match(/<meta name="generator" content="WordPress ([^"]+)"/i);
            if (versionMatch) {
              phase.version = versionMatch[1];
            }
            
            logger.info('WordPress detected via HTTP', { 
              requestId, 
              domain,
              indicators: foundIndicators.length,
              version: phase.version
            });
            
            break;
          }
        }
      }

      if (!phase.wordpress_found) {
        phase.installation_health = 'not_detected';
        phase.detection_method = 'http';
        logger.info('WordPress not detected via HTTP', { requestId, domain });
      }

    } catch (httpError) {
      logger.error('HTTP WordPress detection failed', { requestId, error: httpError.message });
      phase.installation_health = 'error';
      phase.detection_method = 'failed';
    }

    return phase;
  }

  /**
   * Phase 2: Error Log Analysis
   */
  async phase2_ErrorLogAnalysis(sshConnection, requestId) {
    const phase = {
      errors_found: false,
      error_count: 0,
      critical_errors: [],
      recent_errors: [],
      log_analysis: null
    };

    if (!sshConnection) return phase;

    try {
      // Read last 50 lines of error log using same path pattern as automated_wp_repair.js
      const errorLogResult = await this.executeSSHCommand(
        sshConnection,
        `tail -50 /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html/error_log 2>/dev/null || echo "No error log found"`,
        requestId,
        3000 // 3 second timeout for error log
      );

      if (errorLogResult && !errorLogResult.includes('No error log found')) {
        const lines = errorLogResult.split('\n').filter(line => line.trim());
        phase.error_count = lines.length;
        phase.errors_found = lines.length > 0;
        
        // Analyze errors for patterns
        const criticalPatterns = [
          /fatal error/i,
          /database connection/i,
          /memory exhausted/i,
          /maximum execution time/i,
          /plugin.*error/i,
          /theme.*error/i
        ];

        phase.critical_errors = lines.filter(line => 
          criticalPatterns.some(pattern => pattern.test(line))
        ).slice(0, 10); // Limit to 10 most recent critical errors

        phase.recent_errors = lines.slice(-10); // Last 10 errors
        
        // Store full log for background analysis
        phase.log_analysis = {
          needs_background_analysis: true,
          error_patterns_detected: phase.critical_errors.length > 0
        };
      }

    } catch (error) {
      logger.error('Phase 2 error log analysis failed', { requestId, error: error.message });
    }

    return phase;
  }

  /**
   * Phase 3: Version Check
   */
  async phase3_VersionCheck(sshConnection, requestId) {
    const phase = {
      wordpress_version: null,
      php_version: null,
      mysql_version: null,
      versions_compatible: true,
      update_available: false
    };

    if (!sshConnection) return phase;

    try {
      // Get WordPress version (already done in phase 1, but get more details) using same flags as automated_wp_repair.js
      const wpVersionResult = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html && wp core version --extra --allow-root`,
        requestId,
        3000 // 3 second timeout
      );
      
      // Get PHP version
      const phpVersionResult = await this.executeSSHCommand(
        sshConnection,
        'php -v | head -1',
        requestId,
        2000 // 2 second timeout
      );
      
      // Get MySQL version  
      const mysqlVersionResult = await this.executeSSHCommand(
        sshConnection,
        'mysql --version',
        requestId,
        2000 // 2 second timeout
      );

      phase.wordpress_version = wpVersionResult.trim();
      phase.php_version = phpVersionResult.match(/PHP (\d+\.\d+\.\d+)/)?.[1] || 'unknown';
      phase.mysql_version = mysqlVersionResult.match(/(\d+\.\d+\.\d+)/)?.[1] || 'unknown';

    } catch (error) {
      logger.error('Phase 3 version check failed', { requestId, error: error.message });
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
   * Phase 6: Plugin/Theme Status
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
      // Get plugin list using same flags as automated_wp_repair.js
      const pluginResult = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html && wp plugin list --format=json --allow-root`,
        requestId,
        3000
      );

      if (pluginResult && pluginResult.startsWith('[')) {
        const plugins = JSON.parse(pluginResult);
        phase.active_plugins = plugins.filter(p => p.status === 'active').map(p => p.name);
        phase.inactive_plugins = plugins.filter(p => p.status === 'inactive').map(p => p.name);
      }

      // Get active theme using same flags as automated_wp_repair.js
      const themeResult = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html && wp theme list --status=active --format=json --allow-root`,
        requestId,
        2000
      );

      if (themeResult && themeResult.startsWith('[')) {
        const themes = JSON.parse(themeResult);
        phase.active_theme = themes[0]?.name || null;
      }

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
      const memoryCommands = [
        `cd /home/${sshConnection._cpanelCredentials?.username || '*'}/public_html`,
        'wp config set WP_MEMORY_LIMIT 512M --raw --allow-root',
        'wp config set WP_MAX_MEMORY_LIMIT 512M --raw --allow-root'
      ];

      const result = await this.executeSSHCommand(
        sshConnection,
        memoryCommands.join(' && '),
        requestId,
        3000
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

    if (phases.phase4?.checksum_status === 'invalid') {
      phase.primary_suspect = 'Core file corruption';
      phase.confidence = 70;
      phase.l1_classification = 'CORE_CORRUPTION';
      phase.recommendations.push('Restore core files');
    }

    if (!phases.phase5?.database_connection) {
      phase.primary_suspect = 'Database connectivity';
      phase.confidence = 85;
      phase.l1_classification = 'DATABASE_ERROR';
      phase.recommendations.push('Fix database connection');
    }

    // Default if no specific issue found
    if (phase.confidence === 0) {
      phase.primary_suspect = 'General health check';
      phase.confidence = 50;
      phase.l1_classification = 'GENERAL_HEALTH';
      phase.recommendations.push('Monitor site performance');
    }

    return phase;
  }

  /**
   * Determine if remediation is needed
   */
  needsRemediation(phases) {
    return (
      !phases.phase1?.wordpress_found ||
      phases.phase2?.critical_errors?.length > 0 ||
      phases.phase4?.checksum_status === 'invalid' ||
      !phases.phase5?.database_connection
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
   * Execute SSH command with timeout
   */
  async executeSSHCommand(connection, command, requestId, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Command timeout'));
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
          if (code === 0) {
            resolve(output);
          } else {
            reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
          }
        });

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
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

      // Task 2: Database repair if needed
      if (!diagnosticResult.phases.phase5?.database_connection) {
        remediationTasks.push(this.repairDatabase(sshConnection, requestId));
      }

      // Task 3: Plugin/theme fixes if needed
      if (diagnosticResult.phases.phase6?.plugin_issues?.length > 0) {
        remediationTasks.push(this.fixPluginIssues(sshConnection, requestId));
      }

      // Task 4: Generate support ticket from error log analysis
      if (diagnosticResult.phases.phase2?.log_analysis?.needs_background_analysis) {
        remediationTasks.push(this.analyzeErrorLogAndCreateTicket(
          sshConnection, 
          domain, 
          cpanelCredentials, 
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
   * Repair database (background task)
   */
  async repairDatabase(sshConnection, requestId) {
    logger.info('Repairing database', { requestId });
    
    try {
      const result = await this.executeSSHCommand(
        sshConnection,
        `cd /home/${sshConnection._cpanelCredentials?.username}/public_html && wp db repair --allow-root`,
        requestId,
        20000 // 20 second timeout
      );
      
      logger.info('Database repaired', { requestId });
      return { success: true, result };
    } catch (error) {
      logger.error('Database repair failed', { requestId, error: error.message });
      return { success: false, error: error.message };
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
}

module.exports = new WordPressComprehensiveDiagnosticControllerOptimized();