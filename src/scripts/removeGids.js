/**
 * Script to remove specific PIDs from MongoDB
 * Usage: node src/scripts/removeGids.js
 */

const mongoose = require('mongoose');
const Product = require('../models/Product');
const cfg = require('../config');

const PIDS_TO_REMOVE = ['238', '250'];

async function removePids() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(cfg.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log(`🗑️  Removing products with PIDs: ${PIDS_TO_REMOVE.join(', ')}\n`);

    // Find products before deletion to show details
    const productsToRemove = await Product.find({
      pid: { $in: PIDS_TO_REMOVE }
    });

    if (productsToRemove.length > 0) {
      console.log('Products to be removed:');
      productsToRemove.forEach(p => {
        console.log(`   - PID ${p.pid}: ${p.name} (GID ${p.gid})`);
      });
      console.log('');
    }

    // Remove products with specified PIDs
    const result = await Product.deleteMany({
      pid: { $in: PIDS_TO_REMOVE }
    });

    console.log(`✅ Removed ${result.deletedCount} products with PIDs ${PIDS_TO_REMOVE.join(', ')}`);

    // Show remaining products count
    const totalRemaining = await Product.countDocuments();
    console.log(`\n📊 Total remaining products: ${totalRemaining}`);

    console.log('\n✅ Done!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
removePids();
