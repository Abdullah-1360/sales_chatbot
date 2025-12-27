const Joi = require('joi');
const WordPressDiagnosticManager = require('../services/wordpressDiagnosticManager');
const CpanelCredentialResolver = require('../services/cpanelCredentialResolver');
const ResponseFormatter = require('../utils/responseFormatter');

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

// Optimized validation schemas (reused for better performance)
const diagnosticSchema = Joi.object({
  domain: Joi.string().domain().required(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional()
}).or('email', 'phone');

const quickTestSchema = diagnosticSchema; // Reuse same schema

// Optimized in-memory cache for diagnostic results (2 minute TTL)
const diagnosticCache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const MAX_CACHE_SIZE = 1000; // Prevent memory bloat

// Optimized cache cleanup with LRU eviction
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60000; // 1 minute

function cleanupCache() {
  const now = Date.now();
  
  // Only cleanup if interval has passed
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  // Remove expired entries
  for (const [key, value] of diagnosticCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      diagnosticCache.delete(key);
    }
  }
  
  // If cache is still too large, remove oldest entries (LRU)
  if (diagnosticCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(diagnosticCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, diagnosticCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => diagnosticCache.delete(key));
  }
  
  lastCleanup = now;
}

class WordPressDiagnosticController {
  constructor() {
    this.manager = new WordPressDiagnosticManager();
    this.credentialResolver = new CpanelCredentialResolver();
    
    // Bind methods to preserve 'this' context
    this.diagnoseDatabase = this.diagnoseDatabase.bind(this);
    this.quickTest = this.quickTest.bind(this);
    this.getCapabilities = this.getCapabilities.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
  }

  /**
   * Full WordPress database diagnostic workflow
   */
  async diagnoseDatabase(req, res) {
    const timer = performanceMonitor.startTimer('diagnose_database_total');
    const startTime = Date.now();
    
    try {
      // Fast validation with pre-compiled schema
      const validationTimer = performanceMonitor.startTimer('validation');
      const { error, value } = diagnosticSchema.validate(req.body);
      validationTimer.end();
      
      if (error) {
        const formattedError = ResponseFormatter.formatValidationError(
          error.details.map(d => d.message)
        );
        return res.status(400).json(formattedError);
      }

      // Cache disabled - always run fresh diagnostic
      const cacheTimer = performanceMonitor.startTimer('cache_lookup');
      const cacheKey = `${value.domain}:${value.email || value.phone || 'no-id'}`;
      const bypassCache = true; // Always bypass cache
      
      // Skip cache cleanup since cache is disabled
      const cached = null; // Cache disabled
      cacheTimer.end();

      // Step 1: Resolve cPanel credentials (optimized with timeout)
      const credentialTimer = performanceMonitor.startTimer('credential_resolution');
      
      // Add timeout to credential resolution to prevent hanging
      const credentialPromise = this.credentialResolver.resolveCpanelCredentials(
        value.domain,
        value.email,
        value.phone
      );
      
      const credentialResult = await Promise.race([
        credentialPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Credential resolution timeout')), 30000)
        )
      ]);
      
      credentialTimer.end();

      if (!credentialResult.success) {
        timer.end();
        
        // Check if this is a phone verification error
        if (credentialResult.error && typeof credentialResult.error === 'object' && 
            credentialResult.error.type === 'phone_verification_failed') {
          
          // Return the specific phone verification error format
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
          credentialResult.error,
          {
            clientLookup: credentialResult.clientInfo ? 'found' : 'not_found',
            serverLookup: credentialResult.serverInfo ? 'found' : 'not_found'
          }
        );
        formattedError.performance = {
          totalTime: Date.now() - startTime,
          cached: false
        };
        return res.status(404).json(formattedError);
      }

      // Step 2: Prepare diagnostic parameters (pre-allocated object for performance)
      const diagnosticParams = Object.assign(Object.create(null), {
        domain: value.domain,
        clientId: credentialResult.clientInfo?.id,
        cpanelHost: credentialResult.cpanelCredentials.host,
        cpanelUsername: credentialResult.cpanelCredentials.username,
        cpanelPassword: credentialResult.cpanelCredentials.password,
        cpanelPort: credentialResult.cpanelCredentials.port,
        serverName: credentialResult.serverInfo?.serverName,
        wpPath: 'public_html',
        wpConfigPath: 'public_html/wp-config.php',
        skipGuards: false,
        expectedIp: null,
        enableRemediation: true,
        approveServiceRestart: false,
        approveTableRepair: false,
        approveKillConnections: false,
        whmcsService: req.whmcsService,
        req: req // Pass request object for IP detection
      });

      // Step 3: Run diagnostic workflow (with timeout)
      const diagnosticTimer = performanceMonitor.startTimer('diagnostic_workflow');
      
      // Add timeout to diagnostic workflow to prevent hanging
      const diagnosticPromise = this.manager.diagnoseWordPressDatabase(diagnosticParams);
      const result = await Promise.race([
        diagnosticPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Diagnostic workflow timeout')), 60000)
        )
      ]);
      
      diagnosticTimer.end();

      // Add performance information
      const totalTime = Date.now() - startTime;
      result.performance = {
        totalTime,
        cached: false,
        breakdown: performanceMonitor.getSummary()
      };

      // Cache disabled - no caching of results
      // if (result.success && diagnosticCache.size < MAX_CACHE_SIZE && !bypassCache) {
      //   const cacheTimer = performanceMonitor.startTimer('cache_store');
      //   diagnosticCache.set(cacheKey, {
      //     data: { ...result },
      //     timestamp: Date.now()
      //   });
      //   cacheTimer.end();
      // }

      // Format the response to remove irrelevant items
      const includeDebugInfo = req.query.debug === 'true' || process.env.NODE_ENV === 'development';
      const formattedResponse = ResponseFormatter.formatDiagnosticResponse(result, includeDebugInfo);
      
      // Sanitize response to remove sensitive information
      const sanitizedResponse = ResponseFormatter.sanitizeResponse(formattedResponse);

      const statusCode = result.success ? 200 : 
                        (result.summary?.status === 'FAILED_GUARDS' ? 412 : 500);

      timer.end();
      return res.status(statusCode).json(sanitizedResponse);

    } catch (error) {
      timer.end();
      // Minimal error logging in production
      if (process.env.NODE_ENV !== 'production') {
        console.error('WordPress diagnostic error:', error);
      }
      
      const errorResponse = {
        success: false,
        status: 'SYSTEM_ERROR',
        message: 'Internal server error occurred during diagnosis',
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
   * Quick connection test (lightweight)
   */
  async quickTest(req, res) {
    const startTime = Date.now();
    
    try {
      // Fast validation with pre-compiled schema
      const { error, value } = quickTestSchema.validate(req.body);
      if (error) {
        const formattedError = ResponseFormatter.formatValidationError(
          error.details.map(d => d.message)
        );
        return res.status(400).json(formattedError);
      }

      // Step 1: Resolve cPanel credentials (optimized)
      const credentialResult = await this.credentialResolver.resolveCpanelCredentials(
        value.domain,
        value.email,
        value.phone
      );

      if (!credentialResult.success) {
        // Check if this is a phone verification error
        if (credentialResult.error && typeof credentialResult.error === 'object' && 
            credentialResult.error.type === 'phone_verification_failed') {
          
          // Return the specific phone verification error format
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
          totalTime: Date.now() - startTime
        };
        return res.status(404).json(formattedError);
      }

      // Step 2: Run quick test (streamlined parameters)
      const quickTestParams = {
        cpanelHost: credentialResult.cpanelCredentials.host,
        cpanelUsername: credentialResult.cpanelCredentials.username,
        cpanelPassword: credentialResult.cpanelCredentials.password,
        cpanelPort: credentialResult.cpanelCredentials.port,
        wpConfigPath: 'public_html/wp-config.php'
      };

      const result = await this.manager.quickConnectionTest(quickTestParams);

      // Format simplified response for quick test
      const quickTestResponse = {
        success: result.success,
        status: result.success ? 'CONNECTION_SUCCESS' : 'CONNECTION_FAILED',
        message: result.success ? 'Database connection verified' : 'Database connection failed',
        timestamp: new Date().toISOString(),
        domain: value.domain,
        performance: {
          totalTime: Date.now() - startTime
        }
      };

      if (!result.success && result.error) {
        quickTestResponse.error = {
          type: 'connection',
          reason: 'CONNECTION_FAILED',
          message: result.error,
          details: 'Quick connection test failed'
        };
      }

      return res.status(result.success ? 200 : 500).json(quickTestResponse);

    } catch (error) {
      // Minimal error logging in production
      if (process.env.NODE_ENV !== 'production') {
        console.error('WordPress quick test error:', error);
      }
      
      const errorResponse = {
        success: false,
        status: 'SYSTEM_ERROR',
        message: 'Internal server error occurred during quick test',
        timestamp: new Date().toISOString(),
        error: {
          type: 'system',
          reason: 'INTERNAL_ERROR',
          message: error.message
        },
        performance: {
          totalTime: Date.now() - startTime
        }
      };
      
      return res.status(500).json(errorResponse);
    }
  }

  /**
   * Get diagnostic capabilities and requirements
   */
  async getCapabilities(req, res) {
    try {
      // Static capabilities object - no need to recreate on each request
      const capabilities = this.getStaticCapabilities();

      return res.json({
        success: true,
        data: capabilities,
        message: 'WordPress diagnostic capabilities'
      });

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Get capabilities error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Static capabilities object to avoid recreation
   */
  getStaticCapabilities() {
    return {
      guards: {
        whmcsProductCheck: {
          description: 'Verify WHMCS product is active',
          required: false,
          requiresWhmcsAccess: true
        },
        dnsCheck: {
          description: 'Verify DNS configuration',
          required: false,
          requiresExpectedIp: false
        },
        wordpressCheck: {
          description: 'Verify WordPress installation',
          required: true,
          requiresCpanelAccess: true
        }
      },
      diagnosis: {
        connectionTest: {
          description: 'Test MySQL database connection',
          required: true
        },
        errorMapping: {
          description: 'Map MySQL errors to root causes',
          required: true
        },
        extendedChecks: {
          description: 'Check database/user existence',
          required: false,
          requiresCpanelAccess: true
        }
      },
      remediation: {
        privilegeRepair: {
          description: 'Re-grant database privileges',
          requiresCpanelAccess: true,
          destructive: false
        },
        serviceRestart: {
          description: 'Restart MySQL service',
          requiresWhmAccess: true,
          destructive: true,
          requiresApproval: true
        },
        tableRepair: {
          description: 'Repair corrupted database tables',
          requiresCpanelAccess: true,
          destructive: true,
          requiresApproval: true
        }
      },
      security: {
        passwordMasking: {
          description: 'All passwords are masked in logs',
          enabled: true
        },
        approvalRequired: {
          description: 'Destructive actions require approval flags',
          enabled: true
        }
      }
    };
  }

  /**
   * Health check for the diagnostic service
   */
  async healthCheck(req, res) {
    try {
      // Simplified health check response
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      return res.json({
        success: true,
        data: health,
        message: 'WordPress diagnostic service is healthy'
      });

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Health check error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Service unhealthy',
        message: error.message
      });
    }
  }
}

module.exports = new WordPressDiagnosticController();