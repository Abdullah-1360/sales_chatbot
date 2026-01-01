const { getServers } = require('./whmcsService');

/**
 * Server Service - Handles WHMCS server operations
 * Provides server information, IP addresses, and server management functions
 */

/**
 * Get all servers from WHMCS
 * @param {Object} params - Optional parameters for filtering
 * @returns {Object} WHMCS servers response
 */
async function getAllServers(params = {}) {
  console.log('🖥️ Fetching servers from WHMCS');
  
  try {
    const serversData = await getServers(params);
    console.log(`→ Found ${serversData.totalresults || 0} servers`);
    
    return serversData;
  } catch (error) {
    console.error('❌ Failed to fetch servers:', error.message);
    throw error;
  }
}

/**
 * Get active servers only
 * @returns {Array} Array of active servers
 */
async function getActiveServers() {
  console.log('🖥️ Fetching active servers from WHMCS');
  
  try {
    const serversData = await getAllServers();
    const serversRaw = serversData.servers || {};
    const servers = serversRaw.server || serversRaw;
    const serverArray = Array.isArray(servers) ? servers : (servers ? [servers] : []);
    
    // Filter for active servers
    const activeServers = serverArray.filter(server => 
      server.active === '1' || server.active === 1 || server.active === true
    );
    
    console.log(`→ Found ${activeServers.length} active servers out of ${serverArray.length} total`);
    
    return activeServers;
  } catch (error) {
    console.error('❌ Failed to fetch active servers:', error.message);
    throw error;
  }
}

/**
 * Extract server IP addresses from WHMCS servers
 * @param {Array} servers - Array of server objects from WHMCS
 * @returns {Array} Array of IP addresses
 */
function extractServerIPs(servers) {
  const ipSet = new Set(); // Use Set to automatically handle duplicates
  
  servers.forEach(server => {
    // Primary IP address
    if (server.ipaddress && server.ipaddress.trim()) {
      ipSet.add(server.ipaddress.trim());
    }
    
    // Additional IP addresses (if available)
    if (server.assignedips) {
      const assignedIPs = Array.isArray(server.assignedips) 
        ? server.assignedips 
        : server.assignedips.split(',').map(ip => ip.trim());
      
      assignedIPs.forEach(ip => {
        if (ip && ip.trim()) {
          ipSet.add(ip.trim());
        }
      });
    }
    
    // Nameserver IPs (if available and they are actual IP addresses)
    if (server.nameserver1 && /^\d+\.\d+\.\d+\.\d+$/.test(server.nameserver1.trim())) {
      ipSet.add(server.nameserver1.trim());
    }
    
    if (server.nameserver2 && /^\d+\.\d+\.\d+\.\d+$/.test(server.nameserver2.trim())) {
      ipSet.add(server.nameserver2.trim());
    }
  });
  
  // Convert Set back to Array and filter out any empty values
  return Array.from(ipSet).filter(ip => ip && ip.length > 0);
}

/**
 * Extract mail server hostnames from WHMCS servers
 * @param {Array} servers - Array of server objects from WHMCS
 * @returns {Array} Array of mail server hostnames
 */
function extractMailServers(servers) {
  const mailServers = [];
  
  servers.forEach(server => {
    // Only check server hostname for mail-related names (no automatic pattern generation)
    if (server.hostname) {
      const hostname = server.hostname.toLowerCase();
      if (hostname.includes('mail') || hostname.includes('mx') || hostname.includes('smtp')) {
        // Only add if it's a valid domain (contains at least one dot and proper domain structure)
        if (hostname.includes('.') && hostname.split('.').length >= 2) {
          mailServers.push(server.hostname);
        }
      }
    }
    
    // Check server name for mail-related names
    if (server.name) {
      const name = server.name.toLowerCase();
      if (name.includes('mail') || name.includes('mx') || name.includes('smtp')) {
        // Only add if it's a valid domain (contains at least one dot and proper domain structure)
        if (name.includes('.') && name.split('.').length >= 2) {
          mailServers.push(server.name);
        }
      }
    }
  });
  
  // Remove duplicates and empty values
  return [...new Set(mailServers.filter(server => server && server.trim()))];
}

/**
 * Extract nameservers from WHMCS servers
 * @param {Array} servers - Array of server objects from WHMCS
 * @returns {Array} Array of nameserver hostnames
 */
function extractNameservers(servers) {
  const nameservers = [];
  
  // Always start with default hostbreak.com nameservers (ns1-ns6)
  const defaultNameservers = [
    'ns1.hostbreak.com',
    'ns2.hostbreak.com',
    'ns3.hostbreak.com',
    'ns4.hostbreak.com',
    'ns5.hostbreak.com',
    'ns6.hostbreak.com'
  ];
  
  // Add default nameservers first
  defaultNameservers.forEach(ns => nameservers.push(ns));
  
  // Then append nameservers from WHMCS servers (don't replace, just append)
  servers.forEach(server => {
    // Add explicit nameserver fields from WHMCS
    if (server.nameserver1 && server.nameserver1.trim()) {
      nameservers.push(server.nameserver1.trim());
    }
    if (server.nameserver2 && server.nameserver2.trim()) {
      nameservers.push(server.nameserver2.trim());
    }
    if (server.nameserver3 && server.nameserver3.trim()) {
      nameservers.push(server.nameserver3.trim());
    }
    if (server.nameserver4 && server.nameserver4.trim()) {
      nameservers.push(server.nameserver4.trim());
    }
    
    // Also check server hostname for nameserver patterns (ns*, dns*)
    if (server.hostname && server.hostname.trim()) {
      const hostname = server.hostname.toLowerCase().trim();
      if ((hostname.includes('ns') || hostname.includes('dns')) && hostname.includes('.')) {
        nameservers.push(server.hostname.trim());
      }
    }
  });
  
  // Remove duplicates and empty values, preserve order (defaults first)
  return [...new Set(nameservers.filter(ns => ns && ns.trim()))];
}

/**
 * Get comprehensive server information for DNS matching
 * @returns {Object} Server information for DNS matching
 */
async function getServerInfoForDNS() {
  console.log('🔍 Getting server information for DNS matching');
  
  try {
    const activeServers = await getActiveServers();
    
    const serverInfo = {
      servers: activeServers,
      serverIPs: extractServerIPs(activeServers),
      mailServers: extractMailServers(activeServers),
      nameservers: extractNameservers(activeServers),
      lastUpdated: new Date().toISOString()
    };
    
    // console.log(`→ Extracted ${serverInfo.serverIPs.length} server IPs`);
    // console.log(`→ Extracted ${serverInfo.mailServers.length} mail servers`);
    // console.log(`→ Extracted ${serverInfo.nameservers.length} nameservers`);
    
    return serverInfo;
  } catch (error) {
    // console.error('❌ Failed to get server info for DNS:', error.message);
    throw error;
  }
}

/**
 * Get server by ID
 * @param {string|number} serverId - Server ID
 * @returns {Object|null} Server object or null if not found
 */
async function getServerById(serverId) {
  console.log(`🖥️ Fetching server ${serverId} from WHMCS`);
  
  try {
    const serversData = await getAllServers();
    const serversRaw = serversData.servers || {};
    const servers = serversRaw.server || serversRaw;
    const serverArray = Array.isArray(servers) ? servers : (servers ? [servers] : []);
    
    const server = serverArray.find(s => s.id == serverId);
    
    if (server) {
      console.log(`→ Found server: ${server.name || server.hostname}`);
    } else {
      console.log(`→ Server ${serverId} not found`);
    }
    
    return server || null;
  } catch (error) {
    console.error(`❌ Failed to fetch server ${serverId}:`, error.message);
    throw error;
  }
}

/**
 * Format server information for display
 * @param {Object} server - Server object from WHMCS
 * @returns {Object} Formatted server information
 */
function formatServerInfo(server) {
  return {
    id: server.id,
    name: server.name,
    hostname: server.hostname,
    ipAddress: server.ipaddress,
    type: server.type,
    active: server.active === '1' || server.active === 1 || server.active === true,
    maxAccounts: server.maxaccounts,
    nameserver1: server.nameserver1,
    nameserver2: server.nameserver2,
    nameserver3: server.nameserver3,
    nameserver4: server.nameserver4,
    assignedIPs: server.assignedips ? 
      (Array.isArray(server.assignedips) ? server.assignedips : server.assignedips.split(',').map(ip => ip.trim())) 
      : [],
    statusAddress: server.statusaddress,
    disabled: server.disabled === '1' || server.disabled === 1 || server.disabled === true
  };
}

module.exports = {
  getAllServers,
  getActiveServers,
  getServerById,
  getServerInfoForDNS,
  extractServerIPs,
  extractMailServers,
  extractNameservers,
  formatServerInfo
};