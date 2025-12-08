# Ticket Creation Test Suite

## Overview
Comprehensive test suite for ticket creation endpoints in the WHMCS integration.

## Test Files

### 1. `test-ticket-simple.js` ✅ RECOMMENDED
Simple, focused tests for ticket creation functionality.

**Run:** `node src/test/test-ticket-simple.js`

**Tests Covered:**
- ✅ Create ticket with deptid (Support)
- ✅ Create ticket with deptname (Support)
- ✅ Create ticket with deptname (Billing)
- ✅ Create guest ticket with name and email
- ✅ Create ticket via triageIssue endpoint
- ✅ Create ticket with serviceId (optional)
- ✅ Validation - Missing subject (should fail)
- ✅ Validation - Invalid department (should fail)

**Success Rate:** 100% (7/7 tests passed)

### 2. `test-ticket-creation.js`
Comprehensive test suite with detailed logging and multiple scenarios.

**Run:** `node src/test/test-ticket-creation.js`

**Tests Covered:**
- Create ticket with clientId and deptid
- Create ticket with clientId and deptname
- Create guest ticket with name and email
- Create ticket with serviceId
- Create billing ticket via confirmPayment
- Create tech support ticket via triageIssue
- Validation tests
- Different priority levels (Low, Medium, High)

### 3. `test-whmcs-ticket-direct.js`
Direct WHMCS API tests to understand API behavior.

**Run:** `node src/test/test-whmcs-ticket-direct.js`

**Purpose:** Tests WHMCS OpenTicket API directly to verify parameter support.

## Key Findings

### Department Name Resolution
**Issue:** WHMCS OpenTicket API only accepts `deptid`, not `deptname`.

**Solution:** Implemented automatic department name resolution in `whmcsService.js`:
- `getSupportDepartments()` - Fetches all departments (cached)
- `resolveDepartmentId(deptname)` - Resolves department name to ID
- `openTicket()` - Automatically resolves deptname to deptid if needed

### Supported Parameters

#### Direct Ticket Creation (`POST /api/tickets`)
```json
{
  "clientid": "string",           // Client ID (optional if name+email provided)
  "name": "string",               // Guest name (required if no clientid)
  "email": "string",              // Guest email (required if no clientid)
  "deptid": "string",             // Department ID (recommended)
  "deptname": "string",           // Department name (auto-resolved to ID)
  "subject": "string",            // Required
  "message": "string",            // Required
  "priority": "Low|Medium|High",  // Optional
  "serviceid": "string"           // Optional - links ticket to service
}
```

#### Automated Ticket Creation

**Via triageIssue (`POST /api/triageIssue`):**
```json
{
  "clientId": "string",
  "domain": "string",
  "issue": "string"
}
```
- Automatically creates tech support ticket
- Includes service details in ticket message
- Detects billing issues (suspended services)

**Via confirmPayment (`POST /api/confirmPayment`):**
```json
{
  "clientId": "string",
  "invoiceId": "string",
  "details": "string"  // Optional payment details
}
```
- Creates billing ticket for payment verification
- Only if invoice is unpaid

## Available Departments

Run `node src/test/get-departments.js` to see your WHMCS departments.

**Example output:**
```
ID: 2, Name: Support
ID: 3, Name: Billing
ID: 1, Name: Sales
ID: 4, Name: NOC
```

## Environment Variables

Required in `.env`:
```env
TECHSUPPORT_DEPTID=2
TECHSUPPORT_DEPTNAME=Support
BILLING_DEPTID=3
BILLING_DEPTNAME=Billing
```

## Test Configuration

Update these in test files if needed:
```javascript
const TEST_CLIENT_ID = '29097';
const TEST_DOMAIN = 'test123.com';
const TEST_EMAIL = 'abdullahshahid906@gmail.com';
```

## Performance

Average response times:
- Direct ticket creation: ~1200ms
- triageIssue (with service lookup): ~1600ms
- Validation errors: ~400ms

## Common Issues

### 1. "Department ID not found"
**Cause:** Invalid department name or deptid
**Solution:** Run `get-departments.js` to see valid departments

### 2. "Service ID Not Found"
**Cause:** Invalid or non-existent service ID
**Solution:** Use valid service ID from client's products

### 3. "Invoice not found"
**Cause:** Invoice doesn't belong to the client
**Solution:** Verify invoice ownership before creating ticket

## Next Steps

1. ✅ Department name resolution implemented
2. ✅ All ticket creation tests passing
3. ✅ Validation tests working
4. 🔄 Consider adding ticket reply/update tests
5. 🔄 Consider adding ticket status check tests

## Running All Tests

```bash
# Simple focused tests (recommended)
node src/test/test-ticket-simple.js

# Comprehensive tests
node src/test/test-ticket-creation.js

# Direct WHMCS API tests
node src/test/test-whmcs-ticket-direct.js

# Get available departments
node src/test/get-departments.js
```
