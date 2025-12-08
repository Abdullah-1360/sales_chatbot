const { 
  genInvoices,
  getInvoice,
  getInvoices,
  openTicket,
  addOrder 
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
      
      return res.status(400).json({ 
        success: false, 
        error: 'Domain is not within the renewal window.',
        domainId: dom.id,
        domain: dom.domain || dom.domainname,
        message: 'System will automatically generate the renewal invoice when the domain is within the renewal window.'
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
 * Confirm payment for an invoice
 */
exports.confirmPayment = async (req, res, next) => {
  console.log('[POST /api/confirmPayment]', { 
    clientId: req.body.clientId, 
    invoiceId: req.body.invoiceId,
    hasImage: !!req.body.image_url
  });
  
  try {
    const { clientId, invoiceId, details, domain, image_url, image_base64, image_filename } = req.body || {};
    
    if (!clientId || !invoiceId) {
      console.log('✗ Missing required parameters');
      return res.status(400).json({ 
        success: false, 
        error: 'clientId and invoiceId required' 
      });
    }
    
    const inv = await getInvoice(invoiceId);
    const ownerId = String(inv.userid || inv.clientid);
    
    if (String(ownerId) !== String(clientId)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice not found or does not belong to this account.' 
      });
    }
    
    if (String(inv.status) === 'Paid') {
      const paidDate = inv.datepaid || null;
      console.log('→ Invoice already paid:', invoiceId);
      return res.json({ 
        success: true, 
        paid: true, 
        invoiceId, 
        paidDate, 
        message: `Invoice #${invoiceId} is marked as Paid. Thank you!` 
      });
    }
    
    const deptid = process.env.BILLING_DEPTID;
    // Only use deptname if deptid is not provided (deptid takes priority)
    const deptname = deptid ? undefined : (process.env.BILLING_DEPTNAME || 'Billing');
    
    // Add domain to subject if provided in request
    const subject = domain 
      ? `Payment clarification for Invoice #${invoiceId} - ${domain}`
      : `Payment clarification for Invoice #${invoiceId}`;
    
    // Build detailed message with invoice information
    let ticketMessage = `=== PAYMENT CONFIRMATION ===\n`;
    ticketMessage += `Invoice ID: ${invoiceId}\n`;
    ticketMessage += `Invoice Total: ${inv.total}\n`;
    ticketMessage += `Invoice Balance: ${inv.balance}\n`;
    ticketMessage += `Due Date: ${inv.duedate}\n`;
    if (domain) {
      ticketMessage += `Domain: ${domain}\n`;
    }
    
    // Only add payment details section if user provided details
    if (details) {
      ticketMessage += `\n=== PAYMENT DETAILS ===\n`;
      ticketMessage += String(details);
    }
    
    // Note: Image parameters (image_base64, image_url, image_filename) are accepted but not used
    // They are kept for API compatibility but no image processing is performed
    
    const t = await openTicket({ 
      deptid, 
      deptname, 
      subject, 
      message: ticketMessage, 
      clientid: clientId, 
      priority: 'Medium',
      invoiceid: invoiceId
    });
    
    const ticketId = t.tid || t.ticketid || t.id;
    console.log('→ Billing ticket created:', ticketId, 'for invoice:', invoiceId);
    
    res.json({ 
      success: true, 
      paid: false, 
      ticketId: ticketId,
      invoiceId: invoiceId,
      message: `I've opened a support ticket (#${ticketId}) for our billing team to verify your payment for Invoice #${invoiceId}.` 
    });
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

module.exports = exports;
