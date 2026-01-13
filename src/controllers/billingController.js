const { 
  genInvoices,
  getInvoice,
  getInvoices,
  getInvoicesForUser,
  openTicket,
  addOrder,
  getClientsProducts,
  getClientsDomains
} = require('../services/whmcsService');

const { 
  getServiceForClient,
  getDomainForClient,
  findRelatedUnpaidInvoice,
  amountFromInvoice
} = require('../utils/helpers');

/**
 * Renew a service or domain
 * 
 * IMPORTANT: WHMCS API Limitations
 * 
 * SERVICE RENEWALS:
 * - WHMCS does not support service renewals via AddOrder API
 * - Manual invoice creation (CreateInvoice) doesn't properly link to services or trigger automation
 * - Services are renewed automatically by WHMCS when due (7-14 days before due date)
 * - For immediate renewal: Admin must manually create invoice in WHMCS admin panel
 * 
 * DOMAIN RENEWALS:
 * - Domain renewals work via AddOrder API (if permissions are enabled)
 * - Use domain parameter to renew domains
 * 
 * RECOMMENDED FLOW:
 * 1. Check for existing unpaid invoices first (may already exist)
 * 2. For services: Wait for WHMCS automatic invoice generation
 * 3. For domains: Use this endpoint
 * 4. For immediate service renewal: Contact support
 */
exports.renewService = async (req, res, next) => {
  console.log('[POST /api/renewService]', { 
    clientId: req.body.clientId, 
    domain: req.body.domain, 
    serviceId: req.body.serviceId 
  });
  
  try {
    const { clientId, serviceId, domain, period, billingcycle, paymentmethod } = req.body || {};
    
    if (!clientId || (!serviceId && !domain)) {
      console.log('✗ Missing required parameters');
      return res.status(400).json({ 
        success: false, 
        error: 'clientId and serviceId or domain required' 
      });
    }
    
    let svc = null;
    let dom = null;
    
    // Lookup domain and service in parallel for faster response
    if (domain && !serviceId) {
      // If only domain provided, check both in parallel
      const [domainResult, serviceResult] = await Promise.allSettled([
        getDomainForClient({ clientId, domain }),
        getServiceForClient({ clientId, domain })
      ]);
      
      dom = domainResult.status === 'fulfilled' ? domainResult.value : null;
      svc = serviceResult.status === 'fulfilled' ? serviceResult.value : null;
      
      console.log('→ Domain found:', dom ? dom.id : 'not found');
      console.log('→ Service found:', svc ? svc.id : 'not found');
    } else if (serviceId) {
      // If serviceId provided, only lookup service
      try {
        svc = await getServiceForClient({ clientId, domain, serviceId });
        console.log('→ Service found:', svc ? svc.id : 'not found');
      } catch (err) {
        console.log('→ Service lookup failed:', err.message);
      }
    } else if (domain) {
      // Fallback: domain only
      try {
        dom = await getDomainForClient({ clientId, domain });
        console.log('→ Domain found:', dom ? dom.id : 'not found');
      } catch (err) {
        console.log('→ Domain lookup failed:', err.message);
      }
    }
    
    if (!svc && !dom) {
      console.log('✗ Neither service nor domain found for client:', clientId, 'domain:', domain);
      return res.status(404).json({ 
        success: false, 
        error: `No service or domain found for ${domain || 'serviceId ' + serviceId}. Please check if this service belongs to your account.` 
      });
    }
    
    // Check for existing unpaid invoice
    const existing = await findRelatedUnpaidInvoice(clientId, { 
      domain: domain || (svc && svc.domain), 
      serviceId: svc ? svc.id : null,
      domainId: dom ? dom.id : null
    });
    
    if (existing) {
      const amount = amountFromInvoice(existing);
      const invoiceId = existing.invoiceid || existing.id;
      const dueDate = existing.duedate;
      
      console.log('→ Existing invoice found:', invoiceId, 'Due:', dueDate, 'Amount:', amount);
      
      // Check if invoice is overdue
      const now = new Date();
      const due = new Date(dueDate);
      const isOverdue = due < now;
      
      let message;
      if (isOverdue) {
        const daysOverdue = Math.ceil((now - due) / (1000 * 60 * 60 * 24));
        message = `Invoice #${invoiceId} for renewal is overdue by ${daysOverdue} day(s) (due: ${dueDate}). Please pay ${amount} to reactivate your service.`;
      } else {
        message = `An invoice for renewal already exists: Invoice #${invoiceId} for ${amount} due on ${dueDate}. Please pay this invoice to renew your service.`;
      }
      
      return res.json({ 
        success: true, 
        existingInvoice: true, 
        invoiceId: invoiceId, 
        amount: amount,
        dueDate: dueDate,
        isOverdue: isOverdue,
        message: message
      });
    }
    
    // Use provided payment method or default to bank transfer
    const defaultPaymentMethod = process.env.DEFAULT_PAYMENT_METHOD || 'hostbreakbanktransfer';
    const selectedPaymentMethod = paymentmethod || defaultPaymentMethod;
    
    // Validate service status
    if (svc && svc.id) {
      console.log('→ Service details:', { 
        id: svc.id, 
        status: svc.status, 
        domain: svc.domain, 
        nextduedate: svc.nextduedate,
        billingcycle: svc.billingcycle 
      });
      
      // Check if service can be renewed
      const nonRenewableStatuses = ['Cancelled', 'Terminated', 'Fraud'];
      if (nonRenewableStatuses.includes(svc.status)) {
        console.log('✗ Service cannot be renewed, status:', svc.status);
        return res.status(400).json({ 
          success: false, 
          error: `Service cannot be renewed because it is ${svc.status}. Please contact support.` 
        });
      }
      
      // Check if service is Active
      if (svc.status !== 'Active') {
        console.log('✗ Service is not active, status:', svc.status);
        return res.status(400).json({ 
          success: false, 
          error: `Service status is ${svc.status}. Only Active services can be renewed.`,
          serviceId: svc.id,
          status: svc.status
        });
      }
    }
    
    // Use GenInvoices to generate renewal invoice
    console.log('→ Calling GenInvoices for service:', svc ? svc.id : 'N/A', 'domain:', dom ? dom.id : 'N/A');
    
    if (svc && svc.id) {
      // Generate invoice for service
      await genInvoices({ 
        serviceids: String(svc.id)
      });
      
      console.log('→ GenInvoices called, checking for invoice...');
      
      // Wait briefly for WHMCS to generate the invoice
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fetch recent unpaid invoices
      const invoices = await getInvoices({ 
        userid: clientId, 
        status: 'Unpaid',
        limitnum: 10,
        orderby: 'date',
        order: 'DESC'
      });
      
      const invoiceList = invoices.invoices?.invoice || [];
      const invoiceArray = Array.isArray(invoiceList) ? invoiceList : (invoiceList ? [invoiceList] : []);
      
      // Find invoice for this service
      let serviceInvoice = null;
      for (const inv of invoiceArray) {
        const items = inv.items?.item || [];
        const itemArray = Array.isArray(items) ? items : (items ? [items] : []);
        
        for (const item of itemArray) {
          if (String(item.relid) === String(svc.id)) {
            serviceInvoice = inv;
            break;
          }
        }
        if (serviceInvoice) break;
      }
      
      if (serviceInvoice) {
        const amount = amountFromInvoice(serviceInvoice);
        const invoiceId = serviceInvoice.invoiceid || serviceInvoice.id;
        
        console.log('→ Renewal invoice generated:', invoiceId);
        
        return res.json({ 
          success: true, 
          existingInvoice: false, 
          invoiceId: invoiceId, 
          amount, 
          dueDate: serviceInvoice.duedate,
          message: `Renewal invoice #${invoiceId} has been generated (${amount}). Service will be automatically extended upon payment.` 
        });
      }
      
      // No invoice generated - not within renewal window
      console.log('→ No invoice generated (not within renewal window)');
      
      const daysUntilDue = svc.nextduedate && svc.nextduedate !== '0000-00-00' 
        ? Math.ceil((new Date(svc.nextduedate) - new Date()) / (1000 * 60 * 60 * 24))
        : null;
      
      // If service is overdue or outside renewal window, create a support ticket
      if (daysUntilDue !== null && (daysUntilDue < 0 || daysUntilDue >= 14)) {
        const isOverdue = daysUntilDue < 0;
        const isEarlyRenewal = daysUntilDue >= 14;
        const daysDifference = Math.abs(daysUntilDue);
        
        if (isOverdue) {
          console.log(`→ Service is overdue by ${daysDifference} days, creating support ticket`);
        } else {
          console.log(`→ Service renewal requested ${daysDifference} days early, creating support ticket`);
        }
        
        // Create support ticket for renewal outside normal window
        const ticketMessage = isOverdue 
          ? `=== OVERDUE SERVICE RENEWAL REQUEST ===
Client attempted to renew an overdue service that cannot generate automatic invoices.

=== SERVICE DETAILS ===
Domain: ${svc.domain}
Service ID: ${svc.id}
Status: ${svc.status}
Product: ${svc.productname || svc.name || 'N/A'}
Next Due Date: ${svc.nextduedate}
Days Overdue: ${daysDifference}
Billing Cycle: ${svc.billingcycle || 'N/A'}

=== ISSUE SUMMARY ===
The client requested renewal for service "${svc.domain}" (ID: ${svc.id}) but the service is ${daysDifference} day(s) overdue (due: ${svc.nextduedate}).

WHMCS GenInvoices did not generate an automatic renewal invoice, likely because:
- The service is beyond the automatic renewal window
- The service may be suspended or have billing restrictions
- Manual intervention may be required

=== REQUIRED ACTION ===
Please investigate and contact the client to:
1. Manually generate the renewal invoice in WHMCS admin
2. Check for any service suspension or billing issues
3. Process the renewal payment if received
4. Restore service if suspended due to non-payment
5. Verify service status and billing cycle

This ticket was automatically generated from an overdue renewal request.`
          : `=== EARLY SERVICE RENEWAL REQUEST ===
Client attempted to renew a service outside the standard renewal window.

=== SERVICE DETAILS ===
Domain: ${svc.domain}
Service ID: ${svc.id}
Status: ${svc.status}
Product: ${svc.productname || svc.name || 'N/A'}
Next Due Date: ${svc.nextduedate}
Days Until Due: ${daysUntilDue}
Billing Cycle: ${svc.billingcycle || 'N/A'}

=== ISSUE SUMMARY ===
The client requested renewal for service "${svc.domain}" (ID: ${svc.id}) but the service is ${daysDifference} day(s) before the due date (${svc.nextduedate}).

WHMCS GenInvoices did not generate an automatic renewal invoice because the service is outside the standard renewal window (typically 7-14 days before due date).

The client wants to renew early, which may require manual processing.

This ticket was automatically generated from an early renewal request.`;

        try {
          const deptid = process.env.BILLING_DEPTID;
          const deptname = deptid ? undefined : (process.env.BILLING_DEPTNAME || 'Billing');
          
          const ticket = await openTicket({
            deptid,
            deptname,
            subject: isOverdue 
              ? `[Overdue] Service Renewal Request - ${svc.domain} (${daysDifference} days overdue)`
              : `[Early Renewal] Service Renewal Request - ${svc.domain} (${daysDifference} days early)`,
            message: ticketMessage,
            clientid: clientId,
            priority: 'High',
            serviceid: svc.id
          });
          
          const ticketId = ticket.tid || ticket.ticketid || ticket.id;
          console.log(`→ Support ticket created: ${ticketId} for ${isOverdue ? 'overdue' : 'early'} service renewal`);
          
          return res.status(400).json({
            success: false,
            error: isOverdue 
              ? 'Service is overdue and requires manual processing'
              : 'Service renewal requested outside standard window',
            message: isOverdue
              ? `This service is ${daysDifference} day(s) overdue and cannot be automatically renewed. A support ticket (#${ticketId}) has been created for our billing team to manually process your renewal.`
              : `This service renewal was requested ${daysDifference} day(s) before the due date, outside the standard renewal window. A support ticket (#${ticketId}) has been created for our billing team to process your early renewal request.`,
            serviceId: svc.id,
            serviceName: svc.name || svc.productname,
            domain: svc.domain,
            nextDueDate: svc.nextduedate,
            daysUntilDue: daysUntilDue,
            ticketId: ticketId,
            isOverdue: isOverdue,
            isEarlyRenewal: isEarlyRenewal
          });
        } catch (ticketError) {
          console.log(`→ Failed to create support ticket: ${ticketError.message}`);
          
          // Fallback response if ticket creation fails
          return res.status(400).json({
            success: false,
            error: isOverdue 
              ? 'Service is overdue and requires manual processing'
              : 'Service renewal requested outside standard window',
            message: isOverdue
              ? `This service is ${daysDifference} day(s) overdue and cannot be automatically renewed. Please contact billing support for manual renewal processing.`
              : `This service renewal was requested ${daysDifference} day(s) before the due date, outside the standard renewal window. Please contact billing support for early renewal processing.`,
            serviceId: svc.id,
            serviceName: svc.name || svc.productname,
            domain: svc.domain,
            nextDueDate: svc.nextduedate,
            daysUntilDue: daysUntilDue,
            isOverdue: isOverdue,
            isEarlyRenewal: isEarlyRenewal
          });
        }
      }
      
      return res.status(400).json({ 
        success: false, 
        error: 'Service is not within the renewal window.',
        serviceId: svc.id,
        serviceName: svc.name || svc.productname,
        domain: svc.domain,
        nextDueDate: svc.nextduedate,
        daysUntilDue: daysUntilDue,
        message: `System will automatically generate the renewal invoice when the service is within the renewal window (typically 7-14 days before ${svc.nextduedate}).`
      });
    } else if (dom && dom.id) {
      // For domains, GenInvoices also works
      await genInvoices({ 
        domainids: String(dom.id)
      });
      
      console.log('→ GenInvoices called for domain, checking for invoice...');
      
      // Wait briefly for WHMCS to generate the invoice
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fetch recent unpaid invoices
      const invoices = await getInvoices({ 
        userid: clientId, 
        status: 'Unpaid',
        limitnum: 10,
        orderby: 'date',
        order: 'DESC'
      });
      
      const invoiceList = invoices.invoices?.invoice || [];
      const invoiceArray = Array.isArray(invoiceList) ? invoiceList : (invoiceList ? [invoiceList] : []);
      
      // Find invoice for this domain
      let domainInvoice = null;
      for (const inv of invoiceArray) {
        const items = inv.items?.item || [];
        const itemArray = Array.isArray(items) ? items : (items ? [items] : []);
        
        for (const item of itemArray) {
          if (String(item.relid) === String(dom.id) && item.type === 'Domain') {
            domainInvoice = inv;
            break;
          }
        }
        if (domainInvoice) break;
      }
      
      if (domainInvoice) {
        const amount = amountFromInvoice(domainInvoice);
        const invoiceId = domainInvoice.invoiceid || domainInvoice.id;
        
        console.log('→ Domain renewal invoice generated:', invoiceId);
        
        return res.json({ 
          success: true, 
          existingInvoice: false, 
          invoiceId: invoiceId, 
          amount, 
          dueDate: domainInvoice.duedate,
          message: `Domain renewal invoice #${invoiceId} has been generated (${amount}). Please pay to complete renewal.` 
        });
      }
      
      // No invoice generated
      console.log('→ No invoice generated for domain');
      
      // Check if domain is overdue
      const domainExpiryDate = dom.expirydate || dom.nextduedate;
      let daysUntilExpiry = null;
      let isOverdue = false;
      
      if (domainExpiryDate && domainExpiryDate !== '0000-00-00') {
        daysUntilExpiry = Math.ceil((new Date(domainExpiryDate) - new Date()) / (1000 * 60 * 60 * 24));
        isOverdue = daysUntilExpiry < 0;
      }
      
      // If domain is overdue or outside renewal window, create a support ticket
      if (daysUntilExpiry !== null && (daysUntilExpiry < 0 || daysUntilExpiry >= 14)) {
        const isDomainOverdue = daysUntilExpiry < 0;
        const isEarlyDomainRenewal = daysUntilExpiry >= 14;
        const daysDifference = Math.abs(daysUntilExpiry);
        
        if (isDomainOverdue) {
          console.log(`→ Domain is overdue by ${daysDifference} days, creating support ticket`);
        } else {
          console.log(`→ Domain renewal requested ${daysDifference} days early, creating support ticket`);
        }
        
        // Create support ticket for domain renewal outside normal window
        const ticketMessage = isDomainOverdue
          ? `=== OVERDUE DOMAIN RENEWAL REQUEST ===
Client attempted to renew an overdue domain that cannot generate automatic invoices.

=== DOMAIN DETAILS ===
Domain: ${dom.domain || dom.domainname}
Domain ID: ${dom.id}
Status: ${dom.status}
Registrar: ${dom.registrar || 'N/A'}
Expiry Date: ${domainExpiryDate}
Days Overdue: ${daysDifference}

=== ISSUE SUMMARY ===
The client requested renewal for domain "${dom.domain || dom.domainname}" (ID: ${dom.id}) but the domain is ${daysDifference} day(s) overdue (expired: ${domainExpiryDate}).

WHMCS GenInvoices did not generate an automatic renewal invoice, likely because:
- The domain is beyond the automatic renewal window
- The domain may be in redemption period
- Manual intervention may be required

=== REQUIRED ACTION ===
Please investigate and contact the client to:
1. Check domain status with the registrar
2. Manually generate the renewal invoice in WHMCS admin
3. Verify if domain is still renewable or in redemption period
4. Process the renewal if still possible
5. Advise on re-registration if domain has expired beyond redemption

This ticket was automatically generated from an overdue renewal request.`
          : `=== EARLY DOMAIN RENEWAL REQUEST ===
Client attempted to renew a domain outside the standard renewal window.

=== DOMAIN DETAILS ===
Domain: ${dom.domain || dom.domainname}
Domain ID: ${dom.id}
Status: ${dom.status}
Registrar: ${dom.registrar || 'N/A'}
Expiry Date: ${domainExpiryDate}
Days Until Expiry: ${daysUntilExpiry}

=== ISSUE SUMMARY ===
The client requested renewal for domain "${dom.domain || dom.domainname}" (ID: ${dom.id}) but the domain is ${daysDifference} day(s) before the expiry date (${domainExpiryDate}).

WHMCS GenInvoices did not generate an automatic renewal invoice because the domain is outside the standard renewal window (typically 7-14 days before expiry).

The client wants to renew early, which may require manual processing.

This ticket was automatically generated from an early domain renewal request.`;

        try {
          const deptid = process.env.BILLING_DEPTID;
          const deptname = deptid ? undefined : (process.env.BILLING_DEPTNAME || 'Billing');
          
          const ticket = await openTicket({
            deptid,
            deptname,
            subject: isDomainOverdue
              ? `[Overdue] Domain Renewal Request - ${dom.domain || dom.domainname} (${daysDifference} days overdue)`
              : `[Early Renewal] Domain Renewal Request - ${dom.domain || dom.domainname} (${daysDifference} days early)`,
            message: ticketMessage,
            clientid: clientId,
            priority: 'High'
          });
          
          const ticketId = ticket.tid || ticket.ticketid || ticket.id;
          console.log(`→ Support ticket created: ${ticketId} for ${isDomainOverdue ? 'overdue' : 'early'} domain renewal`);
          
          return res.status(400).json({
            success: false,
            error: isDomainOverdue
              ? 'Domain is overdue and requires manual processing'
              : 'Domain renewal requested outside standard window',
            message: isDomainOverdue
              ? `This domain is ${daysDifference} day(s) overdue and cannot be automatically renewed. A support ticket (#${ticketId}) has been created for our billing team to check renewal options.`
              : `This domain renewal was requested ${daysDifference} day(s) before the expiry date, outside the standard renewal window. A support ticket (#${ticketId}) has been created for our billing team to process your early renewal request.`,
            domainId: dom.id,
            domain: dom.domain || dom.domainname,
            expiryDate: domainExpiryDate,
            daysUntilExpiry: daysUntilExpiry,
            ticketId: ticketId,
            isOverdue: isDomainOverdue,
            isEarlyRenewal: isEarlyDomainRenewal
          });
        } catch (ticketError) {
          console.log(`→ Failed to create support ticket: ${ticketError.message}`);
          
          // Fallback response if ticket creation fails
          return res.status(400).json({
            success: false,
            error: isDomainOverdue
              ? 'Domain is overdue and requires manual processing'
              : 'Domain renewal requested outside standard window',
            message: isDomainOverdue
              ? `This domain is ${daysDifference} day(s) overdue and cannot be automatically renewed. Please contact billing support for renewal assistance.`
              : `This domain renewal was requested ${daysDifference} day(s) before the expiry date, outside the standard renewal window. Please contact billing support for early renewal processing.`,
            domainId: dom.id,
            domain: dom.domain || dom.domainname,
            expiryDate: domainExpiryDate,
            daysUntilExpiry: daysUntilExpiry,
            isOverdue: isDomainOverdue,
            isEarlyRenewal: isEarlyDomainRenewal
          });
        }
      }
      
      return res.status(400).json({ 
        success: false, 
        error: 'Domain is not within the renewal window.',
        domainId: dom.id,
        domain: dom.domain || dom.domainname,
        expiryDate: domainExpiryDate,
        daysUntilExpiry: daysUntilExpiry,
        message: `System will automatically generate the renewal invoice when the domain is within the renewal window${domainExpiryDate ? ` (typically 7-14 days before ${domainExpiryDate})` : ''}.`
      });
    } else {
      console.log('✗ No valid service or domain ID found');
      return res.status(400).json({ 
        success: false, 
        error: 'Unable to create renewal invoice. Service or domain ID is missing.' 
      });
    }
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Confirm payment for an invoice with enhanced parallel validation
 */
exports.confirmPayment = async (req, res, next) => {
  console.log('[POST /api/confirmPayment]', { 
    clientId: req.body.clientId, 
    invoiceId: req.body.invoiceId,
    domain: req.body.domain,
    email: req.body.email ? '[PROVIDED]' : undefined,
    phone: req.body.phone ? '[PROVIDED]' : undefined,
    hasImage: !!req.body.image_url,
    hasPaymentUrl: !!req.body.payment_url,
    resolvedFrom: req.body._resolvedFrom
  });
  
  try {
    const { clientId, invoiceId, details, domain, email, phone, image_url, image_base64, image_filename, payment_url } = req.body || {};
    
    // Validate email if provided
    if (email !== undefined && email !== null && email !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid email format provided' 
        });
      }
    }
    
    let resolvedClientId = clientId;
    let resolvedFrom = req.body._resolvedFrom;
    
    // PARALLEL VALIDATION: If no clientId was resolved, try domain OR email in parallel
    if (!resolvedClientId && (domain || email)) {
      console.log('→ Starting parallel client resolution...');
      
      const parallelTasks = [];
      
      // Task 1: Domain resolution (if domain provided)
      if (domain) {
        parallelTasks.push(
          resolveDomainToClient(domain)
            .then(result => ({ type: 'domain', success: true, data: result }))
            .catch(error => ({ type: 'domain', success: false, error: error.message }))
        );
      }
      
      // Task 2: Email resolution (if email provided)
      if (email) {
        parallelTasks.push(
          resolveEmailToClient(email)
            .then(result => ({ type: 'email', success: true, data: result }))
            .catch(error => ({ type: 'email', success: false, error: error.message }))
        );
      }
      
      // Execute parallel resolution
      const results = await Promise.allSettled(parallelTasks);
      
      // Process results - prioritize successful resolutions
      let domainResult = null;
      let emailResult = null;
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          if (result.value.type === 'domain') {
            domainResult = result.value.data;
          } else if (result.value.type === 'email') {
            emailResult = result.value.data;
          }
        }
      }
      
      // Determine which resolution to use - handle edge cases
      if (domainResult && emailResult) {
        // Both resolved - check if they match
        if (domainResult.clientId === emailResult.clientId) {
          resolvedClientId = domainResult.clientId;
          resolvedFrom = 'domain+email';
          console.log('→ Client resolved from both domain and email (matching):', resolvedClientId);
        } else {
          // Edge case: Different clients found - prioritize domain over email for payment confirmation
          // This handles cases where email is wrong but domain is correct
          console.log('→ Domain and email resolve to different clients - prioritizing domain');
          resolvedClientId = domainResult.clientId;
          resolvedFrom = 'domain_priority';
          console.log('→ Client resolved from domain (email mismatch ignored):', resolvedClientId);
        }
      } else if (domainResult) {
        // Only domain resolved - email was wrong or not provided
        resolvedClientId = domainResult.clientId;
        resolvedFrom = 'domain';
        console.log('→ Client resolved from domain:', resolvedClientId);
      } else if (emailResult) {
        // Only email resolved - domain was wrong or not provided
        resolvedClientId = emailResult.clientId;
        resolvedFrom = 'email';
        console.log('→ Client resolved from email:', resolvedClientId);
      } else {
        // Neither resolved successfully
        const errorMessages = [];
        if (domain) errorMessages.push('No client found for the provided domain');
        if (email) errorMessages.push('No client found for the provided email');
        
        return res.status(404).json({
          success: false,
          error: errorMessages.join(' and ') + '. Please verify your information.'
        });
      }
    }
    
    // SECOND-LEVEL VALIDATION: Phone validation if provided
    if (phone && resolvedClientId) {
      console.log('→ Performing second-level phone validation...');
      
      try {
        const phoneValidationResult = await validateClientPhone(resolvedClientId, phone);
        
        if (!phoneValidationResult.valid) {
          // Phone validation failed - return masked phone error with update instructions
          const maskedPhone = phoneValidationResult.registeredPhone 
            ? maskPhoneNumber(phoneValidationResult.registeredPhone)
            : 'your registered number';
            
          return res.status(400).json({
            success: false,
            error: `Please contact from ${maskedPhone} or change the phone number from your client area to ${phone} `
          });
        }
        
        console.log('✓ Phone validation passed');
      } catch (error) {
        console.log('✗ Phone validation error:', error.message);
        return res.status(500).json({
          success: false,
          error: 'Phone validation failed. Please try again or contact support.'
        });
      }
    } else if (phone && !resolvedClientId) {
      return res.status(400).json({
        success: false,
        error: 'Please provide either a domain name or email address along with phone number for validation.'
      });
    }
    
    // Validate that we have a resolved client
    if (!resolvedClientId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please provide either a domain name or email address to identify your account.' 
      });
    }
    
    // Handle empty or invalid invoice ID
    let targetInvoiceId = invoiceId;
    if (targetInvoiceId !== undefined && targetInvoiceId !== null && targetInvoiceId !== '') {
      if (!String(targetInvoiceId).match(/^\d+$/)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid invoice ID format. Invoice ID must be numeric.' 
        });
      }
    } else {
      // Empty, null, or undefined invoice ID - find unpaid invoice
      targetInvoiceId = null;
    }
    
    let matchedInvoice = null;
    let fallbackUsed = false;
    
    // Try to find specific invoice if ID provided
    if (targetInvoiceId) {
      try {
        console.log('→ Fetching invoices for user:', resolvedClientId);
        const invoicesResponse = await getInvoicesForUser(resolvedClientId);
        
        if (invoicesResponse && invoicesResponse.invoices && invoicesResponse.invoices.invoice) {
          const invoiceList = Array.isArray(invoicesResponse.invoices.invoice) 
            ? invoicesResponse.invoices.invoice 
            : [invoicesResponse.invoices.invoice];
          
          const requestedInvoiceId = String(targetInvoiceId);
          console.log('→ Looking for invoice:', requestedInvoiceId, 'in', invoiceList.length, 'invoices');
          
          matchedInvoice = invoiceList.find(inv => {
            const idMatch = String(inv.id) === requestedInvoiceId;
            const invoiceNumMatch = String(inv.invoicenum) === requestedInvoiceId;
            return idMatch || invoiceNumMatch;
          });
          
          if (matchedInvoice) {
            console.log('→ Found specific invoice:', matchedInvoice.id);
          } else {
            console.log('→ Specific invoice not found, will search for unpaid invoice');
          }
        }
      } catch (error) {
        console.log('→ Error fetching specific invoice, will search for unpaid invoice:', error.message);
      }
    }
    
    // If no specific invoice found or no invoice ID provided, search for unpaid invoice
    if (!matchedInvoice) {
      console.log('→ Searching for unpaid invoice for client:', resolvedClientId);
      fallbackUsed = !!targetInvoiceId; // Mark as fallback if specific ID was requested
      
      try {
        // Always search for any unpaid invoice for this client first
        const { getInvoices } = require('../services/whmcsService');
        const unpaidInvoices = await getInvoices({ 
          userid: resolvedClientId, 
          status: 'Unpaid', 
          limitnum: 1 
        });
        
        const invoiceArray = unpaidInvoices.invoices?.invoice || unpaidInvoices.invoices?.invoices || [];
        const invoices = Array.isArray(invoiceArray) ? invoiceArray : (invoiceArray ? [invoiceArray] : []);
        
        if (invoices.length > 0) {
          const firstInvoice = invoices[0];
          const invoiceId = firstInvoice.id || firstInvoice.invoiceid;
          
          if (invoiceId) {
            const { getInvoice } = require('../services/whmcsService');
            matchedInvoice = await getInvoice(invoiceId);
            console.log('→ Found unpaid invoice for client:', matchedInvoice.invoiceid || matchedInvoice.id);
          }
        } else if (domain && domain.trim() !== '') {
          // Only try domain-specific search if no general unpaid invoices found AND domain is valid
          console.log('→ No general unpaid invoices found, trying domain-specific search for:', domain);
          const { findRelatedUnpaidInvoice } = require('../utils/helpers');
          const found = await findRelatedUnpaidInvoice(resolvedClientId, { domain });
          if (found) {
            matchedInvoice = found;
            console.log('→ Found unpaid invoice via domain:', found.invoiceid || found.id);
          }
        }
      } catch (error) {
        console.log('✗ Error searching for unpaid invoices:', error.message);
      }
    }
    
    if (!matchedInvoice) {
      let message = 'No unpaid invoices found for this account.';
      if (targetInvoiceId) {
        message = `The specified invoice was not found and no unpaid invoices are available.`;
      }
      
      return res.status(404).json({ 
        success: false, 
        error: 'No invoice found.',
        message: message
      });
    }
    
    const finalInvoiceId = matchedInvoice.invoiceid || matchedInvoice.id;
    console.log('→ Using invoice:', finalInvoiceId, 'Status:', matchedInvoice.status);
    
    if (String(matchedInvoice.status) === 'Paid') {
      const paidDate = matchedInvoice.datepaid || null;
      console.log('→ Invoice already paid:', finalInvoiceId);
      
      let message = `Invoice #${finalInvoiceId} is already paid. Thank you!`;
      if (fallbackUsed) {
        message += ` Note: The requested invoice was not found, but this invoice was already paid.`;
      }
      
      return res.json({ 
        success: true, 
        paid: true, 
        invoiceId: finalInvoiceId, 
        paidDate, 
        message: message,
        requestedInvoiceId: fallbackUsed ? targetInvoiceId : undefined
      });
    }
    
    const deptid = process.env.BILLING_DEPTID;
    const deptname = deptid ? undefined : (process.env.BILLING_DEPTNAME || 'Billing');
    
    // Add domain to subject if provided in request
    const subject = domain 
      ? `Payment confirmation for Invoice #${finalInvoiceId} - ${domain}`
      : `Payment confirmation for Invoice #${finalInvoiceId}`;
    
    // Build detailed message with invoice information
    let ticketMessage = `=== PAYMENT CONFIRMATION ===\n`;
    ticketMessage += `Invoice ID: ${matchedInvoice.id}\n`;
    ticketMessage += `Invoice Number: ${matchedInvoice.invoicenum || 'N/A'}\n`;
    ticketMessage += `Invoice Total: ${matchedInvoice.total}\n`;
    ticketMessage += `Invoice Status: ${matchedInvoice.status}\n`;
    ticketMessage += `Due Date: ${matchedInvoice.duedate}\n`;
    
    if (domain) {
      ticketMessage += `Domain: ${domain}\n`;
    }
    
    if (fallbackUsed) {
      ticketMessage += `\n=== INVOICE RESOLUTION ===\n`;
      ticketMessage += `Requested Invoice ID: ${targetInvoiceId}\n`;
      ticketMessage += `Actual Invoice Used: ${finalInvoiceId}\n`;
      ticketMessage += `Reason: Requested invoice not found, using current unpaid invoice\n`;
    }
    
    // Add payment URL to ticket message if provided
    if (payment_url) {
      ticketMessage += `\n=== PAYMENT URL ===\n`;
      ticketMessage += `Payment URL: ${payment_url}\n`;
      ticketMessage += `Received at: ${new Date().toISOString()}\n`;
    }
    
    // Only add payment details section if user provided details
    if (details) {
      ticketMessage += `\n=== PAYMENT DETAILS ===\n`;
      ticketMessage += String(details);
    }
    
    const t = await openTicket({ 
      deptid, 
      deptname, 
      subject, 
      message: ticketMessage, 
      clientid: resolvedClientId, 
      priority: 'Medium',
      invoiceid: matchedInvoice.id
    });
    
    const ticketId = t.tid || t.ticketid || t.id;
    console.log('→ Billing ticket created:', ticketId, 'for invoice:', finalInvoiceId);
    
    // Build clean response
    let message = `Support ticket (#${ticketId}) created for payment confirmation of Invoice #${finalInvoiceId}.`;
    
    if (fallbackUsed) {
      message += ` Note: The requested invoice was not found, so we're processing your current unpaid invoice instead.`;
    }
    
    
    
    const response = { 
      success: true, 
      paid: false, 
      ticketId: ticketId,
      invoiceId: finalInvoiceId,
      message: message
    };
    
    if (fallbackUsed) {
      response.requestedInvoiceId = targetInvoiceId;
    }
    
    res.json(response);
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Triage an issue and create appropriate ticket
 */
exports.triageIssue = async (req, res, next) => {
  console.log('[POST /api/triageIssue]', { 
    clientId: req.body.clientId, 
    domain: req.body.domain, 
    issue: req.body.issue?.substring(0, 50) + '...' 
  });
  
  try {
    const { clientId, domain, issue } = req.body || {};
    
    if (!clientId || !domain || !issue) {
      console.log('✗ Missing required parameters');
      return res.status(400).json({ 
        success: false, 
        error: 'clientId, domain, issue required' 
      });
    }
    
    const statusResp = await getServiceForClient({ clientId, domain });
    
    if (!statusResp) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }
    
    const { toMessageStatus } = require('../utils/helpers');
    const status = toMessageStatus(statusResp.status);
    
    // If suspended, check for billing issues
    if (status === 'Suspended') {
      const unpaidInvoice = await findRelatedUnpaidInvoice(clientId, { 
        domain, 
        serviceId: statusResp.id 
      });
      const invoiceId = unpaidInvoice ? (unpaidInvoice.invoiceid || unpaidInvoice.id) : null;
      const amountDue = unpaidInvoice ? amountFromInvoice(unpaidInvoice) : null;
      
      console.log('→ Billing issue detected, Invoice:', invoiceId);
      return res.json({ 
        success: true, 
        resolution: 'billing', 
        invoiceId, 
        amountDue, 
        message: `Your service is suspended due to unpaid invoice #${invoiceId}. Please pay to restore service.` 
      });
    }
    
    // Build detailed ticket message with context
    const serviceName = statusResp.domain || statusResp.name || domain;
    const serviceId = statusResp.id;
    const productName = statusResp.productname || statusResp.product;
    const nextDueDate = statusResp.nextduedate || statusResp.nextinvoicedate;
    const serverIP = statusResp.dedicatedip || statusResp.assignedips;
    
    let ticketMessage = `=== ISSUE REPORTED ===
${issue}

=== SERVICE DETAILS ===
Domain/Service: ${serviceName}
Service ID: ${serviceId}
Status: ${status}`;
    
    if (productName) {
      ticketMessage += `\nProduct: ${productName}`;
    }
    
    if (nextDueDate) {
      ticketMessage += `\nNext Due Date: ${nextDueDate}`;
    }
    
    if (serverIP) {
      ticketMessage += `\nServer IP: ${serverIP}`;
    }
    
    ticketMessage += '\n\nPlease investigate this issue urgently.';
    
    const deptid = process.env.TECHSUPPORT_DEPTID;
    // Only use deptname if deptid is not provided (deptid takes priority)
    const deptname = deptid ? undefined : (process.env.TECHSUPPORT_DEPTNAME || 'Technical Support');
    
    const t = await openTicket({ 
      deptid, 
      deptname, 
      subject: `[${status}] Issue with ${serviceName}`, 
      message: ticketMessage, 
      clientid: clientId, 
      priority: 'High', 
      serviceid: statusResp.id 
    });
    
    const ticketId = t.tid || t.ticketid || t.id;
    console.log('→ Tech support ticket created:', ticketId);
    
    res.json({ 
      success: true, 
      resolution: 'tech_ticket', 
      ticketId: ticketId, 
      message: `I've opened a technical support ticket (#${ticketId}). Our team will investigate your issue.` 
    });
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};



/**
 * Create an order
 */
exports.createOrder = async (req, res, next) => {
  console.log('[POST /orders]', { 
    clientid: req.body.clientid, 
    pid: req.body.pid 
  });
  
  try {
    const data = await addOrder(req.body || {});
    console.log('→ Order created:', data.orderid, 'Invoice:', data.invoiceid);
    res.json({ 
      ok: true, 
      orderid: data.orderid, 
      invoiceid: data.invoiceid, 
      status: data.status, 
      raw: data 
    });
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Renew Service Endpoint
 * Handles both hosting service and domain renewals with proper validation
 * 
 * Workflow:
 * 1. Service Validation (Pre-check)
 * 2. Check for Existing Unpaid Invoices (Anti-Duplication)
 * 3. Create new order if no existing invoice found
 * 4. Error Handling for standard WHMCS errors
 */
exports.renewServiceEndpoint = async (req, res, next) => {
  console.log('[POST /api/renewservice]', { 
    clientId: req.body.clientId, 
    domain: req.body.domain, 
    number: req.body.number 
  });
  
  try {
    const { clientId, domain, number } = req.body || {};
    
    if (!clientId || !domain) {
      console.log('✗ Missing required parameters');
      return res.status(400).json({ 
        success: false, 
        error: 'clientId and domain are required' 
      });
    }
    
    // Step 1: Service Validation (Pre-check)
    console.log('→ Step 1: Service Validation');
    
    let serviceId = null;
    let domainId = null;
    let serviceData = null;
    let domainData = null;
    let isHostingService = false;
    let isDomainService = false;
    
    // Check for hosting service first
    try {
      const productsResponse = await getClientsProducts(clientId);
      const products = productsResponse.products?.product || [];
      const productArray = Array.isArray(products) ? products : (products ? [products] : []);
      
      serviceData = productArray.find(product => 
        product.domain === domain || 
        (product.customfields && product.customfields.customfield && 
         Array.isArray(product.customfields.customfield) && 
         product.customfields.customfield.some(field => field.value === domain))
      );
      
      if (serviceData) {
        serviceId = serviceData.id;
        isHostingService = true;
        console.log(`→ Found hosting service: ID ${serviceId}, Status: ${serviceData.status}`);
        
        // Validate hosting service status
        if (['Cancelled', 'Terminated'].includes(serviceData.status)) {
          console.log(`→ Service cannot be renewed, creating support ticket`);
          
          // Create support ticket for non-renewable service
          const ticketMessage = `=== SERVICE RENEWAL REQUEST - CANNOT BE PROCESSED ===
Client attempted to renew a ${serviceData.status.toLowerCase()} service.

=== SERVICE DETAILS ===
Domain: ${domain}
Service ID: ${serviceId}
Status: ${serviceData.status}
Product: ${serviceData.productname || serviceData.name || 'N/A'}
Next Due Date: ${serviceData.nextduedate || 'N/A'}

=== ISSUE SUMMARY ===
The client requested renewal for domain "${domain}" but the associated hosting service (ID: ${serviceId}) has a status of "${serviceData.status}". 

Services with Cancelled or Terminated status cannot be renewed through the standard renewal process.

=== REQUIRED ACTION ===
Please contact the client to discuss:
1. Service reactivation options
2. New service setup if needed
3. Data recovery possibilities (if applicable)
4. Alternative hosting solutions

This ticket was automatically generated from a renewal request.`;

          try {
            const deptid = process.env.BILLING_DEPTID;
            const deptname = deptid ? undefined : (process.env.BILLING_DEPTNAME || 'Billing');
            
            const ticket = await openTicket({
              deptid,
              deptname,
              subject: `[${serviceData.status}] Renewal Request - ${domain} (Service ID: ${serviceId})`,
              message: ticketMessage,
              clientid: clientId,
              priority: 'Medium',
              serviceid: serviceId
            });
            
            const ticketId = ticket.tid || ticket.ticketid || ticket.id;
            console.log(`→ Support ticket created: ${ticketId} for non-renewable service`);
            
            return res.status(400).json({
              success: false,
              error: 'Service cannot be renewed',
              message: `This service is ${serviceData.status} and cannot be renewed. A support ticket (#${ticketId}) has been created for our team to assist you with reactivation options.`,
              serviceId: serviceId,
              status: serviceData.status,
              ticketId: ticketId,
              contactSales: true
            });
          } catch (ticketError) {
            console.log(`→ Failed to create support ticket: ${ticketError.message}`);
            
            // Fallback response if ticket creation fails
            return res.status(400).json({
              success: false,
              error: 'Service cannot be renewed',
              message: `This service is ${serviceData.status} and cannot be renewed. Please contact sales for assistance.`,
              serviceId: serviceId,
              status: serviceData.status,
              contactSales: true
            });
          }
        }
        
        if (serviceData.status === 'Suspended') {
          console.log(`→ Service is suspended, noting for invoice check`);
        }
      }
    } catch (err) {
      console.log(`→ Error checking hosting services: ${err.message}`);
    }
    
    // Check for domain registration if no hosting service found
    if (!isHostingService) {
      try {
        const domainsResponse = await getClientsDomains(clientId);
        const domains = domainsResponse.domains?.domain || [];
        const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
        
        domainData = domainArray.find(dom => 
          dom.domain === domain || dom.domainname === domain
        );
        
        if (domainData) {
          domainId = domainData.id;
          isDomainService = true;
          console.log(`→ Found domain registration: ID ${domainId}, Status: ${domainData.status}`);
          
          // Validate domain status
          if (domainData.status === 'Cancelled') {
            console.log(`→ Domain cannot be renewed, creating support ticket`);
            
            // Create support ticket for cancelled domain
            const ticketMessage = `=== DOMAIN RENEWAL REQUEST - CANNOT BE PROCESSED ===
Client attempted to renew a cancelled domain.

=== DOMAIN DETAILS ===
Domain: ${domain}
Domain ID: ${domainId}
Status: ${domainData.status}
Registrar: ${domainData.registrar || 'N/A'}
Expiry Date: ${domainData.expirydate || domainData.nextduedate || 'N/A'}

=== ISSUE SUMMARY ===
The client requested renewal for domain "${domain}" but the domain registration has a status of "Cancelled". 

Cancelled domains cannot be renewed through the standard renewal process and may require special handling or re-registration.

=== REQUIRED ACTION ===
Please contact the client to discuss:
1. Domain re-registration options
2. Domain transfer possibilities
3. Alternative domain suggestions
4. Recovery options if the domain is still within the redemption period

This ticket was automatically generated from a renewal request.`;

            try {
              const deptid = process.env.BILLING_DEPTID;
              const deptname = deptid ? undefined : (process.env.BILLING_DEPTNAME || 'Billing');
              
              const ticket = await openTicket({
                deptid,
                deptname,
                subject: `[Cancelled] Domain Renewal Request - ${domain} (Domain ID: ${domainId})`,
                message: ticketMessage,
                clientid: clientId,
                priority: 'Medium'
              });
              
              const ticketId = ticket.tid || ticket.ticketid || ticket.id;
              console.log(`→ Support ticket created: ${ticketId} for cancelled domain`);
              
              return res.status(400).json({
                success: false,
                error: 'Domain cannot be renewed',
                message: `This domain is cancelled and cannot be renewed. A support ticket (#${ticketId}) has been created for our team to assist you with re-registration or recovery options.`,
                domainId: domainId,
                status: domainData.status,
                ticketId: ticketId,
                contactSales: true
              });
            } catch (ticketError) {
              console.log(`→ Failed to create support ticket: ${ticketError.message}`);
              
              // Fallback response if ticket creation fails
              return res.status(400).json({
                success: false,
                error: 'Domain cannot be renewed',
                message: 'This domain is cancelled and cannot be renewed. Please contact sales for assistance.',
                domainId: domainId,
                status: domainData.status,
                contactSales: true
              });
            }
          }
          
          // Capture expiry date for domains
          const expiryDate = domainData.expirydate || domainData.nextduedate;
          if (expiryDate) {
            console.log(`→ Domain expiry date: ${expiryDate}`);
          }
        }
      } catch (err) {
        console.log(`→ Error checking domains: ${err.message}`);
      }
    }
    
    // If neither service nor domain found
    if (!isHostingService && !isDomainService) {
      return res.status(404).json({
        success: false,
        error: 'Service or domain not found',
        message: `No hosting service or domain registration found for ${domain} in your account.`
      });
    }
    
    // Step 2: Check for Existing Unpaid Invoices (Anti-Duplication)
    console.log('→ Step 2: Checking for existing unpaid invoices');
    
    try {
      const invoicesResponse = await getInvoices({ 
        userid: clientId, 
        status: 'Unpaid',
        limitnum: 50 // Check more invoices to be thorough
      });
      
      const invoices = invoicesResponse.invoices?.invoice || [];
      const invoiceArray = Array.isArray(invoices) ? invoices : (invoices ? [invoices] : []);
      
      // Check each invoice for matching items
      for (const invoice of invoiceArray) {
        const items = invoice.items?.item || [];
        const itemArray = Array.isArray(items) ? items : (items ? [items] : []);
        
        for (const item of itemArray) {
          let isMatch = false;
          
          if (isHostingService) {
            // Hosting: Check if relid matches serviceId AND type matches "Hosting"
            if (String(item.relid) === String(serviceId) && item.type === 'Hosting') {
              isMatch = true;
            }
          } else if (isDomainService) {
            // Domain: Check if description contains domain name or relid/domainid matches
            if (item.description && item.description.toLowerCase().includes(domain.toLowerCase())) {
              isMatch = true;
            } else if (String(item.relid) === String(domainId) || String(item.domainid) === String(domainId)) {
              isMatch = true;
            }
          }
          
          if (isMatch) {
            console.log(`→ Found existing unpaid invoice: ${invoice.invoiceid}`);
            
            return res.json({
              success: true,
              existingInvoice: true,
              invoiceId: invoice.invoiceid,
              balance: invoice.balance || invoice.total,
              dueDate: invoice.duedate,
              message: `An unpaid renewal invoice already exists: Invoice #${invoice.invoiceid} for ${invoice.balance || invoice.total} due on ${invoice.duedate}. Please pay this invoice to complete the renewal.`
            });
          }
        }
      }
      
      console.log('→ No existing unpaid invoices found');
    } catch (err) {
      console.log(`→ Error checking invoices: ${err.message}`);
      // Continue with order creation even if invoice check fails
    }
    
    // Step 3: Create new order using AddOrder
    console.log('→ Step 3: Creating new renewal order');
    
    const paymentMethod = 'banktransfer'; // Default payment method
    let orderParams = {
      clientid: clientId,
      paymentmethod: paymentMethod
    };
    
    if (isHostingService) {
      // For hosting services, use servicerenewals
      orderParams.servicerenewals = [serviceId];
      console.log(`→ Creating hosting service renewal order for service ${serviceId}`);
    } else if (isDomainService) {
      // For domains, use domainrenewals with period
      const period = number || 1; // Default to 1 year if no period specified
      orderParams.domainrenewals = { [domain]: period };
      console.log(`→ Creating domain renewal order for ${domain} (${period} year${period > 1 ? 's' : ''})`);
    }
    
    try {
      const orderResult = await addOrder(orderParams);
      
      if (orderResult && orderResult.result === 'success') {
        console.log(`→ Order created successfully: ${orderResult.orderid}`);
        
        return res.json({
          success: true,
          existingInvoice: false,
          orderId: orderResult.orderid,
          invoiceId: orderResult.invoiceid,
          message: `Renewal order created successfully. Invoice #${orderResult.invoiceid} has been generated for your ${isHostingService ? 'hosting service' : 'domain'} renewal.`
        });
      } else {
        // Handle WHMCS API errors
        const errorMessage = orderResult.message || 'Failed to create renewal order';
        console.log(`→ AddOrder failed: ${errorMessage}`);
        
        // Check for standard WHMCS errors and provide user-friendly messages
        if (errorMessage.includes('cannot be renewed at this time')) {
          console.log(`→ Renewal not available, creating support ticket`);
          
          // Create support ticket for renewal restriction
          const ticketMessage = `=== RENEWAL REQUEST - NOT AVAILABLE ===
Client attempted to renew ${isHostingService ? 'a hosting service' : 'a domain'} but WHMCS returned an error.

=== ${isHostingService ? 'SERVICE' : 'DOMAIN'} DETAILS ===
Domain: ${domain}
${isHostingService ? `Service ID: ${serviceId}` : `Domain ID: ${domainId}`}
${isHostingService ? `Status: ${serviceData?.status || 'N/A'}` : `Status: ${domainData?.status || 'N/A'}`}
${isHostingService ? `Product: ${serviceData?.productname || 'N/A'}` : `Registrar: ${domainData?.registrar || 'N/A'}`}
${isHostingService ? `Next Due Date: ${serviceData?.nextduedate || 'N/A'}` : `Expiry Date: ${domainData?.expirydate || domainData?.nextduedate || 'N/A'}`}

=== ERROR DETAILS ===
WHMCS Error: ${errorMessage}

=== ISSUE SUMMARY ===
The client requested renewal for "${domain}" but WHMCS returned an error indicating the ${isHostingService ? 'service' : 'domain'} cannot be renewed at this time.

This could be due to:
- Not within the renewal window
- Payment restrictions
- Account limitations
- ${isHostingService ? 'Service-specific restrictions' : 'Domain registry restrictions'}

=== REQUIRED ACTION ===
Please investigate and contact the client to:
1. Verify renewal eligibility
2. Check for any account restrictions
3. Manually process the renewal if appropriate
4. Provide alternative solutions if needed

This ticket was automatically generated from a renewal request.`;

          try {
            const deptid = process.env.BILLING_DEPTID;
            const deptname = deptid ? undefined : (process.env.BILLING_DEPTNAME || 'Billing');
            
            const ticket = await openTicket({
              deptid,
              deptname,
              subject: `[Renewal Issue] ${isHostingService ? 'Service' : 'Domain'} Renewal Not Available - ${domain}`,
              message: ticketMessage,
              clientid: clientId,
              priority: 'Medium',
              ...(isHostingService && serviceId ? { serviceid: serviceId } : {})
            });
            
            const ticketId = ticket.tid || ticket.ticketid || ticket.id;
            console.log(`→ Support ticket created: ${ticketId} for renewal restriction`);
            
            return res.status(400).json({
              success: false,
              error: 'Renewal not available',
              message: `${isHostingService ? 'Service' : 'Domain'} cannot be renewed at this time. A support ticket (#${ticketId}) has been created for our team to investigate and assist you.`,
              ticketId: ticketId
            });
          } catch (ticketError) {
            console.log(`→ Failed to create support ticket: ${ticketError.message}`);
            
            // Fallback response if ticket creation fails
            return res.status(400).json({
              success: false,
              error: 'Renewal not available',
              message: `${isHostingService ? 'Service' : 'Domain'} cannot be renewed at this time. This may be because it's not within the renewal window or there are other restrictions. Please contact support for assistance.`
            });
          }
        }
        
        return res.status(400).json({
          success: false,
          error: 'Order creation failed',
          message: `Failed to create renewal order: ${errorMessage}`
        });
      }
    } catch (orderError) {
      console.log(`→ AddOrder exception: ${orderError.message}`);
      
      // Handle specific WHMCS error patterns
      if (orderError.message.includes('Domain cannot be renewed at this time')) {
        console.log(`→ Domain renewal exception, creating support ticket`);
        
        // Create support ticket for domain renewal exception
        const ticketMessage = `=== DOMAIN RENEWAL REQUEST - EXCEPTION OCCURRED ===
Client attempted to renew a domain but an exception occurred during the AddOrder process.

=== DOMAIN DETAILS ===
Domain: ${domain}
${isDomainService ? `Domain ID: ${domainId}` : 'Domain ID: N/A (not found in client domains)'}
${isDomainService ? `Status: ${domainData?.status || 'N/A'}` : 'Status: N/A'}
${isDomainService ? `Registrar: ${domainData?.registrar || 'N/A'}` : 'Registrar: N/A'}
${isDomainService ? `Expiry Date: ${domainData?.expirydate || domainData?.nextduedate || 'N/A'}` : 'Expiry Date: N/A'}
Renewal Period: ${number || 1} year(s)

=== ERROR DETAILS ===
Exception Message: ${orderError.message}

=== ISSUE SUMMARY ===
The client requested renewal for domain "${domain}" but an exception occurred during the WHMCS AddOrder API call.

The specific error indicates the domain cannot be renewed at this time, which could be due to:
- Domain registry restrictions
- Renewal timing limitations
- Payment or account issues
- Technical problems with the domain registration

=== REQUIRED ACTION ===
Please investigate and contact the client to:
1. Check domain status with the registry
2. Verify renewal eligibility and timing
3. Manually process the renewal if appropriate
4. Resolve any underlying issues

This ticket was automatically generated from a renewal request.`;

        try {
          const deptid = process.env.BILLING_DEPTID;
          const deptname = deptid ? undefined : (process.env.BILLING_DEPTNAME || 'Billing');
          
          const ticket = await openTicket({
            deptid,
            deptname,
            subject: `[Exception] Domain Renewal Failed - ${domain}`,
            message: ticketMessage,
            clientid: clientId,
            priority: 'High'
          });
          
          const ticketId = ticket.tid || ticket.ticketid || ticket.id;
          console.log(`→ Support ticket created: ${ticketId} for domain renewal exception`);
          
          return res.status(400).json({
            success: false,
            error: 'Domain renewal not available',
            message: `Domain cannot be renewed at this time. A support ticket (#${ticketId}) has been created for our team to investigate and resolve this issue.`,
            ticketId: ticketId
          });
        } catch (ticketError) {
          console.log(`→ Failed to create support ticket: ${ticketError.message}`);
          
          // Fallback response if ticket creation fails
          return res.status(400).json({
            success: false,
            error: 'Domain renewal not available',
            message: 'Domain cannot be renewed at this time. This may be due to renewal restrictions or timing. Please contact support for assistance.'
          });
        }
      }
      
      return res.status(500).json({
        success: false,
        error: 'Renewal order failed',
        message: `An error occurred while creating the renewal order: ${orderError.message}`
      });
    }
    
  } catch (err) {
    console.log('✗ Error in renewservice:', err.message);
    next(err);
  }
};

/**
 * Helper function to resolve domain to client (for confirmPayment)
 */
async function resolveDomainToClient(domain) {
  const { callApi } = require('../services/whmcsService');
  
  // Try GetClientsDomains first
  const domainsData = await callApi('GetClientsDomains', { domain });
  
  if (domainsData && domainsData.domains) {
    const domainsRaw = domainsData.domains;
    const domains = domainsRaw.domain || domainsRaw;
    const domainArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);
    
    if (domainArray.length > 0) {
      const uniqueUserIds = [...new Set(domainArray.map(d => String(d.userid)))];
      
      if (uniqueUserIds.length > 1) {
        throw new Error('Multiple clients found for this domain');
      }
      
      return { clientId: uniqueUserIds[0], source: 'domains' };
    }
  }
  
  // Fallback: Try GetClientsProducts
  const productsData = await callApi('GetClientsProducts', { domain });
  
  if (productsData && productsData.products) {
    const productsRaw = productsData.products;
    const products = productsRaw.product || productsRaw;
    const productArray = Array.isArray(products) ? products : (products ? [products] : []);
    
    if (productArray.length > 0) {
      const uniqueUserIds = [...new Set(productArray.map(p => String(p.userid || p.clientid)))];
      
      if (uniqueUserIds.length > 1) {
        throw new Error('Multiple clients found for this domain');
      }
      
      return { clientId: uniqueUserIds[0], source: 'products' };
    }
  }
  
  throw new Error('No client found with that domain');
}

/**
 * Helper function to resolve email to client (for confirmPayment)
 */
async function resolveEmailToClient(email) {
  const { getClientsDetails } = require('../services/whmcsService');
  
  const clientData = await getClientsDetails({ email });
  
  if (clientData && clientData.userid) {
    return { clientId: String(clientData.userid), source: 'email' };
  }
  
  throw new Error('No client found with that email address');
}

/**
 * Helper function to validate client phone number (for confirmPayment)
 */
async function validateClientPhone(clientId, providedPhone) {
  const { getClientsDetails } = require('../services/whmcsService');
  
  try {
    const clientData = await getClientsDetails({ clientid: clientId });
    
    if (!clientData) {
      throw new Error('Client not found');
    }
    
    const registeredPhone = clientData.phonenumber || clientData.phone;
    
    if (!registeredPhone) {
      return { valid: true, reason: 'no_phone_on_file' };
    }
    
    // Normalize phone numbers for comparison
    const normalizePhone = (phone) => {
      if (!phone) return '';
      return phone.replace(/[\s\-\(\)\+]/g, '').replace(/^0+/, '');
    };
    
    const normalizedProvided = normalizePhone(providedPhone);
    const normalizedRegistered = normalizePhone(registeredPhone);
    
    // Check if phones match
    const isMatch = normalizedProvided === normalizedRegistered ||
                   normalizedProvided.endsWith(normalizedRegistered.slice(-10)) ||
                   normalizedRegistered.endsWith(normalizedProvided.slice(-10));
    
    return {
      valid: isMatch,
      registeredPhone: registeredPhone,
      reason: isMatch ? 'phone_match' : 'phone_mismatch'
    };
    
  } catch (error) {
    throw new Error(`Phone validation failed: ${error.message}`);
  }
}

/**
 * Helper function to mask phone number (for confirmPayment)
 */
function maskPhoneNumber(phone) {
  if (!phone || phone.length < 4) return phone;
  
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  const visibleStart = Math.min(3, Math.floor(cleaned.length / 3));
  const visibleEnd = Math.min(3, Math.floor(cleaned.length / 4));
  
  if (cleaned.length <= visibleStart + visibleEnd) {
    return phone;
  }
  
  const start = cleaned.substring(0, visibleStart);
  const end = cleaned.substring(cleaned.length - visibleEnd);
  const middle = '*'.repeat(Math.min(3, cleaned.length - visibleStart - visibleEnd));
  
  return start + middle + end;
}

module.exports = exports;
