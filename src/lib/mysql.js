const mysql = require('mysql2/promise');
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

  /**
   * Test MySQL connection with given credentials using multiple methods
   */
  async testConnection(config, cpanelClient = null) {
    // Mask password in logs
    const logConfig = { ...config, password: '***MASKED***' };
    this.logger.info(`Testing MySQL connection: ${JSON.stringify(logConfig)}`);
    
    const results = {
      success: false,
      attempts: [],
      primaryError: null,
      message: null
    };

    let customSocketPath = null;
    
    // Try to get the actual socket path from cPanel if available
    if (cpanelClient && (config.host === 'localhost' || config.host === '127.0.0.1')) {
      try {
        customSocketPath = await cpanelClient.getMySQLSocketPath();
        if (customSocketPath) {
          this.logger.info(`Got MySQL socket path from cPanel: ${customSocketPath}`);
        }
      } catch (error) {
        this.logger.debug(`Could not get socket path from cPanel: ${error.message}`);
      }
    }

    // Method 1: Try UNIX socket if host is localhost
    if (config.host === 'localhost' || config.host === '127.0.0.1') {
      const socketResult = await this.trySocketConnection(config, customSocketPath);
      results.attempts.push({
        method: 'unix_socket',
        socketPath: socketResult.socketPath,
        customSocketPath: customSocketPath,
        result: socketResult
      });
      
      if (socketResult.success) {
        results.success = true;
        results.message = 'Connection successful via UNIX socket';
        return results;
      }
    }

    // Method 2: Try TCP connection to localhost (127.0.0.1)
    if (config.host === 'localhost') {
      const localhostResult = await this.tryTcpConnection({
        ...config,
        host: '127.0.0.1'
      });
      results.attempts.push({
        method: 'localhost_tcp',
        host: '127.0.0.1',
        port: config.port || 3306,
        result: localhostResult
      });
      
      if (localhostResult.success) {
        results.success = true;
        results.message = 'Connection successful via localhost TCP';
        return results;
      }
    }

    // Method 3: Try direct TCP connection
    const directResult = await this.tryTcpConnection(config);
    results.attempts.push({
      method: 'direct_tcp',
      host: config.host,
      port: config.port || 3306,
      tcpReachable: await this.checkTcpReachability(config.host, config.port || 3306),
      result: directResult
    });
    
    if (directResult.success) {
      results.success = true;
      results.message = 'Connection successful via direct TCP';
      return results;
    }

    // All methods failed
    results.primaryError = results.attempts[0]?.result?.error || 'All connection methods failed';
    results.message = 'All connection methods failed';
    
    this.logger.error(`All MySQL connection methods failed. Primary error: ${results.primaryError}`);
    return results;
  }

  /**
   * Try UNIX socket connection for localhost
   */
  async trySocketConnection(config, customSocketPath = null) {
    let socketPaths = [];
    
    // If a custom socket path is provided, try it first
    if (customSocketPath) {
      socketPaths.push(customSocketPath);
    }
    
    // Add only the specified socket path
    const commonSocketPaths = [
      '/var/lib/mysql/mysql.sock'
    ];
    
    // Avoid duplicates
    commonSocketPaths.forEach(path => {
      if (!socketPaths.includes(path)) {
        socketPaths.push(path);
      }
    });

    for (const socketPath of socketPaths) {
      try {
        this.logger.info(`Trying UNIX socket: ${socketPath}`);
        
        const connection = await mysql.createConnection({
          socketPath: socketPath,
          user: config.user,
          password: config.password,
          database: config.database,
          connectTimeout: 5000
        });

        // Test the connection with a simple query
        await connection.execute('SELECT 1');
        await connection.end();
        
        this.logger.info(`MySQL connection successful via UNIX socket: ${socketPath}`);
        return { 
          success: true, 
          message: `Connection successful via UNIX socket: ${socketPath}`,
          socketPath: socketPath
        };
        
      } catch (error) {
        this.logger.debug(`UNIX socket ${socketPath} failed: ${error.message}`);
        // Continue to next socket path
      }
    }

    return {
      success: false,
      error: 'No working UNIX socket found',
      code: 'NO_SOCKET',
      testedPaths: socketPaths
    };
  }

  /**
   * Try TCP connection
   */
  async tryTcpConnection(config) {
    let connection = null;
    
    try {
      connection = await mysql.createConnection({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        port: config.port || 3306,
        connectTimeout: 10000
      });

      // Test the connection with a simple query
      await connection.execute('SELECT 1');
      
      this.logger.info(`MySQL TCP connection successful to ${config.host}:${config.port || 3306}`);
      return { success: true, message: 'TCP connection successful' };
      
    } catch (error) {
      this.logger.debug(`MySQL TCP connection failed to ${config.host}:${config.port || 3306}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState
      };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  /**
   * Check TCP reachability
   */
  async checkTcpReachability(host, port) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 3000);
      
      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Map MySQL error codes to root causes
   */
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