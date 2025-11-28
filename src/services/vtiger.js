/**
 * VTiger CRM Integration Service
 * Handles lead creation in VTiger CRM
 */

const axios = require('axios');
const md5 = require('md5');
const cfg = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('VTIGER');

/**
 * Get challenge token from VTiger
 * @returns {Promise<string>} Challenge token
 */
async function getChallenge() {
  try {
    const url = `${cfg.VTIGER_URL}?operation=getchallenge&username=${cfg.VTIGER_USERNAME}`;
    const res = await axios.get(url);
    
    if (!res.data.success) {
      throw new Error('VTiger getchallenge failed');
    }
    
    logger.debug('Challenge token retrieved successfully');
    return res.data.result.token;
  } catch (error) {
    logger.error('Failed to get challenge token', { error: error.message });
    throw error;
  }
}

/**
 * Login to VTiger and get session
 * @param {string} token - Challenge token
 * @returns {Promise<Object>} Session info with sessionName and userId
 */
async function login(token) {
  try {
    const accessHash = md5(token + cfg.VTIGER_ACCESS_KEY);
    
    const res = await axios.post(
      cfg.VTIGER_URL,
      new URLSearchParams({
        operation: 'login',
        username: cfg.VTIGER_USERNAME,
        accessKey: accessHash
      })
    );
    
    if (!res.data.success) {
      throw new Error('VTiger login failed');
    }
    
    logger.debug('Login successful', { userId: res.data.result.userId });
    
    return {
      sessionName: res.data.result.sessionName,
      userId: res.data.result.userId
    };
  } catch (error) {
    logger.error('Login failed', { error: error.message });
    throw error;
  }
}

/**
 * Split full name into first and last name
 * @param {string} fullName - Full name to split
 * @returns {Object} Object with firstname and lastname
 */
function splitName(fullName) {
  if (!fullName) {
    return { firstname: '', lastname: '' };
  }
  
  const parts = fullName.trim().split(' ');
  
  if (parts.length === 1) {
    return { 
      firstname: parts[0], 
      lastname: 'Customer' 
    };
  }
  
  return {
    firstname: parts[0],
    lastname: parts.slice(1).join(' ')
  };
}


/**
 * Search for existing lead by email or phone
 * @param {string} sessionName - VTiger session name
 * @param {string} email - Email to search
 * @param {string} phone - Phone to search (optional)
 * @returns {Promise<Object|null>} Existing lead or null
 */
async function searchExistingLead(sessionName, email, phone) {
  try {
    // Build query to search by email or phone
    let query = `SELECT * FROM Leads WHERE email='${email}'`;
    
    if (phone) {
      query += ` OR mobile='${phone}'`;
    }
    
    query += ' LIMIT 1;';
    
    logger.debug('Searching for existing lead', { email, phone });
    
    const res = await axios.get(cfg.VTIGER_URL, {
      params: {
        operation: 'query',
        sessionName,
        query
      }
    });
    
    if (res.data.success && res.data.result && res.data.result.length > 0) {
      logger.info('Found existing lead', { 
        leadId: res.data.result[0].id,
        email: res.data.result[0].email 
      });
      return res.data.result[0];
    }
    
    logger.debug('No existing lead found');
    return null;
  } catch (error) {
    logger.error('Error searching for existing lead', { 
      error: error.message,
      email 
    });
    // Don't throw - just return null and create new lead
    return null;
  }
}

/**
 * Update existing lead with new description
 * @param {string} sessionName - VTiger session name
 * @param {Object} existingLead - Existing lead data
 * @param {string} newDescription - New description to append
 * @returns {Promise<Object>} Update result
 */
async function updateLeadDescription(sessionName, existingLead, newDescription) {
  try {
    const oldDescription = existingLead.description || '';
    const timestamp = new Date().toLocaleString();
    
    // Append new description with timestamp
    const updatedDescription = oldDescription 
      ? `${oldDescription}\n\n--- Update (${timestamp}) ---\n${newDescription}`
      : newDescription;
    
    // VTiger requires ALL mandatory fields when updating
    // Include all existing fields plus the updated description
    const element = {
      id: existingLead.id,
      firstname: existingLead.firstname,
      lastname: existingLead.lastname,
      email: existingLead.email,
      mobile: existingLead.mobile || '',
      company: existingLead.company || 'Individual',
      assigned_user_id: existingLead.assigned_user_id,
      leadsource: existingLead.leadsource || 'Chatbot',
      leadstatus: existingLead.leadstatus || 'Contacted',
      description: updatedDescription
    };
    
    logger.info('Updating existing lead', { 
      leadId: existingLead.id,
      email: existingLead.email 
    });
    
    const res = await axios.post(
      cfg.VTIGER_URL,
      new URLSearchParams({
        operation: 'update',
        sessionName,
        element: JSON.stringify(element)
      })
    );
    
    if (res.data.success) {
      logger.info('Lead updated successfully', { 
        leadId: existingLead.id,
        email: existingLead.email 
      });
    } else {
      logger.error('Lead update failed', { 
        error: res.data.error,
        leadId: existingLead.id 
      });
    }
    
    return res.data;
  } catch (error) {
    logger.error('Error updating lead', { 
      error: error.message,
      leadId: existingLead.id 
    });
    throw error;
  }
}

async function createLead(sessionName, userId, leadInfo) {
  try {
    const element = {
      firstname: leadInfo.firstname,
      lastname: leadInfo.lastname,
      email: leadInfo.email,
      mobile: leadInfo.phone || '',
      company: 'Individual',
      assigned_user_id: userId,
      leadsource: 'Chatbot',
      leadstatus: 'Contacted',
      description: leadInfo.description || ''
    };
    
    logger.info('Creating lead', { 
      email: leadInfo.email, 
      name: `${leadInfo.firstname} ${leadInfo.lastname}` 
    });
    
    const res = await axios.post(
      cfg.VTIGER_URL,
      new URLSearchParams({
        operation: 'create',
        sessionName,
        elementType: 'Leads',
        element: JSON.stringify(element)
      })
    );
    
    if (res.data.success) {
      logger.info('Lead created successfully', { 
        leadId: res.data.result.id,
        email: leadInfo.email 
      });
    } else {
      logger.error('Lead creation failed', { 
        error: res.data.error,
        email: leadInfo.email 
      });
    }
    
    return res.data;
  } catch (error) {
    logger.error('Error creating lead', { 
      error: error.message,
      email: leadInfo.email 
    });
    throw error;
  }
}

/**
 * Main function to create a lead (handles full flow)
 * Checks for existing lead by email/phone and updates if found
 * @param {Object} leadData - Lead data
 * @param {string} leadData.username - Full name
 * @param {string} leadData.email - Email address
 * @param {string} leadData.phone - Phone number (optional)
 * @param {string} leadData.description - Lead description (optional)
 * @returns {Promise<Object>} Result with success status and lead info
 */
async function createLeadFlow(leadData) {
  const startTime = Date.now();
  
  try {
    const { username, email, phone, description } = leadData;
    
    // Validate required fields
    if (!username || !email) {
      throw new Error('username and email are required');
    }
    
    // Split name
    const { firstname, lastname } = splitName(username);
    
    // Get challenge token
    const token = await getChallenge();
    
    // Login
    const { sessionName, userId } = await login(token);
    
    // Check if lead already exists
    const existingLead = await searchExistingLead(sessionName, email, phone);
    
    let response;
    
    if (existingLead && description) {
      // Lead exists - update description
      logger.info('Lead already exists, updating description', { 
        leadId: existingLead.id,
        email 
      });
      
      response = await updateLeadDescription(sessionName, existingLead, description);
      
      // Add flag to indicate this was an update
      response.isUpdate = true;
      response.existingLeadId = existingLead.id;
    } else {
      // Lead doesn't exist - create new one
      logger.info('Creating new lead', { email });
      
      response = await createLead(sessionName, userId, {
        firstname,
        lastname,
        email,
        phone,
        description
      });
      
      response.isUpdate = false;
    }
    
    const duration = Date.now() - startTime;
    logger.info('Lead creation flow completed', { 
      duration: `${duration}ms`,
      success: response.success,
      isUpdate: response.isUpdate 
    });
    
    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Lead creation flow failed', { 
      duration: `${duration}ms`,
      error: error.message 
    });
    throw error;
  }
}

module.exports = {
  getChallenge,
  login,
  splitName,
  searchExistingLead,
  updateLeadDescription,
  createLead,
  createLeadFlow
};
