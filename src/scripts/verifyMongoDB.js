/**
 * Verify MongoDB data
 */

require('dotenv').config();
const { connectDB } = require('../config/database');
const Product = require('../models/Product');

async function verifyData() {
  try {
    await connectDB();

    console.log('📊 Verifying MongoDB data...\n');

    // Count total products
    const totalCount = await Product.countDocuments();
    console.log(`✅ Total products in database: ${totalCount}`);

    // Count by GID
    const gids = ['1', '20', '21', '25', '28'];
    console.log('\n📦 Products by GID:');
    for (const gid of gids) {
      const count = await Product.countDocuments({ gid });
      const products = await Product.find({ gid }).select('pid name pricing.USD.monthly');
      console.log(`\n  GID ${gid}: ${count} products`);
      products.forEach(p => {
        console.log(`    - ${p.name} (PID: ${p.pid}) - $${p.pricing.USD.monthly}/mo`);
      });
    }

    console.log('\n✅ MongoDB verification completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyData();
