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
 * Add a comment to a lead using VTiger Comments API
 * @param {string} sessionName - VTiger session name
 * @param {string} userId - User ID
 * @param {string} leadId - Lead ID (e.g., "10x24778")
 * @param {string} commentText - Comment text to add
 * @returns {Promise<Object>} Comment creation result
 */
async function addComment(sessionName, userId, leadId, commentText) {
  try {
    const element = {
      commentcontent: commentText,
      related_to: leadId,
      assigned_user_id: userId
    };
    
    logger.info('Adding comment to lead', { 
      leadId,
      commentLength: commentText.length 
    });
    
    const res = await axios.post(
      cfg.VTIGER_URL,
      new URLSearchParams({
        operation: 'create',
        sessionName,
        elementType: 'ModComments',
        element: JSON.stringify(element)
      })
    );
    
    if (res.data.success) {
      logger.info('Comment added successfully', { 
        leadId,
        commentId: res.data.result.id 
      });
    } else {
      logger.error('Comment creation failed', { 
        error: res.data.error,
        leadId 
      });
    }
    
    return res.data;
  } catch (error) {
    logger.error('Error adding comment', { 
      error: error.message,
      leadId 
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
      
      // Add initial comment if provided
      if (leadInfo.comment) {
        await addComment(sessionName, userId, res.data.result.id, leadInfo.comment);
      }
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
 * Update existing lead with new email
 * @param {string} sessionName - VTiger session name
 * @param {string} userId - User ID
 * @param {Object} existingLead - Existing lead data
 * @param {string} newEmail - New email to update
 * @param {string} newComment - New comment to add (optional)
 * @returns {Promise<Object>} Update result
 */
async function updateLeadEmail(sessionName, userId, existingLead, newEmail, newComment) {
  try {
    // VTiger requires ALL mandatory fields when updating
    const element = {
      id: existingLead.id,
      firstname: existingLead.firstname,
      lastname: existingLead.lastname,
      email: newEmail, // Update with new email
      mobile: existingLead.mobile || '',
      company: existingLead.company || 'Individual',
      assigned_user_id: existingLead.assigned_user_id,
      leadsource: existingLead.leadsource || 'Chatbot',
      leadstatus: existingLead.leadstatus || 'Contacted',
      description: existingLead.description || ''
    };
    
    logger.info('Updating lead email', { 
      leadId: existingLead.id,
      oldEmail: existingLead.email,
      newEmail,
      hasNewComment: !!newComment
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
      logger.info('Lead email updated successfully', { 
        leadId: existingLead.id,
        newEmail 
      });
      
      // Add comment if provided
      if (newComment) {
        await addComment(sessionName, userId, existingLead.id, newComment);
      }
    } else {
      logger.error('Lead email update failed', { 
        error: res.data.error,
        leadId: existingLead.id 
      });
    }
    
    return res.data;
  } catch (error) {
    logger.error('Error updating lead email', { 
      error: error.message,
      leadId: existingLead.id 
    });
    throw error;
  }
}

/**
 * Main function to create a lead (handles full flow)
 * Checks for existing lead by email/phone and updates if found
 * Handles email upgrade from generated to real email
 * @param {Object} leadData - Lead data
 * @param {string} leadData.username - Full name
 * @param {string} leadData.email - Email address
 * @param {string} leadData.phone - Phone number (optional)
 * @param {string} leadData.description - Lead description (optional)
 * @param {string} leadData.User_Ns - UChat User Namespace ID (optional)
 * @returns {Promise<Object>} Result with success status and lead info
 */
async function createLeadFlow(leadData) {
  const startTime = Date.now();
  
  try {
    const { username, email, phone, description, User_Ns } = leadData;
    
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
    
    // Check if this is a real email or generated email
    const isGeneratedEmail = email.endsWith('@uchat.generated');
    const isRealEmail = !isGeneratedEmail;
    
    let existingLead = null;
    let response;
    
    // If real email provided and User_Ns exists, check BOTH emails
    if (isRealEmail && User_Ns) {
      // Generate what the old email would have been
      const generatedEmail = `${User_Ns.toLowerCase().replace(/[^a-z0-9]/g, '_')}@uchat.generated`;
      
      logger.info('Checking for lead with both generated and real email', { 
        generatedEmail,
        realEmail: email 
      });
      
      // First, check for lead with generated email
      existingLead = await searchExistingLead(sessionName, generatedEmail, phone);
      
      if (existingLead) {
        // Found lead with generated email - upgrade to real email
        logger.info('Found lead with generated email, upgrading to real email', { 
          leadId: existingLead.id,
          oldEmail: generatedEmail,
          newEmail: email 
        });
        
        response = await updateLeadEmail(sessionName, userId, existingLead, email, description);
        
        response.isUpdate = true;
        response.isEmailUpgrade = true;
        response.existingLeadId = existingLead.id;
        response.oldEmail = generatedEmail;
        
        const duration = Date.now() - startTime;
        logger.info('Lead email upgraded successfully', { 
          duration: `${duration}ms`,
          leadId: existingLead.id,
          oldEmail: generatedEmail,
          newEmail: email 
        });
        
        return response;
      }
      
      // If not found with generated email, check with real email
      logger.info('No lead found with generated email, checking real email', { 
        realEmail: email 
      });
    }
    
    // Check if lead already exists with current email (real or generated)
    existingLead = await searchExistingLead(sessionName, email, phone);
    
    if (existingLead && description) {
      // Lead exists - add comment instead of updating
      logger.info('Lead already exists, adding comment', { 
        leadId: existingLead.id,
        email 
      });
      
      response = await addComment(sessionName, userId, existingLead.id, description);
      
      // Add flag to indicate this was an update and include the lead data
      response.isUpdate = true;
      response.isEmailUpgrade = false;
      response.existingLeadId = existingLead.id;
      // Include the existing lead data with the new description/comment
      response.result = {
        id: existingLead.id,
        firstname: existingLead.firstname,
        lastname: existingLead.lastname,
        email: existingLead.email,
        mobile: existingLead.mobile,
        description: description, // New comment/description
        company: existingLead.company,
        assigned_user_id: existingLead.assigned_user_id,
        leadsource: existingLead.leadsource,
        leadstatus: existingLead.leadstatus
      };
    } else if (existingLead) {
      // Lead exists but no description - just return success
      logger.info('Lead already exists, no new comment to add', { 
        leadId: existingLead.id,
        email 
      });
      
      response = {
        success: true,
        result: existingLead,
        isUpdate: true,
        isEmailUpgrade: false,
        existingLeadId: existingLead.id
      };
    } else {
      // Lead doesn't exist - create new one
      logger.info('Creating new lead', { email });
      
      response = await createLead(sessionName, userId, {
        firstname,
        lastname,
        email,
        phone,
        description,
        comment: description // Use description as comment
      });
      
      response.isUpdate = false;
      response.isEmailUpgrade = false;
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
  addComment,
  updateLeadEmail,
  createLead,
  createLeadFlow
};
