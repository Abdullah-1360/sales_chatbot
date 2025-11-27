/**
 * VTiger CRM Controller
 * Handles HTTP requests for lead creation
 */

const { createLeadFlow } = require('../services/vtiger');
const { createLogger } = require('../utils/logger');

const logger = createLogger('VTIGER_CONTROLLER');

/**
 * Create lead endpoint
 * POST /api/leads
 * Body: { username, email, phone, description }
 */
exports.createLead = async (req, res, next) => {
  try {
    const { username, email, phone, description } = req.body;
    
    logger.info('Lead creation request received', { 
      email,
      hasPhone: !!phone,
      hasDescription: !!description,
      ip: req.ip 
    });
    
    // Validate required fields
    if (!username || !email) {
      return res.status(400).json({ 
        success: false,
        error: 'username and email are required' 
      });
    }
    
    // Create lead in VTiger (status is always 'New')
    const response = await createLeadFlow({
      username,
      email,
      phone,
      description
    });
    
    // Return response
    res.json(response);
    
  } catch (error) {
    logger.error('Error in createLead controller', { 
      error: error.message,
      stack: error.stack 
    });
    next(error);
  }
};
