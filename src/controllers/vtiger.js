/**
 * VTiger CRM Controller
 * Handles HTTP requests for lead creation
 */

const { createLeadFlow } = require('../services/vtiger');
const { broadcastNewLead } = require('../services/websocket');
const { createLogger } = require('../utils/logger');
const Lead = require('../models/Lead');

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
    
    // Handle both new leads and updates
    if (response.success && response.result) {
      const leadData = {
        vtigerId: response.result.id || response.existingLeadId,
        firstname: response.result.firstname,
        lastname: response.result.lastname,
        email: response.result.email,
        phone: response.result.mobile || phone || '',
        description: response.result.description || description || '',
        source: 'Chatbot'
      };
      
      try {
        let savedLead;
        
        if (response.isUpdate) {
          // Lead was updated - find and update in database
          logger.info('Updating existing lead in database', { 
            vtigerId: leadData.vtigerId,
            email: leadData.email 
          });
          
          savedLead = await Lead.findOneAndUpdate(
            { vtigerId: leadData.vtigerId },
            { 
              description: leadData.description,
              phone: leadData.phone // Update phone if changed
            },
            { new: true, upsert: true } // Return updated doc, create if not exists
          );
        } else {
          // New lead - create in database
          logger.info('Creating new lead in database', { 
            vtigerId: leadData.vtigerId,
            email: leadData.email 
          });
          
          savedLead = await Lead.create(leadData);
        }
        
        // Broadcast to frontend (both new and updated leads)
        const broadcastData = {
          id: savedLead._id.toString(),
          vtigerId: savedLead.vtigerId,
          firstname: savedLead.firstname,
          lastname: savedLead.lastname,
          email: savedLead.email,
          phone: savedLead.phone,
          description: savedLead.description,
          createdAt: savedLead.createdAt,
          source: savedLead.source,
          isUpdate: response.isUpdate || false
        };
        
        broadcastNewLead(broadcastData);
        
        logger.info('Lead saved and broadcasted', { 
          leadId: savedLead._id,
          vtigerId: savedLead.vtigerId,
          email: savedLead.email,
          isUpdate: response.isUpdate 
        });
      } catch (dbError) {
        logger.error('Failed to save/update lead in database', { 
          error: dbError.message,
          vtigerId: leadData.vtigerId 
        });
        // Continue even if database operation fails
      }
    }
    
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
