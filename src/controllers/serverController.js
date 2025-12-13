const { 
  getAllServers, 
  getActiveServers, 
  getServerById, 
  getServerInfoForDNS,
  formatServerInfo 
} = require('../services/serverService');

/**
 * Get all servers from WHMCS
 */
exports.getServers = async (req, res, next) => {
  console.log('[GET /api/servers]', { 
    activeOnly: req.query.active,
    serverId: req.query.id
  });
  
  try {
    const { active, id } = req.query || {};
    
    let servers;
    let totalServers = 0;
    
    if (id) {
      // Get specific server by ID
      const server = await getServerById(id);
      if (!server) {
        return res.status(404).json({
          success: false,
          error: `Server with ID ${id} not found`
        });
      }
      
      servers = [formatServerInfo(server)];
      totalServers = 1;
      
    } else if (active === 'true') {
      // Get active servers only
      const activeServerList = await getActiveServers();
      servers = activeServerList.map(formatServerInfo);
      totalServers = servers.length;
      
    } else {
      // Get all servers
      const serversData = await getAllServers();
      const serversRaw = serversData.servers || {};
      const serverList = serversRaw.server || serversRaw;
      const serverArray = Array.isArray(serverList) ? serverList : (serverList ? [serverList] : []);
      
      servers = serverArray.map(formatServerInfo);
      totalServers = servers.length;
    }
    
    console.log(`→ Returning ${servers.length} servers`);
    
    return res.json({
      success: true,
      totalServers: totalServers,
      servers: servers
    });
    
  } catch (err) {
    console.log('✗ Error fetching servers:', err.message);
    next(err);
  }
};

/**
 * Get server information for DNS matching
 */
exports.getServerDNSInfo = async (req, res, next) => {
  console.log('[GET /api/servers/dns-info]');
  
  try {
    const serverInfo = await getServerInfoForDNS();
    
    console.log(`→ Returning DNS info for ${serverInfo.servers.length} servers`);
    
    return res.json({
      success: true,
      ...serverInfo
    });
    
  } catch (err) {
    console.log('✗ Error fetching server DNS info:', err.message);
    next(err);
  }
};

/**
 * Get specific server by ID
 */
exports.getServerById = async (req, res, next) => {
  console.log('[GET /api/servers/:id]', { 
    serverId: req.params.id
  });
  
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Server ID is required'
      });
    }
    
    const server = await getServerById(id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: `Server with ID ${id} not found`
      });
    }
    
    console.log(`→ Returning server: ${server.name || server.hostname}`);
    
    return res.json({
      success: true,
      server: formatServerInfo(server)
    });
    
  } catch (err) {
    console.log('✗ Error fetching server:', err.message);
    next(err);
  }
};

/**
 * Get server statistics
 */
exports.getServerStats = async (req, res, next) => {
  console.log('[GET /api/servers/stats]');
  
  try {
    const serversData = await getAllServers();
    const serversRaw = serversData.servers || {};
    const servers = serversRaw.server || serversRaw;
    const serverArray = Array.isArray(servers) ? servers : (servers ? [servers] : []);
    
    const stats = {
      total: serverArray.length,
      active: serverArray.filter(s => s.active === '1' || s.active === 1 || s.active === true).length,
      inactive: serverArray.filter(s => s.active !== '1' && s.active !== 1 && s.active !== true).length,
      disabled: serverArray.filter(s => s.disabled === '1' || s.disabled === 1 || s.disabled === true).length,
      byType: {}
    };
    
    // Count by server type
    serverArray.forEach(server => {
      const type = server.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });
    
    console.log(`→ Server stats: ${stats.total} total, ${stats.active} active`);
    
    return res.json({
      success: true,
      stats: stats
    });
    
  } catch (err) {
    console.log('✗ Error fetching server stats:', err.message);
    next(err);
  }
};

module.exports = exports;