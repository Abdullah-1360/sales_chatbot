/**
 * Combined Leads Controller
 * Handles checking user existence in WHMCS and creating leads in VTiger
 */

const { getClientsDetails, callApi } = require('../services/whmcsService');
const { createLeadFlow } = require('../services/vtiger');
const { broadcastNewLead } = require('../services/websocket');
const { resolveClientFromWhmcs } = require('../utils/whmcsClientResolver');
const { createLogger } = require('../utils/logger');
const Lead = require('../models/Lead');

/**
 * Enhanced domain-based client resolution for leads
 * Checks if a client exists by domain name using WHMCS APIs
 */
async function checkClientByDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return { exists: false, foundBy: 'domain', error: 'Invalid domain' };
  }
  
  const cleanDomain = domain.trim().toLowerCase();
  console.log(`→ Checking domain: ${cleanDomain}`);
  
  try {
    // Try GetClientsDomains first (for domain registrations)
    const domainsData = await callApi('GetClientsDomains', { domain: cleanDomain });
    
    if (domainsData && domainsData.domains) {
      const domainsRaw = domainsData.domains;
      const domains = domainsRaw.domain || domainsRaw;
      const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
      
      if (domainArray.length > 0) {
        const uniqueUserIds = [...new Set(domainArray.map(d => String(d.userid || d.clientid)))];
        
        if (uniqueUserIds.length === 1) {
          console.log(`→ Domain found in registrations: Client ${uniqueUserIds[0]}`);
          return { 
            exists: true, 
            foundBy: 'domain', 
            clientId: uniqueUserIds[0],
            method: 'domain_registration',
            domainCount: domainArray.length
          };
        } else if (uniqueUserIds.length > 1) {
          console.log(`→ Domain found with multiple clients: ${uniqueUserIds.join(', ')}`);
          return { 
            exists: true, 
            foundBy: 'domain', 
            multipleClients: true,
            clientIds: uniqueUserIds,
            method: 'domain_registration'
          };
        }
      }
    }
    
    // Fallback: Try GetClientsProducts (for hosting services)
    const productsData = await callApi('GetClientsProducts', { domain: cleanDomain });
    
    if (productsData && productsData.products) {
      const productsRaw = productsData.products;
      const products = productsRaw.product || productsRaw;
      const productArray = Array.isArray(products) ? products : (products ? [products] : []);
      
      if (productArray.length > 0) {
        const uniqueUserIds = [...new Set(productArray.map(p => String(p.userid || p.clientid)))];
        
        if (uniqueUserIds.length === 1) {
          console.log(`→ Domain found in hosting services: Client ${uniqueUserIds[0]}`);
          return { 
            exists: true, 
            foundBy: 'domain', 
            clientId: uniqueUserIds[0],
            method: 'hosting_service',
            productCount: productArray.length
          };
        } else if (uniqueUserIds.length > 1) {
          console.log(`→ Domain found with multiple clients in hosting: ${uniqueUserIds.join(', ')}`);
          return { 
            exists: true, 
            foundBy: 'domain', 
            multipleClients: true,
            clientIds: uniqueUserIds,
            method: 'hosting_service'
          };
        }
      }
    }
    
    console.log(`→ Domain not found: ${cleanDomain}`);
    return { exists: false, foundBy: 'domain' };
    
  } catch (err) {
    console.log(`→ Domain check failed: ${err.message}`);
    return { exists: false, foundBy: 'domain', error: err.message };
  }
}

const logger = createLogger('LEADS_CONTROLLER');

/**
 * Get leads endpoint
 * GET /api/leads
 * Query params: limit (default: 50), offset (default: 0), sort (default: -createdAt)
 * Returns leads sorted by creation date (descending)
 */
exports.getLeads = async (req, res, next) => {
  try {
    // Parse query parameters with defaults
    const limit = req.query.limit !== undefined ? parseInt(req.query.limit) : 50;
    const offset = req.query.offset !== undefined ? parseInt(req.query.offset) : 0;
    const sort = req.query.sort || '-createdAt';
    
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
    
    logger.info('Fetching leads', { limit, offset, sort });
    
    // Parse sort parameter (e.g., '-createdAt' for descending, 'createdAt' for ascending)
    const sortObj = {};
    if (sort.startsWith('-')) {
      sortObj[sort.substring(1)] = -1;
    } else {
      sortObj[sort] = 1;
    }
    
    // Fetch leads with pagination and sorting
    const leads = await Lead.find()
      .sort(sortObj)
      .skip(offset)
      .limit(limit)
      .lean(); // Return plain JavaScript objects for better performance
    
    // Get total count for pagination metadata
    const total = await Lead.countDocuments();
    
    // Transform leads to match frontend expectations
    const transformedLeads = leads.map(lead => ({
      id: lead._id.toString(),
      vtigerId: lead.vtigerId || '',
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
      offset,
      sort 
    });
    
    res.json({
      success: true,
      leads: transformedLeads,
      total,
      limit,
      offset,
      sort
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
 * Combined leads endpoint with enhanced client resolution
 * POST /api/leads
 * 1. Checks if user exists in WHMCS by email/phone/domain (parallel)
 * 2. If user doesn't exist, creates lead in VTiger
 * Body: { username, email, phone, domain, description, comment, User_Ns }
 */
exports.handleLeads = async (req, res, next) => {
  console.log('[POST /api/leads]', { 
    hasEmail: !!req.body.email,
    hasPhone: !!req.body.phone,
    hasDomain: !!req.body.domain,
    hasUsername: !!req.body.username
  });
  
  try {
    let { username, email, phone, domain, description, comment, User_Ns } = req.body;
    
    // Use comment if description is not provided
    const messageText = description || comment;
    
    logger.info('Combined leads request received', { 
      email,
      hasPhone: !!phone,
      hasDomain: !!domain,
      hasUsername: !!username,
      hasDescription: !!description,
      hasComment: !!comment,
      hasUserNs: !!User_Ns,
      ip: req.ip 
    });
    
    // Validate required fields - need at least email, phone, or domain for WHMCS check
    if (!email && !phone && !domain) {
      console.log('✗ Missing required parameters for user check');
      return res.status(400).json({ 
        success: false, 
        error: 'email, phone, or domain required for user verification' 
      });
    }
    
    // Step 1: Check if user exists in WHMCS (PARALLEL email and domain check with smart prioritization)
    let userExists = false;
    let foundBy = null;
    let clientResolutionDetails = null;
    
    const checkPromises = [];
    
    // PARALLEL RESOLUTION: Check email AND domain simultaneously
    // Check by email if provided
    if (email) {
      const emailCheck = getClientsDetails({ email })
        .then(result => {
          if (result && result.userid) {
            console.log('→ User found by email:', result.userid);
            return { exists: true, foundBy: 'email', result, clientId: result.userid };
          }
          return { exists: false, foundBy: 'email' };
        })
        .catch(err => {
          console.log('→ Email check failed:', err.message);
          return { exists: false, foundBy: 'email', error: err.message };
        });
      checkPromises.push(emailCheck);
    }
    
    // Check by phone if provided
    if (phone) {
      const phoneCheck = getClientsDetails({ phonenumber: phone })
        .then(result => {
          if (result && result.userid) {
            console.log('→ User found by phone:', result.userid);
            return { exists: true, foundBy: 'phone', result, clientId: result.userid };
          }
          return { exists: false, foundBy: 'phone' };
        })
        .catch(err => {
          console.log('→ Phone check failed:', err.message);
          return { exists: false, foundBy: 'phone', error: err.message };
        });
      checkPromises.push(phoneCheck);
    }
    
    // Check by domain if provided (runs in parallel with email/phone)
    if (domain) {
      const domainCheck = checkClientByDomain(domain);
      checkPromises.push(domainCheck);
    }
    
    // Wait for all checks to complete
    const checkResults = await Promise.all(checkPromises);
    
    // SMART PRIORITIZATION: Process results with domain priority over email
    let emailResult = null;
    let phoneResult = null;
    let domainResult = null;
    
    for (const result of checkResults) {
      if (result.foundBy === 'email' && result.exists) {
        emailResult = result;
      } else if (result.foundBy === 'phone' && result.exists) {
        phoneResult = result;
      } else if (result.foundBy === 'domain' && result.exists) {
        domainResult = result;
      }
    }
    
    // Handle special case for domain with multiple clients
    if (domainResult && domainResult.multipleClients) {
      console.log('→ Multiple clients found for domain:', domainResult.clientIds);
      return res.status(400).json({
        success: false,
        error: 'Multiple clients found for this domain. Please provide email or phone for clarification.',
        domain: domain,
        clientIds: domainResult.clientIds,
        foundBy: 'domain',
        method: domainResult.method
      });
    }
    
    // Determine which resolution to use - prioritize domain over email
    if (domainResult && emailResult) {
      // Both resolved - check if they match
      if (domainResult.clientId === emailResult.clientId) {
        userExists = true;
        foundBy = 'domain+email';
        clientResolutionDetails = domainResult;
        console.log('→ Client resolved from both domain and email (matching):', domainResult.clientId);
      } else {
        // Edge case: Different clients found - prioritize domain over email
        console.log('→ Domain and email resolve to different clients - prioritizing domain');
        userExists = true;
        foundBy = 'domain_priority';
        clientResolutionDetails = domainResult;
        console.log('→ Client resolved from domain (email mismatch ignored):', domainResult.clientId);
      }
    } else if (domainResult) {
      // Only domain resolved - email was wrong or not provided
      userExists = true;
      foundBy = 'domain';
      clientResolutionDetails = domainResult;
      console.log('→ Client resolved from domain:', domainResult.clientId);
    } else if (emailResult) {
      // Only email resolved - domain was wrong or not provided
      userExists = true;
      foundBy = 'email';
      clientResolutionDetails = emailResult;
      console.log('→ Client resolved from email:', emailResult.clientId);
    } else if (phoneResult) {
      // Only phone resolved - domain and email were wrong or not provided
      userExists = true;
      foundBy = 'phone';
      clientResolutionDetails = phoneResult;
      console.log('→ Client resolved from phone:', phoneResult.clientId);
    }
    
    console.log('→ User exists in WHMCS:', userExists, foundBy ? `(found by ${foundBy})` : '');
    
    // Log resolution details for domain-based resolution
    if (foundBy && foundBy.includes('domain') && clientResolutionDetails) {
      console.log('→ Domain resolution details:', {
        clientId: clientResolutionDetails.clientId,
        method: clientResolutionDetails.method,
        count: clientResolutionDetails.domainCount || clientResolutionDetails.productCount
      });
    }

    // Step 1.5: If user exists but we only have clientId (domain/phone resolution), fetch full details
    if (userExists && clientResolutionDetails && clientResolutionDetails.clientId) {
      if (!email || email.includes('@uchat.generated') || !username || username === 'Customer') {
        logger.info('Enriching client data from WHMCS', { clientId: clientResolutionDetails.clientId });
        try {
          const fullDetails = await getClientsDetails({ clientid: clientResolutionDetails.clientId });
          if (fullDetails && fullDetails.email) {
            email = fullDetails.email;
            username = `${fullDetails.firstname || ''} ${fullDetails.lastname || ''}`.trim() || username;
            phone = fullDetails.phonenumber || phone;
            logger.info('Client data enriched from WHMCS', { email, username });
          }
        } catch (err) {
          logger.warn('Failed to enrich client data', { error: err.message });
        }
      }
    }
    
    // Step 2: If user doesn't exist in WHMCS, create lead in VTiger
    if (!userExists) {
      console.log('→ User not found in WHMCS, creating lead in VTiger');
      
      // Validate username for lead creation
      if (!username) {
        return res.status(400).json({ 
          success: false,
          error: 'username is required for lead creation' 
        });
      }
      
      // Email is required for DB/VTiger storage. Domain/phone handle WHMCS resolution separately.
      // Generate a placeholder only as last resort — domain is already used above for WHMCS lookup.
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
      
      try {
        // Create lead in VTiger
        const vtigerResponse = await createLeadFlow({
          username,
          email,
          phone,
          description: messageText,
          User_Ns
        });
        
        // Handle both new leads and updates
        if (vtigerResponse.success && vtigerResponse.result) {
          const leadData = {
            vtigerId: vtigerResponse.result.id || vtigerResponse.existingLeadId,
            firstname: vtigerResponse.result.firstname,
            lastname: vtigerResponse.result.lastname,
            email: vtigerResponse.result.email,
            phone: vtigerResponse.result.mobile || phone || '',
            description: vtigerResponse.result.description || messageText || '',
            comment: vtigerResponse.result.description || messageText || '',
            source: 'Chatbot',
            userNs: User_Ns || ''
          };
          
          try {
            let savedLead;
            
            if (vtigerResponse.isUpdate) {
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
                  firstname: leadData.firstname,
                  lastname: leadData.lastname,
                  email: leadData.email,
                  description: updatedDescription,
                  comment: updatedComment,
                  phone: leadData.phone,
                  userNs: leadData.userNs
                },
                { new: true, upsert: true }
              );
            } else {
              // New lead - create in database
              logger.info('Creating new lead in database', { 
                vtigerId: leadData.vtigerId,
                email: leadData.email 
              });
              
              savedLead = await Lead.create(leadData);
            }
            
            // Broadcast to frontend
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
              isUpdate: vtigerResponse.isUpdate || false
            };
            
            broadcastNewLead(broadcastData);
            
            logger.info('Lead saved and broadcasted', { 
              leadId: savedLead._id,
              vtigerId: savedLead.vtigerId,
              email: savedLead.email,
              isUpdate: vtigerResponse.isUpdate 
            });
          } catch (dbError) {
            logger.error('Failed to save/update lead in database', { 
              error: dbError.message,
              vtigerId: leadData.vtigerId 
            });
            // Continue even if database operation fails
          }
        }
        
        // Return combined response
        return res.json({
          success: true,
          userExists: false,
          leadCreated: true,
          message: 'User not found in WHMCS, lead created in VTiger',
          vtigerResponse
        });
        
      } catch (vtigerError) {
        logger.error('Failed to create lead in VTiger', { 
          error: vtigerError.message,
          email,
          phone 
        });
        
        return res.status(500).json({
          success: false,
          userExists: false,
          leadCreated: false,
          error: 'Failed to create lead in VTiger',
          details: vtigerError.message
        });
      }
    } else {
      // User exists in WHMCS - no need to create lead
      console.log('→ User exists in WHMCS, no lead creation needed');

      // Broadcast to dashboard so agents see the existing client interaction
      const { splitName } = require('../services/vtiger');
      const { firstname: fn, lastname: ln } = splitName(username || email || '');
      broadcastNewLead({
        id: `whmcs-${clientResolutionDetails?.clientId || foundBy}-${Date.now()}`,
        clientId: clientResolutionDetails?.clientId || null,
        firstname: fn,
        lastname: ln,
        email: email || '',
        phone: phone || '',
        description: 'Existing client — lead not created',
        comment: 'Existing client — lead not created',
        source: 'Chatbot',
        userNs: User_Ns || '',
        isExistingClient: true,
        foundBy,
        createdAt: new Date(),
      });
      
      const response = {
        success: true,
        userExists: true,
        leadCreated: false,
        foundBy,
        message: `User found in WHMCS by ${foundBy}, no lead creation needed`
      };
      
      // Add additional details for domain-based resolution
      if (foundBy === 'domain' && clientResolutionDetails) {
        response.clientId = clientResolutionDetails.clientId;
        response.resolutionMethod = clientResolutionDetails.method;
        response.domain = domain;
        
        if (clientResolutionDetails.domainCount) {
          response.domainCount = clientResolutionDetails.domainCount;
        }
        if (clientResolutionDetails.productCount) {
          response.productCount = clientResolutionDetails.productCount;
        }
      }
      
      return res.json(response);
    }
    
  } catch (err) {
    console.log('✗ Error in combined leads endpoint:', err.message);
    logger.error('Error in handleLeads controller', {
      error: err.message,
      stack: err.stack
    });
    next(err);
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
    
    // Validate MongoDB ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      logger.warn('Invalid lead ID format', { id });
      return res.status(400).json({
        success: false,
        error: 'Invalid lead ID format'
      });
    }
    
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
      email: deletedLead.email,
      vtigerId: deletedLead.vtigerId 
    });
    
    res.json({
      success: true,
      message: 'Lead deleted successfully',
      deletedLead: {
        id: deletedLead._id.toString(),
        email: deletedLead.email,
        vtigerId: deletedLead.vtigerId
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