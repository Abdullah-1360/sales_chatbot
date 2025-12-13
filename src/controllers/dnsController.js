const { checkDNSPropagation, getDNSStatus, performComprehensiveDNSLookup } = require('../utils/dnsChecker');
const whmService = require('../services/whmService');

/**
 * Check DNS propagation and nameserver configuration
 * Helps diagnose "Site Down" vs "Propagation" issues
 */
exports.checkDNS = async (req, res, next) => {
  console.log('[POST /api/checkDNS]', { 
    domain: req.body.domain,
    clientId: req.body.clientId
  });
  
  try {
    const { domain } = req.body || {};
    
    if (!domain) {
      console.log('✗ Missing domain parameter');
      return res.status(400).json({ 
        success: false, 
        error: 'domain parameter required' 
      });
    }
    
    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      console.log('✗ Invalid domain format');
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid domain format' 
      });
    }
    
    console.log(`→ Checking DNS for: ${domain}`);
    
    // Perform comprehensive DNS check
    const result = await checkDNSPropagation(domain);
    
    console.log(`→ DNS Result: ${result.diagnosis} (Propagated: ${result.propagated}, Our NS: ${result.usesOurNameservers})`);
    
    return res.json(result);
    
  } catch (err) {
    console.log('✗ DNS check error:', err.message);
    next(err);
  }
};

/**
 * Quick DNS status check (simplified response)
 */
exports.getDNSStatus = async (req, res, next) => {
  console.log('[POST /api/dnsStatus]', { 
    domain: req.body.domain,
    clientId: req.body.clientId
  });
  
  try {
    const { domain } = req.body || {};
    
    if (!domain) {
      console.log('✗ Missing domain parameter');
      return res.status(400).json({ 
        success: false, 
        error: 'domain parameter required' 
      });
    }
    
    console.log(`→ Getting DNS status for: ${domain}`);
    
    // Get simplified DNS status
    const status = await getDNSStatus(domain);
    
    console.log(`→ DNS Status: ${status.diagnosis}`);
    
    return res.json({
      success: true,
      domain: domain,
      ...status
    });
    
  } catch (err) {
    console.log('✗ DNS status error:', err.message);
    next(err);
  }
};

/**
 * Comprehensive DNS record lookup (A, MX, NS) with server matching
 */
exports.comprehensiveDNSLookup = async (req, res, next) => {
  console.log('[POST /api/dns/comprehensive]', { 
    domain: req.body.domain,
    clientId: req.body.clientId
  });
  
  try {
    const { domain } = req.body || {};
    
    if (!domain) {
      console.log('✗ Missing domain parameter');
      return res.status(400).json({ 
        success: false, 
        error: 'domain parameter required' 
      });
    }
    
    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      console.log('✗ Invalid domain format');
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid domain format' 
      });
    }
    
    console.log(`→ Performing comprehensive DNS lookup for: ${domain}`);
    
    // Perform comprehensive DNS record lookup
    const result = await performComprehensiveDNSLookup(domain);
    
    console.log(`→ Comprehensive DNS completed for: ${domain}`);
    console.log(`→ A records match our servers: ${result.serverMatches.aRecordsMatchOurServers}`);
    console.log(`→ MX records match our servers: ${result.serverMatches.mxRecordsMatchOurServers}`);
    console.log(`→ NS records match our servers: ${result.serverMatches.nsRecordsMatchOurServers}`);
    
    return res.json({
      success: true,
      ...result
    });
    
  } catch (err) {
    console.log('✗ Comprehensive DNS lookup error:', err.message);
    next(err);
  }
};

module.exports = exports;