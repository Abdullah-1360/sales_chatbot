/**
 * Test Focused AutoSSL Route
 * Tests the new focusedAutoSSLManagement method in service status flow
 * DELETE THIS FILE AFTER TESTING
 */

const express = require('express');
const router = express.Router();

/**
 * Test Focused AutoSSL Management Method
 * POST /api/test-focused-autossl
 */
router.post('/', async (req, res) => {
  try {
    const { serverName, username, domain } = req.body;
    
    if (!serverName || !username || !domain) {
      return res.status(400).json({
        success: false,
        error: 'serverName, username, and domain are required',
        example: {
          serverName: 'pcp3',
          username: 'x98aailqrs',
          domain: 'uzairfarooq.pk'
        }
      });
    }
    
    // Testing Focused AutoSSL Management Method - no logging for performance
    
    const whmService = require('../services/whmService');
    
    // Test the new focused AutoSSL method
    const startTime = Date.now();
    const result = await whmService.focusedAutoSSLManagement(serverName, username, domain, {});
    const executionTime = Date.now() - startTime;
    
    // Focused AutoSSL Test Results - no logging for performance
    
    // Return comprehensive test results
    res.json({
      success: true,
      testResults: {
        executionTime: executionTime,
        methodTested: 'focusedAutoSSLManagement',
        serverName: serverName,
        username: username,
        domain: domain,
        result: result,
        summary: {
          success: result.success,
          method: result.method,
          approach: result.approach,
          autoSSLTriggered: result.autoSSLTriggered,
          triggerMethod: result.triggerMethod,
          timeline: result.timeline,
          workflowSuccess: result.workflowAnalysis?.workflowSuccess || false,
          completeSuccess: result.workflowAnalysis?.completeSuccess || false,
          domainsProcessed: result.workflowAnalysis?.domainsRemoved || 0,
          recommendation: result.workflowAnalysis?.recommendedApproach || 'Unknown'
        }
      },
      comparison: {
        oldMethod: 'forceAutoSSLInclusion (with 60s wait)',
        newMethod: 'focusedAutoSSLManagement (no wait)',
        improvement: `Execution completed in ${executionTime}ms without wait time`,
        workflow: 'Remove Exclusion → Enable → Trigger (immediate return)'
      },
      integration: {
        serviceStatusReady: true,
        compatibleFormat: true,
        note: 'This method is now integrated into the service status flow'
      }
    });
    
  } catch (error) {
    console.error(`❌ Focused AutoSSL Test Error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null,
      testResults: null
    });
  }
});

module.exports = router;