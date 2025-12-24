const winston = require('winston');
const CpanelClient = require('../lib/cpanel');
const GuardStep = require('../steps/guards');
const ParserStep = require('../steps/parser');
const DatabaseUserManagementStep = require('../steps/databaseUserManagement');
const MySQLStep = require('../steps/mysql');
const ErrorMappingStep = require('../steps/errorMapping');

class WordPressDiagnosticManager {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          // Mask any passwords in log output
          const sanitizedMeta = this.sanitizeLogData(meta);
          return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(sanitizedMeta).length ? JSON.stringify(sanitizedMeta) : ''}`;
        })
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });

    this.mysqlClient = null; // No longer needed
    this.guardStep = new GuardStep();
    this.parserStep = new ParserStep();
    this.databaseUserManagementStep = new DatabaseUserManagementStep();
    this.mysqlStep = new MySQLStep();
    this.errorMappingStep = new ErrorMappingStep();
    this.diagnosisStep = null; // No longer needed
    this.remediationStep = null; // No longer needed
  }

  /**
   * Sanitize log data to mask passwords and sensitive information
   */
  sanitizeLogData(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized = { ...data };
    const sensitiveFields = ['password', 'pass', 'pwd', 'secret', 'token', 'key'];

    const maskSensitiveData = (obj) => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      const result = Array.isArray(obj) ? [] : {};
      
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          result[key] = '***MASKED***';
        } else if (typeof value === 'object' && value !== null) {
          result[key] = maskSensitiveData(value);
        } else {
          result[key] = value;
        }
      }
      
      return result;
    };

    return maskSensitiveData(sanitized);
  }

  /**
   * Extract server name from cPanel host
   */
  extractServerNameFromHost(host) {
    // Extract server name from hostname like "pcp3.mywebsitebox.com" -> "pcp3"
    const match = host.match(/^([^.]+)/);
    return match ? match[1] : host;
  }

  /**
   * Simplified diagnostic workflow implementing only Steps A and B
   */
  async diagnoseWordPressDatabase(params) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting simplified WordPress diagnostic workflow (Steps A-B only)');
      
      const result = {
        timestamp: new Date().toISOString(),
        domain: params.domain,
        workflow: {
          stepA_quickGuards: null,
          stepB_parseConfig: null,
          stepB2_databaseUserManagement: null,
          stepC_mysqlConnection: null,
          stepD_errorMapping: null
        },
        summary: null,
        duration: null,
        success: false,
        escalation: null
      };

      // Initialize cPanel client with resolved credentials
      // Note: We need the WHM API key for the server to make UAPI calls
      const whmService = require('../services/whmService');
      const serverName = params.serverName || this.extractServerNameFromHost(params.cpanelHost);
      const whmApiKey = whmService.serverApiKeys?.[serverName.toLowerCase()];
      
      if (!whmApiKey) {
        this.logger.error(`Available servers: ${Object.keys(whmService.serverApiKeys).join(', ')}`);
        throw new Error(`No WHM API key found for server: ${serverName}. Available servers: ${Object.keys(whmService.serverApiKeys).join(', ')}`);
      }

      this.logger.info(`Using WHM API key for server: ${serverName}`);

      const cpanelClient = new CpanelClient(
        params.cpanelHost,
        params.cpanelUsername, // cPanel username
        whmApiKey, // WHM API key for authentication
        2087 // WHM port for UAPI calls
      );

      // Step A: Quick Guards - Fast checks for service state and DNS
      this.logger.info('=== Step A: Quick Guards ===');
      if (!params.skipGuards) {
        // A1: Check WHMCS service state
        if (params.clientId) {
          const serviceCheck = await this.guardStep.checkWhmcsServiceState(params.clientId, params.domain);
          result.workflow.stepA_quickGuards = { serviceCheck };
          
          if (!serviceCheck.passed && serviceCheck.escalate === 'billing') {
            result.escalation = {
              type: 'billing',
              reason: serviceCheck.reason,
              message: serviceCheck.message
            };
            result.summary = {
              status: 'ESCALATE_BILLING',
              message: serviceCheck.message,
              escalation: result.escalation
            };
            result.duration = Date.now() - startTime;
            return result;
          }
        }

        // A2: Check DNS resolution
        const dnsCheck = await this.guardStep.checkDnsResolution(params.domain, params.expectedIp);
        if (!result.workflow.stepA_quickGuards) {
          result.workflow.stepA_quickGuards = {};
        }
        result.workflow.stepA_quickGuards.dnsCheck = dnsCheck;
        
        if (!dnsCheck.passed && dnsCheck.escalate === 'user_notification') {
          result.escalation = {
            type: 'user_notification',
            reason: dnsCheck.reason,
            message: dnsCheck.message
          };
          result.summary = {
            status: 'DNS_MISCONFIGURED',
            message: dnsCheck.message,
            escalation: result.escalation
          };
          result.duration = Date.now() - startTime;
          return result;
        }
      } else {
        result.workflow.stepA_quickGuards = { skipped: true };
      }

      // Step B: Read wp-config.php and parse DB constants
      this.logger.info('=== Step B: Parse wp-config.php ===');
      result.workflow.stepB_parseConfig = await this.parserStep.extractDatabaseConfig(
        cpanelClient,
        'public_html', // dir parameter
        'wp-config.php' // file parameter
      );

      if (!result.workflow.stepB_parseConfig.success) {
        result.escalation = {
          type: 'technical',
          reason: 'CONFIG_READ_FAILED',
          message: 'Cannot read wp-config.php - may require filesystem permissions check'
        };
        result.summary = {
          status: 'CONFIG_READ_FAILED',
          message: result.workflow.stepB_parseConfig.error,
          escalation: result.escalation
        };
        result.duration = Date.now() - startTime;
        return result;
      }

      // Step B2: Validate localhost requirement - STOP if not localhost
      this.logger.info('=== Step B2: Validate Localhost Requirement ===');
      const localhostValidation = this.mysqlStep.mysqlClient.validateLocalhostRequirement(
        result.workflow.stepB_parseConfig.config
      );
      
      if (!localhostValidation.valid) {
        this.logger.error(`Localhost validation failed: ${localhostValidation.message}`);
        
        result.escalation = {
          type: 'configuration_error',
          reason: 'NON_LOCALHOST_HOST',
          message: 'Database host is not localhost - diagnostic tool limitation',
          localhostValidation: localhostValidation,
          userFriendlyMessage: localhostValidation.userFriendlyMessage,
          recommendations: localhostValidation.recommendations
        };
        
        result.summary = {
          status: 'NON_LOCALHOST_HOST',
          message: localhostValidation.userFriendlyMessage,
          escalation: result.escalation,
          recommendations: localhostValidation.recommendations
        };
        
        result.duration = Date.now() - startTime;
        return result;
      }
      
      this.logger.info(`Localhost validation passed for host: ${result.workflow.stepB_parseConfig.config.host}`);

      // Step B2: Database User Management - Check and create user if needed
      this.logger.info('=== Step B2: Database User Management ===');
      result.workflow.stepB2_databaseUserManagement = await this.databaseUserManagementStep.manageDatabaseUser(
        cpanelClient,
        result.workflow.stepB_parseConfig.config,
        'public_html/wp-config.php',
        result.workflow.stepB_parseConfig.wpConfigData?.content // Pass the existing content
      );

      // Update config with new credentials if user was created
      let finalConfig = result.workflow.stepB_parseConfig.config;
      if (result.workflow.stepB2_databaseUserManagement.success && 
          result.workflow.stepB2_databaseUserManagement.wpConfigUpdated) {
        
        this.logger.info('Using updated database credentials from user management step');
        finalConfig = {
          ...finalConfig,
          user: result.workflow.stepB2_databaseUserManagement.finalCredentials.username,
          password: result.workflow.stepB2_databaseUserManagement.finalCredentials.password
        };
      }

      // If database user management failed critically, escalate
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

      // Step C: Test MySQL Connection
      this.logger.info('=== Step C: Test MySQL Connection ===');
      
      // Pass DNS check result from Step A if available
      const dnsCheckResult = result.workflow.stepA_quickGuards?.dnsCheck || null;
      
      // Use the final config (potentially updated with new credentials)
      const configForMysqlTest = {
        ...result.workflow.stepB_parseConfig,
        config: finalConfig
      };
      
      result.workflow.stepC_mysqlConnection = await this.mysqlStep.testMySQLConnection(
        configForMysqlTest,
        dnsCheckResult
      );

      // Step D: MySQL Error Mapping (always run to provide analysis)
      this.logger.info('=== Step D: MySQL Error Mapping ===');
      result.workflow.stepD_errorMapping = await this.errorMappingStep.mapMySQLError(
        result.workflow.stepC_mysqlConnection
      );

      if (!result.workflow.stepC_mysqlConnection.success) {
        // Use detailed error analysis from Step D
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

      // Mark as successful if we got this far
      result.success = true;

      // Generate simplified summary
      result.summary = this.generateSimplifiedSummary(result.workflow);
      result.duration = Date.now() - startTime;

      this.logger.info(`Simplified WordPress diagnostic completed in ${result.duration}ms. Success: ${result.success}`);
      return result;

    } catch (error) {
      this.logger.error(`Simplified WordPress diagnostic failed: ${error.message}`);
      return {
        timestamp: new Date().toISOString(),
        domain: params.domain,
        error: error.message,
        success: false,
        duration: Date.now() - startTime,
        escalation: {
          type: 'technical',
          reason: 'SYSTEM_ERROR',
          message: `System error during diagnosis: ${error.message}`
        }
      };
    }
  }

  /**
   * Generate simplified summary for Steps A-D workflow
   */
  generateSimplifiedSummary(workflow) {
    const summary = {
      status: 'UNKNOWN',
      message: '',
      details: {},
      escalation: null,
      recommendations: []
    };

    // Check if all steps completed successfully
    const guardsCompleted = workflow.stepA_quickGuards && !workflow.stepA_quickGuards.skipped;
    const configParsed = workflow.stepB_parseConfig?.success;
    const userManagementCompleted = workflow.stepB2_databaseUserManagement?.success;
    const mysqlConnected = workflow.stepC_mysqlConnection?.success;

    if (mysqlConnected) {
      summary.status = 'MYSQL_CONNECTION_SUCCESS';
      summary.message = 'WordPress configuration parsed and MySQL connection verified';
    } else if (configParsed) {
      summary.status = 'CONFIG_PARSED';
      summary.message = 'WordPress configuration successfully parsed but MySQL connection failed';
    } else {
      summary.status = 'CONFIG_PARSE_FAILED';
      summary.message = 'Failed to parse WordPress configuration';
    }

    // Add step details
    summary.details = {
      quickGuards: workflow.stepA_quickGuards ? (workflow.stepA_quickGuards.skipped ? 'skipped' : 'completed') : 'not_performed',
      configParsing: workflow.stepB_parseConfig?.success ? 'success' : 'failed',
      databaseUserManagement: workflow.stepB2_databaseUserManagement?.success ? 'success' : 'failed',
      mysqlConnection: workflow.stepC_mysqlConnection?.success ? 'success' : 'failed',
      errorMapping: workflow.stepD_errorMapping ? 'completed' : 'not_performed'
    };

    // Add service and DNS status if available
    if (workflow.stepA_quickGuards?.serviceCheck) {
      summary.details.serviceStatus = workflow.stepA_quickGuards.serviceCheck.passed ? 'active' : 'inactive';
    }
    
    if (workflow.stepA_quickGuards?.dnsCheck) {
      summary.details.dnsStatus = workflow.stepA_quickGuards.dnsCheck.passed ? 'resolved' : 'failed';
    }

    // Add configuration details if parsing succeeded
    if (workflow.stepB_parseConfig?.success) {
      // Create a safe copy to prevent winston interference
      const safeConfig = JSON.parse(JSON.stringify(workflow.stepB_parseConfig.config));
      summary.details.databaseConfig = {
        host: safeConfig.host,
        database: safeConfig.database,
        user: safeConfig.user,
        valid: workflow.stepB_parseConfig.validation?.valid || false
      };
    }

    // Add database user management details if performed
    if (workflow.stepB2_databaseUserManagement) {
      summary.details.databaseUserManagement = {
        success: workflow.stepB2_databaseUserManagement.success,
        userCreated: workflow.stepB2_databaseUserManagement.userCreated,
        userAssigned: workflow.stepB2_databaseUserManagement.userAssigned,
        wpConfigUpdated: workflow.stepB2_databaseUserManagement.wpConfigUpdated,
        actions: workflow.stepB2_databaseUserManagement.actions,
        message: workflow.stepB2_databaseUserManagement.message
      };

      // If credentials were updated, show the final credentials used
      if (workflow.stepB2_databaseUserManagement.wpConfigUpdated) {
        summary.details.updatedCredentials = {
          username: workflow.stepB2_databaseUserManagement.finalCredentials.username,
          database: workflow.stepB2_databaseUserManagement.finalCredentials.database,
          credentialsUpdated: true
        };
      }
    }

    // Add MySQL connection details if tested
    if (workflow.stepC_mysqlConnection) {
      summary.details.mysqlConnectionDetails = {
        success: workflow.stepC_mysqlConnection.success,
        isLocalhost: workflow.stepC_mysqlConnection.dnsResolution?.isLocalhost || false,
        usedResolvedIp: workflow.stepC_mysqlConnection.connectionTest?.resolvedIp?.success || false,
        dnsResolution: workflow.stepC_mysqlConnection.dnsResolution?.success || false,
        resolvedFromNetworkInterface: workflow.stepC_mysqlConnection.dnsResolution?.fromNetworkInterface || false
      };

      // Add recommendations if connection failed
      if (!workflow.stepC_mysqlConnection.success) {
        // Use detailed recommendations from Step D if available
        if (workflow.stepD_errorMapping?.recommendations) {
          summary.recommendations = workflow.stepD_errorMapping.recommendations;
        } else {
          summary.recommendations = this.mysqlStep.generateConnectionRecommendations(
            workflow.stepC_mysqlConnection
          );
        }
      }
    }

    // Add error mapping details if performed
    if (workflow.stepD_errorMapping) {
      summary.details.errorMappingDetails = {
        success: workflow.stepD_errorMapping.success || false,
        category: workflow.stepD_errorMapping.errorAnalysis?.category || 'unknown',
        severity: workflow.stepD_errorMapping.errorAnalysis?.severity || 'unknown',
        description: workflow.stepD_errorMapping.errorAnalysis?.description || 'No analysis available'
      };
    }

    return summary;
  }

}

module.exports = WordPressDiagnosticManager;