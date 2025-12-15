/**
 * Ping Service Utility
 * Provides domain connectivity testing and ping-based workflows
 */

const ping = require('ping');

/**
 * Ping a domain and return detailed connectivity information
 * @param {string} domain - Domain to ping
 * @param {object} options - Ping options
 * @returns {Promise<object>} - Ping result with connectivity status
 */
async function pingDomain(domain, options = {}) {
  console.log(`🏓 Pinging domain: ${domain}`);
  
  const pingOptions = {
    timeout: options.timeout || 10, // 10 seconds timeout
    extra: options.extra || ['-c', '4'], // Send 4 packets (Linux/Mac)
    ...options
  };
  
  try {
    const startTime = Date.now();
    const result = await ping.promise.probe(domain, pingOptions);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log(`→ Ping result for ${domain}:`, {
      alive: result.alive,
      host: result.host,
      numeric_host: result.numeric_host,
      time: result.time,
      min: result.min,
      max: result.max,
      avg: result.avg,
      stddev: result.stddev,
      packetLoss: result.packetLoss
    });
    
    return {
      domain: domain,
      alive: result.alive,
      reachable: result.alive,
      host: result.host,
      resolvedIP: result.numeric_host,
      responseTime: result.time,
      avgResponseTime: result.avg,
      minResponseTime: result.min,
      maxResponseTime: result.max,
      packetLoss: result.packetLoss || '0%',
      totalTestTime: totalTime,
      status: result.alive ? 'online' : 'offline',
      timestamp: new Date().toISOString(),
      rawResult: result
    };
    
  } catch (error) {
    console.log(`❌ Ping failed for ${domain}: ${error.message}`);
    
    return {
      domain: domain,
      alive: false,
      reachable: false,
      host: domain,
      resolvedIP: null,
      responseTime: null,
      avgResponseTime: null,
      minResponseTime: null,
      maxResponseTime: null,
      packetLoss: '100%',
      totalTestTime: Date.now() - Date.now(),
      status: 'unreachable',
      error: error.message,
      timestamp: new Date().toISOString(),
      rawResult: null
    };
  }
}

/**
 * Perform comprehensive connectivity test (ping + additional checks)
 * @param {string} domain - Domain to test
 * @param {object} options - Test options
 * @returns {Promise<object>} - Comprehensive connectivity result
 */
async function comprehensiveConnectivityTest(domain, options = {}) {
  console.log(`🔍 Performing comprehensive connectivity test for: ${domain}`);
  
  const results = {
    domain: domain,
    timestamp: new Date().toISOString(),
    tests: {},
    overall: {
      status: 'unknown',
      reachable: false,
      issues: [],
      recommendations: []
    }
  };
  
  try {
    // Test 1: Basic ping test
    console.log(`→ Test 1: Basic ping test`);
    const pingResult = await pingDomain(domain, options.ping);
    results.tests.ping = pingResult;
    
    // Test 2: HTTP connectivity test (optional)
    if (options.includeHTTP !== false) {
      console.log(`→ Test 2: HTTP connectivity test`);
      const httpResult = await testHTTPConnectivity(domain, options.http);
      results.tests.http = httpResult;
    }
    
    // Test 3: HTTPS connectivity test (optional)
    if (options.includeHTTPS !== false) {
      console.log(`→ Test 3: HTTPS connectivity test`);
      const httpsResult = await testHTTPSConnectivity(domain, options.https);
      results.tests.https = httpsResult;
    }
    
    // Analyze overall connectivity
    results.overall = analyzeConnectivityResults(results.tests);
    
    console.log(`✅ Comprehensive connectivity test completed for ${domain}`);
    console.log(`→ Overall status: ${results.overall.status}`);
    console.log(`→ Reachable: ${results.overall.reachable ? '✅' : '❌'}`);
    
    return results;
    
  } catch (error) {
    console.log(`❌ Comprehensive connectivity test failed for ${domain}: ${error.message}`);
    
    results.overall.status = 'error';
    results.overall.error = error.message;
    results.overall.issues.push(`Connectivity test failed: ${error.message}`);
    
    return results;
  }
}

/**
 * Test HTTP connectivity to domain
 * @param {string} domain - Domain to test
 * @param {object} options - HTTP test options
 * @returns {Promise<object>} - HTTP connectivity result
 */
async function testHTTPConnectivity(domain, options = {}) {
  const axios = require('axios');
  const url = `http://${domain}`;
  const timeout = options.timeout || 10000; // 10 seconds
  
  try {
    const startTime = Date.now();
    const response = await axios.get(url, {
      timeout: timeout,
      maxRedirects: 5,
      validateStatus: () => true // Accept any status code
    });
    const endTime = Date.now();
    
    return {
      url: url,
      reachable: true,
      statusCode: response.status,
      statusText: response.statusText,
      responseTime: endTime - startTime,
      headers: response.headers,
      redirected: response.request.res.responseUrl !== url,
      finalUrl: response.request.res.responseUrl,
      contentLength: response.headers['content-length'] || 0,
      contentType: response.headers['content-type'] || 'unknown'
    };
    
  } catch (error) {
    return {
      url: url,
      reachable: false,
      error: error.message,
      code: error.code,
      responseTime: null
    };
  }
}

/**
 * Test HTTPS connectivity to domain
 * @param {string} domain - Domain to test
 * @param {object} options - HTTPS test options
 * @returns {Promise<object>} - HTTPS connectivity result
 */
async function testHTTPSConnectivity(domain, options = {}) {
  const axios = require('axios');
  const https = require('https');
  const url = `https://${domain}`;
  const timeout = options.timeout || 10000; // 10 seconds
  
  try {
    const startTime = Date.now();
    const response = await axios.get(url, {
      timeout: timeout,
      maxRedirects: 5,
      validateStatus: () => true, // Accept any status code
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Allow self-signed certificates for testing
      })
    });
    const endTime = Date.now();
    
    return {
      url: url,
      reachable: true,
      statusCode: response.status,
      statusText: response.statusText,
      responseTime: endTime - startTime,
      headers: response.headers,
      redirected: response.request.res.responseUrl !== url,
      finalUrl: response.request.res.responseUrl,
      contentLength: response.headers['content-length'] || 0,
      contentType: response.headers['content-type'] || 'unknown',
      ssl: {
        valid: true // If we got here, SSL worked
      }
    };
    
  } catch (error) {
    return {
      url: url,
      reachable: false,
      error: error.message,
      code: error.code,
      responseTime: null,
      ssl: {
        valid: false,
        error: error.message
      }
    };
  }
}

/**
 * Analyze connectivity test results and determine overall status
 * @param {object} tests - Test results object
 * @returns {object} - Overall analysis
 */
function analyzeConnectivityResults(tests) {
  const analysis = {
    status: 'unknown',
    reachable: false,
    issues: [],
    recommendations: [],
    summary: ''
  };
  
  // Analyze ping results
  if (tests.ping) {
    if (tests.ping.alive) {
      analysis.reachable = true;
      analysis.status = 'online';
    } else {
      analysis.issues.push('Domain is not responding to ping');
      analysis.recommendations.push('Check if domain DNS is correctly configured');
    }
  }
  
  // Analyze HTTP results
  if (tests.http) {
    if (tests.http.reachable) {
      if (tests.http.statusCode >= 200 && tests.http.statusCode < 400) {
        analysis.status = 'online';
      } else if (tests.http.statusCode >= 400) {
        analysis.issues.push(`HTTP returns error status: ${tests.http.statusCode}`);
      }
    } else {
      analysis.issues.push('HTTP connection failed');
    }
  }
  
  // Analyze HTTPS results
  if (tests.https) {
    if (tests.https.reachable) {
      if (tests.https.statusCode >= 200 && tests.https.statusCode < 400) {
        analysis.status = 'online';
      } else if (tests.https.statusCode >= 400) {
        analysis.issues.push(`HTTPS returns error status: ${tests.https.statusCode}`);
      }
    } else {
      analysis.issues.push('HTTPS connection failed');
      if (tests.https.ssl && !tests.https.ssl.valid) {
        analysis.issues.push('SSL certificate issue detected');
        analysis.recommendations.push('Check SSL certificate configuration');
      }
    }
  }
  
  // Determine final status
  if (analysis.issues.length === 0) {
    analysis.status = 'healthy';
    analysis.summary = 'Domain is fully reachable and responding correctly';
  } else if (analysis.reachable) {
    analysis.status = 'partial';
    analysis.summary = 'Domain is reachable but has some issues';
  } else {
    analysis.status = 'offline';
    analysis.summary = 'Domain is not reachable';
    analysis.recommendations.push('Check domain DNS configuration and server status');
  }
  
  return analysis;
}

/**
 * Determine workflow based on ping results
 * @param {object} pingResult - Result from pingDomain or comprehensiveConnectivityTest
 * @returns {object} - Workflow recommendation
 */
function determineWorkflowFromPing(pingResult) {
  console.log(`🔄 Determining workflow based on ping results for ${pingResult.domain}`);
  
  const workflow = {
    domain: pingResult.domain,
    pingStatus: pingResult.status || (pingResult.overall ? pingResult.overall.status : 'unknown'),
    recommendedWorkflow: 'unknown',
    priority: 'medium',
    actions: [],
    reasoning: ''
  };
  
  // Determine workflow based on ping status
  if (pingResult.alive || (pingResult.overall && pingResult.overall.reachable)) {
    // Domain is reachable
    workflow.recommendedWorkflow = 'domain_online';
    workflow.priority = 'low';
    workflow.actions = [
      'monitor_performance',
      'check_ssl_status',
      'verify_content_delivery'
    ];
    workflow.reasoning = 'Domain is online and reachable - routine monitoring recommended';
    
  } else if (pingResult.status === 'offline' || (pingResult.overall && pingResult.overall.status === 'offline')) {
    // Domain is completely offline
    workflow.recommendedWorkflow = 'domain_offline';
    workflow.priority = 'high';
    workflow.actions = [
      'check_dns_configuration',
      'verify_server_status',
      'check_hosting_account_status',
      'investigate_network_issues'
    ];
    workflow.reasoning = 'Domain is offline - immediate investigation required';
    
  } else if (pingResult.overall && pingResult.overall.status === 'partial') {
    // Domain has partial connectivity issues
    workflow.recommendedWorkflow = 'domain_partial_issues';
    workflow.priority = 'medium';
    workflow.actions = [
      'investigate_specific_services',
      'check_ssl_configuration',
      'verify_web_server_status',
      'monitor_response_times'
    ];
    workflow.reasoning = 'Domain has partial connectivity - specific service investigation needed';
    
  } else {
    // Unknown or error status
    workflow.recommendedWorkflow = 'domain_status_unknown';
    workflow.priority = 'medium';
    workflow.actions = [
      'retry_connectivity_test',
      'check_dns_resolution',
      'verify_domain_configuration'
    ];
    workflow.reasoning = 'Domain status unclear - diagnostic tests recommended';
  }
  
  console.log(`→ Recommended workflow: ${workflow.recommendedWorkflow} (priority: ${workflow.priority})`);
  console.log(`→ Reasoning: ${workflow.reasoning}`);
  
  return workflow;
}

module.exports = {
  pingDomain,
  comprehensiveConnectivityTest,
  testHTTPConnectivity,
  testHTTPSConnectivity,
  analyzeConnectivityResults,
  determineWorkflowFromPing
};