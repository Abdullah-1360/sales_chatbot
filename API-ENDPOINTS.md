# API Endpoints Documentation

Complete list of all available endpoints in the WHMCS Sales Chatbot API.

**Base URL:** `http://localhost:3000` (or your configured URL)

---

## Table of Contents
1. [Health & System](#health--system)
2. [Recommendations](#recommendations)
3. [Domain Services](#domain-services)
4. [Plan Search](#plan-search)
5. [Invoices](#invoices)
6. [Clients](#clients)
7. [Tickets](#tickets)
8. [Orders](#orders)
9. [Service Status & Billing](#service-status--billing)
10. [Leads (VTiger)](#leads-vtiger)
11. [Chats](#chats)
12. [GID Information](#gid-information)

---

## Health & System

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

---

## Recommendations

### POST /recommendations
Get hosting plan recommendations based on requirements.

**Request Body:**
```json
{
  "purpose": "string",              // e.g., "ecommerce", "wordpress", "business", "ssl"
  "websites_count": "string",       // Number of websites
  "storage_needed_gb": "string",    // Storage in GB
  "free_domain": "string",          // "true" or "false"
  "other_requirements": "string",   // Optional additional requirements
  "needs_ssl": "string",            // "true" or "false"
  "needs_reseller": "string",       // "true" or "false"
  "needs_windows": "string"         // "true" or "false"
}
```

**Purpose Keywords:**
- **E-commerce:** ecommerce, woocommerce, shop, store, online store, magento, prestashop
- **WordPress:** wordpress, wp, blog
- **Business:** business, corporate, company, professional, asp.net, .net
- **SSL:** ssl, certificate, https, secure

**Response:**
```json
{
  "success": true,
  "recommendations": [
    {
      "id": "123",
      "name": "Pro Plan",
      "description": "...",
      "pricing": {...},
      "features": {...}
    }
  ],
  "matchedBy": "purpose",
  "gid": 21
}
```

---

## Domain Services

### POST /domain/check
Check single domain availability.

**Request Body:**
```json
{
  "domain": "example.com"
}
```

**Response:**
```json
{
  "domain": "example.com",
  "available": true,
  "status": "available"
}
```

### POST /domain/bulk-check
Check multiple domains availability.

**Request Body:**
```json
{
  "domains": ["example.com", "example.net", "example.org"]
}
```

**Response:**
```json
{
  "results": [
    {
      "domain": "example.com",
      "available": true,
      "status": "available"
    }
  ]
}
```

---

## Plan Search

### GET /plans/search
Search for hosting plans.

**Query Parameters:**
- `gid` - Group ID (optional)
- `name` - Plan name search (optional)
- `minPrice` - Minimum price (optional)
- `maxPrice` - Maximum price (optional)

**Example:** `/plans/search?gid=21&name=pro`

**Response:**
```json
{
  "success": true,
  "plans": [
    {
      "id": "123",
      "name": "Pro Plan",
      "gid": 21,
      "pricing": {...}
    }
  ]
}
```

---

## Invoices

### GET /invoices/:invoiceId
Get invoice details by ID.

**Response:**
```json
{
  "success": true,
  "invoiceId": 130901,
  "status": "Unpaid",
  "balance": "7800.00",
  "dueDate": "2025-12-03",
  "message": "Invoice #130901 is overdue...",
  "isOverdue": true
}
```

**Status Messages:**
- **Paid:** Confirmation with payment date
- **Unpaid:** Amount due and due date
- **Overdue:** Warning about overdue payment
- **Cancelled/Refunded:** Status explanation

### GET /invoices
Get list of invoices.

**Query Parameters:**
- `userid` - Client ID (optional)
- `status` - Invoice status (optional): Paid, Unpaid, Cancelled, Refunded
- `limitnum` - Limit results (optional)

**Response:**
```json
{
  "success": true,
  "invoices": [...]
}
```

---

## Clients

### GET /clients/:clientId/products
Get client's products/services.

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "id": "19032",
      "domain": "example.com",
      "status": "Active",
      "productname": "Pro Plan",
      "nextduedate": "2025-12-03"
    }
  ]
}
```

### GET /clients/:clientId/domains
Get client's domains.

**Response:**
```json
{
  "success": true,
  "domains": [
    {
      "id": "12345",
      "domain": "example.com",
      "status": "Active",
      "expirydate": "2026-01-15"
    }
  ]
}
```

### GET /clients/:clientId/service-status
Get client's service status summary.

**Response:**
```json
{
  "success": true,
  "services": [...],
  "domains": [...],
  "summary": {
    "totalServices": 5,
    "activeServices": 4,
    "suspendedServices": 1
  }
}
```

---

## Tickets

### POST /tickets
Create a support ticket.

**Request Body:**
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

**Available Departments:**
- Support (ID: 2)
- Billing (ID: 3)
- Sales (ID: 1)
- NOC (ID: 4)

**Response:**
```json
{
  "ok": true,
  "ticketnumber": "643180",
  "raw": {
    "result": "success",
    "id": 137678,
    "tid": "643180"
  }
}
```

---

## Orders

### POST /orders
Create a new order.

**Request Body:**
```json
{
  "clientid": "string",
  "pid": "string",                // Product ID
  "domain": "string",             // Domain for the service
  "billingcycle": "string",       // monthly, quarterly, annually, etc.
  "paymentmethod": "string"       // Payment method
}
```

**Response:**
```json
{
  "ok": true,
  "orderid": "12345",
  "invoiceid": "67890",
  "status": "Pending"
}
```

---

## Service Status & Billing

### POST /api/myServices ⭐ NEW
Get all services/products for a client using only email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "clientId": "29097",
  "totalServices": 3,
  "services": [
    {
      "id": "12345",
      "domain": "example.com",
      "productName": "Pro Plan",
      "status": "Active",
      "nextDueDate": "2025-12-05",
      "billingCycle": "monthly",
      "amount": "7800.00"
    }
  ],
  "summary": {
    "active": 2,
    "suspended": 1,
    "pending": 0,
    "other": 0
  }
}
```

### POST /api/myDomains ⭐ NEW
Get all domains for a client using only email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "clientId": "29097",
  "totalDomains": 2,
  "domains": [
    {
      "id": "37077",
      "domain": "test123.com",
      "status": "Active",
      "expiryDate": "2026-01-15",
      "nextDueDate": "2025-12-05"
    }
  ],
  "summary": {
    "active": 2,
    "expired": 0,
    "pending": 0,
    "other": 0
  }
}
```

### POST /api/myAccount ⭐ NEW
Get complete account overview (services + domains) using only email.
Returns a single array with id and name only.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "clientId": "29097",
  "totalItems": 5,
  "items": [
    {
      "id": "12345",
      "name": "Pro Plan"
    },
    {
      "id": "12346",
      "name": "Business Plan"
    },
    {
      "id": "37077",
      "name": "example.com"
    },
    {
      "id": "37078",
      "name": "test.com"
    }
  ]
}
```

**Note:** 
- Services show product name (e.g., "Pro Plan", "Business Plan")
- Domains show domain name (e.g., "example.com", "test.com")
- All items in a single array with just `id` and `name`

### POST /api/serviceStatus
Check service status for a specific domain.

**Request Body:**
```json
{
  "email": "user@example.com",    // Auto-resolves to clientId
  "domain": "example.com"
}
```

**Response:**
```json
{
  "success": true,
  "service": {
    "id": "19032",
    "domain": "example.com",
    "status": "Active",
    "nextduedate": "2025-12-03"
  }
}
```

### POST /api/invoiceLookup
Look up invoice for a domain.

**Request Body:**
```json
{
  "email": "user@example.com",    // Auto-resolves to clientId
  "domain": "example.com"
}
```

**Response:**
```json
{
  "success": true,
  "invoice": {
    "invoiceId": "130901",
    "status": "Unpaid",
    "amount": "7800.00",
    "dueDate": "2025-12-03"
  }
}
```

### POST /api/renewService
Renew a service or domain.

**Request Body:**
```json
{
  "email": "user@example.com",    // Auto-resolves to clientId
  "domain": "example.com",        // Optional if serviceId provided
  "serviceId": "string",          // Optional if domain provided
  "period": "1",                  // Renewal period (domains only)
  "billingcycle": "monthly",      // Billing cycle (services only)
  "paymentmethod": "string"       // Optional, defaults to hostbreakbanktransfer
}
```

**Response:**
```json
{
  "success": true,
  "existingInvoice": false,
  "invoiceId": "130902",
  "amount": "7800.00",
  "dueDate": "2025-12-03",
  "message": "Renewal invoice #130902 has been generated..."
}
```

**Notes:**
- Uses GenInvoices API
- Respects WHMCS renewal window (typically 7-14 days before due date)
- Checks for existing unpaid invoices first
- Service must be Active status

### POST /api/confirmPayment
Confirm payment for an invoice (creates billing ticket).

**Request Body:**
```json
{
  "clientId": "string",
  "invoiceId": "string",
  "details": "string"             // Optional payment details
}
```

**Response:**
```json
{
  "success": true,
  "paid": false,
  "ticketId": "407148",
  "message": "I've opened a support ticket (#407148) for our billing team..."
}
```

### POST /api/triageIssue
Report an issue (creates tech support ticket).

**Request Body:**
```json
{
  "clientId": "string",
  "domain": "string",
  "issue": "string"               // Detailed issue description
}
```

**Response:**
```json
{
  "success": true,
  "resolution": "tech_ticket",
  "ticketId": "810154",
  "message": "I've opened a technical support ticket (#810154)..."
}
```

**Special Cases:**
- If service is suspended due to unpaid invoice, returns billing resolution instead
- Includes service details in ticket message

---

## Leads (VTiger)

### POST /leads
Create a new lead in VTiger CRM.

**Request Body:**
```json
{
  "firstname": "string",
  "lastname": "string",
  "email": "string",
  "phone": "string",
  "company": "string",
  "leadsource": "string"
}
```

**Response:**
```json
{
  "success": true,
  "leadId": "12x34567"
}
```

### GET /leads
Get all leads.

**Response:**
```json
{
  "success": true,
  "leads": [...]
}
```

### DELETE /leads/:id
Delete a lead.

**Response:**
```json
{
  "success": true,
  "message": "Lead deleted"
}
```

---

## Chats

### POST /chats
Create a new chat session.

**Request Body:**
```json
{
  "userId": "string",
  "message": "string"
}
```

**Response:**
```json
{
  "success": true,
  "chatId": "abc123"
}
```

### GET /chats
Get all chat sessions.

**Query Parameters:**
- `userId` - Filter by user ID (optional)

**Response:**
```json
{
  "success": true,
  "chats": [...]
}
```

### DELETE /chats/:id
Delete a chat session.

**Response:**
```json
{
  "success": true,
  "message": "Chat deleted"
}
```

---

## GID Information

### GET /gids
Get all available Group IDs (hosting categories).

**Response:**
```json
{
  "success": true,
  "gids": {
    "20": "WordPress Hosting",
    "21": "WooCommerce Hosting",
    "25": "Business Hosting",
    "6": "SSL Certificates"
  }
}
```

### GET /gids/:gid
Get name for a specific GID.

**Example:** `/gids/21`

**Response:**
```json
{
  "success": true,
  "gid": 21,
  "name": "WooCommerce Hosting"
}
```

---

## Middleware Features

### Auto Client Resolution
Endpoints under `/api/*` support automatic client ID resolution:

**From Email:**
```json
{
  "email": "user@example.com"
  // Automatically resolves to clientId
}
```

**From Domain:**
```json
{
  "domain": "example.com"
  // Automatically resolves to clientId
}
```

**Direct Client ID:**
```json
{
  "clientId": "29097"
  // Used directly
}
```

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": "Error message description"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

---

## Environment Variables

Required configuration in `.env`:

```env
# WHMCS Configuration
WHMCS_URL=https://your-whmcs.com/includes/api.php
WHMCS_API_IDENTIFIER=your_identifier
WHMCS_API_SECRET=your_secret

# Department Configuration
TECHSUPPORT_DEPTID=2
TECHSUPPORT_DEPTNAME=Support
BILLING_DEPTID=3
BILLING_DEPTNAME=Billing

# Payment Configuration
DEFAULT_PAYMENT_METHOD=hostbreakbanktransfer

# VTiger Configuration (optional)
VTIGER_URL=https://your-vtiger.com
VTIGER_USERNAME=username
VTIGER_ACCESS_KEY=access_key
```

---

## Testing

Run test suites:

```bash
# Ticket creation tests
node src/test/test-ticket-simple.js

# Get available departments
node src/test/get-departments.js

# Comprehensive endpoint tests
node src/test/comprehensive-endpoint-test.js
```

---

## Notes

1. **Windows Hosting:** When `needs_windows: true`, system filters plans with "windows" in the name within the purpose-determined GID
2. **Renewal Window:** Service renewals respect WHMCS's renewal window settings (typically 7-14 days before due date)
3. **Department Names:** Automatically resolved to IDs (Support → 2, Billing → 3, etc.)
4. **Caching:** WHMCS API responses are cached based on `WHMCS_CACHE_TTL` setting
5. **Response Time:** Average 1-2 seconds for most endpoints

---

**Last Updated:** December 6, 2025
**API Version:** 1.0
