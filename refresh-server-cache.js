/**
 * Refresh Server Cache - Clear MongoDB cache and fetch fresh WHMCS data
 */

require('dotenv').config();

const { 
  clearServerCache, 
  refreshServerDataCache, 
  getServerStats,
  healthCheck 
} = require('./src/services/mongoServerService');

async function refreshCache() {
  console.log('🔄 Refreshing Server Cache from WHMCS\n');
  
  console.log('📋 Step 1: Health Check');
  console.log('='.repeat(25));
  
  try {
    const health = await healthCheck();
    console.log('📊 MongoDB Health:');
    console.log(`  Status: ${health.mongodb}`);
    console.log(`  Database: ${health.database}`);
    console.log(`  Collection: ${health.collection}`);
    console.log(`  Cache Status: ${health.cacheStatus || 'unknown'}`);
    console.log(`  Total Servers: ${health.totalServers || 0}`);
    console.log(`  Last Updated: ${health.lastUpdated || 'Never'}`);
    
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  console.log('📋 Step 2: Clear Existing Cache');
  console.log('='.repeat(32));
  
  try {
    console.log('🗑️ Clearing existing server cache...');
    
    const deletedCount = await clearServerCache();
    console.log(`✅ Cleared ${deletedCount} cache entries`);
    
  } catch (error) {
    console.error('❌ Cache clearing failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  console.log('📋 Step 3: Fetch Fresh Data from WHMCS');
  console.log('='.repeat(40));
  
  try {
    console.log('📡 Fetching fresh server data from WHMCS...');
    
    const freshData = await refreshServerDataCache(true);
    
    console.log('✅ Fresh data retrieved:');
    console.log(`  Source: ${freshData.source}`);
    console.log(`  Server IPs: ${freshData.serverIPs.length}`);
    console.log(`  Mail Servers: ${freshData.mailServers.length}`);
    console.log(`  Nameservers: ${freshData.nameservers.length}`);
    console.log(`  Last Updated: ${freshData.lastUpdated}`);
    
    console.log('\n🔧 Extracted Data Preview:');
    console.log(`  Server IPs: ${freshData.serverIPs.slice(0, 5).join(', ')}${freshData.serverIPs.length > 5 ? '...' : ''}`);
    console.log(`  Mail Servers: ${freshData.mailServers.join(', ')}`);
    console.log(`  Nameservers: ${freshData.nameservers.slice(0, 8).join(', ')}${freshData.nameservers.length > 8 ? '...' : ''}`);
    
  } catch (error) {
    console.error('❌ Fresh data fetch failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  console.log('📋 Step 4: Verify Updated Cache');
  console.log('='.repeat(32));
  
  try {
    console.log('📊 Getting updated cache statistics...');
    
    const stats = await getServerStats();
    
    console.log('✅ Updated Cache Stats:');
    console.log(`  Total Servers: ${stats.totalServers}`);
    console.log(`  Server IPs: ${stats.serverIPs}`);
    console.log(`  Mail Servers: ${stats.mailServers}`);
    console.log(`  Nameservers: ${stats.nameservers}`);
    console.log(`  Cache Age: ${stats.cacheAgeMinutes} minutes`);
    console.log(`  Cache Status: ${stats.cacheStatus}`);
    console.log(`  Last Updated: ${stats.lastUpdated}`);
    
  } catch (error) {
    console.error('❌ Cache verification failed:', error.message);
  }
  
  console.log('\n🎯 Summary:');
  console.log('✅ MongoDB cache cleared');
  console.log('✅ Fresh WHMCS data fetched');
  console.log('✅ Cache updated with new data');
  console.log('✅ Nameservers include ns1-ns6.hostbreak.com defaults');
  
  console.log('\n📝 Next Steps:');
  console.log('1. Test DNS checker with updated cache');
  console.log('2. Verify service status endpoints use new data');
  console.log('3. Monitor cache performance and refresh intervals');
  
  console.log('\n🔗 Test Commands:');
  console.log('  Test DNS: node test-mongodb-server-cache.js');
  console.log('  Test WHMCS: node test-whmcs-servers.js');
  console.log('  Test Auto-fix: node test-auto-dns-fix.js');
}

// Run the refresh
refreshCache().catch(console.error);