/**
 * DNS Problem Resolution Service
 * Comprehensive workflow for diagnosing and fixing DNS issues
 */

const { checkDNSPropagation, performComprehensiveDNSLookup } = require('../utils/dnsChecker');
const whmService = require('./whmService');

class DNSResolutionService {
  constructor() {
    this.resolutionSteps = [
      'initial_diagnosis',
      'nameserver_check',
      'a_record_check',
      'mx_record_check',
      'propagation_check',
      'auto_fix_attempt',
      'manual_instructions',
      'verification'
    ];
  }

  /**
   * Main DNS problem resolution workflow
   * @param {string} domain - Domain to diagnose and fix
   * @param {Object} options - Resolution options
   * @returns {Promise<Object>} - Complete resolution result
   */
  async resolveDNSProblems(domain, options = {}) {
    console.log(`🔍 Starting DNS Problem Resolution for: ${domain}`);
    console.log('='.repeat(60));
    
    const resolution = {
      domain: domain,
      timestamp: new Date().toISOString(),
      steps: {},
      currentStep: null,
      finalStatus: null,
      recommendations: [],
      actions: [],
      summary: null
    };

    try {
      // Step 1: Initial Diagnosis
      resolution.currentStep = 'initial_diagnosis';
      resolution.steps.initial_diagnosis = await this.performInitialDiagnosis(domain);
      
      // Step 2: Nameserver Analysis
      resolution.currentStep = 'nameserver_check';
      resolution.steps.nameserver_check = await this.analyzeNameservers(domain, resolution.steps.initial_diagnosis);
      
      // Step 3: A Record Analysis
      resolution.currentStep = 'a_record_check';
      resolution.steps.a_record_check = await this.analyzeARecords(domain, resolution.steps.initial_diagnosis);
      
      // Step 4: MX Record Analysis (if needed)
      resolution.currentStep = 'mx_record_check';
      resolution.steps.mx_record_check = await this.analyzeMXRecords(domain, resolution.steps.initial_diagnosis);
      
      // Step 5: Propagation Check
      resolution.currentStep = 'propagation_check';
      resolution.steps.propagation_check = await this.checkPropagationStatus(domain);
      
      // Step 6: Determine Resolution Strategy
      resolution.currentStep = 'strategy_determination';
      const strategy = this.determineResolutionStrategy(resolution.steps);
      resolution.strategy = strategy;
      
      // Step 7: Execute Auto-Fix (if applicable)
      if (strategy.autoFixable) {
        resolution.currentStep = 'auto_fix_attempt';
        resolution.steps.auto_fix_attempt = await this.executeAutoFix(domain, strategy);
      }
      
      // Step 8: Generate Manual Instructions (if needed)
      if (strategy.requiresManualAction) {
        resolution.currentStep = 'manual_instructions';
        resolution.steps.manual_instructions = this.generateManualInstructions(domain, strategy, resolution.steps);
      }
      
      // Step 9: Final Verification
      resolution.currentStep = 'verification';
      resolution.steps.verification = await this.performFinalVerification(domain, resolution.steps);
      
      // Step 10: Generate Summary
      resolution.summary = this.generateResolutionSummary(resolution);
      resolution.finalStatus = resolution.summary.status;
      
      console.log('\n' + '='.repeat(60));
      console.log('🎯 DNS RESOLUTION SUMMARY');
      console.log('='.repeat(60));
      console.log(resolution.summary.message);
      
      return resolution;
      
    } catch (error) {
      console.error(`❌ DNS Resolution failed at step ${resolution.currentStep}:`, error.message);
      resolution.error = error.message;
      resolution.finalStatus = 'error';
      return resolution;
    }
  }

  /**
   * Step 1: Perform initial comprehensive diagnosis
   */
  async performInitialDiagnosis(domain) {
    console.log('\n📋 Step 1: Initial Diagnosis');
    console.log('-'.repeat(40));
    
    try {
      const diagnosis = await performComprehensiveDNSLookup(domain);
      
      console.log(`→ Domain: ${domain}`);
      console.log(`→ A Records: ${diagnosis.records.A.join(', ') || 'None'}`);
      console.log(`→ NS Records: ${diagnosis.records.NS.join(', ') || 'None'}`);
      console.log(`→ MX Records: ${diagnosis.records.MX.map(mx => `${mx.exchange} (${mx.priority})`).join(', ') || 'None'}`);
      console.log(`→ A Records Match Our Servers: ${diagnosis.serverMatches.aRecordsMatchOurServers ? '✅' : '❌'}`);
      console.log(`→ NS Records Match Our Servers: ${diagnosis.serverMatches.nsRecordsMatchOurServers ? '✅' : '❌'}`);
      
      return {
        success: true,
        diagnosis: diagnosis,
        issues: this.identifyIssues(diagnosis)
      };
      
    } catch (error) {
      console.log(`❌ Initial diagnosis failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Step 2: Analyze nameserver configuration
   */
  async analyzeNameservers(domain, initialDiagnosis) {
    console.log('\n🌐 Step 2: Nameserver Analysis');
    console.log('-'.repeat(40));
    
    if (!initialDiagnosis.success) {
      console.log('⏭️ Skipping nameserver analysis due to initial diagnosis failure');
      return { skipped: true, reason: 'initial_diagnosis_failed' };
    }
    
    const nsRecords = initialDiagnosis.diagnosis.records.NS;
    const nsMatch = initialDiagnosis.diagnosis.serverMatches.nsRecordsMatchOurServers;
    
    console.log(`→ Current Nameservers: ${nsRecords.join(', ')}`);
    console.log(`→ Using Our Nameservers: ${nsMatch ? '✅' : '❌'}`);
    
    let analysis = {
      usesOurNameservers: nsMatch,
      nameservers: nsRecords,
      recommendation: null,
      action: null
    };
    
    if (!nsMatch) {
      // Detect external DNS provider
      const { detectRegistrar } = require('../utils/dnsChecker');
      const provider = detectRegistrar(nsRecords);
      
      analysis.externalProvider = provider;
      analysis.recommendation = 'update_nameservers';
      analysis.action = `Update nameservers to our servers at ${provider || 'your registrar'}`;
      
      console.log(`→ External DNS Provider: ${provider || 'Unknown'}`);
      console.log(`→ Recommendation: Update nameservers to our servers`);
    } else {
      analysis.recommendation = 'nameservers_correct';
      console.log(`→ Nameservers are correctly configured`);
    }
    
    return analysis;
  }

  /**
   * Step 3: Analyze A record configuration
   */
  async analyzeARecords(domain, initialDiagnosis) {
    console.log('\n🎯 Step 3: A Record Analysis');
    console.log('-'.repeat(40));
    
    if (!initialDiagnosis.success) {
      console.log('⏭️ Skipping A record analysis due to initial diagnosis failure');
      return { skipped: true, reason: 'initial_diagnosis_failed' };
    }
    
    const aRecords = initialDiagnosis.diagnosis.records.A;
    const aMatch = initialDiagnosis.diagnosis.serverMatches.aRecordsMatchOurServers;
    const nsMatch = initialDiagnosis.diagnosis.serverMatches.nsRecordsMatchOurServers;
    
    console.log(`→ Current A Records: ${aRecords.join(', ')}`);
    console.log(`→ Points to Our Servers: ${aMatch ? '✅' : '❌'}`);
    
    let analysis = {
      pointsToOurServers: aMatch,
      currentIPs: aRecords,
      recommendation: null,
      action: null,
      autoFixable: false
    };
    
    if (!aMatch && nsMatch) {
      // A record wrong but we control DNS - can auto-fix
      analysis.recommendation = 'auto_fix_a_record';
      analysis.action = 'Automatically update A record to correct server IP';
      analysis.autoFixable = true;
      console.log(`→ Recommendation: Auto-fix A record (we control DNS)`);
    } else if (!aMatch && !nsMatch) {
      // A record wrong and external DNS - manual fix needed
      analysis.recommendation = 'manual_fix_a_record';
      analysis.action = 'Manually update A record at external DNS provider';
      analysis.autoFixable = false;
      console.log(`→ Recommendation: Manual A record fix at external provider`);
    } else {
      analysis.recommendation = 'a_record_correct';
      console.log(`→ A records are correctly configured`);
    }
    
    return analysis;
  }

  /**
   * Step 4: Analyze MX record configuration
   */
  async analyzeMXRecords(domain, initialDiagnosis) {
    console.log('\n📧 Step 4: MX Record Analysis');
    console.log('-'.repeat(40));
    
    if (!initialDiagnosis.success) {
      console.log('⏭️ Skipping MX record analysis due to initial diagnosis failure');
      return { skipped: true, reason: 'initial_diagnosis_failed' };
    }
    
    const mxRecords = initialDiagnosis.diagnosis.records.MX;
    const mxMatch = initialDiagnosis.diagnosis.serverMatches.mxRecordsMatchOurServers;
    
    console.log(`→ Current MX Records: ${mxRecords.map(mx => `${mx.exchange} (${mx.priority})`).join(', ') || 'None'}`);
    console.log(`→ Uses Our Mail Servers: ${mxMatch ? '✅' : '❌'}`);
    
    let analysis = {
      usesOurMailServers: mxMatch,
      mxRecords: mxRecords,
      recommendation: null,
      action: null
    };
    
    if (mxRecords.length === 0) {
      analysis.recommendation = 'no_mx_records';
      analysis.action = 'Consider adding MX records for email functionality';
      console.log(`→ Recommendation: No MX records found - email may not work`);
    } else if (!mxMatch) {
      analysis.recommendation = 'external_email';
      analysis.action = 'Email is managed externally - this is often intentional';
      console.log(`→ Email is managed externally (this may be intentional)`);
    } else {
      analysis.recommendation = 'mx_records_correct';
      console.log(`→ MX records are correctly configured`);
    }
    
    return analysis;
  }

  /**
   * Step 5: Check propagation status
   */
  async checkPropagationStatus(domain) {
    console.log('\n🌍 Step 5: Propagation Check');
    console.log('-'.repeat(40));
    
    try {
      const propagationResult = await checkDNSPropagation(domain);
      
      console.log(`→ Domain Propagated: ${propagationResult.propagated ? '✅' : '❌'}`);
      console.log(`→ Data Source: ${propagationResult.dataSource}`);
      
      if (!propagationResult.propagated) {
        console.log(`→ Propagation Issue: ${propagationResult.error || 'Domain not resolving'}`);
      }
      
      return {
        propagated: propagationResult.propagated,
        dataSource: propagationResult.dataSource,
        error: propagationResult.error,
        recommendation: propagationResult.propagated ? 'propagation_complete' : 'wait_for_propagation'
      };
      
    } catch (error) {
      console.log(`❌ Propagation check failed: ${error.message}`);
      return {
        propagated: false,
        error: error.message,
        recommendation: 'propagation_check_failed'
      };
    }
  }

  /**
   * Determine the best resolution strategy based on all analysis
   */
  determineResolutionStrategy(steps) {
    console.log('\n🎯 Step 6: Strategy Determination');
    console.log('-'.repeat(40));
    
    const strategy = {
      autoFixable: false,
      requiresManualAction: false,
      priority: 'low',
      actions: [],
      reasoning: []
    };
    
    // Check if we can auto-fix A records
    if (steps.a_record_check && steps.a_record_check.autoFixable) {
      strategy.autoFixable = true;
      strategy.priority = 'high';
      strategy.actions.push('auto_fix_a_record');
      strategy.reasoning.push('A record can be automatically fixed (we control DNS)');
      console.log(`→ Auto-fix available: A record update`);
    }
    
    // Check if nameservers need manual update
    if (steps.nameserver_check && steps.nameserver_check.recommendation === 'update_nameservers') {
      strategy.requiresManualAction = true;
      strategy.priority = 'high';
      strategy.actions.push('update_nameservers');
      strategy.reasoning.push('Nameservers need to be updated at registrar');
      console.log(`→ Manual action required: Update nameservers`);
    }
    
    // Check if external A record needs manual update
    if (steps.a_record_check && steps.a_record_check.recommendation === 'manual_fix_a_record') {
      strategy.requiresManualAction = true;
      strategy.priority = 'high';
      strategy.actions.push('manual_fix_a_record');
      strategy.reasoning.push('A record needs manual update at external DNS provider');
      console.log(`→ Manual action required: Update A record externally`);
    }
    
    // Check propagation issues
    if (steps.propagation_check && !steps.propagation_check.propagated) {
      strategy.requiresManualAction = true;
      strategy.priority = 'medium';
      strategy.actions.push('wait_propagation');
      strategy.reasoning.push('Domain propagation is incomplete');
      console.log(`→ Waiting required: Domain propagation`);
    }
    
    if (strategy.actions.length === 0) {
      strategy.priority = 'low';
      strategy.actions.push('no_action_needed');
      strategy.reasoning.push('DNS configuration appears correct');
      console.log(`→ No action needed: DNS appears correctly configured`);
    }
    
    console.log(`→ Strategy Priority: ${strategy.priority.toUpperCase()}`);
    console.log(`→ Actions: ${strategy.actions.join(', ')}`);
    
    return strategy;
  }

  /**
   * Execute automatic fixes
   */
  async executeAutoFix(domain, strategy) {
    console.log('\n🔧 Step 7: Auto-Fix Execution');
    console.log('-'.repeat(40));
    
    const results = {
      attempted: [],
      successful: [],
      failed: []
    };
    
    if (strategy.actions.includes('auto_fix_a_record')) {
      console.log(`→ Attempting automatic A record fix...`);
      results.attempted.push('a_record_fix');
      
      try {
        const fixResult = await whmService.autoFixARecord(domain);
        
        if (fixResult.success) {
          results.successful.push({
            action: 'a_record_fix',
            result: fixResult
          });
          console.log(`✅ A record fix successful: ${fixResult.oldIP} → ${fixResult.newIP}`);
        } else {
          results.failed.push({
            action: 'a_record_fix',
            error: fixResult.error
          });
          console.log(`❌ A record fix failed: ${fixResult.error}`);
        }
      } catch (error) {
        results.failed.push({
          action: 'a_record_fix',
          error: error.message
        });
        console.log(`❌ A record fix error: ${error.message}`);
      }
    }
    
    return results;
  }

  /**
   * Generate manual instructions for issues that can't be auto-fixed
   */
  generateManualInstructions(domain, strategy, steps) {
    console.log('\n📋 Step 8: Manual Instructions');
    console.log('-'.repeat(40));
    
    const instructions = {
      domain: domain,
      actions: []
    };
    
    if (strategy.actions.includes('update_nameservers')) {
      const nsCheck = steps.nameserver_check;
      
      instructions.actions.push({
        type: 'update_nameservers',
        priority: 'high',
        title: 'Update Nameservers at Registrar',
        description: `Your domain is using external nameservers. To use our hosting services, update your nameservers at ${nsCheck.externalProvider || 'your registrar'}.`,
        steps: [
          `Log in to your domain registrar (${nsCheck.externalProvider || 'your registrar'})`,
          'Navigate to DNS/Nameserver management',
          'Update nameservers to our servers:',
          '  - ns1.hostbreak.com',
          '  - ns2.hostbreak.com',
          '  - ns3.hostbreak.com',
          '  - ns4.hostbreak.com',
          'Save changes and wait 24-48 hours for propagation'
        ]
      });
      
      console.log(`→ Generated nameserver update instructions`);
    }
    
    if (strategy.actions.includes('manual_fix_a_record')) {
      const nsCheck = steps.nameserver_check;
      const aCheck = steps.a_record_check;
      
      instructions.actions.push({
        type: 'manual_fix_a_record',
        priority: 'high',
        title: 'Update A Record at External DNS Provider',
        description: `Your A record needs to be updated at your external DNS provider.`,
        steps: [
          `Log in to your DNS provider (${nsCheck.externalProvider || 'your DNS provider'})`,
          'Navigate to DNS record management',
          `Find the A record for ${domain}`,
          `Current IP: ${aCheck.currentIPs.join(', ')}`,
          'Update to point to our server IP (contact support for correct IP)',
          'Save changes and wait for propagation (usually 1-4 hours)'
        ]
      });
      
      console.log(`→ Generated A record update instructions`);
    }
    
    if (strategy.actions.includes('wait_propagation')) {
      instructions.actions.push({
        type: 'wait_propagation',
        priority: 'medium',
        title: 'Wait for DNS Propagation',
        description: 'Your domain is not fully propagated yet.',
        steps: [
          'DNS changes can take 24-48 hours to propagate globally',
          'Check back in a few hours',
          'Use online DNS propagation checkers to monitor progress',
          'Contact support if issues persist after 48 hours'
        ]
      });
      
      console.log(`→ Generated propagation wait instructions`);
    }
    
    return instructions;
  }

  /**
   * Perform final verification after fixes
   */
  async performFinalVerification(domain, steps) {
    console.log('\n✅ Step 9: Final Verification');
    console.log('-'.repeat(40));
    
    try {
      // Re-run comprehensive DNS lookup to check current state
      const finalDiagnosis = await performComprehensiveDNSLookup(domain);
      
      const verification = {
        aRecordsCorrect: finalDiagnosis.serverMatches.aRecordsMatchOurServers,
        nsRecordsCorrect: finalDiagnosis.serverMatches.nsRecordsMatchOurServers,
        mxRecordsCorrect: finalDiagnosis.serverMatches.mxRecordsMatchOurServers,
        overallStatus: 'unknown'
      };
      
      // Determine overall status
      if (verification.aRecordsCorrect && verification.nsRecordsCorrect) {
        verification.overallStatus = 'fully_resolved';
        console.log(`✅ DNS fully resolved - both A and NS records correct`);
      } else if (verification.aRecordsCorrect || verification.nsRecordsCorrect) {
        verification.overallStatus = 'partially_resolved';
        console.log(`⚠️ DNS partially resolved - some records correct`);
      } else {
        verification.overallStatus = 'unresolved';
        console.log(`❌ DNS issues remain - manual action required`);
      }
      
      console.log(`→ A Records: ${verification.aRecordsCorrect ? '✅' : '❌'}`);
      console.log(`→ NS Records: ${verification.nsRecordsCorrect ? '✅' : '❌'}`);
      console.log(`→ MX Records: ${verification.mxRecordsCorrect ? '✅' : '❌'}`);
      
      return verification;
      
    } catch (error) {
      console.log(`❌ Final verification failed: ${error.message}`);
      return {
        error: error.message,
        overallStatus: 'verification_failed'
      };
    }
  }

  /**
   * Generate comprehensive resolution summary
   */
  generateResolutionSummary(resolution) {
    const summary = {
      status: 'unknown',
      message: '',
      actionsCompleted: [],
      actionsRequired: [],
      nextSteps: []
    };
    
    // Determine final status
    if (resolution.steps.verification) {
      summary.status = resolution.steps.verification.overallStatus || 'unknown';
    }
    
    // Count completed actions
    if (resolution.steps.auto_fix_attempt) {
      summary.actionsCompleted = resolution.steps.auto_fix_attempt.successful.map(s => s.action);
    }
    
    // List required manual actions
    if (resolution.steps.manual_instructions) {
      summary.actionsRequired = resolution.steps.manual_instructions.actions.map(a => a.type);
    }
    
    // Generate status message
    switch (summary.status) {
      case 'fully_resolved':
        summary.message = `✅ DNS issues for ${resolution.domain} have been fully resolved. All records are correctly configured.`;
        break;
      case 'partially_resolved':
        summary.message = `⚠️ DNS issues for ${resolution.domain} have been partially resolved. Some manual actions may still be required.`;
        break;
      case 'unresolved':
        summary.message = `❌ DNS issues for ${resolution.domain} require manual intervention. Please follow the provided instructions.`;
        break;
      default:
        summary.message = `ℹ️ DNS analysis completed for ${resolution.domain}. Review the detailed results above.`;
    }
    
    // Add next steps
    if (summary.actionsRequired.length > 0) {
      summary.nextSteps.push('Complete the manual actions listed above');
      summary.nextSteps.push('Wait for DNS propagation (24-48 hours)');
      summary.nextSteps.push('Re-run DNS resolution check to verify fixes');
    } else if (summary.status === 'fully_resolved') {
      summary.nextSteps.push('No further action required');
      summary.nextSteps.push('Monitor website functionality');
    } else {
      summary.nextSteps.push('Contact technical support if issues persist');
    }
    
    return summary;
  }

  /**
   * Identify specific issues from initial diagnosis
   */
  identifyIssues(diagnosis) {
    const issues = [];
    
    if (!diagnosis.serverMatches.aRecordsMatchOurServers) {
      issues.push({
        type: 'a_record_mismatch',
        severity: 'high',
        description: 'A record does not point to our servers'
      });
    }
    
    if (!diagnosis.serverMatches.nsRecordsMatchOurServers) {
      issues.push({
        type: 'nameserver_mismatch',
        severity: 'high',
        description: 'Nameservers are not set to our servers'
      });
    }
    
    if (diagnosis.records.A.length === 0) {
      issues.push({
        type: 'no_a_record',
        severity: 'critical',
        description: 'No A record found for domain'
      });
    }
    
    if (diagnosis.records.NS.length === 0) {
      issues.push({
        type: 'no_nameservers',
        severity: 'critical',
        description: 'No nameservers found for domain'
      });
    }
    
    return issues;
  }
}

// Export singleton instance
const dnsResolutionService = new DNSResolutionService();

module.exports = dnsResolutionService;