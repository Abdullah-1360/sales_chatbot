/**
 * Simple test to demonstrate phone number normalization and masking
 */

const { normalizePhone, maskPhone, phonesMatch } = require('../utils/phoneNormalizer');

console.log('\n' + '='.repeat(80));
console.log('📱 PHONE NUMBER NORMALIZATION & MASKING DEMO');
console.log('='.repeat(80));

// Test phone numbers in various formats
const testPhones = [
  '+1-234-567-8900',
  '(123) 456-7890',
  '123.456.7890',
  '1234567890',
  '+92 300 1234567',
  '0300-1234567',
  '+1 (555) 123-4567'
];

console.log('\n📋 NORMALIZATION TEST');
console.log('-'.repeat(80));
testPhones.forEach(phone => {
  const normalized = normalizePhone(phone);
  console.log(`Original:   ${phone.padEnd(20)} → Normalized: ${normalized}`);
});

console.log('\n\n🔒 MASKING TEST');
console.log('-'.repeat(80));
testPhones.forEach(phone => {
  const masked = maskPhone(phone);
  console.log(`Original:   ${phone.padEnd(20)} → Masked: ${masked}`);
});

console.log('\n\n✅ PHONE MATCHING TEST');
console.log('-'.repeat(80));

const matchTests = [
  { phone1: '+1-234-567-8900', phone2: '+1 234 567 8900', shouldMatch: true },
  { phone1: '(123) 456-7890', phone2: '123.456.7890', shouldMatch: true },
  { phone1: '+1-234-567-8900', phone2: '+1-999-999-9999', shouldMatch: false },
  { phone1: '0300-1234567', phone2: '03001234567', shouldMatch: true },
  { phone1: '1234567890', phone2: '(123) 456-7890', shouldMatch: true },
  { phone1: '+923100555647', phone2: '3100555647', shouldMatch: true, note: 'Country code +92 vs without' },
  { phone1: '+1234567890', phone2: '234567890', shouldMatch: true, note: 'Country code +1 vs without' },
];

matchTests.forEach(({ phone1, phone2, shouldMatch, note }) => {
  const matches = phonesMatch(phone1, phone2);
  const result = matches === shouldMatch ? '✅' : '❌';
  console.log(`${result} "${phone1}" vs "${phone2}"`);
  if (note) console.log(`   Note: ${note}`);
  console.log(`   Expected: ${shouldMatch ? 'MATCH' : 'NO MATCH'}, Got: ${matches ? 'MATCH' : 'NO MATCH'}`);
  console.log();
});

console.log('\n' + '='.repeat(80));
console.log('🎯 SECURITY MASKING EXAMPLES');
console.log('='.repeat(80));

const securityExamples = [
  { original: '1234567890', masked: maskPhone('1234567890') },
  { original: '+92 300 1234567', masked: maskPhone('+92 300 1234567') },
  { original: '+1 (555) 123-4567', masked: maskPhone('+1 (555) 123-4567') },
];

console.log('\nWhen phone validation fails, users see:');
securityExamples.forEach(({ original, masked }) => {
  console.log(`\n  Original (in WHMCS): ${original}`);
  console.log(`  Shown to user:       ${masked}`);
  console.log(`  Message: "Please contact us using the registered number: ${masked}"`);
});

console.log('\n' + '='.repeat(80));
console.log('✨ All tests completed!');
console.log('='.repeat(80) + '\n');
