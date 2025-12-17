/**
 * Temporary Test Route for WHM API v1 start_autossl_check
 * This endpoint specifically tests the start_autossl_check method
 * DELETE THIS FILE AFTER TESTING
 */

const express = require('express');
const router = express.Router();

/**
 * Test WHM API v1 start_autossl_check endpoint
 * POST /api/test-start-autossl
 */
router.post('/', async (req, res) => {
  try {
    const { serverName, username, domain } = req.body;
    
    if (!serverName || !username) {
      return res.status(400).json({
        success: false,
        error: 'serverName and username are required',
        example: {
          serverName: 'pcp3',
          username: 'x98aailqrs',
          domain: 'example.com (optional)'
        }
      });
    }
    
    console.log(`🧪 TESTING WHM API v1 start_autossl_check`);
    console.log(`→ Server: ${serverName.toUpperCase()}`);
    console.log(`→ Username: ${username}`);
    console.log(`→ Domain: ${domain || 'Not specified'}`);
    console.log(`→ API Version: 1 (explicitly)`);
    
    const whmService = require('../services/whmService');
    
    // Test 1: Basic start_autossl_check with users parameter
    console.log(`\n🔧 Test 1: start_autossl_check with 'users' parameter`);
    let test1Result = null;
    try {
      test1Result = await whmService.callServerAPI(serverName, 'start_autossl_check', {
        users: username
      }, '1'); // Explicitly use WHM API v1
      
      console.log(`→ Test 1 Response:`, JSON.stringify(test1Result, null, 2));
    } catch (test1Error) {
      console.log(`→ Test 1 Error:`, test1Error.message);
      test1Result = { error: test1Error.message };
    }
    
    // Test 2: start_autossl_check with user parameter (singular)
    console.log(`\n🔧 Test 2: start_autossl_check with 'user' parameter`);
    let test2Result = null;
    try {
      test2Result = await whmService.callServerAPI(serverName, 'start_autossl_check', {
        user: username
      }, '1'); // Explicitly use WHM API v1
      
      console.log(`→ Test 2 Response:`, JSON.stringify(test2Result, null, 2));
    } catch (test2Error) {
      console.log(`→ Test 2 Error:`, test2Error.message);
      test2Result = { error: test2Error.message };
    }
    
    // Test 3: start_autossl_check with username parameter
    console.log(`\n🔧 Test 3: start_autossl_check with 'username' parameter`);
    let test3Result = null;
    try {
      test3Result = await whmService.callServerAPI(serverName, 'start_autossl_check', {
        username: username
      }, '1'); // Explicitly use WHM API v1
      
      console.log(`→ Test 3 Response:`, JSON.stringify(test3Result, null, 2));
    } catch (test3Error) {
      console.log(`→ Test 3 Error:`, test3Error.message);
      test3Result = { error: test3Error.message };
    }
    
    // Test 3b: start_autossl_check_for_one_user (CORRECT METHOD FROM WHM DOCS)
    console.log(`\n🔧 Test 3b: start_autossl_check_for_one_user with 'username' parameter`);
    let test3bResult = null;
    try {
      test3bResult = await whmService.callServerAPI(serverName, 'start_autossl_check_for_one_user', {
        username: username
      }, '1'); // Explicitly use WHM API v1
      
      console.log(`→ Test 3b Response:`, JSON.stringify(test3bResult, null, 2));
    } catch (test3bError) {
      console.log(`→ Test 3b Error:`, test3bError.message);
      test3bResult = { error: test3bError.message };
    }
    
    // Test 4: If domain provided, test with domain parameter
    let test4Result = null;
    if (domain) {
      console.log(`\n🔧 Test 4: start_autossl_check with domain parameter`);
      try {
        test4Result = await whmService.callServerAPI(serverName, 'start_autossl_check', {
          users: username,
          domain: domain
        }, '1'); // Explicitly use WHM API v1
        
        console.log(`→ Test 4 Response:`, JSON.stringify(test4Result, null, 2));
      } catch (test4Error) {
        console.log(`→ Test 4 Error:`, test4Error.message);
        test4Result = { error: test4Error.message };
      }
    }
    
    // Test 5: start_autossl_check API availability check
    console.log(`\n🔧 Test 5: start_autossl_check API availability check`);
    let test5Result = null;
    try {
      test5Result = await whmService.callServerAPI(serverName, 'start_autossl_check', {}, '1');
      console.log(`→ Test 5 Response:`, JSON.stringify(test5Result, null, 2));
    } catch (test5Error) {
      console.log(`→ Test 5 Error:`, test5Error.message);
      test5Result = { error: test5Error.message };
    }
    
    // Test 6: start_autossl_check_for_one_user API availability check
    console.log(`\n🔧 Test 6: start_autossl_check_for_one_user API availability check`);
    let test6Result = null;
    try {
      test6Result = await whmService.callServerAPI(serverName, 'start_autossl_check_for_one_user', {}, '1');
      console.log(`→ Test 6 Response:`, JSON.stringify(test6Result, null, 2));
    } catch (test6Error) {
      console.log(`→ Test 6 Error:`, test6Error.message);
      test6Result = { error: test6Error.message };
    }
    
    // Test 7: reset_autossl_provider (from cPanel docs)
    console.log(`\n🔧 Test 7: reset_autossl_provider (cPanel WHM API)`);
    let test7Result = null;
    try {
      test7Result = await whmService.callServerAPI(serverName, 'reset_autossl_provider', {
        username: username
      }, '1'); // WHM API v1
      
      console.log(`→ Test 7 Response:`, JSON.stringify(test7Result, null, 2));
    } catch (test7Error) {
      console.log(`→ Test 7 Error:`, test7Error.message);
      test7Result = { error: test7Error.message };
    }
    
    // Test 8: autossl_check_all_users (comprehensive check)
    console.log(`\n🔧 Test 8: autossl_check_all_users with user filter`);
    let test8Result = null;
    try {
      test8Result = await whmService.callServerAPI(serverName, 'autossl_check_all_users', {
        user: username
      }, '1'); // WHM API v1
      
      console.log(`→ Test 8 Response:`, JSON.stringify(test8Result, null, 2));
    } catch (test8Error) {
      console.log(`→ Test 8 Error:`, test8Error.message);
      test8Result = { error: test8Error.message };
    }
    
    // Test 9: start_autossl_check_all_users (if exists)
    console.log(`\n🔧 Test 9: start_autossl_check_all_users`);
    let test9Result = null;
    try {
      test9Result = await whmService.callServerAPI(serverName, 'start_autossl_check_all_users', {
        users: username
      }, '1'); // WHM API v1
      
      console.log(`→ Test 9 Response:`, JSON.stringify(test9Result, null, 2));
    } catch (test9Error) {
      console.log(`→ Test 9 Error:`, test9Error.message);
      test9Result = { error: test9Error.message };
    }
    
    // Test 10: run_autossl_check_for_user (alternative naming)
    console.log(`\n🔧 Test 10: run_autossl_check_for_user`);
    let test10Result = null;
    try {
      test10Result = await whmService.callServerAPI(serverName, 'run_autossl_check_for_user', {
        username: username
      }, '1'); // WHM API v1
      
      console.log(`→ Test 10 Response:`, JSON.stringify(test10Result, null, 2));
    } catch (test10Error) {
      console.log(`→ Test 10 Error:`, test10Error.message);
      test10Result = { error: test10Error.message };
    }
    
    // Test 11: If domain provided, test domain-specific AutoSSL trigger
    let test11Result = null;
    if (domain) {
      console.log(`\n🔧 Test 11: start_autossl_check_for_one_user with domain parameter`);
      try {
        test11Result = await whmService.callServerAPI(serverName, 'start_autossl_check_for_one_user', {
          username: username,
          domain: domain
        }, '1'); // WHM API v1
        
        console.log(`→ Test 11 Response:`, JSON.stringify(test11Result, null, 2));
      } catch (test11Error) {
        console.log(`→ Test 11 Error:`, test11Error.message);
        test11Result = { error: test11Error.message };
      }
    }
    
    // Analyze results
    const analysis = {
      test1: {
        method: 'start_autossl_check',
        parameters: { users: username },
        success: test1Result && !test1Result.error && test1Result.metadata?.result === 1,
        apiExists: test1Result && !test1Result.error,
        result: test1Result
      },
      test2: {
        method: 'start_autossl_check',
        parameters: { user: username },
        success: test2Result && !test2Result.error && test2Result.metadata?.result === 1,
        apiExists: test2Result && !test2Result.error,
        result: test2Result
      },
      test3: {
        method: 'start_autossl_check',
        parameters: { username: username },
        success: test3Result && !test3Result.error && test3Result.metadata?.result === 1,
        apiExists: test3Result && !test3Result.error,
        result: test3Result
      },
      test3b: {
        method: 'start_autossl_check_for_one_user',
        parameters: { username: username },
        success: test3bResult && !test3bResult.error && test3bResult.metadata?.result === 1,
        apiExists: test3bResult && !test3bResult.error,
        result: test3bResult
      },
      test4: domain ? {
        method: 'start_autossl_check',
        parameters: { users: username, domain: domain },
        success: test4Result && !test4Result.error && test4Result.metadata?.result === 1,
        apiExists: test4Result && !test4Result.error,
        result: test4Result
      } : null,
      test5: {
        method: 'start_autossl_check',
        parameters: {},
        success: test5Result && !test5Result.error && test5Result.metadata?.result === 1,
        apiExists: test5Result && !test5Result.error,
        result: test5Result
      },
      test6: {
        method: 'start_autossl_check_for_one_user',
        parameters: {},
        success: test6Result && !test6Result.error && test6Result.metadata?.result === 1,
        apiExists: test6Result && !test6Result.error,
        result: test6Result
      },
      test7: {
        method: 'reset_autossl_provider',
        parameters: { username: username },
        success: test7Result && !test7Result.error && test7Result.metadata?.result === 1,
        apiExists: test7Result && !test7Result.error,
        result: test7Result
      },
      test8: {
        method: 'autossl_check_all_users',
        parameters: { user: username },
        success: test8Result && !test8Result.error && test8Result.metadata?.result === 1,
        apiExists: test8Result && !test8Result.error,
        result: test8Result
      },
      test9: {
        method: 'start_autossl_check_all_users',
        parameters: { users: username },
        success: test9Result && !test9Result.error && test9Result.metadata?.result === 1,
        apiExists: test9Result && !test9Result.error,
        result: test9Result
      },
      test10: {
        method: 'run_autossl_check_for_user',
        parameters: { username: username },
        success: test10Result && !test10Result.error && test10Result.metadata?.result === 1,
        apiExists: test10Result && !test10Result.error,
        result: test10Result
      },
      test11: domain ? {
        method: 'start_autossl_check_for_one_user',
        parameters: { username: username, domain: domain },
        success: test11Result && !test11Result.error && test11Result.metadata?.result === 1,
        apiExists: test11Result && !test11Result.error,
        result: test11Result
      } : null
    };
    
    // Determine best working configuration
    const workingTests = Object.values(analysis).filter(test => test && test.success);
    const availableTests = Object.values(analysis).filter(test => test && test.apiExists);
    
    console.log(`\n📊 ANALYSIS SUMMARY:`);
    console.log(`→ Total tests: ${Object.keys(analysis).filter(key => analysis[key]).length}`);
    console.log(`→ API exists: ${availableTests.length > 0 ? 'YES' : 'NO'}`);
    console.log(`→ Working tests: ${workingTests.length}`);
    
    if (workingTests.length > 0) {
      console.log(`✅ WORKING CONFIGURATIONS:`);
      workingTests.forEach((test, index) => {
        console.log(`  ${index + 1}. Parameters: ${JSON.stringify(test.parameters)}`);
      });
    }
    
    if (availableTests.length > 0 && workingTests.length === 0) {
      console.log(`⚠️ API EXISTS BUT NO WORKING CONFIGURATIONS FOUND`);
      console.log(`→ The API is available but may require different parameters or permissions`);
    }
    
    if (availableTests.length === 0) {
      console.log(`❌ API NOT AVAILABLE ON THIS SERVER`);
      console.log(`→ start_autossl_check is not supported in WHM API v1 on ${serverName.toUpperCase()}`);
    }
    
    // Return comprehensive response
    res.json({
      success: true,
      method: 'start_autossl_check',
      apiVersion: '1',
      serverName: serverName,
      username: username,
      domain: domain || null,
      summary: {
        apiExists: availableTests.length > 0,
        workingConfigurations: workingTests.length,
        totalTests: Object.keys(analysis).filter(key => analysis[key]).length,
        recommendedConfig: workingTests.length > 0 ? workingTests[0].parameters : null
      },
      analysis: analysis,
      recommendation: workingTests.length > 0 
        ? `Use start_autossl_check with parameters: ${JSON.stringify(workingTests[0].parameters)}`
        : availableTests.length > 0 
          ? 'API exists but requires different parameters or permissions'
          : 'start_autossl_check API not available on this server'
    });
    
  } catch (error) {
    console.error(`❌ Test Error:`, error.message);
    res.status(500).json({
      success: false,
      method: 'start_autossl_check',
      error: error.message,
      details: error.response?.data || null
    });
  }
});

/**
 * Get detailed WHM API information for start_autossl_check
 * GET /api/test-start-autossl/info
 */
router.get('/info', async (req, res) => {
  try {
    const { serverName } = req.query;
    
    if (!serverName) {
      return res.status(400).json({
        success: false,
        error: 'serverName query parameter is required',
        example: '/api/test-start-autossl/info?serverName=pcp3'
      });
    }
    
    console.log(`📋 Getting WHM API info for start_autossl_check on ${serverName.toUpperCase()}`);
    
    const whmService = require('../services/whmService');
    
    // Try to get API documentation or version info
    let apiInfo = null;
    try {
      // Some WHM servers support getting API function info
      apiInfo = await whmService.callServerAPI(serverName, 'api_shell', {
        function: 'start_autossl_check'
      }, '1');
      
      console.log(`→ API Info Response:`, JSON.stringify(apiInfo, null, 2));
    } catch (infoError) {
      console.log(`→ API Info not available:`, infoError.message);
    }
    
    // Get server version info
    let versionInfo = null;
    try {
      versionInfo = await whmService.callServerAPI(serverName, 'version', {}, '1');
      console.log(`→ Server Version:`, JSON.stringify(versionInfo, null, 2));
    } catch (versionError) {
      console.log(`→ Version info not available:`, versionError.message);
    }
    
    res.json({
      success: true,
      serverName: serverName,
      apiFunction: 'start_autossl_check',
      apiVersion: '1',
      apiInfo: apiInfo,
      versionInfo: versionInfo,
      documentation: {
        purpose: 'Triggers AutoSSL certificate generation for specified users',
        commonParameters: [
          { name: 'users', description: 'Comma-separated list of usernames' },
          { name: 'user', description: 'Single username' },
          { name: 'username', description: 'Single username (alternative)' },
          { name: 'domain', description: 'Specific domain to process (optional)' }
        ],
        notes: [
          'API availability varies by cPanel/WHM version',
          'Some servers may not support this API in v1',
          'Parameters may vary between different WHM versions',
          'Success depends on AutoSSL configuration and permissions'
        ]
      }
    });
    
  } catch (error) {
    console.error(`❌ Info Error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;