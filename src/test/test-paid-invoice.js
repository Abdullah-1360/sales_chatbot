#!/usr/bin/env node
/**
 * Test Paid Invoice with datepaid field
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_API_SECRET;

async function findPaidInvoice(clientId) {
  console.log(`\n=== Finding Paid Invoices for Client ${clientId} ===\n`);
  
  const url = WHMCS_URL;
  const payload = new URLSearchParams({
    action: 'GetInvoices',
    userid: clientId,
    status: 'Paid',
    limitnum: 5,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  try {
    const { data } = await axios.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    if (data.result === 'success' && data.invoices) {
      const invoices = data.invoices.invoice || [];
      const invoiceArray = Array.isArray(invoices) ? invoices : [invoices];
      
      if (invoiceArray.length === 0) {
        console.log('No paid invoices found for this client.');
        return null;
      }
      
      console.log(`Found ${invoiceArray.length} paid invoice(s):\n`);
      invoiceArray.forEach((inv, i) => {
        console.log(`${i + 1}. Invoice #${inv.invoiceid || inv.id}`);
        console.log(`   Total: ${inv.total}`);
        console.log(`   Date Paid: ${inv.datepaid || 'N/A'}`);
        console.log(`   Due Date: ${inv.duedate}`);
        console.log('');
      });
      
      return invoiceArray[0];
    } else {
      console.log('No paid invoices found.');
      return null;
    }
  } catch (err) {
    console.error('Error fetching invoices:', err.message);
    return null;
  }
}

async function testInvoiceLookup(clientId, invoiceId) {
  console.log(`\n=== Testing Invoice Lookup API ===`);
  console.log(`Client ID: ${clientId}`);
  console.log(`Invoice ID: ${invoiceId}\n`);
  
  try {
    const response = await axios.post(`${BASE_URL}/api/invoiceLookup`, {
      clientId: clientId.toString(),
      invoiceId: invoiceId.toString()
    });
    
    console.log('✅ SUCCESS\n');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Verify paidDate field
    if (response.data.status === 'Paid') {
      if (response.data.paidDate) {
        console.log('\n✅ paidDate field is present!');
      } else {
        console.log('\n⚠️  paidDate field is missing!');
      }
    }
    
    return true;
  } catch (err) {
    console.log('❌ FAILED');
    console.log(`Error: ${err.response?.data?.error || err.message}`);
    return false;
  }
}

async function main() {
  const clientId = process.argv[2] || '31';
  
  console.log('============================================================');
  console.log('PAID INVOICE TEST - Verify datepaid Field');
  console.log('============================================================');
  
  // Find a paid invoice
  const paidInvoice = await findPaidInvoice(clientId);
  
  if (!paidInvoice) {
    console.log('\n⚠️  No paid invoices found to test. Try with a different client ID.');
    console.log('Usage: node test-paid-invoice.js <clientId>');
    return;
  }
  
  const invoiceId = paidInvoice.invoiceid || paidInvoice.id;
  
  // Test the API
  await testInvoiceLookup(clientId, invoiceId);
  
  console.log('\n============================================================');
}

main().catch(err => {
  console.error('Fatal Error:', err.message);
  process.exit(1);
});
