/**
 * WHM Controller
 * Handles WHM-related API endpoints
 */

const whmService = require('../services/whmService');
const { getServiceForClient } = require('../utils/helpers');

/**
 * Get server status and information from all servers
 */
exports.getServerStatus = async (req, res, next) => {
  console.log('[GET /whm/server/status]');
  
  try {
    // Get status from all servers
    const serverInfo = await whmService.getAllServerInfo();
    
    const response = {
      success: true,
      servers: serverInfo.results,
      errors: serverInfo.errors,
      summary: {
        totalServers: serverInfo.totalServers,
        successfulServers: serverInfo.successCount,
        failedServers: serverInfo.errorCount,
        successRate: `${Math.round((serverInfo.successCount / serverInfo.totalServers) * 100)}%`
      },
      timestamp: new Date().toISOString()
    };
    
    // console.log(`✅ Server status retrieved from ${serverInfo.successCount}/${serverInfo.totalServers} servers`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error getting server status:', error.message);
    next(error);
  }
};

/**
 * Get list of available servers
 */
exports.getAvailableServers = async (req, res, next) => {
  console.log('[GET /whm/servers]');
  
  try {
    const servers = whmService.getAvailableServers();
    
    const serverList = servers.map(serverName => ({
      name: serverName,
      hostname: whmService.getServerHostname(serverName),
      url: `https://${whmService.getServerHostname(serverName)}:2087`
    }));
    
    const response = {
      success: true,
      totalServers: servers.length,
      servers: serverList,
      timestamp: new Date().toISOString()
    };
    
    // console.log(`✅ Listed ${servers.length} available servers`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error getting server list:', error.message);
    next(error);
  }
};

/**
 * Get account information by domain
 */
exports.getAccountByDomain = async (req, res, next) => {
  console.log('[POST /whm/account/domain]', { domain: req.body.domain });
  
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required'
      });
    }
    
    const account = await whmService.getAccountByDomain(domain);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found for this domain'
      });
    }
    
    // Format account data for response
    const accountData = {
      username: account.user,
      domain: account.domain,
      email: account.email,
      package: account.plan,
      diskUsed: account.diskused,
      diskLimit: account.disklimit,
      suspended: account.suspended === '1',
      suspendReason: account.suspendreason || null,
      created: account.startdate,
      ip: account.ip,
      partition: account.partition
    };
    
    // console.log('✅ Account found:', account.user);
    res.json({
      success: true,
      account: accountData
    });
    
  } catch (error) {
    console.error('❌ Error getting account by domain:', error.message);
    next(error);
  }
};

/**
 * Get account status and details
 */
exports.getAccountStatus = async (req, res, next) => {
  console.log('[POST /whm/account/status]', { 
    username: req.body.username,
    domain: req.body.domain 
  });
  
  try {
    const { username, domain } = req.body;
    
    if (!username && !domain) {
      return res.status(400).json({
        success: false,
        error: 'Username or domain is required'
      });
    }
    
    let account;
    if (username) {
      account = await whmService.getAccountByUsername(username);
    } else {
      account = await whmService.getAccountByDomain(domain);
    }
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    // Get additional account details
    const [usage, sslCerts] = await Promise.all([
      whmService.getAccountUsage(account.user).catch(() => null),
      whmService.listSSLCertificates(account.user).catch(() => [])
    ]);
    
    const status = account.suspended === '1' ? 'Suspended' : 'Active';
    
    const response = {
      success: true,
      account: {
        username: account.user,
        domain: account.domain,
        status: status,
        suspended: account.suspended === '1',
        suspendReason: account.suspendreason || null,
        email: account.email,
        package: account.plan,
        created: account.startdate,
        ip: account.ip,
        diskUsed: account.diskused,
        diskLimit: account.disklimit,
        usage: usage?.data || null,
        sslCertificates: sslCerts.length || 0,
        hasSSL: sslCerts.length > 0
      }
    };
    
    // console.log('✅ Account status retrieved:', account.user, status);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error getting account status:', error.message);
    next(error);
  }
};

/**
 * Suspend account
 */
exports.suspendAccount = async (req, res, next) => {
  console.log('[POST /whm/account/suspend]', { 
    username: req.body.username,
    reason: req.body.reason 
  });
  
  try {
    const { username, reason = 'Administrative suspension' } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }
    
    // Check if account exists
    const accountExists = await whmService.accountExists(username);
    if (!accountExists) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    const result = await whmService.suspendAccount(username, reason);
    
    console.log('✅ Account suspended:', username);
    res.json({
      success: true,
      message: `Account ${username} has been suspended`,
      reason: reason,
      result: result
    });
    
  } catch (error) {
    console.error('❌ Error suspending account:', error.message);
    next(error);
  }
};

/**
 * Unsuspend account
 */
exports.unsuspendAccount = async (req, res, next) => {
  console.log('[POST /whm/account/unsuspend]', { username: req.body.username });
  
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }
    
    // Check if account exists
    const accountExists = await whmService.accountExists(username);
    if (!accountExists) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    const result = await whmService.unsuspendAccount(username);
    
    console.log('✅ Account unsuspended:', username);
    res.json({
      success: true,
      message: `Account ${username} has been unsuspended`,
      result: result
    });
    
  } catch (error) {
    console.error('❌ Error unsuspending account:', error.message);
    next(error);
  }
};

/**
 * Create new cPanel account
 */
exports.createAccount = async (req, res, next) => {
  console.log('[POST /whm/account/create]', { 
    username: req.body.username,
    domain: req.body.domain 
  });
  
  try {
    const {
      username,
      domain,
      password,
      email,
      package: packageName = 'default',
      quota = 'unlimited'
    } = req.body;
    
    // Validate required fields
    if (!username || !domain || !password || !email) {
      return res.status(400).json({
        success: false,
        error: 'Username, domain, password, and email are required'
      });
    }
    
    // Check if account already exists
    const accountExists = await whmService.accountExists(username);
    if (accountExists) {
      return res.status(409).json({
        success: false,
        error: 'Account already exists'
      });
    }
    
    const accountData = {
      username,
      domain,
      password,
      email,
      package: packageName,
      quota
    };
    
    const result = await whmService.createAccount(accountData);
    
    console.log('✅ Account created:', username);
    res.json({
      success: true,
      message: `Account ${username} has been created`,
      account: {
        username,
        domain,
        email,
        package: packageName
      },
      result: result
    });
    
  } catch (error) {
    console.error('❌ Error creating account:', error.message);
    next(error);
  }
};

/**
 * Get hosting packages
 */
exports.getPackages = async (req, res, next) => {
  console.log('[GET /whm/packages]');
  
  try {
    const packages = await whmService.listPackages();
    
    const formattedPackages = packages.map(pkg => ({
      name: pkg.name,
      diskSpace: pkg.QUOTA,
      bandwidth: pkg.BWLIMIT,
      maxDomains: pkg.MAXADDON,
      maxSubdomains: pkg.MAXSUB,
      maxEmailAccounts: pkg.MAXPOP,
      maxDatabases: pkg.MAXSQL,
      features: {
        cgi: pkg.CGI === '1',
        php: pkg.PHP === '1',
        ssl: pkg.HASSHELL === '1',
        frontpage: pkg.FRONTPAGE === '1'
      }
    }));
    
    console.log(`✅ Retrieved ${packages.length} packages`);
    res.json({
      success: true,
      packages: formattedPackages,
      count: packages.length
    });
    
  } catch (error) {
    console.error('❌ Error getting packages:', error.message);
    next(error);
  }
};

/**
 * Get account resource usage
 */
exports.getAccountUsage = async (req, res, next) => {
  console.log('[POST /whm/account/usage]', { username: req.body.username });
  
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }
    
    const [usage, bandwidth] = await Promise.all([
      whmService.getAccountUsage(username),
      whmService.getBandwidthUsage(username).catch(() => null)
    ]);
    
    console.log('✅ Account usage retrieved:', username);
    res.json({
      success: true,
      username: username,
      usage: usage.data || null,
      bandwidth: bandwidth?.data || null
    });
    
  } catch (error) {
    console.error('❌ Error getting account usage:', error.message);
    next(error);
  }
};

/**
 * Test WHM connection
 */
exports.testConnection = async (req, res, next) => {
  console.log('[GET /whm/test]');
  
  try {
    const isConnected = await whmService.testConnection();
    const version = isConnected ? await whmService.getVersion() : null;
    
    res.json({
      success: isConnected,
      connected: isConnected,
      version: version,
      timestamp: new Date().toISOString(),
      message: isConnected ? 'WHM connection successful' : 'WHM connection failed'
    });
    
  } catch (error) {
    console.error('❌ Error testing WHM connection:', error.message);
    res.json({
      success: false,
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Sync WHMCS service with WHM account
 * This endpoint links WHMCS hosting services with their corresponding WHM accounts
 */
exports.syncServiceWithWHM = async (req, res, next) => {
  console.log('[POST /whm/sync/service]', { 
    clientId: req.body.clientId,
    domain: req.body.domain,
    serviceId: req.body.serviceId 
  });
  
  try {
    const { clientId, domain, serviceId } = req.body;
    
    if (!clientId || (!domain && !serviceId)) {
      return res.status(400).json({
        success: false,
        error: 'clientId and (domain or serviceId) are required'
      });
    }
    
    // Get WHMCS service details
    const whmcsService = await getServiceForClient({ clientId, domain, serviceId });
    
    if (!whmcsService) {
      return res.status(404).json({
        success: false,
        error: 'WHMCS service not found'
      });
    }
    
    const serviceDomain = whmcsService.domain || domain;
    
    // Get WHM account details
    const whmAccount = await whmService.getAccountByDomain(serviceDomain);
    
    if (!whmAccount) {
      return res.status(404).json({
        success: false,
        error: 'WHM account not found for this domain'
      });
    }
    
    // Compare statuses
    const whmcsStatus = whmcsService.status;
    const whmStatus = whmAccount.suspended === '1' ? 'Suspended' : 'Active';
    const statusMatch = (
      (whmcsStatus === 'Active' && whmStatus === 'Active') ||
      (whmcsStatus === 'Suspended' && whmStatus === 'Suspended')
    );
    
    const response = {
      success: true,
      sync: {
        domain: serviceDomain,
        whmcs: {
          serviceId: whmcsService.id,
          status: whmcsStatus,
          nextDueDate: whmcsService.nextduedate,
          package: whmcsService.productname || whmcsService.name
        },
        whm: {
          username: whmAccount.user,
          status: whmStatus,
          suspended: whmAccount.suspended === '1',
          suspendReason: whmAccount.suspendreason || null,
          package: whmAccount.plan,
          diskUsed: whmAccount.diskused,
          diskLimit: whmAccount.disklimit
        },
        statusMatch: statusMatch,
        recommendation: statusMatch ? null : `Status mismatch: WHMCS shows ${whmcsStatus}, WHM shows ${whmStatus}`
      }
    };
    
    console.log('✅ Service sync completed:', serviceDomain, { statusMatch });
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error syncing service with WHM:', error.message);
    next(error);
  }
};

/**
 * Add missing A record to DNS zone file
 */
exports.addMissingARecord = async (req, res, next) => {
  console.log('[POST /whm/dns/add-a-record]', { 
    domain: req.body.domain,
    serverName: req.body.serverName,
    targetIP: req.body.targetIP
  });
  
  try {
    const { domain, serverName, targetIP } = req.body || {};
    
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
    
    let result;
    
    if (serverName && targetIP) {
      // Manual mode: specific server and IP provided
      console.log(`→ Manual mode: Adding A record for ${domain} on ${serverName} → ${targetIP}`);
      
      // Validate IP format
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(targetIP)) {
        console.log('✗ Invalid IP address format');
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid IP address format' 
        });
      }
      
      result = await whmService.addMissingARecord(serverName, domain, targetIP);
    } else {
      // Auto mode: find server and IP automatically
      console.log(`→ Auto mode: Finding server and adding A record for ${domain}`);
      
      result = await whmService.autoFixMissingARecord(domain);
    }
    
    if (result.success) {
      console.log(`✅ A record added successfully for ${domain}`);
      return res.json({
        success: true,
        domain: domain,
        message: result.message || `A record added successfully for ${domain}`,
        details: {
          method: result.method,
          server: result.server || serverName,
          ip: result.ip,
          synced: result.synced,
          syncMethod: result.syncMethod
        }
      });
    } else {
      console.log(`❌ Failed to add A record for ${domain}: ${result.error}`);
      return res.status(400).json({
        success: false,
        domain: domain,
        error: result.error,
        details: {
          method: result.method,
          server: result.server || serverName,
          currentIPs: result.currentIPs,
          expectedIP: result.expectedIP
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error adding A record:', error.message);
    next(error);
  }
};

/**
 * Remove duplicate A records from DNS zone file
 */
exports.removeDuplicateARecords = async (req, res, next) => {
  console.log('[POST /whm/dns/remove-duplicate-a-records]', { 
    domain: req.body.domain,
    serverName: req.body.serverName,
    correctIP: req.body.correctIP
  });
  
  try {
    const { domain, serverName, correctIP } = req.body || {};
    
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
    
    if (!serverName || !correctIP) {
      console.log('✗ Missing serverName or correctIP parameter');
      return res.status(400).json({ 
        success: false, 
        error: 'serverName and correctIP parameters required' 
      });
    }
    
    // Validate IP format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(correctIP)) {
      console.log('✗ Invalid IP address format');
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid IP address format' 
      });
    }
    
    console.log(`→ Removing duplicate A records for ${domain} on ${serverName}, keeping IP: ${correctIP}`);
    
    const result = await whmService.removeDuplicateARecords(serverName, domain, correctIP);
    
    if (result.success) {
      console.log(`✅ Duplicate A records removed successfully for ${domain}`);
      return res.json({
        success: true,
        domain: domain,
        message: result.message || `Duplicate A records removed successfully for ${domain}`,
        details: {
          method: result.method,
          server: serverName,
          correctIP: correctIP,
          duplicatesRemoved: result.duplicatesRemoved,
          finalRecordCount: result.finalRecordCount,
          hasRemainingIncorrectRecords: result.hasRemainingIncorrectRecords,
          synced: result.synced,
          syncMethod: result.syncMethod,
          removalErrors: result.removalErrors
        }
      });
    } else {
      console.log(`❌ Failed to remove duplicate A records for ${domain}: ${result.error}`);
      return res.status(400).json({
        success: false,
        domain: domain,
        error: result.error,
        details: {
          method: result.method,
          server: serverName,
          removalErrors: result.removalErrors
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error removing duplicate A records:', error.message);
    next(error);
  }
};

/**
 * Auto-fix missing A record (simplified endpoint)
 */
exports.autoFixMissingARecord = async (req, res, next) => {
  console.log('[POST /whm/dns/auto-fix-a-record]', { 
    domain: req.body.domain
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
    
    console.log(`→ Auto-fixing missing A record for: ${domain}`);
    
    const result = await whmService.autoFixMissingARecord(domain);
    
    if (result.success) {
      console.log(`✅ A record auto-fixed successfully for ${domain}`);
      return res.json({
        success: true,
        domain: domain,
        message: result.message || `A record auto-fixed successfully for ${domain}`,
        details: {
          method: result.method,
          server: result.server,
          ip: result.ip,
          synced: result.synced,
          syncMethod: result.syncMethod
        }
      });
    } else {
      console.log(`❌ Failed to auto-fix A record for ${domain}: ${result.error}`);
      
      // Determine appropriate HTTP status code
      let statusCode = 400;
      if (result.method === 'domain_not_found') {
        statusCode = 404;
      } else if (result.method === 'server_ip_not_found') {
        statusCode = 500;
      }
      
      return res.status(statusCode).json({
        success: false,
        domain: domain,
        error: result.error,
        details: {
          method: result.method,
          server: result.server
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error auto-fixing A record:', error.message);
    next(error);
  }
};

module.exports = exports;

/**
 * Test SSH key lifecycle: generate → authorize → connect → delete
 * POST /whm/ssh/test
 * Body: { serverName, cpanelUser, sshPort? }
 */
exports.testSshKey = async (req, res, next) => {
  const { serverName, cpanelUser, sshPort } = req.body;
  console.log('[POST /whm/ssh/test]', { serverName, cpanelUser, sshPort });

  if (!serverName || !cpanelUser) {
    return res.status(400).json({
      success: false,
      error: 'serverName and cpanelUser are required',
    });
  }

  try {
    const { testSshKeyLifecycle } = require('../services/sshKeyTestService');
    const result = await testSshKeyLifecycle(serverName, cpanelUser, sshPort || 22);
    res.json(result);
  } catch (error) {
    console.error('[testSshKey] Error:', error.message);
    next(error);
  }
};
