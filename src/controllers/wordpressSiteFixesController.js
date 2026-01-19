const Joi = require('joi');
const WordPressSiteFixes = require('../services/wordpressSiteFixes');
const CpanelCredentialResolver = require('../services/cpanelCredentialResolver');
const CpanelClient = require('../lib/cpanel');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * WordPress Site Fixes Controller
 * Handles API endpoints for WordPress site fixes
 */
class WordPressSiteFixesController {
  constructor() {
    this.siteFixes = new WordPressSiteFixes();
    this.credentialResolver = new CpanelCredentialResolver();
    
    // Bind methods
    this.deactivatePlugin = this.deactivatePlugin.bind(this);
    this.increaseMemory = this.increaseMemory.bind(this);
    this.fixHtaccess = this.fixHtaccess.bind(this);
    this.autoFix = this.autoFix.bind(this);
  }

  /**
   * Validation schemas
   */
  get schemas() {
    return {
      deactivatePlugin: Joi.object({
        domain: Joi.string().domain().required(),
        email: Joi.string().email().optional(),
        phone: Joi.string().optional(),
        pluginName: Joi.string().required(),
        docRoot: Joi.string().default('public_html')
      }),
      
      increaseMemory: Joi.object({
        domain: Joi.string().domain().required(),
        email: Joi.string().email().optional(),
        phone: Joi.string().optional(),
        memoryLimit: Joi.string().pattern(/^\d+M$/).default('256M'),
        method: Joi.string().valid('php_ini', 'wp_config').default('php_ini'),
        docRoot: Joi.string().default('public_html')
      }),
      
      fixHtaccess: Joi.object({
        domain: Joi.string().domain().required(),
        email: Joi.string().email().optional(),
        phone: Joi.string().optional(),
        backup: Joi.boolean().default(true),
        docRoot: Joi.string().default('public_html')
      }),
      
      autoFix: Joi.object({
        domain: Joi.string().domain().required(),
        email: Joi.string().email().optional(),
        phone: Joi.string().optional(),
        docRoot: Joi.string().default('public_html'),
        memoryLimit: Joi.string().pattern(/^\d+M$/).default('256M'),
        memoryMethod: Joi.string().valid('php_ini', 'wp_config').default('php_ini'),
        deactivatePlugin: Joi.boolean().default(true),
        applyDefaultFix: Joi.boolean().default(true)
      })
    };
  }

  /**
   * Resolve cPanel credentials and create client
   */
  async resolveCpanelClient(domain, email, phone) {
    const credentialResult = await this.credentialResolver.resolveCpanelCredentials(
      domain,
      email,
      phone
    );

    if (!credentialResult.success) {
      throw new Error(credentialResult.error || 'Failed to resolve cPanel credentials');
    }

    // Get WHM API key
    const serverName = this.extractServerName(credentialResult.cpanelCredentials.host);
    const whmService = require('../services/whmService');
    const whmApiKey = whmService.serverApiKeys?.[serverName.toLowerCase()];
    
    if (!whmApiKey) {
      throw new Error(`No WHM API key found for server: ${serverName}`);
    }

    return new CpanelClient(
      credentialResult.cpanelCredentials.host,
      credentialResult.cpanelCredentials.username,
      whmApiKey,
      2087
    );
  }

  /**
   * Extract server name from host
   */
  extractServerName(host) {
    const match = host.match(/^([^.]+)/);
    return match ? match[1] : host;
  }

  /**
   * Branch A: Deactivate Plugin
   * POST /wordpress/fix/deactivate-plugin
   */
  async deactivatePlugin(req, res) {
    const startTime = Date.now();
    
    try {
      const { error, value } = this.schemas.deactivatePlugin.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details.map(d => d.message).join(', '),
          timestamp: new Date().toISOString()
        });
      }

      const cpanelClient = await this.resolveCpanelClient(
        value.domain,
        value.email,
        value.phone
      );

      const result = await this.siteFixes.deactivatePlugin(
        cpanelClient,
        value.docRoot,
        value.pluginName
      );

      result.timestamp = new Date().toISOString();
      result.domain = value.domain;
      result.totalDuration = Date.now() - startTime;

      return res.status(result.success ? 200 : 400).json(result);

    } catch (error) {
      return res.status(500).json({
        success: false,
        action: 'plugin_deactivation',
        error: 'SYSTEM_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Branch B: Increase Memory Limit
   * POST /wordpress/fix/increase-memory
   */
  async increaseMemory(req, res) {
    const startTime = Date.now();
    
    try {
      const { error, value } = this.schemas.increaseMemory.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details.map(d => d.message).join(', '),
          timestamp: new Date().toISOString()
        });
      }

      const cpanelClient = await this.resolveCpanelClient(
        value.domain,
        value.email,
        value.phone
      );

      const result = await this.siteFixes.increaseMemoryLimit(
        cpanelClient,
        value.docRoot,
        value.memoryLimit,
        value.method
      );

      result.timestamp = new Date().toISOString();
      result.domain = value.domain;
      result.totalDuration = Date.now() - startTime;

      return res.status(result.success ? 200 : 400).json(result);

    } catch (error) {
      return res.status(500).json({
        success: false,
        action: 'memory_increase',
        error: 'SYSTEM_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Branch C: Fix .htaccess
   * POST /wordpress/fix/htaccess
   */
  async fixHtaccess(req, res) {
    const startTime = Date.now();
    
    try {
      const { error, value } = this.schemas.fixHtaccess.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details.map(d => d.message).join(', '),
          timestamp: new Date().toISOString()
        });
      }

      const cpanelClient = await this.resolveCpanelClient(
        value.domain,
        value.email,
        value.phone
      );

      const result = await this.siteFixes.fixHtaccess(
        cpanelClient,
        value.docRoot,
        value.backup
      );

      result.timestamp = new Date().toISOString();
      result.domain = value.domain;
      result.totalDuration = Date.now() - startTime;

      return res.status(result.success ? 200 : 400).json(result);

    } catch (error) {
      return res.status(500).json({
        success: false,
        action: 'htaccess_fix',
        error: 'SYSTEM_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Auto-diagnose and fix
   * POST /wordpress/fix/auto
   */
  async autoFix(req, res) {
    const startTime = Date.now();
    
    try {
      const { error, value } = this.schemas.autoFix.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details.map(d => d.message).join(', '),
          timestamp: new Date().toISOString()
        });
      }

      const cpanelClient = await this.resolveCpanelClient(
        value.domain,
        value.email,
        value.phone
      );

      const result = await this.siteFixes.autoFix(
        cpanelClient,
        value.docRoot,
        {
          memoryLimit: value.memoryLimit,
          memoryMethod: value.memoryMethod,
          deactivatePlugin: value.deactivatePlugin,
          applyDefaultFix: value.applyDefaultFix
        }
      );

      result.timestamp = new Date().toISOString();
      result.domain = value.domain;
      result.totalDuration = Date.now() - startTime;

      return res.status(result.success ? 200 : 400).json(result);

    } catch (error) {
      return res.status(500).json({
        success: false,
        action: 'auto_fix',
        error: 'SYSTEM_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }
  }
}

module.exports = new WordPressSiteFixesController();
