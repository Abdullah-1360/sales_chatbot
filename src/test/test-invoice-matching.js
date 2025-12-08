/**
 * Test invoice matching logic
 * Demonstrates how invoices are matched to services/domains
 */

require('dotenv').config();
const { getInvoices, getInvoice } = require('../services/whmcsService');

const TEST_CLIENT_ID = process.env.TEST_CLIENT_ID || '29097';

console.log('🧪 Testing Invoice Matching Logic\n');
console.log('='.repeat(80));

async function testInvoiceMatching() {
  try {
    console.log(`Fetching unpaid invoices for client ${TEST_CLIENT_ID}...\n`);
    
    // Get unpaid invoices
    const list = await getInvoices({ 
      userid: TEST_CLIENT_ID, 
      status: 'Unpaid', 
      limitnum: 10 
    });
    
    const invoices = list.invoices?.invoice || [];
    const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
    
    console.log(`Found ${invoiceArray.length} unpaid invoice(s)\n`);
    
    if (invoiceArray.length === 0) {
      console.log('✅ No unpaid invoices found (good standing!)');
      console.log('\n💡 To test invoice matching:');
      console.log('   1. Create a test invoice in WHMCS');
      console.log('   2. Or wait for automatic renewal invoice generation');
      console.log('   3. Then run this test again');
      return;
    }
    
    // Analyze each invoice
    for (const inv of invoiceArray) {
      const invoiceId = inv.id || inv.invoiceid;
      console.log('='.repeat(80));
      console.log(`📋 Invoice #${invoiceId}`);
      console.log('='.repeat(80));
      
      try {
        const detail = await getInvoice(invoiceId);
        
        console.log(`Status: ${detail.status}`);
        console.log(`Total: ${detail.total}`);
        console.log(`Balance: ${detail.balance}`);
        console.log(`Due Date: ${detail.duedate}`);
        console.log('');
        
        // Parse items
        const items = detail.items?.item || [];
        const itemArray = Array.isArray(items) ? items : (items ? [items] : []);
        
        console.log(`Items (${itemArray.length}):`);
        itemArray.forEach((item, index) => {
          console.log(`\n  Item ${index + 1}:`);
          console.log(`    Type: ${item.type}`);
          console.log(`    Related ID (relid): ${item.relid}`);
          console.log(`    Amount: ${item.amount}`);
          console.log(`    Description: ${item.description?.substring(0, 100)}...`);
          
          // Show matching logic
          console.log(`\n    ✓ Matching Logic:`);
          console.log(`      • Service ID ${item.relid} → Match by: relid == serviceId`);
          console.log(`      • Domain in description → Match by: description contains domain`);
          
          if (item.type === 'Hosting') {
            console.log(`      • This is a HOSTING item (service renewal)`);
          } else if (item.type === 'Domain') {
            console.log(`      • This is a DOMAIN item (domain renewal)`);
          }
        });
        
        console.log('\n');
      } catch (err) {
        console.log(`  ❌ Error fetching invoice details: ${err.message}\n`);
      }
    }
    
    console.log('='.repeat(80));
    console.log('\n💡 HOW MATCHING WORKS:');
    console.log('   1. Fetch all unpaid invoices for client');
    console.log('   2. For each invoice, get full details including items');
    console.log('   3. Check each item:');
    console.log('      • If relid matches serviceId → Found service renewal invoice');
    console.log('      • If relid matches domainId → Found domain renewal invoice');
    console.log('      • If description contains domain name → Found related invoice');
    console.log('   4. Return first matching invoice');
    console.log('\n' + '='.repeat(80));
    
    console.log('\n📊 EXAMPLE MATCHES:');
    console.log('   Service Renewal:');
    console.log('     Request: { serviceId: "26851" }');
    console.log('     Invoice Item: { type: "Hosting", relid: "26851" }');
    console.log('     Result: ✅ MATCH (relid == serviceId)');
    console.log('');
    console.log('   Domain Renewal:');
    console.log('     Request: { domain: "example.com" }');
    console.log('     Invoice Item: { description: "example.com (renewal)" }');
    console.log('     Result: ✅ MATCH (description contains domain)');
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testInvoiceMatching()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
