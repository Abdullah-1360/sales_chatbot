const {
  getClientByContact,
  getClientProductsByDomain,
  checkServiceStatus,
  createSupportTicket,
  resetCpanelPassword,
  sendEmailNotification
} = require('../services/passwordResetService');

/**
 * Handle password reset request with parallel client resolution
 */
async function handlePasswordReset(req, res) {
  try {
    const { contact, email, phone, domain } = req.body;

    // Support both old format (contact) and new format (email/phone/domain)
    const emailToUse = email || (contact && contact.includes('@') ? contact : null);
    const phoneToUse = phone || (contact && !contact.includes('@') ? contact : null);

    // Validate input
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'domain is required'
      });
    }

    if (!emailToUse && !phoneToUse) {
      return res.status(400).json({
        success: false,
        error: 'email or phone is required for client identification'
      });
    }

    console.log(`🔐 Password reset request for domain: ${domain}`, {
      hasEmail: !!emailToUse,
      hasPhone: !!phoneToUse
    });

    // Step 1: PARALLEL client resolution by email AND domain
    console.log('📞 Step 1: Resolving client (parallel email/domain lookup)...');
    
    let resolvedClient = null;
    let resolvedFrom = null;
    
    const resolutionPromises = [];
    
    // Task 1: Email resolution (if provided)
    if (emailToUse) {
      resolutionPromises.push(
        resolveClientByEmail(emailToUse)
          .then(result => ({ type: 'email', success: true, data: result }))
          .catch(error => ({ type: 'email', success: false, error: error.message }))
      );
    }
    
    // Task 2: Domain resolution (always try)
    resolutionPromises.push(
      resolveClientByDomain(domain)
        .then(result => ({ type: 'domain', success: true, data: result }))
        .catch(error => ({ type: 'domain', success: false, error: error.message }))
    );
    
    // Execute parallel resolution
    const resolutionResults = await Promise.allSettled(resolutionPromises);
    
    // Process results - prioritize successful resolutions
    let emailResult = null;
    let domainResult = null;
    
    for (const result of resolutionResults) {
      if (result.status === 'fulfilled' && result.value.success && result.value.data) {
        if (result.value.type === 'email') {
          emailResult = result.value;
        } else if (result.value.type === 'domain') {
          domainResult = result.value;
        }
      }
    }
    
    // Handle special case for domain with multiple clients
    if (domainResult && domainResult.data.multipleClients) {
      console.log('→ Multiple clients found for domain:', domainResult.data.clientIds);
      return res.status(400).json({
        success: false,
        error: 'Multiple clients found for this domain. Please provide email for clarification.',
        domain: domain,
        clientIds: domainResult.data.clientIds
      });
    }
    
    // Determine which resolution to use - prioritize domain over email
    if (domainResult && emailResult) {
      // Both resolved - check if they match
      if (domainResult.data.clientId === emailResult.data.id) {
        resolvedClient = emailResult.data;
        resolvedFrom = 'domain+email';
        console.log('→ Client resolved from both domain and email (matching):', resolvedClient.id);
      } else {
        // Edge case: Different clients found - prioritize domain over email
        console.log('→ Domain and email resolve to different clients - prioritizing domain');
        // Get full client details for domain-resolved client
        const { callWhmcsApi } = require('../services/passwordResetService');
        const clientDetails = await callWhmcsApi('GetClientsDetails', {
          clientid: domainResult.data.clientId,
          stats: false
        });
        resolvedClient = clientDetails.client;
        resolvedFrom = 'domain_priority';
        console.log('→ Client resolved from domain (email mismatch ignored):', resolvedClient.id);
      }
    } else if (domainResult) {
      // Only domain resolved - email was wrong or not provided
      const { callWhmcsApi } = require('../services/passwordResetService');
      const clientDetails = await callWhmcsApi('GetClientsDetails', {
        clientid: domainResult.data.clientId,
        stats: false
      });
      resolvedClient = clientDetails.client;
      resolvedFrom = 'domain';
      console.log('→ Client resolved from domain:', resolvedClient.id);
    } else if (emailResult) {
      // Only email resolved - domain was wrong or not provided
      resolvedClient = emailResult.data;
      resolvedFrom = 'email';
      console.log('→ Client resolved from email:', resolvedClient.id);
    } else {
      // Neither resolved successfully
      const errorMessages = [];
      if (emailToUse) errorMessages.push('No client found for the provided email');
      if (domain) errorMessages.push('No client found for the provided domain');
      
      return res.status(404).json({
        success: false,
        error: errorMessages.join(' and ') + '. Please verify your information.'
      });
    }

    console.log(`✅ Client found: ${resolvedClient.firstname} ${resolvedClient.lastname} (ID: ${resolvedClient.id}, resolved from: ${resolvedFrom})`);

    // Step 2: Validate phone number if provided
    if (phoneToUse) {
      console.log('📱 Step 2: Validating phone number...');
      
      const registeredPhone = resolvedClient.phonenumber;
      
      if (!registeredPhone) {
        return res.status(400).json({
          success: false,
          error: 'No phone number registered for this client. Please contact support.'
        });
      }
      
      // Normalize and compare phone numbers
      const { phoneNumbersMatch } = require('../services/passwordResetService');
      
      if (!phoneNumbersMatch(registeredPhone, phoneToUse)) {
        // Mask the registered phone number for security
        const maskedPhone = registeredPhone.replace(/(\d{3})\d+(\d{2})/, '$1***$2');
        
        return res.status(400).json({
          success: false,
          error: `Phone number verification failed. Please contact from ${maskedPhone} or update your phone number in the client area.`,
          registeredPhone: maskedPhone
        });
      }
      
      console.log('✅ Phone number validated successfully');
    }

    const client = resolvedClient;

    // Step 3: Get client's products/services for the specific domain
    console.log('🛍️ Step 3: Getting client products for domain...');
    const products = await getClientProductsByDomain(client.id, domain);
    
    if (!products || products.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No hosting services found for domain "${domain}" under this client account`
      });
    }

    console.log(`📦 Found ${products.length} product(s) for domain ${domain}`);

    // Step 4: Find the service for the domain
    console.log('🔍 Step 4: Finding service for domain...');
    let matchedService = null;

    // Find service that matches the domain exactly
    matchedService = Array.isArray(products) 
      ? products.find(p => p.domain === domain)
      : (products.domain === domain ? products : null);

    if (!matchedService) {
      // If no exact match, try partial matching
      const productArray = Array.isArray(products) ? products : [products];
      matchedService = productArray.find(p => 
        p.domain && (p.domain.includes(domain) || domain.includes(p.domain))
      );
    }

    if (!matchedService) {
      return res.status(404).json({
        success: false,
        error: `No hosting service found for domain "${domain}"`,
        availableServices: Array.isArray(products) 
          ? products.map(p => ({
              id: p.id,
              name: p.name || p.productname,
              domain: p.domain,
              status: p.status
            }))
          : [{
              id: products.id,
              name: products.name || products.productname,
              domain: products.domain,
              status: products.status
            }]
      });
    }

    console.log(`✅ Service found: ${matchedService.name || matchedService.productname} (Service ID: ${matchedService.id})`);

    // Step 5: Check service status
    console.log('📊 Step 5: Checking service status...');
    const statusCheck = checkServiceStatus(matchedService);
    
    console.log(`📋 Service status: ${statusCheck.status} (Active: ${statusCheck.isActive}, Suspended: ${statusCheck.isSuspended})`);

    // Step 6: Handle suspended/terminated services
    if (statusCheck.needsTicket) {
      console.log('🎫 Step 6: Creating support ticket for suspended/terminated service...');
      
      const ticketSubject = `Password Reset Request - Service Suspended/Terminated`;
      const ticketMessage = `
Dear Support Team,

A password reset was requested for the following service, but it appears to be ${statusCheck.status}:

Service Details:
- Service ID: ${matchedService.id}
- Product: ${matchedService.name || matchedService.productname}
- Domain: ${matchedService.domain || domain}
- Status: ${statusCheck.status}

Client Details:
- Client ID: ${client.id}
- Name: ${client.firstname} ${client.lastname}
- Email: ${client.email}

Please review the service status and assist with reactivation if appropriate, then proceed with the password reset.

This ticket was automatically generated by the password reset system.
      `.trim();

      try {
        const ticket = await createSupportTicket(
          client.id,
          matchedService.id,
          ticketSubject,
          ticketMessage
        );

        return res.json({
          success: true,
          action: 'ticket_created',
          message: `Service is ${statusCheck.status}. A support ticket has been created for manual review.`,
          ticket: {
            id: ticket.id,
            tid: ticket.tid,
            subject: ticketSubject
          },
          service: {
            id: matchedService.id,
            name: matchedService.name || matchedService.productname,
            domain: matchedService.domain,
            status: statusCheck.status
          }
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: `Service is ${statusCheck.status} and ticket creation failed: ${error.message}`
        });
      }
    }

    // Step 7: Reset password for active service
    console.log('🔐 Step 7: Resetting cPanel password...');
    
    try {
      // Reset password using WHMCS ModuleChangePw API
      const resetResult = await resetCpanelPassword(matchedService.id);
      
      if (!resetResult.success) {
        throw new Error(resetResult.error || 'Password reset failed');
      }
      
      console.log('✅ Password reset successful');
      
      // Send email notification with new password information
      console.log('📧 Step 8: Sending email notification...');
      const emailResult = await sendEmailNotification(
        matchedService.id, 
        'Hosting Account - cPanel Login Email',
        {
          // Pass new password for email template
          cpanel_password: resetResult.newPassword,
          domain: domain
        }
      );

      const response = {
        success: true,
        action: 'password_reset',
        message: 'Password reset completed successfully',
        service: {
          id: matchedService.id,
          name: matchedService.name || matchedService.productname,
          domain: matchedService.domain,
          status: statusCheck.status
        },
        client: {
          id: client.id,
          name: `${client.firstname} ${client.lastname}`,
          email: client.email
        },
        passwordReset: {
          success: true,
          message: 'cPanel password reset successfully',
          serviceId: resetResult.serviceId,
          newPassword: resetResult.newPassword // Include for reference
        },
        emailNotification: {
          success: true,
          message: 'Login credentials email sent successfully'
        }
      };

      return res.json(response);

    } catch (error) {
      console.error('❌ Password reset process failed:', error.message);
      return res.status(500).json({
        success: false,
        error: `Password reset failed: ${error.message}`,
        service: {
          id: matchedService.id,
          name: matchedService.name || matchedService.productname,
          domain: matchedService.domain
        }
      });
    }

  } catch (error) {
    console.error('❌ Password reset request failed:', error.message);
    return res.status(500).json({
      success: false,
      error: `Password reset request failed: ${error.message}`
    });
  }
}

/**
 * Get available hosting services for a client
 */
async function getClientHostingServices(req, res) {
  try {
    const { contact } = req.query;

    if (!contact) {
      return res.status(400).json({
        success: false,
        error: 'Contact (email or phone) is required'
      });
    }

    // Find client
    const client = await getClientByContact(contact);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found with the provided email or phone number'
      });
    }

    // Get all client's products (without domain filter)
    const { callWhmcsApi } = require('../services/passwordResetService');
    const result = await callWhmcsApi('GetClientsProducts', {
      clientid: client.id,
      limitnum: 100
    });
    
    const products = result.products?.product || [];
    
    const hostingServices = (Array.isArray(products) ? products : [products]).map(product => {
      const statusCheck = checkServiceStatus(product);
      return {
        id: product.id,
        pid: product.pid,
        name: product.name || product.productname,
        domain: product.domain,
        status: product.status,
        isActive: statusCheck.isActive,
        isSuspended: statusCheck.isSuspended,
        canResetPassword: statusCheck.isActive
      };
    });

    return res.json({
      success: true,
      client: {
        id: client.id,
        name: `${client.firstname} ${client.lastname}`,
        email: client.email
      },
      hostingServices
    });

  } catch (error) {
    console.error('Error getting client hosting services:', error.message);
    return res.status(500).json({
      success: false,
      error: `Failed to get hosting services: ${error.message}`
    });
  }
}

/**
 * Helper function to resolve client by email
 */
async function resolveClientByEmail(email) {
  const { callWhmcsApi } = require('../services/passwordResetService');
  
  const result = await callWhmcsApi('GetClientsDetails', {
    email: email,
    stats: false
  });
  
  if (result && result.client && result.client.id) {
    return result.client;
  }
  
  throw new Error('No client found with that email address');
}

/**
 * Helper function to resolve client by domain
 */
async function resolveClientByDomain(domain) {
  const { callWhmcsApi } = require('../services/passwordResetService');
  
  // Try GetClientsDomains first (for domain registrations)
  const domainsData = await callWhmcsApi('GetClientsDomains', { domain });
  
  if (domainsData && domainsData.domains) {
    const domainsRaw = domainsData.domains;
    const domains = domainsRaw.domain || domainsRaw;
    const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
    
    if (domainArray.length > 0) {
      const uniqueUserIds = [...new Set(domainArray.map(d => String(d.userid)))];
      
      if (uniqueUserIds.length === 1) {
        return { clientId: uniqueUserIds[0], source: 'domains' };
      } else if (uniqueUserIds.length > 1) {
        return { 
          clientId: null, 
          multipleClients: true, 
          clientIds: uniqueUserIds,
          source: 'domains'
        };
      }
    }
  }
  
  // Fallback: Try GetClientsProducts with domain parameter
  const productsData = await callWhmcsApi('GetClientsProducts', { domain });
  
  if (productsData && productsData.products) {
    const productsRaw = productsData.products;
    const products = productsRaw.product || productsRaw;
    const productArray = Array.isArray(products) ? products : (products ? [products] : []);
    
    if (productArray.length > 0) {
      const uniqueUserIds = [...new Set(productArray.map(p => String(p.userid || p.clientid)))];
      
      if (uniqueUserIds.length === 1) {
        return { clientId: uniqueUserIds[0], source: 'products' };
      } else if (uniqueUserIds.length > 1) {
        return { 
          clientId: null, 
          multipleClients: true, 
          clientIds: uniqueUserIds,
          source: 'products'
        };
      }
    }
  }
  
  throw new Error('No client found with that domain');
}

module.exports = {
  handlePasswordReset,
  getClientHostingServices
};