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
    
    // Create lead (status is always 'New')
    const response = await createLead(sessionName, userId, {
      firstname,
      lastname,
      email,
      phone,
      description
    });
    
    const duration = Date.now() - startTime;
    logger.info('Lead creation flow completed', { 
      duration: `${duration}ms`,
      success: response.success 
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
  createLead,
  createLeadFlow
};
