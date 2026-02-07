const { Client } = require('ssh2');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// Configuration
const config = {
  whm: {
    host: 'pcp3.mywebsitebox.com',
    port: 2087,
    username: 'root',
    token: 'DRBNK459UIU6DQQN3H9TQACJKAA78O6D'
  },
  cpanel: {
    user: 'x98aailqrs',
    passphrase: '73v3nE1v!$'
  },
  ssh: {
    port: 22022,
    keyName: 'bot_automation_key'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model:  'gpt-4o-mini'
  },
  // Domain configuration - will be set dynamically
  domain: {
    name: 'test',
    type: null, // 'main', 'subdomain', 'addon'
    path: null,
    cpanelUser: null
  }
};

class AutomatedWPRepairWithAI {
  constructor(domainName = null, cpanelUser = null) {
    this.sshConnection = null;
    this.privateKey = null;
    this.errorLogAnalysis = null;
    
    // Set domain configuration if provided
    if (domainName) {
      config.domain.name = domainName;
      config.domain.cpanelUser = cpanelUser || config.cpanel.user;
    }
  }

  // Get the current application path (used throughout the system)
  getApplicationPath() {
    return config.domain.path || `/home/${config.cpanel.user}/public_html`;
  }

  // Step 0: Detect domain type and resolve application path
  async detectDomainAndResolvePath() {
    if (!config.domain.name) {
      console.log('ℹ️  No domain specified, using default cPanel user path');
      config.domain.type = 'main';
      config.domain.path = `/home/${config.cpanel.user}/public_html`;
      config.domain.cpanelUser = config.cpanel.user;
      return true;
    }

    console.log(`🔍 Detecting domain type and resolving path for: ${config.domain.name}`);
    
    try {
      // Use cPanel API to get domain information
      const domainInfo = await this.getDomainInfo(config.domain.name);
      
      if (domainInfo.found) {
        config.domain.type = domainInfo.type;
        config.domain.path = domainInfo.path;
        config.domain.cpanelUser = domainInfo.cpanelUser;
        
        console.log(`✅ Domain detected:`);
        console.log(`   Domain: ${config.domain.name}`);
        console.log(`   Type: ${config.domain.type}`);
        console.log(`   Path: ${config.domain.path}`);
        console.log(`   cPanel User: ${config.domain.cpanelUser}`);
        
        // Update cPanel user in config if different
        if (config.domain.cpanelUser !== config.cpanel.user) {
          console.log(`🔄 Updating cPanel user from ${config.cpanel.user} to ${config.domain.cpanelUser}`);
          config.cpanel.user = config.domain.cpanelUser;
        }
        
        return true;
      } else {
        throw new Error(`Domain ${config.domain.name} not found or not accessible`);
      }
    } catch (error) {
      console.error('❌ Error detecting domain:', error.message);
      
      // Fallback: Try to guess based on domain structure
      console.log('🔄 Attempting fallback domain detection...');
      const fallbackResult = this.fallbackDomainDetection(config.domain.name);
      
      config.domain.type = fallbackResult.type;
      config.domain.path = fallbackResult.path;
      config.domain.cpanelUser = fallbackResult.cpanelUser;
      
      console.log(`⚠️  Using fallback detection:`);
      console.log(`   Domain: ${config.domain.name}`);
      console.log(`   Type: ${config.domain.type} (guessed)`);
      console.log(`   Path: ${config.domain.path} (guessed)`);
      console.log(`   cPanel User: ${config.domain.cpanelUser}`);
      
      return true;
    }
  }

  // Get domain information via cPanel UAPI
  async getDomainInfo(domainName) {
    try {
      console.log(`🔍 Querying cPanel UAPI for domain: ${domainName}`);
      
      // First, get all domains under the account
      const allDomainsResult = await this.getAllDomainsFromAccount();
      if (!allDomainsResult.success) {
        throw new Error(`Failed to get domains list: ${allDomainsResult.error}`);
      }
      
      // Perform fuzzy matching to find the best match
      const matchResult = this.findBestDomainMatch(domainName, allDomainsResult.domains);
      if (!matchResult.found) {
        return { found: false, reason: 'No matching domain found in account' };
      }
      
      console.log(`✅ Best match found: ${matchResult.matchedDomain} (confidence: ${matchResult.confidence})`);
      
      // Get specific domain data using single_domain_data API
      const domainDataResult = await this.getSingleDomainData(matchResult.matchedDomain);
      if (!domainDataResult.success) {
        throw new Error(`Failed to get domain data: ${domainDataResult.error}`);
      }
      
      return {
        found: true,
        type: domainDataResult.data.type,
        path: domainDataResult.data.documentroot,
        cpanelUser: domainDataResult.data.user,
        matchedDomain: matchResult.matchedDomain,
        confidence: matchResult.confidence,
        originalDomain: domainName
      };
      
    } catch (error) {
      console.error('❌ cPanel UAPI query failed:', error.message);
      return { found: false, error: error.message };
    }
  }

  // Get all domains from cPanel account using UAPI
  async getAllDomainsFromAccount() {
    try {
      const url = `https://${config.whm.host}:${config.whm.port}/json-api/uapi_cpanel`;
      const params = {
        'api.version': 1,
        'cpanel.user': config.cpanel.user,
        'cpanel.module': 'DomainInfo',
        'cpanel.function': 'list_domains'
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (response.data?.data?.uapi?.status === 1) {
        const domainData = response.data.data.uapi.data;
        
        // Collect all domains from different categories
        const allDomains = {
          main_domain: domainData.main_domain,
          addon_domains: domainData.addon_domains || [],
          sub_domains: domainData.sub_domains || [],
          parked_domains: domainData.parked_domains || []
        };
        
        console.log(`📋 Found domains in account:`);
        console.log(`   Main domain: ${allDomains.main_domain}`);
        console.log(`   Addon domains: ${allDomains.addon_domains.length}`);
        console.log(`   Sub domains: ${allDomains.sub_domains.length}`);
        console.log(`   Parked domains: ${allDomains.parked_domains.length}`);
        
        return {
          success: true,
          domains: allDomains
        };
      } else {
        throw new Error('Invalid response from cPanel UAPI');
      }
    } catch (error) {
      console.error('Failed to get domains list from cPanel:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Find best domain match using fuzzy matching
  findBestDomainMatch(targetDomain, allDomains) {
    const candidates = [];
    
    // Add main domain
    if (allDomains.main_domain) {
      candidates.push({
        domain: allDomains.main_domain,
        type: 'main_domain'
      });
    }
    
    // Add addon domains
    allDomains.addon_domains.forEach(domain => {
      candidates.push({
        domain: domain,
        type: 'addon_domain'
      });
    });
    
    // Add sub domains
    allDomains.sub_domains.forEach(domain => {
      candidates.push({
        domain: domain,
        type: 'sub_domain'
      });
    });
    
    // Add parked domains (but with lower priority)
    allDomains.parked_domains.forEach(domain => {
      candidates.push({
        domain: domain,
        type: 'parked_domain'
      });
    });
    
    console.log(`🔍 Matching '${targetDomain}' against ${candidates.length} candidates`);
    
    let bestMatch = null;
    let highestConfidence = 0;
    
    candidates.forEach(candidate => {
      const confidence = this.calculateDomainMatchConfidence(targetDomain, candidate.domain);
      
      console.log(`   ${candidate.domain} (${candidate.type}): ${confidence}% confidence`);
      
      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = candidate;
      }
    });
    
    // Require at least 70% confidence for a match
    if (highestConfidence >= 70) {
      return {
        found: true,
        matchedDomain: bestMatch.domain,
        domainType: bestMatch.type,
        confidence: highestConfidence
      };
    } else {
      return {
        found: false,
        reason: `No domain found with sufficient confidence (highest: ${highestConfidence}%)`
      };
    }
  }

  // Calculate domain match confidence using multiple strategies
  calculateDomainMatchConfidence(target, candidate) {
    // Exact match
    if (target.toLowerCase() === candidate.toLowerCase()) {
      return 100;
    }
    
    // Remove www prefix for comparison
    const cleanTarget = target.replace(/^www\./, '').toLowerCase();
    const cleanCandidate = candidate.replace(/^www\./, '').toLowerCase();
    
    if (cleanTarget === cleanCandidate) {
      return 95;
    }
    
    // Check if target is contained in candidate or vice versa
    if (cleanCandidate.includes(cleanTarget)) {
      return 85;
    }
    
    if (cleanTarget.includes(cleanCandidate)) {
      return 80;
    }
    
    // Check domain similarity (Levenshtein-like approach)
    const similarity = this.calculateStringSimilarity(cleanTarget, cleanCandidate);
    
    // Convert similarity to confidence percentage
    return Math.round(similarity * 100);
  }

  // Calculate string similarity using a simple algorithm
  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {
      return 1.0;
    }
    
    const editDistance = this.calculateEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  // Calculate edit distance between two strings
  calculateEditDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // Get single domain data using UAPI
  async getSingleDomainData(domainName) {
    try {
      const url = `https://${config.whm.host}:${config.whm.port}/json-api/uapi_cpanel`;
      const params = {
        'api.version': 1,
        'cpanel.user': config.cpanel.user,
        'cpanel.module': 'DomainInfo',
        'cpanel.function': 'single_domain_data',
        'domain': domainName
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (response.data?.data?.uapi?.status === 1) {
        const domainData = response.data.data.uapi.data;
        
        console.log(`📁 Domain data for ${domainName}:`);
        console.log(`   Type: ${domainData.type}`);
        console.log(`   Document Root: ${domainData.documentroot}`);
        console.log(`   User: ${domainData.user}`);
        console.log(`   PHP Version: ${domainData.phpversion}`);
        
        return {
          success: true,
          data: domainData
        };
      } else {
        throw new Error('Invalid response from single_domain_data API');
      }
    } catch (error) {
      console.error(`Failed to get domain data for ${domainName}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Fallback domain detection based on domain structure
  fallbackDomainDetection(domainName) {
    console.log(`🔍 Analyzing domain structure: ${domainName}`);
    
    // Check if it's a subdomain (contains a dot before the main domain)
    const parts = domainName.split('.');
    
    if (parts.length > 2) {
      // Likely a subdomain: subdomain.maindomain.com
      const subdomain = parts[0];
      const mainDomain = parts.slice(1).join('.');
      
      console.log(`🔍 Detected as subdomain: ${subdomain} of ${mainDomain}`);
      
      return {
        type: 'subdomain',
        path: `/home/${config.cpanel.user}/public_html/${subdomain}`,
        cpanelUser: config.cpanel.user
      };
    } else {
      // Likely an addon domain: addondomainname.com
      console.log(`🔍 Detected as addon domain: ${domainName}`);
      
      return {
        type: 'addon',
        path: `/home/${config.cpanel.user}/public_html/${domainName}`,
        cpanelUser: config.cpanel.user
      };
    }
  }

  // Get domain configuration for testing/debugging
  getDomainConfig() {
    return {
      name: config.domain.name,
      type: config.domain.type,
      path: config.domain.path,
      cpanelUser: config.domain.cpanelUser
    };
  }

  // Enable shell access for the cPanel user
  async enableShellAccess() {
    console.log('🔓 Enabling shell access for cPanel user...');
    
    try {
      const url = `https://${config.whm.host}:${config.whm.port}/json-api/modifyacct`;
      const params = {
        'api.version': 1,
        'user': config.domain.cpanelUser || config.cpanel.user,
        'shell': '/bin/bash'
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (response.data && response.data.metadata && response.data.metadata.result === 1) {
        console.log('✅ Shell access enabled successfully');
        return true;
      } else {
        const errorMsg = response.data?.metadata?.reason || 'Unknown error';
        console.error('❌ Failed to enable shell access:', errorMsg);
        return false;
      }
    } catch (error) {
      console.error('❌ Error enabling shell access:', error.message);
      return false;
    }
  }

  // Disable shell access for the cPanel user
  async disableShellAccess() {
    console.log('🔒 Disabling shell access for cPanel user...');
    
    try {
      const url = `https://${config.whm.host}:${config.whm.port}/json-api/modifyacct`;
      const params = {
        'api.version': 1,
        'user': config.domain.cpanelUser || config.cpanel.user,
        'shell': '/bin/noshell'
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (response.data && response.data.metadata && response.data.metadata.result === 1) {
        console.log('✅ Shell access disabled successfully');
        return true;
      } else {
        const errorMsg = response.data?.metadata?.reason || 'Unknown error';
        console.error('❌ Failed to disable shell access:', errorMsg);
        return false;
      }
    } catch (error) {
      console.error('❌ Error disabling shell access:', error.message);
      return false;
    }
  }

  // Step 1: Generate SSH key via cPanel API
  async generateSSHKey() {
    console.log('🔑 Generating SSH key via cPanel API...');
    
    try {
      const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
      const params = {
        'api.version': 1,
        user: config.cpanel.user,
        cpanel_jsonapi_user: config.cpanel.user,
        cpanel_jsonapi_module: 'SSH',
        cpanel_jsonapi_func: 'genkey',
        name: config.ssh.keyName,
        passphrase: config.cpanel.passphrase
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (response.data.cpanelresult.data[0].result === 1) {
        console.log('✅ SSH key generated successfully');
        return true;
      } else {
        throw new Error('Failed to generate SSH key');
      }
    } catch (error) {
      console.error('❌ Error generating SSH key:', error.message);
      return false;
    }
  }

  // Step 2: Authorize SSH key
  async authorizeSSHKey() {
    console.log('🔐 Authorizing SSH key...');
    
    try {
      const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
      const params = {
        'api.version': 1,
        user: config.cpanel.user,
        cpanel_jsonapi_user: config.cpanel.user,
        cpanel_jsonapi_module: 'SSH',
        cpanel_jsonapi_func: 'authkey',
        key: config.ssh.keyName,
        action: 'authorize'
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (response.data.cpanelresult.data[0].status === 'authorized') {
        console.log('✅ SSH key authorized successfully');
        return true;
      } else {
        throw new Error('Failed to authorize SSH key');
      }
    } catch (error) {
      console.error('❌ Error authorizing SSH key:', error.message);
      return false;
    }
  }

  // Step 3: Fetch private SSH key
  async fetchPrivateKey() {
    console.log('📥 Fetching private SSH key...');
    
    try {
      const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
      const params = {
        'api.version': 1,
        user: config.cpanel.user,
        cpanel_jsonapi_user: config.cpanel.user,
        cpanel_jsonapi_module: 'SSH',
        cpanel_jsonapi_func: 'fetchkey',
        name: config.ssh.keyName
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (response.data.cpanelresult.data && response.data.cpanelresult.data[0]) {
        this.privateKey = response.data.cpanelresult.data[0].key;
        console.log('✅ Private SSH key fetched successfully');
        return true;
      } else {
        throw new Error('Failed to fetch private SSH key');
      }
    } catch (error) {
      console.error('❌ Error fetching private SSH key:', error.message);
      return false;
    }
  }

  // Step 4: Connect once and perform all SSH operations
  async connectAndPerformAllOperations() {
    return new Promise((resolve, reject) => {
      console.log('🔌 Establishing single SSH connection for all operations...');
      
      const conn = new Client();
      let errorLogAnalysis = { hasErrors: false, analysis: null };
      
      conn.on('ready', async () => {
        console.log('✅ SSH Connection established');
        
        try {
          // First: Read and analyze error log
          console.log('📋 Reading WordPress error log...');
          
          const errorLogResult = await this.readErrorLogViaSSH(conn);
          
          if (errorLogResult.hasErrors) {
            console.log(`🔍 Found ${errorLogResult.uniqueErrors.length} unique errors, analyzing with OpenAI...`);
            
            try {
              const analysis = await this.analyzeErrorsWithOpenAI(errorLogResult.uniqueErrors);
              errorLogAnalysis = { 
                hasErrors: true, 
                analysis, 
                uniqueErrors: errorLogResult.uniqueErrors 
              };
              console.log('✅ Error log analysis completed');
              
              // Debug: Check what we got from OpenAI
              console.log('🔍 Debug - Analysis object keys:', Object.keys(analysis));
              console.log('🔍 Debug - Analysis content length:', analysis.analysis?.length || 0);
              
            } catch (analysisError) {
              console.error('❌ Error analyzing error log:', analysisError.message);
              errorLogAnalysis = { 
                hasErrors: true, 
                analysis: null, 
                error: analysisError.message,
                uniqueErrors: errorLogResult.uniqueErrors 
              };
            }
          } else {
            console.log('ℹ️  No unique errors found in error log');
          }
          
          // Second: Generate and execute AI-powered fix commands with two-way communication
          if (errorLogAnalysis.hasErrors && errorLogAnalysis.analysis) {
            console.log('🔧 Starting enhanced two-way AI-SSH communication...');
            
            try {
              const communicationResults = await this.performTwoWayAISSHCommunication(conn, errorLogAnalysis.uniqueErrors, errorLogAnalysis.analysis);
              
              errorLogAnalysis.communicationProcess = communicationResults.process;
              errorLogAnalysis.conversations = communicationResults.conversations;
              console.log('✅ Two-way AI-SSH communication completed');
            } catch (communicationError) {
              console.error('❌ Error in two-way AI-SSH communication:', communicationError.message);
              errorLogAnalysis.communicationError = communicationError.message;
            }
          }
          
          // Fourth: Perform WordPress core verification and repair
          console.log('🔍 Starting WordPress core checksum verification...');
          
          const repairResult = await this.performWordPressRepairViaSSH(conn);
          
          conn.end();
          
          resolve({
            ...repairResult,
            errorLogAnalysis
          });
          
        } catch (error) {
          conn.end();
          reject(error);
        }
      }).on('error', (err) => {
        console.error('SSH Connection error:', err);
        reject(err);
      }).connect({
        host: config.whm.host,
        port: config.ssh.port,
        username: config.cpanel.user,
        privateKey: this.privateKey,
        passphrase: config.cpanel.passphrase,
        readyTimeout: 20000,
        keepaliveInterval: 1000
      });
    });
  }

  // Read error log via existing SSH connection
  async readErrorLogViaSSH(conn) {
    return new Promise((resolve, reject) => {
      const applicationPath = this.getApplicationPath();
      conn.exec(`cd ${applicationPath} && tail -100 error_log 2>/dev/null || echo "No error log found"`, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        
        let output = '';
        let errorOutput = '';
        
        stream.on('close', (code, signal) => {
          if (output.includes('No error log found')) {
            resolve({ hasErrors: false, analysis: null });
            return;
          }
          
          // Process and deduplicate errors
          const uniqueErrors = this.processErrorLog(output);
          
          if (uniqueErrors.length === 0) {
            resolve({ hasErrors: false, analysis: null });
            return;
          }
          
          resolve({ hasErrors: true, uniqueErrors });
        }).on('data', (data) => {
          output += data.toString();
        }).stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
      });
    });
  }

  // Perform WordPress repair via existing SSH connection
  async performWordPressRepairViaSSH(conn) {
    return new Promise((resolve, reject) => {
      const applicationPath = this.getApplicationPath();
      conn.exec(`cd ${applicationPath} && wp core verify-checksums --allow-root`, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        
        let output = '';
        let errorOutput = '';
        
        stream.on('close', (code, signal) => {
          console.log('\n=== WordPress Core Checksum Verification Results ===');
          console.log('Exit code:', code);
          
          if (output.trim()) {
            console.log('\nOutput:');
            console.log(output);
          }
          
          if (errorOutput.trim()) {
            console.log('\nError Output:');
            console.log(errorOutput);
          }
          
          // If checksum verification failed, run wp core download --force
          if (code !== 0) {
            console.log('\n❌ WordPress core files verification failed');
            console.log('⚠️  Some WordPress core files may be modified or corrupted');
            console.log('\n🔄 Running wp core download --force to restore core files...');
            
            this.performCoreDownloadViaSSH(conn).then(resolve).catch(reject);
          } else {
            console.log('\n✅ WordPress core files verification completed successfully');
            console.log('✅ All WordPress core files are intact and unmodified');
            resolve({
              success: true,
              repaired: false,
              alreadyValid: true
            });
          }
        }).on('data', (data) => {
          output += data.toString();
        }).stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
      });
    });
  }

  // Perform core download via existing SSH connection
  async performCoreDownloadViaSSH(conn) {
    return new Promise((resolve, reject) => {
      const applicationPath = this.getApplicationPath();
      conn.exec(`cd ${applicationPath} && wp core download --force --allow-root`, (err, downloadStream) => {
        if (err) {
          reject(err);
          return;
        }
        
        let downloadOutput = '';
        let downloadErrorOutput = '';
        
        downloadStream.on('close', (downloadCode, downloadSignal) => {
          console.log('\n=== WordPress Core Download Results ===');
          console.log('Exit code:', downloadCode);
          
          if (downloadOutput.trim()) {
            console.log('\nOutput:');
            console.log(downloadOutput);
          }
          
          if (downloadErrorOutput.trim()) {
            console.log('\nError Output:');
            console.log(downloadErrorOutput);
          }
          
          if (downloadCode === 0) {
            console.log('\n✅ WordPress core files have been restored successfully');
            console.log('🔄 Running final checksum verification...');
            
            this.performFinalVerificationViaSSH(conn).then(resolve).catch(reject);
          } else {
            console.log('\n❌ WordPress core download failed');
            resolve({
              success: false,
              repaired: false,
              error: 'Core download failed'
            });
          }
        }).on('data', (data) => {
          downloadOutput += data.toString();
        }).stderr.on('data', (data) => {
          downloadErrorOutput += data.toString();
        });
      });
    });
  }

  // Perform final verification via existing SSH connection
  async performFinalVerificationViaSSH(conn) {
    return new Promise((resolve, reject) => {
      const applicationPath = this.getApplicationPath();
      conn.exec(`cd ${applicationPath} && wp core verify-checksums --allow-root`, (err, verifyStream) => {
        if (err) {
          reject(err);
          return;
        }
        
        let verifyOutput = '';
        let verifyErrorOutput = '';
        
        verifyStream.on('close', (verifyCode, verifySignal) => {
          console.log('\n=== Final Checksum Verification Results ===');
          console.log('Exit code:', verifyCode);
          
          if (verifyOutput.trim()) {
            console.log('\nOutput:');
            console.log(verifyOutput);
          }
          
          if (verifyErrorOutput.trim()) {
            console.log('\nError Output:');
            console.log(verifyErrorOutput);
          }
          
          if (verifyCode === 0) {
            console.log('\n✅ WordPress core files verification now passes!');
            console.log('✅ All WordPress core files are intact and unmodified');
          } else {
            console.log('\n⚠️  WordPress core files still have issues after restoration');
          }
          
          resolve({
            success: verifyCode === 0,
            repaired: true,
            finalVerification: verifyCode === 0
          });
        }).on('data', (data) => {
          verifyOutput += data.toString();
        }).stderr.on('data', (data) => {
          verifyErrorOutput += data.toString();
        });
      });
    });
  }

  // Process error log to extract unique errors from last 24 hours (case-sensitive)
  processErrorLog(logContent) {
    const lines = logContent.split('\n').filter(line => line.trim());
    const uniqueErrors = new Set();
    const processedErrors = [];
    
    // Calculate 24 hours ago timestamp
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const currentTime = new Date();
    
    console.log(`🕐 Filtering errors from last 24 hours (since ${twentyFourHoursAgo.toISOString()})`);
    console.log(`📅 Current time: ${currentTime.toISOString()}`);
    
    let totalLinesProcessed = 0;
    let linesWithinTimeframe = 0;
    
    for (const line of lines) {
      totalLinesProcessed++;
      
      // Skip empty lines and non-error lines
      if (!line.trim() || !this.isErrorLine(line)) {
        continue;
      }
      
      // Extract timestamp and check if within last 24 hours
      const timestamp = this.extractTimestamp(line);
      const errorTime = this.parseErrorTimestamp(timestamp);
      
      // Skip errors older than 24 hours
      if (errorTime && errorTime < twentyFourHoursAgo) {
        continue;
      }
      
      // If we can't parse the timestamp, include it (better safe than sorry for recent logs)
      if (errorTime) {
        linesWithinTimeframe++;
      }
      
      // Extract the core error message (remove timestamps and file paths for deduplication)
      const coreError = this.extractCoreError(line);
      
      // Use case-sensitive matching for uniqueness
      if (coreError && !uniqueErrors.has(coreError)) {
        uniqueErrors.add(coreError);
        processedErrors.push({
          original: line,
          coreError: coreError,
          timestamp: timestamp,
          parsedTime: errorTime,
          isRecent: !errorTime || errorTime >= twentyFourHoursAgo
        });
        
        // Limit to last 50 unique errors as requested
        if (processedErrors.length >= 50) {
          break;
        }
      }
    }
    
    // Sort by timestamp (most recent first)
    processedErrors.sort((a, b) => {
      if (a.parsedTime && b.parsedTime) {
        return new Date(b.parsedTime) - new Date(a.parsedTime);
      }
      return 0;
    });
    
    console.log(`📊 Error log processing summary:`);
    console.log(`   Total lines processed: ${totalLinesProcessed}`);
    console.log(`   Lines within 24h timeframe: ${linesWithinTimeframe}`);
    console.log(`   Unique errors found: ${processedErrors.length}`);
    console.log(`   Time range: ${twentyFourHoursAgo.toISOString()} to ${currentTime.toISOString()}`);
    
    return processedErrors;
  }

  // Check if a line contains an error
  isErrorLine(line) {
    const errorIndicators = [
      'PHP Fatal error',
      'PHP Parse error',
      'PHP Warning',
      'PHP Notice',
      'Fatal error',
      'Parse error',
      'Warning:',
      'Notice:',
      'Error:',
      'Critical:',
      'WordPress database error'
    ];
    
    return errorIndicators.some(indicator => 
      line.includes(indicator)
    );
  }

  // Extract core error message for deduplication
  extractCoreError(line) {
    // Remove timestamp
    let coreError = line.replace(/^\[.*?\]\s*/, '');
    
    // Remove file paths and line numbers for better deduplication
    coreError = coreError.replace(/in \/[^\s]+\.php on line \d+/, '');
    coreError = coreError.replace(/\/home\/[^\/]+\/[^\s]+\.php:\d+/, '');
    
    // Remove stack trace references
    coreError = coreError.replace(/Stack trace:.*$/, '');
    
    // Normalize whitespace
    coreError = coreError.replace(/\s+/g, ' ').trim();
    
    return coreError;
  }

  // Extract timestamp from error line
  extractTimestamp(line) {
    const timestampMatch = line.match(/^\[(.*?)\]/);
    return timestampMatch ? timestampMatch[1] : null;
  }

  // Parse error timestamp to Date object
  parseErrorTimestamp(timestamp) {
    if (!timestamp) return null;
    
    try {
      // Common WordPress error log timestamp formats:
      // [23-Jan-2026 08:47:42 UTC]
      // [23-Jan-2026 08:47:42]
      // [2026-01-23 08:47:42]
      
      // Handle format: "23-Jan-2026 08:47:42 UTC" or "23-Jan-2026 08:47:42"
      const wordPressFormat = timestamp.match(/^(\d{2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})( UTC)?$/);
      if (wordPressFormat) {
        const [, day, monthName, year, hour, minute, second] = wordPressFormat;
        const monthMap = {
          'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
          'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
        };
        const month = monthMap[monthName];
        if (month !== undefined) {
          return new Date(Date.UTC(parseInt(year), month, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second)));
        }
      }
      
      // Handle ISO format: "2026-01-23 08:47:42"
      const isoFormat = timestamp.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
      if (isoFormat) {
        return new Date(`${timestamp} UTC`);
      }
      
      // Try to parse as standard date
      const parsed = new Date(timestamp);
      return isNaN(parsed.getTime()) ? null : parsed;
      
    } catch (error) {
      console.warn(`⚠️  Could not parse timestamp: ${timestamp}`);
      return null;
    }
  }

  // Analyze errors with OpenAI
  async analyzeErrorsWithOpenAI(uniqueErrors) {
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Validate model name
    const validModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo'];
    if (!validModels.includes(config.openai.model)) {
      console.log(`⚠️  Warning: Model '${config.openai.model}' may not be valid. Valid models: ${validModels.join(', ')}`);
    }

    const errorMessages = uniqueErrors.map(error => error.original).join('\n');
    const currentTime = new Date();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    console.log('🔍 Debug - Errors being sent to OpenAI:');
    console.log('=====================================');
    uniqueErrors.forEach((error, index) => {
      console.log(`${index + 1}. Core: ${error.coreError}`);
      console.log(`   Original: ${error.original}`);
      console.log(`   Timestamp: ${error.timestamp || 'Unknown'}`);
      console.log(`   Parsed Time: ${error.parsedTime ? error.parsedTime.toISOString() : 'Could not parse'}`);
      console.log(`   Is Recent: ${error.isRecent ? 'Yes' : 'No'}`);
      console.log('');
    });
    console.log('=====================================');
    
    const systemPrompt = `You are a WordPress expert and PHP developer specializing in error analysis and troubleshooting. 

Your task is to analyze WordPress error logs and provide:
1. A summary of the most critical issues
2. Root cause analysis for each major error type
3. Specific, actionable repair recommendations
4. Priority ranking of issues (Critical, High, Medium, Low)
5. Potential impact on website functionality

Focus on:
- Plugin conflicts and compatibility issues
- Theme-related errors
- Database connection problems
- PHP version compatibility
- Memory and resource limitations
- Security vulnerabilities
- Core WordPress file integrity issues

Provide practical solutions that can be implemented via SSH/WP-CLI commands or cPanel.

IMPORTANT CONTEXT: You are analyzing ONLY errors from the last 24 hours. Focus on recent issues that need immediate attention.`;

    const userPrompt = `Please analyze the following WordPress error log entries from the LAST 24 HOURS and provide a comprehensive analysis with specific repair recommendations:

ANALYSIS TIMEFRAME:
- Current Time: ${currentTime.toISOString()}
- Analysis Period: Last 24 hours (since ${twentyFourHoursAgo.toISOString()})
- Total Recent Errors Analyzed: ${uniqueErrors.length}

ERROR LOG ENTRIES (LAST 24 HOURS ONLY):
${errorMessages}

Please provide:
1. **Critical Issues Summary**: Most urgent problems requiring immediate attention
2. **Error Categories**: Group similar errors and identify patterns
3. **Root Cause Analysis**: What's causing each type of error
4. **Repair Recommendations**: Specific commands or actions to fix each issue
5. **Priority Matrix**: Rank issues by severity and impact
6. **Prevention Measures**: How to prevent these errors in the future

IMPORTANT: Focus on the recency of these errors - they occurred within the last 24 hours and represent current, active issues that need immediate resolution.

Format your response in clear sections with actionable steps.`;

    try {
      console.log('🤖 Sending request to OpenAI...');
      console.log(`Model: ${config.openai.model}`);
      console.log(`Errors to analyze: ${uniqueErrors.length}`);
      
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 2000
      }, {
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log('🔍 Debug - OpenAI Response Status:', response.status);
      console.log('🔍 Debug - Response Data Keys:', Object.keys(response.data));
      console.log('🔍 Debug - Choices Length:', response.data.choices?.length || 0);
      
      if (response.data.choices && response.data.choices.length > 0) {
        const messageContent = response.data.choices[0].message?.content;
        console.log('🔍 Debug - Message Content Length:', messageContent?.length || 0);
        console.log('🔍 Debug - Message Content Preview:', messageContent?.substring(0, 200) || 'No content');
        
        return {
          analysis: messageContent || 'No analysis content received from OpenAI',
          model: config.openai.model,
          tokensUsed: response.data.usage?.total_tokens || 0
        };
      } else {
        throw new Error('No choices returned from OpenAI API');
      }
    } catch (error) {
      console.error('OpenAI API Error:', error.response?.data || error.message);
      throw new Error(`OpenAI analysis failed: ${error.message}`);
    }
  }

  // Main execution function with AI analysis
  async run() {
    console.log('🚀 Starting Automated WordPress Repair Process with AI Analysis...\n');
    
    let keyGenerated = false;
    let shellAccessEnabled = false;
    
    try {
      // Step 0: Detect domain type and resolve application path
      await this.detectDomainAndResolvePath();
      
      // Step 1: Enable shell access
      shellAccessEnabled = await this.enableShellAccess();
      if (!shellAccessEnabled) {
        console.warn('⚠️  Shell access could not be enabled, SSH operations may fail');
      }
      
      // Step 2: Generate SSH key
      keyGenerated = await this.generateSSHKey();
      if (!keyGenerated) {
        throw new Error('Failed to generate SSH key');
      }

      // Step 3: Authorize SSH key
      const keyAuthorized = await this.authorizeSSHKey();
      if (!keyAuthorized) {
        throw new Error('Failed to authorize SSH key');
      }

      // Step 4: Fetch private key
      const keyFetched = await this.fetchPrivateKey();
      if (!keyFetched) {
        throw new Error('Failed to fetch private key');
      }

      // Step 5: Connect once and perform all operations (error log analysis + WordPress repair)
      const result = await this.connectAndPerformAllOperations();

            // Log repair results summary
      if (result.errorLogAnalysis.hasErrors) {
        if (result.errorLogAnalysis.communicationProcess) {
          console.log(`✅ AI repair completed: ${result.errorLogAnalysis.communicationProcess.successfulCommands}/${result.errorLogAnalysis.communicationProcess.totalExchanges} commands successful`);
        }
        if (result.errorLogAnalysis.uniqueErrors) {
          console.log(`📋 Processed ${result.errorLogAnalysis.uniqueErrors.length} unique errors from last 24 hours`);
        }
      }
      
      console.log('\n🎉 Automated WordPress Repair Process Completed!');
      console.log('Results:', {
        success: result.success,
        repaired: result.repaired,
        alreadyValid: result.alreadyValid,
        errorAnalysis: {
          hasErrors: result.errorLogAnalysis.hasErrors,
          uniqueErrorCount: result.errorLogAnalysis.uniqueErrors?.length || 0,
          aiRepairExecuted: !!result.errorLogAnalysis.communicationProcess
        }
      });
      
      return result;
    } catch (error) {
      console.error('❌ Automated repair process failed:', error.message);
      throw error;
    } finally {
      // Cleanup operations (always run regardless of success/failure)
      console.log('\n🧹 Performing cleanup...');
      
      const cleanupPromises = [];
      
      // Always clean up SSH key if it was generated
      if (keyGenerated) {
        cleanupPromises.push(
          this.deleteSSHKey().catch(error => {
            console.warn('⚠️  SSH key cleanup failed:', error.message);
          })
        );
      }
      
      // Always disable shell access if it was enabled
      if (shellAccessEnabled) {
        cleanupPromises.push(
          this.disableShellAccess().catch(error => {
            console.warn('⚠️  Shell access cleanup failed:', error.message);
          })
        );
      }
      
      // Wait for all cleanup operations to complete
      await Promise.allSettled(cleanupPromises);
      console.log('✅ Cleanup completed');
    }
  }

  // Generate AI-powered fix commands
  async generateFixCommandsWithAI(uniqueErrors, analysisResult) {
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const errorMessages = uniqueErrors.map(error => error.original).join('\n');
    const currentTime = new Date();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const systemPrompt = `You are a WordPress system administrator expert specializing in automated error fixing via WP-CLI and SSH commands.

═══════════════════════════════════════════════════════════════
                    CRITICAL SAFETY PROTOCOL
═══════════════════════════════════════════════════════════════

BACKUP-FIRST MANDATE (NON-NEGOTIABLE):
• ALWAYS create timestamped backups BEFORE any destructive operation
• NEVER use "rm -rf" without verified backup existing
• Backup naming: [name].backup.$(date +%Y%m%d_%H%M%S)

═══════════════════════════════════════════════════════════════
                 ERROR SCENARIO WORKFLOWS
═══════════════════════════════════════════════════════════════

1. PHP PARSE/SYNTAX ERRORS (WP-CLI inaccessible):
   → Files are corrupted but WordPress won't load
   → Use direct file operations (bypass WP-CLI)
   
   WORKFLOW:
   a) Backup: cp -r wp-content/plugins/[plugin] wp-content/plugins/[plugin].backup.$(date +%Y%m%d_%H%M%S)
   b) Remove: rm -rf wp-content/plugins/[plugin] (only after backup verified)
   c) Reinstall: wp plugin install [plugin] --force --allow-root (once PHP error cleared)
   d) Verify: wp plugin list --allow-root

2. PLUGIN CONFLICTS (White Screen of Death):
   → Disable all plugins via database or file rename
   → Enable one-by-one to identify culprit
   
   WORKFLOW:
   a) Backup entire plugins directory
   b) Bulk disable: mv wp-content/plugins wp-content/plugins.disabled
   c) Create fresh plugins folder: mkdir wp-content/plugins
   d) Move essential plugins back individually, testing each time
   e) Or use: wp plugin deactivate --all --allow-root (if WP-CLI works)

3. THEME ERRORS (Frontend broken/Admin accessible):
   → Switch to default theme via WP-CLI or database
   
   WORKFLOW:
   a) Backup theme: cp -r wp-content/themes/[theme] wp-content/themes/[theme].backup.$(date +%Y%m%d_%H%M%S)
   b) Switch default: wp theme activate twentytwentyfour --allow-root
   c) If admin down: wp theme activate twentytwentyfour --skip-themes --allow-root
   d) Remove corrupted: wp theme delete [theme] --allow-root
   e) Reinstall: wp theme install [theme] --force --allow-root

4. DATABASE CONNECTION ERRORS:
   → Check wp-config.php integrity
   → Repair database tables
   
   WORKFLOW:
   a) Verify wp-config.php exists and syntax: php -l wp-config.php
   b) Check DB credentials match hosting panel
   c) Repair: wp db repair --allow-root
   d) Optimize: wp db optimize --allow-root
   e) Check tables: wp db check --allow-root

5. PERMISSIONS/OWNERSHIP ISSUES:
   → Fix file permissions preventing WP-CLI execution
   
   WORKFLOW:
   a) Check: ls -la wp-content/
   b) Fix directories: find . -type d -exec chmod 755 {} \;
   c) Fix files: find . -type f -exec chmod 644 {} \;
   d) Fix ownership: chown -R www-data:www-data . (adjust user as needed)

6. CORE FILE CORRUPTION:
   → WordPress core files modified/missing
   
   WORKFLOW:
   a) Verify checksums: wp core verify-checksums --allow-root
   b) If failed, backup wp-config.php and .htaccess
   c) Reinstall core: wp core download --force --allow-root
   d) Restore backed up config files

7. .HTACCESS / PERMALINK ERRORS:
   → 404 errors, redirect loops
   
   WORKFLOW:
   a) Backup: cp .htaccess .htaccess.backup.$(date +%Y%m%d_%H%M%S)
   b) Reset: wp rewrite flush --hard --allow-root
   c) Regenerate: wp rewrite structure '/%postname%/' --allow-root

8. MEDIA/UPLOAD ISSUES:
   → Broken images, upload failures
   
   WORKFLOW:
   a) Check permissions: ls -la wp-content/uploads/
   b) Fix: chmod 755 wp-content/uploads/ -R
   c) Regenerate thumbs: wp media regenerate --allow-root

═══════════════════════════════════════════════════════════════
                 WP-CLI SAFE EXECUTION FLAGS
═══════════════════════════════════════════════════════════════

ALWAYS include these flags for stability:
• --allow-root (when running as root)
• --skip-plugins (bypass plugin loading)
• --skip-themes (bypass theme loading)
• --force (overwrite existing)
• || echo 'COMMAND_FAILED' (graceful failure handling)

═══════════════════════════════════════════════════════════════
                 DIRECTORY HANDLING
═══════════════════════════════════════════════════════════════

System auto-navigates to correct path:
• Main domain: /public_html/
• Subdomain: /public_html/subdomain/
• Addon domain: /public_html/domain.com/

NEVER include "cd" commands in responses.

═══════════════════════════════════════════════════════════════
                 VERIFICATION PROTOCOL
═══════════════════════════════════════════════════════════════

After every fix, execute:
1. wp core version --allow-root (confirm WP loads)
2. wp plugin list --allow-root (confirm plugin status)
3. wp theme list --allow-root (confirm theme status)

═══════════════════════════════════════════════════════════════
                 COMMAND OUTPUT RULES
═══════════════════════════════════════════════════════════════

Generate ONLY:
✓ Safe, tested SSH commands
✓ Timestamped backup commands
✓ WP-CLI commands with proper flags
✓ Verification steps
✗ NO rm -rf without backup
✗ NO direct database edits without export
✗ NO file editing (replace, don't patch)
DO NOT suggest manual file edits or database queries.
CONTEXT: These errors occurred within the last 24 hours and represent current, active issues requiring immediate resolution.

Output ONLY a JSON array of command objects with this exact structure:
[
  {
    "description": "Brief description of what this command does",
    "command": "exact SSH command to run",
    "safety": "high|medium|low - safety level",
    "type": "backup|remove|install|verify|cleanup",
    "reversible": true/false
  }
]

Do not include any other text, explanations, or markdown - ONLY the JSON array.`;

    const userPrompt = `Generate safe SSH commands to fix these WordPress errors by removing corrupted files and reinstalling fresh copies:

ANALYSIS TIMEFRAME:
- Current Time: ${currentTime.toISOString()}
- Error Period: Last 24 hours (since ${twentyFourHoursAgo.toISOString()})
- Recent Errors Count: ${uniqueErrors.length}

ERROR LOG ENTRIES (LAST 24 HOURS):
${errorMessages}

CRITICAL CONTEXT: These are recent PHP parse errors (within last 24 hours) which prevent WordPress from loading and make WP-CLI commands fail.

REQUIREMENTS:
- First backup the corrupted plugin/theme directory
- Remove the corrupted directory completely with rm -rf (safe for plugins/themes)
- Reinstall fresh copy using WP-CLI or direct download
- Include verification commands that work even with parse errors
- All commands must handle the scenario where WordPress cannot load due to parse errors
- Focus on immediate resolution since these are recent, active issues

Generate the JSON array of commands now:`;

    try {
      console.log('🤖 Requesting fix commands from OpenAI...');
      
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 1500
      }, {
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const commandsText = response.data.choices[0].message?.content;
      console.log('🔍 Debug - Commands response preview:', commandsText?.substring(0, 300) || 'No content');
      
      if (!commandsText) {
        throw new Error('No commands generated by OpenAI');
      }

      // Parse JSON response
      let commands;
      try {
        // Clean the response in case there's extra text
        const jsonMatch = commandsText.match(/\[[\s\S]*\]/);
        const jsonText = jsonMatch ? jsonMatch[0] : commandsText;
        commands = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('❌ Failed to parse commands JSON:', parseError.message);
        console.log('Raw response:', commandsText);
        throw new Error('Invalid JSON response from OpenAI');
      }

      if (!Array.isArray(commands)) {
        throw new Error('Commands response is not an array');
      }

      // Validate command structure and add safety checks including backup verification
      const validatedCommands = commands.map((cmd, index) => {
        if (!cmd.command || !cmd.description) {
          throw new Error(`Invalid command structure at index ${index}`);
        }
        
        // Check if destructive operations have backup commands
        const isDestructiveOperation = cmd.command.includes('rm -rf wp-content/') || 
                                     cmd.command.includes('wp plugin delete') ||
                                     cmd.command.includes('wp theme delete');
        
        if (isDestructiveOperation) {
          // Check if this is part of a sequence that includes backup
          const hasBackupInSequence = commands.some(c => 
            c.command.includes('cp -r wp-content/') && 
            c.command.includes('.backup.')
          );
          
          if (!hasBackupInSequence) {
            console.warn(`⚠️  Destructive operation without backup detected: ${cmd.command}`);
            // Add backup command before destructive operation
            const backupCommand = this.generateBackupCommand(cmd.command);
            if (backupCommand) {
              console.log(`🛡️  Auto-adding backup command: ${backupCommand.command}`);
              return [backupCommand, cmd];
            }
          }
        }
        
        // Additional safety validation
        const dangerousPatterns = [
          'rm -rf /$',
          'rm -rf /home$',
          'rm -rf /var$',
          'rm -rf /usr$',
          'rm -rf /etc$',
          'rm -rf /root$',
          'chmod 777',
          'chown -R',
          'mysql.*drop',
          'truncate.*table'
        ];
        
        const isDangerous = dangerousPatterns.some(pattern => 
          new RegExp(pattern, 'i').test(cmd.command)
        );
        
        // Allow safe plugin/theme directory removal only after backup
        const isSafePluginThemeRemoval = /rm -rf wp-content\/(plugins|themes)\/[a-zA-Z0-9_-]+$/.test(cmd.command);
        
        if (isDangerous && !isSafePluginThemeRemoval) {
          throw new Error(`Dangerous command detected: ${cmd.command}`);
        }
        
        return {
          ...cmd,
          safety: cmd.safety || 'medium',
          type: cmd.type || 'fix',
          reversible: cmd.reversible !== false,
          hasBackup: !isDestructiveOperation || hasBackupInSequence
        };
      }).flat(); // Flatten in case backup commands were added

      // Add fallback commands for direct file operations if WP-CLI fails
      const hasWpCliCommands = validatedCommands.some(cmd => cmd.command.includes('wp '));
      if (hasWpCliCommands) {
        // Add a fallback command to download plugin directly if WP-CLI fails
        const pluginMatch = errorMessages.match(/wp-content\/plugins\/([^\/]+)/);
        if (pluginMatch) {
          const pluginName = pluginMatch[1];
          validatedCommands.push({
            description: `Fallback: Download ${pluginName} plugin directly if WP-CLI fails`,
            command: `wget -q https://downloads.wordpress.org/plugin/${pluginName}.zip -O ${pluginName}.zip && unzip -q ${pluginName}.zip -d wp-content/plugins/ && rm ${pluginName}.zip`,
            safety: 'medium',
            type: 'fallback',
            reversible: true
          });
        }
      }

      console.log(`✅ Generated ${validatedCommands.length} validated fix commands`);
      return validatedCommands;

    } catch (error) {
      console.error('OpenAI Fix Commands Error:', error.response?.data || error.message);
      throw new Error(`Fix commands generation failed: ${error.message}`);
    }
  }

  // Generate backup command for destructive operations
  generateBackupCommand(destructiveCommand) {
    let backupCommand = null;
    
    // Extract plugin name from rm -rf command
    const pluginRmMatch = destructiveCommand.match(/rm -rf wp-content\/plugins\/([a-zA-Z0-9_-]+)/);
    if (pluginRmMatch) {
      const pluginName = pluginRmMatch[1];
      backupCommand = {
        description: `Create backup of ${pluginName} plugin before removal`,
        command: `cp -r wp-content/plugins/${pluginName} wp-content/plugins/${pluginName}.backup.$(date +%Y%m%d_%H%M%S)`,
        safety: 'high',
        type: 'backup',
        reversible: true,
        timeout: 60
      };
    }
    
    // Extract theme name from rm -rf command
    const themeRmMatch = destructiveCommand.match(/rm -rf wp-content\/themes\/([a-zA-Z0-9_-]+)/);
    if (themeRmMatch) {
      const themeName = themeRmMatch[1];
      backupCommand = {
        description: `Create backup of ${themeName} theme before removal`,
        command: `cp -r wp-content/themes/${themeName} wp-content/themes/${themeName}.backup.$(date +%Y%m%d_%H%M%S)`,
        safety: 'high',
        type: 'backup',
        reversible: true,
        timeout: 60
      };
    }
    
    // Extract plugin name from wp plugin delete command
    const pluginDeleteMatch = destructiveCommand.match(/wp plugin delete ([a-zA-Z0-9_-]+)/);
    if (pluginDeleteMatch) {
      const pluginName = pluginDeleteMatch[1];
      backupCommand = {
        description: `Create backup of ${pluginName} plugin before deletion`,
        command: `cp -r wp-content/plugins/${pluginName} wp-content/plugins/${pluginName}.backup.$(date +%Y%m%d_%H%M%S)`,
        safety: 'high',
        type: 'backup',
        reversible: true,
        timeout: 60
      };
    }
    
    // Extract theme name from wp theme delete command
    const themeDeleteMatch = destructiveCommand.match(/wp theme delete ([a-zA-Z0-9_-]+)/);
    if (themeDeleteMatch) {
      const themeName = themeDeleteMatch[1];
      backupCommand = {
        description: `Create backup of ${themeName} theme before deletion`,
        command: `cp -r wp-content/themes/${themeName} wp-content/themes/${themeName}.backup.$(date +%Y%m%d_%H%M%S)`,
        safety: 'high',
        type: 'backup',
        reversible: true,
        timeout: 60
      };
    }
    
    return backupCommand;
  }

  // Execute fix commands via SSH with logging and safety checks
  async executeFixCommandsViaSSH(conn, fixCommands) {
    const executedCommands = [];
    
    console.log(`🔧 Executing ${fixCommands.length} fix commands with safety checks...`);
    
    for (let i = 0; i < fixCommands.length; i++) {
      const cmd = fixCommands[i];
      console.log(`\n📋 Command ${i + 1}/${fixCommands.length}: ${cmd.description}`);
      console.log(`🔍 Command: ${cmd.command}`);
      console.log(`🛡️  Safety Level: ${cmd.safety}`);
      
      try {
        // Execute command with timeout and logging
        const result = await this.executeSSHCommandWithLogging(conn, cmd.command, 30000);
        
        const executedCmd = {
          ...cmd,
          result: 'success',
          output: result.output,
          error: result.error,
          exitCode: result.exitCode,
          executedAt: new Date().toISOString()
        };
        
        executedCommands.push(executedCmd);
        
        console.log(`✅ Command executed successfully (Exit Code: ${result.exitCode})`);
        if (result.output) {
          console.log(`📤 Output: ${result.output.substring(0, 300)}${result.output.length > 300 ? '...' : ''}`);
        }
        if (result.error) {
          console.log(`⚠️  Error Output: ${result.error.substring(0, 300)}${result.error.length > 300 ? '...' : ''}`);
        }
        
        // Small delay between commands for safety
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (cmdError) {
        console.error(`❌ Command failed: ${cmdError.message}`);
        
        const failedCmd = {
          ...cmd,
          result: 'failed',
          error: cmdError.message,
          executedAt: new Date().toISOString()
        };
        
        executedCommands.push(failedCmd);
        
        // Continue with next command even if one fails
        continue;
      }
    }
    
    console.log(`\n🎯 Execution Summary: ${executedCommands.filter(c => c.result === 'success').length}/${executedCommands.length} commands succeeded`);
    return executedCommands;
  }

  // Execute SSH command with detailed logging and enhanced timeout handling
  async executeSSHCommandWithLogging(conn, command, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const applicationPath = this.getApplicationPath();
      
      // Enhanced timeout handling for different command types
      let adjustedTimeout = timeout;
      
      // Significantly increased timeouts for download operations
      if (command.includes('wp plugin install') || command.includes('wp theme install')) {
        adjustedTimeout = 120000; // 2 minutes for plugin/theme downloads
      } else if (command.includes('wp core download')) {
        adjustedTimeout = 300000; // 5 minutes for core downloads
      } else if (command.includes('wget') || command.includes('curl')) {
        adjustedTimeout = 180000; // 3 minutes for direct downloads
      } else if (command.includes('unzip') || command.includes('tar')) {
        adjustedTimeout = 90000; // 1.5 minutes for extraction
      } else if (command.includes('wp db') || command.includes('mysql')) {
        adjustedTimeout = 60000; // 1 minute for database operations
      } else if (command.includes('wp plugin') || command.includes('wp theme')) {
        adjustedTimeout = 45000; // 45 seconds for plugin/theme operations
      } else if (command.includes('cp -r')) {
        adjustedTimeout = 60000; // 1 minute for backup operations
      }
      
      // Use custom timeout if provided in command metadata
      if (timeout && timeout > adjustedTimeout) {
        adjustedTimeout = timeout;
      }
      
      console.log(`⏱️  Command timeout set to ${adjustedTimeout/1000}s for: ${command.substring(0, 50)}...`);
      
      conn.exec(`cd ${applicationPath} && timeout ${Math.floor(adjustedTimeout/1000)} ${command}`, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        
        let output = '';
        let errorOutput = '';
        
        const timeoutId = setTimeout(() => {
          console.log(`⏰ Command timeout after ${adjustedTimeout/1000}s, attempting graceful termination...`);
          stream.destroy();
          
          // Return timeout result instead of rejecting
          resolve({
            output: output.trim(),
            error: `Command timeout after ${adjustedTimeout/1000}s: ${errorOutput.trim()}`,
            exitCode: 124, // Standard timeout exit code
            duration: adjustedTimeout,
            signal: 'TIMEOUT',
            timedOut: true
          });
        }, adjustedTimeout);
        
        stream.on('close', (code, signal) => {
          clearTimeout(timeoutId);
          const duration = Date.now() - startTime;
          
          resolve({
            output: output.trim(),
            error: errorOutput.trim(),
            exitCode: code,
            duration: duration,
            signal: signal,
            timedOut: false
          });
        }).on('data', (data) => {
          output += data.toString();
        }).stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
      });
    });
  }

  // Enhanced two-way communication between SSH and OpenAI with loop prevention
  async performTwoWayAISSHCommunication(conn, uniqueErrors, analysisResult) {
    const communicationProcess = {
      conversations: [],
      totalExchanges: 0,
      successfulCommands: 0,
      failedCommands: 0,
      finalStatus: 'unknown',
      loopPrevention: {
        commandHistory: new Set(),
        repeatedCommands: new Map(),
        stuckDetection: [],
        maxRepeats: 2,
        maxExchanges: 15,
        progressThreshold: 3 // Must make progress within 3 exchanges
      }
    };
    
    let conversationContext = {
      originalErrors: uniqueErrors.map(e => e.original),
      initialAnalysis: analysisResult.analysis,
      currentFocus: 'Initial error analysis and repair planning',
      commandHistory: [],
      lastProgress: 0,
      progressIndicators: []
    };
    
    console.log('🤖 Starting enhanced two-way AI-SSH communication...');
    console.log(`📋 Initial errors to address: ${uniqueErrors.length}`);
    console.log(`🔒 Loop prevention: Max ${communicationProcess.loopPrevention.maxExchanges} exchanges, ${communicationProcess.loopPrevention.maxRepeats} repeats per command`);
    
    let exchange = 0;
    let communicationComplete = false;
    
    while (!communicationComplete && exchange < communicationProcess.loopPrevention.maxExchanges) {
      exchange++;
      console.log(`\n💬 EXCHANGE ${exchange}/${communicationProcess.loopPrevention.maxExchanges}`);
      console.log('=' .repeat(60));
      
      try {
        // Step 1: AI analyzes current situation and decides next action
        const aiDecision = await this.getAIDecisionWithContext(conversationContext, exchange);
        
        if (!aiDecision || aiDecision.action === 'complete') {
          console.log('✅ AI indicates communication is complete');
          communicationComplete = true;
          communicationProcess.finalStatus = 'completed_by_ai';
          break;
        }
        
        // Step 1.5: Backup-first validation and auto-correction
        if (aiDecision.action === 'command' && aiDecision.command) {
          const backupValidation = this.validateBackupFirstApproach(aiDecision, conversationContext);
          if (backupValidation.needsBackup) {
            console.log(`🛡️  Backup-first validation: ${backupValidation.reason}`);
            console.log(`🔧 Auto-adding backup command: ${backupValidation.backupCommand.command}`);
            
            // Execute backup command first with appropriate timeout
            const backupTimeout = backupValidation.backupCommand.timeout || 60000; // Default 1 minute for backups
            const backupResult = await this.executeSSHCommandWithLogging(conn, backupValidation.backupCommand.command, backupTimeout);
            
            const backupExchange = {
              exchange: exchange,
              aiDecision: backupValidation.backupCommand,
              commandResult: backupResult,
              timestamp: new Date().toISOString(),
              autoGenerated: true
            };
            
            communicationProcess.conversations.push(backupExchange);
            communicationProcess.totalExchanges++;
            
            if (backupResult.exitCode === 0) {
              communicationProcess.successfulCommands++;
              console.log(`✅ Backup command executed successfully (Exit Code: ${backupResult.exitCode})`);
            } else {
              communicationProcess.failedCommands++;
              console.log(`❌ Backup command failed (Exit Code: ${backupResult.exitCode})`);
              console.log(`⚠️  Proceeding with original command despite backup failure`);
            }
            
            // Update conversation context with backup command
            conversationContext.commandHistory.push({
              exchange: exchange,
              command: backupValidation.backupCommand.command,
              description: backupValidation.backupCommand.description,
              output: backupResult.output,
              error: backupResult.error,
              exitCode: backupResult.exitCode,
              success: backupResult.exitCode === 0,
              timestamp: backupExchange.timestamp,
              autoGenerated: true
            });
          }
        }
        
        // Step 2: Loop prevention checks
        const loopCheck = this.checkForLoops(aiDecision, communicationProcess.loopPrevention);
        if (loopCheck.shouldStop) {
          console.log(`🛑 Loop prevention triggered: ${loopCheck.reason}`);
          communicationComplete = true;
          communicationProcess.finalStatus = loopCheck.reason;
          break;
        }
        
        console.log(`🎯 AI Decision: ${aiDecision.reasoning}`);
        console.log(`📋 Action: ${aiDecision.description}`);
        console.log(`🔍 Command: ${aiDecision.command}`);
        console.log(`🛡️  Safety Level: ${aiDecision.safety}`);
        
        // Step 3: Execute the command with custom timeout and retry logic for downloads
        const commandTimeout = aiDecision.timeout ? (aiDecision.timeout * 1000) : 30000; // Convert to milliseconds
        let commandResult = await this.executeSSHCommandWithLogging(conn, aiDecision.command, commandTimeout);
        
        // Retry logic for failed download operations
        if (commandResult.exitCode !== 0 && (
          aiDecision.command.includes('wp plugin install') || 
          aiDecision.command.includes('wp theme install') || 
          aiDecision.command.includes('wp core download')
        )) {
          console.log(`⚠️  Download command failed, retrying with increased timeout...`);
          const retryTimeout = commandTimeout * 2; // Double the timeout for retry
          commandResult = await this.executeSSHCommandWithLogging(conn, aiDecision.command, retryTimeout);
          
          if (commandResult.exitCode === 0) {
            console.log(`✅ Download succeeded on retry with ${retryTimeout/1000}s timeout`);
          } else {
            console.log(`❌ Download failed even after retry with ${retryTimeout/1000}s timeout`);
            
            // Try fallback approach if available
            if (aiDecision.fallback) {
              console.log(`🔄 Attempting fallback approach: ${aiDecision.fallback}`);
              // Note: Fallback would need to be implemented based on the specific command
            }
          }
        }
        
        const executedExchange = {
          exchange: exchange,
          aiDecision: aiDecision,
          commandResult: commandResult,
          timestamp: new Date().toISOString()
        };
        
        communicationProcess.conversations.push(executedExchange);
        communicationProcess.totalExchanges++;
        
        if (commandResult.exitCode === 0) {
          communicationProcess.successfulCommands++;
          console.log(`✅ Command executed successfully (Exit Code: ${commandResult.exitCode})`);
        } else {
          communicationProcess.failedCommands++;
          console.log(`❌ Command failed (Exit Code: ${commandResult.exitCode})`);
        }
        
        if (commandResult.output) {
          console.log(`📤 Output: ${commandResult.output.substring(0, 300)}${commandResult.output.length > 300 ? '...' : ''}`);
        }
        if (commandResult.error) {
          console.log(`⚠️  Error Output: ${commandResult.error.substring(0, 300)}${commandResult.error.length > 300 ? '...' : ''}`);
        }
        
        // Step 4: Update conversation context with results
        conversationContext.commandHistory.push({
          exchange: exchange,
          command: aiDecision.command,
          description: aiDecision.description,
          output: commandResult.output,
          error: commandResult.error,
          exitCode: commandResult.exitCode,
          success: commandResult.exitCode === 0,
          timestamp: executedExchange.timestamp
        });
        
        // Step 5: AI analyzes the command result and provides feedback
        const aiAnalysis = await this.getAIAnalysisOfResult(conversationContext, executedExchange);
        
        conversationContext.currentFocus = aiAnalysis.nextFocus || 'Continuing repair process';
        
        console.log(`🤖 AI Analysis: ${aiAnalysis.analysis}`);
        console.log(`🎯 Next Focus: ${conversationContext.currentFocus}`);
        
        // Step 6: Progress tracking and stuck detection
        const progressCheck = this.checkProgress(aiAnalysis, communicationProcess, exchange);
        if (progressCheck.isStuck) {
          console.log(`🔄 Stuck detection: ${progressCheck.reason}`);
          
          // Try to break out of stuck state
          conversationContext.currentFocus = 'System appears stuck, trying alternative approach';
          
          if (progressCheck.shouldStop) {
            communicationComplete = true;
            communicationProcess.finalStatus = 'stuck_detection_stop';
            break;
          }
        }
        
        // Step 7: Check if AI says we should continue
        if (!aiAnalysis.shouldContinue) {
          console.log('🏁 AI indicates communication should stop');
          communicationComplete = true;
          communicationProcess.finalStatus = aiAnalysis.reason || 'stopped_by_ai';
          break;
        }
        
        // Step 8: Update loop prevention tracking
        this.updateLoopPrevention(aiDecision, communicationProcess.loopPrevention);
        
        // Small delay between exchanges for stability
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (exchangeError) {
        console.error(`❌ Error in exchange ${exchange}:`, exchangeError.message);
        
        communicationProcess.conversations.push({
          exchange: exchange,
          error: exchangeError.message,
          failed: true,
          timestamp: new Date().toISOString()
        });
        
        // Continue to next exchange unless it's a critical error
        if (exchangeError.message.includes('OpenAI') || exchangeError.message.includes('API')) {
          console.log('🛑 Critical AI error, stopping communication');
          communicationProcess.finalStatus = 'ai_error';
          break;
        }
      }
    }
    
    if (exchange >= communicationProcess.loopPrevention.maxExchanges) {
      console.log('⏰ Maximum exchanges reached, stopping communication');
      communicationProcess.finalStatus = 'max_exchanges_reached';
    }
    
    console.log(`\n🎯 TWO-WAY COMMUNICATION SUMMARY`);
    console.log('=' .repeat(60));
    console.log(`Total Exchanges: ${exchange}`);
    console.log(`Successful Commands: ${communicationProcess.successfulCommands}`);
    console.log(`Failed Commands: ${communicationProcess.failedCommands}`);
    console.log(`Final Status: ${communicationProcess.finalStatus}`);
    console.log(`Success Rate: ${Math.round((communicationProcess.successfulCommands / Math.max(1, communicationProcess.totalExchanges)) * 100)}%`);
    console.log('=' .repeat(60));
    
    return {
      process: communicationProcess,
      conversations: communicationProcess.conversations
    };
  }

  // Get AI decision with enhanced context awareness
  async getAIDecisionWithContext(context, exchange) {
    const systemPrompt = `You are a production-grade WordPress system administrator expert performing automated repairs via SSH.

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                                    PRODUCTION SAFETY MANDATE
═══════════════════════════════════════════════════════════════════════════════════════════════════════

BACKUP-FIRST PROTOCOL (ABSOLUTE REQUIREMENT):
1. MANDATORY: Create timestamped backup before ANY destructive operation
2. MANDATORY: Verify backup exists before proceeding with removal
3. MANDATORY: Follow exact sequence: BACKUP → DEACTIVATE → REMOVE → REINSTALL → VERIFY
4. MANDATORY: Use proper error handling and validation at each step
5. MANDATORY: Never proceed without successful backup creation

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              BACKUP COMMANDS (STANDARDIZED FORMAT)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

PLUGIN BACKUP:
cp -r wp-content/plugins/[name] wp-content/plugins/[name].backup.$(date +%Y%m%d_%H%M%S) && ls -la wp-content/plugins/[name].backup.$(date +%Y%m%d_%H%M%S) && echo "BACKUP_SUCCESS" || echo "BACKUP_FAILED"

THEME BACKUP:
cp -r wp-content/themes/[name] wp-content/themes/[name].backup.$(date +%Y%m%d_%H%M%S) && ls -la wp-content/themes/[name].backup.$(date +%Y%m%d_%H%M%S) && echo "BACKUP_SUCCESS" || echo "BACKUP_FAILED"

CORE BACKUP:
cp -r wp-admin wp-admin.backup.$(date +%Y%m%d_%H%M%S) && cp -r wp-includes wp-includes.backup.$(date +%Y%m%d_%H%M%S) && cp wp-cron.php wp-cron.php.backup.$(date +%Y%m%d_%H%M%S) && echo "CORE_BACKUP_SUCCESS" || echo "CORE_BACKUP_FAILED"

CONFIG BACKUP:
cp wp-config.php wp-config.php.backup.$(date +%Y%m%d_%H%M%S) && cp .htaccess .htaccess.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null; echo "CONFIG_BACKUP_COMPLETE"

HTACCESS BACKUP:
cp .htaccess .htaccess.backup.$(date +%Y%m%d_%H%M%S) && echo "HTACCESS_BACKUP_SUCCESS" || echo "HTACCESS_BACKUP_FAILED"

VERIFY BACKUP EXISTS:
ls -la [path].backup.* 2>/dev/null && echo "BACKUP_VERIFIED" || echo "BACKUP_MISSING"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              CRITICAL FLAG REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════════════════════════════

MANDATORY FLAGS FOR ALL WP-CLI OPERATIONS:
• --allow-root (when running as root user)
• --skip-plugins (bypass plugin loading to prevent conflicts)
• --skip-themes (bypass theme loading to prevent conflicts)
• --force (overwrite existing installations)

CRITICAL RULE: ALWAYS use BOTH --skip-plugins AND --skip-themes together
CRITICAL RULE: NEVER attempt operations without these flags on corrupted sites

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 1: PHP PARSE/SYNTAX ERRORS
                    (WP-CLI Inaccessible - WordPress Won't Load)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• White screen of death (WSOD)
• Fatal error: Uncaught SyntaxError/ParseError
• WP-CLI commands return PHP errors
• Cannot access wp-admin

WORKFLOW (DIRECT FILE OPERATIONS - WP-CLI BYPASSED):

STEP 1 - BACKUP (MANDATORY):
cp -r wp-content/plugins/[plugin-name] wp-content/plugins/[plugin-name].backup.$(date +%Y%m%d_%H%M%S) && ls -la wp-content/plugins/[plugin-name].backup.* && echo "BACKUP_OK" || echo "BACKUP_FAILED"

STEP 2 - REMOVE CORRUPTED FILES (ONLY AFTER BACKUP):
rm -rf wp-content/plugins/[plugin-name] && echo "REMOVAL_SUCCESS" || echo "REMOVAL_FAILED"

STEP 3 - CLEAR PHP OPCACHE (IF AVAILABLE):
php -r 'if (function_exists("opcache_reset")) { opcache_reset(); echo "OPCACHE_CLEARED"; } else { echo "OPCACHE_NOT_AVAILABLE"; }'

STEP 4 - REINSTALL VIA WP-CLI (Now that PHP errors are cleared):
wp plugin install [plugin-name] --force --allow-root && echo "REINSTALL_SUCCESS" || echo "REINSTALL_FAILED"

STEP 5 - VERIFY:
wp plugin list --allow-root && wp core version --allow-root

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 2: PLUGIN CONFLICTS
                    (White Screen - Admin Possibly Accessible)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• Site works but breaks when specific plugin active
• Admin accessible but frontend broken
• Error logs point to specific plugin file

WORKFLOW A - SINGLE PLUGIN REPAIR:

STEP 1 - BACKUP:
cp -r wp-content/plugins/[plugin-name] wp-content/plugins/[plugin-name].backup.$(date +%Y%m%d_%H%M%S) && ls -la wp-content/plugins/[plugin-name].backup.* && echo "BACKUP_OK" || echo "BACKUP_FAILED"

STEP 2 - DEACTIVATE (CRITICAL: USE BOTH FLAGS):
wp plugin deactivate [plugin-name] --skip-plugins --skip-themes --allow-root && echo "DEACTIVATE_SUCCESS" || echo "DEACTIVATE_FAILED"

STEP 3 - REMOVE (ONLY IF DEACTIVATED OR PARSE ERROR):
wp plugin delete [plugin-name] --allow-root && echo "DELETE_SUCCESS" || echo "DELETE_FAILED"

STEP 4 - REINSTALL:
wp plugin install [plugin-name] --force --allow-root && echo "INSTALL_SUCCESS" || echo "INSTALL_FAILED"

STEP 5 - CONDITIONAL REACTIVATE (Ask user or auto-activate):
wp plugin activate [plugin-name] --skip-plugins --skip-themes --allow-root && echo "ACTIVATE_SUCCESS" || echo "ACTIVATE_FAILED"

WORKFLOW B - BULK PLUGIN DISABLE (When culprit unknown):

STEP 1 - BACKUP ENTIRE PLUGINS DIRECTORY:
cp -r wp-content/plugins wp-content/plugins.backup.$(date +%Y%m%d_%H%M%S) && echo "BULK_BACKUP_OK" || echo "BULK_BACKUP_FAILED"

STEP 2 - DISABLE ALL PLUGINS:
wp plugin deactivate --all --skip-plugins --skip-themes --allow-root && echo "ALL_DEACTIVATED" || echo "BULK_DEACTIVATE_FAILED"

STEP 3 - ENABLE ONE-BY-ONE (Manual or scripted):
wp plugin activate [plugin-1] --skip-plugins --skip-themes --allow-root && echo "PLUGIN_1_OK" || echo "PLUGIN_1_CONFLICT"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 3: THEME ERRORS
                    (Frontend Broken - Admin May Work)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• Frontend white screen or broken layout
• Admin accessible but shows theme errors
• Error logs point to theme functions.php

CRITICAL RULE: NEVER DELETE ACTIVE THEME WITHOUT FALLBACK

WORKFLOW - SAFE THEME REPAIR:

STEP 1 - BACKUP CORRUPTED THEME:
cp -r wp-content/themes/[theme-name] wp-content/themes/[theme-name].backup.$(date +%Y%m%d_%H%M%S) && ls -la wp-content/themes/[theme-name].backup.* && echo "THEME_BACKUP_OK" || echo "THEME_BACKUP_FAILED"

STEP 2 - INSTALL FALLBACK THEME (MULTIPLE OPTIONS WITH ||):
wp theme install twentytwentyfour --force --allow-root || wp theme install twentytwentythree --force --allow-root || wp theme install twentytwentytwo --force --allow-root || wp theme install hello-elementor --force --allow-root || echo "FALLBACK_INSTALL_FAILED"

STEP 3 - ACTIVATE FALLBACK (DEACTIVATES CORRUPTED THEME):
wp theme activate twentytwentyfour --skip-plugins --skip-themes --allow-root || wp theme activate twentytwentythree --skip-plugins --skip-themes --allow-root || wp theme activate twentytwentytwo --skip-plugins --skip-themes --allow-root || wp theme activate hello-elementor --skip-plugins --skip-themes --allow-root || echo "FALLBACK_ACTIVATE_FAILED"

STEP 4 - VERIFY FALLBACK ACTIVE:
wp theme list --allow-root | grep -E "(twentytwentyfour|twentytwentythree|twentytwentytwo|hello-elementor)" && echo "FALLBACK_VERIFIED" || echo "FALLBACK_NOT_ACTIVE"

STEP 5 - DELETE CORRUPTED THEME (ONLY AFTER FALLBACK CONFIRMED):
wp theme delete [theme-name] --allow-root && echo "CORRUPTED_THEME_DELETED" || echo "DELETE_FAILED"

STEP 6 - REINSTALL ORIGINAL THEME:
wp theme install [theme-name] --force --allow-root && echo "THEME_REINSTALLED" || echo "THEME_REINSTALL_FAILED"

STEP 7 - REACTIVATE ORIGINAL (OPTIONAL):
wp theme activate [theme-name] --skip-plugins --skip-themes --allow-root && echo "ORIGINAL_THEME_ACTIVE" || echo "ACTIVATION_FAILED"

STEP 8 - CLEANUP FALLBACK (OPTIONAL):
wp theme delete twentytwentyfour --allow-root 2>/dev/null; wp theme delete twentytwentythree --allow-root 2>/dev/null; echo "FALLBACK_CLEANUP_DONE"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 4: CORE FILE CORRUPTION
                    (WordPress Core Files Modified/Missing)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• wp-admin or wp-includes files missing
• Core files show modifications
• WordPress version mismatch errors

WORKFLOW:

STEP 1 - BACKUP CRITICAL FILES:
cp wp-config.php wp-config.php.backup.$(date +%Y%m%d_%H%M%S) && cp -r wp-content wp-content.backup.$(date +%Y%m%d_%H%M%S) && echo "CRITICAL_BACKUP_OK" || echo "CRITICAL_BACKUP_FAILED"

STEP 2 - VERIFY CHECKSUMS:
wp core verify-checksums --allow-root && echo "CHECKSUMS_OK" || echo "CHECKSUMS_FAILED"

STEP 3 - REINSTALL CORE (FORCE DOWNLOAD):
wp core download --force --allow-root && echo "CORE_REINSTALLED" || echo "CORE_REINSTALL_FAILED"

STEP 4 - VERIFY VERSION:
wp core version --allow-root && echo "VERSION_VERIFIED" || echo "VERSION_CHECK_FAILED"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 5: PERMALINK/REWRITE ERRORS
                    (404 Errors, Redirect Loops, Broken URLs)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• 404 errors on existing posts/pages
• Redirect loops
• Pretty permalinks not working

WORKFLOW:

STEP 1 - BACKUP HTACCESS:
cp .htaccess .htaccess.backup.$(date +%Y%m%d_%H%M%S) && ls -la .htaccess.backup.* && echo "HTACCESS_BACKUP_OK" || echo "HTACCESS_BACKUP_FAILED"

STEP 2 - FLUSH REWRITES:
wp rewrite flush --hard --allow-root && echo "REWRITE_FLUSHED" || echo "FLUSH_FAILED"

STEP 3 - REGENERATE STRUCTURE:
wp rewrite structure '/%postname%/' --allow-root && echo "STRUCTURE_SET" || echo "STRUCTURE_FAILED"

STEP 4 - VERIFY:
wp rewrite list --allow-root | head -5 && echo "REWRITES_VERIFIED" || echo "REWRITE_CHECK_FAILED"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 6: FILE PERMISSIONS/OWNERSHIP
                    (WP-CLI Permission Denied, Upload Failures)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• Permission denied errors
• Cannot write to wp-content
• Upload failures

WORKFLOW:

STEP 1 - CHECK CURRENT PERMISSIONS:
ls -la wp-content/ && ls -la wp-content/plugins/ && ls -la wp-content/themes/ && ls -la wp-content/uploads/ 2>/dev/null && echo "PERMISSIONS_CHECKED" || echo "CHECK_FAILED"

STEP 2 - FIX DIRECTORY PERMISSIONS (755):
find . -type d -exec chmod 755 {} \; && echo "DIR_PERMISSIONS_FIXED" || echo "DIR_FIX_FAILED"

STEP 3 - FIX FILE PERMISSIONS (644):
find . -type f -exec chmod 644 {} \; && echo "FILE_PERMISSIONS_FIXED" || echo "FILE_FIX_FAILED"

STEP 4 - FIX OWNERSHIP (Adjust user as needed):
chown -R www-data:www-data . && echo "OWNERSHIP_FIXED" || echo "CHOWN_FAILED"

STEP 5 - VERIFY WP-CLI WORKS:
wp core version --allow-root && echo "WPCLI_FUNCTIONAL" || echo "WPCLI_STILL_BROKEN"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 7: MEDIA/UPLOAD ISSUES
                    (Broken Images, Upload Failures, Missing Thumbnails)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• Images not displaying
• Upload errors in media library
• Missing thumbnail sizes

WORKFLOW:

STEP 1 - CHECK UPLOADS DIRECTORY:
ls -la wp-content/uploads/ 2>/dev/null && echo "UPLOADS_EXIST" || echo "UPLOADS_MISSING"

STEP 2 - FIX UPLOADS PERMISSIONS:
chmod 755 wp-content/uploads/ -R 2>/dev/null && chown -R www-data:www-data wp-content/uploads/ 2>/dev/null && echo "UPLOADS_PERMISSIONS_FIXED" || echo "UPLOADS_FIX_FAILED"

STEP 3 - CREATE UPLOADS IF MISSING:
mkdir -p wp-content/uploads && chmod 755 wp-content/uploads && chown www-data:www-data wp-content/uploads && echo "UPLOADS_CREATED" || echo "UPLOADS_CREATE_FAILED"

STEP 4 - REGENERATE THUMBNAILS:
wp media regenerate --allow-root && echo "THUMBNAILS_REGENERATED" || echo "REGENERATE_FAILED"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 8: CACHE/APC/MEMCACHED ISSUES
                    (Stale Content, Changes Not Reflecting)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• Changes not visible after edits
• Old content still displaying
• Cache plugins causing conflicts

WORKFLOW:

STEP 1 - CLEAR OBJECT CACHE:
wp cache flush --allow-root && echo "OBJECT_CACHE_CLEARED" || echo "OBJECT_CACHE_CLEAR_FAILED"

STEP 2 - CLEAR TRANSIENTS:
wp transient delete --all --allow-root && echo "TRANSIENTS_CLEARED" || echo "TRANSIENT_CLEAR_FAILED"

STEP 3 - CLEAR PHP OPCACHE:
php -r 'if (function_exists("opcache_reset")) { opcache_reset(); echo "OPCACHE_CLEARED"; } else { echo "OPCACHE_NOT_AVAILABLE"; }'

STEP 4 - DEACTIVATE CACHE PLUGINS (IF CONFLICT):
wp plugin deactivate wp-super-cache w3-total-cache wp-rocket litespeed-cache --skip-plugins --skip-themes --allow-root 2>/dev/null && echo "CACHE_PLUGINS_DEACTIVATED" || echo "NO_CACHE_PLUGINS_ACTIVE"

STEP 5 - CLEAR PLUGIN-SPECIFIC CACHES:
rm -rf wp-content/cache/* 2>/dev/null; rm -rf wp-content/w3tc-* 2>/dev/null; rm -rf wp-content/wp-super-cache/* 2>/dev/null; rm -rf wp-content/uploads/wp-rocket-config/* 2>/dev/null; echo "CACHE_FILES_CLEARED" || echo "CACHE_CLEAR_FAILED"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 9: MULTISITE ERRORS
                    (Network Issues, Site Registration Problems)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• Subsites not accessible
• Network admin errors
• Cross-site permission issues

WORKFLOW:

STEP 1 - VERIFY MULTISITE INSTALLATION:
wp core is-installed --network --allow-root && echo "MULTISITE_VERIFIED" || echo "NOT_MULTISITE"

STEP 2 - FLUSH NETWORK REWRITES:
wp rewrite flush --hard --network --allow-root && echo "NETWORK_REWRITES_FLUSHED" || echo "NETWORK_FLUSH_FAILED"

STEP 3 - VERIFY SITES:
wp site list --allow-root && echo "SITES_LISTED" || echo "SITE_LIST_FAILED"

STEP 4 - REPAIR SPECIFIC SITE (if needed):
wp site switch [site-id] --allow-root 2>/dev/null; wp plugin deactivate [plugin] --skip-plugins --skip-themes --allow-root && echo "SITE_SPECIFIC_REPAIR_DONE" || echo "SITE_REPAIR_FAILED"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              SCENARIO 10: REST API/JSON ERRORS
                    (Block Editor Broken, API Returns 404/500)
═══════════════════════════════════════════════════════════════════════════════════════════════════════

IDENTIFICATION:
• Block editor not loading
• /wp-json/ returns 404 or 500
• REST API disabled/broken

WORKFLOW:

STEP 1 - VERIFY REST API AVAILABILITY:
wp rest list --allow-root && echo "REST_API_AVAILABLE" || echo "REST_API_ISSUE"

STEP 2 - CHECK PERMALINKS (REST depends on these):
wp rewrite flush --hard --allow-root && echo "REWRITES_FLUSHED" || echo "REWRITE_FLUSH_FAILED"

STEP 3 - DISABLE PLUGINS BLOCKING REST:
wp plugin deactivate [rest-blocking-plugin] --skip-plugins --skip-themes --allow-root 2>/dev/null && echo "BLOCKING_PLUGIN_DISABLED" || echo "NO_BLOCKING_PLUGIN"

STEP 4 - VERIFY JSON ENDPOINT:
curl -s -o /dev/null -w "%{http_code}" [site-url]/wp-json/ 2>/dev/null | grep -E "200|401" && echo "REST_ENDPOINT_RESPONDING" || echo "REST_ENDPOINT_STILL_BROKEN"

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              || OPERATOR USAGE RULES
═══════════════════════════════════════════════════════════════════════════════════════════════════════

WHEN TO USE || (OR OPERATOR):
✓ Multiple fallback installation sources (themes/plugins)
✓ Alternative activation methods when primary fails
✓ Different default theme options
✓ Graceful error handling with echo statements
✓ Chaining backup verification with fallback checks

WHEN NOT TO USE ||:
✗ Backup creation (must succeed, no fallback)
✗ Critical deactivation steps (must verify success/failure separately)
✗ Removal commands (must verify backup first, no fallback)
✗ Single-step verification commands

CORRECT || USAGE EXAMPLES:

INSTALLATION FALLBACKS:
wp theme install twentytwentyfour --force --allow-root || wp theme install twentytwentythree --force --allow-root || wp theme install hello-elementor --force --allow-root || echo "ALL_FALLBACKS_FAILED"

ACTIVATION FALLBACKS:
wp theme activate twentytwentyfour --skip-plugins --skip-themes --allow-root || wp theme activate twentytwentythree --skip-plugins --skip-themes --allow-root || echo "ACTIVATION_FAILED"

PLUGIN INSTALL WITH MANUAL FALLBACK:
wp plugin install [name] --force --allow-root || (wget -q https://downloads.wordpress.org/plugin/[name].zip -O /tmp/[name].zip && unzip -q /tmp/[name].zip -d wp-content/plugins/ && rm /tmp/[name].zip) || echo "PLUGIN_INSTALL_FAILED"

INCORRECT || USAGE (DO NOT USE):
cp -r plugins/[name] plugins/[name].backup.* || echo "BACKUP_FAILED"  (Backup must not fail, check separately)
rm -rf plugins/[name] || echo "REMOVE_FAILED"  (Removal must be verified, not fall-backed)

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              COMMAND EXECUTION RULES
═══════════════════════════════════════════════════════════════════════════════════════════════════════

OUTPUT REQUIREMENTS:
• Generate ONLY executable SSH commands
• Include verification steps after each critical operation
• Use echo statements for status reporting
• Chain related commands with && for atomic operations
• Use || ONLY for fallbacks, not for critical safety checks

SAFETY CHECKS:
• Verify backup exists before removal
• Verify deactivation before deletion
• Verify fallback theme active before removing corrupted theme
• Never use rm -rf without confirmed backup

NO CD COMMANDS:
• System auto-navigates to correct directory
• Never include "cd /path" in responses
• Use relative paths from WordPress root

═══════════════════════════════════════════════════════════════════════════════════════════════════════
                              VERIFICATION PROTOCOL
═══════════════════════════════════════════════════════════════════════════════════════════════════════

AFTER EVERY REPAIR, EXECUTE:
1. wp core version --allow-root (confirm WordPress loads)
2. wp plugin list --allow-root --field=name,status (confirm plugin states)
3. wp theme list --allow-root --field=name,status (confirm theme states)
4. wp rewrite list --allow-root | head -3 (confirm permalinks work)


JSON OUTPUT FORMAT (STRICT):
{
  "action": "command|complete",
  "command": "exact SSH command (required if action=command)",
  "description": "brief action description (required)",
  "reasoning": "why this action is needed (required)",
  "safety": "high|medium|low (required)",
  "type": "backup|verify|deactivate|remove|install|activate|diagnostic|complete (required)",
  "timeout": "expected timeout in seconds (optional, default 30)",
  "fallback": "alternative approach if this fails (optional)"
}


CRITICAL: Never output anything except valid JSON. Any non-JSON output will cause system failure.`;

    const conversationHistory = context.commandHistory.map((cmd, i) => 
      `Exchange ${cmd.exchange}: ${cmd.description}\n` +
      `Command: ${cmd.command}\n` +
      `Result: ${cmd.success ? 'SUCCESS' : 'FAILED'} (Exit Code: ${cmd.exitCode})\n` +
      `Output: ${cmd.output || 'No output'}\n` +
      `Error: ${cmd.error || 'No error'}\n`
    ).join('\n');

    const userPrompt = `Continue the two-way communication with the server based on this context:

ORIGINAL ISSUES TO ADDRESS:
${context.originalErrors.join('\n')}

INITIAL AI ANALYSIS:
${context.initialAnalysis}

CURRENT FOCUS:
${context.currentFocus}

CONVERSATION HISTORY (${context.commandHistory.length} exchanges so far):
${conversationHistory || 'No previous exchanges'}

CURRENT EXCHANGE: ${exchange}/15

Based on the conversation so far, what should be the next action? Consider:
- Are the original issues resolved?
- Do you need more diagnostic information?
- Should you try a different repair approach?
- Is the conversation complete?`;

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 800
      }, {
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const responseText = response.data.choices[0].message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : responseText;
        const parsedDecision = JSON.parse(jsonText);
        
        // Validate required fields for production
        const requiredFields = ['action', 'description', 'reasoning', 'safety', 'type'];
        const missingFields = requiredFields.filter(field => !parsedDecision[field]);
        
        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }
        
        // Validate action field
        if (!['command', 'complete'].includes(parsedDecision.action)) {
          throw new Error(`Invalid action: ${parsedDecision.action}. Must be 'command' or 'complete'`);
        }
        
        // Validate command field if action is command
        if (parsedDecision.action === 'command' && !parsedDecision.command) {
          throw new Error('Command field is required when action is "command"');
        }
        
        // Validate safety field
        if (!['high', 'medium', 'low'].includes(parsedDecision.safety)) {
          throw new Error(`Invalid safety level: ${parsedDecision.safety}. Must be 'high', 'medium', or 'low'`);
        }
        
        // Validate type field
        const validTypes = ['backup', 'verify', 'deactivate', 'remove', 'install', 'activate', 'diagnostic', 'complete'];
        if (!validTypes.includes(parsedDecision.type)) {
          throw new Error(`Invalid type: ${parsedDecision.type}. Must be one of: ${validTypes.join(', ')}`);
        }
        
        // Set default timeout if not provided
        if (parsedDecision.action === 'command' && !parsedDecision.timeout) {
          // Set intelligent defaults based on command type
          if (parsedDecision.command.includes('wp plugin install') || parsedDecision.command.includes('wp theme install')) {
            parsedDecision.timeout = 120; // 2 minutes for downloads
          } else if (parsedDecision.command.includes('wp core download')) {
            parsedDecision.timeout = 300; // 5 minutes for core downloads
          } else if (parsedDecision.command.includes('cp -r')) {
            parsedDecision.timeout = 60; // 1 minute for backups
          } else {
            parsedDecision.timeout = 30; // Default 30 seconds
          }
        }
        
        return parsedDecision;
      } catch (parseError) {
        console.error('❌ Failed to parse AI decision response:', parseError.message);
        console.log('Raw response:', responseText);
        throw new Error(`Invalid JSON response from OpenAI: ${parseError.message}`);
      }

    } catch (error) {
      console.error('OpenAI Decision Error:', error.response?.data || error.message);
      throw new Error(`AI decision failed: ${error.message}`);
    }
  }

  // Get AI analysis of command result with conversation context
  async getAIAnalysisOfResult(context, executedExchange) {
    const systemPrompt = `You are analyzing the result of a command executed during two-way communication with a server.

Your task is to:
1. Analyze what the command accomplished
2. Determine if progress was made toward resolving the original issues
3. Decide if the conversation should continue
4. Set the focus for the next exchange

Provide analysis in JSON format:
{
  "analysis": "brief analysis of what happened and current status",
  "shouldContinue": true/false,
  "nextFocus": "what should be the focus for the next exchange",
  "progressMade": true/false,
  "reason": "if shouldContinue is false, explain why"
}`;

    const userPrompt = `Analyze this command execution result:

COMMAND EXECUTED:
${executedExchange.aiDecision.command}

COMMAND PURPOSE:
${executedExchange.aiDecision.description}

EXECUTION RESULT:
- Exit Code: ${executedExchange.commandResult.exitCode}
- Success: ${executedExchange.commandResult.exitCode === 0}
- Output: ${executedExchange.commandResult.output || 'No output'}
- Error: ${executedExchange.commandResult.error || 'No error'}

ORIGINAL ISSUES:
${context.originalErrors.join('\n')}

CONVERSATION HISTORY:
${context.commandHistory.length} previous exchanges

Analyze this result and determine next steps for the conversation.`;

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const responseText = response.data.choices[0].message?.content;
      if (!responseText) {
        return {
          analysis: 'No analysis available',
          shouldContinue: true,
          nextFocus: 'Continue with repair process',
          progressMade: false
        };
      }

      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : responseText;
        return JSON.parse(jsonText);
      } catch (parseError) {
        console.warn('Could not parse AI analysis response, using defaults');
        return {
          analysis: responseText.substring(0, 200),
          shouldContinue: true,
          nextFocus: 'Continue with repair process',
          progressMade: false
        };
      }

    } catch (error) {
      console.error('OpenAI Analysis Error:', error.response?.data || error.message);
      return {
        analysis: 'Analysis failed, continuing with repair',
        shouldContinue: true,
        nextFocus: 'Continue with repair process',
        progressMade: false
      };
    }
  }

  // Validate backup-first approach and auto-generate backup commands if needed
  validateBackupFirstApproach(aiDecision, conversationContext) {
    const command = aiDecision.command;
    
    // Check if this is a destructive operation that needs backup
    const isDestructiveOperation = command.includes('rm -rf wp-content/') || 
                                 command.includes('wp plugin delete') ||
                                 command.includes('wp theme delete');
    
    if (!isDestructiveOperation) {
      return { needsBackup: false };
    }
    
    // Check if a backup was already created in recent commands
    const recentBackupCommands = conversationContext.commandHistory
      .slice(-3) // Check last 3 commands
      .filter(cmd => cmd.command.includes('cp -r wp-content/') && cmd.command.includes('.backup.'));
    
    // Extract plugin/theme name from destructive command
    let targetName = null;
    let targetType = null;
    
    const pluginRmMatch = command.match(/rm -rf wp-content\/plugins\/([a-zA-Z0-9_-]+)/);
    const pluginDeleteMatch = command.match(/wp plugin delete ([a-zA-Z0-9_-]+)/);
    const themeRmMatch = command.match(/rm -rf wp-content\/themes\/([a-zA-Z0-9_-]+)/);
    const themeDeleteMatch = command.match(/wp theme delete ([a-zA-Z0-9_-]+)/);
    
    if (pluginRmMatch || pluginDeleteMatch) {
      targetName = pluginRmMatch ? pluginRmMatch[1] : pluginDeleteMatch[1];
      targetType = 'plugin';
    } else if (themeRmMatch || themeDeleteMatch) {
      targetName = themeRmMatch ? themeRmMatch[1] : themeDeleteMatch[1];
      targetType = 'theme';
    }
    
    if (!targetName || !targetType) {
      return { needsBackup: false };
    }
    
    // Check if backup already exists for this specific plugin/theme
    const hasRecentBackup = recentBackupCommands.some(cmd => 
      cmd.command.includes(`wp-content/${targetType}s/${targetName}`) && 
      cmd.command.includes(`${targetName}.backup.`)
    );
    
    if (hasRecentBackup) {
      return { needsBackup: false };
    }
    
    // Generate backup command
    const backupCommand = {
      action: 'command',
      command: `cp -r wp-content/${targetType}s/${targetName} wp-content/${targetType}s/${targetName}.backup.$(date +%Y%m%d_%H%M%S)`,
      description: `Create backup of ${targetName} ${targetType} before removal`,
      reasoning: `Backup-first approach requires creating backup before destructive operation on ${targetName} ${targetType}`,
      safety: 'high',
      type: 'backup',
      timeout: 60 // 1 minute for backup operations
    };
    
    return {
      needsBackup: true,
      reason: `Destructive operation on ${targetName} ${targetType} requires backup first`,
      backupCommand: backupCommand,
      targetName: targetName,
      targetType: targetType
    };
  }

  // Check for loops and repetitive behavior
  checkForLoops(aiDecision, loopPrevention) {
    const command = aiDecision.command;
    
    // Check if command was already executed
    if (loopPrevention.commandHistory.has(command)) {
      const repeatCount = loopPrevention.repeatedCommands.get(command) || 0;
      loopPrevention.repeatedCommands.set(command, repeatCount + 1);
      
      if (repeatCount >= loopPrevention.maxRepeats) {
        return {
          shouldStop: true,
          reason: `command_repeated_too_many_times: ${command}`
        };
      }
    } else {
      loopPrevention.commandHistory.add(command);
      loopPrevention.repeatedCommands.set(command, 1);
    }
    
    return { shouldStop: false };
  }

  // Check progress and detect stuck states
  checkProgress(aiAnalysis, communicationProcess, exchange) {
    const progressMade = aiAnalysis.progressMade || false;
    
    if (progressMade) {
      communicationProcess.loopPrevention.lastProgress = exchange;
    }
    
    const exchangesSinceProgress = exchange - communicationProcess.loopPrevention.lastProgress;
    
    if (exchangesSinceProgress >= communicationProcess.loopPrevention.progressThreshold) {
      return {
        isStuck: true,
        reason: `No progress made in ${exchangesSinceProgress} exchanges`,
        shouldStop: exchangesSinceProgress >= (communicationProcess.loopPrevention.progressThreshold * 2)
      };
    }
    
    return { isStuck: false };
  }

  // Update loop prevention tracking
  updateLoopPrevention(aiDecision, loopPrevention) {
    // Add to stuck detection history
    loopPrevention.stuckDetection.push({
      command: aiDecision.command,
      type: aiDecision.type,
      timestamp: Date.now()
    });
    
    // Keep only recent history (last 5 commands)
    if (loopPrevention.stuckDetection.length > 5) {
      loopPrevention.stuckDetection.shift();
    }
  }
  async getNextCommandFromAI(context, iteration) {
    const systemPrompt = `You are a WordPress system administrator expert performing iterative, adaptive repair.

CRITICAL SAFETY RULES:
1. Generate ONE command at a time based on current situation
2. ALWAYS create backup before any destructive operations
3. For corrupted plugins/themes: FIRST backup, THEN deactivate, THEN reinstall
4. Use "cp -r wp-content/plugins/[name] wp-content/plugins/[name].backup.$(date +%Y%m%d_%H%M%S)" for plugin backup
5. Use "cp -r wp-content/themes/[name] wp-content/themes/[name].backup.$(date +%Y%m%d_%H%M%S)" for theme backup
6. After backup, use "wp plugin deactivate [name] --skip-plugins --skip-themes --allow-root || echo 'DEACTIVATION_FAILED'" to safely deactivate
7. After deactivation (or if deactivation fails), use "wp plugin delete [name] --allow-root" to remove
8. Then use "wp plugin install [name] --force --allow-root" to reinstall fresh copy
9. NEVER use "rm -rf" commands on plugins/themes without backup first
10. All commands will be executed from the WordPress application directory automatically
11. If WP-CLI fails due to environment issues (escapeshellarg errors), use direct file operations but ALWAYS backup first

BACKUP-FIRST WORKFLOW:
- Step 1: Create timestamped backup of plugin/theme directory
- Step 2: Deactivate plugin/theme using WP-CLI
- Step 3: Remove corrupted files using WP-CLI delete command
- Step 4: Reinstall fresh copy using WP-CLI install command
- Step 5: Verify installation and reactivate if needed

CONTEXT AWARENESS:
- You can see the history of all previous commands and their results
- Adapt your strategy based on what worked and what failed
- If a command failed, try an alternative approach
- If WordPress core is missing, use "wp core download --force --allow-root"
- The system automatically handles domain-specific paths (main domain, subdomain, addon domain)
- If WP-CLI has environment issues, prefer direct file operations but ALWAYS backup first

FALLBACK STRATEGIES (DEACTIVATE-FIRST WITH PROPER ERROR HANDLING):
- If "wp plugin deactivate" fails, check error message and proceed accordingly
- If deactivation fails due to parse errors, first backup then use direct file operations
- If "wp plugin delete" fails, first backup then use "rm -rf wp-content/plugins/[plugin-name]" || echo 'MANUAL_DELETE_FAILED'
- If "wp plugin install" fails, use multiple fallback methods with proper error handling:
  wp plugin install [plugin] --force --allow-root || (wget -q https://downloads.wordpress.org/plugin/[plugin].zip -O /tmp/[plugin].zip && unzip -q /tmp/[plugin].zip -d wp-content/plugins/ && rm /tmp/[plugin].zip) || echo 'ALL_INSTALL_METHODS_FAILED'
- Always verify backup exists before any destructive operation
- Use parentheses to group complex fallback commands for proper execution order
- Always end fallback chains with echo statements to capture final failure states

IMPORTANT: Do not include "cd" commands in your responses - the system automatically navigates to the correct WordPress directory based on the domain type (main domain: /public_html, subdomain: /public_html/subdomain/, addon domain: /public_html/domain.com/).

Your task is to generate the NEXT SINGLE COMMAND based on:
- Original errors that need fixing
- Previous commands executed and their results
- Current repair status

Output ONLY a JSON object with this exact structure:
{
  "action": "command|complete",
  "command": "exact SSH command to run (if action is command)",
  "description": "brief description of what this command does",
  "reasoning": "why this command is needed based on current context",
  "safety": "high|medium|low",
  "type": "backup|remove|install|verify|download|cleanup"
}

If repair is complete, use: {"action": "complete", "reasoning": "why repair is complete"}

Do not include any other text - ONLY the JSON object.`;

    const commandHistoryText = context.commandHistory.map((cmd, i) => 
      `${i + 1}. Command: ${cmd.command}\n   Result: ${cmd.success ? 'SUCCESS' : 'FAILED'} (Exit Code: ${cmd.exitCode})\n   Output: ${cmd.output || 'No output'}\n   Error: ${cmd.error || 'No error'}\n`
    ).join('\n');

    const userPrompt = `Based on the current repair context, determine the next single command to execute:

ORIGINAL ERRORS TO FIX:
${context.originalErrors.join('\n')}

CURRENT ISSUE FOCUS:
${context.currentIssue}

COMMAND HISTORY (${context.commandHistory.length} commands executed):
${commandHistoryText || 'No commands executed yet'}

ITERATION: ${iteration}/10

Analyze the situation and provide the next single command to execute, or indicate if repair is complete.`;

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 800
      }, {
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const responseText = response.data.choices[0].message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response
      let commandData;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : responseText;
        commandData = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('❌ Failed to parse AI command response:', parseError.message);
        console.log('Raw response:', responseText);
        throw new Error('Invalid JSON response from OpenAI');
      }

      // Validate command safety if it's not a completion
      if (commandData.action === 'command' && commandData.command) {
        const dangerousPatterns = [
          'rm -rf /$',
          'rm -rf /home$',
          'rm -rf /var$',
          'rm -rf /usr$',
          'chmod 777',
          'mysql.*drop'
        ];
        
        const isDangerous = dangerousPatterns.some(pattern => 
          new RegExp(pattern, 'i').test(commandData.command)
        );
        
        const isSafePluginThemeRemoval = /rm -rf wp-content\/(plugins|themes)\/[a-zA-Z0-9_-]+$/.test(commandData.command);
        
        if (isDangerous && !isSafePluginThemeRemoval) {
          throw new Error(`Dangerous command detected: ${commandData.command}`);
        }
      }

      return commandData;

    } catch (error) {
      console.error('OpenAI Next Command Error:', error.response?.data || error.message);
      throw new Error(`Next command generation failed: ${error.message}`);
    }
  }

  // Analyze command result with AI to determine next steps
  async analyzeCommandResultWithAI(context, executedCommand) {
    const systemPrompt = `You are a WordPress repair expert analyzing command execution results.

Your task is to:
1. Analyze the result of the command that was just executed
2. Determine if the repair should continue or stop
3. Identify what the next focus should be

Provide analysis in JSON format:
{
  "analysis": "brief analysis of the command result and current status",
  "shouldContinue": true/false,
  "nextIssue": "what should be the focus for the next command",
  "reason": "if shouldContinue is false, explain why"
}

Consider:
- If the command succeeded, what's the next logical step?
- If the command failed, should we try a different approach?
- Are we making progress toward fixing the original errors?
- Should we stop if we've fixed the main issues?

Do not include any other text - ONLY the JSON object.`;

    const userPrompt = `Analyze the result of this command execution:

COMMAND EXECUTED:
${executedCommand.command}

COMMAND DESCRIPTION:
${executedCommand.description}

EXECUTION RESULT:
- Exit Code: ${executedCommand.exitCode}
- Success: ${executedCommand.result === 'success'}
- Output: ${executedCommand.output || 'No output'}
- Error: ${executedCommand.error || 'No error'}

ORIGINAL ERRORS BEING FIXED:
${context.originalErrors.join('\n')}

COMMAND HISTORY:
${context.commandHistory.length} commands executed so far

Analyze this result and determine next steps.`;

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const responseText = response.data.choices[0].message?.content;
      if (!responseText) {
        return {
          analysis: 'No analysis available',
          shouldContinue: true,
          nextIssue: 'Continue with repair process'
        };
      }

      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : responseText;
        return JSON.parse(jsonText);
      } catch (parseError) {
        console.warn('Could not parse AI analysis response, using defaults');
        return {
          analysis: responseText.substring(0, 200),
          shouldContinue: true,
          nextIssue: 'Continue with repair process'
        };
      }

    } catch (error) {
      console.error('OpenAI Analysis Error:', error.response?.data || error.message);
      return {
        analysis: 'Analysis failed, continuing with repair',
        shouldContinue: true,
        nextIssue: 'Continue with repair process'
      };
    }
  }

  // Step 5: Clean up SSH key
  async deleteSSHKey() {
    console.log('🧹 Cleaning up SSH key...');
    
    try {
      const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
      const params = {
        'api.version': 1,
        user: config.cpanel.user,
        cpanel_jsonapi_user: config.cpanel.user,
        cpanel_jsonapi_module: 'SSH',
        cpanel_jsonapi_func: 'delkey',
        name: config.ssh.keyName
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `whm ${config.whm.username}:${config.whm.token}`
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      if (response.data.cpanelresult.data && response.data.cpanelresult.data[0]) {
        console.log('✅ SSH key deleted successfully');
        return true;
      } else {
        throw new Error('Failed to delete SSH key');
      }
    } catch (error) {
      console.error('❌ Error deleting SSH key:', error.message);
      return false;
    }
  }
}

// Execute the automated repair with AI analysis
if (require.main === module) {
  // Get domain and cPanel user from command line arguments
  const args = process.argv.slice(2);
  const domainName = args[0] || null;
  const cpanelUser = args[1] || null;
  
  if (domainName) {
    console.log(`🎯 Domain specified: ${domainName}`);
    if (cpanelUser) {
      console.log(`👤 cPanel user specified: ${cpanelUser}`);
    }
  }
  
  const repair = new AutomatedWPRepairWithAI(domainName, cpanelUser);
  repair.run()
    .then(result => {
      console.log('\n✅ Process completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Process failed:', error.message);
      process.exit(1);
    });
}

module.exports = AutomatedWPRepairWithAI;