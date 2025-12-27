const winston = require('winston');
const silentLogger = require('../utils/silentLogger');
const MySQLClient = require('../lib/mysql');

// DNS resolution cache for better performance
const dnsResolutionCache = new Map();
const DNS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_DNS_CACHE_SIZE = 200;

// Cleanup DNS cache periodically
let lastDnsCleanup = Date.now();
const DNS_CLEANUP_INTERVAL = 60000; // 1 minute

function cleanupDnsCache() {
  const now = Date.now();
  
  if (now - lastDnsCleanup < DNS_CLEANUP_INTERVAL) return;
  
  // Remove expired entries
  for (const [key, value] of dnsResolutionCache.entries()) {
    if (now - value.timestamp > DNS_CACHE_TTL) {
      dnsResolutionCache.delete(key);
    }
  }
  
  // LRU eviction if cache is too large
  if (dnsResolutionCache.size > MAX_DNS_CACHE_SIZE) {
    const entries = Array.from(dnsResolutionCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, dnsResolutionCache.size - MAX_DNS_CACHE_SIZE);
    toRemove.forEach(([key]) => dnsResolutionCache.delete(key));
  }
  
  lastDnsCleanup = now;
}

class MySQLStep {
  constructor() {
    // Use silent logger in production for performance
    this.logger = process.env.NODE_ENV === 'production' ? require('../utils/silentLogger') : winston.createLogger({
      level: 'error',
      format: winston.format.simple(),
      transports: [new winston.transports.Console()]
    });
    
    this.mysqlClient = new MySQLClient();
  }

  /**
   * Resolve hostname to IP address using DNS
   */
  async resolveHostToIp(hostname) {
    try {
      const dns = require('dns').promises;
      
      // Hostname resolution - no logging for performance
      
      // Handle localhost variations by trying to get the actual server IP
      const localhostVariations = ['localhost', '127.0.0.1', '::1'];
      if (localhostVariations.includes(hostname)) {
        // Localhost detection - no logging for performance
        
        try {
          // Try to get the actual hostname of the server
          const os = require('os');
          const serverHostname = os.hostname();
          
          if (serverHostname && serverHostname !== 'localhost') {
            // Server hostname resolution - no logging for performance
            const addresses = await dns.resolve4(serverHostname);
            
            if (addresses && addresses.length > 0) {
              const resolvedIp = addresses[0];
              // IP resolution - no logging for performance
              return {
                success: true,
                ip: resolvedIp,
                hostname: hostname,
                originalHostname: hostname,
                resolvedHostname: serverHostname,
                isLocalhost: true,
                allAddresses: addresses
              };
            }
          }
          
          // Fallback: try to resolve localhost directly
          const localhostAddresses = await dns.resolve4('localhost');
          if (localhostAddresses && localhostAddresses.length > 0) {
            const resolvedIp = localhostAddresses[0];
            // Localhost IP resolution - no logging for performance
            return {
              success: true,
              ip: resolvedIp,
              hostname: hostname,
              isLocalhost: true,
              allAddresses: localhostAddresses
            };
          }
          
        } catch (localhostError) {
          this.logger.warn(`Localhost resolution failed: ${localhostError.message}`);
        }
        
        // Final fallback: use the network interfaces to find a non-localhost IP
        try {
          const os = require('os');
          const networkInterfaces = os.networkInterfaces();
          
          for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            for (const iface of interfaces) {
              // Look for IPv4 addresses that are not localhost
              if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
                // Network interface - no logging for performance
                return {
                  success: true,
                  ip: iface.address,
                  hostname: hostname,
                  isLocalhost: true,
                  fromNetworkInterface: true,
                  interfaceName: interfaceName
                };
              }
            }
          }
        } catch (networkError) {
          this.logger.warn(`Network interface lookup failed: ${networkError.message}`);
        }
        
        // Ultimate fallback: return the original localhost IP but mark as potentially problematic
        this.logger.warn(`Could not resolve localhost to external IP, using ${hostname}`);
        return {
          success: true,
          ip: hostname === 'localhost' ? '127.0.0.1' : hostname,
          hostname: hostname,
          isLocalhost: true,
          fallback: true,
          warning: 'Could not resolve to external IP, using localhost address'
        };
      }

      // Resolve regular hostnames
      const addresses = await dns.resolve4(hostname);
      
      if (!addresses || addresses.length === 0) {
        return {
          success: false,
          error: `No IP addresses found for hostname: ${hostname}`,
          hostname: hostname
        };
      }

      const resolvedIp = addresses[0];
      // Hostname resolution - no logging for performance
      
      return {
        success: true,
        ip: resolvedIp,
        hostname: hostname,
        allAddresses: addresses
      };

    } catch (error) {
      this.logger.error(`DNS resolution failed for ${hostname}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        hostname: hostname
      };
    }
  }

  /**
   * Test MySQL connection using parsed configuration and DNS resolution from Step A
   */
  async testMySQLConnection(parsedConfig, dnsCheckResult = null) {
    try {
      if (!parsedConfig || !parsedConfig.success) {
        return {
          success: false,
          error: 'No valid database configuration available',
          skipped: true
        };
      }

      // Create a deep copy of the config to prevent winston interference
      const config = JSON.parse(JSON.stringify(parsedConfig.config));
      
      // Check if we have a server IP from host management step
      let serverIP = null;
      if (config.serverIP) {
        serverIP = config.serverIP;
      }
      
      // For localhost connections, we need to use the server IP
      let connectionHost = config.host;
      if ((config.host === 'localhost' || config.host === '127.0.0.1') && serverIP) {
        connectionHost = serverIP;
      }
      
      // Test connection directly with server IP (no localhost validation needed)
      const connectionResult = await this.mysqlClient.testConnectionPromise(config, serverIP);
      
      return {
        success: connectionResult.success,
        error: connectionResult.error,
        errorCode: connectionResult.errorCode,
        localhostValidation: connectionResult.localhostValidation,
        mappedError: connectionResult.mappedError,
        connectionDetails: connectionResult.connectionDetails,
        config: {
          host: config.host,
          user: config.user,
          database: config.database,
          port: config.port,
          serverIP: serverIP
        }
      };

    } catch (error) {
      this.logger.error(`MySQL connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        config: parsedConfig?.config || null
      };
    }
  }

  /**
   * Generate connection recommendations based on test results
   */
  generateConnectionRecommendations(testResult) {
    const recommendations = [];
    
    if (!testResult.success) {
      const originalTest = testResult.connectionTest?.originalHost;
      const resolvedTest = testResult.connectionTest?.resolvedIp;
      
      // Check if localhost was detected but connection still failed
      if (testResult.dnsResolution?.isLocalhost && testResult.dnsResolution?.fallback) {
        recommendations.push({
          type: 'localhost_configuration',
          priority: 'high',
          message: 'Database host is configured as localhost and could not be resolved to an external IP. Consider updating wp-config.php DB_HOST to use the actual server hostname or IP address.',
          action: 'update_db_host'
        });
      }
      
      // Analyze the failure based on connection test results
      const testToAnalyze = resolvedTest || originalTest;
      if (testToAnalyze?.rootCause) {
        switch (testToAnalyze.rootCause.cause) {
          case 'ACCESS_DENIED':
            recommendations.push({
              type: 'credential_issue',
              priority: 'high',
              message: 'Database credentials are incorrect. Verify username and password in wp-config.php',
              action: 'check_credentials'
            });
            break;
            
          case 'UNKNOWN_DATABASE':
            recommendations.push({
              type: 'database_missing',
              priority: 'high',
              message: 'Database does not exist. Create the database or update wp-config.php with correct database name',
              action: 'check_database_name'
            });
            break;
            
          case 'CONNECTION_REFUSED':
            recommendations.push({
              type: 'service_down',
              priority: 'critical',
              message: 'MySQL server is not running or not accepting connections',
              action: 'check_mysql_service'
            });
            break;
            
          case 'HOST_NOT_FOUND':
            recommendations.push({
              type: 'dns_issue',
              priority: 'high',
              message: 'MySQL host cannot be resolved. Check hostname in wp-config.php',
              action: 'check_hostname'
            });
            break;
            
          case 'CONNECTION_TIMEOUT':
            recommendations.push({
              type: 'network_issue',
              priority: 'medium',
              message: 'Connection to MySQL server timed out. Check network connectivity',
              action: 'check_network'
            });
            break;
        }
      }
      
      // If resolved IP test was different from original, add DNS-specific recommendations
      if (resolvedTest && originalTest && resolvedTest.success !== originalTest.success) {
        if (resolvedTest.success) {
          recommendations.push({
            type: 'dns_resolution',
            priority: 'medium',
            message: 'Connection works with resolved IP but not hostname. Consider using IP directly or check DNS configuration',
            action: 'use_resolved_ip'
          });
        }
      }
      
      // If no specific recommendations were added, add a general one
      if (recommendations.length === 0) {
        recommendations.push({
          type: 'general_failure',
          priority: 'high',
          message: 'MySQL connection failed. Check database configuration, credentials, and server status',
          action: 'check_configuration'
        });
      }
    } else {
      recommendations.push({
        type: 'success',
        priority: 'info',
        message: 'MySQL connection is working correctly',
        action: 'none'
      });
    }
    
    return recommendations;
  }
}

module.exports = MySQLStep;