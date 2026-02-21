const { getInvoice, getInvoices, summarizeInvoice } = require('../services/whmcsService');
const { amountFromInvoice, findRelatedUnpaidInvoice, toMessageStatus } = require('../utils/helpers');
const { normalizePhone, phonesMatch, maskPhone } = require('../utils/phoneNormalizer');

/**
 * Get single invoice by ID
 */
exports.getInvoiceById = async (req, res, next) => {
  console.log(`[GET /invoices/${req.params.invoiceId}]`);
  try {
    const data = await getInvoice(req.params.invoiceId);
    
    if (!data || !data.invoiceid) {
      console.log('✗ Invoice not found');
      return res.status(404).json({ 
        success: false, 
        error: "I couldn't find an invoice with that number. Please check the ID." 
      });
    }
    
    const status = toMessageStatus(data.status);
    const balance = data.balance || '0.00';
    const total = data.total || balance;
    const dueDate = data.duedate || null;
    const paidDate = data.datepaid || data.date_paid || null;
    const invoiceId = data.invoiceid || data.id;
    const items = data.items?.item || [];
    const notes = data.notes || '';
    
    // Check if invoice is overdue
    let isOverdue = false;
    if (dueDate && status !== 'Paid' && status !== 'Cancelled' && status !== 'Refunded') {
      const dueDateObj = new Date(dueDate);
      const now = new Date();
      dueDateObj.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      isOverdue = dueDateObj < now;
    }
    
    // Build user-friendly message based on status
    let message;
    if (status === 'Paid') {
      message = paidDate 
        ? `Invoice #${invoiceId} was paid on ${paidDate}. Thank you for your payment!` 
        : `Invoice #${invoiceId} is marked as Paid.`;
    } else if (status === 'Cancelled') {
      message = `Invoice #${invoiceId} has been cancelled and is no longer due.`;
    } else if (status === 'Refunded') {
      message = `Invoice #${invoiceId} has been refunded. No payment is required.`;
    } else if (isOverdue) {
      message = `Invoice #${invoiceId} is overdue. The balance of ${data.currencyprefix || 'PKR '}${balance} was due on ${dueDate}. Please pay as soon as possible to avoid service interruption.`;
    } else {
      message = `Invoice #${invoiceId} is ${status}. Balance due: ${data.currencyprefix || 'PKR '}${balance}${dueDate ? ' by ' + dueDate : ''}.`;
    }
    
    const response = { 
      success: true,
      invoiceId: invoiceId,
      status: status,
      balance: balance,
      dueDate: dueDate,
      message: message
    };
    
    if (status === 'Paid' && paidDate) {
      response.paidDate = paidDate;
    }
    if (isOverdue) {
      response.isOverdue = true;
    }
    if (notes) {
      response.notes = notes;
    }
    
    console.log('→ Invoice:', invoiceId, 'Status:', status, isOverdue ? '(OVERDUE)' : '', 'Balance:', balance);
    res.json(response);
  } catch (err) {
    console.log('✗ Error:', err.message);
    // Don't reveal if invoice exists for security - just say not found
    if (err.message.includes('not found') || err.message.includes('Invalid')) {
      return res.status(404).json({ 
        success: false, 
        error: "I couldn't find an invoice with that number. Please check the ID." 
      });
    }
    next(err);
  }
};

/**
 * Get list of invoices with filters
 * Supports both clientId and email parameters
 */
exports.getInvoicesList = async (req, res, next) => {
  console.log('[GET /invoices]', req.query);
  try {
    const { clientId, email, status, limitstart, limitnum } = req.query;
    
    let resolvedClientId = clientId;
    
    // If email provided instead of clientId, resolve it
    if (!resolvedClientId && email) {
      console.log('→ Resolving clientId from email:', email);
      try {
        const { getClientsDetails } = require('../services/whmcsService');
        const clientData = await getClientsDetails({ email });
        
        if (clientData && clientData.userid) {
          resolvedClientId = String(clientData.userid);
          console.log('→ Resolved clientId:', resolvedClientId);
        } else {
          return res.status(404).json({
            success: false,
            error: 'No client found with that email address'
          });
        }
      } catch (err) {
        console.log('✗ Email resolution failed:', err.message);
        return res.status(404).json({
          success: false,
          error: 'No client found with that email address'
        });
      }
    }
    
    // Build WHMCS API parameters
    const params = {};
    if (resolvedClientId) params.userid = resolvedClientId;
    if (status) params.status = status;
    if (limitstart) params.limitstart = limitstart;
    if (limitnum) params.limitnum = limitnum;
    
    const data = await getInvoices(params);
    console.log('→ Found:', data.totalresults || 0, 'invoices');
    res.json({ ok: true, ...data });
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Simple email validation helper
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Invoice lookup with parallel domain/email validation and phone as second-level validation
 * Also supports invoice-only lookup when domain and email are empty
 */
exports.invoiceLookup = async (req, res, next) => {
  console.log('[POST /api/invoiceLookup]', { 
    clientId: req.body.clientId, 
    invoiceId: req.body.invoiceId, 
    domain: req.body.domain,
    email: req.body.email ? '[PROVIDED]' : undefined,
    phone: req.body.phone ? '[PROVIDED]' : undefined,
    resolvedFrom: req.body._resolvedFrom
  });
  
  try {
    const { clientId, invoiceId, domain, email, phone } = req.body || {};
    
    // Validate email if provided (even if empty string)
    if (email !== undefined && email !== null && email !== '') {
      if (!isValidEmail(email)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid email format provided' 
        });
      }
    }
    
    // Validate invoiceId format if provided
    let targetInvoiceId = invoiceId;
    if (targetInvoiceId !== undefined && targetInvoiceId !== null && targetInvoiceId !== '' && targetInvoiceId !== 0 && targetInvoiceId !== '0') {
      const numericId = String(targetInvoiceId);
      if (!numericId.match(/^\d+$/) || parseInt(numericId) <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid invoiceId format. Invoice ID must be a positive number.' });
      }
    } else {
      // Empty, null, undefined, 0, or '0' invoice ID - treat as no invoice provided
      if (targetInvoiceId === 0 || targetInvoiceId === '0') {
        console.log('→ Invoice ID 0 provided - treating as null (no specific invoice requested)');
      }
      targetInvoiceId = null;
    }
    
    let resolvedClientId = clientId;
    let resolvedFrom = req.body._resolvedFrom;
    
    // Check if invoice ID is 5 digits (paid invoice number format in WHMCS)
    const isFiveDigitInvoice = targetInvoiceId && String(targetInvoiceId).length === 5;
    
    // PRIORITY: When domain/email is provided with a 5-digit invoice, prioritize domain/email resolution
    // This is because 5-digit invoice numbers can exist for multiple clients in WHMCS
    const shouldPrioritizeDomainEmail = isFiveDigitInvoice && (domain || email);
    
    if (shouldPrioritizeDomainEmail) {
      console.log('→ 5-digit invoice with domain/email - will resolve client from domain/email first, then validate invoice');
    } else if (targetInvoiceId && !domain && !email) {
      // Only invoice provided (no domain/email) - resolve from invoice
      console.log('→ Invoice provided without domain/email - attempting to resolve client from invoice:', targetInvoiceId);
      
      try {
        const invoice = await getInvoice(targetInvoiceId);
        
        if (invoice && invoice.invoiceid) {
          resolvedClientId = String(invoice.userid || invoice.user_id || invoice.clientid);
          resolvedFrom = 'invoice';
          console.log('→ Client resolved from invoice:', resolvedClientId);
        }
      } catch (err) {
        console.log('→ Invoice lookup failed:', err.message);
        return res.status(404).json({
          success: false,
          error: 'Invoice not found. Please verify the invoice number.'
        });
      }
    }
    
    // Resolve client from domain OR email (in parallel if both provided)
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
      
      // Determine which resolution to use
      if (domainResult && emailResult) {
        // Both resolved - check if they match
        if (domainResult.clientId === emailResult.clientId) {
          resolvedClientId = domainResult.clientId;
          resolvedFrom = 'domain+email';
          console.log('→ Client resolved from both domain and email (matching):', resolvedClientId);
        } else {
          // Domain and email resolve to different clients - prioritize domain
          console.log('→ Domain and email resolve to different clients - prioritizing domain');
          resolvedClientId = domainResult.clientId;
          resolvedFrom = 'domain_priority';
        }
      } else if (domainResult) {
        resolvedClientId = domainResult.clientId;
        resolvedFrom = 'domain';
        console.log('→ Client resolved from domain:', resolvedClientId);
      } else if (emailResult) {
        resolvedClientId = emailResult.clientId;
        resolvedFrom = 'email';
        console.log('→ Client resolved from email:', resolvedClientId);
      } else {
        // Neither domain nor email resolved successfully
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
            error: `Please contact from ${maskedPhone} or change the phone number from your client area to ${phone} `,
            phoneValidationFailed: true,
            resolvedFrom: resolvedFrom
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
      // Phone provided but no client resolved - this shouldn't happen at this point
      // since we should have resolved the client above
      return res.status(400).json({
        success: false,
        error: 'Unable to identify client for phone validation. Please verify your domain or email.'
      });
    }
    
    // Validate that we have a resolved client
    if (!resolvedClientId) {
      if (targetInvoiceId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Unable to identify client from invoice. Please provide domain or email address.' 
        });
      } else if (phone) {
        return res.status(400).json({ 
          success: false, 
          error: 'Please provide either a domain name, email address, or invoice number along with phone number for validation.' 
        });
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Please provide either a domain name, email address, or invoice number to identify your account.' 
        });
      }
    }
    
    let invoice;
    if (targetInvoiceId) {
      // When domain/email is provided with invoice ID, search through client's invoices
      // This is especially important for 5-digit invoice numbers which can exist for multiple clients
      if (resolvedClientId && (domain || email)) {
        console.log('→ Searching through client invoices for invoice ID/NUM:', targetInvoiceId);
        
        try {
          const { getInvoices } = require('../services/whmcsService');
          
          // Get all invoices for this client
          const allInvoices = await getInvoices({ 
            userid: resolvedClientId, 
            limitnum: 999
          });
          
          const invoiceArray = allInvoices.invoices?.invoice || allInvoices.invoices?.invoices || [];
          const invoices = Array.isArray(invoiceArray) ? invoiceArray : (invoiceArray ? [invoiceArray] : []);
          
          console.log(`→ Searching through ${invoices.length} invoices for client ${resolvedClientId}`);
          
          // Search for invoice by BOTH invoiceid AND invoicenum fields
          // This handles WHMCS's behavior where paid invoices get 5-digit numbers
          const matchingInvoice = invoices.find(inv => {
            const invId = String(inv.id || inv.invoiceid || '');
            const invNum = String(inv.invoicenum || inv.invoice_num || '');
            const targetId = String(targetInvoiceId);
            
            const idMatch = invId === targetId;
            const numMatch = invNum === targetId;
            
            if (idMatch || numMatch) {
              console.log(`→ Found matching invoice: ID=${invId}, NUM=${invNum}, Target=${targetId}, IDMatch=${idMatch}, NUMMatch=${numMatch}`);
              return true;
            }
            return false;
          });
          
          if (matchingInvoice) {
            const invoiceId = matchingInvoice.id || matchingInvoice.invoiceid;
            invoice = await getInvoice(invoiceId);
            console.log('✓ Invoice found and validated:', invoice.invoiceid || invoice.id, 'Status:', invoice.status);
          } else {
            console.log('→ No matching invoice found for this client');
          }
        } catch (err) {
          console.log('✗ Error searching client invoices:', err.message);
        }
      } else {
        // No domain/email provided - try direct invoice lookup
        try {
          invoice = await getInvoice(targetInvoiceId);
          console.log('→ Invoice fetched:', invoice.invoiceid || invoice.id, 'Owner:', invoice.userid || invoice.clientid);
          
          // Validate ownership if we have a resolved client
          if (resolvedClientId) {
            const ownerId = String(invoice.userid || invoice.user_id || invoice.clientid);
            if (String(ownerId) !== String(resolvedClientId)) {
              console.log('✗ Invoice ownership mismatch - invoice belongs to different client');
              return res.status(403).json({
                success: false,
                error: 'The provided invoice does not belong to the identified account. Please verify your information.'
              });
            }
          }
        } catch (err) {
          console.log('✗ Invoice fetch failed:', err.message);
        }
      }
    }
    
    // If still no invoice found and no specific ID was provided, search for unpaid invoices as fallback
    if (!invoice && !targetInvoiceId) {
      console.log('→ No specific invoice ID provided, searching for unpaid invoices for client:', resolvedClientId);
      
      try {
        const { getInvoices } = require('../services/whmcsService');
        const unpaidInvoices = await getInvoices({ 
          userid: resolvedClientId, 
          status: 'Unpaid', 
          limitnum: 1 
        });
        
        const invoiceArray = unpaidInvoices.invoices?.invoice || unpaidInvoices.invoices?.invoices || [];
        const invoices = Array.isArray(invoiceArray) ? invoiceArray : (invoiceArray ? [invoiceArray] : []);
        
        if (invoices.length > 0) {
          // Get the first unpaid invoice
          const firstInvoice = invoices[0];
          const invoiceId = firstInvoice.id || firstInvoice.invoiceid;
          
          if (invoiceId) {
            invoice = await getInvoice(invoiceId);
            console.log('→ Found unpaid invoice for client:', invoice.invoiceid || invoice.id);
          }
        } else if (domain && domain.trim() !== '') {
          // Only try domain-specific search if no general unpaid invoices found AND domain is valid
          console.log('→ No general unpaid invoices found, trying domain-specific search for:', domain);
          const found = await findRelatedUnpaidInvoice(resolvedClientId, { domain });
          if (found) {
            invoice = found;
            console.log('→ Found unpaid invoice via domain:', found.invoiceid || found.id);
          }
        }
      } catch (err) {
        console.log('✗ Error searching for unpaid invoices:', err.message);
      }
    }
    
    if (!invoice) {
      // No invoice found - provide helpful response based on what was requested
      if (targetInvoiceId) {
        // Specific invoice ID was provided but not found after searching all invoices
        console.log('→ Specific invoice ID not found in all invoices for this client:', targetInvoiceId);
        return res.status(404).json({
          success: false,
          error: 'Invoice not found.',
          message: `Invoice #${targetInvoiceId} was not found for this account. Please verify the invoice number or check if it belongs to a different account.`
        });
      } else {
        // No specific invoice ID provided, searched for unpaid invoices but none found
        console.log('→ No unpaid invoices found for client:', resolvedClientId);
        
        if (domain) {
          // Domain-based search found no unpaid invoices
          return res.json({ 
            success: false, 
            error: 'No unpaid invoices found.',
            message: 'There are no unpaid invoices for this service. WHMCS will automatically generate a renewal invoice when the service is due (typically 7-14 days before the due date).'
          });
        } else {
          // General search found no unpaid invoices
          return res.json({ 
            success: false, 
            error: 'No unpaid invoices found.',
            message: 'There are no unpaid invoices for this account. All invoices appear to be paid or no invoices exist for this account.'
          });
        }
      }
    }
    
    // At this point we have a valid invoice that belongs to the resolved client
    console.log('✓ Invoice found and validated:', invoice.invoiceid || invoice.id);
    
    const status = toMessageStatus(invoice.status);
    const amount = amountFromInvoice(invoice);
    const dueDate = invoice.duedate || null;
    const paidDate = invoice.datepaid || invoice.date_paid || null;
    const invoiceIdOut = invoice.invoiceid || invoice.id;
    
    // Check if invoice is overdue
    let isOverdue = false;
    if (dueDate && status !== 'Paid' && status !== 'Cancelled' && status !== 'Refunded') {
      const dueDateObj = new Date(dueDate);
      const now = new Date();
      // Set time to start of day for fair comparison
      dueDateObj.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      isOverdue = dueDateObj < now;
    }
    
    // Build message based on status and overdue state
    let message;
    if (status === 'Paid') {
      message = paidDate 
        ? `Invoice #${invoiceIdOut} was paid on ${paidDate}.` 
        : `Invoice #${invoiceIdOut} is Paid.`;
    } else if (status === 'Cancelled') {
      message = `Invoice #${invoiceIdOut} has been cancelled and is no longer due.`;
    } else if (status === 'Refunded') {
      message = `Invoice #${invoiceIdOut} has been refunded. No payment is required.`;
    } else if (isOverdue) {
      message = `Invoice #${invoiceIdOut} is overdue. The balance of ${amount} was due on ${dueDate}. Please pay as soon as possible to avoid service interruption.`;
    } else {
      message = `Invoice #${invoiceIdOut} is ${status}, with a balance of ${amount} due${dueDate ? ' by ' + dueDate : ''}.`;
    }
    
    // Add information if original invoice ID was found via comprehensive search
    if (targetInvoiceId && String(targetInvoiceId) !== String(invoiceIdOut)) {
      message += ` Note: Found invoice #${invoiceIdOut} matching your request for #${targetInvoiceId}.`;
    }
    
    const response = { 
      success: true, 
      invoiceId: invoiceIdOut, 
      status, 
      amount, 
      dueDate, 
      message
    };
    
    if (status === 'Paid' && paidDate) {
      response.paidDate = paidDate;
    }
    if (isOverdue) {
      response.isOverdue = true;
    }
    if (targetInvoiceId && String(targetInvoiceId) !== String(invoiceIdOut)) {
      response.requestedInvoiceId = targetInvoiceId;
    }
    
    console.log('→ Invoice:', response.invoiceId, 'Status:', response.status, isOverdue ? '(OVERDUE)' : '', 'Amount:', amount);
    res.json(response);
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Helper function to resolve domain to client
 */
async function resolveDomainToClient(domain) {
  const { callApi } = require('../services/whmcsService');
  
  // Try GetClientsDomains first (more specific for domains)
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
  
  // Fallback: Try GetClientsProducts with domain parameter
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
 * Helper function to resolve email to client
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
 * Helper function to validate client phone number
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
      // No phone number on file - allow access
      return { valid: true, reason: 'no_phone_on_file' };
    }
    
    // Use the phone normalizer utility for consistent validation
    const isMatch = phonesMatch(registeredPhone, providedPhone);
    
    console.log(`→ Phone validation: Registered=${normalizePhone(registeredPhone).substring(0, 3)}***, Provided=${normalizePhone(providedPhone).substring(0, 3)}***, Match=${isMatch}`);
    
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
 * Helper function to mask phone number
 */
function maskPhoneNumber(phone) {
  if (!phone || phone.length < 4) return phone;
  
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  const visibleStart = Math.min(3, Math.floor(cleaned.length / 3));
  const visibleEnd = Math.min(3, Math.floor(cleaned.length / 4));
  
  if (cleaned.length <= visibleStart + visibleEnd) {
    return phone; // Too short to mask meaningfully
  }
  
  const start = cleaned.substring(0, visibleStart);
  const end = cleaned.substring(cleaned.length - visibleEnd);
  const middle = '*'.repeat(Math.min(3, cleaned.length - visibleStart - visibleEnd));
  
  return start + middle + end;
}

module.exports = exports;
