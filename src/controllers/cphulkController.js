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
  email: Joi.string().email().allow('').optional(),
  phone: Joi.string().allow('').optional(),
  reason: Joi.string().max(255).optional()
}).custom((value, helpers) => {
  // If domain is provided, require either email or phone (empty strings don't count)
  const hasEmail = value.email && value.email.trim() !== '';
  const hasPhone = value.phone && value.phone.trim() !== '';
  
  if (value.domain && !hasEmail && !hasPhone) {
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

      // Format the response with clean, user-friendly information
      const cleanResponse = this.formatCleanFailedLoginsResponse(result, value.ip, value.domain);
      
      return res.status(result.success ? 200 : 500).json(cleanResponse);

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

      // Step 3: Analyze both CSF and cPHulk issues in parallel for maximum efficiency
      let csfAnalysis = null;
      let cphulkAnalysis = null;
      
      try {
        console.log(`→ Starting parallel analysis of CSF and cPHulk issues for IP ${value.ip}`);
        
        const parallelChecks = [];
        
        // 1. CSF Analysis (if server available)
        if (serverInfo?.serverName) {
          console.log(`→ Queuing CSF analysis for IP ${value.ip} on server ${serverInfo.serverName}`);
          const csfPromise = Promise.race([
            this.csfService.analyzeIP(value.ip, serverInfo.serverName),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('CSF analysis timeout')), 10000)
            )
          ]).catch(error => ({
            success: false,
            error: error.message,
            ip: value.ip,
            serverName: serverInfo.serverName,
            message: 'CSF analysis failed'
          }));
          parallelChecks.push(csfPromise);
        } else {
          // No server info - CSF analysis not possible
          parallelChecks.push(Promise.resolve({
            success: false,
            error: 'No server information available for CSF analysis',
            ip: value.ip,
            serverName: null,
            message: 'CSF analysis skipped - domain/server resolution required'
          }));
        }
        
        // 2. cPHulk Analysis (always check for failed logins)
        console.log(`→ Queuing cPHulk analysis for IP ${value.ip}`);
        const cphulkPromise = Promise.race([
          this.manager.getFailedLogins(value.ip, serverInfo?.serverName),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('cPHulk analysis timeout')), 15000)
          )
        ]).catch(error => ({
          success: false,
          error: error.message,
          ip: value.ip,
          serverName: serverInfo?.serverName,
          message: 'cPHulk analysis failed'
        }));
        parallelChecks.push(cphulkPromise);
        
        // Execute both analyses in parallel
        console.log(`→ Executing ${parallelChecks.length} parallel analyses (CSF + cPHulk)...`);
        const analysisResults = await Promise.allSettled(parallelChecks);
        
        // Process results
        const csfResult = analysisResults[0];
        csfAnalysis = csfResult.status === 'fulfilled' 
          ? csfResult.value 
          : { success: false, error: csfResult.reason?.message || 'CSF analysis failed' };
          
        const cphulkResult = analysisResults[1];
        cphulkAnalysis = cphulkResult.status === 'fulfilled' 
          ? cphulkResult.value 
          : { success: false, error: cphulkResult.reason?.message || 'cPHulk analysis failed' };
        
        console.log(`→ Parallel analyses completed:`);
        console.log(`   - CSF analysis: ${csfAnalysis.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`   - cPHulk analysis: ${cphulkAnalysis.success ? 'SUCCESS' : 'FAILED'}`);
        
        // Determine remediation strategy based on parallel analysis results
        const csfIssueDetected = csfAnalysis.success && csfAnalysis.csf && csfAnalysis.csf.inDenyList;
        const cphulkIssueDetected = cphulkAnalysis.success && cphulkAnalysis.hasFailedLogins;
        
        console.log(`→ Issue detection results:`);
        console.log(`   - CSF block detected: ${csfIssueDetected ? 'YES' : 'NO'}`);
        console.log(`   - cPHulk failures detected: ${cphulkIssueDetected ? 'YES' : 'NO'}`);
        
        // Apply targeted remediation based on what issues were found
        if (csfIssueDetected && cphulkIssueDetected) {
          // Both systems have issues - apply both remediations in parallel
          console.log(`⚠️ Both CSF and cPHulk issues detected - executing dual remediation`);
          result = await this.executeDualRemediation(value.ip, serverInfo, clientInfo, value.domain, value.reason, csfAnalysis, cphulkAnalysis);
          
        } else if (csfIssueDetected) {
          // Only CSF issue - CSF-only remediation
          console.log(`⚠️ CSF issue detected - executing CSF-only remediation`);
          result = await this.executeCSFOnlyRemediation(value.ip, serverInfo, clientInfo, value.domain, value.reason, csfAnalysis);
          
        } else if (cphulkIssueDetected) {
          // Only cPHulk issue - cPHulk-only remediation
          console.log(`⚠️ cPHulk issue detected - executing cPHulk-only remediation`);
          result = await this.executeCPHulkOnlyRemediation(value.ip, serverInfo, clientInfo, value.domain, value.reason, cphulkAnalysis);
          
        } else {
          // No issues detected - preventive whitelisting
          console.log(`ℹ️ No issues detected - executing preventive whitelisting`);
          result = await this.executePreventiveWhitelisting(value.ip, serverInfo, clientInfo, value.domain, value.reason, csfAnalysis, cphulkAnalysis);
        }
        
      } catch (error) {
        console.error(`Parallel analysis failed for IP ${value.ip}:`, error.message);
        
        // Fallback to cPHulk-only workflow
        console.log(`→ Falling back to cPHulk-only workflow due to analysis failure`);
        result = await this.manager.intelligentWhitelistWorkflow(
          value.ip, 
          serverInfo?.serverName, 
          clientInfo,
          value.domain,
          value.reason || 'Client request via API'
        );
        
        result.cphulkOnlyRemediation = true;
        result.analysisError = error.message;
        console.log(`→ Fallback cPHulk-only whitelisting completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
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

      // Format the response with clean, user-friendly information
      const cleanResponse = this.formatCleanResponse(result, value.ip, value.domain);
      
      return res.status(result.success ? 200 : 500).json(cleanResponse);

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
   * Format clean response for failed logins check
   */
  formatCleanFailedLoginsResponse(result, ip, domain) {
    const response = {
      success: result.success || false,
      ip: ip,
      timestamp: new Date().toISOString()
    };

    // Add domain if provided
    if (domain) {
      response.domain = domain;
    }

    // Add client info if available (minimal)
    if (result.clientInfo) {
      response.client = {
        name: result.clientInfo.name || 'N/A',
        email: result.clientInfo.email || 'N/A'
      };
    }

    if (result.success) {
      if (result.hasFailedLogins) {
        response.message = `Failed login attempts detected for IP ${ip}. Use the whitelist endpoint to resolve access issues.`;
        response.status = 'FAILED_LOGINS_DETECTED';
        response.failedLogins = {
          count: result.totalFailures || 0,
          services: result.authServices || [],
          recommendation: 'Consider whitelisting this IP if these are legitimate access attempts'
        };
      } else {
        response.message = `No failed login attempts found for IP ${ip}. Your access appears to be working normally.`;
        response.status = 'NO_ISSUES_DETECTED';
      }
    } else {
      response.message = `Unable to check failed logins for IP ${ip}. Please contact support if you're experiencing access issues.`;
      response.status = 'CHECK_FAILED';
    }

    // Add debug info only if explicitly requested and in development
    if (process.env.NODE_ENV === 'development') {
      response._debug = {
        totalFailures: result.totalFailures,
        authServices: result.authServices,
        serverName: result.serverName
      };
    }

    return response;
  }

  /**
   * Format clean, user-friendly response
   */
  formatCleanResponse(result, ip, domain) {
    const response = {
      success: result.success || false,
      message: this.generateUserFriendlyMessage(result, ip),
      ip: ip,
      timestamp: new Date().toISOString()
    };

    // Add domain if provided
    if (domain) {
      response.domain = domain;
    }

    // Add client info if available (minimal)
    if (result.clientInfo) {
      response.client = {
        name: result.clientInfo.name || 'N/A',
        email: result.clientInfo.email || 'N/A'
      };
    }

    // Add remediation type for clarity
    if (result.success) {
      if (result.csfOnlyRemediation) {
        response.action = 'Firewall System remediation completed';
      } else if (result.cphulkOnlyRemediation) {
        response.action = 'Anti-Brute Force System remediation completed';
      } else if (result.dualRemediation) {
        response.action = 'Complete security remediation completed';
      } else if (result.preventiveWhitelisting) {
        response.action = 'Preventive security whitelisting completed';
      } else {
        response.action = 'Security whitelisting completed';
      }
    } else {
      // Failed operations
      if (result.csfOnlyRemediation) {
        response.action = 'Firewall System remediation failed';
      } else if (result.cphulkOnlyRemediation) {
        response.action = 'Anti-Brute Force System remediation failed';
      } else if (result.dualRemediation) {
        response.action = 'Security remediation failed';
      } else {
        response.action = 'Security whitelisting failed';
      }
    }

    // Add ticket info if created
    if (result.ticketCreated) {
      response.supportTicket = 'A support ticket has been created with details of this action';
    }

    // Add debug info only if explicitly requested and in development
    if (process.env.NODE_ENV === 'development') {
      response._debug = {
        workflow: result.workflow,
        remediation: {
          csf: result.csfOnlyRemediation || false,
          cphulk: result.cphulkOnlyRemediation || false,
          dual: result.dualRemediation || false,
          preventive: result.preventiveWhitelisting || false
        }
      };
    }

    return response;
  }

  /**
   * Generate user-friendly message based on result
   */
  generateUserFriendlyMessage(result, ip) {
    if (!result.success) {
      // Check if we have more specific error information
      if (result.error) {
        return `Unable to complete security whitelisting for IP ${ip}: ${result.error}. Please contact support if the issue persists.`;
      }
      return `Unable to complete security whitelisting for IP ${ip}. Please contact support if the issue persists.`;
    }

    // CSF-only remediation
    if (result.csfOnlyRemediation) {
      return `Your IP address ${ip} has been successfully unblocked from our Firewall System and whitelisted for future access.`;
    }

    // cPHulk-only remediation
    if (result.cphulkOnlyRemediation) {
      return `Your IP address ${ip} has been successfully whitelisted in our Anti-Brute Force System for 24 hours.`;
    }

    // Dual remediation
    if (result.dualRemediation) {
      return `Your IP address ${ip} has been successfully remediated in both our Firewall System and Anti-Brute Force System.`;
    }

    // Preventive whitelisting
    if (result.preventiveWhitelisting) {
      return `Your IP address ${ip} has been preventively whitelisted in our security systems for 24 hours.`;
    }

    // Default message
    return `Your IP address ${ip} has been successfully processed by our security systems.`;
  }

  /**
   * Execute CSF-only remediation
   */
  async executeCSFOnlyRemediation(ip, serverInfo, clientInfo, domain, reason, csfAnalysis) {
    console.log(`→ Executing CSF-only remediation for IP ${ip}`);
    console.log(`   Block type: ${csfAnalysis.csf.blockType || 'unknown'}`);
    console.log(`   Block reasons: ${csfAnalysis.csf.blockReasons && Array.isArray(csfAnalysis.csf.blockReasons) && csfAnalysis.csf.blockReasons.length > 0 ? csfAnalysis.csf.blockReasons.join(', ') : 'none specified'}`);
    
    const csfOperations = [];
    
    // 1. Remove from CSF deny list
    console.log(`→ Step 1: Removing IP ${ip} from CSF deny list (action=kill) on ${serverInfo.serverName}`);
    const csfUnblockPromise = Promise.race([
      this.csfService.unblockIP(ip, serverInfo.serverName),
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
    console.log(`→ Step 2: Adding IP ${ip} to CSF allow list (action=qallow) on ${serverInfo.serverName}`);
    const csfAllowPromise = Promise.race([
      this.csfService.allowIP(
        ip, 
        serverInfo.serverName, 
        `Firewall System remediation - ${reason || 'Client request via API'} - ${new Date().toISOString()}`
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
    
    return csfAnalysis;
  }

  /**
   * Execute cPHulk-only remediation
   */
  async executeCPHulkOnlyRemediation(ip, serverInfo, clientInfo, domain, reason, cphulkAnalysis) {
    console.log(`→ Executing cPHulk-only remediation for IP ${ip}`);
    console.log(`   Failed logins detected: ${cphulkAnalysis.hasFailedLogins ? 'YES' : 'NO'}`);
    
    // Use the existing cPHulk analysis instead of calling getFailedLogins again
    const result = await this.manager.intelligentWhitelistWorkflowWithAnalysis(
      ip, 
      serverInfo?.serverName, 
      clientInfo,
      domain,
      reason || 'Client request via API',
      cphulkAnalysis // Pass existing analysis to avoid duplicate API calls
    );
    
    result.cphulkOnlyRemediation = true;
    result.cphulkAnalysis = cphulkAnalysis;
    
    console.log(`→ cPHulk-only whitelisting completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   - CSF operations: SKIPPED (no CSF block detected)`);
    
    return result;
  }

  /**
   * Execute dual remediation (both CSF and cPHulk issues)
   */
  async executeDualRemediation(ip, serverInfo, clientInfo, domain, reason, csfAnalysis, cphulkAnalysis) {
    console.log(`→ Executing dual remediation for IP ${ip} (both CSF and cPHulk issues)`);
    
    const parallelOperations = [];
    
    // 1. CSF unblock
    const csfUnblockPromise = Promise.race([
      this.csfService.unblockIP(ip, serverInfo.serverName),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('CSF unblock timeout')), 5000)
      )
    ]).catch(error => ({
      success: false,
      error: error.message,
      action: 'unblock'
    }));
    parallelOperations.push(csfUnblockPromise);
    
    // 2. CSF whitelist
    const csfAllowPromise = Promise.race([
      this.csfService.allowIP(
        ip, 
        serverInfo.serverName, 
        `Dual remediation (CSF+cPHulk) - ${reason || 'Client request via API'} - ${new Date().toISOString()}`
      ),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('CSF allow timeout')), 5000)
      )
    ]).catch(error => ({
      success: false,
      error: error.message,
      action: 'allow'
    }));
    parallelOperations.push(csfAllowPromise);
    
    // 3. cPHulk workflow
    const cphulkPromise = this.manager.intelligentWhitelistWorkflow(
      ip, 
      serverInfo.serverName, 
      clientInfo,
      domain,
      reason || 'Client request via API - Dual remediation (CSF+cPHulk)'
    );
    parallelOperations.push(cphulkPromise);
    
    // Execute all operations in parallel
    console.log(`→ Executing ${parallelOperations.length} dual remediation operations in parallel...`);
    const results = await Promise.allSettled(parallelOperations);
    
    // Process results
    const csfUnblockResult = results[0];
    csfAnalysis.unblockAttempt = csfUnblockResult.status === 'fulfilled' 
      ? csfUnblockResult.value 
      : { success: false, error: csfUnblockResult.reason?.message || 'Unknown error' };
    
    const csfAllowResult = results[1];
    csfAnalysis.allowAttempt = csfAllowResult.status === 'fulfilled' 
      ? csfAllowResult.value 
      : { success: false, error: csfAllowResult.reason?.message || 'Unknown error' };
    
    const cphulkResult = results[2];
    const cphulkData = cphulkResult.status === 'fulfilled' 
      ? cphulkResult.value 
      : { success: false, error: cphulkResult.reason?.message || 'cPHulk operation failed' };
    
    // Merge results
    const result = Object.assign({}, cphulkData, csfAnalysis);
    result.dualRemediation = true;
    result.csfRemediation = {
      unblocked: csfAnalysis.unblockAttempt?.success || false,
      whitelisted: csfAnalysis.allowAttempt?.success || false
    };
    result.csfAnalysis = csfAnalysis;
    result.cphulkAnalysis = cphulkAnalysis;
    
    console.log(`→ Dual remediation operations completed:`);
    console.log(`   - CSF unblock: ${csfAnalysis.unblockAttempt?.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   - CSF whitelist: ${csfAnalysis.allowAttempt?.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   - cPHulk whitelist: ${cphulkData.success ? 'SUCCESS' : 'FAILED'}`);
    
    return result;
  }

  /**
   * Execute preventive whitelisting (no issues detected)
   */
  async executePreventiveWhitelisting(ip, serverInfo, clientInfo, domain, reason, csfAnalysis, cphulkAnalysis) {
    console.log(`→ Executing preventive whitelisting for IP ${ip} (no issues detected)`);
    
    // Use the existing cPHulk analysis instead of calling getFailedLogins again
    const result = await this.manager.intelligentWhitelistWorkflowWithAnalysis(
      ip, 
      serverInfo?.serverName, 
      clientInfo,
      domain,
      reason || 'Client request via API - Preventive whitelisting',
      cphulkAnalysis // Pass existing analysis to avoid duplicate API calls
    );
    
    result.preventiveWhitelisting = true;
    result.csfAnalysis = csfAnalysis;
    result.cphulkAnalysis = cphulkAnalysis;
    
    console.log(`→ Preventive whitelisting completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   - No issues detected, performed preventive cPHulk whitelisting`);
    
    return result;
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