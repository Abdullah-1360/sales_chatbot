const { 
  addOrder, 
  getInvoice, 
  openTicket 
} = require('../services/whmcsService');

const { 
  getServiceForClient,
  getDomainForClient,
  findRelatedUnpaidInvoice,
  amountFromInvoice
} = require('../utils/helpers');

/**
 * Renew a service or domain
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
    
    if (domain) dom = await getDomainForClient({ clientId, domain });
    if (serviceId || !dom) svc = await getServiceForClient({ clientId, domain, serviceId });
    
    if (!svc && !dom) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }
    
    const existing = await findRelatedUnpaidInvoice(clientId, { 
      domain: domain || (svc && svc.domain), 
      serviceId: svc ? svc.id : null 
    });
    
    if (existing) {
      const amount = amountFromInvoice(existing);
      console.log('→ Existing invoice found:', existing.invoiceid || existing.id);
      return res.json({ 
        success: true, 
        existingInvoice: true, 
        invoiceId: existing.invoiceid || existing.id, 
        amount, 
        message: `You already have an open renewal invoice (#${existing.invoiceid || existing.id}). Please pay this to renew.` 
      });
    }
    
    let payload;
    if (dom) {
      payload = { 
        clientid: clientId, 
        domainrenewals: [{ domainid: dom.id, renewalperiod: period || 1 }], 
        paymentmethod 
      };
    } else {
      payload = { 
        clientid: clientId, 
        servicerenewals: [{ serviceid: svc.id, billingcycle: billingcycle || 'monthly' }], 
        paymentmethod 
      };
    }
    
    const order = await addOrder(payload);
    const inv = await getInvoice(order.invoiceid);
    const amount = amountFromInvoice(inv);
    const dueDate = inv.duedate || null;
    
    console.log('→ New invoice created:', order.invoiceid, 'Amount:', amount);
    res.json({ 
      success: true, 
      existingInvoice: false, 
      invoiceId: order.invoiceid, 
      amount, 
      dueDate, 
      message: `Renewal invoice #${order.invoiceid} has been generated (${amount}). Please pay to complete renewal.` 
    });
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
    invoiceId: req.body.invoiceId 
  });
  
  try {
    const { clientId, invoiceId, details } = req.body || {};
    
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
    const deptname = process.env.BILLING_DEPTNAME || 'Billing';
    const subject = `Payment clarification for Invoice #${invoiceId}`;
    const message = details ? String(details) : 'Payment submitted but invoice shows unpaid';
    
    const t = await openTicket({ 
      deptid, 
      deptname, 
      subject, 
      message, 
      clientid: clientId, 
      priority: 'Medium' 
    });
    
    const ticketId = t.tid || t.ticketid || t.id;
    console.log('→ Billing ticket created:', ticketId);
    
    res.json({ 
      success: true, 
      paid: false, 
      ticketId: ticketId, 
      message: `I've opened a support ticket (#${ticketId}) for our billing team to verify your payment.` 
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
    const deptname = process.env.TECHSUPPORT_DEPTNAME || 'Technical Support';
    
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
