/**
 * Analyze all plans to identify search keywords
 */

const mongoose = require('mongoose');
const Product = require('./src/models/Product');
const cfg = require('./src/config');

async function analyzePlans() {
  try {
    await mongoose.connect(cfg.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const products = await Product.find({
      $or: [
        { hidden: { $exists: false } },
        { hidden: false }
      ]
    }).lean();

    console.log(`📊 Total Plans: ${products.length}\n`);
    console.log('=' .repeat(80));
    console.log('ALL PLAN NAMES:');
    console.log('=' .repeat(80));

    products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.name} (GID: ${p.gid}, PID: ${p.pid})`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('KEYWORD ANALYSIS:');
    console.log('=' .repeat(80));

    // Extract unique keywords
    const keywords = new Set();
    const wordCounts = {};

    products.forEach(p => {
      const words = p.name.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2); // Ignore short words

      words.forEach(word => {
        keywords.add(word);
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });
    });

    // Sort by frequency
    const sortedWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1]);

    console.log('\nMost Common Keywords:');
    sortedWords.slice(0, 20).forEach(([word, count]) => {
      console.log(`  ${word}: ${count} plans`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('SUGGESTED SEARCH TERMS:');
    console.log('=' .repeat(80));

    const categories = {
      'Hosting Types': [],
      'Plan Levels': [],
      'Features': [],
      'Technologies': [],
      'SSL/Security': [],
      'Other': []
    };

    sortedWords.forEach(([word]) => {
      if (['wordpress', 'woocommerce', 'cpanel', 'litespeed', 'ssd'].includes(word)) {
        categories['Technologies'].push(word);
      } else if (['starter', 'basic', 'standard', 'professional', 'business', 'premium', 'ultimate', 'enterprise'].includes(word)) {
        categories['Plan Levels'].push(word);
      } else if (['hosting', 'reseller', 'vps', 'dedicated', 'cloud'].includes(word)) {
        categories['Hosting Types'].push(word);
      } else if (['ssl', 'certificate', 'security', 'wildcard'].includes(word)) {
        categories['SSL/Security'].push(word);
      } else if (['unlimited', 'managed', 'shared', 'email'].includes(word)) {
        categories['Features'].push(word);
      } else if (word.length > 3) {
        categories['Other'].push(word);
      }
    });

    Object.entries(categories).forEach(([category, words]) => {
      if (words.length > 0) {
        console.log(`\n${category}:`);
        words.forEach(w => console.log(`  - ${w}`));
      }
    });

    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

analyzePlans();
