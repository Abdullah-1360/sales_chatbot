#!/usr/bin/env node
/**
 * Get Support Departments from WHMCS
 */

const axios = require('axios');
require('dotenv').config();

const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_API_SECRET;

async function getSupportDepartments() {
  const url = WHMCS_URL;
  const payload = new URLSearchParams({
    action: 'GetSupportDepartments',
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET
  });

  try {
    const { data } = await axios.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    console.log('=== WHMCS Support Departments ===\n');
    
    if (data.result === 'success' && data.departments) {
      const depts = data.departments.department || data.departments;
      const deptArray = Array.isArray(depts) ? depts : [depts];
      
      console.log('Available Departments:\n');
      deptArray.forEach(dept => {
        console.log(`ID: ${dept.id}`);
        console.log(`Name: ${dept.name}`);
        console.log(`Description: ${dept.description || 'N/A'}`);
        console.log('---');
      });
      
      console.log('\n=== Suggested .env Configuration ===\n');
      
      // Find technical support department
      const techDept = deptArray.find(d => 
        d.name.toLowerCase().includes('technical') || 
        d.name.toLowerCase().includes('support')
      ) || deptArray[0];
      
      // Find billing department
      const billingDept = deptArray.find(d => 
        d.name.toLowerCase().includes('billing') || 
        d.name.toLowerCase().includes('sales')
      ) || deptArray[0];
      
      console.log(`TECHSUPPORT_DEPTID=${techDept.id}`);
      console.log(`TECHSUPPORT_DEPTNAME=${techDept.name}`);
      console.log(`BILLING_DEPTID=${billingDept.id}`);
      console.log(`BILLING_DEPTNAME=${billingDept.name}`);
      
    } else {
      console.log('Error:', data.message || 'Unknown error');
      console.log('Full response:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Error fetching departments:', err.message);
    if (err.response?.data) {
      console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

getSupportDepartments();
