# API Test Cases

This directory contains comprehensive test cases for the Billing Backend API using the following test domains:

- **Wmflippers.com**
- **Hostbrake.com**
- **Filter.pk**
- **Vizfilters.com**
- **Ibuy.com.pk**
- **macoode.com**

## Test Files

### 1. `api.test.js` - Node.js Test Suite
Automated test suite that can be run with Node.js.

### 2. `manual-tests.sh` - Bash Script (Linux/Mac)
Shell script for manual testing using curl commands.

### 3. `manual-tests.ps1` - PowerShell Script (Windows)
PowerShell script for manual testing on Windows.

## Setup

Before running tests, make sure:

1. Your API server is running:
   ```bash
   npm start
   ```

2. Set environment variables (optional):
   ```bash
   export API_URL=http://localhost:3000
   export TEST_CLIENT_ID=1
   export TEST_INVOICE_ID=1
   export TEST_SERVICE_ID=1
   ```

   For PowerShell:
   ```powershell
   $env:API_URL="http://localhost:3000"
   $env:TEST_CLIENT_ID="1"
   $env:TEST_INVOICE_ID="1"
   $env:TEST_SERVICE_ID="1"
   ```

## Running Tests

### Option 1: Node.js Test Suite

```bash
node tests/api.test.js
```

Run individual test:
```javascript
const { runTest } = require('./tests/api.test.js');
runTest('healthCheck');
```

### Option 2: Bash Script (Linux/Mac)

```bash
chmod +x tests/manual-tests.sh
./tests/manual-tests.sh
```

### Option 3: PowerShell Script (Windows)

```powershell
.\tests\manual-tests.ps1
```

## Test Coverage

### GET Endpoints

1. **Health Check** - `GET /health`
   - Verifies API is running

2. **Get Invoice** - `GET /invoices/:invoiceId`
   - Retrieves specific invoice details

3. **Get Invoices** - `GET /invoices`
   - Lists invoices with filters (clientId, status, pagination)

4. **Get Client Products** - `GET /clients/:clientId/products`
   - Lists client's hosting products

5. **Get Client Domains** - `GET /clients/:clientId/domains`
   - Lists client's registered domains

6. **Get Service Status** - `GET /clients/:clientId/service-status`
   - Gets status of all products and domains

### POST Endpoints

7. **Invoice Lookup** - `POST /api/invoiceLookup`
   - Tests with each domain: Wmflippers.com, Hostbrake.com, Filter.pk, Vizfilters.com, Ibuy.com.pk
   - Tests by invoice ID
   - Finds unpaid invoices related to domains

8. **Service Status** - `POST /api/serviceStatus`
   - Tests with each domain
   - Tests by service ID
   - Checks if service is active/suspended

9. **Renew Service** - `POST /api/renewService`
   - Tests renewal for each domain
   - Tests renewal by service ID
   - Creates renewal orders

10. **Confirm Payment** - `POST /api/confirmPayment`
    - Submits payment confirmation
    - Opens billing ticket if needed

11. **Triage Issue** - `POST /api/triageIssue`
    - Tests with each domain and different issues:
      - Wmflippers.com: Website 503 error
      - Hostbrake.com: Email service down
      - Filter.pk: Database timeout
      - Vizfilters.com: SSL certificate expired
      - Ibuy.com.pk: FTP access issues
      - macoode.com: Server performance issues

12. **Open Ticket** - `POST /tickets`
    - Creates support tickets

13. **Add Order** - `POST /orders`
    - Creates new orders

## Test Scenarios by Domain

### Wmflippers.com
- Invoice lookup
- Service status check
- Service renewal
- Triage: Website 503 error

### Hostbrake.com
- Invoice lookup
- Service status check
- Service renewal
- Triage: Email service down

### Filter.pk
- Invoice lookup
- Service status check
- Service renewal
- Triage: Database connection timeout

### Vizfilters.com
- Invoice lookup
- Service status check
- Service renewal
- Triage: SSL certificate expired

### Ibuy.com.pk
- Invoice lookup
- Service status check
- Service renewal
- Triage: FTP access not working

### macoode.com
- Invoice lookup
- Service status check
- Service renewal
- Triage: Server not responding, high CPU usage

## Expected Responses

### Success Response
```json
{
  "ok": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "ok": false,
  "message": "Error description",
  "code": 400
}
```

## Notes

- Tests use mock data by default
- Update `TEST_CLIENT_ID`, `TEST_INVOICE_ID`, and `TEST_SERVICE_ID` with real values
- Some tests may fail if the domains don't exist in your WHMCS system
- Ensure WHMCS API credentials are configured in `.env` file

## Troubleshooting

1. **Connection refused**: Make sure the API server is running
2. **404 errors**: Check if the endpoint paths are correct
3. **WHMCS errors**: Verify WHMCS credentials in `.env`
4. **Domain not found**: The test domains may not exist in your WHMCS database
