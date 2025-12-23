/**
 * WordPress Database Diagnostic API - Usage Examples
 * 
 * This file demonstrates various use cases for the WordPress diagnostic system.
 */

const axios = require('axios');

// Base URL for the API
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Example 1: Quick Connection Test
 * 
 * Use this for a fast check of database connectivity without full diagnosis.
 */
async function quickConnectionTest() {
  try {
    console.log('Running quick connection test...');
    
    const response = await axios.post(`${API_BASE_URL}/wordpress/quick-test`, {
      domain: 'example.com',
      email: 'client@example.com' // Client identification
    });

    console.log('Quick test result:', response.data);
    
    if (response.data.success) {
      console.log('✓ Database connection is working');
    } else {
      console.log('✗ Database connection failed');
      console.log('Root cause:', response.data.data.rootCause);
    }
    
    return response.data;
  } catch (error) {
    console.error('Quick test error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 2: Full Diagnostic Without Remediation
 * 
 * Diagnose issues using safe default settings.
 */
async function diagnosticOnly() {
  try {
    console.log('Running full diagnostic with safe defaults...');
    
    const response = await axios.post(`${API_BASE_URL}/wordpress/diagnose`, {
      domain: 'example.com',
      email: 'client@example.com' // Client identification
    });

    console.log('Diagnostic result:', JSON.stringify(response.data, null, 2));
    
    // Check each workflow step
    const workflow = response.data.data.workflow;
    
    console.log('\n=== Guard Checks ===');
    console.log('Passed:', workflow.guards.passed);
    
    console.log('\n=== Configuration ===');
    console.log('Database:', workflow.parser.config.database);
    console.log('User:', workflow.parser.config.user);
    console.log('Host:', workflow.parser.config.host);
    
    console.log('\n=== Diagnosis ===');
    console.log('Connection:', workflow.diagnosis.basicDiagnosis.connectionTest.success ? 'SUCCESS' : 'FAILED');
    
    if (!workflow.diagnosis.basicDiagnosis.connectionTest.success) {
      console.log('Root Cause:', workflow.diagnosis.basicDiagnosis.rootCause.cause);
      console.log('Recommendations:');
      workflow.diagnosis.basicDiagnosis.recommendations.forEach(rec => {
        console.log('  -', rec);
      });
    }
    
    return response.data;
  } catch (error) {
    console.error('Diagnostic error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 3: Full Diagnostic With Safe Remediation
 * 
 * Diagnose and attempt safe fixes using default settings.
 */
async function diagnosticWithSafeRemediation() {
  try {
    console.log('Running diagnostic with safe remediation defaults...');
    
    const response = await axios.post(`${API_BASE_URL}/wordpress/diagnose`, {
      domain: 'example.com',
      phone: '+1234567890' // Alternative client identification
    });

    console.log('Remediation result:', JSON.stringify(response.data, null, 2));
    
    if (response.data.data.workflow.remediation) {
      const remediation = response.data.data.workflow.remediation;
      
      console.log('\n=== Remediation Results ===');
      console.log('Success:', remediation.success);
      console.log('Actions attempted:', remediation.actionsAttempted.length);
      
      remediation.results.forEach(result => {
        console.log(`\n${result.action}:`);
        console.log('  Status:', result.success ? 'SUCCESS' : 'FAILED');
        console.log('  Message:', result.message);
      });
    }
    
    return response.data;
  } catch (error) {
    console.error('Remediation error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 4: Full Diagnostic With All Remediations Approved
 * 
 * Diagnose and attempt all available fixes including destructive actions.
 * USE WITH CAUTION!
 */
async function diagnosticWithFullRemediation() {
  try {
    console.log('Running diagnostic with FULL remediation (CAUTION!)...');
    
    const response = await axios.post(`${API_BASE_URL}/wordpress/diagnose`, {
      domain: 'example.com',
      cpanelHost: 'cpanel.example.com',
      cpanelUsername: 'username',
      cpanelPassword: 'password',
      whmHost: 'whm.example.com',      // WHM access for service restart
      whmUsername: 'root',
      whmPassword: 'whmpassword',
      enableRemediation: true,
      approveServiceRestart: true,     // ⚠️ CAUTION: Will restart MySQL
      approveTableRepair: true,        // ⚠️ CAUTION: Will repair tables
      approveKillConnections: true     // ⚠️ CAUTION: Will kill connections
    });

    console.log('Full remediation result:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('Full remediation error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 5: Diagnostic With Custom WordPress Path
 * 
 * For WordPress installations in non-standard locations.
 */
async function diagnosticCustomPath() {
  try {
    console.log('Running diagnostic for custom WordPress path...');
    
    const response = await axios.post(`${API_BASE_URL}/wordpress/diagnose`, {
      domain: 'example.com',
      cpanelHost: 'cpanel.example.com',
      cpanelUsername: 'username',
      cpanelPassword: 'password',
      wpPath: 'public_html/blog',                    // Custom WordPress directory
      wpConfigPath: 'public_html/blog/wp-config.php' // Custom wp-config.php path
    });

    console.log('Custom path diagnostic:', response.data);
    
    return response.data;
  } catch (error) {
    console.error('Custom path error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 6: Skip Guards for Testing
 * 
 * Useful when you want to test database connection without validating
 * WHMCS products or DNS configuration.
 */
async function diagnosticSkipGuards() {
  try {
    console.log('Running diagnostic with guards skipped...');
    
    const response = await axios.post(`${API_BASE_URL}/wordpress/diagnose`, {
      domain: 'example.com',
      cpanelHost: 'cpanel.example.com',
      cpanelUsername: 'username',
      cpanelPassword: 'password',
      skipGuards: true  // Skip WHMCS and DNS checks
    });

    console.log('Diagnostic (no guards):', response.data);
    
    return response.data;
  } catch (error) {
    console.error('Skip guards error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 7: Check Service Capabilities
 * 
 * Discover what features are available.
 */
async function checkCapabilities() {
  try {
    console.log('Checking service capabilities...');
    
    const response = await axios.get(`${API_BASE_URL}/wordpress/capabilities`);
    
    console.log('Available capabilities:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('Capabilities error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 8: Health Check
 * 
 * Monitor service health.
 */
async function healthCheck() {
  try {
    console.log('Checking service health...');
    
    const response = await axios.get(`${API_BASE_URL}/wordpress/health`);
    
    console.log('Service health:', response.data);
    
    if (response.data.data.status === 'healthy') {
      console.log('✓ Service is healthy');
    } else {
      console.log('✗ Service has issues');
    }
    
    return response.data;
  } catch (error) {
    console.error('Health check error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 9: Automated Monitoring Script
 * 
 * Periodically check WordPress database health and alert on issues.
 */
async function monitoringScript(domains) {
  console.log('Starting WordPress database monitoring...');
  
  const results = {
    healthy: [],
    unhealthy: [],
    errors: []
  };
  
  for (const config of domains) {
    try {
      console.log(`\nChecking ${config.domain}...`);
      
      const response = await axios.post(`${API_BASE_URL}/wordpress/quick-test`, {
        cpanelHost: config.cpanelHost,
        cpanelUsername: config.cpanelUsername,
        cpanelPassword: config.cpanelPassword,
        wpConfigPath: config.wpConfigPath
      });
      
      if (response.data.success) {
        results.healthy.push(config.domain);
        console.log(`✓ ${config.domain} - Healthy`);
      } else {
        results.unhealthy.push({
          domain: config.domain,
          issue: response.data.data.rootCause
        });
        console.log(`✗ ${config.domain} - ${response.data.data.rootCause.cause}`);
      }
      
    } catch (error) {
      results.errors.push({
        domain: config.domain,
        error: error.message
      });
      console.error(`✗ ${config.domain} - Error: ${error.message}`);
    }
  }
  
  console.log('\n=== Monitoring Summary ===');
  console.log(`Healthy: ${results.healthy.length}`);
  console.log(`Unhealthy: ${results.unhealthy.length}`);
  console.log(`Errors: ${results.errors.length}`);
  
  // Alert if any issues found
  if (results.unhealthy.length > 0 || results.errors.length > 0) {
    console.log('\n⚠️ ALERT: Issues detected!');
    
    if (results.unhealthy.length > 0) {
      console.log('\nUnhealthy databases:');
      results.unhealthy.forEach(item => {
        console.log(`  - ${item.domain}: ${item.issue.cause}`);
      });
    }
    
    if (results.errors.length > 0) {
      console.log('\nErrors:');
      results.errors.forEach(item => {
        console.log(`  - ${item.domain}: ${item.error}`);
      });
    }
  }
  
  return results;
}

/**
 * Example 10: Batch Diagnostic with Remediation
 * 
 * Run diagnostics on multiple sites and attempt to fix issues.
 */
async function batchDiagnosticWithRemediation(domains) {
  console.log('Starting batch diagnostic with remediation...');
  
  const results = [];
  
  for (const config of domains) {
    try {
      console.log(`\n=== Processing ${config.domain} ===`);
      
      const response = await axios.post(`${API_BASE_URL}/wordpress/diagnose`, {
        domain: config.domain,
        cpanelHost: config.cpanelHost,
        cpanelUsername: config.cpanelUsername,
        cpanelPassword: config.cpanelPassword,
        enableRemediation: true,
        approveTableRepair: config.approveTableRepair || false
      });
      
      results.push({
        domain: config.domain,
        success: response.data.success,
        status: response.data.data.summary.status,
        message: response.data.data.summary.message
      });
      
      console.log(`Status: ${response.data.data.summary.status}`);
      console.log(`Message: ${response.data.data.summary.message}`);
      
    } catch (error) {
      results.push({
        domain: config.domain,
        success: false,
        error: error.message
      });
      console.error(`Error: ${error.message}`);
    }
  }
  
  console.log('\n=== Batch Results ===');
  results.forEach(result => {
    const status = result.success ? '✓' : '✗';
    console.log(`${status} ${result.domain}: ${result.status || result.error}`);
  });
  
  return results;
}

// Export examples for use in other scripts
module.exports = {
  quickConnectionTest,
  diagnosticOnly,
  diagnosticWithSafeRemediation,
  diagnosticWithFullRemediation,
  diagnosticCustomPath,
  diagnosticSkipGuards,
  checkCapabilities,
  healthCheck,
  monitoringScript,
  batchDiagnosticWithRemediation
};

// Run examples if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const example = args[0] || 'health';
  
  const examples = {
    'quick': quickConnectionTest,
    'diagnostic': diagnosticOnly,
    'safe-fix': diagnosticWithSafeRemediation,
    'full-fix': diagnosticWithFullRemediation,
    'custom-path': diagnosticCustomPath,
    'skip-guards': diagnosticSkipGuards,
    'capabilities': checkCapabilities,
    'health': healthCheck
  };
  
  if (examples[example]) {
    examples[example]()
      .then(() => console.log('\n✓ Example completed'))
      .catch(err => console.error('\n✗ Example failed:', err.message));
  } else {
    console.log('Available examples:');
    Object.keys(examples).forEach(key => {
      console.log(`  - ${key}`);
    });
    console.log('\nUsage: node examples/wordpress-diagnostic-examples.js [example-name]');
  }
}