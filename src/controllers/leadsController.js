/**
 * Combined Leads Controller
 * Handles checking user existence in WHMCS and creating leads in VTiger
 */

const { getClientsDetails, callApi } = require('../services/whmcsService');
const { createLeadFlow } = require('../services/vtiger');
const { broadcastNewLead } = require('../services/websocket');
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
    
    // Step 1: Check if user exists in WHMCS (parallel email, phone, and domain check)
    let userExists = false;
    let foundBy = null;
    let clientResolutionDetails = null;
    
    const checkPromises = [];
    
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
    
    // Check by domain if provided
    if (domain) {
      const domainCheck = checkClientByDomain(domain);
      checkPromises.push(domainCheck);
    }
    
    // Wait for all checks to complete
    const checkResults = await Promise.all(checkPromises);
    
    // Determine if user exists from any check
    for (const result of checkResults) {
      if (result.exists) {
        userExists = true;
        foundBy = result.foundBy;
        clientResolutionDetails = result;
        
        // Handle special case for domain with multiple clients
        if (result.multipleClients) {
          console.log('→ Multiple clients found for domain:', result.clientIds);
          return res.status(400).json({
            success: false,
            error: 'Multiple clients found for this domain. Please provide email or phone for clarification.',
            domain: domain,
            clientIds: result.clientIds,
            foundBy: 'domain',
            method: result.method
          });
        }
        
        break;
      }
    }
    
    console.log('→ User exists in WHMCS:', userExists, foundBy ? `(found by ${foundBy})` : '');
    
    // Log resolution details for domain-based resolution
    if (foundBy === 'domain' && clientResolutionDetails) {
      console.log('→ Domain resolution details:', {
        clientId: clientResolutionDetails.clientId,
        method: clientResolutionDetails.method,
        count: clientResolutionDetails.domainCount || clientResolutionDetails.productCount
      });
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
      
      // Generate unique email based on User_Ns if email is empty
      if (!email || email.trim() === '') {
        if (User_Ns && User_Ns.trim() !== '') {
          // Create email from User_Ns: user_ns@uchat.generated
          email = `${User_Ns.toLowerCase().replace(/[^a-z0-9]/g, '_')}@uchat.generated`;
          logger.info('Generated email from User_Ns', { 
            User_Ns,
            generatedEmail: email 
          });
        } else {
          // No email and no User_Ns - generate random email
          const randomId = Date.now().toString(36) + Math.random().toString(36).substr(2);
          email = `guest_${randomId}@uchat.generated`;
          logger.info('Generated random email (no User_Ns provided)', { 
            generatedEmail: email 
          });
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