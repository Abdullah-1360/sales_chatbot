/**
 * Debug script to check invoice ownership
 * Helps identify why invoice lookup is failing
 */

require('dotenv').config();
const { getInvoice, getInvoices, getClientsDetails } = require('../services/whmcsService');

const TEST_EMAIL = process.env.TEST_EMAIL || 'abdullahshahid906@gmail.com';
const TEST_INVOICE_ID = process.env.TEST_INVOICE_ID || '130901';

console.log('🔍 Invoice Ownership Debug Tool\n');
console.log('Configuration:', {
  email: TEST_EMAIL,
  invoiceId: TEST_INVOICE_ID
});
console.log('\n' + '='.repeat(80) + '\n');

async function debugInvoiceOwnership() {
  try {
    // Step 1: Resolve email to clientId
    console.log('Step 1: Resolving email to clientId...');
    const clientData = await getClientsDetails({ email: TEST_EMAIL });
    
    if (!clientData || !clientData.userid) {
      console.log('❌ Client not found for email:', TEST_EMAIL);
      return;
    }
    
    const clientId = String(clientData.userid);
    console.log('✅ Client found:', {
      clientId: clientId,
      firstname: clientData.firstname,
      lastname: clientData.lastname,
      email: clientData.email
    });
    
    console.log('\n' + '-'.repeat(80) + '\n');
    
    // Step 2: Fetch the specific invoice
    console.log('Step 2: Fetching invoice', TEST_INVOICE_ID, '...');
    let invoice;
    try {
      invoice = await getInvoice(TEST_INVOICE_ID);
      console.log('✅ Invoice found:', {
        invoiceId: invoice.invoiceid || invoice.id,
        userid: invoice.userid || invoice.clientid,
        status: invoice.status,
        total: invoice.total,
        balance: invoice.balance,
        duedate: invoice.duedate
      });
    } catch (err) {
      console.log('❌ Invoice not found:', err.message);
      console.log('\nPossible reasons:');
      console.log('  1. Invoice ID does not exist in WHMCS');
      console.log('  2. Invoice ID is incorrect');
      console.log('  3. WHMCS API permissions issue');
      return;
    }
    
    console.log('\n' + '-'.repeat(80) + '\n');
    
    // Step 3: Check ownership
    console.log('Step 3: Validating ownership...');
    const invoiceOwnerId = String(invoice.userid || invoice.clientid);
    
    console.log('Comparison:', {
      invoiceOwnerId: invoiceOwnerId,
      requestedClientId: clientId,
      match: invoiceOwnerId === clientId
    });
    
    if (invoiceOwnerId === clientId) {
      console.log('✅ OWNERSHIP VALIDATED - Invoice belongs to this client');
    } else {
      console.log('❌ OWNERSHIP FAILED - Invoice belongs to a different client');
      console.log('\nThis invoice belongs to client:', invoiceOwnerId);
      console.log('But you are trying to access it as client:', clientId);
      console.log('\nPossible reasons:');
      console.log('  1. Wrong invoice ID provided');
      console.log('  2. Wrong email provided');
      console.log('  3. Invoice belongs to a different account');
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Step 4: List all invoices for this client
    console.log('Step 4: Listing all invoices for client', clientId, '...');
    const invoicesData = await getInvoices({ 
      userid: clientId, 
      limitnum: 10,
      orderby: 'date',
      order: 'DESC'
    });
    
    const invoiceList = invoicesData.invoices?.invoice || [];
    const invoiceArray = Array.isArray(invoiceList) ? invoiceList : (invoiceList ? [invoiceList] : []);
    
    console.log(`\n✅ Found ${invoiceArray.length} invoices for this client:\n`);
    
    if (invoiceArray.length === 0) {
      console.log('  No invoices found for this client');
    } else {
      invoiceArray.forEach((inv, index) => {
        const invId = inv.invoiceid || inv.id;
        const isTarget = String(invId) === String(TEST_INVOICE_ID);
        console.log(`  ${index + 1}. Invoice #${invId}${isTarget ? ' ⭐ (TARGET)' : ''}`);
        console.log(`     Status: ${inv.status}`);
        console.log(`     Total: ${inv.total}`);
        console.log(`     Balance: ${inv.balance}`);
        console.log(`     Due Date: ${inv.duedate}`);
        console.log('');
      });
      
      const targetFound = invoiceArray.some(inv => String(inv.invoiceid || inv.id) === String(TEST_INVOICE_ID));
      
      if (targetFound) {
        console.log('✅ Target invoice IS in the client\'s invoice list');
      } else {
        console.log('❌ Target invoice is NOT in the client\'s invoice list');
        console.log('\nThis confirms the invoice belongs to a different client.');
      }
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Summary
    console.log('📊 SUMMARY:\n');
    console.log(`Email: ${TEST_EMAIL}`);
    console.log(`Client ID: ${clientId}`);
    console.log(`Invoice ID: ${TEST_INVOICE_ID}`);
    console.log(`Invoice Owner: ${invoiceOwnerId}`);
    console.log(`Ownership Match: ${invoiceOwnerId === clientId ? '✅ YES' : '❌ NO'}`);
    
    if (invoiceOwnerId !== clientId) {
      console.log('\n⚠️  RECOMMENDATION:');
      console.log('   Use one of the invoice IDs listed above that belong to this client.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the debug
debugInvoiceOwnership()
  .then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  });
