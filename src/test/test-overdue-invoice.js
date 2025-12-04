#!/usr/bin/env node
/**
 * Test Overdue Invoice Detection
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_API_SECRET;

async function findOverdueInvoice(clientId) {
  console.log(`\n=== Finding Overdue Invoices for Client ${clientId} ===\n`);
  
  const url = WHMCS_URL;
  const payload = new URLSearchParams({
    action: 'GetInvoices',
    userid: clientId,
    status: 'Unpaid',
    limitnum: 50,
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
        console.log('No unpaid invoices found for this client.');
        return { overdue: null, notOverdue: null };
      }
      
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      let overdueInvoice = null;
      let notOverdueInvoice = null;
      
      console.log(`Found ${invoiceArray.length} unpaid invoice(s):\n`);
      
      invoiceArray.forEach((inv, i) => {
        const dueDate = new Date(inv.duedate);
        dueDate.setHours(0, 0, 0, 0);
        const isOverdue = dueDate < now;
        
        console.log(`${i + 1}. Invoice #${inv.invoiceid || inv.id}`);
        console.log(`   Total: ${inv.total}`);
        console.log(`   Due Date: ${inv.duedate}`);
        console.log(`   Status: ${isOverdue ? '⚠️  OVERDUE' : '✅ Not Overdue'}`);
        console.log('');
        
        if (isOverdue && !overdueInvoice) {
          overdueInvoice = inv;
        }
        if (!isOverdue && !notOverdueInvoice) {
          notOverdueInvoice = inv;
        }
      });
      
      return { overdue: overdueInvoice, notOverdue: notOverdueInvoice };
    } else {
      console.log('No unpaid invoices found.');
      return { overdue: null, notOverdue: null };
    }
  } catch (err) {
    console.error('Error fetching invoices:', err.message);
    return { overdue: null, notOverdue: null };
  }
}

async function testInvoiceLookup(clientId, invoiceId, expectedOverdue) {
  console.log(`\n=== Testing Invoice Lookup API ===`);
  console.log(`Client ID: ${clientId}`);
  console.log(`Invoice ID: ${invoiceId}`);
  console.log(`Expected Overdue: ${expectedOverdue ? 'Yes' : 'No'}\n`);
  
  try {
    const response = await axios.post(`${BASE_URL}/api/invoiceLookup`, {
      clientId: clientId.toString(),
      invoiceId: invoiceId.toString()
    });
    
    console.log('✅ SUCCESS\n');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Verify overdue detection
    if (expectedOverdue) {
      if (response.data.isOverdue) {
        console.log('\n✅ isOverdue field is present and true!');
      } else {
        console.log('\n⚠️  isOverdue field is missing or false!');
      }
      
      if (response.data.message.toLowerCase().includes('overdue')) {
        console.log('✅ Message includes overdue warning!');
      } else {
        console.log('⚠️  Message does not mention overdue!');
      }
    } else {
      if (!response.data.isOverdue) {
        console.log('\n✅ isOverdue field is correctly absent/false!');
      } else {
        console.log('\n⚠️  isOverdue field should not be present!');
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
  console.log('OVERDUE INVOICE TEST - Verify Overdue Detection');
  console.log('============================================================');
  
  // Find overdue and not overdue invoices
  const { overdue, notOverdue } = await findOverdueInvoice(clientId);
  
  let testsPassed = 0;
  let testsTotal = 0;
  
  // Test overdue invoice
  if (overdue) {
    const invoiceId = overdue.invoiceid || overdue.id;
    console.log('\n--- TEST 1: Overdue Invoice ---');
    if (await testInvoiceLookup(clientId, invoiceId, true)) {
      testsPassed++;
    }
    testsTotal++;
  } else {
    console.log('\n⚠️  No overdue invoices found to test.');
  }
  
  // Test not overdue invoice
  if (notOverdue) {
    const invoiceId = notOverdue.invoiceid || notOverdue.id;
    console.log('\n--- TEST 2: Not Overdue Invoice ---');
    if (await testInvoiceLookup(clientId, invoiceId, false)) {
      testsPassed++;
    }
    testsTotal++;
  } else {
    console.log('\n⚠️  No future-dated invoices found to test.');
  }
  
  console.log('\n============================================================');
  console.log('TEST SUMMARY');
  console.log('============================================================');
  console.log(`Tests Run: ${testsTotal}`);
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Success Rate: ${testsTotal > 0 ? ((testsPassed / testsTotal) * 100).toFixed(1) : 0}%`);
  console.log('============================================================\n');
  
  if (testsTotal === 0) {
    console.log('💡 Try with a different client ID that has unpaid invoices.');
    console.log('Usage: node test-overdue-invoice.js <clientId>');
  } else if (testsPassed === testsTotal) {
    console.log('🎉 ALL TESTS PASSED!');
  }
}

main().catch(err => {
  console.error('Fatal Error:', err.message);
  process.exit(1);
});
