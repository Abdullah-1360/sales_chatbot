const winston = require('winston');

class DiagnosisStep {
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
   * Step C: Attempt direct DB connection using parsed credentials
   * Try multiple connection methods including UNIX sockets
   */
  async attemptDatabaseConnection(dbConfig, cpanelClient = null) {
    try {
      this.logger.info('Step C: Attempting database connection with parsed credentials');
      
      // Use the enhanced MySQL client that handles UNIX sockets and TCP
      // Pass the cPanel client to get the actual socket path
      const connectionResult = await this.mysqlClient.testConnection(dbConfig, cpanelClient);
      
      if (connectionResult.success) {
        this.logger.info(`Database connection successful: ${connectionResult.message}`);
        return {
          success: true,
          message: connectionResult.message,
          attempts: connectionResult.attempts,
          method: connectionResult.attempts.find(a => a.result.success)?.method || 'unknown'
        };
      } else {
        this.logger.error(`Database connection failed: ${connectionResult.message}`);
        return {
          success: false,
          message: connectionResult.message,
          attempts: connectionResult.attempts,
          primaryError: connectionResult.primaryError
        };
      }

    } catch (error) {
      this.logger.error(`Database connection attempt failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Connection attempt threw exception',
        attempts: []
      };
    }
  }

  /**
   * Check if host is localhost variant
   */
  isLocalhost(host) {
    const localhostVariants = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    return localhostVariants.includes(host.toLowerCase());
  }

  /**
   * Check TCP connectivity to host:port
   */
  async checkTcpConnectivity(host, port, timeout = 5000) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);

      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  /**
   * Step D: Map MySQL error to root cause with detailed analysis
   */
  mapMysqlErrorToRootCause(connectionResult) {
    try {
      this.logger.info('Step D: Mapping MySQL error to root cause');
      
      if (!connectionResult || connectionResult.success) {
        return {
          cause: 'CONNECTION_SUCCESS',
          description: 'Database connection successful',
          severity: 'NONE',
          escalation: null
        };
      }

      const error = connectionResult.error || '';
      const code = connectionResult.code || '';
      const errno = connectionResult.errno || '';

      // Step D1: Access denied for user
      if (code === 'ER_ACCESS_DENIED_ERROR' || error.includes('Access denied')) {
        return {
          cause: 'ACCESS_DENIED',
          description: 'Wrong password, wrong user, or missing privileges',
          severity: 'HIGH',
          escalation: 'automated_check',
          details: {
            possibleCauses: [
              'Incorrect password in wp-config.php',
              'Database user does not exist',
              'User exists but lacks privileges on database',
              'User not allowed to connect from current host'
            ],
            nextSteps: ['check_user_exists', 'check_privileges', 'verify_password']
          }
        };
      }

      // Step D2: Unknown database
      if (code === 'ER_BAD_DB_ERROR' || error.includes('Unknown database')) {
        return {
          cause: 'UNKNOWN_DATABASE',
          description: 'Database missing or name incorrect',
          severity: 'HIGH',
          escalation: 'automated_check',
          details: {
            possibleCauses: [
              'Database was deleted or never created',
              'Incorrect database name in wp-config.php',
              'Database exists with different name/prefix'
            ],
            nextSteps: ['list_databases', 'check_backups', 'verify_db_name']
          }
        };
      }

      // Step D3: Can't connect to MySQL server / Connection refused
      if (code === 'ECONNREFUSED' || error.includes('Connection refused') || 
          error.includes("Can't connect to MySQL server")) {
        return {
          cause: 'CONNECTION_REFUSED',
          description: 'MySQL down, firewall blocking, or wrong host',
          severity: 'CRITICAL',
          escalation: 'service_check',
          details: {
            possibleCauses: [
              'MySQL service is not running',
              'Firewall blocking port 3306',
              'Wrong hostname in wp-config.php',
              'Network connectivity issues'
            ],
            nextSteps: ['check_mysql_service', 'check_firewall', 'verify_host']
          }
        };
      }

      // Step D4: Too many connections
      if (code === 'ER_TOO_MANY_CONNECTIONS' || error.includes('Too many connections')) {
        return {
          cause: 'TOO_MANY_CONNECTIONS',
          description: 'MySQL connection limit reached',
          severity: 'MEDIUM',
          escalation: 'resource_check',
          details: {
            possibleCauses: [
              'High traffic causing connection exhaustion',
              'Application not closing connections properly',
              'max_connections setting too low',
              'Long-running queries blocking connections'
            ],
            nextSteps: ['check_connection_count', 'check_max_connections', 'identify_slow_queries']
          }
        };
      }

      // Step D5: Table corruption / InnoDB errors
      if (code === 'ER_CRASHED_ON_USAGE' || code === 'ER_TABLE_CORRUPT' ||
          error.includes('SQLSTATE[HY000]') || error.includes('InnoDB')) {
        return {
          cause: 'TABLE_CORRUPT',
          description: 'Database corruption detected',
          severity: 'HIGH',
          escalation: 'repair_required',
          details: {
            possibleCauses: [
              'Disk space exhaustion during write',
              'Improper MySQL shutdown',
              'Hardware issues (disk/memory)',
              'File system corruption'
            ],
            nextSteps: ['check_disk_space', 'run_table_check', 'attempt_repair']
          }
        };
      }

      // Step D6: Connection timeout
      if (code === 'ETIMEDOUT' || error.includes('timeout')) {
        return {
          cause: 'CONNECTION_TIMEOUT',
          description: 'Connection attempt timed out',
          severity: 'HIGH',
          escalation: 'network_check',
          details: {
            possibleCauses: [
              'Network latency or packet loss',
              'MySQL server overloaded',
              'Firewall dropping packets',
              'DNS resolution issues'
            ],
            nextSteps: ['check_network_connectivity', 'verify_dns', 'check_server_load']
          }
        };
      }

      // Step D7: Host not found
      if (code === 'ENOTFOUND' || error.includes('getaddrinfo ENOTFOUND')) {
        return {
          cause: 'HOST_NOT_FOUND',
          description: 'Database hostname cannot be resolved',
          severity: 'HIGH',
          escalation: 'dns_check',
          details: {
            possibleCauses: [
              'Incorrect hostname in wp-config.php',
              'DNS resolution failure',
              'Hostname does not exist'
            ],
            nextSteps: ['verify_hostname', 'check_dns_resolution', 'try_ip_address']
          }
        };
      }

      // Default: Unknown error
      return {
        cause: 'UNKNOWN_ERROR',
        description: 'Unrecognized database connection error',
        severity: 'MEDIUM',
        escalation: 'manual_investigation',
        details: {
          originalError: error,
          errorCode: code || errno,
          possibleCauses: ['Uncommon MySQL error', 'Network issue', 'Configuration problem'],
          nextSteps: ['check_mysql_logs', 'manual_investigation']
        }
      };

    } catch (error) {
      this.logger.error(`Error mapping failed: ${error.message}`);
      return {
        cause: 'MAPPING_ERROR',
        description: 'Failed to analyze error',
        severity: 'MEDIUM',
        escalation: 'manual_investigation'
      };
    }
  }

  /**
   * Step E: Targeted deeper checks based on mapped error
   */
  async performTargetedChecks(rootCause, dbConfig, cpanelClient, whmClient = null) {
    try {
      this.logger.info(`Step E: Performing targeted checks for: ${rootCause.cause}`);
      
      const checks = {
        rootCause: rootCause.cause,
        checks: [],
        recommendations: [],
        autoFixAvailable: false,
        requiresApproval: false
      };

      switch (rootCause.cause) {
        case 'ACCESS_DENIED':
          await this.checkE1AccessDenied(checks, dbConfig, cpanelClient);
          break;
          
        case 'UNKNOWN_DATABASE':
          await this.checkE2UnknownDatabase(checks, dbConfig, cpanelClient);
          break;
          
        case 'CONNECTION_REFUSED':
          await this.checkE3ConnectionRefused(checks, dbConfig, whmClient);
          break;
          
        case 'TOO_MANY_CONNECTIONS':
          await this.checkE4TooManyConnections(checks, dbConfig, whmClient);
          break;
          
        case 'TABLE_CORRUPT':
          await this.checkE5TableCorruption(checks, dbConfig, cpanelClient);
          break;
          
        default:
          checks.recommendations.push('Manual investigation required for this error type');
          break;
      }

      return checks;

    } catch (error) {
      this.logger.error(`Targeted checks failed: ${error.message}`);
      return {
        rootCause: rootCause.cause,
        error: error.message,
        checks: [],
        recommendations: ['Failed to perform targeted checks - manual investigation required']
      };
    }
  }

  /**
   * E1: Access Denied - Check user existence and privileges
   */
  async checkE1AccessDenied(checks, dbConfig, cpanelClient) {
    try {
      this.logger.info('E1: Checking access denied - user existence and privileges');
      
      // Check if database user exists
      const users = await cpanelClient.listDatabaseUsers();
      const userExists = users.some(user => 
        user.user === dbConfig.user || user.user.endsWith(`_${dbConfig.user}`)
      );

      checks.checks.push({
        type: 'user_existence',
        result: userExists,
        details: userExists ? 'Database user exists' : 'Database user not found',
        users: users.map(u => u.user)
      });

      if (userExists) {
        // User exists - likely privilege or password issue
        checks.recommendations.push('Re-grant database privileges for existing user');
        checks.recommendations.push('Verify password in wp-config.php matches database user');
        checks.autoFixAvailable = true;
        checks.requiresApproval = false; // Privilege repair is safe
      } else {
        // User missing - needs creation
        checks.recommendations.push('Create database user and grant privileges');
        checks.recommendations.push('Update wp-config.php with correct username');
        checks.autoFixAvailable = true;
        checks.requiresApproval = true; // User creation requires approval
      }

      // Check if database exists for privilege verification
      const databases = await cpanelClient.listDatabases();
      const dbExists = databases.some(db => 
        db.db === dbConfig.database || db.db.endsWith(`_${dbConfig.database}`)
      );

      checks.checks.push({
        type: 'database_existence',
        result: dbExists,
        details: dbExists ? 'Target database exists' : 'Target database not found',
        databases: databases.map(d => d.db)
      });

      if (!dbExists) {
        checks.recommendations.push('Database does not exist - may need to create or restore');
      }

    } catch (error) {
      this.logger.error(`E1 check failed: ${error.message}`);
      checks.checks.push({
        type: 'access_denied_check',
        result: false,
        error: error.message
      });
    }
  }

  /**
   * E2: Unknown Database - Check database existence and backups
   */
  async checkE2UnknownDatabase(checks, dbConfig, cpanelClient) {
    try {
      this.logger.info('E2: Checking unknown database - existence and backups');
      
      // List all databases
      const databases = await cpanelClient.listDatabases();
      const exactMatch = databases.find(db => db.db === dbConfig.database);
      const similarDatabases = databases.filter(db => 
        db.db.includes(dbConfig.database) || dbConfig.database.includes(db.db)
      );

      checks.checks.push({
        type: 'database_list',
        result: !!exactMatch,
        details: exactMatch ? 'Database found' : 'Database not found',
        exactMatch: exactMatch,
        similarDatabases: similarDatabases.map(d => d.db),
        allDatabases: databases.map(d => d.db)
      });

      if (exactMatch) {
        checks.recommendations.push('Database exists but connection failed - check user privileges');
      } else if (similarDatabases.length > 0) {
        checks.recommendations.push(`Similar databases found: ${similarDatabases.map(d => d.db).join(', ')}`);
        checks.recommendations.push('Verify correct database name in wp-config.php');
        checks.autoFixAvailable = false; // Manual verification needed
      } else {
        checks.recommendations.push('Database does not exist - may need restoration from backup');
        checks.recommendations.push('Check if database was accidentally deleted');
        checks.autoFixAvailable = true;
        checks.requiresApproval = true; // Database creation/restore requires approval
      }

      // TODO: Check for available backups (would require backup system integration)
      checks.checks.push({
        type: 'backup_availability',
        result: null,
        details: 'Backup check not implemented - manual verification required'
      });

    } catch (error) {
      this.logger.error(`E2 check failed: ${error.message}`);
      checks.checks.push({
        type: 'unknown_database_check',
        result: false,
        error: error.message
      });
    }
  }

  /**
   * E3: Connection Refused - Check MySQL service status
   */
  async checkE3ConnectionRefused(checks, dbConfig, whmClient) {
    try {
      this.logger.info('E3: Checking connection refused - MySQL service status');
      
      if (!whmClient) {
        checks.checks.push({
          type: 'mysql_service_check',
          result: false,
          details: 'No WHM access available - cannot check MySQL service status'
        });
        checks.recommendations.push('Manual MySQL service check required - no WHM access');
        return;
      }

      // Check MySQL service status via WHM
      const serviceStatus = await this.mysqlClient.checkMySQLService(whmClient);
      
      checks.checks.push({
        type: 'mysql_service_status',
        result: serviceStatus.running,
        details: serviceStatus.running ? 'MySQL service is running' : 'MySQL service is not running',
        serviceInfo: serviceStatus.status
      });

      if (!serviceStatus.running) {
        checks.recommendations.push('MySQL service is down - restart required');
        checks.autoFixAvailable = true;
        checks.requiresApproval = true; // Service restart requires approval
      } else {
        // Service running but connection refused - likely firewall or config issue
        checks.recommendations.push('MySQL service running but connections refused');
        checks.recommendations.push('Check firewall settings and MySQL configuration');
        checks.recommendations.push('Verify MySQL is listening on correct port');
        
        // Check if it's a localhost connection issue
        if (this.isLocalhost(dbConfig.host)) {
          checks.recommendations.push('Try connecting via 127.0.0.1 instead of localhost');
        }
      }

    } catch (error) {
      this.logger.error(`E3 check failed: ${error.message}`);
      checks.checks.push({
        type: 'connection_refused_check',
        result: false,
        error: error.message
      });
    }
  }

  /**
   * E4: Too Many Connections - Check connection counts and limits
   */
  async checkE4TooManyConnections(checks, dbConfig, whmClient) {
    try {
      this.logger.info('E4: Checking too many connections - connection counts and limits');
      
      // This would require a working MySQL connection to check SHOW STATUS
      // Since we can't connect, we'll provide general recommendations
      checks.checks.push({
        type: 'connection_analysis',
        result: false,
        details: 'Cannot check connection counts without MySQL access'
      });

      checks.recommendations.push('MySQL connection limit reached');
      checks.recommendations.push('Wait for existing connections to close naturally');
      checks.recommendations.push('Check for connection leaks in application code');
      checks.recommendations.push('Consider increasing max_connections if server resources allow');
      
      checks.autoFixAvailable = true;
      checks.requiresApproval = true; // Connection management requires approval

    } catch (error) {
      this.logger.error(`E4 check failed: ${error.message}`);
      checks.checks.push({
        type: 'too_many_connections_check',
        result: false,
        error: error.message
      });
    }
  }

  /**
   * E5: Table Corruption - Check disk space and prepare repair
   */
  async checkE5TableCorruption(checks, dbConfig, cpanelClient) {
    try {
      this.logger.info('E5: Checking table corruption - disk space and repair options');
      
      // Check disk space (this would require server access)
      checks.checks.push({
        type: 'disk_space_check',
        result: null,
        details: 'Disk space check requires server access - manual verification needed'
      });

      checks.recommendations.push('Database corruption detected');
      checks.recommendations.push('Check server disk space - corruption often caused by disk full');
      checks.recommendations.push('Run MySQL table repair (mysqlcheck --auto-repair)');
      checks.recommendations.push('Enable WordPress database repair mode temporarily');
      
      checks.autoFixAvailable = true;
      checks.requiresApproval = true; // Table repair is potentially destructive

    } catch (error) {
      this.logger.error(`E5 check failed: ${error.message}`);
      checks.checks.push({
        type: 'table_corruption_check',
        result: false,
        error: error.message
      });
    }
  }

  /**
   * Perform extended diagnosis with additional checks
   */
  async performExtendedDiagnosis(dbConfig, cpanelClient, whmClient = null) {
    try {
      this.logger.info('Performing extended database diagnosis');
      
      const extendedDiagnosis = {
        basicDiagnosis: await this.diagnoseConnection(dbConfig),
        databaseExists: null,
        userExists: null,
        serviceStatus: null,
        diskSpace: null,
        additionalChecks: {}
      };

      // Check if database exists
      if (cpanelClient) {
        try {
          const databases = await cpanelClient.listDatabases();
          extendedDiagnosis.databaseExists = databases.some(db => 
            db.db === dbConfig.database || db.db.endsWith(`_${dbConfig.database}`)
          );
          extendedDiagnosis.additionalChecks.availableDatabases = databases.map(db => db.db);
        } catch (error) {
          this.logger.warn(`Could not check database existence: ${error.message}`);
        }

        // Check if user exists
        try {
          const users = await cpanelClient.listDatabaseUsers();
          extendedDiagnosis.userExists = users.some(user => 
            user.user === dbConfig.user || user.user.endsWith(`_${dbConfig.user}`)
          );
          extendedDiagnosis.additionalChecks.availableUsers = users.map(user => user.user);
        } catch (error) {
          this.logger.warn(`Could not check database users: ${error.message}`);
        }
      }

      // Check MySQL service status (if WHM access available)
      if (whmClient) {
        try {
          extendedDiagnosis.serviceStatus = await this.mysqlClient.checkMySQLService(whmClient);
        } catch (error) {
          this.logger.warn(`Could not check MySQL service status: ${error.message}`);
        }
      }

      return extendedDiagnosis;

    } catch (error) {
      this.logger.error(`Extended diagnosis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate diagnosis summary
   */
  generateDiagnosisSummary(diagnosis) {
    const summary = {
      status: diagnosis.basicDiagnosis?.connectionTest?.success ? 'HEALTHY' : 'UNHEALTHY',
      primaryIssue: diagnosis.basicDiagnosis?.rootCause?.cause || 'UNKNOWN',
      severity: diagnosis.basicDiagnosis?.rootCause?.severity || 'UNKNOWN',
      actionRequired: !diagnosis.basicDiagnosis?.connectionTest?.success,
      checks: {
        connection: diagnosis.basicDiagnosis?.connectionTest?.success || false,
        databaseExists: diagnosis.databaseExists,
        userExists: diagnosis.userExists,
        serviceRunning: diagnosis.serviceStatus?.running
      }
    };

    return summary;
  }
}

module.exports = DiagnosisStep;