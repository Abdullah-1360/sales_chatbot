/**
 * WHMCS Sync Service
 * Fetches products from WHMCS API and syncs to MongoDB
 */

const axios = require('axios');
const Product = require('../models/Product');
const cfg = require('../config');
const { getAllGids, getGidName } = require('./gidHelper');
const { createLogger } = require('../utils/logger');

const logger = createLogger('WHMCS-SYNC');

// PIDs that should never be synced
const EXCLUDED_PIDS = ['238', '250'];

/**
 * Fetch products from WHMCS API for a specific GID
 */
async function fetchWHMCSProducts(gid) {
  try {
    const params = {
      action: 'GetProducts',
      gid: gid,
      currencyid:2,
      responsetype: 'json',
      identifier: cfg.WHMCS_API_IDENTIFIER,
      secret: cfg.WHMCS_API_SECRET
    };

    logger.info(`Fetching products from WHMCS for GID ${gid} (${getGidName(gid)})`);
    logger.logWHMCSRequest('GetProducts', params);
    
    const startTime = Date.now();
    const response = await axios.get(cfg.WHMCS_URL, { params });
    const duration = Date.now() - startTime;
    
    logger.debug(`WHMCS API response received in ${duration}ms`);
    
    if (response.data.result !== 'success') {
      logger.error(`WHMCS API error for GID ${gid}`, {
        result: response.data.result,
        message: response.data.message
      });
      throw new Error(`WHMCS API error: ${response.data.message || 'Unknown error'}`);
    }

    const products = response.data.products?.product || [];
    logger.info(`Successfully fetched ${products.length} products for GID ${gid}`);
    logger.logWHMCSResponse('GetProducts', true, { 
      gid, 
      productCount: products.length,
      duration: `${duration}ms`
    });
    
    return products;
  } catch (error) {
    logger.error(`Failed to fetch products for GID ${gid}`, {
      error: error.message,
      stack: error.stack
    });
    logger.logWHMCSResponse('GetProducts', false, { gid, error: error.message });
    return [];
  }
}

/**
 * Transform WHMCS product to MongoDB format
 */
function transformProduct(whmcsProduct) {
  // Extract diskspace from description if not directly available
  let diskspace = '0';
  
  // Try to extract from description (e.g., "3GB SSD Storage" or "8 SSD Storage")
  if (whmcsProduct.description) {
    const storageMatch = whmcsProduct.description.match(/(\d+)\s*GB/i);
    if (storageMatch) {
      diskspace = storageMatch[1];
    }
  }
  
  // Check if there's a direct diskspace field
  if (whmcsProduct.diskspace) {
    diskspace = String(whmcsProduct.diskspace);
  }
  
  // Determine if it has free domain from description
  const hasFreeDomain = whmcsProduct.description?.toLowerCase().includes('free domain') || 
                         whmcsProduct.description?.toLowerCase().includes('free .com') ||
                         whmcsProduct.description?.toLowerCase().includes('free .pk') ||
                         Boolean(whmcsProduct.freedomain);
  
  // Store complete WHMCS product data
  return {
    pid: String(whmcsProduct.pid),
    gid: String(whmcsProduct.gid),
    type: whmcsProduct.type || 'hostingaccount',
    name: whmcsProduct.name || '',
    description: whmcsProduct.description || '',
    module: whmcsProduct.module || '',
    paytype: whmcsProduct.paytype || 'recurring',
    diskspace: diskspace,
    freedomain: hasFreeDomain,
    hidden: whmcsProduct.hidden === '1' || whmcsProduct.hidden === true, // Track hidden status
    pricing: whmcsProduct.pricing || {}, // Store complete pricing object (PKR + USD)
    customfields: whmcsProduct.customfields || {},
    configoptions: whmcsProduct.configoptions || {},
    link: `https://portal.hostbreak.com/cart.php?a=add&pid=${whmcsProduct.pid}&currency=2`
  };
}

/**
 * Sync all products from WHMCS to MongoDB
 */
async function syncAllProducts() {
  try {
    console.log('\n🔄 Starting WHMCS → MongoDB sync...\n');
    
    // Get all configured GIDs from helper
    const gids = getAllGids();
    let allProducts = [];
    let totalFetched = 0;

    // Fetch products for each GID
    let hiddenCount = 0;
    for (const gid of gids) {
      const products = await fetchWHMCSProducts(gid);
      
      // Transform and filter out hidden products and excluded PIDs
      const transformed = products
        .map(transformProduct)
        .filter(p => {
          if (EXCLUDED_PIDS.includes(p.pid)) {
            logger.info(`Filtering out excluded PID: ${p.pid} - ${p.name}`);
            return false;
          }
          if (p.hidden) {
            hiddenCount++;
            logger.debug(`Filtering out hidden product: ${p.name} (PID: ${p.pid})`);
            return false;
          }
          return true;
        });
      
      allProducts = allProducts.concat(transformed);
      totalFetched += products.length;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (allProducts.length === 0) {
      logger.warn('No products fetched from WHMCS (all may be hidden)');
      return { success: false, message: 'No products fetched' };
    }

    logger.info(`Total products fetched: ${totalFetched}, Hidden: ${hiddenCount}, Visible: ${allProducts.length}`);
    logger.info('Syncing visible products to MongoDB');

    // Clear existing products
    const deleteResult = await Product.deleteMany({});
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing products`);

    // Insert new products
    const insertResult = await Product.insertMany(allProducts);
    console.log(`✅ Inserted ${insertResult.length} products`);

    // Display summary by GID
    console.log('\n📊 Products by GID:');
    for (const gid of gids) {
      const count = allProducts.filter(p => p.gid === String(gid)).length;
      const name = getGidName(gid);
      console.log(`   GID ${gid} (${name}): ${count} products`);
    }

    console.log('\n✅ Sync completed successfully!\n');

    return {
      success: true,
      totalFetched,
      totalInserted: insertResult.length,
      byGID: gids.map(gid => ({
        gid,
        count: allProducts.filter(p => p.gid === String(gid)).length
      }))
    };

  } catch (error) {
    console.error('❌ Sync failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sync products for a specific GID
 */
async function syncGID(gid) {
  try {
    console.log(`\n🔄 Syncing GID ${gid} from WHMCS...\n`);

    const products = await fetchWHMCSProducts(gid);
    
    if (products.length === 0) {
      console.log(`⚠️  No products found for GID ${gid}`);
      return { success: false, message: 'No products found' };
    }

    const transformed = products.map(transformProduct);

    // Delete existing products for this GID
    const deleteResult = await Product.deleteMany({ gid: String(gid) });
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing products for GID ${gid}`);

    // Insert new products
    const insertResult = await Product.insertMany(transformed);
    console.log(`✅ Inserted ${insertResult.length} products for GID ${gid}\n`);

    return {
      success: true,
      gid,
      count: insertResult.length
    };

  } catch (error) {
    console.error(`❌ Sync failed for GID ${gid}:`, error);
    return {
      success: false,
      gid,
      error: error.message
    };
  }
}

/**
 * Schedule automatic sync
 */
function scheduleSync(intervalHours = 24) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  console.log(`⏰ Scheduled automatic sync every ${intervalHours} hours`);
  
  setInterval(async () => {
    console.log('\n⏰ Running scheduled sync...');
    await syncAllProducts();
  }, intervalMs);
}

module.exports = {
  syncAllProducts,
  syncGID,
  fetchWHMCSProducts,
  scheduleSync
};
