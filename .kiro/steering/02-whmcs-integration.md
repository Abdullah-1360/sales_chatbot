---
inclusion: always
---

# WHMCS Integration Guidelines

## Overview
WHMCS (Web Host Manager Complete Solution) is the primary billing and client management system. All client data, invoices, products, and services are managed through WHMCS.

## API Configuration
```javascript
// Required environment variables
WHMCS_URL=https://portal.hostbreak.com/includes/api.php
WHMCS_API_IDENTIFIER=your_identifier
WHMCS_API_SECRET=your_secret
WHMCS_CACHE_TTL=300 // seconds
```

## Service Layer: `src/services/whmcsService.js`
This is the **single source of truth** for all WHMCS API calls.

### Core Functions
- `callApi(action, params)` - Base API caller
- `getClients(params)` - Search/list clients
- `getClientsDetails(clientId)` - Get client info
- `getClientsProducts(clientId)` - Get hosting services
- `getClientsDomains(clientId)` - Get domains
- `getInvoices(params)` - Search invoices
- `getInvoice(invoiceId)` - Get single invoice
- `openTicket(params)` - Create support ticket
- `addOrder(params)` - Create new order
- `genInvoices(serviceIds)` - Generate invoices

### API Call Pattern
```javascript
const { callApi } = require('../services/whmcsService');

async function myFunction() {
  try {
    const result = await callApi('ActionName', {
      param1: 'value1',
      param2: 'value2'
    });
    
    if (result.result === 'error') {
      throw new Error(result.message || 'WHMCS API error');
    }
    
    return result;
  } catch (error) {
    console.error('[myFunction] WHMCS error:', error);
    throw error;
  }
}
```

## Important WHMCS Limitations

### Service Renewals
⚠️ **WHMCS does NOT support service renewals via API**
- `AddOrder` API cannot renew existing services
- Manual invoice creation doesn't link properly to services
- Services auto-renew 7-14 days before due date
- For immediate renewal: Admin must create invoice manually in WHMCS panel

### Domain Renewals
✅ Domain renewals work via `AddOrder` API (if permissions enabled)

### Ticket Attachments
- Use base64 encoding for file attachments
- Supported formats: images, PDFs, text files
- Maximum size limits apply (check WHMCS config)

## Client Resolution Strategies

### 1. By Phone Number (Primary)
```javascript
const { normalizePhone, phonesMatch } = require('../utils/phoneNormalizer');

// Normalize before searching
const normalized = normalizePhone(phoneNumber);
const clients = await getClients({ search: normalized });
```

### 2. By Email
```javascript
const clients = await getClients({ search: email });
```

### 3. By Domain
```javascript
// Search in client products/domains
const products = await getClientsProducts(clientId);
const domains = await getClientsDomains(clientId);
```

### 4. Middleware: `resolveClientId`
Use this middleware in routes that need client identification:
```javascript
const { resolveClientId } = require('../middleware/resolveClientId');
router.post('/endpoint', resolveClientId, controller.action);
```

## Phone Number Handling
Always use the phone normalizer utilities:

```javascript
const { normalizePhone, phonesMatch, maskPhone } = require('../utils/phoneNormalizer');

// Normalize for storage/comparison
const normalized = normalizePhone('+92 300 1234567'); // '923001234567'

// Compare phone numbers
if (phonesMatch(phone1, phone2)) {
  // Match found
}

// Mask for logging/display
const masked = maskPhone('923001234567'); // '92300*****67'
```

## Caching Strategy
- Cache client lookups (TTL: 5 minutes)
- Cache product lists (TTL: 30 minutes)
- Cache server lists (TTL: 30 minutes, force refresh: 24 hours)
- Invalidate cache on data mutations
- Use MongoDB for persistent caching

## Error Handling
```javascript
// WHMCS returns errors in response body
if (result.result === 'error') {
  throw new Error(result.message || 'WHMCS API error');
}

// Network/timeout errors
catch (error) {
  if (error.code === 'ECONNREFUSED') {
    throw new Error('WHMCS API unavailable');
  }
  throw error;
}
```

## Product Group IDs (GIDs)
These are synced automatically from WHMCS:
- GID 1: cPanel Hosting
- GID 2: Windows Reseller
- GID 6: SSL Certificates (Other)
- GID 20: WordPress Hosting
- GID 21: Business Hosting (WooCommerce)
- GID 25: Windows Hosting
- GID 26: SSL Certificates
- GID 28: cPanel Reseller Hosting

## Best Practices
1. **Always validate WHMCS responses** - Check for `result: 'error'`
2. **Use service layer** - Never call WHMCS API directly from controllers
3. **Cache aggressively** - WHMCS API can be slow
4. **Handle rate limits** - Implement exponential backoff
5. **Log all API calls** - Include action and key parameters
6. **Mask sensitive data** - Phone numbers, emails in logs
7. **Use transactions** - For multi-step operations, implement rollback logic
8. **Test with real data** - WHMCS sandbox may behave differently

## Common Pitfalls
- ❌ Don't assume client exists - always check response
- ❌ Don't use raw phone numbers - normalize first
- ❌ Don't create duplicate tickets - check for existing tickets
- ❌ Don't bypass service layer - maintain single API interface
- ❌ Don't ignore WHMCS error messages - they're usually accurate
