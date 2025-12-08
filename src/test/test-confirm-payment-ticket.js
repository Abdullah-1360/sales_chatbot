/**
 * Test to demonstrate ticket creation with invoice ID
 * Shows the ticket message format
 */

require('dotenv').config();

console.log('🎫 Confirm Payment - Ticket Creation Demo\n');
console.log('='.repeat(80));

// Simulate invoice data
const mockInvoice = {
  invoiceid: '131836',
  total: '7800.00',
  balance: '7800.00',
  duedate: '2025-12-15',
  status: 'Unpaid'
};

const userDetails = 'Bank transfer completed on 2025-12-06. Transaction ID: TXN123456789. Amount: $7800.00';

// Build ticket message (same as in controller)
let ticketMessage = `=== PAYMENT CONFIRMATION ===\n`;
ticketMessage += `Invoice ID: ${mockInvoice.invoiceid}\n`;
ticketMessage += `Invoice Total: ${mockInvoice.total}\n`;
ticketMessage += `Invoice Balance: ${mockInvoice.balance}\n`;
ticketMessage += `Due Date: ${mockInvoice.duedate}\n`;

// Only add payment details if provided
if (userDetails) {
  ticketMessage += `\n=== PAYMENT DETAILS ===\n`;
  ticketMessage += userDetails;
}

// Example without details
const ticketMessageMinimal = `=== PAYMENT CONFIRMATION ===\n`;
const minimalMsg = ticketMessageMinimal + 
  `Invoice ID: ${mockInvoice.invoiceid}\n` +
  `Invoice Total: ${mockInvoice.total}\n` +
  `Invoice Balance: ${mockInvoice.balance}\n` +
  `Due Date: ${mockInvoice.duedate}\n`;

console.log('Ticket Details:');
console.log('---------------');
console.log('Department: Billing');
console.log('Priority: Medium');
console.log(`Subject: Payment clarification for Invoice #${mockInvoice.invoiceid}`);
console.log(`Invoice ID (linked): ${mockInvoice.invoiceid}`);
console.log('');
console.log('Message (with details):');
console.log('-----------------------');
console.log(ticketMessage);
console.log('');
console.log('='.repeat(80));
console.log('\nMessage (without details):');
console.log('--------------------------');
console.log(minimalMsg);
console.log('');
console.log('='.repeat(80));
console.log('\n✅ WHMCS API Call:');
console.log('-------------------');
console.log('OpenTicket({');
console.log('  deptid: "3",');
console.log('  subject: "Payment clarification for Invoice #131836",');
console.log('  message: [formatted message above],');
console.log('  clientid: "29097",');
console.log('  priority: "Medium",');
console.log('  invoiceid: "131836"  ← Invoice ID linked to ticket');
console.log('})');
console.log('');
console.log('='.repeat(80));
console.log('\n📋 Benefits:');
console.log('------------');
console.log('1. Invoice ID is linked to ticket in WHMCS');
console.log('2. Billing team can click invoice link in ticket');
console.log('3. Ticket shows in invoice history');
console.log('4. Clean, structured message format');
console.log('5. Payment details only included when provided');
console.log('');
console.log('='.repeat(80));
console.log('\n💡 In WHMCS Admin:');
console.log('------------------');
console.log('• Ticket will show "Related Invoice: #131836"');
console.log('• Click invoice link to view/update invoice');
console.log('• Invoice page will show related ticket');
console.log('• Easy to verify payment and mark as paid');
console.log('');
console.log('='.repeat(80));
