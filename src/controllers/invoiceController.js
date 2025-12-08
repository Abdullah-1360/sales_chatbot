const { getInvoice, getInvoices, summarizeInvoice } = require('../services/whmcsService');
const { amountFromInvoice, findRelatedUnpaidInvoice, toMessageStatus } = require('../utils/helpers');

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
      try {
        invoice = await getInvoice(targetInvoiceId);
        console.log('→ Invoice fetched:', invoice.invoiceid || invoice.id, 'Owner:', invoice.userid || invoice.clientid);
      } catch (err) {
        console.log('✗ Invoice fetch failed:', err.message);
        return res.status(404).json({ 
          success: false, 
          error: 'Invoice not found. Please check the invoice ID.' 
        });
      }
    } else if (domain) {
      const found = await findRelatedUnpaidInvoice(clientId, { domain });
      if (found) invoice = found;
    }
    
    if (!invoice) {
      // No invoice found - provide helpful response
      if (domain) {
        return res.json({ 
          success: false, 
          error: 'No unpaid invoice found for this service.',
          domain: domain,
          message: 'There are currently no unpaid invoices for this service. WHMCS will automatically generate a renewal invoice when the service is due (typically 7-14 days before the due date).',
          
        });
      }
      
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice not found or does not belong to this account.' 
      });
    }
    
    const ownerId = String(invoice.userid || invoice.user_id || invoice.clientid);
    console.log('→ Validating ownership - Invoice owner:', ownerId, 'Requested by:', clientId);
    
    if (String(ownerId) !== String(clientId)) {
      console.log('✗ Ownership validation failed');
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice not found or does not belong to this account.' 
      });
    }
    
    console.log('✓ Ownership validated');
    
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
