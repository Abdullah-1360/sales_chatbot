/**
 * Domain Controller
 * Handles domain availability checks and suggestions
 */

const Joi = require('joi');
const { getDomainAvailability } = require('../services/domainService');

/* ---------- validation schema ---------- */
const domainSchema = Joi.object({
  domain: Joi.string()
    .pattern(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/)
    .required()
    .messages({
      'string.pattern.base': 'Please provide a valid domain name (e.g., example.com)',
      'any.required': 'Domain name is required'
    })
});

/* ---------- main controller ---------- */
exports.checkAvailability = async (req, res, next) => {
  console.log('🌐 Domain availability request:', req.body);
  
  try {
    // Validate input
    const { domain } = await domainSchema.validateAsync(req.body);
    
    // Normalize domain (lowercase, trim)
    const normalizedDomain = domain.toLowerCase().trim();
    
    // Check availability
    const result = await getDomainAvailability(normalizedDomain);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Domain check failed',
        error: result.error
      });
    }
    
    // Format response
    const response = {
      success: true,
      domain: result.domain,
      available: result.available,
      message: result.message
    };
    
    // Add suggestions if domain is not available
    if (!result.available && result.suggestions.length > 0) {
      response.suggestions = result.suggestions;
      response.suggestionsCount = result.suggestions.length;
    }
    
    // Log result
    if (result.available) {
      console.log(`✅ ${result.domain} is available`);
    } else {
      console.log(`❌ ${result.domain} is taken, suggested ${result.suggestions.length} alternatives`);
    }
    
    res.json(response);
    
  } catch (error) {
    if (error.isJoi) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
        field: error.details[0].path[0]
      });
    }
    
    console.error('❌ Domain controller error:', error);
    next(error);
  }
};

/* ---------- bulk check controller ---------- */
exports.checkMultiple = async (req, res, next) => {
  console.log('🌐 Bulk domain check request:', req.body);
  
  try {
    const bulkSchema = Joi.object({
      domains: Joi.array()
        .items(Joi.string().pattern(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/))
        .min(1)
        .max(10)
        .required()
        .messages({
          'array.min': 'At least 1 domain is required',
          'array.max': 'Maximum 10 domains allowed per request'
        })
    });
    
    const { domains } = await bulkSchema.validateAsync(req.body);
    
    // Normalize domains
    const normalizedDomains = domains.map(d => d.toLowerCase().trim());
    
    // Check all domains
    const { checkMultipleDomains } = require('../services/domainService');
    const results = await checkMultipleDomains(normalizedDomains);
    
    // Format response
    const response = {
      success: true,
      results: results.map(result => ({
        domain: result.domain,
        available: result.available,
        message: result.message || (result.available ? 'Available' : 'Not available')
      })),
      totalChecked: results.length,
      availableCount: results.filter(r => r.available).length
    };
    
    console.log(`✅ Bulk check completed: ${response.availableCount}/${response.totalChecked} available`);
    
    res.json(response);
    
  } catch (error) {
    if (error.isJoi) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }
    
    console.error('❌ Bulk domain controller error:', error);
    next(error);
  }
};