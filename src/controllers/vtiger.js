/**
 * VTiger CRM Controller
 * Handles HTTP requests for lead creation
 */

const { createLeadFlow } = require('../services/vtiger');
const { broadcastNewLead } = require('../services/websocket');
const { resolveClientFromWhmcs } = require('../utils/whmcsClientResolver');
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
    let { username, email, phone, description, comment, User_Ns, domain } = req.body;
    
    // Use comment if description is not provided
    const messageText = description || comment;
    
    logger.info('Lead creation request received', { 
      email,
      hasPhone: !!phone,
      hasDescription: !!description,
      hasComment: !!comment,
      hasUserNs: !!User_Ns,
      ip: req.ip 
    });
    
    // Validate required fields
    if (!username) {
      return res.status(400).json({ 
        success: false,
        error: 'username is required' 
      });
    }
    
    // STEP 1: Try to resolve client from WHMCS using email/domain
    // If client exists in WHMCS, they are an existing customer — no lead needed
    if (email || domain) {
      const resolvedClient = await resolveClientFromWhmcs(email, domain);
      if (resolvedClient) {
        logger.info('Client resolved from WHMCS — skipping lead creation', {
          clientId: resolvedClient.clientId,
          email: resolvedClient.email,
        });

        // Broadcast to dashboard so agents can see the existing client interaction
        const { splitName } = require('../services/vtiger');
        const { firstname, lastname } = splitName(username || resolvedClient.email || '');
        broadcastNewLead({
          id: `whmcs-${resolvedClient.clientId}-${Date.now()}`,
          clientId: resolvedClient.clientId,
          firstname: resolvedClient.firstname || firstname,
          lastname: resolvedClient.lastname || lastname,
          email: resolvedClient.email || email,
          phone: resolvedClient.phone || phone || '',
          description: 'Existing client — lead not created',
          comment: 'Existing client — lead not created',
          source: 'Chatbot',
          userNs: User_Ns || '',
          isExistingClient: true,
          createdAt: new Date(),
        });

        return res.json({
          success: true,
          userExists: true,
          leadCreated: false,
          clientId: resolvedClient.clientId,
          message: 'Client already exists in WHMCS, no lead created',
        });
      }
    }

    // STEP 2: Client not in WHMCS — generate fallback email for VTiger storage
    if (!email || email.trim() === '') {
      if (domain && domain.trim() !== '') {
        email = `client@${domain.trim().toLowerCase()}`;
        logger.info('Using domain-based email for storage', { domain, generatedEmail: email });
      } else if (User_Ns && User_Ns.trim() !== '') {
        email = `${User_Ns.toLowerCase().replace(/[^a-z0-9]/g, '_')}@uchat.generated`;
        logger.info('Generated email from User_Ns for storage', { User_Ns, generatedEmail: email });
      } else {
        const randomId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        email = `guest_${randomId}@uchat.generated`;
        logger.info('Generated random guest email (no email/domain/User_Ns)', { generatedEmail: email });
      }
    }
    
    // Create lead in VTiger (status is always 'New')
    const response = await createLeadFlow({
      username,
      email,
      phone,
      description: messageText, // Use messageText (description or comment)
      User_Ns // Pass User_Ns for email upgrade logic
    });
    
    // Handle both new leads and updates
    if (response.success && response.result) {
      const leadData = {
        vtigerId: response.result.id || response.existingLeadId,
        firstname: response.result.firstname,
        lastname: response.result.lastname,
        email: response.result.email,
        phone: response.result.mobile || phone || '',
        description: response.result.description || messageText || '',
        comment: response.result.description || messageText || '', // Use description from result or messageText
        source: 'Chatbot',
        userNs: User_Ns || '' // UChat User Namespace ID
      };
      
      try {
        let savedLead;
        
        if (response.isUpdate) {
          // Lead was updated - find and update in database
          logger.info('Updating existing lead in database', { 
            vtigerId: leadData.vtigerId,
            email: leadData.email 
          });
          
          // First, get the existing lead to append messages
          const existingLead = await Lead.findOne({ vtigerId: leadData.vtigerId });
          
          // Append new message to existing messages with timestamp separator
          const timestamp = new Date().toLocaleString();
          const separator = '\n\n---\n';
          const newMessageWithTimestamp = `[${timestamp}]\n${leadData.description}`;
          
          const updatedDescription = existingLead && existingLead.description 
            ? `${existingLead.description}${separator}${newMessageWithTimestamp}`
            : leadData.description;
            
          const updatedComment = existingLead && existingLead.comment
            ? `${existingLead.comment}${separator}${newMessageWithTimestamp}`
            : leadData.comment;
          
          savedLead = await Lead.findOneAndUpdate(
            { vtigerId: leadData.vtigerId },
            { 
              firstname: leadData.firstname, // Update firstname
              lastname: leadData.lastname, // Update lastname
              email: leadData.email, // Update email
              description: updatedDescription, // Append to description
              comment: updatedComment, // Append to comment
              phone: leadData.phone, // Update phone if changed
              userNs: leadData.userNs // Update userNs if provided
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
          comment: savedLead.comment,
          createdAt: savedLead.createdAt,
          source: savedLead.source,
          userNs: savedLead.userNs,
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
