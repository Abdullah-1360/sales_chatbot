/**
 * Fetch WHMCS ticket details to verify attachment
 */

require('dotenv').config();
const { callApi } = require('../services/whmcsService');

const TICKET_ID = '766605'; // From previous test

console.log('🔍 Fetching WHMCS Ticket Details\n');
console.log('='.repeat(80));

async function getTicketDetails() {
  try {
    console.log('\n📝 Fetching ticket #' + TICKET_ID);
    console.log('-'.repeat(80));
    
    const ticket = await callApi('GetTicket', { ticketid: TICKET_ID });
    
    console.log('\n✅ Ticket Details:');
    console.log('   Ticket ID:', ticket.tid || ticket.id);
    console.log('   Subject:', ticket.subject);
    console.log('   Status:', ticket.status);
    console.log('   Department:', ticket.deptname);
    console.log('   Client ID:', ticket.userid);
    
    // Check for attachments
    if (ticket.attachments) {
      console.log('\n📎 Attachments Found:');
      const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [ticket.attachments];
      attachments.forEach((att, index) => {
        console.log(`\n   Attachment ${index + 1}:`);
        console.log('      Filename:', att.filename || att.name);
        console.log('      Size:', att.size || 'unknown');
        console.log('      Download URL:', att.url || att.download || 'N/A');
      });
    } else {
      console.log('\n⚠️  No attachments field in API response');
      console.log('   This might mean:');
      console.log('   1. WHMCS API version doesn\'t return attachment details');
      console.log('   2. Attachments are stored but not returned in GetTicket');
      console.log('   3. Need to check WHMCS admin panel directly');
    }
    
    // Show full response for debugging
    console.log('\n📋 Full API Response:');
    console.log(JSON.stringify(ticket, null, 2));
    
    console.log('\n' + '='.repeat(80));
    console.log('\n💡 NEXT STEPS:');
    console.log('   1. Log into WHMCS admin panel');
    console.log('   2. Go to Support > Tickets');
    console.log('   3. Open ticket #' + TICKET_ID);
    console.log('   4. Check if attachment is visible and downloadable');
    console.log('   5. If attachment shows as text, check WHMCS logs');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response, null, 2));
    }
  }
}

getTicketDetails()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
