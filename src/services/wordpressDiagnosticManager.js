const winston = require('winston');
const CpanelClient = require('../lib/cpanel');
const MySQLClient = require('../lib/mysql');
const GuardStep = require('../steps/guards');
const ParserStep = require('../steps/parser');
const DiagnosisStep = require('../steps/diagnosis');
const RemediationStep = require('../steps/remediation');

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

    this.mysqlClient = new MySQLClient();
    this.guardStep = new GuardStep();
    this.parserStep = new ParserStep();
    this.diagnosisStep = new DiagnosisStep(this.mysqlClient);
    this.remediationStep = new RemediationStep(this.mysqlClient);
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
   * Enhanced diagnostic workflow implementing Steps A through F
   */
  async diagnoseWordPressDatabase(params) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting enhanced WordPress database diagnostic workflow (Steps A-F)');
      
      const result = {
        timestamp: new Date().toISOString(),
        domain: params.domain,
        workflow: {
          stepA_quickGuards: null,
          stepB_parseConfig: null,
          stepC_connectionAttempt: null,
          stepD_errorMapping: null,
          stepE_targetedChecks: null,
          stepF_postFixVerification: null
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

      let whmClient = null;
      if (params.whmHost && params.whmUsername && params.whmPassword) {
        // WHM client would be initialized here if provided
        this.logger.info('WHM credentials provided - advanced features available');
      }

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

      const dbConfig = result.workflow.stepB_parseConfig.config;

      // Step C: Attempt direct DB connection using parsed credentials
      this.logger.info('=== Step C: Database Connection Attempt ===');
      result.workflow.stepC_connectionAttempt = await this.diagnosisStep.attemptDatabaseConnection(dbConfig, cpanelClient);

      // Step D: Map MySQL error to root cause (if connection failed)
      this.logger.info('=== Step D: Error Mapping ===');
      if (result.workflow.stepC_connectionAttempt.success) {
        result.workflow.stepD_errorMapping = {
          cause: 'CONNECTION_SUCCESS',
          description: 'Database connection successful',
          severity: 'NONE'
        };
        result.success = true;
      } else {
        const connectionResult = result.workflow.stepC_connectionAttempt.attempts?.[0]?.result || 
                               result.workflow.stepC_connectionAttempt;
        result.workflow.stepD_errorMapping = this.diagnosisStep.mapMysqlErrorToRootCause(connectionResult);
      }

      // Step E: Targeted deeper checks (only if connection failed)
      if (!result.workflow.stepC_connectionAttempt.success) {
        this.logger.info('=== Step E: Targeted Deeper Checks ===');
        result.workflow.stepE_targetedChecks = await this.diagnosisStep.performTargetedChecks(
          result.workflow.stepD_errorMapping,
          dbConfig,
          cpanelClient,
          whmClient
        );

        // Attempt remediation if enabled and auto-fix is available
        if (params.enableRemediation && result.workflow.stepE_targetedChecks.autoFixAvailable) {
          this.logger.info('=== Attempting Automated Remediation ===');
          const remediationResult = await this.remediationStep.performRemediation(
            { basicDiagnosis: { rootCause: result.workflow.stepD_errorMapping } },
            dbConfig,
            cpanelClient,
            whmClient,
            {
              approveServiceRestart: params.approveServiceRestart || false,
              approveTableRepair: params.approveTableRepair || false,
              approveKillConnections: params.approveKillConnections || false
            }
          );

          result.workflow.remediation = remediationResult;

          // Step F: Post-fix verification (if remediation was attempted)
          if (remediationResult.actionsAttempted.length > 0) {
            this.logger.info('=== Step F: Post-fix Verification ===');
            result.workflow.stepF_postFixVerification = await this.remediationStep.performPostFixVerification(
              dbConfig,
              params.domain,
              cpanelClient
            );
            
            result.success = result.workflow.stepF_postFixVerification.success;
          }
        }
      }

      // Generate comprehensive summary
      result.summary = this.generateEnhancedSummary(result.workflow);
      result.duration = Date.now() - startTime;

      this.logger.info(`Enhanced WordPress diagnostic completed in ${result.duration}ms. Success: ${result.success}`);
      return result;

    } catch (error) {
      this.logger.error(`Enhanced WordPress diagnostic failed: ${error.message}`);
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
   * Generate enhanced summary for Steps A-F workflow
   */
  generateEnhancedSummary(workflow) {
    const summary = {
      status: 'UNKNOWN',
      message: '',
      details: {},
      escalation: null,
      recommendations: []
    };

    // Check final outcome
    if (workflow.stepF_postFixVerification?.success) {
      summary.status = 'FIXED_AND_VERIFIED';
      summary.message = 'Database connection issues were resolved and verified';
    } else if (workflow.stepC_connectionAttempt?.success) {
      summary.status = 'HEALTHY';
      summary.message = 'WordPress database connection is working correctly';
    } else if (workflow.remediation?.success) {
      summary.status = 'FIXED_PENDING_VERIFICATION';
      summary.message = 'Database connection issues were resolved but verification pending';
    } else if (workflow.stepE_targetedChecks?.autoFixAvailable && workflow.stepE_targetedChecks?.requiresApproval) {
      summary.status = 'FIXABLE_WITH_APPROVAL';
      summary.message = 'Issues identified with automated fixes available (requires approval)';
    } else if (workflow.stepD_errorMapping?.escalation) {
      summary.status = 'REQUIRES_ESCALATION';
      summary.message = `Issue requires escalation: ${workflow.stepD_errorMapping.description}`;
      summary.escalation = {
        type: workflow.stepD_errorMapping.escalation,
        reason: workflow.stepD_errorMapping.cause
      };
    } else {
      summary.status = 'UNHEALTHY';
      summary.message = 'WordPress database connection has issues requiring attention';
    }

    // Add step details
    summary.details = {
      quickGuards: workflow.stepA_quickGuards ? 'completed' : 'skipped',
      configParsing: workflow.stepB_parseConfig?.success ? 'success' : 'failed',
      connectionAttempt: workflow.stepC_connectionAttempt?.success ? 'success' : 'failed',
      errorMapping: workflow.stepD_errorMapping?.cause || 'unknown',
      targetedChecks: workflow.stepE_targetedChecks ? 'completed' : 'not_needed',
      postFixVerification: workflow.stepF_postFixVerification?.success ? 'verified' : 'not_performed'
    };

    // Add recommendations from targeted checks
    if (workflow.stepE_targetedChecks?.recommendations) {
      summary.recommendations.push(...workflow.stepE_targetedChecks.recommendations);
    }

    return summary;
  }

  /**
   * Generate workflow summary
   */
  generateWorkflowSummary(workflow) {
    const summary = {
      status: 'UNKNOWN',
      message: '',
      details: {},
      recommendations: []
    };

    // Check connection status
    const connectionSuccess = workflow.diagnosis?.basicDiagnosis?.connectionTest?.success;
    const remediationSuccess = workflow.remediation?.success;

    if (connectionSuccess) {
      summary.status = 'HEALTHY';
      summary.message = 'WordPress database connection is working correctly';
    } else if (remediationSuccess) {
      summary.status = 'FIXED';
      summary.message = 'Database connection issues were successfully resolved';
    } else {
      summary.status = 'UNHEALTHY';
      summary.message = 'WordPress database connection has issues';
    }

    // Add details
    if (workflow.guards) {
      summary.details.guards = {
        passed: workflow.guards.passed,
        issues: workflow.guards.summary
      };
    }

    if (workflow.parser) {
      summary.details.configuration = {
        valid: workflow.parser.success,
        validation: workflow.parser.validation
      };
    }

    if (workflow.diagnosis) {
      summary.details.diagnosis = this.diagnosisStep.generateDiagnosisSummary(workflow.diagnosis);
      
      // Add recommendations from diagnosis
      if (workflow.diagnosis.basicDiagnosis?.recommendations) {
        summary.recommendations.push(...workflow.diagnosis.basicDiagnosis.recommendations);
      }
    }

    if (workflow.remediation) {
      summary.details.remediation = this.remediationStep.generateRemediationSummary(workflow.remediation);
    }

    return summary;
  }

  /**
   * Quick connection test (simplified workflow)
   */
  async quickConnectionTest(params) {
    try {
      this.logger.info('Performing quick WordPress database connection test');
      
      const cpanelClient = new CpanelClient(
        params.cpanelHost,
        params.cpanelUsername,
        params.cpanelPassword,
        params.cpanelPort
      );

      // Extract database config
      const parserResult = await this.parserStep.extractDatabaseConfig(
        cpanelClient,
        params.wpConfigPath || 'public_html/wp-config.php'
      );

      if (!parserResult.success) {
        return {
          success: false,
          error: parserResult.error,
          type: 'PARSER_ERROR'
        };
      }

      // Test connection
      const connectionResult = await this.mysqlClient.testConnection(parserResult.config);
      
      return {
        success: connectionResult.success,
        config: this.parserStep.generateConnectionString(parserResult.config, true),
        error: connectionResult.error,
        rootCause: connectionResult.success ? null : this.mysqlClient.mapErrorToRootCause(connectionResult),
        type: connectionResult.success ? 'SUCCESS' : 'CONNECTION_ERROR'
      };

    } catch (error) {
      this.logger.error(`Quick connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        type: 'SYSTEM_ERROR'
      };
    }
  }
}

module.exports = WordPressDiagnosticManager;