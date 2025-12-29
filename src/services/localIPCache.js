const https = require('https');
const winston = require('winston');

class LocalIPCache {
  constructor() {
    this.cachedIP = null;
    this.lastDetected = null;
    this.isDetecting = false;
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.simple()
      ),
      transports: [
        new winston.transports.Console()
      ]
    });
  }

  /**
   * Check if an IP address is a public IP (not private/localhost)
   */
  isPublicIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    
    // Remove IPv6 prefix if present
    const cleanIP = ip.replace(/^::ffff:/, '');
    
    // Check if it's a valid IPv4 address
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = cleanIP.match(ipv4Regex);
    
    if (!match) return false;
    
    const [, a, b, c, d] = match.map(Number);
    
    // Check if all octets are valid (0-255)
    if (a > 255 || b > 255 || c > 255 || d > 255) return false;
    
    // Check if it's a private/localhost IP
    if (
      a === 127 ||                          // 127.x.x.x (localhost)
      a === 10 ||                           // 10.x.x.x (private)
      (a === 172 && b >= 16 && b <= 31) ||  // 172.16.x.x - 172.31.x.x (private)
      (a === 192 && b === 168) ||           // 192.168.x.x (private)
      a === 0 ||                            // 0.x.x.x (invalid)
      a >= 224                              // Multicast/reserved
    ) {
      return false;
    }
    
    return true;
  }

  /**
   * Detect external IP address using external service
   */
  async detectExternalIP() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('External IP detection timeout'));
      }, 10000); // 10 second timeout
      
      https.get('https://api.ipify.org?format=text', (res) => {
        clearTimeout(timeout);
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const ip = data.trim();
          if (this.isPublicIP(ip)) {
            resolve(ip);
          } else {
            reject(new Error(`Invalid external IP detected: ${ip}`));
          }
        });
      }).on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Initialize IP detection at server startup
   */
  async initialize() {
    if (this.isDetecting) {
      this.logger.warn('IP detection already in progress, skipping...');
      return this.cachedIP;
    }

    try {
      this.isDetecting = true;
      this.logger.info('🔍 Detecting local machine public IP address at startup...');
      
      const ip = await this.detectExternalIP();
      
      this.cachedIP = ip;
      this.lastDetected = new Date();
      
      this.logger.info(`✅ Local machine public IP detected and cached: ${ip}`);
      
      return ip;
    } catch (error) {
      this.logger.error(`❌ Failed to detect local machine IP at startup: ${error.message}`);
      throw error;
    } finally {
      this.isDetecting = false;
    }
  }

  /**
   * Get cached IP (with optional refresh if cache is old)
   */
  async getIP(maxAgeMinutes = 60) {
    // If no cached IP, detect it
    if (!this.cachedIP) {
      return await this.initialize();
    }

    // If cache is fresh, return it
    if (this.lastDetected) {
      const ageMinutes = (Date.now() - this.lastDetected.getTime()) / (1000 * 60);
      if (ageMinutes < maxAgeMinutes) {
        return this.cachedIP;
      }
    }

    // Cache is old, refresh it
    this.logger.info('🔄 Refreshing cached IP address...');
    return await this.initialize();
  }

  /**
   * Get cached IP synchronously (returns null if not cached)
   */
  getCachedIP() {
    return this.cachedIP;
  }

  /**
   * Check if IP is cached and fresh
   */
  isCached(maxAgeMinutes = 60) {
    if (!this.cachedIP || !this.lastDetected) return false;
    
    const ageMinutes = (Date.now() - this.lastDetected.getTime()) / (1000 * 60);
    return ageMinutes < maxAgeMinutes;
  }
}

// Create singleton instance
const localIPCache = new LocalIPCache();

module.exports = localIPCache;