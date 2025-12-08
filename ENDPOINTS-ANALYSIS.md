# API Endpoints Analysis - Edge Cases & Ticket Creation

## Overview

Analysis of three protected endpoints: `/api/invoiceLookup`, `/api/serviceStatus`, and `/api/confirmPayment`.

---

## 1. `/api/invoiceLookup` - Invoice Lookup

### Purpose
Look up invoice details and status for a client.

### Required Parameters
- `clientId` (resolved from email/domain via middleware)
- `invoiceId` OR `domain` (optional - finds unpaid invoice for domain)

### Phone Validation
✅ **Enabled** - Validates phone number against WHMCS if provided

### Ticket Creation
❌ **Does NOT create tickets**

### Edge Cases

#### ✅ Success Cases
1. **Invoice found and belongs to client**
   - Returns invoice details with status, amount, due date
   - Checks if overdue and adds warning

2. **No invoice ID but domain provided**
   - Searches for unpaid invoice related to domain
   - Returns helpful message if no unpaid invoice found

3. **Invoice already paid**
   - Returns paid status with payment date

#### ❌ Error Cases
1. **Missing clientId**
   ```json
   { "success": false, "error": "clientId required" }
   ```

2. **Invalid invoiceId format**
   ```json
   { "success": false, "error": "Invalid invoiceId" }
   ```

3. **Invoice not found**
   ```json
   { "success": false, "error": "Invoice not found. Please check the invoice ID." }
   ```

4. **Invoice doesn't belong to client (ownership validation)**
   ```json
   { "success": false, "error": "Invoice not found or does not belong to this account." }
   ```

5. **Phone number mismatch (NEW)**
   ```json
   {
     "success": false,
     "error": "Phone number verification failed. Please contact us using the registered number: 310*****47",
     "registeredPhone": "310*****47"
   }
   ```

#### 🔍 Special Cases
1. **No unpaid invoice for domain**
   ```json
   {
     "success": false,
     "error": "No unpaid invoice found for this service.",
     "domain": "example.com",
     "message": "There are currently no unpaid invoices for this service. WHMCS will automatically generate a renewal invoice when the service is due (typically 7-14 days before the due date)."
   }
   ```

2. **Overdue invoice**
   - Sets `isOverdue: true`
   - Adds warning message about service interruption
   - Calculates days overdue

---

## 2. `/api/serviceStatus` - Service Status Check

### Purpose
Check the status of a service/domain and optionally report issues.

### Required Parameters
- `clientId` (resolved from email/domain via middleware)
- `domain` OR `serviceId`
- `issue` (optional - user's issue description)

### Phone Validation
✅ **Enabled** - Validates phone number against WHMCS if provided

### Ticket Creation
✅ **Creates tickets** under specific conditions

### When Tickets Are Created

#### Condition 1: Non-Billing Issue with `issue` Parameter
```javascript
if (!result.billingIssue && issue) {
  // Creates TECHNICAL SUPPORT ticket
}
```

**Ticket Details:**
- **Department**: Technical Support (from `TECHSUPPORT_DEPTID` env var)
- **Priority**: High
- **Subject**: `Issue with {serviceName}`
- **Includes**: Service details, status, domain, issue description
- **Response**: Adds `ticketCreated: true` and `ticketId` to response

**Example Scenarios:**
- Service is Active but user reports website down
- Service is Pending and user wants update
- Service has technical issues (not billing related)

#### Condition 2: Fallback for Any Issue
If status handlers don't return a result but `issue` is provided:
```javascript
if (issue) {
  // Creates TECHNICAL SUPPORT ticket (fallback)
}
```

### Edge Cases

#### ✅ Success Cases

1. **Active Service**
   - Returns status with next due date
   - `billingIssue: false`
   - No ticket created (unless issue provided)

2. **Suspended - Billing Issue**
   - Finds unpaid invoice
   - Returns invoice ID and amount due
   - Calculates days until termination (15 days from due date)
   - `billingIssue: true`
   - **No ticket created** (billing issue, not technical)

3. **Suspended - Non-Billing Issue**
   - Suspension reason is not payment-related (e.g., TOS violation)
   - `billingIssue: false`
   - `actionRequired: 'contact_support'`
   - **Ticket created if `issue` provided**

4. **Domain + Hosting Combination**
   - Checks both domain registration AND hosting products
   - Returns combined status
   - Handles multiple products per domain
   - Shows product counts and names

5. **Multiple Products for Same Domain**
   - Lists all products with statuses
   - Shows status counts (Active: 2, Suspended: 1, etc.)
   - Prioritizes Active > Suspended > Pending for primary message

#### ❌ Error Cases

1. **Missing required parameters**
   ```json
   { "success": false, "error": "clientId and domain or serviceId required" }
   ```

2. **Service not found**
   ```json
   { "success": false, "error": "I couldn't find a service with that domain on your account." }
   ```

3. **Phone number mismatch (NEW)**
   ```json
   {
     "success": false,
     "error": "Phone number verification failed. Please contact us using the registered number: 310*****47",
     "registeredPhone": "310*****47"
   }
   ```

#### 🔍 Special Cases

1. **Terminated/Cancelled Service**
   - `billingIssue: false`
   - `actionRequired: null`
   - No ticket created

2. **Pending Service**
   - `billingIssue: false`
   - Message: "Order is still pending setup"
   - No ticket created (unless issue provided)

3. **Expired Domain**
   - `billingIssue: true`
   - `actionRequired: 'renew_domain'`
   - No ticket created

4. **Partial Status (Domain Active, Hosting Suspended)**
   - Returns both statuses separately
   - `billingIssue: true` if hosting suspended
   - Provides specific renewal action

### Status Handler Logic

The endpoint uses `statusHandlers.js` which handles:

1. **Active** - Service operational
2. **Suspended** - Checks for billing vs non-billing reasons
3. **Terminated/Cancelled** - Service ended
4. **Pending** - Awaiting setup
5. **Combined Status** - Domain + Hosting combinations
6. **Domain Only** - Just domain registration
7. **Hosting Only** - Just hosting product

---

## 3. `/api/confirmPayment` - Payment Confirmation

### Purpose
Confirm payment for an invoice and create a billing ticket for verification.

### Required Parameters
- `clientId` (resolved from email/domain via middleware)
- `invoiceId`
- `details` (optional - payment details)
- `domain` (optional - adds to ticket subject)
- `image_url`, `image_base64`, `image_filename` (optional - accepted but not used)

### Phone Validation
✅ **Enabled** - Validates phone number against WHMCS if provided

### Ticket Creation
✅ **ALWAYS creates tickets** (unless invoice already paid)

### When Tickets Are Created

#### Always Creates BILLING Ticket
```javascript
// Creates ticket for billing team to verify payment
const ticket = await openTicket({
  deptid: BILLING_DEPTID,
  deptname: 'Billing',
  subject: `Payment clarification for Invoice #${invoiceId} - ${domain}`,
  message: ticketMessage,
  clientid: clientId,
  priority: 'Medium',
  invoiceid: invoiceId
});
```

**Ticket Details:**
- **Department**: Billing (from `BILLING_DEPTID` env var)
- **Priority**: Medium
- **Subject**: `Payment clarification for Invoice #{invoiceId}` (includes domain if provided)
- **Includes**: 
  - Invoice ID, total, balance, due date
  - Domain (if provided)
  - Payment details (if provided)
- **Response**: Returns `ticketId` and confirmation message

### Edge Cases

#### ✅ Success Cases

1. **Payment confirmation for unpaid invoice**
   - Creates billing ticket
   - Returns ticket ID
   - Message: "I've opened a support ticket for our billing team to verify your payment"

2. **Invoice already paid**
   - **No ticket created**
   - Returns: `paid: true` with payment date
   - Message: "Invoice is marked as Paid. Thank you!"

3. **Payment with domain in subject**
   - Adds domain to ticket subject for easier identification
   - Helps billing team identify the service

4. **Payment with details**
   - Includes payment details in ticket message
   - Helps billing team verify payment faster

#### ❌ Error Cases

1. **Missing required parameters**
   ```json
   { "success": false, "error": "clientId and invoiceId required" }
   ```

2. **Invoice not found**
   - Returns 404 error

3. **Invoice doesn't belong to client**
   ```json
   { "success": false, "error": "Invoice not found or does not belong to this account." }
   ```

4. **Phone number mismatch (NEW)**
   ```json
   {
     "success": false,
     "error": "Phone number verification failed. Please contact us using the registered number: 310*****47",
     "registeredPhone": "310*****47"
   }
   ```

#### 🔍 Special Cases

1. **Image parameters accepted but not used**
   - `image_url`, `image_base64`, `image_filename` are accepted
   - Kept for API compatibility
   - No image processing performed
   - Comment in code: "Note: Image parameters are accepted but not used"

2. **Ticket creation failure**
   - If ticket creation fails, error is logged
   - But endpoint doesn't fail - continues gracefully

---

## Ticket Creation Summary

| Endpoint | Creates Tickets? | Conditions | Department | Priority |
|----------|-----------------|------------|------------|----------|
| **invoiceLookup** | ❌ No | Never | N/A | N/A |
| **serviceStatus** | ✅ Yes | When `issue` provided AND `billingIssue: false` | Technical Support | High |
| **confirmPayment** | ✅ Yes | Always (unless invoice already paid) | Billing | Medium |

---

## Common Edge Cases Across All Endpoints

### 1. Phone Validation (NEW)
All three endpoints now validate phone numbers:
- If phone provided, must match WHMCS record
- Handles country code variations (+92 vs without)
- Returns masked phone on failure (310*****47)
- Optional - requests without phone still work

### 2. Client Resolution
All endpoints use `resolveClientId` middleware:
- Can resolve from `email`, `domain`, or `clientId`
- Handles multiple clients for same domain
- Returns clear error if client not found

### 3. Ownership Validation
- `invoiceLookup`: Validates invoice belongs to client
- `confirmPayment`: Validates invoice belongs to client
- `serviceStatus`: Validates service belongs to client

### 4. WHMCS API Failures
All endpoints handle WHMCS API failures gracefully:
- Catch errors and return user-friendly messages
- Log errors for debugging
- Don't expose internal error details

### 5. Missing Data in WHMCS
- Handle missing phone numbers (skip validation)
- Handle missing invoice items
- Handle missing service details
- Provide fallback messages

---

## Environment Variables Required

### For Ticket Creation

```bash
# Technical Support Department
TECHSUPPORT_DEPTID=1
TECHSUPPORT_DEPTNAME="Technical Support"

# Billing Department
BILLING_DEPTID=2
BILLING_DEPTNAME="Billing"
```

### For WHMCS API

```bash
WHMCS_URL=https://your-whmcs.com/includes/api.php
WHMCS_IDENTIFIER=your_api_identifier
WHMCS_SECRET=your_api_secret
```

---

## Response Patterns

### Success Response Pattern
```json
{
  "success": true,
  "status": "Active",
  "service": "example.com",
  "billingIssue": false,
  "actionRequired": null,
  "message": "Your service is active...",
  "ticketCreated": false
}
```

### Error Response Pattern
```json
{
  "success": false,
  "error": "Clear error message for user"
}
```

### Ticket Created Response Pattern
```json
{
  "success": true,
  "ticketCreated": true,
  "ticketId": "123456",
  "message": "I've opened a support ticket (#123456)..."
}
```

---

## Best Practices for Frontend Integration

1. **Always handle phone validation errors** (403 status)
2. **Check `billingIssue` flag** to determine if payment needed
3. **Check `ticketCreated` flag** to show ticket confirmation
4. **Display `actionRequired` to guide user** (payment, contact_support, etc.)
5. **Handle `isOverdue` flag** for urgent payment warnings
6. **Show masked phone** when validation fails to help user identify correct number

---

## Security Considerations

1. **Ownership validation** prevents accessing other clients' data
2. **Phone validation** adds extra security layer
3. **Phone masking** protects privacy (310*****47)
4. **No sensitive data in error messages**
5. **Ticket creation logged** for audit trail
