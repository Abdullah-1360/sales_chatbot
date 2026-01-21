const Joi = require('joi');
const CpanelCredentialResolver = require('../services/cpanelCredentialResolver');
const WordPressDiagnosticManager = require('../services/wordpressDiagnosticManager');
const { normalizePhone } = require('../utils/phoneNormalizer');

/**
 * WordPress Diagnostic Controller
 * Handles basic WordPress diagnostic endpoints
 */
class WordPressDiagnosticController {
  constructor() {
    this.credentialResolver = new CpanelCredentialResolver();
    this.diagnosticManager = new WordPressDiagnosticManager();
    
    // Bind methods
    this.diagnoseDatabase = this.diagnoseDatabase.bind(this);
    this.quickTest = this.quickTest.bind(this);
    this.getCapabilities = this.getCapabilities.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
  }

  /**
   * Input validation schema for diagnose endpoint
   */
  getDiagnoseSchema() {
    return Joi.object({
      domain: Joi.string().domain().required(),
      email: Joi.string().email().optional(),
      phone: Joi.string().optional(),
      wordpress_path: Joi.string().default('public_html'),
      remediation: Joi.boolean().default(true),
      guards: Joi.object({
        whmcs_product: Joi.boolean().default(true),
        dns_check: Joi.boolean().default(true),
        wordpress_installation: Joi.boolean().default(true)
      }).default()
    }).custom((value, helpers) => {
      if (!value.email && !value.phone) {
        return helpers.error('any.required', { 
          message: 'Either email or phone is required for client identification' 
        });
      }
      return value;
    });
  }

  /**
   * Main WordPress Database Diagnostic Endpoint
   * POST /wordpress/diagnose
   * 
   * Focuses specifically on database connection testing and remediation
   */
  async diagnoseDatabase(req, res) {
    const startTime = Date.now();
    
    try {
      // Validate input
      const schema = this.getDiagnoseSchema();
      const { error, value } = schema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      // Normalize phone if provided
      if (value.phone) {
        value.phone = normalizePhone(value.phone);
      }

      // Resolve cPanel credentials - REQUIRED for database operations
      let credentialResult = null;
      try {
        credentialResult = await this.credentialResolver.resolveCpanelCredentials(
          value.domain,
          value.email,
          value.phone
        );
        
        if (!credentialResult.success) {
          return res.status(400).json({
            success: false,
            error: 'CREDENTIAL_RESOLUTION_FAILED',
            message: credentialResult.error || 'Could not resolve cPanel credentials',
            duration: `${Date.now() - startTime}ms`
          });
        }
      } catch (credError) {
        console.error('Credential resolution failed:', credError);
        return res.status(400).json({
          success: false,
          error: 'CREDENTIAL_RESOLUTION_ERROR',
          message: credError.message,
          duration: `${Date.now() - startTime}ms`
        });
      }

      // Perform DATABASE-FOCUSED diagnostic (Phase 5 only with remediation)
      const diagnosticResult = await this.diagnosticManager.performDatabaseDiagnostic({
        domain: value.domain,
        cpanelCredentials: credentialResult.cpanelCredentials,
        userInput: {
          wordpress_path: value.wordpress_path,
          remediation_enabled: value.remediation,
          guards: value.guards
        }
      });

      const duration = Date.now() - startTime;

      return res.json({
        success: true,
        domain: value.domain,
        client: {
          id: credentialResult.clientInfo?.id,
          email: credentialResult.clientInfo?.email,
          phone: credentialResult.clientInfo?.phonenumber,
          resolvedFrom: credentialResult.resolvedFrom
        },
        server: {
          name: credentialResult.serverInfo?.serverName,
          hostname: credentialResult.serverInfo?.hostname
        },
        diagnostic: diagnosticResult,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('WordPress database diagnostic error:', error);
      
      return res.status(500).json({
        success: false,
        error: 'DATABASE_DIAGNOSTIC_FAILED',
        message: error.message,
        duration: `${Date.now() - startTime}ms`
      });
    }
  }

  /**
   * Quick Test Endpoint
   * POST /wordpress/quick-test
   */
  async quickTest(req, res) {
    const startTime = Date.now();
    
    try {
      // Validate input
      const schema = Joi.object({
        domain: Joi.string().domain().required(),
        email: Joi.string().email().optional(),
        phone: Joi.string().optional()
      }).custom((value, helpers) => {
        if (!value.email && !value.phone) {
          return helpers.error('any.required', { 
            message: 'Either email or phone is required for client identification' 
          });
        }
        return value;
      });

      const { error, value } = schema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      // Normalize phone if provided
      if (value.phone) {
        value.phone = normalizePhone(value.phone);
      }

      // Resolve cPanel credentials
      let cpanelCredentials = null;
      try {
        cpanelCredentials = await this.credentialResolver.resolveCpanelCredentials(
          value.domain,
          value.email,
          value.phone
        );
      } catch (credError) {
        return res.status(400).json({
          success: false,
          error: 'Could not resolve cPanel credentials',
          message: credError.message,
          duration: `${Date.now() - startTime}ms`
        });
      }

      // Perform basic health check only
      const healthResult = await this.diagnosticManager.phase1_BasicHealthDetection(
        value.domain, 
        cpanelCredentials
      );

      const duration = Date.now() - startTime;

      return res.json({
        success: true,
        domain: value.domain,
        wordpress_detected: healthResult.wp_detected,
        wp_config_exists: healthResult.wp_config_exists,
        php_version: healthResult.php_version,
        server: healthResult.server,
        errors: healthResult.errors,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('WordPress quick test error:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Quick test failed',
        message: error.message,
        duration: `${Date.now() - startTime}ms`
      });
    }
  }

  /**
   * Get Capabilities Endpoint
   * GET /wordpress/capabilities
   */
  async getCapabilities(req, res) {
    try {
      const capabilities = {
        guards: {
          whmcs_product: 'Verify domain is associated with WHMCS product',
          dns_check: 'Verify DNS resolution and nameservers',
          wordpress_installation: 'Verify WordPress is installed'
        },
        diagnosis: {
          basic_health: 'WordPress detection and core file checks',
          symptom_classification: 'HTTP response analysis and error detection',
          isolation_tests: 'Plugin and theme conflict detection',
          core_integrity: 'WordPress core file verification and malware scan',
          database_health: 'Database connection and configuration analysis',
          security_scan: 'Security vulnerability and malware detection',
          resource_analysis: 'PHP configuration and error log analysis',
          diagnosis_mapping: 'L1/L2/L3 classification system'
        },
        remediation: {
          auto_plugin_fixes: 'Automatically disable problematic plugins',
          memory_increase: 'Increase PHP memory limits',
          htaccess_fixes: 'Fix .htaccess configuration',
          debug_enabling: 'Enable WordPress debug logging'
        },
        security: {
          non_destructive: 'All operations are safe and reversible',
          credential_resolution: 'Automatic cPanel credential lookup',
          malware_detection: 'Pattern-based malware scanning'
        }
      };

      return res.json({
        success: true,
        capabilities,
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get capabilities error:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Could not retrieve capabilities',
        message: error.message
      });
    }
  }

  /**
   * Health Check Endpoint
   * GET /wordpress/health
   */
  async healthCheck(req, res) {
    try {
      const health = {
        status: 'healthy',
        services: {
          diagnostic_manager: 'operational',
          credential_resolver: 'operational',
          cpanel_integration: 'operational'
        },
        timestamp: new Date().toISOString()
      };

      return res.json({
        success: true,
        health
      });

    } catch (error) {
      console.error('Health check error:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Health check failed',
        message: error.message
      });
    }
  }
}

module.exports = new WordPressDiagnosticController();