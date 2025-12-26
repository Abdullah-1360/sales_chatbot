const CpanelClient = require('../lib/cpanel');
const GuardStep = require('../steps/guards');
const ParserStep = require('../steps/parser');
const DatabaseUserManagementStep = require('../steps/databaseUserManagement');
const MySQLStep = require('../steps/mysql');
const ErrorMappingStep = require('../steps/errorMapping');

// Optimized logger configuration - silent in production
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

// Cache for DNS resolutions and server info
const dnsCache = new Map();
const serverInfoCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Sensitive fields for log sanitization (cached for performance)
const SENSITIVE_FIELDS = new Set(['password', 'pass', 'pwd', 'secret', 'token', 'key']);

class WordPressDiagnosticManager {
  constructor() {
    this.logger = logger;
    this.guardStep = new GuardStep();
    this.parserStep = new ParserStep();
    this.databaseUserManagementStep = new DatabaseUserManagementStep();
    this.mysqlStep = new MySQLStep();
    this.errorMappingStep = new ErrorMappingStep();
  }

  /**
   * Optimized log data sanitization with caching
   */
  sanitizeLogData(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    // Fast path for simple objects
    if (Object.keys(data).length === 0) {
      return data;
    }

    const result = Array.isArray(data) ? [] : {};
    
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
        result[key] = '***MASKED***';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitizeLogData(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Fast server name extraction
   */
  extractServerNameFromHost(host) {
    const match = host.match(/^([^.]+)/);
    return match ? match[1] : host;
  }

  /**
   * Optimized diagnostic workflow with minimal logging
   */
  async diagnoseWordPressDatabase(params) {
    const startTime = Date.now();
    
    try {
      // Pre-allocate result object to avoid multiple object creations
      const result = {
        timestamp: new Date().toISOString(),
        domain: params.domain,
        workflow: {},
        summary: null,
        duration: null,
        success: false,
        escalation: null
      };

      // Fast server name resolution with caching
      const serverName = params.serverName || this.extractServerNameFromHost(params.cpanelHost);
      const serverCacheKey = `server:${serverName}`;
      
      let whmApiKey;
      if (serverInfoCache.has(serverCacheKey)) {
        const cached = serverInfoCache.get(serverCacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          whmApiKey = cached.apiKey;
        }
      }
      
      if (!whmApiKey) {
        const whmService = require('../services/whmService');
        whmApiKey = whmService.serverApiKeys?.[serverName.toLowerCase()];
        
        if (!whmApiKey) {
          throw new Error(`No WHM API key found for server: ${serverName}`);
        }
        
        // Cache the API key
        serverInfoCache.set(serverCacheKey, {
          apiKey: whmApiKey,
          timestamp: Date.now()
        });
      }

      // Initialize cPanel client
      const cpanelClient = new CpanelClient(
        params.cpanelHost,
        params.cpanelUsername,
        whmApiKey,
        2087
      );

      // Step A: Quick Guards (optimized with early returns)
      if (!params.skipGuards) {
        const guardResults = {};
        
        // Parallel execution of independent checks
        const guardPromises = [];
        
        if (params.clientId) {
          guardPromises.push(
            this.guardStep.checkWhmcsServiceState(params.clientId, params.domain)
              .then(serviceCheck => {
                guardResults.serviceCheck = serviceCheck;
                if (!serviceCheck.passed && serviceCheck.escalate === 'billing') {
                  throw new Error('BILLING_ESCALATION');
                }
              })
          );
        }
        
        guardPromises.push(
          this.guardStep.checkDnsResolution(params.domain, params.expectedIp)
            .then(dnsCheck => {
              guardResults.dnsCheck = dnsCheck;
              if (!dnsCheck.passed && dnsCheck.escalate === 'user_notification') {
                throw new Error('DNS_ESCALATION');
              }
            })
        );

        try {
          await Promise.all(guardPromises);
          result.workflow.stepA_quickGuards = guardResults;
        } catch (error) {
          if (error.message === 'BILLING_ESCALATION') {
            result.escalation = {
              type: 'billing',
              reason: guardResults.serviceCheck.reason,
              message: guardResults.serviceCheck.message
            };
            result.summary = {
              status: 'ESCALATE_BILLING',
              message: guardResults.serviceCheck.message,
              escalation: result.escalation
            };
            result.duration = Date.now() - startTime;
            return result;
          }
          
          if (error.message === 'DNS_ESCALATION') {
            result.escalation = {
              type: 'user_notification',
              reason: guardResults.dnsCheck.reason,
              message: guardResults.dnsCheck.message
            };
            result.summary = {
              status: 'DNS_MISCONFIGURED',
              message: guardResults.dnsCheck.message,
              escalation: result.escalation
            };
            result.duration = Date.now() - startTime;
            return result;
          }
          
          throw error; // Re-throw unexpected errors
        }
      } else {
        result.workflow.stepA_quickGuards = { skipped: true };
      }

      // Step B: Parse wp-config.php (optimized file operations)
      result.workflow.stepB_parseConfig = await this.parserStep.extractDatabaseConfig(
        cpanelClient,
        'public_html',
        'wp-config.php'
      );

      if (!result.workflow.stepB_parseConfig.success) {
        result.escalation = {
          type: 'technical',
          reason: 'CONFIG_READ_FAILED',
          message: 'Cannot read wp-config.php'
        };
        result.summary = {
          status: 'CONFIG_READ_FAILED',
          message: result.workflow.stepB_parseConfig.error,
          escalation: result.escalation
        };
        result.duration = Date.now() - startTime;
        return result;
      }

      // Step B2: Fast localhost validation
      const localhostValidation = this.mysqlStep.mysqlClient.validateLocalhostRequirement(
        result.workflow.stepB_parseConfig.config
      );
      
      if (!localhostValidation.valid) {
        result.escalation = {
          type: 'configuration_error',
          reason: 'NON_LOCALHOST_HOST',
          message: localhostValidation.userFriendlyMessage,
          recommendations: localhostValidation.recommendations
        };
        result.summary = {
          status: 'NON_LOCALHOST_HOST',
          message: localhostValidation.userFriendlyMessage,
          escalation: result.escalation
        };
        result.duration = Date.now() - startTime;
        return result;
      }

      // Step B2: Database User Management (optimized)
      result.workflow.stepB2_databaseUserManagement = await this.databaseUserManagementStep.manageDatabaseUser(
        cpanelClient,
        result.workflow.stepB_parseConfig.config,
        'public_html/wp-config.php',
        result.workflow.stepB_parseConfig.wpConfigData?.content
      );

      // Use updated credentials if available (avoid object spread)
      let finalConfig = result.workflow.stepB_parseConfig.config;
      if (result.workflow.stepB2_databaseUserManagement.success && 
          result.workflow.stepB2_databaseUserManagement.wpConfigUpdated) {
        
        finalConfig = Object.assign({}, finalConfig, {
          user: result.workflow.stepB2_databaseUserManagement.finalCredentials.username,
          password: result.workflow.stepB2_databaseUserManagement.finalCredentials.password
        });
      }

      // Early return for database not found
      if (!result.workflow.stepB2_databaseUserManagement.success && 
          result.workflow.stepB2_databaseUserManagement.checkResult?.issue === 'DATABASE_NOT_FOUND') {
        result.escalation = {
          type: 'technical',
          reason: 'DATABASE_NOT_FOUND',
          message: result.workflow.stepB2_databaseUserManagement.message
        };
        result.summary = {
          status: 'DATABASE_NOT_FOUND',
          message: result.workflow.stepB2_databaseUserManagement.message,
          escalation: result.escalation
        };
        result.duration = Date.now() - startTime;
        return result;
      }

      // Step C: MySQL Connection Test (optimized)
      const dnsCheckResult = result.workflow.stepA_quickGuards?.dnsCheck || null;
      const configForMysqlTest = Object.assign({}, result.workflow.stepB_parseConfig, {
        config: finalConfig
      });
      
      result.workflow.stepC_mysqlConnection = await this.mysqlStep.testMySQLConnection(
        configForMysqlTest,
        dnsCheckResult
      );

      // Step D: Error Mapping (only if connection failed)
      if (!result.workflow.stepC_mysqlConnection.success) {
        result.workflow.stepD_errorMapping = await this.errorMappingStep.mapMySQLError(
          result.workflow.stepC_mysqlConnection
        );

        result.escalation = {
          type: 'technical',
          reason: 'MYSQL_CONNECTION_FAILED',
          message: 'Cannot connect to MySQL database',
          errorAnalysis: result.workflow.stepD_errorMapping.errorAnalysis,
          recommendations: result.workflow.stepD_errorMapping.recommendations
        };
        result.summary = {
          status: 'MYSQL_CONNECTION_FAILED',
          message: result.workflow.stepC_mysqlConnection.error || 'MySQL connection test failed',
          escalation: result.escalation
        };
        result.duration = Date.now() - startTime;
        return result;
      }

      // Success path
      result.success = true;
      result.summary = this.generateOptimizedSummary(result.workflow);
      result.duration = Date.now() - startTime;
      
      return result;

    } catch (error) {
      this.logger.error(`WordPress diagnostic failed: ${error.message}`);
      return {
        timestamp: new Date().toISOString(),
        domain: params.domain,
        error: error.message,
        success: false,
        duration: Date.now() - startTime,
        escalation: {
          type: 'technical',
          reason: 'SYSTEM_ERROR',
          message: `System error: ${error.message}`
        }
      };
    }
  }

  /**
   * Optimized summary generation with minimal object creation
   */
  generateOptimizedSummary(workflow) {
    // Pre-allocate summary object
    const summary = {
      status: 'UNKNOWN',
      message: '',
      details: {
        quickGuards: workflow.stepA_quickGuards ? (workflow.stepA_quickGuards.skipped ? 'skipped' : 'completed') : 'not_performed',
        configParsing: workflow.stepB_parseConfig?.success ? 'success' : 'failed',
        databaseUserManagement: workflow.stepB2_databaseUserManagement?.success ? 'success' : 'failed',
        mysqlConnection: workflow.stepC_mysqlConnection?.success ? 'success' : 'failed'
      }
    };

    // Fast status determination
    if (workflow.stepC_mysqlConnection?.success) {
      summary.status = 'MYSQL_CONNECTION_SUCCESS';
      summary.message = 'WordPress configuration parsed and MySQL connection verified';
    } else if (workflow.stepB_parseConfig?.success) {
      summary.status = 'CONFIG_PARSED';
      summary.message = 'WordPress configuration successfully parsed but MySQL connection failed';
    } else {
      summary.status = 'CONFIG_PARSE_FAILED';
      summary.message = 'Failed to parse WordPress configuration';
    }

    // Add essential details only
    if (workflow.stepA_quickGuards?.serviceCheck) {
      summary.details.serviceStatus = workflow.stepA_quickGuards.serviceCheck.passed ? 'active' : 'inactive';
    }
    
    if (workflow.stepA_quickGuards?.dnsCheck) {
      summary.details.dnsStatus = workflow.stepA_quickGuards.dnsCheck.passed ? 'resolved' : 'failed';
    }

    // Add config details if parsing succeeded (avoid deep copying)
    if (workflow.stepB_parseConfig?.success) {
      const config = workflow.stepB_parseConfig.config;
      summary.details.databaseConfig = {
        host: config.host,
        database: config.database,
        user: config.user,
        valid: workflow.stepB_parseConfig.validation?.valid || false
      };
    }

    // Add user management details if performed
    if (workflow.stepB2_databaseUserManagement) {
      const mgmt = workflow.stepB2_databaseUserManagement;
      summary.details.databaseUserManagement = {
        success: mgmt.success,
        userCreated: mgmt.userCreated,
        userAssigned: mgmt.userAssigned,
        wpConfigUpdated: mgmt.wpConfigUpdated,
        message: mgmt.message
      };

      if (mgmt.wpConfigUpdated) {
        summary.details.updatedCredentials = {
          username: mgmt.finalCredentials.username,
          database: mgmt.finalCredentials.database,
          credentialsUpdated: true
        };
      }
    }

    // Add MySQL connection details if tested
    if (workflow.stepC_mysqlConnection) {
      const mysql = workflow.stepC_mysqlConnection;
      summary.details.mysqlConnectionDetails = {
        success: mysql.success,
        isLocalhost: mysql.dnsResolution?.isLocalhost || false,
        usedResolvedIp: mysql.connectionTest?.resolvedIp?.success || false,
        dnsResolution: mysql.dnsResolution?.success || false
      };

      // Add recommendations only if connection failed
      if (!mysql.success && workflow.stepD_errorMapping?.recommendations) {
        summary.recommendations = workflow.stepD_errorMapping.recommendations;
      }
    }

    return summary;
  }

}

module.exports = WordPressDiagnosticManager;