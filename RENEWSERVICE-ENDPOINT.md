# RenewService Endpoint Documentation

## Overview

The `/api/renewservice` endpoint handles both hosting service and domain renewals with comprehensive validation and anti-duplication logic.

## Endpoint Details

- **URL**: `POST /api/renewservice`
- **Middleware**: 
  - `resolveClientId` - Resolves client ID from phone number or email
  - `validatePhoneNumber` - Validates phone number against WHMCS records

## Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | Yes | Domain name to renew |
| `number` | integer | No | Renewal period (years) for domains, defaults to 1 |
| `email` | string | No* | Client email (used for client resolution) |
| `phoneNumber` | string | No* | Client phone number (used for validation) |

*Either email or phone number must be provided for client identification

## Workflow

### 1. Service Validation (Pre-check)

**For Hosting Services:**
- Calls `GetClientsProducts` to find the specific serviceId
- Validates service status:
  - If status is `Cancelled` or `Terminated`: Returns error indicating service cannot be renewed and user should contact sales
  - If status is `Suspended`: Notes this (as an invoice likely exists)

**For Domains:**
- Calls `GetClientsDomains` to find the specific domain
- Validates domain status:
  - If status is `Cancelled`: Returns error
- Captures the `expirydate` or `nextduedate`

### 2. Check for Existing Unpaid Invoices (Anti-Duplication)

Before creating a new order, calls `GetInvoices` with `{ userid: clientId, status: 'Unpaid' }` and iterates through returned invoices and their items.

**Matching Logic:**
- **Hosting**: Checks if `relid` matches the input `serviceId` AND `type` matches "Hosting"
- **Domain**: Checks if the description contains the domain name (or if `relid`/`domainid` matches)

If a match is found:
- Does NOT create a new order
- Returns success response containing the existing `invoiceId`, `balance`, `duedate`

### 3. Create New Order

If no existing unpaid invoice is found, calls `AddOrder` with:
- `clientid`: The user's ID
- `paymentmethod`: Default to 'banktransfer'
- **If Hosting**: Uses `servicerenewals: [serviceId]`
- **If Domain**: Uses `domainrenewals: { [domainName]: period }`

### 4. Error Handling with Automatic Ticket Creation

If `AddOrder` returns `result: error`, catches standard WHMCS errors (e.g., "Domain cannot be renewed at this time") and:
- Creates a support ticket with detailed information about the renewal attempt
- Returns user-friendly error messages with the ticket ID
- Provides fallback responses if ticket creation fails

**Ticket Creation Scenarios:**
- **Cancelled/Terminated Services**: Creates billing department ticket with service details and reactivation options
- **Cancelled Domains**: Creates billing department ticket with domain details and re-registration options  
- **Renewal Restrictions**: Creates billing department ticket when WHMCS returns "cannot be renewed at this time"
- **Domain Exceptions**: Creates high-priority ticket for domain renewal API exceptions

## Response Examples

### Success - New Order Created

```json
{
  "success": true,
  "existingInvoice": false,
  "orderId": "12345",
  "invoiceId": "67890",
  "message": "Renewal order created successfully. Invoice #67890 has been generated for your hosting service renewal."
}
```

### Success - Existing Invoice Found

```json
{
  "success": true,
  "existingInvoice": true,
  "invoiceId": "67890",
  "balance": "29.99",
  "dueDate": "2024-01-15",
  "message": "An unpaid renewal invoice already exists: Invoice #67890 for 29.99 due on 2024-01-15. Please pay this invoice to complete the renewal."
}
```

### Error - Service Cannot be Renewed (with Ticket Creation)

```json
{
  "success": false,
  "error": "Service cannot be renewed",
  "message": "This service is Cancelled and cannot be renewed. A support ticket (#12345) has been created for our team to assist you with reactivation options.",
  "serviceId": "12345",
  "status": "Cancelled",
  "ticketId": "12345",
  "contactSales": true
}
```

### Error - Service/Domain Not Found

```json
{
  "success": false,
  "error": "Service or domain not found",
  "message": "No hosting service or domain registration found for example.com in your account."
}
```

### Error - Service/Domain Overdue (with Ticket Creation)

```json
{
  "success": false,
  "error": "Service is overdue and requires manual processing",
  "message": "This service is 4 day(s) overdue and cannot be automatically renewed. A support ticket (#12347) has been created for our billing team to manually process your renewal.",
  "serviceId": "26851",
  "serviceName": "Standard Plan",
  "domain": "test123.com",
  "nextDueDate": "2025-12-13",
  "daysUntilDue": -4,
  "ticketId": "12347",
  "isOverdue": true
}
```

### Error - Early Renewal Request (with Ticket Creation)

```json
{
  "success": false,
  "error": "Service renewal requested outside standard window",
  "message": "This service renewal was requested 14 day(s) before the due date, outside the standard renewal window. A support ticket (#12348) has been created for our billing team to process your early renewal request.",
  "serviceId": "26851",
  "serviceName": "Standard Plan",
  "domain": "test123.com",
  "nextDueDate": "2025-12-31",
  "daysUntilDue": 14,
  "ticketId": "12348",
  "isOverdue": false,
  "isEarlyRenewal": true
}
```

### Error - Renewal Not Available (with Ticket Creation)

```json
{
  "success": false,
  "error": "Renewal not available",
  "message": "Service cannot be renewed at this time. A support ticket (#12346) has been created for our team to investigate and assist you.",
  "ticketId": "12346"
}
```

## Implementation Notes

1. **Client Resolution**: The endpoint uses existing middleware to resolve client ID from email or phone number
2. **Phone Validation**: If a phone number is provided, it's validated against WHMCS records
3. **Service Priority**: Hosting services are checked first, then domain registrations
4. **Anti-Duplication**: Prevents creating duplicate renewal invoices by checking existing unpaid invoices
5. **Error Handling**: Provides user-friendly error messages for common WHMCS API errors
6. **Payment Method**: Defaults to 'banktransfer' but can be configured
7. **Automatic Ticket Creation**: Creates support tickets for renewal issues including:
   - Services with Cancelled/Terminated status
   - Cancelled domains
   - Overdue services and domains (beyond renewal window)
   - Early renewal requests (14+ days before due date, outside standard renewal window)
   - WHMCS renewal restrictions ("cannot be renewed at this time")
   - Domain renewal exceptions

## Testing

Use the provided test script:

```bash
node test-renewservice-endpoint.js
```

## Dependencies

- WHMCS API service methods: `getClientsProducts`, `getClientsDomains`, `getInvoices`, `addOrder`
- Middleware: `resolveClientId`, `validatePhoneNumber`
- Existing billing controller patterns

## Security

- Client ID resolution prevents unauthorized access to other clients' services
- Phone number validation ensures requests come from registered phone numbers
- Service ownership validation ensures users can only renew their own services