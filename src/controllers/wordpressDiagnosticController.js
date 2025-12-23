const Joi = require('joi');
const WordPressDiagnosticManager = require('../services/wordpressDiagnosticManager');
const CpanelCredentialResolver = require('../services/cpanelCredentialResolver');

// Validation schemas
const diagnosticSchema = Joi.object({
  domain: Joi.string().domain().required(),
  
  // Client identification (either email or phone required)
  email: Joi.string().email().optional(),
  phone: Joi.string().optional()
}).or('email', 'phone'); // Require either email or phone

const quickTestSchema = Joi.object({
  domain: Joi.string().domain().required(),
  
  // Client identification (either email or phone required)
  email: Joi.string().email().optional(),
  phone: Joi.string().optional()
}).or('email', 'phone'); // Require either email or phone

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
    try {
      // Validate request
      const { error, value } = diagnosticSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      // Step 1: Resolve cPanel credentials from domain and client info
      console.log(`🔍 Resolving cPanel credentials for domain: ${value.domain}`);
      const credentialResult = await this.credentialResolver.resolveCpanelCredentials(
        value.domain,
        value.email,
        value.phone
      );

      if (!credentialResult.success) {
        return res.status(404).json({
          success: false,
          error: 'Unable to resolve cPanel credentials',
          message: credentialResult.error,
          details: {
            domain: value.domain,
            clientLookup: credentialResult.clientInfo ? 'found' : 'not_found',
            serverLookup: credentialResult.serverInfo ? 'found' : 'not_found'
          }
        });
      }

      console.log(`✅ Successfully resolved cPanel credentials for ${value.domain}`);

      // Step 2: Prepare diagnostic parameters with resolved credentials and default settings
      const diagnosticParams = {
        domain: value.domain,
        clientId: credentialResult.clientInfo?.id, // Pass client ID for WHMCS checks
        cpanelHost: credentialResult.cpanelCredentials.host,
        cpanelUsername: credentialResult.cpanelCredentials.username,
        cpanelPassword: credentialResult.cpanelCredentials.password,
        cpanelPort: credentialResult.cpanelCredentials.port,
        serverName: credentialResult.serverInfo?.serverName, // Pass server name for WHM API key lookup
        
        // Use default settings for WordPress configuration
        wpPath: 'public_html',
        wpConfigPath: 'public_html/wp-config.php',
        
        // Use default settings for guards and remediation
        skipGuards: false,
        expectedIp: null,
        enableRemediation: true,
        approveServiceRestart: false,
        approveTableRepair: false,
        approveKillConnections: false
      };

      // Add WHMCS service if available (from existing services)
      if (req.whmcsService) {
        diagnosticParams.whmcsService = req.whmcsService;
      }

      // Step 3: Run diagnostic workflow
      const result = await this.manager.diagnoseWordPressDatabase(diagnosticParams);

      // Add credential resolution info to result
      result.credentialResolution = {
        success: true,
        clientInfo: {
          id: credentialResult.clientInfo?.id,
          email: credentialResult.clientInfo?.email,
          name: `${credentialResult.clientInfo?.firstname} ${credentialResult.clientInfo?.lastname}`.trim()
        },
        serverInfo: {
          name: credentialResult.serverInfo?.serverName,
          hostname: credentialResult.serverInfo?.hostname
        }
      };

      // Return appropriate status code
      const statusCode = result.success ? 200 : 
                        (result.summary?.status === 'FAILED_GUARDS' ? 412 : 500);

      return res.status(statusCode).json({
        success: result.success,
        data: result,
        message: result.summary?.message || 'Diagnostic completed'
      });

    } catch (error) {
      console.error('WordPress diagnostic error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Quick connection test (lightweight)
   */
  async quickTest(req, res) {
    try {
      // Validate request
      const { error, value } = quickTestSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      // Step 1: Resolve cPanel credentials
      console.log(`🔍 Resolving cPanel credentials for quick test: ${value.domain}`);
      const credentialResult = await this.credentialResolver.resolveCpanelCredentials(
        value.domain,
        value.email,
        value.phone
      );

      if (!credentialResult.success) {
        return res.status(404).json({
          success: false,
          error: 'Unable to resolve cPanel credentials',
          message: credentialResult.error,
          type: 'CREDENTIAL_RESOLUTION_ERROR'
        });
      }

      // Step 2: Run quick test with resolved credentials and default settings
      const quickTestParams = {
        cpanelHost: credentialResult.cpanelCredentials.host,
        cpanelUsername: credentialResult.cpanelCredentials.username,
        cpanelPassword: credentialResult.cpanelCredentials.password,
        cpanelPort: credentialResult.cpanelCredentials.port,
        wpConfigPath: 'public_html/wp-config.php' // Use default path
      };

      const result = await this.manager.quickConnectionTest(quickTestParams);

      // Add credential resolution info
      result.credentialResolution = {
        success: true,
        clientInfo: credentialResult.clientInfo,
        serverInfo: credentialResult.serverInfo
      };

      return res.status(result.success ? 200 : 500).json({
        success: result.success,
        data: result,
        message: result.success ? 'Connection test passed' : 'Connection test failed'
      });

    } catch (error) {
      console.error('WordPress quick test error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Get diagnostic capabilities and requirements
   */
  async getCapabilities(req, res) {
    try {
      const capabilities = {
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

      return res.json({
        success: true,
        data: capabilities,
        message: 'WordPress diagnostic capabilities'
      });

    } catch (error) {
      console.error('Get capabilities error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Health check for the diagnostic service
   */
  async healthCheck(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          mysql: 'available',
          cpanel: 'available',
          whm: 'optional',
          whmcs: 'optional'
        },
        version: '1.0.0'
      };

      return res.json({
        success: true,
        data: health,
        message: 'WordPress diagnostic service is healthy'
      });

    } catch (error) {
      console.error('Health check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Service unhealthy',
        message: error.message
      });
    }
  }
}

module.exports = new WordPressDiagnosticController();