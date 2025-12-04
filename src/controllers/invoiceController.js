const { getInvoice, getInvoices, summarizeInvoice } = require('../services/whmcsService');
const { amountFromInvoice, findRelatedUnpaidInvoice, toMessageStatus } = require('../utils/helpers');

/**
 * Get single invoice by ID
 */
exports.getInvoiceById = async (req, res, next) => {
  console.log(`[GET /invoices/${req.params.invoiceId}]`);
  try {
    const data = await getInvoice(req.params.invoiceId);
    const response = { ok: true, invoice: data, summary: summarizeInvoice(data) };
    console.log('→ Invoice:', data.invoiceid, 'Status:', data.status);
    res.json(response);
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

/**
 * Get list of invoices with filters
 */
exports.getInvoicesList = async (req, res, next) => {
  console.log('[GET /invoices]', req.query);
  try {
    const { clientId, status, limitstart, limitnum } = req.query;
    const params = {};
    if (clientId) params.userid = clientId;
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
 * Invoice lookup with enhanced messaging
 */
exports.invoiceLookup = async (req, res, next) => {
  console.log('[POST /api/invoiceLookup]', { 
    clientId: req.body.clientId, 
    invoiceId: req.body.invoiceId, 
    domain: req.body.domain 
  });
  
  try {
    const { clientId, invoiceId, domain } = req.body || {};
    
    if (!clientId) {
      return res.status(400).json({ success: false, error: 'clientId required' });
    }
    
    let targetInvoiceId = invoiceId;
    if (targetInvoiceId !== undefined && targetInvoiceId !== null) {
      if (!String(targetInvoiceId).match(/^\d+$/)) {
        return res.status(400).json({ success: false, error: 'Invalid invoiceId' });
      }
    }
    
    let invoice;
    if (targetInvoiceId) {
      invoice = await getInvoice(targetInvoiceId);
    } else if (domain) {
      const found = await findRelatedUnpaidInvoice(clientId, { domain });
      if (found) invoice = found;
    }
    
    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice not found or does not belong to this account.' 
      });
    }
    
    const ownerId = String(invoice.userid || invoice.user_id || invoice.clientid);
    if (String(ownerId) !== String(clientId)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice not found or does not belong to this account.' 
      });
    }
    
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
    
    console.log('→ Invoice:', response.invoiceId, 'Status:', response.status, isOverdue ? '(OVERDUE)' : '');
    res.json(response);
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};

module.exports = exports;
