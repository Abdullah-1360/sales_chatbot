#!/usr/bin/env node
/**
 * View Ticket Details from WHMCS
 */

const axios = require('axios');
require('dotenv').config();

const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_API_SECRET;

async function getTicket(ticketId) {
  const url = WHMCS_URL;
  const payload = new URLSearchParams({
    action: 'GetTicket',
    ticketnum: ticketId,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  try {
    const { data } = await axios.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    if (data.result === 'success') {
      console.log('=== TICKET DETAILS ===\n');
      console.log(`Ticket #: ${data.tid}`);
      console.log(`Subject: ${data.subject}`);
      console.log(`Status: ${data.status}`);
      console.log(`Priority: ${data.priority}`);
      console.log(`Department: ${data.deptname}`);
      console.log(`Client ID: ${data.userid}`);
      console.log(`Service ID: ${data.service || 'N/A'}`);
      console.log(`Date Opened: ${data.date}`);
      
      if (data.replies && data.replies.reply) {
        console.log('\n=== TICKET MESSAGE & REPLIES ===\n');
        const replies = Array.isArray(data.replies.reply) ? data.replies.reply : [data.replies.reply];
        replies.forEach((reply, i) => {
          console.log(`\n--- ${i === 0 ? 'ORIGINAL MESSAGE' : 'Reply ' + i} ---`);
          console.log(`From: ${reply.name}`);
          console.log(`Date: ${reply.date}`);
          console.log(`\n${reply.message}\n`);
        });
      }
    } else {
      console.log('Error:', data.message || 'Unknown error');
    }
  } catch (err) {
    console.error('Error fetching ticket:', err.message);
    if (err.response?.data) {
      console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

const ticketId = process.argv[2];
if (!ticketId) {
  console.log('Usage: node view-ticket.js <ticketId>');
  process.exit(1);
}

getTicket(ticketId);
