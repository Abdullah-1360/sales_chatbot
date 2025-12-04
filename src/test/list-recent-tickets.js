#!/usr/bin/env node
/**
 * List Recent Tickets from WHMCS
 */

const axios = require('axios');
require('dotenv').config();

const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_API_SECRET;

async function getTickets(clientId) {
  const url = WHMCS_URL;
  const payload = new URLSearchParams({
    action: 'GetTickets',
    clientid: clientId,
    limitnum: 5,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  try {
    const { data } = await axios.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    if (data.result === 'success' && data.tickets) {
      console.log('=== RECENT TICKETS ===\n');
      const tickets = data.tickets.ticket || [];
      const ticketArray = Array.isArray(tickets) ? tickets : [tickets];
      
      ticketArray.forEach((ticket, i) => {
        console.log(`${i + 1}. Ticket #${ticket.tid}`);
        console.log(`   Subject: ${ticket.subject}`);
        console.log(`   Status: ${ticket.status}`);
        console.log(`   Priority: ${ticket.priority}`);
        console.log(`   Department: ${ticket.deptname}`);
        console.log(`   Date: ${ticket.date}`);
        console.log(`   Last Reply: ${ticket.lastreply}`);
        console.log('');
      });
      
      // Get details of the most recent ticket
      if (ticketArray.length > 0) {
        const recentTicket = ticketArray[0];
        console.log('\n=== MOST RECENT TICKET DETAILS ===\n');
        await getTicketDetails(recentTicket.id);
      }
    } else {
      console.log('No tickets found or error:', data.message);
    }
  } catch (err) {
    console.error('Error fetching tickets:', err.message);
  }
}

async function getTicketDetails(ticketId) {
  const url = WHMCS_URL;
  const payload = new URLSearchParams({
    action: 'GetTicket',
    ticketid: ticketId,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  try {
    const { data } = await axios.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    if (data.result === 'success') {
      console.log(`Ticket #${data.tid}: ${data.subject}`);
      console.log(`Status: ${data.status} | Priority: ${data.priority}`);
      console.log(`Service ID: ${data.service || 'N/A'}`);
      console.log('\n--- FULL RESPONSE ---');
      console.log(JSON.stringify(data, null, 2));
      console.log('--- END ---\n');
    }
  } catch (err) {
    console.error('Error fetching ticket details:', err.message);
  }
}

const clientId = process.argv[2] || '31';
getTickets(clientId);
