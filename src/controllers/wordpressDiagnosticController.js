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

// Simple in-memory cache for diagnostic results (5 minute TTL)
const diagnosticCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of diagnosticCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      diagnosticCache.delete(key);
    }
  }
}, 60000); // Cleanup every minute

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

      // Check cache first
      const cacheTimer = performanceMonitor.startTimer('cache_lookup');
      const cacheKey = `${value.domain}:${value.email || value.phone || 'no-id'}`;
      const cached = diagnosticCache.get(cacheKey);
      cacheTimer.end();
      
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        // Return cached result with updated timestamp
        const cacheAge = Date.now() - cached.timestamp;
        const formattedResponse = ResponseFormatter.formatCachedResponse(cached.data, cacheAge);
        
        timer.end();
        return res.status(formattedResponse.success ? 200 : 500).json(formattedResponse);
      }

      // Step 1: Resolve cPanel credentials (optimized with reduced logging)
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

      // Step 2: Prepare diagnostic parameters (streamlined object creation)
      const diagnosticParams = {
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
        whmcsService: req.whmcsService
      };

      // Step 3: Run diagnostic workflow
      const diagnosticTimer = performanceMonitor.startTimer('diagnostic_workflow');
      const result = await this.manager.diagnoseWordPressDatabase(diagnosticParams);
      diagnosticTimer.end();

      // Add performance information
      const totalTime = Date.now() - startTime;
      result.performance = {
        totalTime,
        cached: false,
        breakdown: performanceMonitor.getSummary()
      };

      // Cache successful results only
      if (result.success) {
        const cacheTimer = performanceMonitor.startTimer('cache_store');
        diagnosticCache.set(cacheKey, {
          data: { ...result },
          timestamp: Date.now()
        });
        cacheTimer.end();
      }

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