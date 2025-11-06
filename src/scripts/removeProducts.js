/**
 * Remove specific products from MongoDB
 */

require('dotenv').config();
const { connectDB } = require('../config/database');
const Product = require('../models/Product');

async function removeProducts() {
  try {
    await connectDB();

    console.log('🗑️  Removing products with PID 238 and 250...\n');

    // Remove products
    const result = await Product.deleteMany({ 
      pid: { $in: ['238', '250'] } 
    });

    console.log(`✅ Deleted ${result.deletedCount} products\n`);

    // Verify they're gone
    const remaining238 = await Product.findOne({ pid: '238' });
    const remaining250 = await Product.findOne({ pid: '250' });

    if (!remaining238 && !remaining250) {
      console.log('✅ Verification: Products successfully removed\n');
    } else {
      console.log('⚠️  Warning: Some products may still exist\n');
    }

    // Show updated count
    const totalCount = await Product.countDocuments();
    console.log(`📊 Total products remaining: ${totalCount}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

removeProducts();
