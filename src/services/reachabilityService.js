/**
 * Domain Reachability Service
 * Checks if domains are reachable via ping and HTTP requests
 */

const ping = require('ping');
const https = require('https');
const http = require('http');
const tls = require('tls');

class ReachabilityService {
  constructor() {
    this.timeout = 10000; // 10 seconds timeout
  }

  /**
   * Perform comprehensive reachability check for a domain
   * @param {string} domain - Domain to check
   * @param {Object} options - Check options
   * @returns {Promise<Object>} - Reachability result
   */
  async checkDomainReachability(domain, options = {}) {
    console.log(`🔍 Checking reachability for: ${domain}`);
    
    const result = {
      domain: domain,
      timestamp: new Date().toISOString(),
      ping: null,
      ssl: null,
      http: null,
      https: null,
      overall: {
        reachable: false,
        method: null,
        responseTime: null,
        statusCode: null
      },
      errors: []
    };

    try {
      // Step 1: SSL Certificate check (FIRST - determines if we continue)
      console.log(`→ Step 1: SSL Certificate check for ${domain}`);
      result.ssl = await this.sslCheck(domain);
      
      // If SSL is not valid, skip all other checks
      if (!result.ssl.valid) {
        console.log(`❌ SSL certificate is not valid - skipping HTTP, HTTPS, and ping checks`);
        console.log(`→ SSL Issues: ${result.ssl.warnings.join(', ')}`);
        
        // Set overall result based on SSL failure only
        result.overall.reachable = false;
        result.overall.method = 'ssl_failed';
        result.overall.responseTime = result.ssl.responseTime;
        result.overall.statusCode = null;
        result.overall.sslValid = false;
        result.overall.sslWarnings = result.ssl.warnings;
        result.overall.sslDaysUntilExpiry = result.ssl.daysUntilExpiry;
        
        console.log(`→ Overall reachability: ❌ (SSL certificate invalid - other checks skipped)`);
        
        return result;
      }
      
      console.log(`✅ SSL certificate is valid - checking HTTPS status code only`);
      
      // Step 2: HTTPS status code check (only if SSL is valid)
      console.log(`→ Step 2: HTTPS status code check for ${domain}`);
      result.https = await this.httpCheck(domain, true);
      
      // Skip ping and HTTP checks when SSL is valid
      result.ping = {
        alive: null,
        responseTime: null,
        error: 'Skipped - SSL is valid',
        skipped: true
      };
      
      result.http = {
        reachable: null,
        statusCode: null,
        responseTime: null,
        error: 'Skipped - SSL is valid',
        skipped: true
      };
      
      // Step 3: Determine overall reachability (based on HTTPS only)
      this.determineOverallReachabilityForValidSSL(result);
      
      console.log(`→ Overall reachability: ${result.overall.reachable ? '✅' : '❌'} (${result.overall.method})`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Reachability check failed for ${domain}:`, error.message);
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Ping a domain to check basic network connectivity
   * @param {string} domain - Domain to ping
   * @returns {Promise<Object>} - Ping result
   */
  async pingDomain(domain) {
    try {
      const startTime = Date.now();
      const pingResult = await ping.promise.probe(domain, {
        timeout: this.timeout / 1000, // ping library expects seconds
        extra: ['-c', '3'] // Send 3 packets
      });
      
      const responseTime = Date.now() - startTime;
      
      const result = {
        alive: pingResult.alive,
        host: pingResult.host,
        numeric_host: pingResult.numeric_host,
        time: pingResult.time,
        responseTime: responseTime,
        packetLoss: pingResult.packetLoss || null,
        error: null
      };
      
      if (pingResult.alive) {
        console.log(`✅ Ping successful: ${domain} (${pingResult.time}ms)`);
      } else {
        console.log(`❌ Ping failed: ${domain}`);
        result.error = 'Host not reachable via ping';
      }
      
      return result;
      
    } catch (error) {
      console.log(`❌ Ping error for ${domain}: ${error.message}`);
      return {
        alive: false,
        host: domain,
        error: error.message,
        responseTime: null
      };
    }
  }

  /**
   * Check SSL certificate for a domain using Node.js built-in TLS
   * @param {string} domain - Domain to check SSL certificate
   * @returns {Promise<Object>} - SSL certificate result
   */
  async sslCheck(domain) {
    return new Promise((resolve) => {
      console.log(`→ Checking SSL certificate for ${domain}...`);
      
      const startTime = Date.now();
      
      const options = {
        host: domain,
        port: 443,
        servername: domain, // SNI support
        timeout: this.timeout,
        rejectUnauthorized: false // We want to check the cert even if invalid
      };
      
      const socket = tls.connect(options, () => {
        const responseTime = Date.now() - startTime;
        
        try {
          const cert = socket.getPeerCertificate(true);
          
          if (!cert || Object.keys(cert).length === 0) {
            socket.destroy();
            return resolve({
              valid: false,
              validFrom: null,
              validTo: null,
              daysUntilExpiry: null,
              issuer: null,
              subject: null,
              serialNumber: null,
              fingerprint: null,
              responseTime: responseTime,
              error: 'No certificate found',
              warnings: ['No SSL certificate found']
            });
          }
          
          // Parse certificate dates
          const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
          const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
          const currentDate = new Date();
          
          // Calculate days until expiry
          let daysUntilExpiry = null;
          if (validTo) {
            daysUntilExpiry = Math.ceil((validTo - currentDate) / (1000 * 60 * 60 * 24));
          }
          
          // Check if certificate is valid
          const isValidTime = validFrom && validTo && currentDate >= validFrom && currentDate <= validTo;
          const isAuthorized = socket.authorized;
          const isValid = isValidTime && isAuthorized;
          
          // Extract certificate information
          const issuer = cert.issuer ? 
            `${cert.issuer.CN || cert.issuer.O || 'Unknown'}` : 'Unknown';
          const subject = cert.subject ? 
            `${cert.subject.CN || cert.subject.O || domain}` : domain;
          
          const result = {
            valid: isValid,
            validFrom: validFrom ? validFrom.toISOString() : null,
            validTo: validTo ? validTo.toISOString() : null,
            daysUntilExpiry: daysUntilExpiry,
            issuer: issuer,
            subject: subject,
            serialNumber: cert.serialNumber || null,
            fingerprint: cert.fingerprint || null,
            responseTime: responseTime,
            error: null,
            warnings: [],
            authorizationError: socket.authorizationError || null
          };
          
          // Add warnings for SSL issues
          if (!isAuthorized && socket.authorizationError) {
            result.warnings.push(`SSL authorization failed: ${socket.authorizationError}`);
          }
          
          if (!isValidTime) {
            if (!validFrom || !validTo) {
              result.warnings.push('SSL certificate has invalid date format');
            } else if (currentDate < validFrom) {
              result.warnings.push('SSL certificate is not yet valid');
            } else if (currentDate > validTo) {
              result.warnings.push('SSL certificate has expired');
            }
          }
          
          if (daysUntilExpiry !== null) {
            if (daysUntilExpiry <= 0) {
              result.warnings.push('SSL certificate has expired');
            } else if (daysUntilExpiry <= 30) {
              result.warnings.push(`SSL certificate expires in ${daysUntilExpiry} days`);
            }
          }
          
          // Check for self-signed certificate
          if (cert.issuer && cert.subject && 
              cert.issuer.CN === cert.subject.CN && 
              cert.issuer.O === cert.subject.O) {
            result.warnings.push('SSL certificate is self-signed');
          }
          
          socket.destroy();
          
          if (result.valid && daysUntilExpiry > 0) {
            console.log(`✅ SSL certificate valid: ${domain} (expires in ${daysUntilExpiry} days)`);
          } else {
            console.log(`⚠️ SSL certificate issues: ${domain} - ${result.warnings.join(', ')}`);
          }
          
          resolve(result);
          
        } catch (certError) {
          socket.destroy();
          const responseTime = Date.now() - startTime;
          
          console.log(`❌ SSL certificate parsing failed for ${domain}: ${certError.message}`);
          
          resolve({
            valid: false,
            validFrom: null,
            validTo: null,
            daysUntilExpiry: null,
            issuer: null,
            subject: null,
            serialNumber: null,
            fingerprint: null,
            responseTime: responseTime,
            error: certError.message,
            warnings: ['SSL certificate parsing failed']
          });
        }
      });
      
      socket.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        
        console.log(`❌ SSL connection failed for ${domain}: ${error.message}`);
        
        resolve({
          valid: false,
          validFrom: null,
          validTo: null,
          daysUntilExpiry: null,
          issuer: null,
          subject: null,
          serialNumber: null,
          fingerprint: null,
          responseTime: responseTime,
          error: error.message,
          warnings: ['SSL connection failed']
        });
      });
      
      socket.on('timeout', () => {
        const responseTime = Date.now() - startTime;
        
        console.log(`⏰ SSL connection timeout for ${domain}`);
        
        socket.destroy();
        resolve({
          valid: false,
          validFrom: null,
          validTo: null,
          daysUntilExpiry: null,
          issuer: null,
          subject: null,
          serialNumber: null,
          fingerprint: null,
          responseTime: responseTime,
          error: 'Connection timeout',
          warnings: ['SSL connection timeout']
        });
      });
      
      socket.setTimeout(this.timeout);
    });
  }

  /**
   * Perform HTTP/HTTPS check on a domain
   * @param {string} domain - Domain to check
   * @param {boolean} useHttps - Whether to use HTTPS
   * @returns {Promise<Object>} - HTTP result
   */
  async httpCheck(domain, useHttps = false) {
    const protocol = useHttps ? 'https' : 'http';
    const port = useHttps ? 443 : 80;
    const url = `${protocol}://${domain}`;
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const client = useHttps ? https : http;
      
      const options = {
        hostname: domain,
        port: port,
        path: '/',
        method: 'HEAD', // Use HEAD to minimize data transfer
        timeout: this.timeout,
        headers: {
          'User-Agent': 'HostBreak-ReachabilityChecker/1.0'
        }
      };
      
      // For HTTPS, allow self-signed certificates for basic reachability
      if (useHttps) {
        options.rejectUnauthorized = false;
      }
      
      const req = client.request(options, (res) => {
        const responseTime = Date.now() - startTime;
        
        console.log(`✅ ${protocol.toUpperCase()} response: ${domain} - ${res.statusCode} (${responseTime}ms)`);
        
        resolve({
          reachable: true,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: {
            server: res.headers.server || null,
            contentType: res.headers['content-type'] || null,
            location: res.headers.location || null
          },
          responseTime: responseTime,
          protocol: protocol,
          error: null
        });
        
        // Destroy the response to free up resources
        res.destroy();
      });
      
      req.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        
        console.log(`❌ ${protocol.toUpperCase()} error for ${domain}: ${error.message}`);
        
        resolve({
          reachable: false,
          statusCode: null,
          statusMessage: null,
          headers: {},
          responseTime: responseTime,
          protocol: protocol,
          error: error.message
        });
      });
      
      req.on('timeout', () => {
        const responseTime = Date.now() - startTime;
        
        console.log(`⏰ ${protocol.toUpperCase()} timeout for ${domain}`);
        
        req.destroy();
        resolve({
          reachable: false,
          statusCode: null,
          statusMessage: null,
          headers: {},
          responseTime: responseTime,
          protocol: protocol,
          error: 'Request timeout'
        });
      });
      
      req.setTimeout(this.timeout);
      req.end();
    });
  }

  /**
   * Determine overall reachability based on all checks
   * @param {Object} result - Complete reachability result
   */
  determineOverallReachability(result) {
    // Priority: HTTPS (with valid SSL) > HTTPS (with SSL issues) > HTTP > Ping
    
    if (result.https && result.https.reachable) {
      result.overall.reachable = true;
      result.overall.method = 'https';
      result.overall.responseTime = result.https.responseTime;
      result.overall.statusCode = result.https.statusCode;
      
      // Add SSL status to overall result
      if (result.ssl) {
        result.overall.sslValid = result.ssl.valid;
        result.overall.sslWarnings = result.ssl.warnings;
        result.overall.sslDaysUntilExpiry = result.ssl.daysUntilExpiry;
      }
    } else if (result.http && result.http.reachable) {
      result.overall.reachable = true;
      result.overall.method = 'http';
      result.overall.responseTime = result.http.responseTime;
      result.overall.statusCode = result.http.statusCode;
    } else if (result.ping && result.ping.alive) {
      result.overall.reachable = true;
      result.overall.method = 'ping';
      result.overall.responseTime = result.ping.responseTime;
      result.overall.statusCode = null;
    } else {
      result.overall.reachable = false;
      result.overall.method = 'none';
      result.overall.responseTime = null;
      result.overall.statusCode = null;
    }
  }

  /**
   * Determine overall reachability for domains with valid SSL (simplified workflow)
   * @param {Object} result - Complete reachability result
   */
  determineOverallReachabilityForValidSSL(result) {
    // For valid SSL, only use HTTPS status code check
    
    if (result.https && result.https.reachable) {
      result.overall.reachable = true;
      result.overall.method = 'https_ssl_valid';
      result.overall.responseTime = result.https.responseTime;
      result.overall.statusCode = result.https.statusCode;
      
      // Add SSL status to overall result
      result.overall.sslValid = result.ssl.valid;
      result.overall.sslWarnings = result.ssl.warnings;
      result.overall.sslDaysUntilExpiry = result.ssl.daysUntilExpiry;
      
      console.log(`→ HTTPS reachable with status ${result.https.statusCode} (SSL valid)`);
    } else {
      result.overall.reachable = false;
      result.overall.method = 'https_failed';
      result.overall.responseTime = result.https ? result.https.responseTime : null;
      result.overall.statusCode = result.https ? result.https.statusCode : null;
      
      // Add SSL status to overall result
      result.overall.sslValid = result.ssl.valid;
      result.overall.sslWarnings = result.ssl.warnings;
      result.overall.sslDaysUntilExpiry = result.ssl.daysUntilExpiry;
      
      console.log(`→ HTTPS not reachable despite valid SSL certificate`);
    }
  }

  /**
   * Quick ping check (simplified)
   * @param {string} domain - Domain to ping
   * @returns {Promise<Object>} - Simple ping result
   */
  async quickPing(domain) {
    try {
      const pingResult = await ping.promise.probe(domain, {
        timeout: 5, // 5 seconds
        extra: ['-c', '1'] // Single packet
      });
      
      return {
        reachable: pingResult.alive,
        responseTime: pingResult.time,
        host: pingResult.host,
        error: pingResult.alive ? null : 'Host unreachable'
      };
      
    } catch (error) {
      return {
        reachable: false,
        responseTime: null,
        host: domain,
        error: error.message
      };
    }
  }

  /**
   * Quick HTTP status check with SSL verification (simplified)
   * @param {string} domain - Domain to check
   * @returns {Promise<Object>} - Simple HTTP result with SSL info
   */
  async quickHttpCheck(domain) {
    try {
      // Check SSL first
      const sslResult = await this.sslCheck(domain);
      
      // If SSL is not valid, skip HTTP/HTTPS checks
      if (!sslResult.valid) {
        console.log(`❌ SSL certificate is not valid for ${domain} - skipping HTTP/HTTPS checks`);
        console.log(`→ SSL Issues: ${sslResult.warnings.join(', ')}`);
        
        return {
          reachable: false,
          statusCode: null,
          protocol: 'ssl_failed',
          responseTime: sslResult.responseTime,
          ssl: {
            valid: sslResult.valid,
            daysUntilExpiry: sslResult.daysUntilExpiry,
            warnings: sslResult.warnings
          },
          error: `SSL certificate invalid: ${sslResult.warnings.join(', ')}`
        };
      }
      
      console.log(`✅ SSL certificate is valid for ${domain} - proceeding with HTTP/HTTPS checks`);
      
      const httpsResult = await this.httpCheck(domain, true);
      
      if (httpsResult.reachable) {
        return {
          reachable: true,
          statusCode: httpsResult.statusCode,
          protocol: 'https',
          responseTime: httpsResult.responseTime,
          ssl: {
            valid: sslResult.valid,
            daysUntilExpiry: sslResult.daysUntilExpiry,
            warnings: sslResult.warnings
          },
          error: null
        };
      }
      
      // Fallback to HTTP if HTTPS fails (but only if SSL was valid)
      const httpResult = await this.httpCheck(domain, false);
      
      return {
        reachable: httpResult.reachable,
        statusCode: httpResult.statusCode,
        protocol: httpResult.reachable ? 'http' : null,
        responseTime: httpResult.responseTime,
        ssl: {
          valid: sslResult.valid,
          daysUntilExpiry: sslResult.daysUntilExpiry,
          warnings: sslResult.warnings
        },
        error: httpResult.reachable ? null : httpResult.error
      };
      
    } catch (error) {
      return {
        reachable: false,
        statusCode: null,
        protocol: null,
        responseTime: null,
        ssl: null,
        error: error.message
      };
    }
  }
}

// Export singleton instance
const reachabilityService = new ReachabilityService();

module.exports = reachabilityService;