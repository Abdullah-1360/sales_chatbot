const winston = require('winston');
const localIPCache = require('../services/localIPCache');

class MySQLHostManagementStep {
  constructor() {
    this.logger = process.env.NODE_ENV === 'production' 
      ? require('../utils/silentLogger') 
      : winston.createLogger({
          level: 'info',
          format: winston.format.simple(),
          transports: [new winston.transports.Console()]
        });
  }

  /**
   * Get the local machine's public IP address (where this code is running)
   * Uses cached IP from server startup for better performance
   */
  async getLocalMachineIP() {
    try {
      // Try to get cached IP first (much faster)
      const cachedIP = localIPCache.getCachedIP();
      
      if (cachedIP) {
        this.logger.info(`Using cached local machine IP: ${cachedIP}`);
        return cachedIP;
      }
      
      // If not cached, get it (this should rarely happen after server startup)
      this.logger.info('No cached IP found, detecting local machine IP...');
      const ip = await localIPCache.getIP();
      
      if (ip && this.isPublicIP(ip)) {
        this.logger.info(`Detected local machine public IP: ${ip}`);
        return ip;
      } else {
        throw new Error(`Invalid IP detected: ${ip}`);
      }
    } catch (error) {
      this.logger.error(`Failed to get local machine IP: ${error.message}`);
      throw new Error('Could not get local machine IP address for MySQL host management');
    }
  }

  /**
   * Check if an IP address is a public IP (not private/localhost)
   */
  isPublicIP(ip) {
    return localIPCache.isPublicIP(ip);
  }

  /**
   * Get the server's IP address where MySQL is actually running
   */
  async getServerIP(cpanelHost) {
    try {
      const dns = require('dns').promises;
      
      // Resolve the cPanel host to get the server's IP
      const addresses = await dns.resolve4(cpanelHost);
      
      if (addresses && addresses.length > 0) {
        const serverIP = addresses[0];
        return serverIP;
      }
      
      throw new Error(`Could not resolve server IP for ${cpanelHost}`);
    } catch (error) {
      this.logger.error(`Error resolving server IP: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add local machine IP to MySQL remote access hosts
   */
  async addLocalMachineIPToMySQLHosts(cpanelClient) {
    try {
      // Get the local machine's public IP (where this code is running)
      const localIP = await this.getLocalMachineIP();
      
      if (!localIP) {
        throw new Error('Could not determine local machine IP address');
      }
      
      this.logger.info(`Adding local machine IP to MySQL hosts: ${localIP}`);
      const startTime = Date.now();
      
      // Add the local machine IP to MySQL remote access hosts
      const addResult = await cpanelClient.addMySQLHost(localIP);
      
      if (addResult && (addResult.status === 1 || addResult.status === '1')) {
        return {
          success: true,
          action: 'added',
          ip: localIP,
          message: 'Local machine IP added to MySQL remote access hosts',
          executionTime: Date.now() - startTime,
          cpanelResponse: addResult
        };
      } else {
        const errorMsg = addResult?.errors?.join(', ') || 
                        addResult?.error || 
                        'Unknown error adding MySQL host';
        
        throw new Error(`Failed to add MySQL host: ${errorMsg}`);
      }

    } catch (error) {
      this.logger.error(`Error adding local machine IP to MySQL hosts: ${error.message}`);
      
      return {
        success: false,
        action: 'add_failed',
        ip: 'unknown',
        error: error.message,
        message: 'Failed to add local machine IP to MySQL remote access hosts',
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Remove local machine IP from MySQL remote access hosts (cleanup)
   */
  async removeLocalMachineIPFromMySQLHosts(cpanelClient) {
    try {
      // Get the local machine's public IP (where this code is running)
      const localIP = await this.getLocalMachineIP();
      
      if (!localIP) {
        throw new Error('Could not determine local machine IP address for removal');
      }
      
      this.logger.info(`Removing local machine IP from MySQL hosts: ${localIP}`);
      const startTime = Date.now();
      
      const removeResult = await cpanelClient.removeMySQLHost(localIP);
      
      if (removeResult && (removeResult.status === 1 || removeResult.status === '1')) {
        return {
          success: true,
          action: 'removed',
          ip: localIP,
          message: 'Local machine IP removed from MySQL remote access hosts',
          executionTime: Date.now() - startTime,
          cpanelResponse: removeResult
        };
      } else {
        const errorMsg = removeResult?.errors?.join(', ') || 
                        removeResult?.error || 
                        'Unknown error removing MySQL host';
        
        throw new Error(`Failed to remove MySQL host: ${errorMsg}`);
      }

    } catch (error) {
      this.logger.error(`Error removing local machine IP from MySQL hosts: ${error.message}`);
      
      return {
        success: false,
        action: 'remove_failed',
        ip: 'unknown',
        error: error.message,
        message: 'Failed to remove local machine IP from MySQL remote access hosts',
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Execute MySQL host management workflow (optimized with parallel operations)
   */
  async executeHostManagement(cpanelClient, req, cpanelHost, options = {}) {
    try {
      const startTime = Date.now();
      
      // Parallel execution: Get local IP (cached) and resolve server IP simultaneously
      const parallelTasks = [];
      
      // Task 1: Get local machine IP (should be fast since it's cached)
      parallelTasks.push(
        this.getLocalMachineIP().then(ip => ({ type: 'localIP', result: ip }))
      );
      
      // Task 2: Resolve server IP (DNS lookup)
      parallelTasks.push(
        this.getServerIP(cpanelHost)
          .then(ip => ({ type: 'serverIP', result: ip }))
          .catch(error => ({ type: 'serverIP', result: cpanelHost, error: error.message }))
      );
      
      // Execute both tasks in parallel
      const results = await Promise.all(parallelTasks);
      
      // Extract results
      const localIPResult = results.find(r => r.type === 'localIP');
      const serverIPResult = results.find(r => r.type === 'serverIP');
      
      const localIP = localIPResult?.result;
      const serverIP = serverIPResult?.result;
      
      if (!localIP) {
        return {
          success: false,
          error: 'Failed to get local machine IP',
          message: 'Could not detect local machine IP for MySQL host management',
          executionTime: Date.now() - startTime
        };
      }

      // Add local machine IP to MySQL hosts
      const addResult = await this.addLocalMachineIPToMySQLHosts(cpanelClient);
      
      // Schedule cleanup if requested and add was successful
      let cleanupScheduled = false;
      if (options.scheduleCleanup && addResult.success && addResult.action === 'added') {
        try {
          // Schedule cleanup after diagnostic is complete (5 minutes delay)
          const cleanupDelay = options.cleanupDelay || 5 * 60 * 1000; // 5 minutes
          
          setTimeout(async () => {
            try {
              await this.removeLocalMachineIPFromMySQLHosts(cpanelClient);
            } catch (cleanupError) {
              // Silent cleanup failure
            }
          }, cleanupDelay);
          
          cleanupScheduled = true;
        } catch (scheduleError) {
          // Silent schedule failure
        }
      }

      return {
        success: addResult.success,
        localIP: localIP,
        serverIP: serverIP,
        hostManagement: addResult,
        cleanupScheduled: cleanupScheduled,
        executionTime: Date.now() - startTime,
        message: addResult.success 
          ? `MySQL remote access configured successfully for local machine IP: ${localIP}`
          : 'Failed to configure MySQL remote access for local machine'
      };

    } catch (error) {
      this.logger.error(`MySQL host management workflow failed: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        message: 'MySQL host management workflow failed',
        executionTime: Date.now() - startTime
      };
    }
  }
}

module.exports = MySQLHostManagementStep;