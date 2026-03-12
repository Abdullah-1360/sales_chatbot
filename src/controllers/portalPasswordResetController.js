const {
  callWhmcsApi,
  phoneNumbersMatch,
  resetWhmcsPassword
} = require('../services/portalPasswordResetService');

/**
 * Handle WHMCS portal password reset request with parallel client resolution
 */
async function handlePortalPasswordReset(req, res) {
  try {
    const { contact, email, phone, domain, user_ns } = req.body;

    // Support both old format (contact) and new format (email/phone/domain)
    const emailToUse = email || (contact && contact.includes('@') ? contact : null);
    const phoneToUse = phone || (contact && !contact.includes('@') ? contact : null);

    // Validate input - domain OR email required
    if (!domain && !emailToUse) {
      return res.status(400).json({
        success: false,
        error: 'domain or email is required'
      });
    }

    if (!phoneToUse) {
      return res.status(400).json({
        success: false,
        error: 'phone is required for verification'
      });
    }

    console.log(`🔐 Portal password reset request`, {
      hasDomain: !!domain,
      hasEmail: !!emailToUse,
      hasPhone: !!phoneToUse,
      hasUserNs: !!user_ns
    });

    // Step 1: PARALLEL client resolution by email AND domain
    
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
    
    // Task 2: Domain resolution (if provided)
    if (domain) {
      resolutionPromises.push(
        resolveClientByDomain(domain)
          .then(result => ({ type: 'domain', success: true, data: result }))
          .catch(error => ({ type: 'domain', success: false, error: error.message }))
      );
    }
    
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

    console.log(`✅ Client found: ${resolvedClient.firstname} ${resolvedClient.lastname} (ID: ${resolvedClient.id})`);

    // Step 2: Validate phone number (REQUIRED)
    const registeredPhone = resolvedClient.phonenumber;
    
    if (!registeredPhone) {
      return res.status(400).json({
        success: false,
        error: 'No phone number registered for this client. Please contact support.'
      });
    }
    
    // Normalize and compare phone numbers
    if (!phoneNumbersMatch(registeredPhone, phoneToUse)) {
      // Mask the registered phone number for security
      const maskedPhone = registeredPhone.replace(/(\d{3})\d+(\d{2})/, '$1***$2');
      
      return res.status(400).json({
        success: false,
        error: `Phone number verification failed. Please contact from ${maskedPhone} or update your phone number in the client area.`,
        registeredPhone: maskedPhone
      });
    }
    
    console.log('✅ Phone number validated');

    const client = resolvedClient;

    // Step 3: Reset WHMCS portal password
    console.log('🔄 Resetting WHMCS portal password...');
    
    try {
      const resetResult = await resetWhmcsPassword(client.id, client.email);
      
      if (!resetResult.success) {
        throw new Error(resetResult.error || 'Password reset failed');
      }
      
      console.log('✅ Portal password reset successful');

      const response = {
        success: true,
        action: 'password_reset',
        message: 'Portal password reset completed successfully. Password reset link has been sent to your registered email.',
        client: {
          id: client.id,
          email: client.email,
          name: `${client.firstname} ${client.lastname}`
        }
      };

      return res.json(response);

    } catch (error) {
      console.error('❌ Portal password reset failed:', error.message);
      return res.status(500).json({
        success: false,
        error: `Portal password reset failed: ${error.message}`
      });
    }

  } catch (error) {
    console.error('❌ Portal password reset request failed:', error.message);
    return res.status(500).json({
      success: false,
      error: `Portal password reset request failed: ${error.message}`
    });
  }
}

/**
 * Helper function to resolve client by email
 */
async function resolveClientByEmail(email) {
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
  handlePortalPasswordReset
};
