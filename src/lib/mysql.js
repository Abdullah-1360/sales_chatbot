const mysql = require('mysql2');
const mysqlPromise = require('mysql2/promise');
const winston = require('winston');

// Connection pool for better performance
const connectionPools = new Map();
const POOL_CONFIG = {
  connectionLimit: 5,
  acquireTimeout: 5000,
  timeout: 10000,
  reconnect: false,
  idleTimeout: 30000
};

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

  /**
   * Get or create connection pool for host
   */
  getConnectionPool(host, config) {
    const poolKey = `${host}:${config.port || 3306}`;
    
    if (!connectionPools.has(poolKey)) {
      const poolConfig = {
        ...POOL_CONFIG,
        host: host,
        user: config.user,
        password: config.password,
        database: config.database,
        port: config.port || 3306
      };
      
      const pool = mysql.createPool(poolConfig);
      connectionPools.set(poolKey, pool);
      
      // Auto-cleanup pool after 5 minutes of inactivity
      setTimeout(() => {
        if (connectionPools.has(poolKey)) {
          pool.end();
          connectionPools.delete(poolKey);
        }
      }, 5 * 60 * 1000);
    }
    
    return connectionPools.get(poolKey);
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
   * Validate if the database host is localhost/127.0.0.1 or a valid remote IP
   * Now supports remote connections when host management is active
   * 
   * @param {Object} config - Database configuration
   * @param {boolean} allowRemote - Allow remote IP connections (default: false)
   * @returns {Object} Validation result
   */
  validateLocalhostRequirement(config, allowRemote = false) {
    const host = config.host ? String(config.host).toLowerCase().trim() : '';
    
    // Check if host is localhost or 127.0.0.1
    const isLocalhost = host === 'localhost' || 
                       host === '127.0.0.1' || 
                       host === '::1' || 
                       host === 'localhost.localdomain' ||
                       host.startsWith('127.') ||
                       host === '';
    
    // Check if it's a valid IP address (for remote connections)
    const isValidIP = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(host);
    
    // If it's localhost, always allow
    if (isLocalhost) {
      return {
        valid: true,
        host: host,
        reason: 'LOCALHOST_DETECTED',
        message: 'Database host is localhost - can proceed with testing',
        userFriendlyMessage: `Database is configured for localhost (${host}) - connection testing can proceed.`,
        severity: 'INFO',
        category: 'configuration_valid',
        isRemote: false,
        recommendations: [],
        technicalDetails: {
          configuredHost: host,
          isLocalhost: true,
          allowRemote: allowRemote
        }
      };
    }
    
    // If it's not localhost but allowRemote is true, check if it's a valid IP
    if (allowRemote) {
      if (isValidIP) {
        return {
          valid: true,
          host: host,
          reason: 'REMOTE_HOST_ALLOWED',
          message: 'Database host is remote IP - can proceed with testing (host management active)',
          userFriendlyMessage: `Database is configured for remote connection (${host}) - connection testing can proceed with host management.`,
          severity: 'INFO',
          category: 'configuration_valid',
          isRemote: true,
          recommendations: [],
          technicalDetails: {
            configuredHost: host,
            isLocalhost: false,
            allowRemote: allowRemote,
            isValidIP: true
          }
        };
      } else {
        this.logger.warn(`Database host '${host}' is not a valid IP address for remote connection`);
        
        return {
          valid: false,
          host: host,
          reason: 'INVALID_REMOTE_HOST',
          message: 'Database host is not a valid IP address for remote connection',
          userFriendlyMessage: `The database host '${host}' is not a valid IP address for remote connection.`,
          severity: 'HIGH',
          category: 'configuration_error',
          recommendations: [
            'Ensure the database host is a valid IP address',
            'Check if the server IP was resolved correctly',
            'Contact technical support if you need help with remote database configuration'
          ],
          technicalDetails: {
            configuredHost: host,
            allowRemote: allowRemote,
            isValidIP: false
          }
        };
      }
    }
    
    // Not localhost and remote not allowed
    this.logger.warn(`Database host '${host}' is not localhost - stopping further processing`);
    
    return {
      valid: false,
      host: host,
      reason: 'NON_LOCALHOST_HOST',
      message: 'Database host is not localhost',
      userFriendlyMessage: `The database host '${host}' is not configured for localhost. This diagnostic tool only works with localhost MySQL configurations.`,
      severity: 'HIGH',
      category: 'configuration_error',
      recommendations: [
        'Verify the DB_HOST value in wp-config.php is set to "localhost" or "127.0.0.1"',
        'If using a remote database server, this diagnostic tool cannot test the connection',
        'For remote databases, use your hosting provider\'s database management tools',
        'Contact technical support if you need help with remote database configuration'
      ],
      technicalDetails: {
        configuredHost: host,
        expectedHosts: ['localhost', '127.0.0.1', '::1'],
        isRemoteDatabase: true
      }
    };
  }

  /**
   * Map MySQL error codes to user-friendly diagnoses for WordPress diagnostic tool
   * 
   * @param {Error} error - The raw MySQL error object
   * @param {Object} probeResult - Optional probe result for ER_DBACCESS_DENIED_ERROR disambiguation
   * @param {string} probeResult.diagnosis - 'DATABASE_MISSING' or 'PERMISSION_MISSING'
   * @returns {Object} Mapped diagnosis with code, message, and recommendations
   */
  mapDatabaseError(error, probeResult = null) {
    const errorCode = error.code || error.errno;
    const errorNumber = error.errno;
    
    // Handle specific MySQL error codes
    switch (errorCode) {
      case 'ER_ACCESS_DENIED_ERROR':
        // Error 1045: Access denied for user (wrong username/password)
        return {
          diagnosis: 'AUTH_FAILURE',
          code: 1045,
          message: 'Authentication failed - incorrect username or password',
          userFriendlyMessage: 'The database username or password in your WordPress configuration is incorrect.',
          severity: 'HIGH',
          category: 'authentication',
          recommendations: [
            'Verify the DB_USER and DB_PASSWORD values in wp-config.php',
            'Check if the database user account exists',
            'Ensure the password matches exactly (case-sensitive)',
            'Verify the user has permission to connect from this server'
          ],
          technicalDetails: {
            originalError: error.message,
            errorCode: errorCode,
            errorNumber: errorNumber
          }
        };

      case 'ER_DBACCESS_DENIED_ERROR':
        // Error 1044: Access denied for user to database
        // Use probe result to distinguish between missing database vs missing permissions
        if (probeResult && probeResult.diagnosis === 'DATABASE_MISSING') {
          return {
            diagnosis: 'DATABASE_MISSING',
            code: 1044,
            message: 'Database does not exist',
            userFriendlyMessage: 'The database specified in your WordPress configuration does not exist.',
            severity: 'HIGH',
            category: 'database_missing',
            recommendations: [
              'Verify the DB_NAME value in wp-config.php matches an existing database',
              'Create the missing database if the name is correct',
              'Check for typos in the database name (case-sensitive)',
              'Contact your hosting provider if you cannot create databases'
            ],
            technicalDetails: {
              originalError: error.message,
              errorCode: errorCode,
              errorNumber: errorNumber,
              probeResult: probeResult
            }
          };
        } else if (probeResult && probeResult.diagnosis === 'PERMISSION_MISSING') {
          return {
            diagnosis: 'PERMISSION_MISSING',
            code: 1044,
            message: 'User lacks database permissions',
            userFriendlyMessage: 'The database user exists but does not have permission to access the specified database.',
            severity: 'HIGH',
            category: 'database_permissions',
            recommendations: [
              'Grant the user privileges on the database',
              'Use: GRANT ALL PRIVILEGES ON `database_name`.* TO \'username\'@\'host\';',
              'Run: FLUSH PRIVILEGES; after granting permissions',
              'Verify the user has the correct database access rights'
            ],
            technicalDetails: {
              originalError: error.message,
              errorCode: errorCode,
              errorNumber: errorNumber,
              probeResult: probeResult
            }
          };
        } else {
          return {
            diagnosis: 'ACCESS_DENIED_GENERIC',
            code: 1044,
            message: 'Database access denied',
            userFriendlyMessage: 'Access to the database was denied. This could be due to missing database or insufficient permissions.',
            severity: 'HIGH',
            category: 'database_access',
            recommendations: [
              'Verify the database exists and the name is correct',
              'Check if the user has permissions on the database',
              'Ensure the database user account is properly configured',
              'Contact your hosting provider for database access issues'
            ],
            technicalDetails: {
              originalError: error.message,
              errorCode: errorCode,
              errorNumber: errorNumber,
              probeResult: probeResult
            }
          };
        }

      case 'ER_BAD_DB_ERROR':
        // Error 1049: Unknown database
        return {
          diagnosis: 'DATABASE_MISSING',
          code: 1049,
          message: 'Unknown database',
          userFriendlyMessage: 'The specified database does not exist on the MySQL server.',
          severity: 'HIGH',
          category: 'database_missing',
          recommendations: [
            'Check the DB_NAME value in wp-config.php for typos',
            'Verify the database exists on the MySQL server',
            'Create the database if it was accidentally deleted',
            'Ensure the database name is case-sensitive correct'
          ],
          technicalDetails: {
            originalError: error.message,
            errorCode: errorCode,
            errorNumber: errorNumber
          }
        };

      case 'ECONNREFUSED':
        // Connection refused - service down or firewall
        return {
          diagnosis: 'CONNECTION_REFUSED',
          code: 'ECONNREFUSED',
          message: 'Connection refused',
          userFriendlyMessage: 'Cannot connect to the MySQL server. The service may be down or blocked by a firewall.',
          severity: 'CRITICAL',
          category: 'connection_failure',
          recommendations: [
            'Check if MySQL service is running on the server',
            'Verify the DB_HOST and port in wp-config.php are correct',
            'Check firewall rules for MySQL port (usually 3306)',
            'Contact your hosting provider if the issue persists'
          ],
          technicalDetails: {
            originalError: error.message,
            errorCode: errorCode,
            errorNumber: errorNumber
          }
        };

      case 'ENOTFOUND':
      case 'EAI_AGAIN':
        // DNS resolution failure
        return {
          diagnosis: 'INVALID_HOST',
          code: errorCode,
          message: 'Hostname resolution failed',
          userFriendlyMessage: 'The MySQL hostname cannot be resolved. There may be a typo in the hostname or DNS issues.',
          severity: 'HIGH',
          category: 'dns_failure',
          recommendations: [
            'Check the DB_HOST value in wp-config.php for typos',
            'Verify the hostname exists and is reachable',
            'Try using an IP address instead of hostname',
            'Check DNS server configuration'
          ],
          technicalDetails: {
            originalError: error.message,
            errorCode: errorCode,
            errorNumber: errorNumber
          }
        };

      case 'ETIMEDOUT':
        // Connection timeout
        return {
          diagnosis: 'CONNECTION_TIMEOUT',
          code: 'ETIMEDOUT',
          message: 'Connection timeout',
          userFriendlyMessage: 'The connection to MySQL server timed out. This may indicate network issues or server overload.',
          severity: 'HIGH',
          category: 'network_timeout',
          recommendations: [
            'Check network connectivity to the MySQL server',
            'Verify the MySQL server is not overloaded',
            'Check if there are network latency issues',
            'Consider increasing connection timeout settings'
          ],
          technicalDetails: {
            originalError: error.message,
            errorCode: errorCode,
            errorNumber: errorNumber
          }
        };

      default:
        // Unknown error
        return {
          diagnosis: 'UNKNOWN_DB_ERROR',
          code: errorCode || 'UNKNOWN',
          message: 'Unknown database error',
          userFriendlyMessage: 'An unexpected database error occurred. Please check the error details for more information.',
          severity: 'MEDIUM',
          category: 'unknown_error',
          recommendations: [
            'Check the MySQL error logs for more details',
            'Verify all database configuration settings',
            'Contact technical support with the error details',
            'Try restarting the MySQL service if possible'
          ],
          technicalDetails: {
            originalError: error.message,
            errorCode: errorCode,
            errorNumber: errorNumber,
            fullError: error
          }
        };
    }
  }

  /**
   * Probe database to distinguish between missing database vs missing permissions
   * Used specifically for ER_DBACCESS_DENIED_ERROR (1044) disambiguation
   * 
   * @param {Object} config - Database configuration
   * @param {string} resolvedIp - Optional resolved IP to use instead of config.host
   * @returns {Promise<Object>} Probe result with diagnosis
   */
  async probeDatabaseAccess(config, resolvedIp = null) {
    try {
      // First, validate if host is localhost
      const localhostValidation = this.validateLocalhostRequirement(config);
      
      if (!localhostValidation.valid) {
        this.logger.error(`Localhost validation failed during probe: ${localhostValidation.message}`);
        
        return {
          success: false,
          diagnosis: 'NON_LOCALHOST_HOST',
          message: 'Cannot probe non-localhost database',
          localhostValidation: localhostValidation,
          details: {
            databaseExists: null,
            userCanConnect: null,
            hasPermissions: null,
            localhostValidationFailed: true,
            configuredHost: config.host
          }
        };
      }
      
      const connectionHost = resolvedIp || config.host;
      
      // Create connection config without specifying database
      const probeConfig = {
        host: connectionHost,
        user: config.user ? String(config.user) : '',
        password: config.password ? String(config.password) : ''
        // Note: No database specified for probe
      };
      
      if (config.port && config.port !== 3306) {
        probeConfig.port = Number(config.port);
      }
      
      this.logger.info('Probing database access to distinguish error cause...');
      
      let connection;
      try {
        // Try to connect without specifying database
        connection = await mysqlPromise.createConnection(probeConfig);
        
        // If we can connect, try to check if database exists
        try {
          const [rows] = await connection.execute(
            'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
            [config.database]
          );
          
          await connection.end();
          
          if (rows.length > 0) {
            // Database exists, so the issue is permissions
            return {
              success: true,
              diagnosis: 'PERMISSION_MISSING',
              message: 'Database exists but user lacks permissions',
              localhostValidation: localhostValidation,
              details: {
                databaseExists: true,
                userCanConnect: true,
                hasPermissions: false
              }
            };
          } else {
            // Database doesn't exist
            return {
              success: true,
              diagnosis: 'DATABASE_MISSING',
              message: 'Database does not exist',
              localhostValidation: localhostValidation,
              details: {
                databaseExists: false,
                userCanConnect: true,
                hasPermissions: null
              }
            };
          }
          
        } catch (queryErr) {
          await connection.end();
          
          // If we can't query INFORMATION_SCHEMA, assume permission issue
          return {
            success: true,
            diagnosis: 'PERMISSION_MISSING',
            message: 'Cannot query database information - likely permission issue',
            localhostValidation: localhostValidation,
            details: {
              databaseExists: null,
              userCanConnect: true,
              hasPermissions: false,
              queryError: queryErr.message
            }
          };
        }
        
      } catch (connErr) {
        // If we can't connect at all, it's likely an auth issue
        // But since we got ER_DBACCESS_DENIED_ERROR, assume database missing
        return {
          success: false,
          diagnosis: 'DATABASE_MISSING',
          message: 'Cannot connect to probe - assuming database missing',
          localhostValidation: localhostValidation,
          details: {
            databaseExists: false,
            userCanConnect: false,
            hasPermissions: null,
            connectionError: connErr.message
          }
        };
      }
      
    } catch (error) {
      this.logger.error(`Database probe failed: ${error.message}`);
      
      return {
        success: false,
        diagnosis: 'PROBE_FAILED',
        message: 'Could not determine specific cause',
        details: {
          databaseExists: null,
          userCanConnect: null,
          hasPermissions: null,
          probeError: error.message
        }
      };
    }
  }

  /**
   * Test MySQL connection using mysql2/promise (async/await)
   * 
   * @param {Object} config - Database configuration
   * @param {string} resolvedIp - Optional resolved IP to use instead of config.host
   * @returns {Promise<Object>} Connection test result
   */
  async testConnectionPromise(config, resolvedIp = null) {
    try {
      // Determine if we should allow remote connections
      const isRemoteConnection = resolvedIp || 
                                (config.host !== 'localhost' && 
                                 config.host !== '127.0.0.1' && 
                                 config.host !== '::1' && 
                                 config.host !== '');
      
      // Validate localhost requirement with remote connection support
      const localhostValidation = this.validateLocalhostRequirement(config, true); // Always allow remote now
      
      if (!localhostValidation.valid) {
        this.logger.error(`Localhost validation failed: ${localhostValidation.message}`);
        
        return {
          success: false,
          error: localhostValidation.message,
          errorCode: 'NON_LOCALHOST_HOST',
          localhostValidation: localhostValidation,
          mappedError: {
            diagnosis: 'NON_LOCALHOST_HOST',
            code: 'NON_LOCALHOST_HOST',
            message: localhostValidation.message,
            userFriendlyMessage: localhostValidation.userFriendlyMessage,
            severity: localhostValidation.severity,
            category: localhostValidation.category,
            recommendations: localhostValidation.recommendations,
            technicalDetails: localhostValidation.technicalDetails
          },
          connectionDetails: {
            host: config.host,
            user: config.user,
            database: config.database,
            port: config.port,
            originalHost: config.host,
            usedResolvedIp: false,
            localhostValidationFailed: true
          }
        };
      }
      
      this.logger.info(`Testing MySQL connection (Promise) to ${config.host}:${config.port}`);
      
      // Determine the connection host
      let connectionHost = config.host;
      
      // If we have a resolved IP, use it (this is the server IP from host management)
      if (resolvedIp) {
        connectionHost = resolvedIp;
      } else if (config.serverIP) {
        // Use server IP from config if available
        connectionHost = config.serverIP;
      } else if (config.host === 'localhost' || config.host === '127.0.0.1') {
        // For localhost, try to use server IP if available
        // Keep original host if no server IP available
      }
      
      // Use resolved IP if available, otherwise use the connection host
      const finalHost = resolvedIp || connectionHost;
      
      // Create connection object with completely isolated values
      const connectionConfig = {
        host: finalHost,
        user: config.user ? String(config.user) : '',
        password: config.password ? String(config.password) : '',
        database: config.database ? String(config.database) : ''
      };
      
      // Add port if specified and not default
      if (config.port && config.port !== 3306) {
        connectionConfig.port = Number(config.port);
      }
      
      // Log connection config for debugging (disabled for performance)
      // console.log('Connection Config (Promise):', JSON.stringify(connectionConfig, null, 2));
      
      let connection;
      try {
        // Create connection using mysql2/promise
        connection = await mysqlPromise.createConnection(connectionConfig);
        
        // Test the connection with a simple query
        await connection.execute('SELECT 1 as test');
        
        // Silent credentials validation logging in production for performance
        // this.logger.info("Database credentials are valid (Promise)");
        
        // Close the connection
        await connection.end();
        
        return {
          success: true,
          message: "Database credentials are valid",
          localhostValidation: localhostValidation,
          connectionDetails: {
            host: connectionHost,
            user: config.user,
            database: config.database,
            port: config.port,
            originalHost: config.host,
            usedResolvedIp: !!resolvedIp
          }
        };
        
      } catch (err) {
        // Close connection if it was created
        if (connection) {
          try {
            await connection.end();
          } catch (closeErr) {
            // Ignore close errors
          }
        }
        
        this.logger.error(`MySQL connection failed (Promise): ${err.message}`);
        
        // Use the new mapDatabaseError function
        const mappedError = this.mapDatabaseError(err);
        
        return {
          success: false,
          error: err.message,
          errorCode: err.code,
          localhostValidation: localhostValidation,
          mappedError: mappedError,
          connectionDetails: {
            host: connectionHost,
            user: config.user,
            database: config.database,
            port: config.port,
            originalHost: config.host,
            usedResolvedIp: !!resolvedIp
          }
        };
      }
      
    } catch (error) {
      this.logger.error(`MySQL connection test failed (Promise): ${error.message}`);
      
      // Use the new mapDatabaseError function for unexpected errors
      const mappedError = this.mapDatabaseError(error);
      
      return {
        success: false,
        error: error.message,
        mappedError: mappedError,
        connectionDetails: {
          host: resolvedIp || config.host,
          user: config.user,
          database: config.database,
          port: config.port,
          originalHost: config.host,
          usedResolvedIp: !!resolvedIp
        }
      };
    }
  }

  /**
   * Test MySQL connection with parsed configuration (optimized with connection pooling)
   */
  async testConnection(config, resolvedIp = null) {
    return new Promise((resolve) => {
      try {
        // Determine if we should allow remote connections
        const isRemoteConnection = resolvedIp || 
                                  (config.host !== 'localhost' && 
                                   config.host !== '127.0.0.1' && 
                                   config.host !== '::1' && 
                                   config.host !== '');
        
        // Validate localhost requirement with remote connection support
        const localhostValidation = this.validateLocalhostRequirement(config, true); // Always allow remote now
        
        if (!localhostValidation.valid) {
          this.logger.error(`Localhost validation failed: ${localhostValidation.message}`);
          
          resolve({
            success: false,
            error: localhostValidation.message,
            errorCode: 'NON_LOCALHOST_HOST',
            localhostValidation: localhostValidation,
            rootCause: {
              cause: 'NON_LOCALHOST_HOST',
              description: localhostValidation.message,
              severity: localhostValidation.severity,
              originalError: localhostValidation.message,
              errorCode: 'NON_LOCALHOST_HOST'
            },
            connectionDetails: {
              host: config.host,
              user: config.user,
              database: config.database,
              port: config.port,
              originalHost: config.host,
              usedResolvedIp: false,
              localhostValidationFailed: true
            }
          });
          return;
        }
        
        this.logger.info(`Testing MySQL connection to ${config.host}:${config.port}`);
        
        // Determine the connection host
        let connectionHost = config.host;
        
        // If we have a resolved IP, use it (this is the server IP from host management)
        if (resolvedIp) {
          connectionHost = resolvedIp;
        } else if (config.serverIP) {
          // Use server IP from config if available
          connectionHost = config.serverIP;
        } else if (config.host === 'localhost' || config.host === '127.0.0.1') {
          // For localhost, try to use server IP if available
          // Keep original host if no server IP available
        }
        
        // Use resolved IP if available, otherwise use the connection host
        const finalHost = resolvedIp || connectionHost;
        
        // Create connection object with completely isolated values to prevent winston interference
        const connectionConfig = {
          host: finalHost,
          user: config.user ? String(config.user) : '',
          password: config.password ? String(config.password) : '',
          database: config.database ? String(config.database) : ''
        };
        
        // Add port if specified and not default
        if (config.port && config.port !== 3306) {
          connectionConfig.port = Number(config.port);
        }
        
        // Use connection pool for better performance
        const pool = this.getConnectionPool(finalHost, connectionConfig);
        
        // Set connection timeout
        const connectionTimeout = setTimeout(() => {
          resolve({
            success: false,
            error: 'Connection timeout after 10 seconds',
            errorCode: 'CONNECTION_TIMEOUT',
            localhostValidation: localhostValidation,
            rootCause: {
              cause: 'CONNECTION_TIMEOUT',
              description: 'Connection to MySQL server timed out',
              severity: 'HIGH',
              originalError: 'Connection timeout after 10 seconds',
              errorCode: 'CONNECTION_TIMEOUT'
            },
            connectionDetails: {
              host: connectionHost,
              user: config.user,
              database: config.database,
              port: config.port,
              originalHost: config.host,
              usedResolvedIp: !!resolvedIp,
              timedOut: true
            }
          });
        }, 10000);
        
        pool.getConnection((err, connection) => {
          clearTimeout(connectionTimeout);
          
          if (err) {
            this.logger.error(`MySQL connection failed: ${err.message}`);
            const rootCause = this.mapErrorToRootCause(err);

            resolve({
              success: false,
              error: err.message,
              errorCode: err.code,
              localhostValidation: localhostValidation,
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
            // Release connection back to pool immediately
            connection.release();

            resolve({
              success: true,
              message: "Database credentials are valid",
              localhostValidation: localhostValidation,
              connectionDetails: {
                host: connectionHost,
                user: config.user,
                database: config.database,
                port: config.port,
                originalHost: config.host,
                usedResolvedIp: !!resolvedIp,
                usedConnectionPool: true
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
            localhostValidation: localhostValidation,
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