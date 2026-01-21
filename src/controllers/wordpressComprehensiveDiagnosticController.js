const Joi = require('joi');
const CpanelCredentialResolver = require('../services/cpanelCredentialResolver');
const WordPressDiagnosticManager = require('../services/wordpressDiagnosticManager');
const { normalizePhone } = require('../utils/phoneNormalizer');

/**
 * WordPress Comprehensive Diagnostic Controller
 * Implements L1/L2/L3 classification system for WordPress issues with remediation
 */
class WordPressComprehensiveDiagnosticController {
  constructor() {
    this.credentialResolver = new CpanelCredentialResolver();
    this.diagnosticManager = new WordPressDiagnosticManager();
    
    // Bind methods
    this.diagnoseWordPressSite = this.diagnoseWordPressSite.bind(this);
  }

  /**
   * Validation schema for diagnostic request
   */
  get diagnosticSchema() {
    return Joi.object({
      domain: Joi.string().domain().required(),
      phone: Joi.string().optional(),
      frontend_accessible: Joi.boolean().allow(null).optional(),
      admin_accessible: Joi.boolean().allow(null).optional(),
      error_visible: Joi.boolean().allow(null).optional(),
      recent_changes: Joi.boolean().allow(null).optional()
    });
  }

  /**
   * Main WordPress Comprehensive Diagnostic Endpoint
   * POST /wordpress/diagnose-comprehensive
   */
  async diagnoseWordPressSite(req, res) {
    const startTime = Date.now();
    
    try {
      // Validate request body
      const { error, value } = this.diagnosticSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details.map(d => d.message).join(', '),
          timestamp: new Date().toISOString()
        });
      }

      // Normalize phone number if provided
      let normalizedPhone = null;
      if (value.phone) {
        try {
          normalizedPhone = normalizePhone(value.phone);
        } catch (phoneError) {
          return res.status(400).json({
            success: false,
            error: 'PHONE_VALIDATION_ERROR',
            message: `Invalid phone number: ${phoneError.message}`,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Resolve client credentials (optional for basic diagnostics)
      let cpanelCredentials = null;
      try {
        const credentialResult = await this.credentialResolver.resolveCpanelCredentials(
          value.domain,
          null, // email not provided
          normalizedPhone
        );

        if (credentialResult.success) {
          cpanelCredentials = credentialResult.cpanelCredentials;
        } else {
          // Log but continue without credentials for basic diagnostic
          console.log(`Client credentials not found for ${value.domain}, continuing with basic diagnostic`);
        }
      } catch (credentialError) {
        // Log but continue without credentials for basic diagnostic
        console.log(`Credential resolution error for ${value.domain}: ${credentialError.message}`);
      }

      // Perform comprehensive WordPress diagnostic (GENERAL HEALTH with remediation)
      const diagnosticResult = await this.diagnosticManager.performComprehensiveDiagnostic({
        domain: value.domain,
        cpanelCredentials,
        userInput: {
          wordpress_path: 'public_html', // Default path for comprehensive diagnostic
          remediation_enabled: true, // Enable remediation for comprehensive diagnostic
          guards: {
            whmcs_product: false, // Skip WHMCS checks for comprehensive
            dns_check: true,
            wordpress_installation: true
          },
          frontend_accessible: value.frontend_accessible,
          admin_accessible: value.admin_accessible,
          error_visible: value.error_visible,
          recent_changes: value.recent_changes
        }
      });

      // Return diagnostic results
      const response = {
        success: true,
        domain: value.domain,
        client: cpanelCredentials ? {
          phone: normalizedPhone,
          server: cpanelCredentials.host,
          username: cpanelCredentials.username
        } : {
          phone: normalizedPhone,
          server: null,
          username: null,
          note: 'Client credentials not found - basic diagnostic only'
        },
        diagnostic: diagnosticResult,
        sql_connection_available: !!cpanelCredentials,
        sql_connection_status: diagnosticResult.phases?.phase5?.db_connection_test?.success || false,
        // Add remediation information
        remediation_performed: !!(diagnosticResult.phases?.phase5?.user_management),
        database_user_created: diagnosticResult.phases?.phase5?.user_management?.userCreated || false,
        wp_config_updated: diagnosticResult.phases?.phase5?.user_management?.wpConfigUpdated || false,
        connection_restored: diagnosticResult.phases?.phase5?.db_connection || false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      };

      return res.status(200).json(response);

    } catch (error) {
      console.error('WordPress comprehensive diagnostic error:', error);
      
      return res.status(500).json({
        success: false,
        error: 'DIAGNOSTIC_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }
  }
}

module.exports = new WordPressComprehensiveDiagnosticController();