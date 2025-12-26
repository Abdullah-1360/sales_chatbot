const winston = require('winston');
const silentLogger = require('../utils/silentLogger');
const { getClientsProducts, getClientsDomains } = require('../services/whmcsService');

class GuardStep {
  constructor() {
    // Use silent logger in production for performance
    this.logger = process.env.NODE_ENV === 'production' ? require('../utils/silentLogger') : winston.createLogger({
      level: 'error',
      format: winston.format.simple(),
      transports: [new winston.transports.Console()]
    });
  }

  /**
   * Step A: Quick Guards - Fast checks for service state and DNS
   * Check WHMCS service state and DNS resolution
   */
  async checkWhmcsServiceState(clientId, domain) {
    try {
      this.logger.info(`Step A1: Checking WHMCS service state for domain: ${domain}`);
      
      // Get client products
      const products = await getClientsProducts(clientId, { status: 'Active' });
      
      if (!products || !products.products || !products.products.product) {
        return {
          passed: false,
          reason: 'NO_PRODUCTS_FOUND',
          message: `No products found for client ID: ${clientId}`,
          escalate: 'billing'
        };
      }

      const productList = Array.isArray(products.products.product) 
        ? products.products.product 
        : [products.products.product];

      // Find hosting products for this domain
      const hostingProducts = productList.filter(product => 
        product.groupname && product.groupname.toLowerCase().includes('hosting') &&
        (product.domain === domain || product.dedicatedip === domain)
      );

      if (hostingProducts.length === 0) {
        return {
          passed: false,
          reason: 'NO_HOSTING_SERVICE',
          message: `No hosting service found for domain: ${domain}`,
          escalate: 'billing'
        };
      }

      // Check service status
      const activeProduct = hostingProducts[0];
      const status = activeProduct.status.toLowerCase();

      if (status === 'suspended') {
        return {
          passed: false,
          reason: 'SERVICE_SUSPENDED',
          message: `Hosting service is suspended for domain: ${domain}`,
          escalate: 'billing',
          productInfo: {
            id: activeProduct.id,
            status: activeProduct.status,
            product: activeProduct.productname
          }
        };
      }

      if (status === 'terminated') {
        return {
          passed: false,
          reason: 'SERVICE_TERMINATED',
          message: `Hosting service is terminated for domain: ${domain}`,
          escalate: 'billing',
          productInfo: {
            id: activeProduct.id,
            status: activeProduct.status,
            product: activeProduct.productname
          }
        };
      }

      if (status !== 'active') {
        return {
          passed: false,
          reason: 'SERVICE_INACTIVE',
          message: `Hosting service status is '${status}' for domain: ${domain}`,
          escalate: 'billing',
          productInfo: {
            id: activeProduct.id,
            status: activeProduct.status,
            product: activeProduct.productname
          }
        };
      }

      return {
        passed: true,
        message: `Hosting service is active for domain: ${domain}`,
        productInfo: {
          id: activeProduct.id,
          status: activeProduct.status,
          product: activeProduct.productname,
          server: activeProduct.server
        }
      };

    } catch (error) {
      this.logger.error(`WHMCS service state check failed: ${error.message}`);
      return {
        passed: false,
        reason: 'WHMCS_ERROR',
        message: `Failed to check WHMCS service state: ${error.message}`,
        escalate: 'technical'
      };
    }
  }

  /**
   * Step A2: DNS Resolution Check - Verify DNS points to expected server
   */
  async checkDnsResolution(domain, expectedServerIp = null) {
    try {
      this.logger.info(`Step A2: Checking DNS resolution for domain: ${domain}`);
      
      const dns = require('dns').promises;
      
      // Check A record
      const aRecords = await dns.resolve4(domain).catch(() => []);
      
      // Check if domain resolves
      if (aRecords.length === 0) {
        return {
          passed: false,
          reason: 'DNS_NO_RESOLUTION',
          message: `Domain ${domain} does not resolve to any IP address`,
          escalate: 'user_notification',
          dnsInfo: {
            resolvedIps: [],
            expectedIp: expectedServerIp
          }
        };
      }

      // If expected server IP is provided, verify it matches
      if (expectedServerIp && !aRecords.includes(expectedServerIp)) {
        return {
          passed: false,
          reason: 'DNS_WRONG_SERVER',
          message: `Domain ${domain} resolves to ${aRecords.join(', ')} but expected ${expectedServerIp}`,
          escalate: 'user_notification',
          dnsInfo: {
            resolvedIps: aRecords,
            expectedIp: expectedServerIp
          }
        };
      }

      // Additional check: verify the resolved IP is reachable
      const primaryIp = aRecords[0];
      const isReachable = await this.checkServerReachability(primaryIp);

      if (!isReachable) {
        return {
          passed: false,
          reason: 'SERVER_UNREACHABLE',
          message: `Domain ${domain} resolves to ${primaryIp} but server is unreachable`,
          escalate: 'technical',
          dnsInfo: {
            resolvedIps: aRecords,
            primaryIp: primaryIp,
            reachable: false
          }
        };
      }

      return {
        passed: true,
        message: `DNS configuration is correct for domain: ${domain}`,
        dnsInfo: {
          resolvedIps: aRecords,
          primaryIp: primaryIp,
          reachable: true
        }
      };

    } catch (error) {
      this.logger.error(`DNS check failed: ${error.message}`);
      return {
        passed: false,
        reason: 'DNS_ERROR',
        message: `Failed to check DNS configuration: ${error.message}`,
        escalate: 'technical'
      };
    }
  }

  /**
   * Check server reachability via TCP probe
   */
  async checkServerReachability(ip, port = 80, timeout = 5000) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);

      socket.connect(port, ip, () => {
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
   * Check if WordPress is installed
   */
  async checkWordPressInstallation(cpanelClient, wpPath = 'public_html') {
    try {
      this.logger.info(`Checking WordPress installation at: ${wpPath}`);
      
      // Check for wp-config.php
      const wpConfigExists = await this.checkFileExists(cpanelClient, `${wpPath}/wp-config.php`);
      
      if (!wpConfigExists) {
        return {
          passed: false,
          reason: 'WP_CONFIG_NOT_FOUND',
          message: `wp-config.php not found at ${wpPath}/wp-config.php`
        };
      }

      // Check for wp-includes directory
      const wpIncludesExists = await this.checkFileExists(cpanelClient, `${wpPath}/wp-includes`);
      
      if (!wpIncludesExists) {
        return {
          passed: false,
          reason: 'WP_CORE_NOT_FOUND',
          message: `WordPress core files not found at ${wpPath}/wp-includes`
        };
      }

      return {
        passed: true,
        message: `WordPress installation found at: ${wpPath}`
      };

    } catch (error) {
      this.logger.error(`WordPress installation check failed: ${error.message}`);
      return {
        passed: false,
        reason: 'WP_CHECK_ERROR',
        message: `Failed to check WordPress installation: ${error.message}`
      };
    }
  }

  /**
   * Helper method to check if file exists via cPanel
   */
  async checkFileExists(cpanelClient, filePath) {
    try {
      await cpanelClient.makeApiCall('Fileman', 'get_file_information', {
        path: filePath
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Run all guard checks
   */
  async runAllGuards(params) {
    const { domain, whmcsService, cpanelClient, expectedIp, wpPath } = params;
    
    const results = {
      passed: true,
      checks: {},
      summary: []
    };

    // Check WHMCS product status
    if (whmcsService) {
      results.checks.whmcsProduct = await this.checkWhmcsProductStatus(whmcsService, domain);
      if (!results.checks.whmcsProduct.passed) {
        results.passed = false;
        results.summary.push(results.checks.whmcsProduct.message);
      }
    }

    // Check DNS configuration
    results.checks.dns = await this.checkDnsConfiguration(domain, expectedIp);
    if (!results.checks.dns.passed) {
      results.passed = false;
      results.summary.push(results.checks.dns.message);
    }

    // Check WordPress installation
    if (cpanelClient) {
      results.checks.wordpress = await this.checkWordPressInstallation(cpanelClient, wpPath);
      if (!results.checks.wordpress.passed) {
        results.passed = false;
        results.summary.push(results.checks.wordpress.message);
      }
    }

    this.logger.info(`Guard checks completed. Overall result: ${results.passed ? 'PASSED' : 'FAILED'}`);
    
    return results;
  }
}

module.exports = GuardStep;