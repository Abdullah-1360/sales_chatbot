# Invoice Matching in Renewal Endpoint

## Overview
The `/api/renewService` endpoint now includes improved invoice checking that properly parses invoice items and matches them to services/domains using WHMCS's `relid` (related ID) field.

## How It Works

### 1. Fetch Unpaid Invoices
```javascript
// Get all unpaid invoices for the client
const invoices = await getInvoices({ 
  userid: clientId, 
  status: 'Unpaid', 
  limitnum: 50 
});
```

### 2. Parse Invoice Items
For each invoice, fetch full details and parse items:
```javascript
const detail = await getInvoice(invoiceId);
const items = detail.items?.item || [];
```

### 3. Match by Related ID (relid)
Each invoice item has:
- `type` - Item type (e.g., "Hosting", "Domain")
- `relid` - Related ID (service ID or domain ID)
- `description` - Item description (includes domain name)

**Matching Logic:**
```javascript
// Match service renewal
if (item.relid === serviceId && item.type === 'Hosting') {
  // Found service renewal invoice
}

// Match domain renewal
if (item.relid === domainId && item.type === 'Domain') {
  // Found domain renewal invoice
}

// Fallback: Match by domain name in description
if (item.description.includes(domain)) {
  // Found related invoice
}
```

## Invoice Item Structure

### Service Renewal Item
```json
{
  "id": "202949",
  "type": "Hosting",
  "relid": "19032",
  "description": "Pro Plan (Windows) - example.com (03/12/2025 - 02/12/2026)",
  "amount": "7800.00",
  "taxed": 0
}
```

**Matching:**
- `relid: "19032"` matches `serviceId: "19032"`
- `type: "Hosting"` confirms it's a service renewal

### Domain Renewal Item
```json
{
  "id": "202950",
  "type": "Domain",
  "relid": "37077",
  "description": "example.com - Domain Renewal (1 Year)",
  "amount": "1200.00",
  "taxed": 0
}
```

**Matching:**
- `relid: "37077"` matches `domainId: "37077"`
- `type: "Domain"` confirms it's a domain renewal

## Response Messages

### Invoice Not Overdue
```json
{
  "success": true,
  "existingInvoice": true,
  "invoiceId": "130901",
  "amount": "$7800.00",
  "dueDate": "2025-12-15",
  "isOverdue": false,
  "message": "An invoice for renewal already exists: Invoice #130901 for $7800.00 due on 2025-12-15. Please pay this invoice to renew your service."
}
```

### Invoice Overdue
```json
{
  "success": true,
  "existingInvoice": true,
  "invoiceId": "130901",
  "amount": "$7800.00",
  "dueDate": "2025-12-01",
  "isOverdue": true,
  "message": "Invoice #130901 for renewal is overdue by 5 day(s) (due: 2025-12-01). Please pay $7800.00 to reactivate your service."
}
```

### No Existing Invoice
If no unpaid invoice is found, the endpoint proceeds to generate a new invoice using GenInvoices.

## Benefits

### 1. Accurate Matching
- Uses WHMCS's official `relid` field instead of string matching
- Verifies item type (Hosting, Domain, etc.)
- Reduces false positives

### 2. Better User Experience
- Detects overdue invoices and adjusts messaging
- Provides clear payment instructions
- Avoids creating duplicate invoices

### 3. Performance
- Limits invoice fetch to 50 most recent
- Stops searching after first match
- Caches invoice details

## Testing

### Test Invoice Matching
```bash
node src/test/test-invoice-matching.js
```

Shows:
- All unpaid invoices for test client
- Invoice items with relid and type
- Matching logic explanation

### Test Renewal with Invoice Check
```bash
node src/test/test-renew-invoice-check.js
```

Tests:
- Renewal request with existing invoice
- Overdue invoice detection
- Message formatting

## Example Flow

### User Request
```json
POST /api/renewService
{
  "email": "user@example.com",
  "domain": "example.com"
}
```

### Backend Process
1. Resolve email → clientId: "29097"
2. Find service for domain → serviceId: "19032"
3. Check unpaid invoices:
   ```javascript
   getInvoices({ userid: "29097", status: "Unpaid" })
   ```
4. For each invoice, check items:
   ```javascript
   invoice.items.forEach(item => {
     if (item.relid === "19032" && item.type === "Hosting") {
       // Found matching invoice!
     }
   })
   ```
5. If found: Return invoice details
6. If not found: Generate new invoice via GenInvoices

### Response
```json
{
  "success": true,
  "existingInvoice": true,
  "invoiceId": "130901",
  "amount": "$7800.00",
  "dueDate": "2025-12-15",
  "isOverdue": false,
  "message": "An invoice for renewal already exists..."
}
```

## Code Changes

### Updated Files
1. **src/utils/helpers.js** - `findRelatedUnpaidInvoice()`
   - Parses invoice items properly
   - Matches by relid (service/domain ID)
   - Falls back to description matching

2. **src/controllers/billingController.js** - `renewService()`
   - Passes domainId to invoice checker
   - Detects overdue invoices
   - Provides detailed response messages

## WHMCS API Reference

### GetInvoices
Fetches list of invoices with filters:
```javascript
GetInvoices({
  userid: "29097",
  status: "Unpaid",
  limitnum: 50
})
```

### GetInvoice
Fetches full invoice details including items:
```javascript
GetInvoice({
  invoiceid: "130901"
})
```

**Response includes:**
- `items.item[]` - Array of invoice items
- Each item has: `id`, `type`, `relid`, `description`, `amount`

## Best Practices

1. **Always check for existing invoices first**
   - Prevents duplicate invoice generation
   - Provides better user experience

2. **Match by relid when possible**
   - More accurate than string matching
   - Uses WHMCS's official linking mechanism

3. **Provide clear messaging**
   - Distinguish between overdue and pending invoices
   - Include payment amount and due date
   - Suggest next action

4. **Limit invoice fetch**
   - Use `limitnum` to avoid fetching too many
   - Most recent invoices are most relevant

## Troubleshooting

### Invoice Not Found
**Symptom:** Renewal creates new invoice even though one exists

**Possible Causes:**
1. Invoice is not in "Unpaid" status
2. Item relid doesn't match service/domain ID
3. Invoice belongs to different client

**Solution:**
- Check invoice status in WHMCS
- Verify relid in invoice items
- Confirm client ownership

### False Matches
**Symptom:** Wrong invoice returned

**Possible Causes:**
1. Multiple services with same domain name
2. Description matching too broad

**Solution:**
- Prioritize relid matching over description
- Check item type (Hosting vs Domain)
- Verify service/domain ID

## Related Documentation
- See `API-ENDPOINTS.md` for complete API documentation
- See `TEST-SUMMARY.md` for all test suites
- See WHMCS API docs for GetInvoices/GetInvoice details
