/**
 * Debug script to test WHMCS ticket API calls
 */

// Load environment variables
require('dotenv').config();

const { callApi } = require('./src/services/whmcsService');

async function testWHMCSTicketAPI() {
  console.log('🔍 Testing WHMCS Ticket API...\n');
  
  try {
    // Test 1: Try to get ticket with ticketid parameter
    console.log('Test 1: GetTicket with ticketid=651360');
    try {
      const result1 = await callApi('GetTicket', { ticketid: '651360' });
      console.log('✅ Success with ticketid:', JSON.stringify(result1, null, 2));
    } catch (error1) {
      console.log('❌ Failed with ticketid:', error1.message);
      
      // Test 2: Try with tid parameter
      console.log('\nTest 2: GetTicket with tid=651360');
      try {
        const result2 = await callApi('GetTicket', { tid: '651360' });
        console.log('✅ Success with tid:', JSON.stringify(result2, null, 2));
      } catch (error2) {
        console.log('❌ Failed with tid:', error2.message);
        
        // Test 3: Try to get any tickets to see if API is working
        console.log('\nTest 3: GetTickets to see if API is working');
        try {
          const result3 = await callApi('GetTickets', { limitnum: 5 });
          console.log('✅ GetTickets API is working. Sample tickets:');
          if (result3.tickets && result3.tickets.ticket) {
            const tickets = Array.isArray(result3.tickets.ticket) ? result3.tickets.ticket : [result3.tickets.ticket];
            tickets.forEach(ticket => {
              console.log(`  → Ticket ID: ${ticket.id || ticket.tid}, Subject: ${ticket.subject}, Status: ${ticket.status}`);
            });
            
            // Test getting details for multiple tickets to find one with a valid client
            console.log(`\nTest 4: Getting details for multiple tickets to find valid client data`);
            for (const ticket of tickets.slice(0, 3)) {
              try {
                console.log(`\n→ Checking ticket ${ticket.id || ticket.tid}...`);
                const ticketDetails = await callApi('GetTicket', { ticketid: ticket.id || ticket.tid });
                console.log(`  → Client ID: ${ticketDetails.userid}`);
                console.log(`  → Subject: ${ticketDetails.subject}`);
                console.log(`  → Status: ${ticketDetails.status}`);
                
                // Get client details if userid is valid
                if (ticketDetails.userid && ticketDetails.userid !== '0' && ticketDetails.userid !== 0) {
                  console.log(`  → Getting client details for user ${ticketDetails.userid}...`);
                  try {
                    const clientDetails = await callApi('GetClientsDetails', { clientid: ticketDetails.userid });
                    console.log('  ✅ Client details retrieved:');
                    console.log(`    → Name: ${clientDetails.firstname} ${clientDetails.lastname}`);
                    console.log(`    → Email: ${clientDetails.email}`);
                    console.log(`    → Phone: ${clientDetails.phonenumber}`);
                    console.log(`\n💡 To test the endpoint successfully, use:`);
                    console.log(`   node test-ticket-lookup.js "${clientDetails.phonenumber}" ${ticket.id || ticket.tid}`);
                    break; // Found a valid ticket with client data
                  } catch (clientError) {
                    console.log(`  ❌ Failed to get client details: ${clientError.message}`);
                  }
                } else {
                  console.log(`  → Skipping ticket with invalid client ID: ${ticketDetails.userid}`);
                }
              } catch (detailError) {
                console.log(`  ❌ Failed to get ticket details: ${detailError.message}`);
              }
            }
          } else {
            console.log('  → No tickets found or unexpected response format');
            console.log('  → Response:', JSON.stringify(result3, null, 2));
          }
        } catch (error3) {
          console.log('❌ GetTickets also failed:', error3.message);
          console.log('This suggests a general WHMCS API connectivity issue');
        }
      }
    }
    
  } catch (error) {
    console.log('❌ General error:', error.message);
  }
}

testWHMCSTicketAPI().catch(console.error);