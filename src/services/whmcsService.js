const axios = require('axios');

const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_IDENTIFIER = process.env.WHMCS_IDENTIFIER || process.env.WHMCS_API_IDENTIFIER;
const WHMCS_SECRET = process.env.WHMCS_SECRET || process.env.WHMCS_API_SECRET;
const WHMCS_ACCESS_KEY = process.env.WHMCS_ACCESS_KEY;
const WHMCS_CACHE_TTL = Number(process.env.WHMCS_CACHE_TTL || 0);

function ensureConfig() {
  if (!WHMCS_URL || !WHMCS_IDENTIFIER || !WHMCS_SECRET) {
    throw new Error('Missing WHMCS configuration. Set WHMCS_URL, WHMCS_IDENTIFIER, WHMCS_SECRET');
  }
}

function serializeParams(params) {
  const out = {};
  const walk = (prefix, value) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      // For WHMCS array parameters, keep them as arrays
      // They will be handled specially in callApi
      out[prefix] = value;
    } else if (typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => {
        walk(`${prefix}[${k}]`, v);
      });
    } else {
      out[prefix] = value;
    }
  };
  Object.entries(params).forEach(([k, v]) => walk(k, v));
  return out;
}

async function callApi(action, params = {}) {
  ensureConfig();
  const url = /includes\/api\.php$/.test(WHMCS_URL)
    ? WHMCS_URL
    : `${WHMCS_URL.replace(/\/$/, '')}/includes/api.php`;
  const base = {
    action,
    responsetype: 'json',
    identifier: WHMCS_IDENTIFIER,
    secret: WHMCS_SECRET,
    ...(WHMCS_ACCESS_KEY ? { accesskey: WHMCS_ACCESS_KEY } : {}),
  };
  const flat = serializeParams(params);
  
  // Build URLSearchParams manually to handle arrays properly
  const payload = new URLSearchParams();
  Object.entries({ ...base, ...flat }).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      // For arrays, append each value with the same key
      // This creates: attachment[]=value1&attachment[]=value2
      value.forEach(v => payload.append(key, v));
    } else {
      payload.append(key, value);
    }
  });

  try {
    const { data } = await axios.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (data && data.result === 'success') return data;
    const message = (data && (data.message || data.error)) || 'Unknown WHMCS error';
    const code = data && data.errorcode ? Number(data.errorcode) : undefined;
    const err = new Error(message);
    err.code = code;
    err.response = data;
    throw err;
  } catch (e) {
    if (e.response && e.response.data) {
      const data = e.response.data;
      const err = new Error(data.message || data.error || 'WHMCS request failed');
      err.code = data.errorcode ? Number(data.errorcode) : undefined;
      err.response = data;
      throw err;
    }
    throw e;
  }
}

const cache = new Map();

function stable(obj) {
  if (Array.isArray(obj)) return obj.map(stable);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, k) => { acc[k] = stable(obj[k]); return acc; }, {});
  }
  return obj;
}

function cacheKey(action, params) {
  return JSON.stringify({ action, params: stable(params) });
}

async function cached(action, params, fn) {
  if (!WHMCS_CACHE_TTL) return fn();
  const key = cacheKey(action, params);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.exp > now) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: now + WHMCS_CACHE_TTL * 1000 });
  return val;
}

async function getInvoice(invoiceId) {
  const params = { invoiceid: invoiceId };
  return cached('GetInvoice', params, () => callApi('GetInvoice', params));
}

async function getInvoices(params = {}) {
  return cached('GetInvoices', params, () => callApi('GetInvoices', params));
}

async function getClientsProducts(clientId, params = {}) {
  const p = { clientid: clientId, ...params };
  return cached('GetClientsProducts', p, () => callApi('GetClientsProducts', p));
}

async function getClientsDomains(clientId, params = {}) {
  const p = { clientid: clientId, ...params };
  return cached('GetClientsDomains', p, () => callApi('GetClientsDomains', p));
}

async function getSupportDepartments() {
  return cached('GetSupportDepartments', {}, () => callApi('GetSupportDepartments', {}));
}

async function resolveDepartmentId(deptname) {
  const data = await getSupportDepartments();
  const depts = data.departments?.department || data.departments || [];
  const deptArray = Array.isArray(depts) ? depts : [depts];
  
  const dept = deptArray.find(d => 
    d.name.toLowerCase() === deptname.toLowerCase()
  );
  
  return dept ? dept.id : null;
}

async function openTicket({ deptid, deptname, subject, message, clientid, priority, serviceid, invoiceid, name, email, attachments }) {
  const base = { subject, message };
  
  // WHMCS OpenTicket API only supports deptid, not deptname
  // If deptname is provided without deptid, resolve it
  if (!deptid && deptname) {
    deptid = await resolveDepartmentId(deptname);
    if (!deptid) {
      const err = new Error(`Department '${deptname}' not found`);
      err.code = 'DEPT_NOT_FOUND';
      throw err;
    }
  }
  
  if (deptid) base.deptid = deptid;
  if (clientid) base.clientid = clientid; else if (name && email) { base.name = name; base.email = email; }
  if (priority) base.priority = priority;
  if (serviceid) base.serviceid = serviceid;
  if (invoiceid) base.invoiceid = invoiceid;
  
  // Add attachments if provided
  // WHMCS expects: attachment[] = "filename.ext|base64data"
  // Note: Use 'attachment' not 'attachments' and no index
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    attachments.forEach((attachment) => {
      if (attachment.filename && attachment.data) {
        // WHMCS API expects 'attachment[]' format (not 'attachments[0]')
        if (!base.attachment) {
          base.attachment = [];
        }
        base.attachment.push(`${attachment.filename}|${attachment.data}`);
      }
    });
  }
  
  // console.log('→ OpenTicket params:', {
  //   deptid: base.deptid,
  //   subject: base.subject,
  //   clientid: base.clientid,
  //   invoiceid: base.invoiceid,
  //   hasAttachments: !!base.attachment,
  //   attachmentCount: base.attachment ? base.attachment.length : 0
  // });
  
  if (base.attachment && base.attachment.length > 0) {
    base.attachment.forEach((att, index) => {
      const parts = att.split('|');
      console.log(`→ Attachment ${index}:`, {
        filename: parts[0],
        base64Length: parts[1] ? parts[1].length : 0,
        base64Preview: parts[1] ? parts[1].substring(0, 50) + '...' : 'none'
      });
    });
  }
  
  return callApi('OpenTicket', base);
}

/**
 * Get ticket details by ticket ID
 * @param {string|number} ticketId - Ticket ID or ticket number
 * @returns {Promise<Object>} Ticket details
 */
async function getTicket(ticketId) {
  // Try both ticketid and tid parameters as WHMCS might expect different formats
  try {
    return await callApi('GetTicket', { ticketid: ticketId });
  } catch (error) {
    // If ticketid fails, try with tid parameter
    if (error.message && error.message.includes('Ticket ID Not Found')) {
      try {
        return await callApi('GetTicket', { tid: ticketId });
      } catch (tidError) {
        // If both fail, throw the original error
        throw error;
      }
    }
    throw error;
  }
}

/**
 * Get tickets for a specific client
 * @param {string|number} clientId - Client ID
 * @param {Object} options - Additional options (status, deptid, etc.)
 * @returns {Promise<Object>} Tickets data
 */
async function getTickets(clientId, options = {}) {
  const params = {
    clientid: clientId,
    ...options
  };
  return callApi('GetTickets', params);
}

/**
 * Get ticket by ticket number with parallel department searches and validate client phone
 * @param {string|number} ticketNumber - Ticket number
 * @param {string} phone - Client phone number for validation
 * @returns {Promise<Object>} Ticket details with client validation
 */
async function getTicketWithClientValidation(ticketNumber, phone) {
  try {
    let ticketData = null;
    let searchMethod = 'direct';
    
    // First, try direct ticket lookup
    try {
      ticketData = await getTicket(ticketNumber);
      searchMethod = 'direct';
    } catch (directError) {
      // If direct lookup fails, try parallel department-specific searches
      console.log(`→ Direct ticket lookup failed, trying department-specific searches...`);
      
      const departmentSearches = [];
      
      // Search in Support department
      if (process.env.TECHSUPPORT_DEPTID) {
        departmentSearches.push(
          getTickets(null, { 
            deptid: process.env.TECHSUPPORT_DEPTID,
            limitnum: 100 // Increase limit to find the ticket
          }).then(result => ({
            department: 'Support',
            deptid: process.env.TECHSUPPORT_DEPTID,
            result
          })).catch(error => ({
            department: 'Support',
            deptid: process.env.TECHSUPPORT_DEPTID,
            error: error.message
          }))
        );
      }
      
      // Search in Billing department
      if (process.env.BILLING_DEPTID) {
        departmentSearches.push(
          getTickets(null, { 
            deptid: process.env.BILLING_DEPTID,
            limitnum: 100 // Increase limit to find the ticket
          }).then(result => ({
            department: 'Billing',
            deptid: process.env.BILLING_DEPTID,
            result
          })).catch(error => ({
            department: 'Billing',
            deptid: process.env.BILLING_DEPTID,
            error: error.message
          }))
        );
      }
      
      // Execute parallel department searches
      const departmentResults = await Promise.all(departmentSearches);
      
      // Look for the ticket in department results
      for (const deptResult of departmentResults) {
        if (deptResult.error) {
          console.log(`→ ${deptResult.department} department search failed: ${deptResult.error}`);
          continue;
        }
        
        if (deptResult.result && deptResult.result.tickets && deptResult.result.tickets.ticket) {
          const tickets = Array.isArray(deptResult.result.tickets.ticket) 
            ? deptResult.result.tickets.ticket 
            : [deptResult.result.tickets.ticket];
          
          // Find the specific ticket by ID
          const foundTicket = tickets.find(ticket => 
            (ticket.id && ticket.id.toString() === ticketNumber.toString()) ||
            (ticket.tid && ticket.tid.toString() === ticketNumber.toString())
          );
          
          if (foundTicket) {
            console.log(`→ Ticket found in ${deptResult.department} department`);
            // Get full ticket details
            ticketData = await getTicket(foundTicket.id || foundTicket.tid);
            searchMethod = `department_${deptResult.department.toLowerCase()}`;
            break;
          }
        }
      }
      
      // If still not found, throw the original error
      if (!ticketData) {
        throw directError;
      }
    }
    
    if (!ticketData || !ticketData.userid) {
      throw new Error('Ticket not found or invalid ticket number');
    }
    
    console.log(`→ Ticket found via ${searchMethod} search`);
    console.log(`→ Ticket Department: ${ticketData.deptname || ticketData.department} (ID: ${ticketData.deptid || ticketData.departmentid})`);
    
    // Get client details to validate phone
    const clientData = await getClientsDetails({ clientid: ticketData.userid });
    
    if (!clientData) {
      throw new Error('Client not found for this ticket');
    }
    
    // Validate phone number (normalize both for comparison)
    const normalizePhone = (phoneNum) => {
      if (!phoneNum) return '';
      return phoneNum.toString().replace(/[\s\-\(\)\+]/g, '');
    };
    
    const clientPhone = normalizePhone(clientData.phonenumber);
    const providedPhone = normalizePhone(phone);
    
    // Check if phones match (exact match or provided phone is contained in client phone)
    const phoneMatches = clientPhone === providedPhone || 
                        clientPhone.includes(providedPhone) || 
                        providedPhone.includes(clientPhone);
    
    if (!phoneMatches) {
      // Create masked version of registered phone number
      const maskedRegisteredPhone = clientData.phonenumber ? 
        clientData.phonenumber.toString().substring(0, 4) + '***' + clientData.phonenumber.toString().slice(-3) :
        'registered number';
      
      throw new Error(`Please contact from your registered number ${maskedRegisteredPhone}`);
    }
    
    return {
      ticket: ticketData,
      client: clientData,
      phoneValidated: true,
      searchMethod: searchMethod,
      departmentId: ticketData.deptid || ticketData.departmentid,
      departmentName: ticketData.deptname || ticketData.department
    };
    
  } catch (error) {
    throw new Error(`Ticket lookup failed: ${error.message}`);
  }
}

async function addOrder(params) {
  // Supports product purchase or domain renewal via domainrenewals[] syntax
  return callApi('AddOrder', params);
}

async function genInvoices(params) {
  // Generate invoices for services that are due
  return callApi('GenInvoices', params);
}

async function createInvoice(params) {
  // Create a custom invoice with line items
  return callApi('CreateInvoice', params);
}

async function updateClientProduct(params) {
  // Update a client's product/service (e.g., extend due date)
  return callApi('UpdateClientProduct', params);
}

async function moduleCreate(params) {
  // Trigger module create command (generates invoice for service)
  return callApi('ModuleCreate', params);
}

async function getClientsDetails(params = {}) {
  return cached('GetClientsDetails', params, () => callApi('GetClientsDetails', params));
}

async function getInvoicesForUser(userId) {
  const params = { userid: userId,orderby :'date',order:'desc'};
  return cached('GetInvoicesForUser', params, () => callApi('GetInvoices', params));
}

async function getServers(params = {}) {
  // Add pagination parameters to ensure we get all servers
  const defaultParams = {
    limitstart: 0,
    limitnum: 999, // Get up to 999 servers (should be enough for most cases)
    ...params
  };
  
  console.log('🖥️ Calling WHMCS GetServers with params:', defaultParams);
  
  const result = await cached('GetServers', defaultParams, () => callApi('GetServers', defaultParams));
  
  console.log(`→ WHMCS GetServers returned ${result.totalresults || 0} total servers`);
  
  return result;
}

function summarizeInvoice(data) {
  const status = data.status;
  const total = data.total || data.amount || data.subtotal;
  const balance = data.balance || (data.total && data.amountpaid ? Number(data.total) - Number(data.amountpaid) : undefined);
  return { status, total, balance, currency: data.currency, duedate: data.duedate, invoiceid: data.invoiceid };
}

module.exports = {
  callApi,
  getInvoice,
  getInvoices,
  getInvoicesForUser,
  getClientsProducts,
  getClientsDomains,
  getClientsDetails,
  getServers,
  getSupportDepartments,
  resolveDepartmentId,
  openTicket,
  getTicket,
  getTickets,
  getTicketWithClientValidation,
  addOrder,
  genInvoices,
  createInvoice,
  updateClientProduct,
  moduleCreate,
  summarizeInvoice
};
