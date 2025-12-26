const Joi = require('joi');
const CphulkManager = require('../services/cphulkManager');
const CpanelCredentialResolver = require('../services/cpanelCredentialResolver');
const ResponseFormatter = require('../utils/responseFormatter');
const { getServiceForClient } = require('../utils/helpers');
const { getClientsProducts, getClientsDomains } = require('../services/whmcsService');

// Import performance monitor (with fallback for compatibility)
let performanceMonitor;
try {
  performanceMonitor = require('../utils/performanceMonitor');
} catch (error) {
  // Fallback performance monitor if import fails
  performanceMonitor = {
    startTimer: (name) => ({ end: () => 0 }),
    getSummary: () => ({})
  };
}

// Validation schemas
const checkFailedLoginsSchema = Joi.object({
  ip: Joi.string().ip().required(),
  domain: Joi.string().domain().optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional()
}).custom((value, helpers) => {
  // If domain is provided, require either email or phone
  if (value.domain && !value.email && !value.phone) {
    return helpers.error('custom.domainRequiresContact');
  }
  return value;
}, 'Domain contact validation').messages({
  'custom.domainRequiresContact': 'When domain is provided, either email or phone is required for client identification'
});

const whitelistIPSchema = Joi.object({
  ip: Joi.string().ip().required(),
  domain: Joi.string().domain().optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional(),
  reason: Joi.string().max(255).optional()
}).custom((value, helpers) => {
  // If domain is provided, require either email or phone
  if (value.domain && !value.email && !value.phone) {
    return helpers.error('custom.domainRequiresContact');
  }
  return value;
}, 'Domain contact validation').messages({
  'custom.domainRequiresContact': 'When domain is provided, either email or phone is required for client identification'
});

// Simple in-memory cache for results (5 minute TTL)
const cphulkCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cphulkCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cphulkCache.delete(key);
    }
  }
}, 60000); // Cleanup every minute

class CphulkController {
  constructor() {
    this.manager = new CphulkManager();
    this.credentialResolver = new CpanelCredentialResolver();
    
    // Bind methods to preserve 'this' context
    this.checkFailedLogins = this.checkFailedLogins.bind(this);
    this.whitelistIP = this.whitelistIP.bind(this);
    this.getCapabilities = this.getCapabilities.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
  }

  /**
   * Check failed login attempts for an IP address
   */
  async checkFailedLogins(req, res) {
    const timer = performanceMonitor.startTimer('check_failed_logins_total');
    const startTime = Date.now();
    
    try {
      // Validation
      const validationTimer = performanceMonitor.startTimer('validation');
      const { error, value } = checkFailedLoginsSchema.validate(req.body);
      validationTimer.end();
      
      if (error) {
        const formattedError = ResponseFormatter.formatValidationError(
          error.details.map(d => d.message)
        );
        return res.status(400).json(formattedError);
      }

      // Check cache first
      const cacheTimer = performanceMonitor.startTimer('cache_lookup');
      const cacheKey = `failed_logins:${value.ip}:${value.domain || 'no-domain'}`;
      const cached = cphulkCache.get(cacheKey);
      cacheTimer.end();
      
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        const cacheAge = Date.now() - cached.timestamp;
        const formattedResponse = ResponseFormatter.formatCachedResponse(cached.data, cacheAge);
        
        timer.end();
        return res.status(formattedResponse.success ? 200 : 500).json(formattedResponse);
      }

      let clientInfo = null;
      let serverInfo = null;

      // If domain is provided, resolve client credentials and validate service status
      if (value.domain) {
        // Step 1: Resolve client credentials
        const credentialTimer = performanceMonitor.startTimer('credential_resolution');
        const credentialResult = await this.credentialResolver.resolveCpanelCredentials(
          value.domain,
          value.email,
          value.phone
        );
        credentialTimer.end();

        if (!credentialResult.success) {
          timer.end();
          
          // Check if this is a phone verification error
          if (credentialResult.error && typeof credentialResult.error === 'object' && 
              credentialResult.error.type === 'phone_verification_failed') {
            
            const phoneErrorResponse = {
              success: false,
              error: credentialResult.error.message,
              registeredPhone: credentialResult.error.registeredPhone
            };
            
            return res.status(400).json(phoneErrorResponse);
          }
          
          // Handle other credential errors
          const formattedError = ResponseFormatter.formatCredentialError(
            value.domain,
            credentialResult.error
          );
          formattedError.performance = {
            totalTime: Date.now() - startTime,
            cached: false
          };
          return res.status(404).json(formattedError);
        }

        clientInfo = credentialResult.clientInfo;
        serverInfo = credentialResult.serverInfo;

        // Step 2: Validate service/domain status
        const statusTimer = performanceMonitor.startTimer('status_validation');
        const statusValidation = await this.validateServiceStatus(clientInfo.id, value.domain);
        statusTimer.end();

        if (!statusValidation.valid) {
          timer.end();
          
          const statusErrorResponse = {
            success: false,
            status: 'SERVICE_UNAVAILABLE',
            message: statusValidation.message,
            timestamp: new Date().toISOString(),
            domain: value.domain,
            serviceStatus: statusValidation.serviceStatus,
            performance: {
              totalTime: Date.now() - startTime,
              cached: false
            }
          };
          
          return res.status(412).json(statusErrorResponse); // 412 Precondition Failed
        }
      }

      // Step 3: Check failed logins
      const cphulkTimer = performanceMonitor.startTimer('cphulk_check');
      const result = await this.manager.getFailedLogins(value.ip, serverInfo?.serverName);
      cphulkTimer.end();

      // Add performance information
      const totalTime = Date.now() - startTime;
      result.performance = {
        totalTime,
        cached: false,
        breakdown: performanceMonitor.getSummary()
      };

      // Add client and domain information if available
      if (clientInfo) {
        result.clientInfo = {
          id: clientInfo.id,
          email: clientInfo.email,
          name: `${clientInfo.firstname} ${clientInfo.lastname}`.trim()
        };
      }

      if (value.domain) {
        result.domain = value.domain;
      }

      if (serverInfo) {
        result.serverInfo = {
          name: serverInfo.serverName,
          hostname: serverInfo.hostname
        };
      }

      // Cache successful results
      if (result.success) {
        const cacheTimer = performanceMonitor.startTimer('cache_store');
        cphulkCache.set(cacheKey, {
          data: { ...result },
          timestamp: Date.now()
        });
        cacheTimer.end();
      }

      // Format the response
      const includeDebugInfo = req.query.debug === 'true' || process.env.NODE_ENV === 'development';
      const formattedResponse = ResponseFormatter.formatCphulkResponse(result, includeDebugInfo);
      
      // Sanitize response to remove sensitive information
      const sanitizedResponse = ResponseFormatter.sanitizeResponse(formattedResponse);

      timer.end();
      return res.status(result.success ? 200 : 500).json(sanitizedResponse);

    } catch (error) {
      timer.end();
      
      if (process.env.NODE_ENV !== 'production') {
        console.error('cPHulk check failed logins error:', error);
      }
      
      const errorResponse = {
        success: false,
        status: 'SYSTEM_ERROR',
        message: 'Internal server error occurred during cPHulk check',
        timestamp: new Date().toISOString(),
        error: {
          type: 'system',
          reason: 'INTERNAL_ERROR',
          message: error.message
        },
        performance: {
          totalTime: Date.now() - startTime,
          cached: false
        }
      };
      
      return res.status(500).json(errorResponse);
    }
  }

  /**
   * Whitelist an IP address in cPHulk with intelligent workflow based on authservice
   */
  async whitelistIP(req, res) {
    const timer = performanceMonitor.startTimer('whitelist_ip_total');
    const startTime = Date.now();
    
    try {
      // Validation
      const validationTimer = performanceMonitor.startTimer('validation');
      const { error, value } = whitelistIPSchema.validate(req.body);
      validationTimer.end();
      
      if (error) {
        const formattedError = ResponseFormatter.formatValidationError(
          error.details.map(d => d.message)
        );
        return res.status(400).json(formattedError);
      }

      let clientInfo = null;
      let serverInfo = null;

      // If domain is provided, resolve client credentials and validate service status
      if (value.domain) {
        // Step 1: Resolve client credentials
        const credentialTimer = performanceMonitor.startTimer('credential_resolution');
        const credentialResult = await this.credentialResolver.resolveCpanelCredentials(
          value.domain,
          value.email,
          value.phone
        );
        credentialTimer.end();

        if (!credentialResult.success) {
          timer.end();
          
          // Check if this is a phone verification error
          if (credentialResult.error && typeof credentialResult.error === 'object' && 
              credentialResult.error.type === 'phone_verification_failed') {
            
            const phoneErrorResponse = {
              success: false,
              error: credentialResult.error.message,
              registeredPhone: credentialResult.error.registeredPhone
            };
            
            return res.status(400).json(phoneErrorResponse);
          }
          
          // Handle other credential errors
          const formattedError = ResponseFormatter.formatCredentialError(
            value.domain,
            credentialResult.error
          );
          formattedError.performance = {
            totalTime: Date.now() - startTime,
            cached: false
          };
          return res.status(404).json(formattedError);
        }

        clientInfo = credentialResult.clientInfo;
        serverInfo = credentialResult.serverInfo;

        // Step 2: Validate service/domain status
        const statusTimer = performanceMonitor.startTimer('status_validation');
        const statusValidation = await this.validateServiceStatus(clientInfo.id, value.domain);
        statusTimer.end();

        if (!statusValidation.valid) {
          timer.end();
          
          const statusErrorResponse = {
            success: false,
            status: 'SERVICE_UNAVAILABLE',
            message: statusValidation.message,
            timestamp: new Date().toISOString(),
            domain: value.domain,
            serviceStatus: statusValidation.serviceStatus,
            performance: {
              totalTime: Date.now() - startTime,
              cached: false
            }
          };
          
          return res.status(412).json(statusErrorResponse); // 412 Precondition Failed
        }
      }

      // Step 3: Execute intelligent whitelisting workflow based on authservice
      const cphulkTimer = performanceMonitor.startTimer('cphulk_intelligent_whitelist');
      const result = await this.manager.intelligentWhitelistWorkflow(
        value.ip, 
        serverInfo?.serverName, 
        clientInfo,
        value.domain,
        value.reason || 'Client request via API'
      );
      cphulkTimer.end();

      // Add performance information
      const totalTime = Date.now() - startTime;
      result.performance = {
        totalTime,
        cached: false,
        breakdown: performanceMonitor.getSummary()
      };

      // Add client and domain information if available
      if (clientInfo) {
        result.clientInfo = {
          id: clientInfo.id,
          email: clientInfo.email,
          name: `${clientInfo.firstname} ${clientInfo.lastname}`.trim()
        };
      }

      if (value.domain) {
        result.domain = value.domain;
      }

      if (serverInfo) {
        result.serverInfo = {
          name: serverInfo.serverName,
          hostname: serverInfo.hostname
        };
      }

      // Clear cache for this IP since status has changed
      const cacheKey = `failed_logins:${value.ip}:${value.domain || 'no-domain'}`;
      cphulkCache.delete(cacheKey);

      // Format the response
      const includeDebugInfo = req.query.debug === 'true' || process.env.NODE_ENV === 'development';
      const formattedResponse = ResponseFormatter.formatCphulkResponse(result, includeDebugInfo);
      
      // Sanitize response to remove sensitive information
      const sanitizedResponse = ResponseFormatter.sanitizeResponse(formattedResponse);

      timer.end();
      return res.status(result.success ? 200 : 500).json(sanitizedResponse);

    } catch (error) {
      timer.end();
      
      if (process.env.NODE_ENV !== 'production') {
        console.error('cPHulk whitelist IP error:', error);
      }
      
      const errorResponse = {
        success: false,
        status: 'SYSTEM_ERROR',
        message: 'Internal server error occurred during IP whitelisting',
        timestamp: new Date().toISOString(),
        error: {
          type: 'system',
          reason: 'INTERNAL_ERROR',
          message: error.message
        },
        performance: {
          totalTime: Date.now() - startTime,
          cached: false
        }
      };
      
      return res.status(500).json(errorResponse);
    }
  }

  /**
   * Validate service/domain status to ensure it's not expired/terminated/suspended
   */
  async validateServiceStatus(clientId, domain) {
    try {
      // Get service/product from WHMCS
      const service = await getServiceForClient({ clientId, domain });
      
      if (!service) {
        return {
          valid: false,
          message: `No service found for domain: ${domain}`,
          serviceStatus: 'NOT_FOUND'
        };
      }

      const status = service.status?.toLowerCase();
      const serviceName = service.domain || service.name || 'service';

      // Check if service is in a valid state
      const validStatuses = ['active', 'pending'];
      const invalidStatuses = ['expired', 'terminated', 'suspended', 'cancelled'];

      if (invalidStatuses.includes(status)) {
        let message;
        switch (status) {
          case 'expired':
            message = `Your ${serviceName} service has expired. Please renew to continue using cPHulk management features.`;
            break;
          case 'terminated':
            message = `Your ${serviceName} service has been terminated. cPHulk management is not available.`;
            break;
          case 'suspended':
            message = `Your ${serviceName} service is currently suspended. Please resolve any outstanding issues to use cPHulk features.`;
            break;
          case 'cancelled':
            message = `Your ${serviceName} service has been cancelled. cPHulk management is not available.`;
            break;
          default:
            message = `Your ${serviceName} service status (${status}) does not allow cPHulk management.`;
        }

        return {
          valid: false,
          message: message,
          serviceStatus: status.toUpperCase()
        };
      }

      if (!validStatuses.includes(status)) {
        return {
          valid: false,
          message: `Service status '${status}' is not supported for cPHulk management. Please contact support.`,
          serviceStatus: status.toUpperCase()
        };
      }

      // Additional check for domain registration vs hosting
      if (service.type === 'domain') {
        // For domain registrations, also check if there's an active hosting service
        try {
          const products = await getClientsProducts(clientId, { status: 'Active' });
          
          if (!products || !products.products || !products.products.product) {
            return {
              valid: false,
              message: `Domain ${domain} is registered but no active hosting service found. cPHulk management requires active hosting.`,
              serviceStatus: 'DOMAIN_ONLY'
            };
          }

          const productList = Array.isArray(products.products.product) 
            ? products.products.product 
            : [products.products.product];

          // Check if there's a hosting product for this domain
          const hostingProduct = productList.find(product => 
            product.groupname && 
            product.groupname.toLowerCase().includes('hosting') &&
            (product.domain === domain || product.dedicatedip === domain)
          );

          if (!hostingProduct) {
            return {
              valid: false,
              message: `Domain ${domain} is registered but no active hosting service found. cPHulk management requires active hosting.`,
              serviceStatus: 'DOMAIN_ONLY'
            };
          }
        } catch (error) {
          // If we can't check hosting products, allow the request to proceed
          console.warn(`Could not verify hosting products for domain ${domain}:`, error.message);
        }
      }

      return {
        valid: true,
        message: 'Service is active and valid for cPHulk management',
        serviceStatus: status.toUpperCase()
      };

    } catch (error) {
      console.error(`Error validating service status for ${domain}:`, error);
      return {
        valid: false,
        message: 'Unable to validate service status. Please try again later.',
        serviceStatus: 'VALIDATION_ERROR'
      };
    }
  }

  /**
   * Get cPHulk service capabilities
   */
  async getCapabilities(req, res) {
    try {
      const capabilities = this.getStaticCapabilities();

      return res.json({
        success: true,
        data: capabilities,
        message: 'cPHulk service capabilities'
      });

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Get cPHulk capabilities error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Static capabilities object
   */
  getStaticCapabilities() {
    return {
      monitoring: {
        failedLogins: {
          description: 'Monitor failed login attempts by IP address',
          required: true,
          requiresServerAccess: true
        },
        loginDetails: {
          description: 'Get detailed login attempt information including country, service, and timing',
          required: true,
          requiresServerAccess: true
        },
        realTimeData: {
          description: 'Real-time failed login data from cPHulk',
          required: true,
          cacheTime: '5 minutes'
        }
      },
      whitelisting: {
        ipWhitelist: {
          description: 'Add IP addresses to cPHulk whitelist',
          requiresServerAccess: true,
          destructive: false
        },
        automaticCleanup: {
          description: 'Automatically clear failed login records for whitelisted IPs',
          requiresServerAccess: true,
          destructive: false
        }
      },
      validation: {
        clientVerification: {
          description: 'Verify client ownership through email or phone',
          required: true,
          requiresWhmcsAccess: true
        },
        serviceStatusCheck: {
          description: 'Validate service is active and not expired/terminated/suspended',
          required: true,
          requiresWhmcsAccess: true
        },
        domainOwnership: {
          description: 'Verify domain ownership before allowing cPHulk management',
          required: true,
          requiresWhmcsAccess: true
        }
      },
      security: {
        phoneVerification: {
          description: 'Phone number verification for enhanced security',
          enabled: true
        },
        serviceValidation: {
          description: 'Service status validation prevents unauthorized access',
          enabled: true
        },
        auditLogging: {
          description: 'All cPHulk actions are logged for security auditing',
          enabled: true
        }
      }
    };
  }

  /**
   * Health check for cPHulk service
   */
  async healthCheck(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          cphulk: 'available',
          whmcs: 'available',
          whm: 'available'
        }
      };

      return res.json({
        success: true,
        data: health,
        message: 'cPHulk service is healthy'
      });

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('cPHulk health check error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Service unhealthy',
        message: error.message
      });
    }
  }
}

module.exports = new CphulkController();