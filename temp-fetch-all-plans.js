/**
 * TEMPORARY SCRIPT - Fetch all plans from WHMCS and create detailed JSON file
 * Usage: node temp-fetch-all-plans.js
 * 
 * This script will be deleted later
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const Product = require('./src/models/Product');
const cfg = require('./src/config');
const { getAllGids, getGidName } = require('./src/services/gidHelper');

async function fetchAllPlansTable() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(cfg.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all GIDs
    const gids = getAllGids();
    console.log(`📊 Fetching plans from ${gids.length} GIDs...\n`);

    // Fetch all plans
    const allPlans = await Product.find({
      $or: [
        { hidden: { $exists: false } },
        { hidden: false }
      ]
    }).lean();

    console.log(`✅ Found ${allPlans.length} total plans\n`);
    console.log('📝 Generating JSON file...\n');

    // Transform plans into structured JSON format
    const jsonData = {
      exportDate: new Date().toISOString(),
      totalPlans: allPlans.length,
      plans: allPlans.map(plan => ({
        pid: plan.pid,
        gid: plan.gid,
        gidName: getGidName(Number(plan.gid)),
        name: plan.name,
        type: plan.type || null,
        module: plan.module || null,
        paymentType: plan.paytype || null,
        diskspace: plan.diskspace || null,
        freeDomain: plan.freedomain || false,
        hidden: plan.hidden || false,
        description: plan.description || null,
        pricing: {
          PKR: {
            monthly: plan.pricing?.PKR?.monthly || null,
            quarterly: plan.pricing?.PKR?.quarterly || null,
            semiannually: plan.pricing?.PKR?.semiannually || null,
            annually: plan.pricing?.PKR?.annually || null,
            biennially: plan.pricing?.PKR?.biennially || null,
            triennially: plan.pricing?.PKR?.triennially || null
          },
          USD: {
            monthly: plan.pricing?.USD?.monthly || null,
            quarterly: plan.pricing?.USD?.quarterly || null,
            semiannually: plan.pricing?.USD?.semiannually || null,
            annually: plan.pricing?.USD?.annually || null,
            biennially: plan.pricing?.USD?.biennially || null,
            triennially: plan.pricing?.USD?.triennially || null
          }
        },
        link: plan.link || null,
        createdAt: plan.createdAt || null,
        updatedAt: plan.updatedAt || null,
        customFields: plan.customfields || null,
        configOptions: plan.configoptions || null
      }))
    };

    // Write to file with pretty formatting
    const filename = `all-plans-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(jsonData, null, 2), 'utf8');

    console.log(`✅ JSON file created: ${filename}`);
    console.log(`📊 Total plans exported: ${allPlans.length}`);
    
    // Summary by GID
    console.log('\n📋 Summary by GID:');
    gids.forEach(gid => {
      const gidPlans = allPlans.filter(p => p.gid === String(gid));
      if (gidPlans.length > 0) {
        console.log(`   GID ${gid} (${getGidName(gid)}): ${gidPlans.length} plans`);
      }
    });

    console.log('\n✅ Complete! Open the JSON file to view all plan data.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
fetchAllPlansTable();
