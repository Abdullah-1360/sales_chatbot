const winston = require('winston');
const MySQLClient = require('../lib/mysql');

class MySQLStep {
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
    
    this.mysqlClient = new MySQLClient();
  }

  /**
   * Resolve hostname to IP address using DNS
   */
  async resolveHostToIp(hostname) {
    try {
      const dns = require('dns').promises;
      
      this.logger.info(`Resolving hostname: ${hostname}`);
      
      // Handle localhost variations by trying to get the actual server IP
      const localhostVariations = ['localhost', '127.0.0.1', '::1'];
      if (localhostVariations.includes(hostname)) {
        this.logger.info(`Localhost detected (${hostname}), attempting to resolve to actual server IP`);
        
        try {
          // Try to get the actual hostname of the server
          const os = require('os');
          const serverHostname = os.hostname();
          
          if (serverHostname && serverHostname !== 'localhost') {
            this.logger.info(`Attempting to resolve server hostname: ${serverHostname}`);
            const addresses = await dns.resolve4(serverHostname);
            
            if (addresses && addresses.length > 0) {
              const resolvedIp = addresses[0];
              this.logger.info(`Server hostname ${serverHostname} resolved to IP: ${resolvedIp}`);
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
            this.logger.info(`Localhost resolved to IP: ${resolvedIp}`);
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
                this.logger.info(`Using network interface IP: ${iface.address}`);
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
      this.logger.info(`Hostname ${hostname} resolved to IP: ${resolvedIp}`);
      
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
      this.logger.info('=== Step C: Test MySQL Connection ===');
      
      if (!parsedConfig || !parsedConfig.success) {
        return {
          success: false,
          error: 'No valid database configuration available',
          skipped: true
        };
      }

      // Create a deep copy of the config to prevent winston interference
      const config = JSON.parse(JSON.stringify(parsedConfig.config));
      
      // Check if we have a resolved IP from Step A DNS check
      let resolvedIpFromDnsCheck = null;
      
      // Log DNS check result safely without winston interference
      console.log('DNS Check Result:', JSON.stringify(dnsCheckResult, null, 2));
      
      if (dnsCheckResult?.dnsInfo?.resolvedIps && dnsCheckResult.dnsInfo.resolvedIps.length > 0) {
        resolvedIpFromDnsCheck = dnsCheckResult.dnsInfo.resolvedIps[0];
        this.logger.info(`Using resolved IP from Step A DNS check: ${resolvedIpFromDnsCheck}`);
      } else {
        console.log('No resolved IP available from Step A DNS check');
        if (dnsCheckResult) {
          console.log('DNS check result structure:', {
            passed: dnsCheckResult.passed,
            hasDnsInfo: !!dnsCheckResult.dnsInfo,
            dnsInfoKeys: dnsCheckResult.dnsInfo ? Object.keys(dnsCheckResult.dnsInfo) : null
          });
        } else {
          console.log('DNS check result is null or undefined');
        }
      }
      
      // Only test connection with resolved IP - no localhost fallback
      let connectionTestResolved = null;
      
      if (resolvedIpFromDnsCheck) {
        this.logger.info(`Testing MySQL connection with DNS-resolved IP: ${resolvedIpFromDnsCheck}`);
        connectionTestResolved = await this.mysqlClient.testConnection(config, resolvedIpFromDnsCheck);
      } else {
        // If no resolved IP from DNS check, fail immediately
        return {
          success: false,
          error: 'No resolved IP available from DNS check and localhost connections are not supported',
          connectionTest: {
            originalHost: null,
            resolvedIp: null
          },
          dnsResolution: {
            success: false,
            ip: null,
            hostname: config.host,
            fromDnsCheck: false,
            error: 'No resolved IP from DNS check'
          },
          finalResult: {
            success: false,
            error: 'No resolved IP available from DNS check'
          },
          config: {
            host: config.host,
            user: config.user,
            database: config.database,
            port: config.port
          }
        };
      }
      
      // Use the resolved IP test result as the final result
      const finalResult = connectionTestResolved;
      const overallSuccess = connectionTestResolved?.success || false;
      
      return {
        success: overallSuccess,
        connectionTest: {
          originalHost: null, // No localhost testing
          resolvedIp: connectionTestResolved
        },
        dnsResolution: {
          success: !!resolvedIpFromDnsCheck,
          ip: resolvedIpFromDnsCheck,
          hostname: config.host,
          fromDnsCheck: !!resolvedIpFromDnsCheck
        },
        finalResult,
        config: {
          host: config.host,
          user: config.user,
          database: config.database,
          port: config.port
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