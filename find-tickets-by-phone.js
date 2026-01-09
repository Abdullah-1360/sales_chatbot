/**
 * Find tickets associated with a specific phone number
 */

// Load environment variables
require('dotenv').config();

const { callApi } = require('./src/services/whmcsService');

async function findTicketsByPhone(phoneNumber) {
  console.log(`🔍 Finding tickets for phone number: ${phoneNumber.substring(0, 4)}***${phoneNumber.slice(-3)}\n`);
  
  try {
    // First, find the client by phone number
    console.log('Step 1: Finding client by phone number...');
    
    // Try different phone number formats
    const phoneVariations = [
      phoneNumber,
      phoneNumber.replace(/^92/, '0'), // Convert 92 to 0
      phoneNumber.replace(/^923/, '03'), // Convert 923 to 03
      phoneNumber.replace(/^0/, '92'), // Convert 0 to 92
      phoneNumber.replace(/^03/, '923') // Convert 03 to 923
    ];
    
    let clientFound = null;
    
    for (const phoneVar of phoneVariations) {
      try {
        console.log(`→ Trying phone format: ${phoneVar.substring(0, 4)}***${phoneVar.slice(-3)}`);
        const clientResult = await callApi('GetClientsDetails', { phonenumber: phoneVar });
        if (clientResult && clientResult.userid) {
          clientFound = clientResult;
          console.log(`✅ Client found with phone ${phoneVar}: ${clientResult.firstname} ${clientResult.lastname} (ID: ${clientResult.userid})`);
          break;
        }
      } catch (error) {
        console.log(`   → No client found with ${phoneVar}`);
      }
    }
    
    if (!clientFound) {
      console.log('❌ No client found with any phone number variation');
      return;
    }
    
    // Step 2: Get tickets for this client
    console.log(`\nStep 2: Getting tickets for client ${clientFound.userid}...`);
    
    try {
      const ticketsResult = await callApi('GetTickets', { 
        clientid: clientFound.userid,
        limitnum: 50
      });
      
      if (ticketsResult.tickets && ticketsResult.tickets.ticket) {
        const tickets = Array.isArray(ticketsResult.tickets.ticket) 
          ? ticketsResult.tickets.ticket 
          : [ticketsResult.tickets.ticket];
        
        console.log(`✅ Found ${tickets.length} tickets for this client:\n`);
        
        tickets.forEach((ticket, index) => {
          console.log(`${index + 1}. Ticket #${ticket.id || ticket.tid}`);
          console.log(`   → Subject: ${ticket.subject}`);
          console.log(`   → Status: ${ticket.status}`);
          console.log(`   → Department: ${ticket.deptname || 'Unknown'}`);
          console.log(`   → Date: ${ticket.date}`);
          console.log(`   💡 Test command: node test-ticket-lookup.js "${phoneNumber}" ${ticket.id || ticket.tid}`);
          console.log('');
        });
        
      } else {
        console.log('❌ No tickets found for this client');
      }
      
    } catch (ticketError) {
      console.log(`❌ Error getting tickets: ${ticketError.message}`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Get phone number from command line or use default
const phoneNumber = process.argv[2] || '923335113646';
findTicketsByPhone(phoneNumber).catch(console.error);