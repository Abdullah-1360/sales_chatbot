/**
 * Seed script to migrate fixture data to MongoDB
 */

// Load .env file only if it exists (optional for production)
try {
  require('dotenv').config();
} catch (err) {
  // Using environment variables directly
}
const { connectDB } = require('../config/database');
const Product = require('../models/Product');
const fixtureData = require('../_fixtures/whmcs-products.json');

async function seedProducts() {
  try {
    await connectDB();

    console.log('🌱 Starting product seeding...');

    // Clear existing products
    const deleteResult = await Product.deleteMany({});
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing products`);

    // Insert products from fixture
    const products = fixtureData.products.product;
    const insertResult = await Product.insertMany(products);
    console.log(`✅ Inserted ${insertResult.length} products`);

    // Display summary by GID
    const gids = [...new Set(products.map(p => p.gid))];
    console.log('\n📊 Products by GID:');
    for (const gid of gids) {
      const count = products.filter(p => p.gid === gid).length;
      console.log(`   GID ${gid}: ${count} products`);
    }

    console.log('\n✅ Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedProducts();
