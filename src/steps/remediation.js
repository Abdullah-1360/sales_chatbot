const winston = require('winston');

class RemediationStep {
  constructor(mysqlClient) {
    this.mysqlClient = mysqlClient;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  /**
   * Perform automated remediation based on diagnosis
   */
  async performRemediation(diagnosis, dbConfig, cpanelClient, whmClient = null, options = {}, resolvedIP = null) {
    try {
      this.logger.info(`Starting remediation for: ${diagnosis.basicDiagnosis?.rootCause?.cause}`);
      
      const remediation = {
        timestamp: new Date().toISOString(),
        rootCause: diagnosis.basicDiagnosis?.rootCause?.cause,
        actionsAttempted: [],
        results: [],
        success: false,
        requiresApproval: false,
        approvalRequired: []
      };

      const rootCause = diagnosis.basicDiagnosis?.rootCause?.cause;

      switch (rootCause) {
        case 'ACCESS_DENIED':
          await this.remediateAccessDenied(remediation, dbConfig, cpanelClient, options, resolvedIP);
          break;

        case 'UNKNOWN_DATABASE':
          await this.remediateUnknownDatabase(remediation, dbConfig, cpanelClient, options, resolvedIP);
          break;

        case 'CONNECTION_REFUSED':
          await this.remediateConnectionRefused(remediation, whmClient, options, resolvedIP);
          break;

        case 'TABLE_CORRUPT':
          await this.remediateTableCorrupt(remediation, dbConfig, cpanelClient, options, resolvedIP);
          break;

        case 'TOO_MANY_CONNECTIONS':
          await this.remediateTooManyConnections(remediation, whmClient, options, resolvedIP);
          break;

        default:
          remediation.results.push({
            action: 'NO_AUTOMATED_REMEDIATION',
            success: false,
            message: `No automated remediation available for: ${rootCause}`
          });
          break;
      }

      // Test connection after remediation attempts using resolved IP
      if (remediation.actionsAttempted.length > 0) {
        const finalTest = await this.mysqlClient.testConnection(dbConfig, cpanelClient, resolvedIP);
        
        // For external connection issues, don't mark as complete failure if privileges were successfully re-granted
        const isExternalConnection = resolvedIP && resolvedIP !== '127.0.0.1' && resolvedIP !== 'localhost';
        const privilegesReGranted = remediation.results.some(r => r.action === 'RE_GRANT_PRIVILEGES' && r.success);
        
        if (isExternalConnection && !finalTest.success && privilegesReGranted) {
          // External connection failed but privileges were re-granted - this might be expected
          remediation.success = false; // Still mark as failed for diagnostic purposes
          remediation.note = 'External connection failed but this may be expected due to localhost-only MySQL configuration. WordPress should work normally.';
        } else {
          remediation.success = finalTest.success;
        }
        
        remediation.finalConnectionTest = finalTest;
      }

      this.logger.info(`Remediation completed. Success: ${remediation.success}`);
      return remediation;

    } catch (error) {
      this.logger.error(`Remediation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remediate access denied errors
   */
  async remediateAccessDenied(remediation, dbConfig, cpanelClient, options, resolvedIP = null) {
    try {
      // Check if user exists
      const users = await cpanelClient.listDatabaseUsers();
      const userExists = users.some(user => {
        // Handle both string format and object format
        const userName = typeof user === 'string' ? user : user.user;
        return userName === dbConfig.user || userName.endsWith(`_${dbConfig.user}`);
      });

      if (userExists) {
        // Check if this is an external connection issue
        const isExternalConnection = resolvedIP && resolvedIP !== '127.0.0.1' && resolvedIP !== 'localhost';
        
        if (isExternalConnection) {
          // For external connections, the issue is likely that MySQL user is configured for localhost only
          remediation.results.push({
            action: 'EXTERNAL_CONNECTION_DETECTED',
            success: false,
            message: `Database user '${dbConfig.user}' exists but is configured for localhost connections only. External connection from diagnostic service cannot be established.`,
            recommendation: 'This is a common security configuration. The WordPress site should work normally as it connects via localhost.'
          });
          
          // Still try to re-grant privileges in case there's a privilege issue
          remediation.actionsAttempted.push('RE_GRANT_PRIVILEGES');
          
          try {
            await cpanelClient.grantPrivileges(dbConfig.database, dbConfig.user);
            remediation.results.push({
              action: 'RE_GRANT_PRIVILEGES',
              success: true,
              message: `Successfully re-granted privileges for user: ${dbConfig.user} (though external connection may still fail due to localhost-only configuration)`
            });
          } catch (error) {
            remediation.results.push({
              action: 'RE_GRANT_PRIVILEGES',
              success: false,
              message: `Failed to re-grant privileges: ${error.message}`
            });
          }
        } else {
          // For local connections, try to re-grant privileges
          remediation.actionsAttempted.push('RE_GRANT_PRIVILEGES');
          
          try {
            await cpanelClient.grantPrivileges(dbConfig.database, dbConfig.user);
            remediation.results.push({
              action: 'RE_GRANT_PRIVILEGES',
              success: true,
              message: `Successfully re-granted privileges for user: ${dbConfig.user}`
            });
          } catch (error) {
            remediation.results.push({
              action: 'RE_GRANT_PRIVILEGES',
              success: false,
              message: `Failed to re-grant privileges: ${error.message}`
            });
          }
        }
      } else {
        remediation.results.push({
          action: 'USER_NOT_FOUND',
          success: false,
          message: `Database user '${dbConfig.user}' does not exist. Manual user creation required.`
        });
      }

    } catch (error) {
      remediation.results.push({
        action: 'ACCESS_DENIED_REMEDIATION',
        success: false,
        message: `Failed to remediate access denied: ${error.message}`
      });
    }
  }

  /**
   * Remediate unknown database errors
   */
  async remediateUnknownDatabase(remediation, dbConfig, cpanelClient, options) {
    try {
      // Check if database exists with different naming
      const databases = await cpanelClient.listDatabases();
      const similarDatabases = databases.filter(db => 
        db.db.includes(dbConfig.database) || dbConfig.database.includes(db.db)
      );

      if (similarDatabases.length > 0) {
        remediation.results.push({
          action: 'SIMILAR_DATABASES_FOUND',
          success: false,
          message: `Database '${dbConfig.database}' not found, but similar databases exist`,
          similarDatabases: similarDatabases.map(db => db.db)
        });
      } else {
        remediation.results.push({
          action: 'DATABASE_NOT_FOUND',
          success: false,
          message: `Database '${dbConfig.database}' does not exist. Manual database creation or restoration required.`
        });
      }

    } catch (error) {
      remediation.results.push({
        action: 'UNKNOWN_DATABASE_REMEDIATION',
        success: false,
        message: `Failed to remediate unknown database: ${error.message}`
      });
    }
  }

  /**
   * Remediate connection refused errors
   */
  async remediateConnectionRefused(remediation, whmClient, options) {
    try {
      if (!whmClient) {
        remediation.results.push({
          action: 'NO_WHM_ACCESS',
          success: false,
          message: 'Cannot restart MySQL service without WHM access'
        });
        return;
      }

      // Check if MySQL service is running
      const serviceStatus = await this.mysqlClient.checkMySQLService(whmClient);
      
      if (!serviceStatus.running) {
        // MySQL is down, attempt restart if approved
        if (options.approveServiceRestart) {
          remediation.actionsAttempted.push('RESTART_MYSQL_SERVICE');
          
          try {
            await this.mysqlClient.restartMySQLService(whmClient, true);
            remediation.results.push({
              action: 'RESTART_MYSQL_SERVICE',
              success: true,
              message: 'MySQL service restart initiated'
            });
          } catch (error) {
            remediation.results.push({
              action: 'RESTART_MYSQL_SERVICE',
              success: false,
              message: `Failed to restart MySQL service: ${error.message}`
            });
          }
        } else {
          remediation.requiresApproval = true;
          remediation.approvalRequired.push('SERVICE_RESTART');
          remediation.results.push({
            action: 'SERVICE_RESTART_APPROVAL_REQUIRED',
            success: false,
            message: 'MySQL service is down. Restart requires approval.'
          });
        }
      } else {
        remediation.results.push({
          action: 'SERVICE_RUNNING',
          success: false,
          message: 'MySQL service is running but connections are being refused. Check firewall and network configuration.'
        });
      }

    } catch (error) {
      remediation.results.push({
        action: 'CONNECTION_REFUSED_REMEDIATION',
        success: false,
        message: `Failed to remediate connection refused: ${error.message}`
      });
    }
  }

  /**
   * Remediate table corruption errors
   */
  async remediateTableCorrupt(remediation, dbConfig, cpanelClient, options) {
    try {
      if (options.approveTableRepair) {
        remediation.actionsAttempted.push('REPAIR_DATABASE');
        
        try {
          await cpanelClient.repairDatabase(dbConfig.database);
          remediation.results.push({
            action: 'REPAIR_DATABASE',
            success: true,
            message: `Database repair initiated for: ${dbConfig.database}`
          });
        } catch (error) {
          remediation.results.push({
            action: 'REPAIR_DATABASE',
            success: false,
            message: `Failed to repair database: ${error.message}`
          });
        }
      } else {
        remediation.requiresApproval = true;
        remediation.approvalRequired.push('TABLE_REPAIR');
        remediation.results.push({
          action: 'TABLE_REPAIR_APPROVAL_REQUIRED',
          success: false,
          message: 'Database table repair requires approval.'
        });
      }

    } catch (error) {
      remediation.results.push({
        action: 'TABLE_CORRUPT_REMEDIATION',
        success: false,
        message: `Failed to remediate table corruption: ${error.message}`
      });
    }
  }

  /**
   * Remediate too many connections errors
   */
  async remediateTooManyConnections(remediation, whmClient, options) {
    try {
      // This is typically a temporary issue that resolves itself
      remediation.results.push({
        action: 'WAIT_FOR_CONNECTIONS',
        success: false,
        message: 'Too many connections error is typically temporary. Wait a few minutes and retry.'
      });

      // Could potentially kill long-running queries if WHM access available and approved
      if (whmClient && options.approveKillConnections) {
        remediation.requiresApproval = true;
        remediation.approvalRequired.push('KILL_CONNECTIONS');
        remediation.results.push({
          action: 'KILL_CONNECTIONS_APPROVAL_REQUIRED',
          success: false,
          message: 'Killing MySQL connections requires approval.'
        });
      }

    } catch (error) {
      remediation.results.push({
        action: 'TOO_MANY_CONNECTIONS_REMEDIATION',
        success: false,
        message: `Failed to remediate too many connections: ${error.message}`
      });
    }
  }

  /**
   * Step F: Post-fix verification
   * Re-run connection test and HTTP check after remediation
   */
  async performPostFixVerification(dbConfig, domain, cpanelClient, resolvedIP = null) {
    try {
      this.logger.info('Step F: Performing post-fix verification');
      
      const verification = {
        timestamp: new Date().toISOString(),
        databaseConnection: null,
        httpCheck: null,
        wordpressCheck: null,
        success: false
      };

      // F1: Re-run database connection test using resolved IP
      this.logger.info('F1: Re-testing database connection');
      const connectionResult = await this.mysqlClient.testConnection(dbConfig, cpanelClient, resolvedIP);
      verification.databaseConnection = {
        success: connectionResult.success,
        error: connectionResult.error,
        message: connectionResult.success ? 'Database connection restored' : 'Database connection still failing'
      };

      // F2: HTTP check to verify WordPress loads
      if (connectionResult.success) {
        this.logger.info('F2: Checking WordPress HTTP response');
        const httpResult = await this.checkWordPressHttp(domain);
        verification.httpCheck = httpResult;

        // F3: Quick WordPress health check
        if (httpResult.success) {
          this.logger.info('F3: Performing WordPress health check');
          const wpHealthResult = await this.checkWordPressHealth(domain);
          verification.wordpressCheck = wpHealthResult;
        }
      }

      // Determine overall success
      verification.success = verification.databaseConnection.success && 
                           (verification.httpCheck?.success !== false);

      this.logger.info(`Post-fix verification completed. Success: ${verification.success}`);
      return verification;

    } catch (error) {
      this.logger.error(`Post-fix verification failed: ${error.message}`);
      return {
        timestamp: new Date().toISOString(),
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Check WordPress HTTP response
   */
  async checkWordPressHttp(domain, timeout = 10000) {
    try {
      const axios = require('axios');
      
      const response = await axios.get(`http://${domain}`, {
        timeout: timeout,
        validateStatus: () => true, // Accept any status code
        maxRedirects: 3
      });

      const isWordPress = response.data.includes('wp-content') || 
                         response.data.includes('WordPress') ||
                         response.headers['x-powered-by']?.includes('WordPress');

      const hasDbError = response.data.includes('Error establishing a database connection') ||
                        response.data.includes('database connection error');

      return {
        success: !hasDbError && response.status < 500,
        statusCode: response.status,
        isWordPress: isWordPress,
        hasDbError: hasDbError,
        message: hasDbError ? 'WordPress showing database error' : 
                response.status < 400 ? 'WordPress loading successfully' :
                `WordPress returned HTTP ${response.status}`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Failed to check WordPress HTTP: ${error.message}`
      };
    }
  }

  /**
   * Check WordPress health (basic functionality)
   */
  async checkWordPressHealth(domain) {
    try {
      // Try to access WordPress admin or login page
      const axios = require('axios');
      
      const loginResponse = await axios.get(`http://${domain}/wp-login.php`, {
        timeout: 5000,
        validateStatus: () => true
      });

      const isLoginPage = loginResponse.data.includes('wp-login') || 
                         loginResponse.data.includes('login_form');

      return {
        success: isLoginPage && loginResponse.status === 200,
        loginPageAccessible: isLoginPage,
        statusCode: loginResponse.status,
        message: isLoginPage ? 'WordPress admin accessible' : 'WordPress admin not accessible'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `WordPress health check failed: ${error.message}`
      };
    }
  }
}

module.exports = RemediationStep;