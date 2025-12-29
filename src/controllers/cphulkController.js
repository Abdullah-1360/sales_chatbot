const Joi = require('joi');
const CphulkManager = require('../services/cphulkManager');
const CpanelCredentialResolver = require('../services/cpanelCredentialResolver');
const CSFService = require('../services/csfService');
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
    this.csfService = new CSFService();
    
    // Bind methods to preserve 'this' context
    this.checkFailedLogins = this.checkFailedLogins.bind(this);
    this.whitelistIP = this.whitelistIP.bind(this);
    this.debugCSF = this.debugCSF.bind(this);
    this.testCSF = this.testCSF.bind(this);
    this.getCapabilities = this.getCapabilities.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
    this.getScheduledRemovals = this.getScheduledRemovals.bind(this);
    this.cancelScheduledRemoval = this.cancelScheduledRemoval.bind(this);
    this.getSchedulerStats = this.getSchedulerStats.bind(this);
  }

  /**
   * Check failed login attempts for an IP address
   */
  async checkFailedLogins(req, res) {
    const startTime = Date.now();
    
    try {
      // Fast validation
      const { error, value } = checkFailedLoginsSchema.validate(req.body);
      
      if (error) {
        const formattedError = ResponseFormatter.formatValidationError(
          error.details.map(d => d.message)
        );
        return res.status(400).json(formattedError);
      }

      // Check cache first
      const cacheKey = `failed_logins:${value.ip}:${value.domain || 'no-domain'}`;
      const cached = cphulkCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        const cacheAge = Date.now() - cached.timestamp;
        const formattedResponse = ResponseFormatter.formatCachedResponse(cached.data, cacheAge);
        
        // Remove performance data from cached response
        delete formattedResponse.performance;
        
        return res.status(formattedResponse.success ? 200 : 500).json(formattedResponse);
      }

      let clientInfo = null;
      let serverInfo = null;

      // If domain is provided, resolve client credentials and validate service status
      if (value.domain) {
        // Step 1: Resolve client credentials
        const credentialResult = await this.credentialResolver.resolveCpanelCredentials(
          value.domain,
          value.email,
          value.phone
        );

        if (!credentialResult.success) {
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
          return res.status(404).json(formattedError);
        }

        clientInfo = credentialResult.clientInfo;
        serverInfo = credentialResult.serverInfo;

        // Step 2: Validate service/domain status (optimized - skip in production unless requested)
        if (process.env.NODE_ENV !== 'production' || req.query.validateService === 'true') {
          const statusValidation = await this.validateServiceStatus(clientInfo.id, value.domain);

          if (!statusValidation.valid) {
            const statusErrorResponse = {
              success: false,
              status: 'SERVICE_UNAVAILABLE',
              message: statusValidation.message,
              timestamp: new Date().toISOString(),
              domain: value.domain,
              serviceStatus: statusValidation.serviceStatus
            };
            
            return res.status(412).json(statusErrorResponse); // 412 Precondition Failed
          }
        }
      }

      // Step 3: Check failed logins
      const result = await this.manager.getFailedLogins(value.ip, serverInfo?.serverName);

      // Add client and domain information if available (minimal data)
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
        cphulkCache.set(cacheKey, {
          data: { ...result },
          timestamp: Date.now()
        });
      }

      // Format the response (no debug info in production for performance)
      const includeDebugInfo = req.query.debug === 'true' && process.env.NODE_ENV === 'development';
      const formattedResponse = ResponseFormatter.formatCphulkResponse(result, includeDebugInfo);
      
      // Sanitize response to remove sensitive information
      const sanitizedResponse = ResponseFormatter.sanitizeResponse(formattedResponse);

      // Remove performance data from response
      delete sanitizedResponse.performance;

      return res.status(result.success ? 200 : 500).json(sanitizedResponse);

    } catch (error) {
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
        }
      };
      
      return res.status(500).json(errorResponse);
    }
  }

  /**
   * Whitelist an IP address in cPHulk with intelligent workflow based on authservice
   */
  async whitelistIP(req, res) {
    const startTime = Date.now();
    
    try {
      // Fast validation without performance monitoring
      const { error, value } = whitelistIPSchema.validate(req.body);
      
      if (error) {
        const formattedError = ResponseFormatter.formatValidationError(
          error.details.map(d => d.message)
        );
        return res.status(400).json(formattedError);
      }

      let clientInfo = null;
      let serverInfo = null;
      let csfAnalysis = null;
      let result = null; // Initialize result variable

      // If domain is provided, resolve client credentials and validate service status in parallel where possible
      if (value.domain) {
        // Step 1: Resolve client credentials
        const credentialResult = await this.credentialResolver.resolveCpanelCredentials(
          value.domain,
          value.email,
          value.phone
        );

        if (!credentialResult.success) {
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
          return res.status(404).json(formattedError);
        }

        clientInfo = credentialResult.clientInfo;
        serverInfo = credentialResult.serverInfo;

        // Step 2: Validate service/domain status (optimized - skip detailed checks in production)
        if (process.env.NODE_ENV !== 'production' || req.query.validateService === 'true') {
          const statusValidation = await this.validateServiceStatus(clientInfo.id, value.domain);

          if (!statusValidation.valid) {
            const statusErrorResponse = {
              success: false,
              status: 'SERVICE_UNAVAILABLE',
              message: statusValidation.message,
              timestamp: new Date().toISOString(),
              domain: value.domain,
              serviceStatus: statusValidation.serviceStatus
            };
            
            return res.status(412).json(statusErrorResponse); // 412 Precondition Failed
          }
        }
      }

      // Step 3: Analyze IP with CSF firewall and execute parallel remediation
      try {
        // Only perform CSF analysis if we have a server name from credential resolution
        if (serverInfo?.serverName) {
          console.log(`→ Analyzing IP ${value.ip} with CSF firewall on server ${serverInfo.serverName}`);
          
          // Set a shorter timeout for CSF analysis to prevent blocking
          const csfTimeout = 10000; // 10 seconds
          const csfPromise = this.csfService.analyzeIP(value.ip, serverInfo.serverName);
          
          csfAnalysis = await Promise.race([
            csfPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('CSF analysis timeout')), csfTimeout)
            )
          ]);
          
          // Handle CSF analysis results and execute targeted remediation
          if (csfAnalysis.success && csfAnalysis.csf && csfAnalysis.csf.inDenyList) {
            console.log(`⚠️ IP ${value.ip} is currently blocked by CSF firewall on ${serverInfo.serverName}`);
            console.log(`   Block type: ${csfAnalysis.csf.blockType || 'unknown'}`);
            console.log(`   Block reasons: ${csfAnalysis.csf.blockReasons && Array.isArray(csfAnalysis.csf.blockReasons) && csfAnalysis.csf.blockReasons.length > 0 ? csfAnalysis.csf.blockReasons.join(', ') : 'none specified'}`);
            console.log(`   → CSF issue detected - executing CSF-only remediation (no cPHulk whitelisting needed)`);
            
            // Prepare CSF-only operations (no cPHulk whitelisting)
            const csfOperations = [];
            
            // 1. Remove from CSF deny list
            console.log(`→ Step 1: Removing IP ${value.ip} from CSF deny list (action=kill) on ${serverInfo.serverName}`);
            const csfUnblockPromise = Promise.race([
              this.csfService.unblockIP(value.ip, serverInfo.serverName),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('CSF unblock timeout')), 5000)
              )
            ]).catch(error => ({
              success: false,
              error: error.message,
              action: 'unblock'
            }));
            csfOperations.push(csfUnblockPromise);
            
            // 2. Add to CSF allow list
            console.log(`→ Step 2: Adding IP ${value.ip} to CSF allow list (action=qallow) on ${serverInfo.serverName}`);
            const csfAllowPromise = Promise.race([
              this.csfService.allowIP(
                value.ip, 
                serverInfo.serverName, 
                `CSF-only remediation - ${value.reason || 'Client request via API'} - ${new Date().toISOString()}`
              ),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('CSF allow timeout')), 5000)
              )
            ]).catch(error => ({
              success: false,
              error: error.message,
              action: 'allow'
            }));
            csfOperations.push(csfAllowPromise);
            
            // Execute CSF operations in parallel
            console.log(`→ Executing ${csfOperations.length} CSF operations in parallel...`);
            const csfResults = await Promise.allSettled(csfOperations);
            
            // Process CSF results
            const csfUnblockResult = csfResults[0];
            csfAnalysis.unblockAttempt = csfUnblockResult.status === 'fulfilled' 
              ? csfUnblockResult.value 
              : { success: false, error: csfUnblockResult.reason?.message || 'Unknown error' };
            
            const csfAllowResult = csfResults[1];
            csfAnalysis.allowAttempt = csfAllowResult.status === 'fulfilled' 
              ? csfAllowResult.value 
              : { success: false, error: csfAllowResult.reason?.message || 'Unknown error' };
            
            // Set overall success based on CSF operations
            csfAnalysis.success = csfAnalysis.unblockAttempt.success && csfAnalysis.allowAttempt.success;
            csfAnalysis.csfOnlyRemediation = true;
            csfAnalysis.csfRemediation = {
              unblocked: csfAnalysis.unblockAttempt?.success || false,
              whitelisted: csfAnalysis.allowAttempt?.success || false
            };
            
            console.log(`→ CSF-only operations completed:`);
            console.log(`   - CSF unblock (remove from deny list): ${csfAnalysis.unblockAttempt?.success ? 'SUCCESS' : 'FAILED'}`);
            console.log(`   - CSF whitelist (add to allow list): ${csfAnalysis.allowAttempt?.success ? 'SUCCESS' : 'FAILED'}`);
            console.log(`   - cPHulk whitelisting: SKIPPED (CSF issue only)`);
            
            // Use CSF analysis as the main result
            result = csfAnalysis;
            
          } else {
            // No CSF block detected, check for cPHulk issues only
            console.log(`→ No CSF block detected for IP ${value.ip}, checking cPHulk issues only`);
            
            // Execute cPHulk-only workflow
            result = await this.manager.intelligentWhitelistWorkflow(
              value.ip, 
              serverInfo.serverName, 
              clientInfo,
              value.domain,
              value.reason || 'Client request via API'
            );
            
            // Mark as cPHulk-only remediation
            result.cphulkOnlyRemediation = true;
            console.log(`→ cPHulk-only whitelisting completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
            console.log(`   - CSF operations: SKIPPED (no CSF block detected)`);
            
            // Add CSF analysis to the result
            result.csfAnalysis = csfAnalysis;
          }
          
        } else {
          // No server information available - skip CSF analysis and run cPHulk-only workflow
          console.log(`→ Skipping CSF analysis for IP ${value.ip} - no server information available`);
          console.log(`→ Executing cPHulk-only whitelisting workflow`);
          
          csfAnalysis = {
            success: false,
            error: 'No server information available for CSF analysis',
            ip: value.ip,
            serverName: null,
            message: 'CSF analysis skipped - domain/server resolution required for CSF operations'
          };
          
          // Execute cPHulk-only workflow
          result = await this.manager.intelligentWhitelistWorkflow(
            value.ip, 
            serverInfo?.serverName, 
            clientInfo,
            value.domain,
            value.reason || 'Client request via API'
          );
          
          // Mark as cPHulk-only remediation
          result.cphulkOnlyRemediation = true;
          console.log(`→ cPHulk-only whitelisting completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
          console.log(`   - CSF operations: SKIPPED (no server information)`);
          
          // Add CSF analysis to the result
          result.csfAnalysis = csfAnalysis;
        }
        
      } catch (csfError) {
        console.error(`CSF analysis failed for IP ${value.ip}:`, csfError.message);
        console.log(`→ CSF analysis failed - executing cPHulk-only whitelisting workflow`);
        
        csfAnalysis = {
          success: false,
          error: csfError.message,
          ip: value.ip,
          serverName: serverInfo?.serverName || null,
          message: 'CSF analysis failed - proceeding with cPHulk whitelisting only'
        };
        
        // Execute cPHulk-only workflow since CSF failed
        result = await this.manager.intelligentWhitelistWorkflow(
          value.ip, 
          serverInfo?.serverName, 
          clientInfo,
          value.domain,
          value.reason || 'Client request via API'
        );
        
        // Mark as cPHulk-only remediation
        result.cphulkOnlyRemediation = true;
        console.log(`→ cPHulk-only whitelisting completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`   - CSF operations: SKIPPED (CSF analysis failed)`);
        
        // Add CSF analysis to the result
        result.csfAnalysis = csfAnalysis;
      }

      // Step 4: Only execute cPHulk workflow if not already done
      if (!result) {
        console.log(`→ Executing standard cPHulk whitelisting workflow (fallback)`);
        result = await this.manager.intelligentWhitelistWorkflow(
          value.ip, 
          serverInfo?.serverName, 
          clientInfo,
          value.domain,
          value.reason || 'Client request via API'
        );
        
        // Add CSF analysis to the result if available
        if (csfAnalysis) {
          result.csfAnalysis = csfAnalysis;
        }
      }

      // Add client and domain information if available (minimal data)
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

      // Format the response (no debug info in production for performance)
      const includeDebugInfo = req.query.debug === 'true' && process.env.NODE_ENV === 'development';
      const formattedResponse = ResponseFormatter.formatCphulkResponse(result, includeDebugInfo);
      
      // Sanitize response to remove sensitive information
      const sanitizedResponse = ResponseFormatter.sanitizeResponse(formattedResponse);

      // Remove performance data from response for better performance and cleaner output
      delete sanitizedResponse.performance;

      return res.status(result.success ? 200 : 500).json(sanitizedResponse);

    } catch (error) {
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
   * Get scheduled IP removal jobs
   */
  async getScheduledRemovals(req, res) {
    try {
      const { ip, serverName } = req.query;
      const jobScheduler = require('../services/jobScheduler');
      
      const jobs = await jobScheduler.getScheduledJobs(ip, serverName);
      
      return res.json({
        success: true,
        data: {
          scheduledJobs: jobs,
          totalJobs: jobs.length
        },
        message: 'Scheduled IP removal jobs retrieved successfully'
      });

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Get scheduled removals error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Cancel scheduled IP removal
   */
  async cancelScheduledRemoval(req, res) {
    const timer = performanceMonitor.startTimer('cancel_scheduled_removal');
    
    try {
      const { ip, serverName } = req.body;
      
      if (!ip || !serverName) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters',
          message: 'Both ip and serverName are required'
        });
      }

      const jobScheduler = require('../services/jobScheduler');
      const result = await jobScheduler.cancelIPRemoval(ip, serverName);
      
      timer.end();
      return res.json({
        success: true,
        data: result,
        message: `Cancelled ${result.cancelledJobs} scheduled removal jobs for IP ${ip}`
      });

    } catch (error) {
      timer.end();
      
      if (process.env.NODE_ENV !== 'production') {
        console.error('Cancel scheduled removal error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Get job scheduler statistics
   */
  async getSchedulerStats(req, res) {
    try {
      const jobScheduler = require('../services/jobScheduler');
      const stats = await jobScheduler.getStats();
      
      return res.json({
        success: true,
        data: stats,
        message: 'Job scheduler statistics retrieved successfully'
      });

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Get scheduler stats error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Get scheduled IP removals
   */
  async getScheduledRemovals(req, res) {
    try {
      const { ip, server } = req.query;
      const jobScheduler = require('../services/jobScheduler');
      
      const jobs = await jobScheduler.getScheduledJobs(ip, server);
      
      return res.json({
        success: true,
        data: {
          scheduledRemovals: jobs,
          totalJobs: jobs.length
        },
        message: 'Scheduled IP removals retrieved successfully'
      });

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Get scheduled removals error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Cancel scheduled IP removal
   */
  async cancelScheduledRemoval(req, res) {
    try {
      const { ip, server } = req.body;
      
      if (!ip || !server) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters',
          message: 'Both ip and server are required'
        });
      }

      const jobScheduler = require('../services/jobScheduler');
      const result = await jobScheduler.cancelIPRemoval(ip, server);
      
      return res.json({
        success: true,
        data: result,
        message: `Cancelled ${result.cancelledJobs} scheduled removal(s) for IP ${ip}`
      });

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Cancel scheduled removal error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Get job scheduler statistics
   */
  async getSchedulerStats(req, res) {
    try {
      const jobScheduler = require('../services/jobScheduler');
      const stats = await jobScheduler.getStats();
      
      return res.json({
        success: true,
        data: stats,
        message: 'Job scheduler statistics retrieved successfully'
      });

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Get scheduler stats error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Debug CSF response endpoint
   */
  async debugCSF(req, res) {
    try {
      const { ip = '65.21.229.29', server } = req.query;
      
      if (!server) {
        return res.status(400).json({
          success: false,
          error: 'Server parameter is required',
          message: 'Please provide a server name (e.g., ?server=pcp3)',
          example: '/cphulk/debug-csf?ip=65.21.229.29&server=pcp3'
        });
      }
      
      console.log(`→ Debug CSF response for IP: ${ip} on server: ${server}`);
      
      // Get raw CSF response
      const debugResult = await this.csfService.debugCSFResponse(ip, server);
      
      return res.json({
        success: true,
        message: 'CSF debug response retrieved',
        ip: ip,
        server: server,
        debug: debugResult,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('CSF debug error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        message: 'CSF debug failed'
      });
    }
  }

  /**
   * Test CSF integration endpoint
   */
  async testCSF(req, res) {
    try {
      const { ip = '8.8.8.8', server } = req.query;
      
      if (!server) {
        return res.status(400).json({
          success: false,
          error: 'Server parameter is required',
          message: 'Please provide a server name (e.g., ?server=pcp3)',
          example: '/cphulk/test-csf?ip=8.8.8.8&server=pcp3'
        });
      }
      
      console.log(`→ Testing CSF integration for IP: ${ip} on server: ${server}`);
      
      // Test CSF service with timeout
      const csfTimeout = 5000; // 5 seconds
      let csfResult;
      
      try {
        const csfPromise = this.csfService.grepIP(ip, server);
        csfResult = await Promise.race([
          csfPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('CSF test timeout')), csfTimeout)
          )
        ]);
      } catch (csfError) {
        csfResult = {
          success: false,
          error: csfError.message,
          ip: ip,
          serverName: server
        };
      }
      
      return res.json({
        success: true,
        message: 'CSF integration test completed',
        ip: ip,
        server: server,
        csfResult: csfResult,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('CSF test error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        message: 'CSF integration test failed'
      });
    }
  }
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