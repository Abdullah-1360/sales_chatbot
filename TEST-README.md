# cPHulk IP Whitelisting and Removal Tests

This directory contains comprehensive test files for the cPHulk IP whitelisting and removal functionality.

## Test Files

### 1. `test-ip-whitelist-removal.js` (Recommended)
**Simple, focused test for IP whitelisting lifecycle**

This test demonstrates the complete workflow:
1. Check current failed login status
2. Execute intelligent whitelisting workflow
3. Verify whitelisting worked
4. Simulate 24-hour removal process
5. Test different scenarios

### 2. `test-cphulk-whitelist.js` (Comprehensive)
**Full test suite with detailed reporting**

Comprehensive test suite covering:
- All endpoint functionality
- Error scenarios
- Performance testing
- Caching validation
- Service health checks
- Detailed reporting

### 3. `test-config.env`
**Configuration template**

Environment variables for test configuration.

## Quick Start

### Prerequisites
1. Ensure your API server is running
2. Configure environment variables
3. Have valid test data (domain, email, etc.)

### Running Tests

#### Simple Test (Recommended for first-time testing)
```bash
# Run complete workflow test
node test-ip-whitelist-removal.js

# Run individual steps
node test-ip-whitelist-removal.js check      # Check failed logins only
node test-ip-whitelist-removal.js whitelist  # Whitelist IP only
node test-ip-whitelist-removal.js verify     # Verify whitelisting only
node test-ip-whitelist-removal.js simulate   # Simulate removal only
node test-ip-whitelist-removal.js scenarios  # Test scenarios only
```

#### Comprehensive Test Suite
```bash
# Run all tests
node test-cphulk-whitelist.js

# Run specific test categories
node test-cphulk-whitelist.js intelligentWhitelisting
node test-cphulk-whitelist.js errorScenarios
node test-cphulk-whitelist.js performanceAndCaching
```

### Configuration

#### Option 1: Environment Variables
```bash
export API_BASE_URL=http://localhost:3000
export TEST_IP=115.186.130.67
export TEST_DOMAIN=example.com
export TEST_EMAIL=client@example.com
export DEBUG=true

node test-ip-whitelist-removal.js
```

#### Option 2: .env File
```bash
# Copy configuration template
cp test-config.env .env

# Edit .env with your values
nano .env

# Run tests
node test-ip-whitelist-removal.js
```

## Test Scenarios

### Scenario 1: cpaneld Authentication Failures
```bash
# Tests workflow for cPanel login failures
# Expected: Flush + 24hr whitelist + schedule removal + ticket
```

### Scenario 2: webmaild/dovecot Mail Failures
```bash
# Tests workflow for mail service failures
# Expected: Extract users + flush + 24hr whitelist + schedule removal + ticket
```

### Scenario 3: pure-ftpd FTP Failures
```bash
# Tests workflow for FTP failures
# Expected: Flush + 24hr whitelist + schedule removal + ticket
```

### Scenario 4: No Failed Logins
```bash
# Tests preventive whitelisting
# Expected: 24hr whitelist + schedule removal + ticket
```

## Expected Test Output

### Successful Whitelisting Test
```
🔧 cPHulk IP Whitelisting and Removal Test
==========================================
API URL: http://localhost:3000
Test IP: 115.186.130.67
Domain: example.com
Email: client@example.com
==========================================

📋 Step 1: Checking current failed login status...
✅ Success! Current status:
   - Total Attempts: 5
   - Unique Users: 2
   - Services: ftp, mail
   - Countries: Pakistan (PK), India (IN)

🛡️  Step 2: Whitelisting IP using intelligent workflow...
✅ Success! Whitelisting completed:
   - Workflow: intelligent_whitelist
   - Auth Services: webmaild, pure-ftpd
   - IP Whitelisted: Yes
   - Login History Flushed: Yes
   - Ticket Created: Yes
   - Scheduled for Removal: Yes (24 hours)
   - Affected Users: hello@uzairfarooq.pk, user2@example.com

🔍 Step 3: Verifying whitelisting worked...
✅ Verification completed:
   - Total Attempts Now: 0
   - ✅ Perfect! No failed login attempts remaining

⏰ Step 4: Simulating 24-hour IP removal process...
✅ Removal simulation completed

🎉 TEST COMPLETED SUCCESSFULLY!
```

### Error Scenarios
The tests also validate proper error handling:

#### Service Status Errors (412)
```json
{
  "success": false,
  "status": "SERVICE_UNAVAILABLE",
  "message": "Your example.com service has expired. Please renew to continue using cPHulk management features.",
  "serviceStatus": "EXPIRED"
}
```

#### Phone Verification Errors (400)
```json
{
  "success": false,
  "error": "Phone number verification failed. Please contact us using the registered number: 123*****90",
  "registeredPhone": "123*****90"
}
```

## Test Reports

### Simple Test
The simple test provides console output with step-by-step results.

### Comprehensive Test
The comprehensive test generates:
- Console output with detailed results
- `cphulk-test-report.json` with full test data
- Performance metrics
- Success/failure statistics

## Troubleshooting

### Common Issues

#### 1. Connection Refused
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```
**Solution**: Ensure your API server is running on the correct port.

#### 2. Service Status Error (412)
```
Service unavailable - domain may be expired/terminated/suspended
```
**Solution**: Use a valid, active domain/service in your test configuration.

#### 3. Phone Verification Failed (400)
```
Phone verification failed
```
**Solution**: Use the correct phone number associated with the client account.

#### 4. Client Not Found (404)
```
Client not found with provided email, phone, or domain ownership
```
**Solution**: Ensure the test email/phone/domain exists in your WHMCS system.

### Debug Mode
Enable debug mode for detailed API responses:
```bash
DEBUG=true node test-ip-whitelist-removal.js
```

### API Server Logs
Check your API server logs for detailed information about:
- WHM API calls being made
- Authentication attempts
- Database queries
- Error details

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: cPHulk Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npm start &
      - run: sleep 10
      - run: node test-ip-whitelist-removal.js
        env:
          API_BASE_URL: http://localhost:3000
          TEST_IP: 192.168.1.100
          TEST_DOMAIN: test.example.com
          TEST_EMAIL: test@example.com
```

### Docker Testing
```bash
# Build and run API server
docker build -t cphulk-api .
docker run -d -p 3000:3000 --name cphulk-test cphulk-api

# Run tests
docker exec cphulk-test node test-ip-whitelist-removal.js

# Cleanup
docker stop cphulk-test
docker rm cphulk-test
```

## Production Considerations

### Scheduled Removal Implementation
The tests simulate the 24-hour removal process. In production, implement:

1. **Job Scheduler** (node-cron, bull queue, etc.)
2. **Database Storage** for scheduled jobs
3. **Removal Endpoint** that calls WHM API
4. **Logging and Monitoring**
5. **Error Handling and Retries**

### Example Implementation
```javascript
const cron = require('node-cron');

// Run every hour to check for expired whitelists
cron.schedule('0 * * * *', async () => {
  const expiredWhitelists = await getExpiredWhitelists();
  
  for (const whitelist of expiredWhitelists) {
    try {
      await removeIPFromWhitelist(whitelist.ip, whitelist.server);
      await markAsRemoved(whitelist.id);
      console.log(`Removed ${whitelist.ip} from ${whitelist.server}`);
    } catch (error) {
      console.error(`Failed to remove ${whitelist.ip}:`, error);
      await scheduleRetry(whitelist.id);
    }
  }
});
```

## Support

For issues with the tests:
1. Check the troubleshooting section above
2. Verify your API server configuration
3. Ensure test data is valid
4. Check server logs for detailed error information
5. Run tests in debug mode for more information