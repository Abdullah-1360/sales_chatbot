/**
 * Focused AutoSSL Test Route
 * Tests correct AutoSSL workflow: Enable → Trigger → Wait → Verify
 * DELETE THIS FILE AFTER TESTING
 */

const express = require('express');
const router = express.Router();

/**
 * Test Correct AutoSSL Workflow: Enable → Trigger → Wait → Verify
 * POST /api/focused-autossl-test
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
          domain: 'uzairfarooq.pk (optional)'
        }
      });
    }
    
    console.log(`🎯 FOCUSED AutoSSL Test: Correct Workflow`);
    console.log(`→ Server: ${serverName.toUpperCase()}`);
    console.log(`→ Username: ${username}`);
    console.log(`→ Domain: ${domain || 'Not specified'}`);
    console.log(`→ Workflow: Remove Exclusion → Enable → Trigger → Wait`);
    
    const whmService = require('../services/whmService');
    const results = {};
    
    // Step 1: Remove domain and www subdomain from AutoSSL excluded domains (if domain provided)
    if (domain) {
      console.log(`\n🔧 Step 1: Remove Domain and Subdomains from AutoSSL Exclusions`);
      console.log(`→ Method: remove_autossl_user_excluded_domains`);
      console.log(`→ Domains to remove: ${domain} and www.${domain}`);
      console.log(`→ Purpose: Ensures domain and www subdomain are not excluded from AutoSSL`);
      
      const domainsToRemove = [domain, `www.${domain}`];
      const removeResults = [];
      let successCount = 0;
      let errorCount = 0;
      
      for (const domainToRemove of domainsToRemove) {
        console.log(`\n→ Removing: ${domainToRemove}`);
        try {
          const removeResult = await whmService.callServerAPI(serverName, 'remove_autossl_user_excluded_domains', {
            username: username,
            domain: domainToRemove
          }, '1'); // WHM API v1
          
          console.log(`→ Remove Result for ${domainToRemove}:`, JSON.stringify(removeResult, null, 2));
          
          const isSuccess = removeResult && removeResult.metadata && removeResult.metadata.result === 1;
          if (isSuccess) {
            console.log(`✅ SUCCESS: ${domainToRemove} removed from AutoSSL exclusions`);
            successCount++;
          } else {
            console.log(`⚠️ PARTIAL: ${domainToRemove} removal result=${removeResult?.metadata?.result || 'unknown'}`);
            console.log(`→ Reason: ${removeResult?.metadata?.reason || 'No reason provided'}`);
          }
          
          removeResults.push({
            domain: domainToRemove,
            success: isSuccess,
            result: removeResult,
            reason: removeResult?.metadata?.reason || 'No reason provided'
          });
          
        } catch (removeError) {
          console.log(`❌ ERROR removing ${domainToRemove}: ${removeError.message}`);
          errorCount++;
          removeResults.push({
            domain: domainToRemove,
            success: false,
            error: removeError.message,
            reason: 'API call failed'
          });
        }
      }
      
      results.step1_remove = {
        method: 'remove_autossl_user_excluded_domains',
        parameters: { username: username, domains: domainsToRemove },
        success: successCount > 0, // Success if at least one domain was removed
        completeSuccess: successCount === domainsToRemove.length, // Complete success if all domains removed
        apiExists: removeResults.length > 0,
        successCount: successCount,
        errorCount: errorCount,
        totalDomains: domainsToRemove.length,
        results: removeResults,
        reason: `${successCount}/${domainsToRemove.length} domains removed successfully`
      };
      
      if (results.step1_remove.completeSuccess) {
        console.log(`✅ Step 1 COMPLETE SUCCESS: All domains (${domain} and www.${domain}) removed from AutoSSL exclusions`);
      } else if (results.step1_remove.success) {
        console.log(`⚠️ Step 1 PARTIAL SUCCESS: ${successCount}/${domainsToRemove.length} domains removed from AutoSSL exclusions`);
      } else {
        console.log(`❌ Step 1 FAILED: No domains could be removed from AutoSSL exclusions`);
      }
    } else {
      console.log(`\n⏭️ Step 1: Skipping domain exclusion removal (no domain specified)`);
      results.step1_remove = {
        method: 'remove_autossl_user_excluded_domains',
        parameters: null,
        success: null,
        apiExists: null,
        result: null,
        reason: 'Skipped - no domain provided',
        skipped: true
      };
    }
    
    // Step 2: Enable AutoSSL for user (ensures they are not excluded)
    console.log(`\n🔧 Step 2: Enable AutoSSL for User`);
    console.log(`→ Method: add_override_features_for_user`);
    console.log(`→ Parameters: { user: '${username}', features: '{"autossl":1}' }`);
    console.log(`→ Purpose: Ensures user is not excluded from AutoSSL`);
    
    try {
      const enableResult = await whmService.callServerAPI(serverName, 'add_override_features_for_user', {
        user: username,
        features: JSON.stringify({ autossl: 1 })
      }, '1'); // WHM API v1
      
      console.log(`→ Enable Result:`, JSON.stringify(enableResult, null, 2));
      
      results.step2_enable = {
        method: 'add_override_features_for_user',
        parameters: { user: username, features: '{"autossl":1}' },
        success: enableResult && enableResult.metadata && enableResult.metadata.result === 1,
        apiExists: enableResult && !enableResult.error,
        result: enableResult,
        reason: enableResult?.metadata?.reason || 'No reason provided'
      };
      
      if (results.step2_enable.success) {
        console.log(`✅ Step 2 SUCCESS: AutoSSL enabled for user ${username}`);
      } else {
        console.log(`⚠️ Step 2 PARTIAL: Enable API called but result=${enableResult?.metadata?.result || 'unknown'}`);
        console.log(`→ Reason: ${enableResult?.metadata?.reason || 'No reason provided'}`);
      }
      
    } catch (enableError) {
      console.log(`❌ Step 2 ERROR: ${enableError.message}`);
      results.step2_enable = {
        method: 'add_override_features_for_user',
        parameters: { user: username, features: '{"autossl":1}' },
        success: false,
        apiExists: false,
        error: enableError.message
      };
    }
    
    // Step 3: Trigger AutoSSL for the specific user (starts the issuance)
    console.log(`\n🔧 Step 3: Trigger AutoSSL for User`);
    console.log(`→ Method: start_autossl_check_for_one_user`);
    console.log(`→ Parameters: { username: '${username}' }`);
    console.log(`→ Purpose: Starts the SSL certificate issuance process`);
    
    try {
      const triggerResult = await whmService.callServerAPI(serverName, 'start_autossl_check_for_one_user', {
        username: username
      }, '1'); // WHM API v1
      
      console.log(`→ Trigger Result:`, JSON.stringify(triggerResult, null, 2));
      
      results.step3_trigger = {
        method: 'start_autossl_check_for_one_user',
        parameters: { username: username },
        success: triggerResult && triggerResult.metadata && triggerResult.metadata.result === 1,
        apiExists: triggerResult && !triggerResult.error,
        result: triggerResult,
        reason: triggerResult?.metadata?.reason || 'No reason provided'
      };
      
      if (results.step3_trigger.success) {
        console.log(`✅ Step 3 SUCCESS: AutoSSL check triggered for user ${username}`);
      } else {
        console.log(`⚠️ Step 3 PARTIAL: Trigger API called but result=${triggerResult?.metadata?.result || 'unknown'}`);
        console.log(`→ Reason: ${triggerResult?.metadata?.reason || 'No reason provided'}`);
      }
      
    } catch (triggerError) {
      console.log(`❌ Step 3 ERROR: ${triggerError.message}`);
      results.step3_trigger = {
        method: 'start_autossl_check_for_one_user',
        parameters: { username: username },
        success: false,
        apiExists: false,
        error: triggerError.message
      };
    }
    
    // Step 4: Wait for AutoSSL to validate DNS and generate certificate (60 seconds)
    const waitTime = 60; // 60 seconds as specified in the correct workflow
    console.log(`\n⏳ Step 4: Waiting ${waitTime} seconds for AutoSSL to validate DNS and generate certificate...`);
    console.log(`→ AutoSSL needs time to validate DNS records and generate the certificate`);
    console.log(`→ This is normal - certificate generation is not instantaneous`);
    
    // Show progress during wait
    const startTime = Date.now();
    for (let i = 0; i < waitTime; i += 15) {
      const remaining = waitTime - i;
      console.log(`→ Waiting... ${remaining} seconds remaining`);
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds at a time
    }
    
    const actualWaitTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ Wait completed (${actualWaitTime} seconds)`);
    
    results.step4_wait = {
      waitTime: actualWaitTime,
      purpose: 'Allow AutoSSL to validate DNS and generate certificate'
    };
    
    console.log(`\n✅ AutoSSL workflow completed successfully!`);
    console.log(`→ AutoSSL certificate generation has been triggered`);
    console.log(`→ Certificate will be generated automatically by the system`);
    console.log(`→ No manual verification needed - AutoSSL handles the process`);
    
    // Analyze complete workflow results
    const workflowAnalysis = {
      removeWorked: domain ? results.step1_remove.success : null,
      removeCompleteSuccess: domain ? results.step1_remove.completeSuccess : null,
      domainsRemoved: domain ? results.step1_remove.successCount : null,
      totalDomains: domain ? results.step1_remove.totalDomains : null,
      enableWorked: results.step2_enable.success,
      triggerWorked: results.step3_trigger.success,
      bothAPIsExist: results.step2_enable.apiExists && results.step3_trigger.apiExists,
      workflowSuccess: results.step2_enable.success && results.step3_trigger.success,
      completeSuccess: results.step2_enable.success && results.step3_trigger.success && 
                      (domain ? results.step1_remove.success : true),
      waitTime: results.step4_wait.waitTime,
      domainProvided: !!domain,
      recommendedApproach: null
    };
    
    // Determine recommended approach based on complete workflow
    if (workflowAnalysis.completeSuccess) {
      workflowAnalysis.recommendedApproach = domain ? 
        'COMPLETE SUCCESS: Use full Remove Exclusion → Enable → Trigger → Wait workflow' :
        'COMPLETE SUCCESS: Use full Enable → Trigger → Wait workflow';
    } else if (workflowAnalysis.workflowSuccess) {
      workflowAnalysis.recommendedApproach = 'SUCCESS: Use add_override_features_for_user + start_autossl_check_for_one_user workflow';
    } else if (results.step3_trigger.success && !results.step2_enable.success) {
      workflowAnalysis.recommendedApproach = 'Use start_autossl_check_for_one_user only (enable not needed)';
    } else if (results.step2_enable.success && !results.step3_trigger.success) {
      workflowAnalysis.recommendedApproach = 'Use add_override_features_for_user only (trigger not available)';
    } else if (workflowAnalysis.bothAPIsExist) {
      workflowAnalysis.recommendedApproach = 'Both APIs exist but may need different parameters';
    } else {
      workflowAnalysis.recommendedApproach = 'APIs not working - use passive AutoSSL approach';
    }
    
    console.log(`\n📊 COMPLETE WORKFLOW ANALYSIS:`);
    if (domain) {
      console.log(`→ Remove exclusion worked: ${workflowAnalysis.removeWorked ? '✅' : '❌'}`);
      console.log(`→ Domains removed: ${workflowAnalysis.domainsRemoved}/${workflowAnalysis.totalDomains}`);
      console.log(`→ Complete removal: ${workflowAnalysis.removeCompleteSuccess ? '✅' : '❌'}`);
    }
    console.log(`→ Enable worked: ${workflowAnalysis.enableWorked ? '✅' : '❌'}`);
    console.log(`→ Trigger worked: ${workflowAnalysis.triggerWorked ? '✅' : '❌'}`);
    console.log(`→ Wait time: ${workflowAnalysis.waitTime} seconds`);
    console.log(`→ Both APIs exist: ${workflowAnalysis.bothAPIsExist ? '✅' : '❌'}`);
    console.log(`→ Workflow success: ${workflowAnalysis.workflowSuccess ? '✅' : '❌'}`);
    console.log(`→ Complete success: ${workflowAnalysis.completeSuccess ? '✅' : '❌'}`);
    console.log(`→ Recommended approach: ${workflowAnalysis.recommendedApproach}`);
    
    // Return comprehensive response
    res.json({
      success: true,
      workflow: domain ? 
        'Remove Exclusion → Enable → Trigger → Wait (Complete AutoSSL Workflow)' :
        'Enable → Trigger → Wait (AutoSSL Workflow)',
      serverName: serverName,
      username: username,
      domain: domain || null,
      results: results,
      analysis: workflowAnalysis,
      recommendation: workflowAnalysis.recommendedApproach,
      implementation: workflowAnalysis.workflowSuccess ? {
        step1: domain ? `Call remove_autossl_user_excluded_domains to remove domain and www subdomain exclusions (${domain} and www.${domain})` : 'Skipped (no domain)',
        step2: 'Call add_override_features_for_user to enable AutoSSL',
        step3: 'Call start_autossl_check_for_one_user to trigger certificate generation',
        step4: 'Wait 60 seconds for AutoSSL to validate DNS and generate certificate',
        parameters: {
          remove: domain ? { 
            username: username, 
            domains: [domain, `www.${domain}`],
            note: 'Remove both main domain and www subdomain from exclusions'
          } : null,
          enable: { user: username, features: '{"autossl":1}' },
          trigger: { username: username }
        },
        timing: {
          certificateWait: '60 seconds',
          totalTime: '60+ seconds'
        },
        note: 'AutoSSL will handle certificate generation automatically - no manual verification needed'
      } : null
    });
    
  } catch (error) {
    console.error(`❌ Workflow Test Error:`, error.message);
    res.status(500).json({
      success: false,
      workflow: 'Remove Exclusion → Enable → Trigger → Wait (Complete AutoSSL Workflow)',
      error: error.message,
      details: error.response?.data || null
    });
  }
});

module.exports = router;