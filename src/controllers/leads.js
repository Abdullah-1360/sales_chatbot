/**
 * Leads Controller
 * Handles HTTP requests for lead retrieval and deletion
 */

const Lead = require('../models/Lead');
const { createLogger } = require('../utils/logger');

const logger = createLogger('LEADS_CONTROLLER');

/**
 * Get leads endpoint
 * GET /api/leads
 * Query params: limit (default: 50), offset (default: 0)
 * Returns leads sorted by creation date (descending)
 */
exports.getLeads = async (req, res, next) => {
  try {
    // Parse query parameters with defaults
    const limit = req.query.limit !== undefined ? parseInt(req.query.limit) : 50;
    const offset = req.query.offset !== undefined ? parseInt(req.query.offset) : 0;
    
    // Validate pagination parameters
    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'limit must be between 1 and 100'
      });
    }
    
    if (offset < 0) {
      return res.status(400).json({
        success: false,
        error: 'offset must be non-negative'
      });
    }
    
    logger.info('Fetching leads', { limit, offset });
    
    // Fetch leads with pagination and sorting
    const leads = await Lead.find()
      .sort({ createdAt: -1 }) // Sort by creation date descending
      .skip(offset)
      .limit(limit)
      .lean(); // Return plain JavaScript objects for better performance
    
    // Get total count for pagination metadata
    const total = await Lead.countDocuments();
    
    // Transform leads to match frontend expectations
    const transformedLeads = leads.map(lead => ({
      id: lead._id.toString(),
      vtigerId: lead.vtigerId,
      firstname: lead.firstname,
      lastname: lead.lastname,
      email: lead.email,
      phone: lead.phone || '',
      description: lead.description || '',
      comment: lead.comment || '',
      createdAt: lead.createdAt,
      source: lead.source || 'Chatbot',
      userNs: lead.userNs || ''
    }));
    
    logger.info('Leads fetched successfully', { 
      count: transformedLeads.length,
      total,
      limit,
      offset 
    });
    
    res.json({
      success: true,
      leads: transformedLeads,
      total,
      limit,
      offset
    });
    
  } catch (error) {
    logger.error('Error in getLeads controller', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};


/**
 * Delete lead endpoint
 * DELETE /api/leads/:id
 * Deletes a lead by ID
 */
exports.deleteLead = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    logger.info('Deleting lead', { id });
    
    // Find and delete the lead
    const deletedLead = await Lead.findByIdAndDelete(id);
    
    if (!deletedLead) {
      logger.warn('Lead not found', { id });
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }
    
    logger.info('Lead deleted successfully', { 
      id,
      email: deletedLead.email 
    });
    
    res.json({
      success: true,
      message: 'Lead deleted successfully',
      deletedLead: {
        id: deletedLead._id.toString(),
        email: deletedLead.email
      }
    });
    
  } catch (error) {
    logger.error('Error in deleteLead controller', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};
