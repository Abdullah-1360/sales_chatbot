const mysql = require('mysql');
const winston = require('winston');

class MySQLClient {
  constructor() {
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



  mapErrorToRootCause(error) {
    const errorMappings = {
      'ER_ACCESS_DENIED_ERROR': {
        cause: 'ACCESS_DENIED',
        description: 'Database user credentials are incorrect or user lacks privileges',
        severity: 'HIGH'
      },
      'ER_BAD_DB_ERROR': {
        cause: 'UNKNOWN_DATABASE',
        description: 'Database does not exist',
        severity: 'HIGH'
      },
      'ECONNREFUSED': {
        cause: 'CONNECTION_REFUSED',
        description: 'MySQL server is not running or not accepting connections',
        severity: 'CRITICAL'
      },
      'ETIMEDOUT': {
        cause: 'CONNECTION_TIMEOUT',
        description: 'Connection to MySQL server timed out',
        severity: 'HIGH'
      },
      'ENOTFOUND': {
        cause: 'HOST_NOT_FOUND',
        description: 'MySQL host cannot be resolved',
        severity: 'HIGH'
      },
      'ER_TOO_MANY_CONNECTIONS': {
        cause: 'TOO_MANY_CONNECTIONS',
        description: 'MySQL server has reached maximum connection limit',
        severity: 'MEDIUM'
      },
      'ER_CRASHED_ON_USAGE': {
        cause: 'TABLE_CORRUPT',
        description: 'Database table is corrupted',
        severity: 'HIGH'
      },
      'ER_TABLE_CORRUPT': {
        cause: 'TABLE_CORRUPT',
        description: 'Database table is corrupted',
        severity: 'HIGH'
      }
    };

    const mapping = errorMappings[error.code] || errorMappings[error.errno];

    if (mapping) {
      return {
        ...mapping,
        originalError: error.message,
        errorCode: error.code || error.errno
      };
    }

    return {
      cause: 'UNKNOWN_ERROR',
      description: 'Unknown database connection error',
      severity: 'MEDIUM',
      originalError: error.message,
      errorCode: error.code || error.errno
    };
  }

  /**
   * Test MySQL connection with parsed configuration
   */
  async testConnection(config, resolvedIp = null) {
    return new Promise((resolve) => {
      try {
        this.logger.info(`Testing MySQL connection to ${config.host}:${config.port}`);
        
        // Use resolved IP if available, otherwise use the host from config
        const connectionHost = resolvedIp || config.host;
        
        // Create connection object with completely isolated values to prevent winston interference
        const connectionConfig = {
          host: connectionHost,
          user: config.user ? String(config.user) : '',
          password: config.password ? String(config.password) : '',
          database: config.database ? String(config.database) : ''
        };
        
        // Add port if specified and not default
        if (config.port && config.port !== 3306) {
          connectionConfig.port = Number(config.port);
        }
        
        // Log connection config for debugging (no masking)
        console.log('Connection Config:', JSON.stringify(connectionConfig, null, 2));
        
        const connection = mysql.createConnection(connectionConfig);
        
        connection.connect((err) => {
          if (err) {
            this.logger.error(`MySQL connection failed: ${err.message}`);
            const rootCause = this.mapErrorToRootCause(err);

            resolve({
              success: false,
              error: err.message,
              errorCode: err.code,
              rootCause,
              connectionDetails: {
                host: connectionHost,
                user: config.user,
                database: config.database,
                port: config.port,
                originalHost: config.host,
                usedResolvedIp: !!resolvedIp
              }
            });
          } else {
            this.logger.info("Database credentials are valid");
            connection.end();

            resolve({
              success: true,
              message: "Database credentials are valid",
              connectionDetails: {
                host: connectionHost,
                user: config.user,
                database: config.database,
                port: config.port,
                originalHost: config.host,
                usedResolvedIp: !!resolvedIp
              }
            });
          }
        });

        // Handle connection timeout
        connection.on('error', (err) => {
          this.logger.error(`MySQL connection error: ${err.message}`);
          const rootCause = this.mapErrorToRootCause(err);

          resolve({
            success: false,
            error: err.message,
            errorCode: err.code,
            rootCause,
            connectionDetails: {
              host: connectionHost,
              user: config.user,
              database: config.database,
              port: config.port,
              originalHost: config.host,
              usedResolvedIp: !!resolvedIp
            }
          });
        });

      } catch (error) {
        this.logger.error(`MySQL connection test failed: ${error.message}`);
        resolve({
          success: false,
          error: error.message,
          connectionDetails: {
            host: resolvedIp || config.host,
            user: config.user,
            database: config.database,
            port: config.port,
            originalHost: config.host,
            usedResolvedIp: !!resolvedIp
          }
        });
      }
    });
  }

  /**
   * Check if MySQL service is running (requires WHM access)
   */
  async checkMySQLService(whmClient) {
    try {
      const serviceStatus = await whmClient.makeApiCall('ServiceStatus', 'get_service_status', {
        service: 'mysql'
      });

      return {
        running: serviceStatus.enabled === 1 && serviceStatus.monitored === 1,
        status: serviceStatus
      };
    } catch (error) {
      this.logger.error(`Failed to check MySQL service status: ${error.message}`);
      return { running: false, error: error.message };
    }
  }

  /**
   * Restart MySQL service (requires WHM access and approval)
   */
  async restartMySQLService(whmClient, approved = false) {
    if (!approved) {
      throw new Error('MySQL service restart requires explicit approval');
    }

    try {
      this.logger.warn('Attempting to restart MySQL service');

      const result = await whmClient.makeApiCall('ServiceControl', 'restart_service', {
        service: 'mysql'
      });

      this.logger.info('MySQL service restart initiated');
      return result;
    } catch (error) {
      this.logger.error(`Failed to restart MySQL service: ${error.message}`);
      throw error;
    }
  }
}

module.exports = MySQLClient;