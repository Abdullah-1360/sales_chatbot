const winston = require('winston');
const silentLogger = require('../utils/silentLogger');

class ErrorMappingStep {
  constructor() {
    // Use silent logger in production for performance
    this.logger = process.env.NODE_ENV === 'production' ? require('../utils/silentLogger') : winston.createLogger({
      level: 'error',
      format: winston.format.simple(),
      transports: [new winston.transports.Console()]
    });
  }

  /**
   * Map MySQL connection errors to detailed root causes and recommendations
   */
  mapMySQLError(mysqlConnectionResult) {
    try {
      this.logger.info('=== Step D: MySQL Error Mapping ===');

      if (mysqlConnectionResult.success) {
        return {
          success: true,
          message: 'MySQL connection successful - no error mapping needed',
          errorAnalysis: null,
          recommendations: [{
            type: 'success',
            priority: 'info',
            message: 'MySQL connection is working correctly',
            action: 'none'
          }]
        };
      }

      const error = mysqlConnectionResult.finalResult?.error || mysqlConnectionResult.error;
      const errorCode = mysqlConnectionResult.finalResult?.errorCode || mysqlConnectionResult.errorCode;
      const rootCause = mysqlConnectionResult.finalResult?.rootCause || null;

      this.logger.info(`Analyzing MySQL error: ${errorCode} - ${error}`);

      const errorAnalysis = this.analyzeError(error, errorCode, rootCause, mysqlConnectionResult);
      const recommendations = this.generateDetailedRecommendations(errorAnalysis, mysqlConnectionResult);

      return {
        success: false,
        errorAnalysis,
        recommendations,
        originalError: {
          message: error,
          code: errorCode,
          rootCause
        }
      };

    } catch (error) {
      this.logger.error(`Error mapping failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        errorAnalysis: null,
        recommendations: [{
          type: 'analysis_error',
          priority: 'medium',
          message: 'Failed to analyze MySQL error',
          action: 'manual_review'
        }]
      };
    }
  }

  /**
   * Analyze MySQL error and provide detailed root cause analysis
   */
  analyzeError(error, errorCode, rootCause, connectionResult) {
    const analysis = {
      category: 'unknown',
      severity: 'medium',
      description: 'Unknown MySQL error',
      likelyCauses: [],
      technicalDetails: {},
      context: {}
    };

    // Add connection context
    analysis.context = {
      host: connectionResult.finalResult?.connectionDetails?.host || connectionResult.config?.host || 'unknown',
      user: connectionResult.config?.user || 'unknown',
      database: connectionResult.config?.database || 'unknown',
      usedResolvedIp: connectionResult.finalResult?.connectionDetails?.usedResolvedIp || false
    };

    // Check for localhost validation failure first
    if (errorCode === 'NON_LOCALHOST_HOST' || connectionResult.localhostValidation?.valid === false) {
      analysis.category = 'configuration_error';
      analysis.severity = 'high';
      analysis.description = 'Database host is not localhost - diagnostic tool limitation';
      analysis.likelyCauses = [
        'Database host is configured for a remote server',
        'wp-config.php DB_HOST is not set to localhost or 127.0.0.1',
        'Using a remote database server that cannot be tested by this tool',
        'Database configuration points to external MySQL server'
      ];
      analysis.technicalDetails = {
        errorPattern: 'NON_LOCALHOST_HOST',
        commonScenario: 'Remote database configuration detected',
        configuredHost: connectionResult.config?.host || 'unknown',
        localhostValidation: connectionResult.localhostValidation
      };

    // Analyze based on error code and message
    // Check for database permissions error first (more specific)
    } else if (errorCode === 'ER_DBACCESS_DENIED_ERROR' || (error.includes('Access denied for user') && error.includes('to database'))) {
      analysis.category = 'database_permissions';
      analysis.severity = 'high';
      analysis.description = 'User authenticated but lacks database access permissions';
      analysis.likelyCauses = [
        'User does not have privileges on the specified database',
        'Database privileges not granted to user',
        'User exists but has no database-level permissions',
        'Database name is correct but user lacks access rights',
        'User configured for different database access'
      ];
      analysis.technicalDetails = {
        errorPattern: 'ER_DBACCESS_DENIED_ERROR',
        commonScenario: 'User authenticated successfully but lacks database permissions',
        mysqlUserHost: this.extractUserHost(error),
        databaseAccess: 'denied'
      };

    } else if (errorCode === 'ER_ACCESS_DENIED_ERROR' || error.includes('Access denied for user')) {
      analysis.category = 'authentication';
      analysis.severity = 'high';
      analysis.description = 'Database user authentication failed';
      analysis.likelyCauses = [
        'Incorrect password in wp-config.php',
        'Incorrect username in wp-config.php',
        'User does not have permission to connect from this IP address',
        'User account is locked or disabled',
        'MySQL user configured for localhost only but connecting from external IP'
      ];
      analysis.technicalDetails = {
        errorPattern: 'ER_ACCESS_DENIED_ERROR',
        commonScenario: 'User credentials or permissions issue',
        mysqlUserHost: this.extractUserHost(error)
      };

    } else if (errorCode === 'ER_BAD_DB_ERROR' || error.includes('Unknown database')) {
      analysis.category = 'database_missing';
      analysis.severity = 'high';
      analysis.description = 'Specified database does not exist';
      analysis.likelyCauses = [
        'Database name in wp-config.php is incorrect',
        'Database was deleted or never created',
        'Typo in database name',
        'Case sensitivity issue with database name'
      ];
      analysis.technicalDetails = {
        errorPattern: 'ER_BAD_DB_ERROR',
        commonScenario: 'Database name mismatch or missing database'
      };

    } else if (errorCode === 'ECONNREFUSED' || error.includes('Connection refused')) {
      analysis.category = 'connection_refused';
      analysis.severity = 'critical';
      analysis.description = 'Cannot connect to MySQL server';
      analysis.likelyCauses = [
        'MySQL server is not running',
        'MySQL server is not listening on the specified port',
        'Firewall blocking the connection',
        'Wrong host or IP address in wp-config.php',
        'Network connectivity issues'
      ];
      analysis.technicalDetails = {
        errorPattern: 'ECONNREFUSED',
        commonScenario: 'MySQL service down or network issue'
      };

    } else if (errorCode === 'ETIMEDOUT' || error.includes('timeout')) {
      analysis.category = 'connection_timeout';
      analysis.severity = 'high';
      analysis.description = 'Connection to MySQL server timed out';
      analysis.likelyCauses = [
        'Network latency or connectivity issues',
        'MySQL server overloaded',
        'Firewall causing delays',
        'DNS resolution issues',
        'MySQL server configured with long connection timeouts'
      ];
      analysis.technicalDetails = {
        errorPattern: 'ETIMEDOUT',
        commonScenario: 'Network or performance issue'
      };

    } else if (errorCode === 'ENOTFOUND' || error.includes('getaddrinfo ENOTFOUND')) {
      analysis.category = 'dns_resolution';
      analysis.severity = 'high';
      analysis.description = 'Cannot resolve MySQL hostname';
      analysis.likelyCauses = [
        'Incorrect hostname in wp-config.php',
        'DNS server issues',
        'Hostname does not exist',
        'Network connectivity problems'
      ];
      analysis.technicalDetails = {
        errorPattern: 'ENOTFOUND',
        commonScenario: 'DNS or hostname issue'
      };

    } else if (errorCode === 'ER_TOO_MANY_CONNECTIONS' || error.includes('Too many connections')) {
      analysis.category = 'resource_exhaustion';
      analysis.severity = 'medium';
      analysis.description = 'MySQL server has reached maximum connection limit';
      analysis.likelyCauses = [
        'MySQL max_connections limit reached',
        'Application not closing database connections properly',
        'High traffic causing connection pool exhaustion',
        'Long-running queries holding connections'
      ];
      analysis.technicalDetails = {
        errorPattern: 'ER_TOO_MANY_CONNECTIONS',
        commonScenario: 'Resource exhaustion - too many active connections'
      };

    } else if (error.includes('SQLSTATE[HY000]') && error.includes('InnoDB')) {
      analysis.category = 'database_corruption';
      analysis.severity = 'critical';
      analysis.description = 'Possible InnoDB database corruption';
      analysis.likelyCauses = [
        'Database table corruption',
        'InnoDB storage engine issues',
        'Disk space exhaustion',
        'Improper MySQL shutdown',
        'Hardware issues affecting storage'
      ];
      analysis.technicalDetails = {
        errorPattern: 'SQLSTATE[HY000] with InnoDB',
        commonScenario: 'Database corruption or storage engine failure'
      };

    } else if (errorCode === 'ER_CRASHED_ON_USAGE' || errorCode === 'ER_TABLE_CORRUPT') {
      analysis.category = 'table_corruption';
      analysis.severity = 'high';
      analysis.description = 'Database table is corrupted';
      analysis.likelyCauses = [
        'Table corruption due to improper shutdown',
        'Disk space issues',
        'Hardware problems',
        'MySQL version compatibility issues'
      ];
      analysis.technicalDetails = {
        errorPattern: errorCode,
        commonScenario: 'Table-level corruption'
      };
    }

    return analysis;
  }

  /**
   * Extract user and host information from access denied error
   */
  extractUserHost(error) {
    const match = error.match(/Access denied for user '([^']+)'@'([^']+)'/);
    if (match) {
      return {
        user: match[1],
        host: match[2]
      };
    }
    return null;
  }

  /**
   * Generate detailed recommendations based on error analysis
   */
  generateDetailedRecommendations(errorAnalysis, connectionResult) {
    const recommendations = [];

    switch (errorAnalysis.category) {
      case 'configuration_error':
        if (errorAnalysis.technicalDetails?.errorPattern === 'NON_LOCALHOST_HOST') {
          recommendations.push({
            type: 'localhost_requirement',
            priority: 'high',
            message: 'Update database host to localhost in wp-config.php',
            action: 'update_db_host',
            details: 'Change DB_HOST to "localhost" or "127.0.0.1" in wp-config.php'
          });

          recommendations.push({
            type: 'tool_limitation',
            priority: 'high',
            message: 'This diagnostic tool only works with localhost MySQL configurations',
            action: 'use_alternative_tools',
            details: 'For remote databases, use your hosting provider\'s database management tools'
          });

          recommendations.push({
            type: 'remote_database_info',
            priority: 'medium',
            message: 'If using a remote database server, contact your hosting provider',
            action: 'contact_support',
            details: 'Remote database connections require different diagnostic approaches'
          });

          recommendations.push({
            type: 'configuration_check',
            priority: 'medium',
            message: 'Verify if the database should actually be localhost',
            action: 'verify_configuration',
            details: 'Check if the database is supposed to be on the same server as WordPress'
          });
        }
        break;

      case 'authentication':
        recommendations.push({
          type: 'check_credentials',
          priority: 'high',
          message: 'Verify database username and password in wp-config.php',
          action: 'update_credentials',
          details: 'Check DB_USER and DB_PASSWORD constants in wp-config.php'
        });

        if (connectionResult.finalResult?.connectionDetails?.usedResolvedIp) {
          recommendations.push({
            type: 'check_user_permissions',
            priority: 'high',
            message: 'Database user may only be configured for localhost connections',
            action: 'update_mysql_user_host',
            details: `User '${errorAnalysis.context.user}' needs permission to connect from '${errorAnalysis.context.host}'`
          });
        }

        recommendations.push({
          type: 'verify_user_exists',
          priority: 'medium',
          message: 'Verify the database user exists and is active',
          action: 'check_mysql_users',
          details: 'Use MySQL command: SELECT User, Host FROM mysql.user;'
        });
        break;

      case 'database_permissions':
        recommendations.push({
          type: 'grant_database_privileges',
          priority: 'high',
          message: 'Grant database privileges to the user',
          action: 'grant_database_access',
          details: `GRANT ALL PRIVILEGES ON \`${errorAnalysis.context.database}\`.* TO '${errorAnalysis.context.user}'@'${errorAnalysis.technicalDetails.mysqlUserHost?.host || '%'}';`
        });

        recommendations.push({
          type: 'check_database_privileges',
          priority: 'high',
          message: 'Check current database privileges for the user',
          action: 'show_grants',
          details: `SHOW GRANTS FOR '${errorAnalysis.context.user}'@'${errorAnalysis.technicalDetails.mysqlUserHost?.host || '%'}';`
        });

        recommendations.push({
          type: 'verify_database_exists',
          priority: 'medium',
          message: 'Verify the database exists and name is correct',
          action: 'check_database_list',
          details: 'Use MySQL command: SHOW DATABASES;'
        });

        recommendations.push({
          type: 'flush_privileges',
          priority: 'medium',
          message: 'Flush MySQL privileges after granting access',
          action: 'flush_privileges',
          details: 'Run: FLUSH PRIVILEGES;'
        });
        break;

      case 'database_missing':
        recommendations.push({
          type: 'check_database_name',
          priority: 'high',
          message: 'Verify database name in wp-config.php matches existing database',
          action: 'update_database_name',
          details: 'Check DB_NAME constant in wp-config.php'
        });

        recommendations.push({
          type: 'create_database',
          priority: 'medium',
          message: 'Create the missing database if name is correct',
          action: 'create_mysql_database',
          details: `CREATE DATABASE \`${errorAnalysis.context.database}\`;`
        });
        break;

      case 'connection_refused':
        recommendations.push({
          type: 'check_mysql_service',
          priority: 'critical',
          message: 'Verify MySQL service is running',
          action: 'start_mysql_service',
          details: 'Check service status and start if needed'
        });

        recommendations.push({
          type: 'check_host_config',
          priority: 'high',
          message: 'Verify DB_HOST setting in wp-config.php',
          action: 'update_host_config',
          details: 'Ensure hostname/IP and port are correct'
        });

        recommendations.push({
          type: 'check_firewall',
          priority: 'medium',
          message: 'Check firewall rules for MySQL port (3306)',
          action: 'configure_firewall',
          details: 'Ensure MySQL port is accessible'
        });
        break;

      case 'connection_timeout':
        recommendations.push({
          type: 'check_network',
          priority: 'high',
          message: 'Check network connectivity to MySQL server',
          action: 'test_network_connection',
          details: 'Test ping and telnet to MySQL host and port'
        });

        recommendations.push({
          type: 'check_mysql_performance',
          priority: 'medium',
          message: 'Check MySQL server performance and load',
          action: 'monitor_mysql_performance',
          details: 'Review MySQL process list and server status'
        });
        break;

      case 'dns_resolution':
        recommendations.push({
          type: 'check_hostname',
          priority: 'high',
          message: 'Verify hostname in wp-config.php is correct',
          action: 'update_hostname',
          details: 'Check DB_HOST constant and DNS resolution'
        });

        recommendations.push({
          type: 'use_ip_address',
          priority: 'medium',
          message: 'Consider using IP address instead of hostname',
          action: 'update_to_ip',
          details: 'Replace hostname with direct IP address in wp-config.php'
        });
        break;

      case 'resource_exhaustion':
        recommendations.push({
          type: 'check_connection_limit',
          priority: 'high',
          message: 'Check MySQL max_connections setting',
          action: 'increase_max_connections',
          details: 'Review and potentially increase max_connections in MySQL config'
        });

        recommendations.push({
          type: 'optimize_connections',
          priority: 'medium',
          message: 'Optimize application connection usage',
          action: 'review_connection_pooling',
          details: 'Ensure connections are properly closed and pooled'
        });
        break;

      case 'database_corruption':
      case 'table_corruption':
        recommendations.push({
          type: 'backup_database',
          priority: 'critical',
          message: 'Create immediate backup before attempting repairs',
          action: 'create_backup',
          details: 'Use mysqldump or similar backup tool'
        });

        recommendations.push({
          type: 'repair_tables',
          priority: 'high',
          message: 'Run MySQL table repair commands',
          action: 'repair_mysql_tables',
          details: 'Use REPAIR TABLE or mysqlcheck utility'
        });

        recommendations.push({
          type: 'check_disk_space',
          priority: 'medium',
          message: 'Check available disk space on MySQL server',
          action: 'monitor_disk_space',
          details: 'Ensure adequate free space for MySQL operations'
        });
        break;

      default:
        recommendations.push({
          type: 'general_troubleshooting',
          priority: 'medium',
          message: 'Review MySQL error logs for more details',
          action: 'check_mysql_logs',
          details: 'Examine MySQL error log files for additional information'
        });
    }

    return recommendations;
  }
}

module.exports = ErrorMappingStep;