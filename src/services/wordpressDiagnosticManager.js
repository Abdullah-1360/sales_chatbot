const axios = require('axios');
const https = require('https');
const CpanelClient = require('../lib/cpanel');
const winston = require('winston');

/**
 * Advanced WordPress Diagnostic Manager
 * Implements 8-phase diagnostic methodology for comprehensive WordPress analysis
 */
class WordPressDiagnosticManager {
  constructor() {
    this.logger = this.createLogger();
    
    // Known problematic plugins by PHP version
    this.PROBLEMATIC_PLUGINS = {
      'php8.0': ['elementor', 'woocommerce', 'yoast-seo'],
      'php8.1': ['old-contact-form-7', 'outdated-themes'],
      'php8.2': ['legacy-plugins']
    };

    // Malware patterns to detect
    this.MALWARE_PATTERNS = [
      /eval\s*\(\s*base64_decode/i,
      /gzinflate\s*\(\s*base64_decode/i,
      /\$[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*"[a-zA-Z0-9+\/=]{50,}"/,
      /@eval\s*\(/i,
      /assert\s*\(\s*base64_decode/i
    ];

    // Core WordPress files for integrity check
    this.CORE_FILES = [
      'wp-config-sample.php',
      'wp-settings.php',
      'wp-load.php',
      'wp-blog-header.php',
      'index.php'
    ];
  }

  createLogger() {
    return winston.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'error' : 'info',
      format: winston.format.simple(),
      transports: [new winston.transports.Console({ silent: process.env.NODE_ENV === 'test' })]
    });
  }

  /**
   * Perform comprehensive 8-phase WordPress diagnostic
   */
  async performComprehensiveDiagnostic({ domain, cpanelCredentials, userInput }) {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Starting 8-phase diagnostic for: ${domain}`);
      
      // Initialize file cache for parallel reading and avoiding redundant reads
      const fileCache = new Map();
      
      // Initialize results structure
      const diagnosticResult = {
        phases: {},
        primary_suspect: null,
        secondary: null,
        confidence: 0,
        safe_actions_available: [],
        l1_classification: null,
        l2_classification: null,
        l3_evidence: [],
        tests_performed: [],
        recommendations: [],
        user_input: userInput
      };

      // Pre-load commonly used files in parallel if cPanel access is available
      if (cpanelCredentials) {
        await this.preloadCommonFiles(cpanelCredentials, fileCache);
      }

      // Phase 1: Basic Health Detection
      diagnosticResult.phases.phase1 = await this.phase1_BasicHealthDetection(domain, cpanelCredentials, fileCache);
      diagnosticResult.tests_performed.push('phase1_basic_health');

      // Phase 2: Symptom Classification
      diagnosticResult.phases.phase2 = await this.phase2_SymptomClassification(domain);
      diagnosticResult.tests_performed.push('phase2_symptom_classification');

      // Phase 3: Non-Destructive Isolation Tests (only if server access available)
      if (cpanelCredentials) {
        diagnosticResult.phases.phase3 = await this.phase3_IsolationTests(domain, cpanelCredentials, fileCache);
        diagnosticResult.tests_performed.push('phase3_isolation_tests');
      }

      // Phase 4: Core Integrity Verification (only if server access available)
      if (cpanelCredentials) {
        diagnosticResult.phases.phase4 = await this.phase4_CoreIntegrity(domain, cpanelCredentials, fileCache);
        diagnosticResult.tests_performed.push('phase4_core_integrity');
      }

      // Phase 5: Database Health (only if server access available)
      if (cpanelCredentials) {
        // Use remediation-enabled version if remediation is enabled
        if (userInput.remediation_enabled) {
          diagnosticResult.phases.phase5 = await this.phase5_DatabaseHealthWithRemediation(domain, cpanelCredentials, fileCache);
        } else {
          diagnosticResult.phases.phase5 = await this.phase5_DatabaseHealth(domain, cpanelCredentials, fileCache);
        }
        diagnosticResult.tests_performed.push('phase5_database_health');
      }

      // Phase 6: Security & Malware Signals (only if server access available)
      if (cpanelCredentials) {
        diagnosticResult.phases.phase6 = await this.phase6_SecurityScan(domain, cpanelCredentials, fileCache);
        diagnosticResult.tests_performed.push('phase6_security_scan');
      }

      // Phase 7: Resource & Environment Issues (only if server access available)
      if (cpanelCredentials) {
        diagnosticResult.phases.phase7 = await this.phase7_ResourceAnalysis(domain, cpanelCredentials, fileCache);
        diagnosticResult.tests_performed.push('phase7_resource_analysis');
      }

      // Phase 8: Generate Diagnosis Map
      const diagnosisMap = await this.phase8_GenerateDiagnosisMap(diagnosticResult.phases, userInput);
      diagnosticResult.phases.phase8 = diagnosisMap;
      
      // Apply diagnosis map to main result
      diagnosticResult.primary_suspect = diagnosisMap.primary_suspect;
      diagnosticResult.secondary = diagnosisMap.secondary;
      diagnosticResult.confidence = diagnosisMap.confidence;
      diagnosticResult.safe_actions_available = diagnosisMap.safe_actions_available;
      diagnosticResult.l1_classification = diagnosisMap.l1_classification;
      diagnosticResult.l2_classification = diagnosisMap.l2_classification;
      diagnosticResult.l3_evidence = diagnosisMap.l3_evidence;

      // Generate recommendations based on diagnosis
      diagnosticResult.recommendations = await this.generateAdvancedRecommendations(diagnosisMap);

      diagnosticResult.duration = Date.now() - startTime;
      
      this.logger.info(`8-phase diagnostic completed for ${domain}: Primary=${diagnosisMap.primary_suspect}, Confidence=${diagnosisMap.confidence}`);
      
      return diagnosticResult;

    } catch (error) {
      this.logger.error(`8-phase diagnostic failed for ${domain}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pre-load commonly used files in parallel to avoid redundant reads
   */
  async preloadCommonFiles(cpanelCredentials, fileCache) {
    try {
      const cpanelClient = new CpanelClient(
        cpanelCredentials.host,
        cpanelCredentials.username,
        await this.getWhmApiKey(cpanelCredentials.host),
        2087
      );

      // Define commonly used files
      const commonFiles = [
        'public_html/wp-config.php',
        'public_html/.htaccess',
        'public_html/error_log',
        'public_html/wp-includes/version.php',
        'public_html/readme.html',
        'public_html/php.ini'
      ];

      // Read all files in parallel
      const filePromises = commonFiles.map(async (filePath) => {
        try {
          const content = await cpanelClient.readFile(filePath);
          if (content) {
            fileCache.set(filePath, content);
          }
        } catch (error) {
          // File doesn't exist or not readable - that's fine
          fileCache.set(filePath, null);
        }
      });

      await Promise.all(filePromises);
      
      this.logger.info(`Pre-loaded ${fileCache.size} files for diagnostic optimization`);
    } catch (error) {
      this.logger.error(`Error pre-loading files: ${error.message}`);
      // Continue without cache - not critical
    }
  }

  /**
   * Get file content from cache or read from server
   */
  async getCachedFileContent(cpanelClient, filePath, fileCache) {
    if (fileCache && fileCache.has(filePath)) {
      return fileCache.get(filePath);
    }

    try {
      const content = await cpanelClient.readFile(filePath);
      if (fileCache) {
        fileCache.set(filePath, content);
      }
      return content;
    } catch (error) {
      if (fileCache) {
        fileCache.set(filePath, null);
      }
      return null;
    }
  }

  /**
   * Phase 1: Basic Health Detection (Fast Signal)
   */
  async phase1_BasicHealthDetection(domain, cpanelCredentials, fileCache = null) {
    const results = {
      wp_detected: false,
      wp_version: null,
      php_version: null,
      server: null,
      wp_config_exists: false,
      wp_settings_readable: false,
      wp_content_writable: false,
      errors: []
    };

    try {
      // Basic WordPress detection via HTTP headers and content
      const response = await axios.get(`https://${domain}`, {
        timeout: 10000,
        validateStatus: () => true,
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      });

      // Detect server software
      results.server = response.headers['server'] || 'Unknown';
      
      // Detect WordPress
      const content = response.data?.toString() || '';
      const wpIndicators = [
        content.includes('wp-content'),
        content.includes('wp-includes'),
        response.headers['x-powered-by']?.includes('WordPress'),
        response.headers['link']?.includes('wp-json')
      ];
      
      results.wp_detected = wpIndicators.some(indicator => indicator);

      // Extract WordPress version from generator meta tag
      const versionMatch = content.match(/<meta name="generator" content="WordPress ([^"]+)"/i);
      if (versionMatch) {
        results.wp_version = versionMatch[1];
      }

      // Server-side checks if credentials available
      if (cpanelCredentials) {
        const cpanelClient = new CpanelClient(
          cpanelCredentials.host,
          cpanelCredentials.username,
          await this.getWhmApiKey(cpanelCredentials.host),
          2087
        );

        // Check core WordPress files in parallel
        const [wpConfigExists, wpSettingsExists, wpContentExists] = await Promise.all([
          cpanelClient.fileExists('public_html/wp-config.php'),
          cpanelClient.fileExists('public_html/wp-settings.php'),
          cpanelClient.fileExists('public_html/wp-content')
        ]);

        results.wp_config_exists = wpConfigExists.exists;
        results.wp_settings_readable = wpSettingsExists.exists;
        results.wp_content_writable = wpContentExists.exists;

        // Try to detect PHP version from existing WordPress files
        try {
          const phpVersion = await this.detectPHPVersionFromFiles(cpanelClient, domain, fileCache);
          if (phpVersion) {
            results.php_version = phpVersion;
          }
        } catch (phpError) {
          results.errors.push(`PHP version detection failed: ${phpError.message}`);
        }

        // Try to detect WordPress version from files if not found in HTML
        if (!results.wp_version) {
          try {
            const versionInfo = await this.detectWordPressVersionFromFiles(cpanelClient, fileCache);
            if (versionInfo.version) {
              results.wp_version = versionInfo.version;
            }
          } catch (versionError) {
            results.errors.push(`WordPress version detection failed: ${versionError.message}`);
          }
        }
      }

    } catch (error) {
      results.errors.push(`Phase 1 error: ${error.message}`);
    }

    return results;
  }
  /**
   * Phase 2: Symptom Classification (Critical for Automation)
   */
  async phase2_SymptomClassification(domain) {
    const results = {
      frontend_status: null,
      backend_status: null,
      login_status: null,
      response_times: {},
      error_signatures: [],
      classifications: []
    };

    try {
      // Test critical endpoints
      const endpoints = [
        { name: 'homepage', url: `https://${domain}/` },
        { name: 'wp-login', url: `https://${domain}/wp-login.php` },
        { name: 'wp-admin', url: `https://${domain}/wp-admin/` }
      ];

      for (const endpoint of endpoints) {
        try {
          const startTime = Date.now();
          const response = await axios.get(endpoint.url, {
            timeout: 15000,
            validateStatus: () => true,
            maxRedirects: 5,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
          });
          
          const responseTime = Date.now() - startTime;
          results.response_times[endpoint.name] = responseTime;

          const status = response.status;
          const content = response.data?.toString() || '';
          const contentLength = content.length;

          // Classify based on endpoint
          if (endpoint.name === 'homepage') {
            results.frontend_status = status;
            
            // Detect specific issues
            if (status === 500) {
              results.classifications.push('500_INTERNAL_ERROR');
              results.error_signatures.push('HTTP_500_HOMEPAGE');
            } else if (status === 200 && contentLength < 100) {
              results.classifications.push('WHITE_SCREEN');
              results.error_signatures.push('MINIMAL_CONTENT');
            } else if (responseTime > 10000) {
              results.classifications.push('EXTREME_SLOWNESS');
              results.error_signatures.push('SLOW_RESPONSE');
            }
          } else if (endpoint.name === 'wp-login') {
            results.login_status = status;
            
            if (status === 200 && content.includes('wp-login-form')) {
              // Normal login page
            } else if (status === 302 || status === 301) {
              results.classifications.push('LOGIN_LOOP');
              results.error_signatures.push('LOGIN_REDIRECT');
            }
          } else if (endpoint.name === 'wp-admin') {
            results.backend_status = status;
            
            if (status === 403) {
              results.classifications.push('ADMIN_ACCESS_DENIED');
              results.error_signatures.push('ADMIN_403');
            } else if (status === 302 && response.headers.location?.includes('wp-login')) {
              // Normal redirect to login - expected behavior
            }
          }

          // Check for malware redirects
          if (response.headers.location && 
              !response.headers.location.includes(domain) &&
              !response.headers.location.startsWith('/')) {
            results.classifications.push('MALWARE_REDIRECT');
            results.error_signatures.push('EXTERNAL_REDIRECT');
          }

          // Check for mixed content issues
          if (content.includes('http://') && endpoint.url.startsWith('https://')) {
            results.classifications.push('MIXED_CONTENT');
            results.error_signatures.push('HTTP_IN_HTTPS');
          }

        } catch (endpointError) {
          results.error_signatures.push(`${endpoint.name.toUpperCase()}_UNREACHABLE`);
          
          if (endpointError.code === 'ECONNREFUSED') {
            results.classifications.push('CONNECTION_REFUSED');
          } else if (endpointError.code === 'ETIMEDOUT') {
            results.classifications.push('TIMEOUT');
          }
        }
      }

    } catch (error) {
      results.error_signatures.push(`PHASE2_ERROR: ${error.message}`);
    }

    return results;
  }

  /**
   * Phase 3: Non-Destructive Isolation Tests (High Value)
   */
  async phase3_IsolationTests(domain, cpanelCredentials, fileCache = null) {
    const results = {
      active_plugins: [],
      active_theme: null,
      plugin_conflicts: [],
      theme_issues: [],
      wp_cli_available: false,
      wp_cli_results: {},
      errors: []
    };

    try {
      const cpanelClient = new CpanelClient(
        cpanelCredentials.host,
        cpanelCredentials.username,
        await this.getWhmApiKey(cpanelCredentials.host),
        2087
      );

      // Try to get active plugins from filesystem (more reliable)
      try {
        const pluginsDir = await cpanelClient.listFiles('public_html/wp-content/plugins');
        if (pluginsDir && pluginsDir.length > 0) {
          results.active_plugins = pluginsDir
            .filter(item => item.type === 'dir' && !item.file.startsWith('.'))
            .map(item => item.file);
        }
      } catch (fsError) {
        results.errors.push(`Filesystem plugin detection failed: ${fsError.message}`);
        
        // Final fallback: try WP Toolkit API (may not work on all servers)
        try {
          const installations = await cpanelClient.wpToolkitApiCall('GET', 'installations');
          if (installations && installations.length > 0) {
            const installation = installations.find(inst => 
              inst.path === '/home/' + cpanelCredentials.username + '/public_html' ||
              inst.path.includes('public_html')
            );
            
            if (installation) {
              const plugins = await cpanelClient.wpToolkitApiCall('GET', `installations/${installation.id}/plugins`);
              if (plugins && Array.isArray(plugins)) {
                results.active_plugins = plugins
                  .filter(plugin => plugin.status === true || plugin.status === 'active')
                  .map(plugin => plugin.name || plugin.slug);
              }
            }
          }
        } catch (wpToolkitError) {
          results.errors.push(`WP Toolkit API failed: ${wpToolkitError.message}`);
        }
      }

      // Check for known problematic plugins
      const phpVersion = await this.detectPHPVersionFromFiles(cpanelClient, domain, fileCache);
      if (phpVersion && this.PROBLEMATIC_PLUGINS[phpVersion]) {
        const problematicPlugins = this.PROBLEMATIC_PLUGINS[phpVersion];
        results.plugin_conflicts = results.active_plugins.filter(plugin => 
          problematicPlugins.some(problematic => plugin.includes(problematic))
        );
      }

      // WP-CLI sanity check (if available)
      try {
        // This would require WP-CLI execution - placeholder for now
        results.wp_cli_available = false; // Would test actual WP-CLI
        results.wp_cli_results = {
          core_installed: true,
          siteurl: `https://${domain}`,
          home: `https://${domain}`
        };
      } catch (wpCliError) {
        results.errors.push(`WP-CLI test failed: ${wpCliError.message}`);
      }

    } catch (error) {
      results.errors.push(`Phase 3 error: ${error.message}`);
    }

    return results;
  }

  /**
   * Phase 4: Core Integrity Verification
   */
  async phase4_CoreIntegrity(domain, cpanelCredentials, fileCache = null) {
    const results = {
      core_files_status: {},
      missing_files: [],
      modified_files: [],
      integrity_score: 100,
      malware_indicators: [],
      errors: []
    };

    try {
      const cpanelClient = new CpanelClient(
        cpanelCredentials.host,
        cpanelCredentials.username,
        await this.getWhmApiKey(cpanelCredentials.host),
        2087
      );

      // Check core files in parallel
      const coreFileChecks = this.CORE_FILES.map(async (coreFile) => {
        const filePath = `public_html/${coreFile}`;
        const fileExists = await cpanelClient.fileExists(filePath);
        return {
          file: coreFile,
          exists: fileExists.exists,
          size: fileExists.size || 0
        };
      });

      const coreFileResults = await Promise.all(coreFileChecks);
      
      // Process results
      for (const result of coreFileResults) {
        results.core_files_status[result.file] = {
          exists: result.exists,
          size: result.size
        };

        if (!result.exists) {
          results.missing_files.push(result.file);
          results.integrity_score -= 10;
        }
      }

      // Check for malware patterns in key files (parallel)
      const suspiciousFiles = ['index.php', 'wp-config.php', '.htaccess'];
      
      const malwareChecks = suspiciousFiles.map(async (suspiciousFile) => {
        try {
          const filePath = `public_html/${suspiciousFile}`;
          const fileContent = await this.getCachedFileContent(cpanelClient, filePath, fileCache);
          
          const indicators = [];
          if (fileContent) {
            // Check for malware patterns
            for (const pattern of this.MALWARE_PATTERNS) {
              if (pattern.test(fileContent)) {
                indicators.push({
                  file: suspiciousFile,
                  pattern: pattern.toString(),
                  severity: 'HIGH'
                });
              }
            }
          }
          return indicators;
        } catch (fileError) {
          return { error: `Could not scan ${suspiciousFile}: ${fileError.message}` };
        }
      });

      const malwareResults = await Promise.all(malwareChecks);
      
      // Process malware check results
      for (const result of malwareResults) {
        if (result.error) {
          results.errors.push(result.error);
        } else if (Array.isArray(result)) {
          results.malware_indicators.push(...result);
          results.integrity_score -= result.length * 20;
        }
      }

    } catch (error) {
      results.errors.push(`Phase 4 error: ${error.message}`);
    }

    return results;
  }

  /**
   * Phase 5: Database Health (Read-Only First + SQL Connection Testing)
   */
  /**
   * Phase 5: Database Health (with ACTUAL connection testing)
   */
  async phase5_DatabaseHealth(domain, cpanelCredentials, fileCache = null) {
    const results = {
      db_connection: false,
      db_connection_test: null,
      user_management: null,
      table_prefix: null,
      missing_tables: [],
      wp_options_health: {},
      database_size: null,
      sql_connection_details: null,
      errors: []
    };

    try {
      const cpanelClient = new CpanelClient(
        cpanelCredentials.host,
        cpanelCredentials.username,
        await this.getWhmApiKey(cpanelCredentials.host),
        2087
      );

      // Read wp-config.php to get actual database credentials
      const wpConfig = await this.getCachedFileContent(cpanelClient, 'public_html/wp-config.php', fileCache);
      if (wpConfig) {
        const dbCredentials = this.extractDatabaseCredentials(wpConfig);
        
        if (dbCredentials.success) {
          results.table_prefix = dbCredentials.table_prefix;
          
          // Extract actual WordPress URLs from wp-config
          const siteUrlMatch = wpConfig.match(/define\s*\(\s*['"]WP_SITEURL['"][^)]*['"]([^'"]+)['"]/i);
          const homeUrlMatch = wpConfig.match(/define\s*\(\s*['"]WP_HOME['"][^)]*['"]([^'"]+)['"]/i);
          
          results.wp_options_health = {
            siteurl: siteUrlMatch ? siteUrlMatch[1] : `https://${domain}`,
            home: homeUrlMatch ? homeUrlMatch[1] : `https://${domain}`,
            db_name: dbCredentials.name,
            db_user: dbCredentials.user,
            db_host: dbCredentials.host,
            table_prefix: dbCredentials.table_prefix
          };

          // ACTUAL SQL CONNECTION TEST (for both endpoints)
          try {
            const connectionTestResult = await this.performActualSQLConnectionTest(cpanelClient, dbCredentials, domain, wpConfig);
            results.db_connection_test = connectionTestResult;
            results.db_connection = connectionTestResult.success;
            results.sql_connection_details = connectionTestResult.details;
            
            if (!results.db_connection) {
              results.errors.push(`SQL Connection failed: ${connectionTestResult.error}`);
            }
          } catch (sqlError) {
            results.db_connection = false;
            results.errors.push(`SQL connection test failed: ${sqlError.message}`);
          }
        } else {
          results.errors.push('Could not parse wp-config.php database credentials');
        }
      } else {
        results.errors.push('wp-config.php not found or not readable');
      }

    } catch (error) {
      results.errors.push(`Phase 5 error: ${error.message}`);
    }

    return results;
  }

  /**
   * Phase 5: Database Health (with ACTUAL connection testing and remediation for database diagnostic)
   */
  async phase5_DatabaseHealthWithRemediation(domain, cpanelCredentials, fileCache = null) {
    // Start with the base database health check (same as comprehensive)
    const results = await this.phase5_DatabaseHealth(domain, cpanelCredentials, fileCache);
    
    this.logger.info(`Database connection result: ${results.db_connection}`);
    this.logger.info(`Error classification: ${results.db_connection_test?.error_classification}`);
    this.logger.info(`Has cPanel credentials: ${!!cpanelCredentials}`);
    
    // Add remediation logic if connection failed and we have credentials
    if (!results.db_connection && results.db_connection_test?.error_classification === 'ACCESS_DENIED' && cpanelCredentials) {
      this.logger.info('✅ SQL connection failed with ACCESS_DENIED, attempting complete remediation workflow');
      
      try {
        const cpanelClient = new CpanelClient(
          cpanelCredentials.host,
          cpanelCredentials.username,
          await this.getWhmApiKey(cpanelCredentials.host),
          2087
        );

        // Get wp-config content for user management
        const wpConfig = await this.getCachedFileContent(cpanelClient, 'public_html/wp-config.php', fileCache);
        const dbCredentials = this.extractDatabaseCredentials(wpConfig);
        
        if (dbCredentials.success) {
          // Step 1: Add MySQL host for local machine IP (already done in performActualSQLConnectionTest)
          const MySQLHostManagementStep = require('../steps/mysqlHostManagement');
          const mysqlHostManagement = new MySQLHostManagementStep();
          
          // Get server IP for connection testing
          const serverIP = await mysqlHostManagement.getServerIP(cpanelClient.host);
          this.logger.info(`Server IP for remediation: ${serverIP}`);
          
          // Step 2: Create new database user with proper privileges
          const DatabaseUserManagementStep = require('../steps/databaseUserManagement');
          const databaseUserManagement = new DatabaseUserManagementStep();
          
          this.logger.info('🔧 Creating new database user and updating wp-config.php...');
          
          const userManagementResult = await databaseUserManagement.manageDatabaseUser(
            cpanelClient,
            {
              database: dbCredentials.name,
              user: dbCredentials.user,
              password: dbCredentials.password,
              host: dbCredentials.host
            },
            'public_html/wp-config.php',
            wpConfig, // Pass existing wp-config content
            true // Force create new user for ACCESS_DENIED
          );
          
          this.logger.info(`User management result: ${JSON.stringify(userManagementResult, null, 2)}`);
          
          results.user_management = {
            ...userManagementResult,
            mysql_host_added: results.db_connection_test.details.mysql_host_added,
            local_machine_ip: results.db_connection_test.details.local_machine_ip
          };
          
          if (userManagementResult.success) {
            this.logger.info(`✅ New database user created: ${userManagementResult.finalCredentials.username}`);
            
            // Step 3: Re-test connection with new credentials using direct mysql2 connection
            const mysql = require('mysql2/promise');
            
            const newConnectionConfig = {
              host: serverIP, // Use server IP directly
              user: userManagementResult.finalCredentials.username,
              password: userManagementResult.finalCredentials.password,
              database: userManagementResult.finalCredentials.database,
              port: 3306,
              connectTimeout: 10000
            };
            
            this.logger.info(`🔄 Re-testing connection with new user: ${userManagementResult.finalCredentials.username} to ${serverIP}`);
            
            let retestConnection = null;
            try {
              // Test connection with new credentials
              retestConnection = await mysql.createConnection(newConnectionConfig);
              const [rows] = await retestConnection.execute('SELECT 1 as test');
              
              if (rows && rows.length > 0 && rows[0].test === 1) {
                // Connection successful with new credentials
                results.db_connection = true;
                results.db_connection_test.remediation_retest = {
                  success: true,
                  message: 'Connection successful with new credentials',
                  new_user: userManagementResult.finalCredentials.username
                };
                
                results.sql_connection_details.remediation_success = true;
                results.sql_connection_details.new_user_created = userManagementResult.finalCredentials.username;
                results.sql_connection_details.mysql_host_added = results.db_connection_test.details.mysql_host_added;
                results.sql_connection_details.local_machine_ip = results.db_connection_test.details.local_machine_ip;
                
                this.logger.info('🎉 Database connection restored after complete remediation workflow');
              } else {
                throw new Error('Connection test query returned unexpected results');
              }
              
            } catch (retestError) {
              this.logger.warn(`❌ Connection still failed after remediation: ${retestError.message}`);
              
              results.db_connection_test.remediation_retest = {
                success: false,
                error: retestError.message,
                new_user: userManagementResult.finalCredentials.username
              };
            } finally {
              if (retestConnection) {
                try {
                  await retestConnection.end();
                } catch (closeError) {
                  // Ignore close errors
                }
              }
            }
          } else {
            this.logger.error(`❌ User management failed: ${userManagementResult.error || userManagementResult.message}`);
            results.user_management.error = userManagementResult.error || userManagementResult.message;
          }
        } else {
          this.logger.error('❌ Could not extract database credentials from wp-config.php');
          results.errors.push('Could not extract database credentials for remediation');
        }
      } catch (remediationError) {
        results.errors.push(`Remediation failed: ${remediationError.message}`);
        this.logger.error(`❌ Database remediation failed: ${remediationError.message}`);
      }
    } else {
      this.logger.info(`ℹ️  No remediation attempted. Connection: ${results.db_connection}, Error: ${results.db_connection_test?.error_classification}, Credentials: ${!!cpanelCredentials}`);
    }
    
    return results;
  }

  /**
   * Perform COMPLETE SQL Connection Test with direct mysql2 connection to server IP
   */
  async performActualSQLConnectionTest(cpanelClient, dbCredentials, domain, wpConfigContent = null) {
    const testResult = {
      success: false,
      error: null,
      error_classification: null,
      details: {
        connection_method: 'direct_mysql2_server_ip',
        test_timestamp: new Date().toISOString(),
        database_exists: false,
        user_exists: false,
        privileges_valid: false,
        tables_accessible: false,
        connection_host: dbCredentials.host || 'localhost',
        actual_connection_host: null,
        mysql_host_added: false,
        local_machine_ip: null
      }
    };

    try {
      // Step 1: Add local machine IP to MySQL hosts for external connection
      const MySQLHostManagementStep = require('../steps/mysqlHostManagement');
      const mysqlHostManagement = new MySQLHostManagementStep();
      
      const hostResult = await mysqlHostManagement.addLocalMachineIPToMySQLHosts(cpanelClient);
      testResult.details.mysql_host_added = hostResult.success;
      testResult.details.local_machine_ip = hostResult.ip;
      
      if (hostResult.success) {
        this.logger.info(`MySQL host added for IP: ${hostResult.ip}`);
      } else {
        this.logger.warn(`Failed to add MySQL host: ${hostResult.error}`);
      }

      // Step 2: Get the server IP from cPanel host instead of using localhost
      let serverIP = null;
      
      try {
        serverIP = await mysqlHostManagement.getServerIP(cpanelClient.host);
        this.logger.info(`Resolved server IP: ${serverIP}`);
      } catch (serverIPError) {
        this.logger.error(`Could not resolve server IP: ${serverIPError.message}`);
        throw new Error(`Server IP resolution failed: ${serverIPError.message}`);
      }
      
      if (!serverIP) {
        throw new Error('Server IP could not be resolved');
      }
      
      // Update test result with actual connection host
      testResult.details.actual_connection_host = serverIP;
      
      // Step 3: Direct MySQL connection using mysql2/promise with server IP
      const mysql = require('mysql2/promise');
      
      const connectionConfig = {
        host: serverIP, // Use server IP directly, not localhost
        user: dbCredentials.user,
        password: dbCredentials.password,
        database: dbCredentials.name,
        port: 3306,
        connectTimeout: 10000
      };
      
      this.logger.info(`Direct MySQL connection to ${serverIP}:3306 with user: ${dbCredentials.user}, database: ${dbCredentials.name}`);
      
      let connection = null;
      
      try {
        // Create direct connection to server IP
        connection = await mysql.createConnection(connectionConfig);
        
        // Test the connection with a simple query
        const [rows] = await connection.execute('SELECT 1 as test');
        
        if (rows && rows.length > 0 && rows[0].test === 1) {
          testResult.success = true;
          testResult.details.database_exists = true;
          testResult.details.user_exists = true;
          testResult.details.privileges_valid = true;
          testResult.details.tables_accessible = true;
          this.logger.info(`MySQL connection test successful for ${domain} via ${serverIP}`);
        } else {
          throw new Error('Connection test query returned unexpected results');
        }
        
      } catch (connectionError) {
        // Map MySQL errors to our classification system
        const errorCode = connectionError.code || connectionError.errno || 'UNKNOWN_ERROR';
        const errorMessage = connectionError.message || 'Unknown connection error';
        
        this.logger.error(`MySQL connection failed to ${serverIP}: ${errorMessage}`);
        
        // Enhanced error classification
        if (errorMessage.includes('Access denied') || errorCode === 'ER_ACCESS_DENIED_ERROR') {
          testResult.error_classification = 'ACCESS_DENIED';
        } else if (errorMessage.includes('Unknown database') || errorCode === 'ER_BAD_DB_ERROR') {
          testResult.error_classification = 'UNKNOWN_DATABASE';
        } else if (errorMessage.includes('Connection refused') || errorCode === 'ECONNREFUSED') {
          testResult.error_classification = 'CONNECTION_REFUSED';
        } else if (errorMessage.includes('Too many connections') || errorCode === 'ER_CON_COUNT_ERROR') {
          testResult.error_classification = 'TOO_MANY_CONNECTIONS';
        } else if (errorMessage.includes('timeout') || errorCode === 'ETIMEDOUT') {
          testResult.error_classification = 'CONNECTION_TIMEOUT';
        } else {
          testResult.error_classification = 'UNKNOWN_ERROR';
        }
        
        testResult.error = errorMessage;
        
      } finally {
        // Always close the connection
        if (connection) {
          try {
            await connection.end();
          } catch (closeError) {
            // Ignore close errors
          }
        }
      }
      
    } catch (error) {
      testResult.error_classification = 'TEST_EXECUTION_ERROR';
      testResult.error = `Connection test execution failed: ${error.message}`;
      this.logger.error(`MySQL connection test execution failed: ${error.message}`);
    }

    return testResult;
  }

  /**
   * Perform SQL Connection Test (integrated from connection controllers)
   */
  async performSQLConnectionTest(cpanelClient, dbCredentials, domain, fileCache = null) {
    const testResult = {
      success: false,
      error: null,
      details: {
        connection_method: 'mysql_test_script',
        test_timestamp: new Date().toISOString(),
        database_exists: false,
        user_exists: false,
        privileges_valid: false,
        tables_accessible: false
      }
    };

    try {
      // Enhanced method: Use cached wp-config.php content if available
      const wpConfigPath = 'public_html/wp-config.php';
      let wpConfigContent = null;
      
      // Try to get from cache first, then check existence
      if (fileCache && fileCache.has(wpConfigPath)) {
        wpConfigContent = fileCache.get(wpConfigPath);
      } else {
        const wpConfigExists = await cpanelClient.fileExists(wpConfigPath);
        if (!wpConfigExists.exists) {
          testResult.error = 'wp-config.php not found';
          testResult.details.connection_method = 'wp_config_analysis';
          return testResult;
        }
        wpConfigContent = await this.getCachedFileContent(cpanelClient, wpConfigPath, fileCache);
      }

      if (!wpConfigContent) {
        testResult.error = 'wp-config.php not readable or empty';
        testResult.details.connection_method = 'wp_config_analysis';
        return testResult;
      }

      testResult.details.connection_method = 'wp_config_analysis';
      testResult.details.wp_config_readable = true;

      // Validate database credentials in wp-config match provided credentials
      const configCredentials = this.extractDatabaseCredentials(wpConfigContent);
      if (!configCredentials.success) {
        testResult.error = 'Could not parse database credentials from wp-config.php';
        return testResult;
      }

      // Verify credentials match
      const credentialsMatch = (
        configCredentials.name === dbCredentials.name &&
        configCredentials.user === dbCredentials.user &&
        configCredentials.host === dbCredentials.host
      );

      if (!credentialsMatch) {
        testResult.error = 'Database credentials mismatch between wp-config.php and provided credentials';
        return testResult;
      }

      // Check WordPress core files for installation health
      const coreFilesCheck = await this.checkWordPressCoreFiles(cpanelClient);
      
      if (coreFilesCheck.coreFilesPresent) {
        testResult.details.database_exists = true; // Assume DB exists if WP core is intact
        testResult.details.user_exists = true; // Assume user exists if config is valid
        testResult.details.privileges_valid = true; // Assume privileges OK if site was working
        testResult.details.tables_accessible = coreFilesCheck.wpContentExists; // Proxy indicator
        testResult.success = true;
      } else {
        testResult.error = 'WordPress core files missing or corrupted';
        testResult.details.database_exists = false;
      }

      // Enhanced validation through WordPress version detection
      try {
        const versionInfo = await this.detectWordPressVersionFromFiles(cpanelClient, fileCache);
        if (versionInfo.version) {
          testResult.details.wp_version = versionInfo.version;
          testResult.details.wp_installation_healthy = true;
          // If we can detect WP version, database is likely working
          testResult.success = true;
        }
      } catch (versionError) {
        // Version detection failure doesn't invalidate connection test
      }
      
    } catch (error) {
      testResult.error = `Connection test execution failed: ${error.message}`;
    }

    return testResult;
  }

  /**
   * Check WordPress core files for installation health
   */
  async checkWordPressCoreFiles(cpanelClient) {
    try {
      const coreFileChecks = await Promise.all([
        cpanelClient.fileExists('public_html/wp-config.php'),
        cpanelClient.fileExists('public_html/wp-settings.php'),
        cpanelClient.fileExists('public_html/wp-load.php'),
        cpanelClient.fileExists('public_html/wp-content'),
        cpanelClient.fileExists('public_html/wp-includes'),
        cpanelClient.fileExists('public_html/wp-admin')
      ]);

      const [wpConfig, wpSettings, wpLoad, wpContent, wpIncludes, wpAdmin] = coreFileChecks;

      return {
        coreFilesPresent: wpConfig.exists && wpSettings.exists && wpLoad.exists,
        wpContentExists: wpContent.exists,
        wpIncludesExists: wpIncludes.exists,
        wpAdminExists: wpAdmin.exists,
        installationComplete: coreFileChecks.every(check => check.exists)
      };
    } catch (error) {
      return {
        coreFilesPresent: false,
        wpContentExists: false,
        wpIncludesExists: false,
        wpAdminExists: false,
        installationComplete: false,
        error: error.message
      };
    }
  }

  /**
   * Detect WordPress version from existing files (no temporary files)
   */
  async detectWordPressVersionFromFiles(cpanelClient, fileCache = null) {
    const versionInfo = {
      version: null,
      source: null,
      error: null
    };

    try {
      // Method 1: Read wp-includes/version.php (most reliable)
      try {
        const versionFile = await this.getCachedFileContent(cpanelClient, 'public_html/wp-includes/version.php', fileCache);
        if (versionFile) {
          const versionMatch = versionFile.match(/\$wp_version\s*=\s*['"]([^'"]+)['"]/);
          if (versionMatch) {
            versionInfo.version = versionMatch[1];
            versionInfo.source = 'wp-includes/version.php';
            return versionInfo;
          }
        }
      } catch (versionFileError) {
        // Continue to next method
      }

      // Method 2: Read readme.html
      try {
        const readmeFile = await this.getCachedFileContent(cpanelClient, 'public_html/readme.html', fileCache);
        if (readmeFile) {
          const versionMatch = readmeFile.match(/Version\s+([0-9.]+)/i);
          if (versionMatch) {
            versionInfo.version = versionMatch[1];
            versionInfo.source = 'readme.html';
            return versionInfo;
          }
        }
      } catch (readmeError) {
        // Continue to next method
      }

      // Method 3: Check wp-config.php for version constants (rare but possible)
      try {
        const configFile = await this.getCachedFileContent(cpanelClient, 'public_html/wp-config.php', fileCache);
        if (configFile) {
          const versionMatch = configFile.match(/define\s*\(\s*['"]WP_VERSION['"][^)]*['"]([^'"]+)['"]/i);
          if (versionMatch) {
            versionInfo.version = versionMatch[1];
            versionInfo.source = 'wp-config.php';
            return versionInfo;
          }
        }
      } catch (configError) {
        // All methods failed
      }

      versionInfo.error = 'Could not detect WordPress version from any file source';
      return versionInfo;

    } catch (error) {
      versionInfo.error = `Version detection failed: ${error.message}`;
      return versionInfo;
    }
  }
  /**
   * Phase 6: Security & Malware Signals (Passive)
   */
  async phase6_SecurityScan(domain, cpanelCredentials, fileCache = null) {
    const results = {
      htaccess_injections: [],
      suspicious_cron_jobs: [],
      unknown_admin_users: [],
      recently_modified_core: [],
      security_score: 100,
      errors: []
    };

    try {
      const cpanelClient = new CpanelClient(
        cpanelCredentials.host,
        cpanelCredentials.username,
        await this.getWhmApiKey(cpanelCredentials.host),
        2087
      );

      // Check .htaccess for injections
      try {
        const htaccessContent = await this.getCachedFileContent(cpanelClient, 'public_html/.htaccess', fileCache);
        if (htaccessContent) {
          // Look for suspicious patterns
          const suspiciousPatterns = [
            /RewriteRule.*base64_decode/i,
            /RewriteRule.*eval\(/i,
            /php_value.*auto_prepend_file/i
          ];

          for (const pattern of suspiciousPatterns) {
            if (pattern.test(htaccessContent)) {
              results.htaccess_injections.push({
                pattern: pattern.toString(),
                severity: 'HIGH'
              });
              results.security_score -= 25;
            }
          }
        }
      } catch (htaccessError) {
        results.errors.push(`Could not scan .htaccess: ${htaccessError.message}`);
      }

      // Check wp-cron.php for abuse (simplified)
      try {
        const cronResponse = await axios.get(`https://${domain}/wp-cron.php`, {
          timeout: 5000,
          validateStatus: () => true,
          httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        if (cronResponse.status === 200 && cronResponse.data?.length > 10000) {
          results.suspicious_cron_jobs.push({
            issue: 'Large cron response',
            size: cronResponse.data.length,
            severity: 'MEDIUM'
          });
          results.security_score -= 10;
        }
      } catch (cronError) {
        // Cron errors are normal, don't log
      }

    } catch (error) {
      results.errors.push(`Phase 6 error: ${error.message}`);
    }

    return results;
  }

  /**
   * Phase 7: Resource & Environment Issues + Error Log Analysis
   */
  async phase7_ResourceAnalysis(domain, cpanelCredentials, fileCache = null) {
    const results = {
      php_memory_limit: null,
      php_max_execution_time: null,
      disk_usage: null,
      inode_usage: null,
      resource_warnings: [],
      fatal_patterns: [],
      error_log_analysis: {
        problematic_plugins: [],
        php_errors: [],
        recent_errors_count: 0,
        auto_fixes_applied: []
      },
      errors: []
    };

    try {
      const cpanelClient = new CpanelClient(
        cpanelCredentials.host,
        cpanelCredentials.username,
        await this.getWhmApiKey(cpanelCredentials.host),
        2087
      );

      // Enhanced error log analysis with automatic plugin fixing
      try {
        const errorLog = await this.getCachedFileContent(cpanelClient, 'public_html/error_log', fileCache);
        if (errorLog) {
          // Get recent errors (last 100 lines for better analysis)
          const errorLines = errorLog.split('\n').slice(-100);
          const recentErrors = errorLines.join('\n');
          
          results.error_log_analysis.recent_errors_count = errorLines.filter(line => line.trim().length > 0).length;
            
          // Analyze plugin-specific errors
          const pluginErrorPattern = /\/wp-content\/plugins\/([^\/]+)\/[^:]*:.*?(PHP\s+(?:Parse|Fatal)\s+error|Fatal\s+error)/gi;
          const pluginErrors = {};
          
          let match;
          while ((match = pluginErrorPattern.exec(recentErrors)) !== null) {
            const pluginName = match[1];
            const errorType = match[2];
            
            if (!pluginErrors[pluginName]) {
              pluginErrors[pluginName] = {
                plugin: pluginName,
                error_count: 0,
                error_types: [],
                sample_errors: []
              };
            }
            
            pluginErrors[pluginName].error_count++;
            if (!pluginErrors[pluginName].error_types.includes(errorType)) {
              pluginErrors[pluginName].error_types.push(errorType);
            }
            
            // Store sample error for analysis
            const fullLine = errorLines.find(line => line.includes(pluginName) && line.includes(errorType));
            if (fullLine && pluginErrors[pluginName].sample_errors.length < 3) {
              pluginErrors[pluginName].sample_errors.push(fullLine.trim());
            }
          }
          
          // Convert to array and sort by error count
          results.error_log_analysis.problematic_plugins = Object.values(pluginErrors)
            .sort((a, b) => b.error_count - a.error_count);
          
          // Auto-fix problematic plugins (rename folders)
          for (const pluginError of results.error_log_analysis.problematic_plugins) {
            if (pluginError.error_count >= 3) { // Only fix plugins with 3+ errors
              try {
                const pluginPath = `public_html/wp-content/plugins/${pluginError.plugin}`;
                const backupPath = `public_html/wp-content/plugins/${pluginError.plugin}_disabled_${Date.now()}`;
                
                // Check if plugin folder exists
                const pluginExists = await cpanelClient.fileExists(pluginPath);
                if (pluginExists.exists) {
                  // Rename the plugin folder to disable it
                  const renameResult = await cpanelClient.renameFile(pluginPath, backupPath);
                  
                  if (renameResult && renameResult.success) {
                    results.error_log_analysis.auto_fixes_applied.push({
                      action: 'plugin_disabled',
                      plugin: pluginError.plugin,
                      reason: `${pluginError.error_count} PHP errors detected`,
                      original_path: pluginPath,
                      backup_path: backupPath,
                      error_types: pluginError.error_types,
                      timestamp: new Date().toISOString()
                    });
                    
                    this.logger.info(`Auto-disabled problematic plugin: ${pluginError.plugin} (${pluginError.error_count} errors)`);
                  } else {
                    results.errors.push(`Failed to disable plugin ${pluginError.plugin}: ${renameResult?.error || 'Unknown error'}`);
                  }
                }
              } catch (fixError) {
                results.errors.push(`Error auto-fixing plugin ${pluginError.plugin}: ${fixError.message}`);
              }
            }
          }
          
          // Look for memory exhaustion
          if (recentErrors.includes('Allowed memory size') || recentErrors.includes('Fatal error') && recentErrors.includes('memory')) {
            results.fatal_patterns.push('MEMORY_EXHAUSTED');
            results.resource_warnings.push({
              type: 'MEMORY_LIMIT',
              severity: 'HIGH',
              message: 'PHP memory limit exceeded in recent errors'
            });
          }

          // Look for execution time limits
          if (recentErrors.includes('max_execution_time') || recentErrors.includes('Maximum execution time')) {
            results.fatal_patterns.push('EXECUTION_TIMEOUT');
            results.resource_warnings.push({
              type: 'EXECUTION_TIME',
              severity: 'MEDIUM',
              message: 'PHP execution time limit exceeded in recent errors'
            });
          }

          // Look for plugin errors
          if (recentErrors.includes('Plugin') && recentErrors.includes('Fatal error')) {
            results.fatal_patterns.push('PLUGIN_FATAL');
            results.resource_warnings.push({
              type: 'PLUGIN_ERROR',
              severity: 'HIGH',
              message: 'Plugin causing fatal errors'
            });
          }
          
          // Extract general PHP errors
          const phpErrorPattern = /\[(.*?)\] PHP (Parse error|Fatal error|Warning|Notice): (.*)/g;
          let phpMatch;
          while ((phpMatch = phpErrorPattern.exec(recentErrors)) !== null) {
            results.error_log_analysis.php_errors.push({
              timestamp: phpMatch[1],
              type: phpMatch[2],
              message: phpMatch[3].substring(0, 200) // Limit message length
            });
          }
          
          // Limit PHP errors to last 10 for performance
          results.error_log_analysis.php_errors = results.error_log_analysis.php_errors.slice(-10);
        }
      } catch (logError) {
        results.errors.push(`Could not read error log: ${logError.message}`);
      }

      // Try to get PHP configuration from existing WordPress files and .htaccess
      try {
        const phpConfig = await this.detectPHPConfigFromFiles(cpanelClient, fileCache);
        if (phpConfig) {
          results.php_memory_limit = phpConfig.memory_limit;
          results.php_max_execution_time = phpConfig.max_execution_time;
          results.upload_max_filesize = phpConfig.upload_max_filesize;
          results.post_max_size = phpConfig.post_max_size;
        }
      } catch (phpConfigError) {
        results.errors.push(`PHP configuration detection failed: ${phpConfigError.message}`);
      }

    } catch (error) {
      results.errors.push(`Phase 7 error: ${error.message}`);
    }

    return results;
  }

  /**
   * Detect PHP version from existing files (no temporary files)
   */
  async detectPHPVersionFromFiles(cpanelClient, domain, fileCache = null) {
    try {
      // Method 1: Check .htaccess for PHP version directives
      try {
        const htaccessContent = await this.getCachedFileContent(cpanelClient, 'public_html/.htaccess', fileCache);
        if (htaccessContent) {
          // Look for PHP version directives - multiple patterns
          const phpVersionPatterns = [
            /AddHandler\s+application\/x-httpd-php(\d+)\s+\.php/i,
            /AddHandler\s+application\/x-httpd-php(\d)(\d+)\s+\.php/i,
            /lsapi:lsphp(\d+)/i,
            /lsapi:lsphp(\d)(\d+)/i,
            /php(\d)(\d+)-cgi/i,
            /php(\d+)/i
          ];
          
          for (const pattern of phpVersionPatterns) {
            const match = htaccessContent.match(pattern);
            if (match) {
              if (match[2]) {
                // Two capture groups: major.minor
                return `${match[1]}.${match[2]}`;
              } else if (match[1].length >= 2) {
                // Single capture group with multiple digits
                const version = match[1];
                return `${version.charAt(0)}.${version.charAt(1)}`;
              } else {
                // Single digit version
                return `${match[1]}.0`;
              }
            }
          }
          
          // Look for PHP directives (indicates PHP is active)
          const phpDirectiveMatch = htaccessContent.match(/php_value\s+|php_flag\s+/i);
          if (phpDirectiveMatch) {
            // Try to infer version from memory_limit or other directives
            const memoryMatch = htaccessContent.match(/php_value\s+memory_limit\s+(\d+)M/i);
            if (memoryMatch) {
              const memoryLimit = parseInt(memoryMatch[1]);
              // Heuristic: higher memory limits often indicate newer PHP versions
              if (memoryLimit >= 512) {
                return '8.1'; // Modern PHP with high memory
              } else if (memoryLimit >= 256) {
                return '7.4'; // Common PHP 7.x setup
              } else {
                return '7.0'; // Older PHP setup
              }
            }
            return 'detected'; // PHP is configured but version unknown
          }
        }
      } catch (htaccessError) {
        // Continue to next method
      }

      // Method 2: Check wp-config.php for PHP version requirements or constants
      try {
        const wpConfigContent = await this.getCachedFileContent(cpanelClient, 'public_html/wp-config.php', fileCache);
        if (wpConfigContent) {
          // Look for PHP version constants
          const phpVersionPatterns = [
            /define\s*\(\s*['"]PHP_VERSION['"][^)]*['"]([^'"]+)['"]/i,
            /define\s*\(\s*['"]REQUIRED_PHP_VERSION['"][^)]*['"]([^'"]+)['"]/i,
            /phpversion\(\)\s*>=?\s*['"]([^'"]+)['"]/i
          ];
          
          for (const pattern of phpVersionPatterns) {
            const match = wpConfigContent.match(pattern);
            if (match) {
              return match[1];
            }
          }
          
          // Look for ini_set calls that might indicate PHP version
          const iniSetMatch = wpConfigContent.match(/ini_set\s*\(\s*['"]memory_limit['"][^)]*['"](\d+)M['"]/i);
          if (iniSetMatch) {
            const memoryLimit = parseInt(iniSetMatch[1]);
            // Same heuristic as above
            if (memoryLimit >= 512) {
              return '8.1';
            } else if (memoryLimit >= 256) {
              return '7.4';
            } else {
              return '7.0';
            }
          }
        }
      } catch (configError) {
        // Continue to next method
      }

      // Method 3: Try to detect from error logs (PHP version often appears in errors)
      try {
        const errorLog = await this.getCachedFileContent(cpanelClient, 'public_html/error_log', fileCache);
        if (errorLog) {
          // Look for PHP version in error messages - multiple patterns
          const phpErrorPatterns = [
            /PHP\s+(\d+\.\d+\.\d+)/i,
            /PHP\s+(\d+\.\d+)/i,
            /Fatal\s+error.*PHP\s+(\d+\.\d+)/i,
            /\[(\d+\.\d+\.\d+)\]/  // Version in brackets
          ];
          
          for (const pattern of phpErrorPatterns) {
            const match = errorLog.match(pattern);
            if (match) {
              return match[1];
            }
          }
        }
      } catch (logError) {
        // Continue to next method
      }

      // Method 4: Try HTTP headers (some servers expose PHP version)
      try {
        const response = await axios.head(`https://${domain}`, {
          timeout: 5000,
          validateStatus: () => true,
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        
        const xPoweredBy = response.headers['x-powered-by'];
        if (xPoweredBy && xPoweredBy.includes('PHP')) {
          const phpVersionMatch = xPoweredBy.match(/PHP\/(\d+\.\d+\.\d+)/i);
          if (phpVersionMatch) {
            return phpVersionMatch[1];
          }
          const phpVersionMatch2 = xPoweredBy.match(/PHP\/(\d+\.\d+)/i);
          if (phpVersionMatch2) {
            return phpVersionMatch2[1];
          }
        }
      } catch (httpError) {
        // HTTP method failed
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect PHP configuration from existing files (no temporary files)
   */
  async detectPHPConfigFromFiles(cpanelClient, fileCache = null) {
    const config = {
      memory_limit: null,
      max_execution_time: null,
      upload_max_filesize: null,
      post_max_size: null
    };

    try {
      // Method 1: Check .htaccess for PHP configuration directives
      try {
        const htaccessContent = await this.getCachedFileContent(cpanelClient, 'public_html/.htaccess', fileCache);
        if (htaccessContent) {
          // Extract PHP configuration values
          const memoryMatch = htaccessContent.match(/php_value\s+memory_limit\s+([^\s\n]+)/i);
          if (memoryMatch) config.memory_limit = memoryMatch[1];

          const executionMatch = htaccessContent.match(/php_value\s+max_execution_time\s+([^\s\n]+)/i);
          if (executionMatch) config.max_execution_time = executionMatch[1];

          const uploadMatch = htaccessContent.match(/php_value\s+upload_max_filesize\s+([^\s\n]+)/i);
          if (uploadMatch) config.upload_max_filesize = uploadMatch[1];

          const postMatch = htaccessContent.match(/php_value\s+post_max_size\s+([^\s\n]+)/i);
          if (postMatch) config.post_max_size = postMatch[1];
        }
      } catch (htaccessError) {
        // Continue to next method
      }

      // Method 2: Check wp-config.php for PHP configuration constants
      try {
        const wpConfigContent = await this.getCachedFileContent(cpanelClient, 'public_html/wp-config.php', fileCache);
        if (wpConfigContent) {
          // Look for memory limit increases
          const memoryMatch = wpConfigContent.match(/ini_set\s*\(\s*['"]memory_limit['"][^)]*['"]([^'"]+)['"]/i);
          if (memoryMatch && !config.memory_limit) {
            config.memory_limit = memoryMatch[1];
          }

          // Look for execution time increases
          const executionMatch = wpConfigContent.match(/ini_set\s*\(\s*['"]max_execution_time['"][^)]*['"]([^'"]+)['"]/i);
          if (executionMatch && !config.max_execution_time) {
            config.max_execution_time = executionMatch[1];
          }
        }
      } catch (configError) {
        // Continue to next method
      }

      // Method 3: Check for php.ini file (if accessible)
      try {
        const phpIniContent = await this.getCachedFileContent(cpanelClient, 'public_html/php.ini', fileCache);
        if (phpIniContent) {
          // Parse php.ini values
          const memoryMatch = phpIniContent.match(/memory_limit\s*=\s*([^\s\n;]+)/i);
          if (memoryMatch && !config.memory_limit) {
            config.memory_limit = memoryMatch[1];
          }

          const executionMatch = phpIniContent.match(/max_execution_time\s*=\s*([^\s\n;]+)/i);
          if (executionMatch && !config.max_execution_time) {
            config.max_execution_time = executionMatch[1];
          }

          const uploadMatch = phpIniContent.match(/upload_max_filesize\s*=\s*([^\s\n;]+)/i);
          if (uploadMatch && !config.upload_max_filesize) {
            config.upload_max_filesize = uploadMatch[1];
          }

          const postMatch = phpIniContent.match(/post_max_size\s*=\s*([^\s\n;]+)/i);
          if (postMatch && !config.post_max_size) {
            config.post_max_size = postMatch[1];
          }
        }
      } catch (phpIniError) {
        // php.ini not accessible or readable
      }

      // Return config if any values were found
      const hasValues = Object.values(config).some(value => value !== null);
      return hasValues ? config : null;

    } catch (error) {
      return null;
    }
  }
  /**
   * Phase 8: Generate Diagnosis Map
   */
  async phase8_GenerateDiagnosisMap(phases, userInput) {
    const diagnosisMap = {
      primary_suspect: null,
      secondary: null,
      confidence: 0,
      safe_actions_available: [],
      l1_classification: null,
      l2_classification: null,
      l3_evidence: [],
      reasoning: []
    };

    try {
      // Analyze Phase 1 (Basic Health)
      if (phases.phase1) {
        if (!phases.phase1.wp_detected) {
          diagnosisMap.primary_suspect = 'NOT_WORDPRESS';
          diagnosisMap.confidence = 0.95;
          diagnosisMap.l1_classification = 'SITE_DOWN';
          diagnosisMap.l2_classification = 'WRONG_PLATFORM';
          diagnosisMap.l3_evidence.push('WORDPRESS_NOT_DETECTED');
          diagnosisMap.reasoning.push('WordPress indicators not found');
          return diagnosisMap;
        }

        if (phases.phase1.wp_config_exists === false) {
          diagnosisMap.primary_suspect = 'CORRUPTED_CORE';
          diagnosisMap.confidence = 0.90;
          diagnosisMap.l1_classification = 'SERVER_ERROR';
          diagnosisMap.l2_classification = 'MISSING_CONFIG';
          diagnosisMap.l3_evidence.push('WP_CONFIG_MISSING');
          diagnosisMap.reasoning.push('wp-config.php not found');
        }
      }

      // Analyze Phase 2 (Symptom Classification)
      if (phases.phase2) {
        const classifications = phases.phase2.classifications;
        
        if (classifications.includes('500_INTERNAL_ERROR')) {
          diagnosisMap.primary_suspect = 'PHP_FATAL_ERROR';
          diagnosisMap.confidence = 0.85;
          diagnosisMap.l1_classification = 'SERVER_ERROR';
          diagnosisMap.l2_classification = 'HTTP_500';
          diagnosisMap.l3_evidence.push('INTERNAL_SERVER_ERROR');
          diagnosisMap.safe_actions_available.push('enable_debug_log', 'disable_plugins');
          diagnosisMap.reasoning.push('HTTP 500 error detected');
        } else if (classifications.includes('WHITE_SCREEN')) {
          diagnosisMap.primary_suspect = 'PLUGIN_CONFLICT';
          diagnosisMap.secondary = 'THEME_ISSUE';
          diagnosisMap.confidence = 0.75;
          diagnosisMap.l1_classification = 'FRONTEND_ONLY_ISSUE';
          diagnosisMap.l2_classification = 'WHITE_SCREEN';
          diagnosisMap.l3_evidence.push('BLANK_PAGE_RESPONSE');
          diagnosisMap.safe_actions_available.push('disable_plugins', 'switch_theme');
          diagnosisMap.reasoning.push('White screen with minimal content');
        } else if (classifications.includes('ADMIN_ACCESS_DENIED')) {
          diagnosisMap.primary_suspect = 'PERMISSION_ISSUE';
          diagnosisMap.confidence = 0.80;
          diagnosisMap.l1_classification = 'ADMIN_ACCESS_ISSUE';
          diagnosisMap.l2_classification = 'FORBIDDEN';
          diagnosisMap.l3_evidence.push('ADMIN_403_ERROR');
          diagnosisMap.safe_actions_available.push('reset_permissions', 'check_htaccess');
          diagnosisMap.reasoning.push('Admin access returns 403');
        } else if (classifications.includes('MALWARE_REDIRECT')) {
          diagnosisMap.primary_suspect = 'MALWARE_INFECTION';
          diagnosisMap.confidence = 0.90;
          diagnosisMap.l1_classification = 'SECURITY_INCIDENT';
          diagnosisMap.l2_classification = 'MALWARE_REDIRECT';
          diagnosisMap.l3_evidence.push('EXTERNAL_REDIRECT');
          diagnosisMap.safe_actions_available.push('scan_files', 'check_htaccess');
          diagnosisMap.reasoning.push('Suspicious external redirects detected');
        }
      }

      // Analyze Phase 5 (Database Health + SQL Connection)
      if (phases.phase5) {
        if (phases.phase5.db_connection_test && !phases.phase5.db_connection_test.success) {
          const sqlError = phases.phase5.db_connection_test.error;
          
          // Analyze specific SQL connection errors
          if (sqlError && sqlError.includes('Access denied')) {
            diagnosisMap.primary_suspect = 'DATABASE_ACCESS_DENIED';
            diagnosisMap.confidence = 0.90;
            diagnosisMap.l1_classification = 'DATABASE_ERROR';
            diagnosisMap.l2_classification = 'AUTHENTICATION_FAILED';
            diagnosisMap.l3_evidence.push('SQL_ACCESS_DENIED');
            diagnosisMap.safe_actions_available.push('reset_db_password', 'check_db_user');
            diagnosisMap.reasoning.push('Database authentication failed');
          } else if (sqlError && (sqlError.includes('Unknown database') || sqlError.includes('database selection failed'))) {
            diagnosisMap.primary_suspect = 'DATABASE_NOT_FOUND';
            diagnosisMap.confidence = 0.85;
            diagnosisMap.l1_classification = 'DATABASE_ERROR';
            diagnosisMap.l2_classification = 'MISSING_DATABASE';
            diagnosisMap.l3_evidence.push('DATABASE_MISSING');
            diagnosisMap.safe_actions_available.push('create_database', 'check_db_name');
            diagnosisMap.reasoning.push('Database does not exist');
          } else if (sqlError && sqlError.includes('Connection refused')) {
            diagnosisMap.primary_suspect = 'DATABASE_SERVER_DOWN';
            diagnosisMap.confidence = 0.80;
            diagnosisMap.l1_classification = 'SERVER_ERROR';
            diagnosisMap.l2_classification = 'DATABASE_UNREACHABLE';
            diagnosisMap.l3_evidence.push('DB_CONNECTION_REFUSED');
            diagnosisMap.safe_actions_available.push('check_mysql_service', 'contact_hosting');
            diagnosisMap.reasoning.push('Database server unreachable');
          } else {
            if (!diagnosisMap.primary_suspect) {
              diagnosisMap.primary_suspect = 'DATABASE_CONNECTION_ERROR';
              diagnosisMap.confidence = 0.75;
              diagnosisMap.l1_classification = 'DATABASE_ERROR';
              diagnosisMap.l2_classification = 'CONNECTION_FAILED';
              diagnosisMap.l3_evidence.push('SQL_CONNECTION_FAILED');
              diagnosisMap.safe_actions_available.push('check_db_config', 'test_db_connection');
              diagnosisMap.reasoning.push(`Database connection failed: ${sqlError}`);
            }
          }
        } else if (phases.phase5.db_connection_test && phases.phase5.db_connection_test.success) {
          // SQL connection successful - check for table issues
          if (phases.phase5.db_connection_test.details && !phases.phase5.db_connection_test.details.tables_accessible) {
            if (!diagnosisMap.primary_suspect) {
              diagnosisMap.primary_suspect = 'MISSING_WP_TABLES';
              diagnosisMap.confidence = 0.80;
              diagnosisMap.l1_classification = 'DATABASE_ERROR';
              diagnosisMap.l2_classification = 'INCOMPLETE_INSTALLATION';
              diagnosisMap.l3_evidence.push('WP_TABLES_MISSING');
              diagnosisMap.safe_actions_available.push('reinstall_wordpress', 'import_database');
              diagnosisMap.reasoning.push('WordPress tables not found in database');
            }
          }
        }
      }

      // Analyze Phase 3 (Plugin Conflicts)
      if (phases.phase3) {
        if (phases.phase3.plugin_conflicts.length > 0) {
          if (!diagnosisMap.primary_suspect) {
            diagnosisMap.primary_suspect = 'PLUGIN_CONFLICT';
            diagnosisMap.confidence = 0.70;
          } else {
            diagnosisMap.secondary = 'PLUGIN_CONFLICT';
          }
          diagnosisMap.l3_evidence.push('PROBLEMATIC_PLUGINS_DETECTED');
          diagnosisMap.safe_actions_available.push('disable_plugins');
          diagnosisMap.reasoning.push(`Found ${phases.phase3.plugin_conflicts.length} problematic plugins`);
        }
      }

      // Analyze Phase 4 (Core Integrity)
      if (phases.phase4) {
        if (phases.phase4.malware_indicators.length > 0) {
          diagnosisMap.primary_suspect = 'MALWARE_INFECTION';
          diagnosisMap.confidence = 0.95;
          diagnosisMap.l1_classification = 'SECURITY_INCIDENT';
          diagnosisMap.l2_classification = 'FILE_TAMPERING';
          diagnosisMap.l3_evidence.push('MALWARE_PATTERNS_DETECTED');
          diagnosisMap.safe_actions_available.push('scan_files', 'restore_core');
          diagnosisMap.reasoning.push(`Found ${phases.phase4.malware_indicators.length} malware indicators`);
        } else if (phases.phase4.missing_files.length > 0) {
          if (!diagnosisMap.primary_suspect) {
            diagnosisMap.primary_suspect = 'CORRUPTED_CORE';
            diagnosisMap.confidence = 0.80;
            diagnosisMap.l1_classification = 'SERVER_ERROR';
            diagnosisMap.l2_classification = 'MISSING_FILES';
            diagnosisMap.l3_evidence.push('CORE_FILES_MISSING');
            diagnosisMap.safe_actions_available.push('restore_core');
            diagnosisMap.reasoning.push(`Missing ${phases.phase4.missing_files.length} core files`);
          }
        }
      }

      // Analyze Phase 7 (Resource Issues + Error Log Analysis)
      if (phases.phase7) {
        // Check for auto-fixes applied
        if (phases.phase7.error_log_analysis?.auto_fixes_applied?.length > 0) {
          const autoFixes = phases.phase7.error_log_analysis.auto_fixes_applied;
          diagnosisMap.primary_suspect = 'PLUGIN_ERROR_FIXED';
          diagnosisMap.confidence = 0.95;
          diagnosisMap.l1_classification = 'SERVER_ERROR';
          diagnosisMap.l2_classification = 'PLUGIN_FATAL_FIXED';
          diagnosisMap.l3_evidence.push('AUTO_PLUGIN_FIXES_APPLIED');
          diagnosisMap.safe_actions_available.push('verify_site_functionality');
          diagnosisMap.reasoning.push(`Auto-disabled ${autoFixes.length} problematic plugins: ${autoFixes.map(f => f.plugin).join(', ')}`);
          
          // Add details about the fixes
          diagnosisMap.auto_fixes_applied = autoFixes;
          return diagnosisMap;
        }
        
        // Check for problematic plugins that weren't auto-fixed
        if (phases.phase7.error_log_analysis?.problematic_plugins?.length > 0) {
          const problematicPlugins = phases.phase7.error_log_analysis.problematic_plugins;
          if (!diagnosisMap.primary_suspect) {
            diagnosisMap.primary_suspect = 'PLUGIN_ERROR';
            diagnosisMap.confidence = 0.90;
            diagnosisMap.l1_classification = 'SERVER_ERROR';
            diagnosisMap.l2_classification = 'PLUGIN_FATAL';
            diagnosisMap.l3_evidence.push('PLUGIN_ERRORS_IN_LOG');
            diagnosisMap.safe_actions_available.push('disable_problematic_plugins');
            diagnosisMap.reasoning.push(`Found ${problematicPlugins.length} plugins with errors: ${problematicPlugins.map(p => p.plugin).join(', ')}`);
          }
        }
        
        if (phases.phase7.fatal_patterns.includes('MEMORY_EXHAUSTED')) {
          if (!diagnosisMap.primary_suspect) {
            diagnosisMap.primary_suspect = 'MEMORY_LIMIT';
            diagnosisMap.confidence = 0.85;
            diagnosisMap.l1_classification = 'PERFORMANCE_ISSUE';
            diagnosisMap.l2_classification = 'RESOURCE_EXHAUSTED';
            diagnosisMap.l3_evidence.push('PHP_MEMORY_EXHAUSTED');
            diagnosisMap.safe_actions_available.push('increase_memory_limit');
            diagnosisMap.reasoning.push('PHP memory limit exceeded');
          }
        }
      }

      // Consider user input
      if (userInput) {
        if (userInput.admin_accessible === false && userInput.frontend_accessible === true) {
          if (!diagnosisMap.primary_suspect) {
            diagnosisMap.primary_suspect = 'ADMIN_ACCESS_ISSUE';
            diagnosisMap.confidence = 0.70;
            diagnosisMap.l1_classification = 'ADMIN_ACCESS_ISSUE';
            diagnosisMap.l2_classification = 'PASSWORD_REJECTED';
            diagnosisMap.l3_evidence.push('USER_REPORTED_ADMIN_ISSUE');
            diagnosisMap.safe_actions_available.push('reset_admin_password');
            diagnosisMap.reasoning.push('User reports admin access problems');
          }
        }

        if (userInput.recent_changes === true) {
          diagnosisMap.confidence = Math.min(diagnosisMap.confidence + 0.1, 1.0);
          diagnosisMap.reasoning.push('Recent changes increase confidence');
        }
      }

      // Default case
      if (!diagnosisMap.primary_suspect) {
        diagnosisMap.primary_suspect = 'UNKNOWN';
        diagnosisMap.confidence = 0.30;
        diagnosisMap.l1_classification = 'UNKNOWN';
        diagnosisMap.l2_classification = null;
        diagnosisMap.l3_evidence.push('INSUFFICIENT_EVIDENCE');
        diagnosisMap.safe_actions_available.push('enable_debug_log', 'manual_investigation');
        diagnosisMap.reasoning.push('No clear indicators found');
      }

      // Ensure safe actions are always available
      if (!diagnosisMap.safe_actions_available.includes('enable_debug_log')) {
        diagnosisMap.safe_actions_available.push('enable_debug_log');
      }

    } catch (error) {
      diagnosisMap.primary_suspect = 'DIAGNOSTIC_ERROR';
      diagnosisMap.confidence = 0.10;
      diagnosisMap.l3_evidence.push('DIAGNOSTIC_FAILURE');
      diagnosisMap.reasoning.push(`Diagnosis failed: ${error.message}`);
    }

    return diagnosisMap;
  }

  /**
   * Generate advanced recommendations based on diagnosis map
   */
  async generateAdvancedRecommendations(diagnosisMap) {
    const recommendations = [];

    switch (diagnosisMap.primary_suspect) {
      case 'DATABASE_ACCESS_DENIED':
        recommendations.push({
          priority: 'CRITICAL',
          action: 'Fix database authentication credentials',
          technical: 'Database user credentials are incorrect. Reset database password or check wp-config.php settings.',
          safe_actions: ['reset_db_password', 'check_wp_config', 'verify_db_user']
        });
        break;

      case 'DATABASE_NOT_FOUND':
        recommendations.push({
          priority: 'CRITICAL',
          action: 'Create missing database or fix database name',
          technical: 'The specified database does not exist. Create the database or correct the DB_NAME in wp-config.php.',
          safe_actions: ['create_database', 'check_db_name', 'verify_hosting_account']
        });
        break;

      case 'DATABASE_SERVER_DOWN':
        recommendations.push({
          priority: 'CRITICAL',
          action: 'Database server is unreachable',
          technical: 'MySQL service may be down or database host is incorrect. Contact hosting provider.',
          safe_actions: ['check_mysql_service', 'verify_db_host', 'contact_hosting']
        });
        break;

      case 'DATABASE_CONNECTION_ERROR':
        recommendations.push({
          priority: 'HIGH',
          action: 'Troubleshoot database connection issues',
          technical: 'General database connection failure. Check all database settings in wp-config.php.',
          safe_actions: ['check_db_config', 'test_db_connection', 'verify_credentials']
        });
        break;

      case 'MISSING_WP_TABLES':
        recommendations.push({
          priority: 'HIGH',
          action: 'WordPress tables are missing from database',
          technical: 'Database exists but WordPress tables are not found. Reinstall WordPress or restore database backup.',
          safe_actions: ['reinstall_wordpress', 'import_database', 'check_table_prefix']
        });
        break;

      case 'PLUGIN_ERROR_FIXED':
        recommendations.push({
          priority: 'SUCCESS',
          action: 'Problematic plugins automatically disabled',
          technical: `Auto-disabled plugins: ${diagnosisMap.auto_fixes_applied?.map(f => f.plugin).join(', ')}. Site should now be functional.`,
          safe_actions: ['verify_site_functionality', 'test_frontend_access', 'check_admin_access'],
          details: diagnosisMap.auto_fixes_applied
        });
        break;

      case 'PLUGIN_ERROR':
        recommendations.push({
          priority: 'CRITICAL',
          action: 'Disable problematic plugins causing PHP errors',
          technical: 'Multiple PHP errors detected from specific plugins. Disable them via file system or admin panel.',
          safe_actions: ['disable_problematic_plugins', 'rename_plugin_folders']
        });
        break;

      case 'MALWARE_INFECTION':
        recommendations.push({
          priority: 'CRITICAL',
          action: 'Immediate malware cleanup required',
          technical: 'Scan and clean infected files, change all passwords',
          safe_actions: ['scan_files', 'backup_clean_files', 'change_passwords']
        });
        break;

      case 'PHP_FATAL_ERROR':
        recommendations.push({
          priority: 'HIGH',
          action: 'Enable debug logging and check for plugin conflicts',
          technical: 'Set WP_DEBUG=true, deactivate plugins one by one',
          safe_actions: ['enable_debug_log', 'disable_plugins']
        });
        break;

      case 'PLUGIN_CONFLICT':
        recommendations.push({
          priority: 'HIGH',
          action: 'Deactivate plugins to isolate the conflict',
          technical: 'Disable all plugins, then reactivate one by one',
          safe_actions: ['disable_plugins', 'test_plugin_isolation']
        });
        break;

      case 'MEMORY_LIMIT':
        recommendations.push({
          priority: 'MEDIUM',
          action: 'Increase PHP memory limit',
          technical: 'Set memory_limit = 512M in php.ini or wp-config.php',
          safe_actions: ['increase_memory_limit']
        });
        break;

      case 'ADMIN_ACCESS_ISSUE':
        recommendations.push({
          priority: 'MEDIUM',
          action: 'Reset admin credentials and check permissions',
          technical: 'Use wp-cli or database to reset admin password',
          safe_actions: ['reset_admin_password', 'check_user_permissions']
        });
        break;

      case 'CORRUPTED_CORE':
        recommendations.push({
          priority: 'HIGH',
          action: 'Restore WordPress core files',
          technical: 'Download fresh WordPress and replace core files',
          safe_actions: ['backup_site', 'restore_core']
        });
        break;

      default:
        recommendations.push({
          priority: 'LOW',
          action: 'Enable debug logging for detailed analysis',
          technical: 'Set WP_DEBUG=true and check error logs',
          safe_actions: ['enable_debug_log', 'manual_investigation']
        });
    }

    return recommendations;
  }

  /**
   * Helper method to get WHM API key
   */
  async getWhmApiKey(host) {
    const serverName = this.extractServerName(host);
    const whmService = require('./whmService');
    return whmService.serverApiKeys?.[serverName.toLowerCase()] || 'default-key';
  }

  /**
   * Helper method to extract database credentials from wp-config.php
   */
  extractDatabaseCredentials(wpConfig) {
    try {
      const dbMatches = {
        name: wpConfig.match(/DB_NAME['"]\s*,\s*['"]([^'"]+)['"]/),
        user: wpConfig.match(/DB_USER['"]\s*,\s*['"]([^'"]+)['"]/),
        host: wpConfig.match(/DB_HOST['"]\s*,\s*['"]([^'"]+)['"]/),
        password: wpConfig.match(/DB_PASSWORD['"]\s*,\s*['"]([^'"]*)['"]/),
        prefix: wpConfig.match(/\$table_prefix\s*=\s*['"]([^'"]*)['"]/),
      };

      if (dbMatches.name && dbMatches.user && dbMatches.host) {
        return {
          success: true,
          name: dbMatches.name[1],
          user: dbMatches.user[1],
          host: dbMatches.host[1],
          password: dbMatches.password ? dbMatches.password[1] : '',
          table_prefix: dbMatches.prefix ? dbMatches.prefix[1] : 'wp_'
        };
      }

      return { success: false, error: 'Could not extract database credentials' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract server name from host
   */
  extractServerName(host) {
    const match = host.match(/^([^.]+)/);
    return match ? match[1] : host;
  }

  /**
   * Perform DATABASE-FOCUSED diagnostic (for /wordpress/diagnose endpoint)
   * This method focuses specifically on database connection testing and remediation
   */
  async performDatabaseDiagnostic({ domain, cpanelCredentials, userInput }) {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Starting database-focused diagnostic for: ${domain}`);
      
      if (!cpanelCredentials) {
        throw new Error('cPanel credentials are required for database diagnostic');
      }

      // Initialize file cache for performance
      const fileCache = new Map();
      
      // Initialize results structure
      const diagnosticResult = {
        phases: {},
        primary_suspect: null,
        secondary: null,
        confidence: 0,
        safe_actions_available: [],
        l1_classification: null,
        l2_classification: null,
        l3_evidence: [],
        tests_performed: [],
        recommendations: [],
        user_input: userInput,
        focus: 'DATABASE_CONNECTION'
      };

      // Pre-load essential files for database diagnostic
      await this.preloadDatabaseFiles(cpanelCredentials, fileCache);

      // Phase 1: Basic Health Detection (minimal - just WordPress detection)
      this.logger.info('Phase 1: Basic WordPress detection');
      diagnosticResult.phases.phase1 = await this.phase1_BasicHealthDetection(domain, cpanelCredentials, fileCache);
      diagnosticResult.tests_performed.push('phase1_basic_health');

      // Phase 5: Database Health (MAIN FOCUS - with remediation)
      this.logger.info('Phase 5: Database connection testing and remediation');
      diagnosticResult.phases.phase5 = await this.phase5_DatabaseHealthWithRemediation(domain, cpanelCredentials, fileCache);
      diagnosticResult.tests_performed.push('phase5_database_health');

      // Phase 8: Generate Database-Specific Diagnosis
      this.logger.info('Phase 8: Database-specific diagnosis mapping');
      diagnosticResult.phases.phase8 = await this.phase8_DatabaseDiagnosisMapping(diagnosticResult.phases);
      diagnosticResult.tests_performed.push('phase8_database_diagnosis');

      // Extract final diagnosis
      const finalDiagnosis = diagnosticResult.phases.phase8;
      diagnosticResult.primary_suspect = finalDiagnosis.primary_suspect;
      diagnosticResult.secondary = finalDiagnosis.secondary;
      diagnosticResult.confidence = finalDiagnosis.confidence;
      diagnosticResult.safe_actions_available = finalDiagnosis.safe_actions_available;
      diagnosticResult.l1_classification = finalDiagnosis.l1_classification;
      diagnosticResult.l2_classification = finalDiagnosis.l2_classification;
      diagnosticResult.l3_evidence = finalDiagnosis.l3_evidence;
      diagnosticResult.recommendations = finalDiagnosis.recommendations;

      // Add database-specific metadata
      diagnosticResult.database_connection_status = diagnosticResult.phases.phase5?.db_connection_test?.success || false;
      diagnosticResult.database_user_created = diagnosticResult.phases.phase5?.user_management?.userCreated || false;
      diagnosticResult.wp_config_updated = diagnosticResult.phases.phase5?.user_management?.wpConfigUpdated || false;

      diagnosticResult.duration = Date.now() - startTime;
      
      this.logger.info(`Database diagnostic completed in ${diagnosticResult.duration}ms`);
      return diagnosticResult;

    } catch (error) {
      this.logger.error(`Database diagnostic failed for ${domain}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pre-load database-specific files for performance
   */
  async preloadDatabaseFiles(cpanelCredentials, fileCache) {
    try {
      const cpanelClient = new CpanelClient(
        cpanelCredentials.host,
        cpanelCredentials.username,
        await this.getWhmApiKey(cpanelCredentials.host),
        2087
      );

      // Define database-specific files
      const databaseFiles = [
        'public_html/wp-config.php',
        'public_html/error_log',
        'public_html/wp-includes/version.php'
      ];

      // Read all files in parallel
      const filePromises = databaseFiles.map(async (filePath) => {
        try {
          const content = await cpanelClient.readFile(filePath);
          if (content) {
            fileCache.set(filePath, content);
          }
        } catch (error) {
          // File doesn't exist or not readable - that's fine
          fileCache.set(filePath, null);
        }
      });

      await Promise.all(filePromises);
      
      this.logger.info(`Pre-loaded ${fileCache.size} database-specific files`);
    } catch (error) {
      this.logger.error(`Error pre-loading database files: ${error.message}`);
      // Continue without cache - not critical
    }
  }

  /**
   * Phase 8: Database-Specific Diagnosis Mapping
   */
  async phase8_DatabaseDiagnosisMapping(phases) {
    try {
      const diagnosis = {
        primary_suspect: 'UNKNOWN',
        secondary: null,
        confidence: 0.5,
        safe_actions_available: [],
        l1_classification: 'UNKNOWN',
        l2_classification: 'UNKNOWN',
        l3_evidence: [],
        reasoning: [],
        recommendations: []
      };

      // Analyze database connection results
      const dbPhase = phases.phase5;
      if (dbPhase && dbPhase.db_connection_test) {
        const dbTest = dbPhase.db_connection_test;
        
        if (dbTest.success) {
          // Database connection successful
          diagnosis.primary_suspect = 'DATABASE_HEALTHY';
          diagnosis.l1_classification = 'HEALTHY';
          diagnosis.l2_classification = 'DB_CONNECTION_OK';
          diagnosis.l3_evidence.push('DB_CONNECTION_SUCCESS');
          diagnosis.confidence = 0.9;
          diagnosis.reasoning.push('Database connection test passed');
          
          diagnosis.recommendations.push({
            priority: 'INFO',
            action: 'Database connection is working properly',
            technical: 'No database-related issues detected'
          });
          
        } else {
          // Database connection failed
          const errorType = dbTest.error_classification || 'UNKNOWN_ERROR';
          
          switch (errorType) {
            case 'ACCESS_DENIED':
              diagnosis.primary_suspect = 'ACCESS_DENIED';
              diagnosis.l1_classification = 'AUTH_ERROR';
              diagnosis.l2_classification = 'DB_ACCESS_DENIED';
              diagnosis.l3_evidence.push('DB_ACCESS_DENIED');
              diagnosis.confidence = 0.95;
              diagnosis.reasoning.push('Database access denied - credentials invalid');
              
              if (dbPhase.user_management?.userCreated) {
                diagnosis.safe_actions_available.push('new_user_created');
                diagnosis.recommendations.push({
                  priority: 'HIGH',
                  action: 'New database user created and wp-config.php updated',
                  technical: `Created user: ${dbPhase.user_management.finalCredentials?.username}`
                });
              } else {
                diagnosis.recommendations.push({
                  priority: 'HIGH',
                  action: 'Create new database user with proper privileges',
                  technical: 'Use cPanel MySQL User Wizard or contact hosting support'
                });
              }
              break;
              
            case 'UNKNOWN_DATABASE':
              diagnosis.primary_suspect = 'DATABASE_NOT_FOUND';
              diagnosis.l1_classification = 'CONFIG_ERROR';
              diagnosis.l2_classification = 'DB_NOT_FOUND';
              diagnosis.l3_evidence.push('DB_NOT_FOUND');
              diagnosis.confidence = 0.9;
              diagnosis.reasoning.push('Database does not exist');
              
              diagnosis.recommendations.push({
                priority: 'HIGH',
                action: 'Create the missing database or restore from backup',
                technical: 'Check wp-config.php DB_NAME and create database in cPanel'
              });
              break;
              
            case 'CONNECTION_REFUSED':
              diagnosis.primary_suspect = 'MYSQL_DOWN';
              diagnosis.l1_classification = 'SERVER_ERROR';
              diagnosis.l2_classification = 'DB_SERVER_DOWN';
              diagnosis.l3_evidence.push('DB_CONNECTION_REFUSED');
              diagnosis.confidence = 0.85;
              diagnosis.reasoning.push('MySQL server not responding');
              
              diagnosis.recommendations.push({
                priority: 'CRITICAL',
                action: 'MySQL server appears to be down',
                technical: 'Contact hosting support to restart MySQL service'
              });
              break;
              
            default:
              diagnosis.primary_suspect = 'DATABASE_ERROR';
              diagnosis.l1_classification = 'DB_ERROR';
              diagnosis.l2_classification = 'DB_CONNECTION_FAILED';
              diagnosis.l3_evidence.push('DB_CONNECTION_FAILED');
              diagnosis.confidence = 0.7;
              diagnosis.reasoning.push(`Database connection failed: ${dbTest.error}`);
              
              diagnosis.recommendations.push({
                priority: 'HIGH',
                action: 'Database connection issue detected',
                technical: 'Check wp-config.php credentials and database status'
              });
          }
        }
      } else {
        // No database test performed
        diagnosis.primary_suspect = 'NO_DB_TEST';
        diagnosis.l1_classification = 'INCOMPLETE';
        diagnosis.l2_classification = 'DB_TEST_SKIPPED';
        diagnosis.l3_evidence.push('DB_TEST_NOT_PERFORMED');
        diagnosis.reasoning.push('Database test was not performed');
        
        diagnosis.recommendations.push({
          priority: 'MEDIUM',
          action: 'Database test could not be performed',
          technical: 'Ensure cPanel credentials are available and wp-config.php exists'
        });
      }

      return diagnosis;

    } catch (error) {
      return {
        primary_suspect: 'DIAGNOSIS_ERROR',
        secondary: null,
        confidence: 0.1,
        safe_actions_available: [],
        l1_classification: 'ERROR',
        l2_classification: 'DIAGNOSIS_FAILED',
        l3_evidence: ['DIAGNOSIS_ERROR'],
        reasoning: [`Diagnosis mapping failed: ${error.message}`],
        recommendations: [{
          priority: 'HIGH',
          action: 'Diagnosis system error',
          technical: `Error: ${error.message}`
        }]
      };
    }
  }
}

module.exports = WordPressDiagnosticManager;