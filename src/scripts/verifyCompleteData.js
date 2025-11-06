/**
 * Verify complete WHMCS data in MongoDB
 */

require('dotenv').config();
const { connectDB } = require('../config/database');
const Product = require('../models/Product');

async function verifyCompleteData() {
  try {
    await connectDB();

    console.log('📊 Verifying Complete WHMCS Data in MongoDB...\n');

    // Get one product from each GID to verify structure
    const gids = ['1', '20', '21', '25', '28'];
    
    for (const gid of gids) {
      const product = await Product.findOne({ gid }).lean();
      
      if (product) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`GID ${gid} Sample: ${product.name} (PID: ${product.pid})`);
        console.log('='.repeat(80));
        
        console.log('\n📦 Basic Info:');
        console.log(`  Type: ${product.type}`);
        console.log(`  Module: ${product.module}`);
        console.log(`  Paytype: ${product.paytype}`);
        console.log(`  Diskspace: ${product.diskspace} GB`);
        console.log(`  Free Domain: ${product.freedomain}`);
        
        console.log('\n💰 Pricing:');
        if (product.pricing.USD) {
          console.log(`  USD Monthly: $${product.pricing.USD.monthly}`);
          console.log(`  USD Quarterly: $${product.pricing.USD.quarterly}`);
          console.log(`  USD Yearly: $${product.pricing.USD.annually || product.pricing.USD.yearly}`);
        }
        if (product.pricing.PKR) {
          console.log(`  PKR Monthly: Rs.${product.pricing.PKR.monthly}`);
          console.log(`  PKR Yearly: Rs.${product.pricing.PKR.annually}`);
        }
        
        console.log('\n⚙️  Config Options:');
        if (product.configoptions && product.configoptions.configoption) {
          const options = Array.isArray(product.configoptions.configoption) 
            ? product.configoptions.configoption 
            : [product.configoptions.configoption];
          console.log(`  Total Options: ${options.length}`);
          options.slice(0, 3).forEach(opt => {
            console.log(`  - ${opt.name} (ID: ${opt.id})`);
          });
          if (options.length > 3) {
            console.log(`  ... and ${options.length - 3} more options`);
          }
        } else {
          console.log('  No config options');
        }
        
        console.log('\n📝 Description:');
        console.log(`  ${product.description.substring(0, 100)}...`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Complete data verification finished!\n');
    
    // Count total fields stored
    const sampleProduct = await Product.findOne().lean();
    if (sampleProduct) {
      const fieldCount = Object.keys(sampleProduct).length;
      console.log(`📊 Total fields per product: ${fieldCount}`);
      console.log(`📦 Fields: ${Object.keys(sampleProduct).join(', ')}\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyCompleteData();
