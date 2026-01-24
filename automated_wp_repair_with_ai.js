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
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  },
  // Domain configuration - will be set dynamically
  domain: {
    name: 'testing',
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

      // Display AI analysis results
      if (result.errorLogAnalysis.hasErrors && result.errorLogAnalysis.analysis) {
        console.log('\n🤖 AI ERROR LOG ANALYSIS');
        console.log('========================');
        console.log(result.errorLogAnalysis.analysis.analysis);
        console.log('\n📊 ANALYSIS METADATA');
        console.log('===================');
        console.log(`Model used: ${result.errorLogAnalysis.analysis.model}`);
        console.log(`Tokens used: ${result.errorLogAnalysis.analysis.tokensUsed}`);
        console.log(`Unique errors analyzed: ${result.errorLogAnalysis.uniqueErrors?.length || 0}`);
        console.log('========================\n');

        // Generate and execute AI-powered fix commands with two-way communication
        if (result.errorLogAnalysis.communicationProcess) {
          console.log('\n� TWO-WAY AI-SSH COMMUNICATION');
          console.log('==============================');
          console.log(`Total Exchanges: ${result.errorLogAnalysis.communicationProcess.totalExchanges}`);
          console.log(`Successful Commands: ${result.errorLogAnalysis.communicationProcess.successfulCommands}`);
          console.log(`Failed Commands: ${result.errorLogAnalysis.communicationProcess.failedCommands}`);
          console.log(`Final Status: ${result.errorLogAnalysis.communicationProcess.finalStatus}`);
          
          if (result.errorLogAnalysis.conversations && result.errorLogAnalysis.conversations.length > 0) {
            console.log('\n📋 CONVERSATION DETAILS:');
            result.errorLogAnalysis.conversations.forEach((conversation, index) => {
              if (conversation.aiDecision && conversation.commandResult) {
                console.log(`\n${index + 1}. Exchange ${conversation.exchange}:`);
                console.log(`   AI Decision: ${conversation.aiDecision.description}`);
                console.log(`   Command: ${conversation.aiDecision.command}`);
                console.log(`   Result: ${conversation.commandResult.exitCode === 0 ? 'SUCCESS' : 'FAILED'} (Exit Code: ${conversation.commandResult.exitCode})`);
                console.log(`   Reasoning: ${conversation.aiDecision.reasoning}`);
                if (conversation.commandResult.output) {
                  console.log(`   Output: ${conversation.commandResult.output.substring(0, 150)}${conversation.commandResult.output.length > 150 ? '...' : ''}`);
                }
              } else if (conversation.error) {
                console.log(`\n${index + 1}. Exchange ${conversation.exchange}: ERROR`);
                console.log(`   Error: ${conversation.error}`);
              }
            });
          }
          console.log('==============================\n');
        }

        // Display AI analysis results
        if (result.errorLogAnalysis.fixCommands && result.errorLogAnalysis.fixCommands.length > 0) {
          console.log('\n🔧 AI-GENERATED FIX COMMANDS');
          console.log('============================');
          result.errorLogAnalysis.fixCommands.forEach((cmd, index) => {
            console.log(`${index + 1}. ${cmd.description}`);
            console.log(`   Command: ${cmd.command}`);
            console.log(`   Safety: ${cmd.safety}`);
            console.log(`   Result: ${cmd.result || 'Not executed'}`);
            if (cmd.reasoning) {
              console.log(`   Reasoning: ${cmd.reasoning}`);
            }
            if (cmd.output) {
              console.log(`   Output: ${cmd.output.substring(0, 200)}${cmd.output.length > 200 ? '...' : ''}`);
            }
            console.log('');
          });
          console.log('============================\n');
        }
      } else if (result.errorLogAnalysis.hasErrors && !result.errorLogAnalysis.analysis) {
        console.log('\n⚠️  ERROR LOG ANALYSIS FAILED');
        console.log('=============================');
        console.log(`Found ${result.errorLogAnalysis.uniqueErrors?.length || 0} unique errors but AI analysis failed`);
        if (result.errorLogAnalysis.error) {
          console.log(`Error: ${result.errorLogAnalysis.error}`);
        }
        
        // Show the raw unique errors as fallback
        if (result.errorLogAnalysis.uniqueErrors && result.errorLogAnalysis.uniqueErrors.length > 0) {
          console.log('\n📋 RAW UNIQUE ERRORS FOUND:');
          console.log('===========================');
          result.errorLogAnalysis.uniqueErrors.forEach((error, index) => {
            console.log(`${index + 1}. ${error.coreError}`);
            console.log(`   Original: ${error.original.substring(0, 100)}...`);
            console.log(`   Timestamp: ${error.timestamp || 'Unknown'}\n`);
          });
        }
        console.log('=============================\n');
      } else if (result.errorLogAnalysis.hasErrors) {
        console.log('\n📋 UNIQUE ERRORS FOUND (No AI Analysis)');
        console.log('=======================================');
        if (result.errorLogAnalysis.uniqueErrors && result.errorLogAnalysis.uniqueErrors.length > 0) {
          result.errorLogAnalysis.uniqueErrors.forEach((error, index) => {
            console.log(`${index + 1}. ${error.coreError}`);
            console.log(`   Original: ${error.original.substring(0, 100)}...`);
            console.log(`   Timestamp: ${error.timestamp || 'Unknown'}\n`);
          });
        }
        console.log('=======================================\n');
      }
      
      console.log('\n🎉 Automated WordPress Repair Process with AI Analysis Completed!');
      console.log('Results:', {
        success: result.success,
        repaired: result.repaired,
        alreadyValid: result.alreadyValid,
        errorAnalysis: {
          hasErrors: result.errorLogAnalysis.hasErrors,
          uniqueErrorCount: result.errorLogAnalysis.uniqueErrors?.length || 0,
          aiAnalysisAvailable: !!result.errorLogAnalysis.analysis
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
    
    const systemPrompt = `You are a WordPress system administrator expert specializing in automated error fixing via SSH commands.

CRITICAL SAFETY RULES:
1. For corrupted plugins/themes with parse errors: FIRST remove the corrupted directory completely, THEN reinstall
2. Use "rm -rf wp-content/plugins/[plugin-name]" to remove corrupted plugins (this is safe for plugins)
3. Use "rm -rf wp-content/themes/[theme-name]" to remove corrupted themes (this is safe for themes)
4. After removal, use "wp plugin install [plugin-name] --force --allow-root" to reinstall
5. For theme errors: Use "wp theme install [theme-name] --force --allow-root" to reinstall
6. Always backup before making changes
7. When WordPress has parse errors, WP-CLI commands will fail - remove corrupted files first
8. Focus on complete file replacement rather than editing
9. All commands will be executed from the WordPress application directory automatically

IMPORTANT: When there are PHP parse errors, WordPress cannot load and WP-CLI will fail. The solution is:
1. Backup the corrupted plugin/theme
2. Remove the corrupted directory completely with rm -rf
3. Reinstall fresh files using wp-cli or direct download
4. Verify the fix worked

DOMAIN HANDLING: The system automatically handles domain-specific paths:
- Main domain: /public_html
- Subdomain: /public_html/subdomain/
- Addon domain: /public_html/domain.com/

Do not include "cd" commands in your responses - the system navigates to the correct directory automatically.

Your task is to generate ONLY safe SSH commands that:
- Backup corrupted files before fixing
- Remove corrupted plugin/theme directories completely
- Reinstall fresh copies from WordPress.org
- Include verification steps
- Are safe and effective for parse error scenarios

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

      // Validate command structure and add safety checks
      const validatedCommands = commands.map((cmd, index) => {
        if (!cmd.command || !cmd.description) {
          throw new Error(`Invalid command structure at index ${index}`);
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
        
        // Allow safe plugin/theme directory removal
        const isSafePluginThemeRemoval = /rm -rf wp-content\/(plugins|themes)\/[a-zA-Z0-9_-]+$/.test(cmd.command);
        
        if (isDangerous && !isSafePluginThemeRemoval) {
          throw new Error(`Dangerous command detected: ${cmd.command}`);
        }
        
        return {
          ...cmd,
          safety: cmd.safety || 'medium',
          type: cmd.type || 'fix',
          reversible: cmd.reversible !== false
        };
      });

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
      if (command.includes('wp db') || command.includes('mysql')) {
        adjustedTimeout = 60000; // 60 seconds for database operations
      } else if (command.includes('wp plugin') || command.includes('wp theme')) {
        adjustedTimeout = 45000; // 45 seconds for plugin/theme operations
      } else if (command.includes('wp core')) {
        adjustedTimeout = 90000; // 90 seconds for core operations
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
        
        // Step 3: Execute the command
        const commandResult = await this.executeSSHCommandWithLogging(conn, aiDecision.command, 30000);
        
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
    const systemPrompt = `You are a WordPress system administrator expert engaged in two-way communication with a live server.

COMMUNICATION RULES:
1. You are having a real-time conversation with a server via SSH commands
2. Each command you send gets executed immediately and you receive the actual output
3. Analyze the output and decide the next logical step
4. You can ask the server questions by running diagnostic commands
5. You can fix issues by running repair commands
6. Always consider the full conversation history when making decisions

LOOP PREVENTION:
- Avoid repeating the same command multiple times
- If a command fails, try a different approach
- If you're not making progress, try diagnostic commands to understand the situation better
- If the original issues are resolved, indicate completion

CONVERSATION FLOW:
- Start with diagnostic commands if you need more information
- Use repair commands when you know what needs to be fixed
- Ask follow-up questions through commands if results are unclear
- Provide completion when all issues are resolved

Your task is to continue the conversation by deciding the next action based on the full context.

Output ONLY a JSON object:
{
  "action": "command|complete",
  "command": "exact SSH command to run (if action is command)",
  "description": "brief description of what this command does",
  "reasoning": "why this command is needed based on the conversation so far",
  "safety": "high|medium|low",
  "type": "diagnostic|repair|verification|cleanup"
}

If all issues are resolved, use: {"action": "complete", "reasoning": "explanation of why communication is complete"}`;

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
        return JSON.parse(jsonText);
      } catch (parseError) {
        console.error('❌ Failed to parse AI decision response:', parseError.message);
        console.log('Raw response:', responseText);
        throw new Error('Invalid JSON response from OpenAI');
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
2. For corrupted plugins/themes: FIRST remove directory, THEN reinstall
3. Use "rm -rf wp-content/plugins/[name]" or "rm -rf wp-content/themes/[name]" for removal
4. After removal, use "wp plugin install [name] --force --allow-root" to reinstall
5. Always backup before destructive operations
6. When WordPress has parse errors, WP-CLI commands will fail - remove corrupted files first
7. Analyze previous command results to determine next action
8. All commands will be executed from the WordPress application directory automatically
9. If WP-CLI fails due to environment issues (escapeshellarg errors), use direct file operations

CONTEXT AWARENESS:
- You can see the history of all previous commands and their results
- Adapt your strategy based on what worked and what failed
- If a command failed, try an alternative approach
- If WordPress core is missing, use "wp core download --force --allow-root"
- The system automatically handles domain-specific paths (main domain, subdomain, addon domain)
- If WP-CLI has environment issues, prefer direct file operations over WP-CLI commands

FALLBACK STRATEGIES:
- If "wp plugin delete" fails with escapeshellarg error, use "rm -rf wp-content/plugins/[plugin-name]"
- If "wp plugin install" fails, use "wget https://downloads.wordpress.org/plugin/[plugin].zip && unzip [plugin].zip -d wp-content/plugins/"
- If WP-CLI is completely broken, use direct file manipulation for all operations

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