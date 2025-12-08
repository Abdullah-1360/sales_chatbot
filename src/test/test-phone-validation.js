/**
 * Test phone number validation middleware
 * Tests the validatePhoneNumber middleware on protected endpoints
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Test configuration - UPDATE THESE WITH REAL VALUES
const TEST_CLIENT_ID = process.env.TEST_CLIENT_ID || '1';
const TEST_EMAIL = process.env.TEST_EMAIL || 'customer@example.com';
const TEST_DOMAIN = process.env.TEST_DOMAIN || 'example.com';
const TEST_INVOICE_ID = process.env.TEST_INVOICE_ID || '1';

// Phone numbers for testing
const CORRECT_PHONE = '+1-234-567-8900'; // Should match WHMCS record (normalized)
const WRONG_PHONE = '+1-999-999-9999';   // Should NOT match WHMCS record

console.log('\n' + '='.repeat(80));
console.log('🧪 PHONE NUMBER VALIDATION MIDDLEWARE TESTS');
console.log('='.repeat(80));

/**
 * Test 1: invoiceLookup with correct phone number
 */
async function testInvoiceLookupWithCorrectPhone() {
  console.log('\n\n📋 TEST 1: /api/invoiceLookup with CORRECT phone number');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/api/invoiceLookup`, {
      clientId: TEST_CLIENT_ID,
      invoiceId: TEST_INVOICE_ID,
      phoneNumber: CORRECT_PHONE
    });
    
    console.log('✅ SUCCESS - Phone validated, request processed');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    if (error.response) {
      console.log('❌ FAILED');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ ERROR:', error.message);
    }
    return false;
  }
}

/**
 * Test 2: invoiceLookup with wrong phone number
 */
async function testInvoiceLookupWithWrongPhone() {
  console.log('\n\n📋 TEST 2: /api/invoiceLookup with WRONG phone number');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/api/invoiceLookup`, {
      clientId: TEST_CLIENT_ID,
      invoiceId: TEST_INVOICE_ID,
      phoneNumber: WRONG_PHONE
    });
    
    console.log('❌ UNEXPECTED - Should have been blocked');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return false;
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ SUCCESS - Phone validation blocked request as expected');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
      console.log('\n📱 Masked phone shown to user:', error.response.data.registeredPhone);
      return true;
    } else if (error.response) {
      console.log('❌ FAILED - Wrong error response');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ ERROR:', error.message);
    }
    return false;
  }
}

/**
 * Test 3: serviceStatus with correct phone number
 */
async function testServiceStatusWithCorrectPhone() {
  console.log('\n\n🔍 TEST 3: /api/serviceStatus with CORRECT phone number');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      clientId: TEST_CLIENT_ID,
      domain: TEST_DOMAIN,
      phoneNumber: CORRECT_PHONE
    });
    
    console.log('✅ SUCCESS - Phone validated, request processed');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    if (error.response) {
      console.log('❌ FAILED');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ ERROR:', error.message);
    }
    return false;
  }
}

/**
 * Test 4: serviceStatus with wrong phone number
 */
async function testServiceStatusWithWrongPhone() {
  console.log('\n\n🔍 TEST 4: /api/serviceStatus with WRONG phone number');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      clientId: TEST_CLIENT_ID,
      domain: TEST_DOMAIN,
      phoneNumber: WRONG_PHONE
    });
    
    console.log('❌ UNEXPECTED - Should have been blocked');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return false;
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ SUCCESS - Phone validation blocked request as expected');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
      console.log('\n📱 Masked phone shown to user:', error.response.data.registeredPhone);
      return true;
    } else if (error.response) {
      console.log('❌ FAILED - Wrong error response');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ ERROR:', error.message);
    }
    return false;
  }
}

/**
 * Test 5: confirmPayment with correct phone number
 */
async function testConfirmPaymentWithCorrectPhone() {
  console.log('\n\n💳 TEST 5: /api/confirmPayment with CORRECT phone number');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/api/confirmPayment`, {
      clientId: TEST_CLIENT_ID,
      invoiceId: TEST_INVOICE_ID,
      phoneNumber: CORRECT_PHONE,
      transactionId: 'TEST123',
      paymentMethod: 'Bank Transfer'
    });
    
    console.log('✅ SUCCESS - Phone validated, request processed');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    if (error.response) {
      console.log('❌ FAILED');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ ERROR:', error.message);
    }
    return false;
  }
}

/**
 * Test 6: confirmPayment with wrong phone number
 */
async function testConfirmPaymentWithWrongPhone() {
  console.log('\n\n💳 TEST 6: /api/confirmPayment with WRONG phone number');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/api/confirmPayment`, {
      clientId: TEST_CLIENT_ID,
      invoiceId: TEST_INVOICE_ID,
      phoneNumber: WRONG_PHONE,
      transactionId: 'TEST123',
      paymentMethod: 'Bank Transfer'
    });
    
    console.log('❌ UNEXPECTED - Should have been blocked');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return false;
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ SUCCESS - Phone validation blocked request as expected');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
      console.log('\n📱 Masked phone shown to user:', error.response.data.registeredPhone);
      return true;
    } else if (error.response) {
      console.log('❌ FAILED - Wrong error response');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ ERROR:', error.message);
    }
    return false;
  }
}

/**
 * Test 7: Request without phone number (should pass through)
 */
async function testWithoutPhoneNumber() {
  console.log('\n\n🔓 TEST 7: /api/serviceStatus WITHOUT phone number (optional validation)');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/api/serviceStatus`, {
      clientId: TEST_CLIENT_ID,
      domain: TEST_DOMAIN
      // No phoneNumber provided
    });
    
    console.log('✅ SUCCESS - Request processed without phone validation');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    if (error.response) {
      console.log('❌ FAILED');
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ ERROR:', error.message);
    }
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n📝 Test Configuration:');
  console.log('  Base URL:', BASE_URL);
  console.log('  Client ID:', TEST_CLIENT_ID);
  console.log('  Email:', TEST_EMAIL);
  console.log('  Domain:', TEST_DOMAIN);
  console.log('  Invoice ID:', TEST_INVOICE_ID);
  console.log('  Correct Phone:', CORRECT_PHONE);
  console.log('  Wrong Phone:', WRONG_PHONE);
  
  let passed = 0;
  let failed = 0;
  
  // Run tests
  if (await testInvoiceLookupWithCorrectPhone()) passed++; else failed++;
  if (await testInvoiceLookupWithWrongPhone()) passed++; else failed++;
  if (await testServiceStatusWithCorrectPhone()) passed++; else failed++;
  if (await testServiceStatusWithWrongPhone()) passed++; else failed++;
  if (await testConfirmPaymentWithCorrectPhone()) passed++; else failed++;
  if (await testConfirmPaymentWithWrongPhone()) passed++; else failed++;
  if (await testWithoutPhoneNumber()) passed++; else failed++;
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${passed + failed}`);
  console.log('='.repeat(80) + '\n');
}

// Run tests
runAllTests().catch(console.error);
