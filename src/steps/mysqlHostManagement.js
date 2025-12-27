const winston = require('winston');

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
   * Get the client's IP address that needs MySQL access (your PC's IP)
   */
  getClientIP(req) {
    // For development/testing, use your fixed local PC IP
    const CLIENT_IP = '115.186.130.67';
    return CLIENT_IP;
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
   * Add client IP to MySQL remote access hosts
   */
  async addClientIPToMySQLHosts(cpanelClient, req) {
    try {
      const clientIP = this.getClientIP(req);
      const startTime = Date.now();
      
      // Skip the host existence check since list_hosts API doesn't exist
      // Just try to add the host directly - cPanel will handle duplicates gracefully
      
      const addResult = await cpanelClient.addMySQLHost(clientIP);
      
      if (addResult && (addResult.status === 1 || addResult.status === '1')) {
        return {
          success: true,
          action: 'added',
          ip: clientIP,
          message: 'Client IP added to MySQL remote access hosts',
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
      this.logger.error(`Error adding client IP to MySQL hosts: ${error.message}`);
      
      return {
        success: false,
        action: 'add_failed',
        ip: this.getClientIP(req),
        error: error.message,
        message: 'Failed to add client IP to MySQL remote access hosts',
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Remove client IP from MySQL remote access hosts (cleanup)
   */
  async removeClientIPFromMySQLHosts(cpanelClient, req) {
    try {
      const clientIP = this.getClientIP(req);
      const startTime = Date.now();
      
      const removeResult = await cpanelClient.removeMySQLHost(clientIP);
      
      if (removeResult && (removeResult.status === 1 || removeResult.status === '1')) {
        return {
          success: true,
          action: 'removed',
          ip: clientIP,
          message: 'Client IP removed from MySQL remote access hosts',
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
      this.logger.error(`Error removing client IP from MySQL hosts: ${error.message}`);
      
      return {
        success: false,
        action: 'remove_failed',
        ip: this.getClientIP(req),
        error: error.message,
        message: 'Failed to remove client IP from MySQL remote access hosts',
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Execute MySQL host management workflow
   */
  async executeHostManagement(cpanelClient, req, cpanelHost, options = {}) {
    try {
      const startTime = Date.now();
      const clientIP = this.getClientIP(req);

      // Step 1: Get server IP where MySQL is running
      let serverIP;
      try {
        serverIP = await this.getServerIP(cpanelHost);
      } catch (error) {
        serverIP = cpanelHost; // Fallback to hostname
      }

      // Step 2: Add client IP to MySQL hosts
      const addResult = await this.addClientIPToMySQLHosts(cpanelClient, req);
      
      // Step 3: If cleanup is requested and add was successful, schedule cleanup
      let cleanupScheduled = false;
      if (options.scheduleCleanup && addResult.success && addResult.action === 'added') {
        try {
          // Schedule cleanup after diagnostic is complete (5 minutes delay)
          const cleanupDelay = options.cleanupDelay || 5 * 60 * 1000; // 5 minutes
          
          setTimeout(async () => {
            try {
              await this.removeClientIPFromMySQLHosts(cpanelClient, req);
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
        clientIP: clientIP,
        serverIP: serverIP,
        hostManagement: addResult,
        cleanupScheduled: cleanupScheduled,
        executionTime: Date.now() - startTime,
        message: addResult.success 
          ? 'MySQL remote access configured successfully for client'
          : 'Failed to configure MySQL remote access for client'
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