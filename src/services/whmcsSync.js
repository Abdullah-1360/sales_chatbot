/**
 * WHMCS Sync Service
 * Fetches products from WHMCS API and syncs to MongoDB
 */

const axios = require('axios');
const Product = require('../models/Product');
const cfg = require('../config');

/**
 * Fetch products from WHMCS API for a specific GID
 */
async function fetchWHMCSProducts(gid) {
  try {
    const params = {
      action: 'GetProducts',
      gid: gid,
      responsetype: 'json',
      identifier: cfg.WHMCS_API_IDENTIFIER,
      secret: cfg.WHMCS_API_SECRET
    };

    console.log(`📡 Fetching products from WHMCS for GID ${gid}...`);
    
    const response = await axios.get(cfg.WHMCS_URL, { params });
    
    if (response.data.result !== 'success') {
      throw new Error(`WHMCS API error: ${response.data.message || 'Unknown error'}`);
    }

    const products = response.data.products?.product || [];
    console.log(`✅ Fetched ${products.length} products for GID ${gid}`);
    
    return products;
  } catch (error) {
    console.error(`❌ Error fetching GID ${gid}:`, error.message);
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
    pricing: whmcsProduct.pricing || {}, // Store complete pricing object (PKR + USD)
    customfields: whmcsProduct.customfields || {},
    configoptions: whmcsProduct.configoptions || {},
    link: whmcsProduct.orderurl || `https://portal.hostbreak.com/order/${whmcsProduct.gid}/${whmcsProduct.pid}`
  };
}

/**
 * Sync all products from WHMCS to MongoDB
 */
async function syncAllProducts() {
  try {
    console.log('\n🔄 Starting WHMCS → MongoDB sync...\n');
    
    const gids = [1, 20, 21, 25, 28]; // All product groups
    let allProducts = [];
    let totalFetched = 0;

    // Fetch products for each GID
    for (const gid of gids) {
      const products = await fetchWHMCSProducts(gid);
      
      // Transform and add to collection
      const transformed = products.map(transformProduct);
      allProducts = allProducts.concat(transformed);
      totalFetched += products.length;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (allProducts.length === 0) {
      console.log('⚠️  No products fetched from WHMCS');
      return { success: false, message: 'No products fetched' };
    }

    console.log(`\n📦 Total products fetched: ${totalFetched}`);
    console.log('💾 Syncing to MongoDB...\n');

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
      console.log(`   GID ${gid}: ${count} products`);
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
