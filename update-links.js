#!/usr/bin/env node

/**
 * Script to update all old portal.hostbreak.com/order links to the new cart.php format
 */

const fs = require('fs');
const path = require('path');

// Function to extract PID from old link format
function extractPidFromOldLink(oldLink) {
  const match = oldLink.match(/\/order\/\d+\/(\d+)$/);
  return match ? match[1] : null;
}

// Function to generate new link format
function generateNewLink(pid) {
  return `https://portal.hostbreak.com/cart.php?a=add&pid=${pid}&currency=2`;
}

// Function to update JSON file
function updateJsonFile(filePath) {
  console.log(`Updating JSON file: ${filePath}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    let updatedCount = 0;
    
    // Check if data has plans array or is direct array
    const plans = data.plans || data;
    
    // Update each product's link
    plans.forEach(product => {
      if (product.link && product.link.includes('portal.hostbreak.com/order/')) {
        const pid = extractPidFromOldLink(product.link);
        if (pid) {
          const newLink = generateNewLink(pid);
          console.log(`  Updating PID ${pid}: ${product.link} -> ${newLink}`);
          product.link = newLink;
          updatedCount++;
        }
      }
    });
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  Updated ${updatedCount} links in ${filePath}`);
    
  } catch (error) {
    console.error(`Error updating JSON file ${filePath}:`, error.message);
  }
}

// Function to update CSV file
function updateCsvFile(filePath) {
  console.log(`Updating CSV file: ${filePath}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let updatedCount = 0;
    
    // Process each line (skip header)
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() && lines[i].includes('portal.hostbreak.com/order/')) {
        // Find and replace the old link format
        const oldLinkMatch = lines[i].match(/https:\/\/portal\.hostbreak\.com\/order\/\d+\/(\d+)/);
        if (oldLinkMatch) {
          const pid = oldLinkMatch[1];
          const oldLink = oldLinkMatch[0];
          const newLink = generateNewLink(pid);
          
          console.log(`  Updating PID ${pid}: ${oldLink} -> ${newLink}`);
          lines[i] = lines[i].replace(oldLink, newLink);
          updatedCount++;
        }
      }
    }
    
    // Write back to file
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`  Updated ${updatedCount} links in ${filePath}`);
    
  } catch (error) {
    console.error(`Error updating CSV file ${filePath}:`, error.message);
  }
}

// Main execution
function main() {
  console.log('Starting link update process...\n');
  
  // Update JSON file
  const jsonFile = 'all-plans-1763962201513.json';
  if (fs.existsSync(jsonFile)) {
    updateJsonFile(jsonFile);
  } else {
    console.log(`JSON file ${jsonFile} not found`);
  }
  
  console.log('');
  
  // Update CSV file
  const csvFile = 'all-plans-1763797071622.csv';
  if (fs.existsSync(csvFile)) {
    updateCsvFile(csvFile);
  } else {
    console.log(`CSV file ${csvFile} not found`);
  }
  
  console.log('\nLink update process completed!');
}

// Run the script
main();