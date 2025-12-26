# cPHulk Management API

The cPHulk Management API provides endpoints for monitoring failed login attempts and managing IP whitelisting in cPHulk (cPanel's brute force protection system).

## Features

- **Failed Login Monitoring**: Check failed login attempts for specific IP addresses
- **IP Whitelisting**: Add IP addresses to cPHulk whitelist with automatic failed login cleanup
- **Client Verification**: Verify client ownership through email or phone number
- **Service Validation**: Ensure services are active and not expired/terminated/suspended
- **Multi-Server Support**: Automatically determines the correct server based on domain ownership

## Endpoints

### 1. Check Failed Login Attempts

**POST** `/cphulk/check-failed-logins`

Check failed login attempts for a specific IP address.

#### Request Body

```json
{
  "ip": "115.186.130.67",           // Required: IP address to check
  "domain": "example.com",          // Optional: Domain for client validation
  "email": "client@example.com",    // Optional: Client email (required if domain provided)
  "phone": "+1234567890"            // Optional: Client phone (alternative to email)
}
```

#### Response (Success)

```json
{
  "success": true,
  "status": "SUCCESS",
  "message": "Found 5 failed login attempts for IP 115.186.130.67",
  "timestamp": "2025-12-26T16:30:00.000Z",
  "ip": "115.186.130.67",
  "server": "pcp3",
  "domain": "example.com",
  "client": {
    "id": "123",
    "email": "client@example.com",
    "name": "John Doe"
  },
  "result": {
    "totalAttempts": 5,
    "uniqueUsers": 2,
    "services": ["ftp", "ssh"],
    "countries": ["Pakistan (PK)", "India (IN)"],
    "timeRange": {
      "earliest": "2025-12-26T16:09:39.000Z",
      "latest": "2025-12-26T16:10:20.000Z",
      "duration": "41 seconds"
    },
    "recentFailedLogins": [
      {
        "exptime": "2025-12-26 22:10:20",
        "user": "hello@uzairfarooq.pk",
        "ip": "115.186.130.67",
        "timeleft": "359",
        "service": "ftp",
        "country_name": "Pakistan",
        "logintime": "2025-12-26 16:10:20",
        "authservice": "pure-ftpd",
        "country_code": "PK"
      }
    ]
  },
  "performance": {
    "totalTime": 1250,
    "cached": false
  }
}
```

### 2. Whitelist IP Address (Intelligent Workflow)

**POST** `/cphulk/whitelist-ip`

Intelligently whitelist an IP address based on the type of authentication failures detected. The system analyzes failed login attempts and executes different workflows based on the `authservice` values. **All IP whitelisting is temporary for 24 hours with automatic removal.**

- **cpaneld**: Flush login history + 24-hour whitelist + schedule removal + create ticket
- **webmaild/dovecot**: Extract unique users + flush + 24-hour whitelist + schedule removal + create ticket
- **pure-ftpd**: Flush + 24-hour whitelist + schedule removal + create ticket
- **No failed logins**: 24-hour whitelist + schedule removal + create ticket

#### Request Body

```json
{
  "ip": "115.186.130.67",                    // Required: IP address to whitelist
  "domain": "example.com",                   // Optional: Domain for client validation
  "email": "client@example.com",             // Optional: Client email (required if domain provided)
  "phone": "+1234567890",                    // Optional: Client phone (alternative to email)
  "reason": "Legitimate client office IP"    // Optional: Reason for whitelisting
}
```

#### Workflow Logic

The endpoint first checks failed login attempts for the IP, then executes different workflows based on the `authservice` detected:

1. **Check Failed Logins**: Calls `get_cphulk_failed_logins` API
2. **Analyze AuthService**: Examines the `authservice` field in the response
3. **Execute Appropriate Workflow**:

   **For `cpaneld`**:
   - Flush login history: `flush_cphulk_login_history_for_ips`
   - Whitelist IP for 24 hours with reason "(done by bot)"
   - Schedule automatic removal after 24 hours
   - Create support ticket with workflow summary

   **For `webmaild` or `dovecot`**:
   - Extract unique users from failed login attempts
   - Flush login history: `flush_cphulk_login_history_for_ips`
   - Whitelist IP for 24 hours with reason "(done by bot)"
   - Schedule automatic removal after 24 hours
   - Create support ticket with affected users and workflow summary

   **For `pure-ftpd`**:
   - Flush login history: `flush_cphulk_login_history_for_ips`
   - Whitelist IP for 24 hours with reason "(done by bot)"
   - Schedule automatic removal after 24 hours
   - Create support ticket with workflow summary

   **For No Failed Logins**:
   - Whitelist IP for 24 hours with reason "(done by bot)"
   - Schedule automatic removal after 24 hours
   - Create support ticket for preventive whitelisting

#### Response (Success - cpaneld workflow)

```json
{
  "success": true,
  "status": "SUCCESS",
  "message": "cpaneld workflow completed: IP flushed, whitelisted (24hrs), removal scheduled, and ticket created",
  "timestamp": "2025-12-26T16:30:00.000Z",
  "ip": "115.186.130.67",
  "server": "pcp3",
  "domain": "example.com",
  "client": {
    "id": "123",
    "email": "client@example.com",
    "name": "John Doe"
  },
  "result": {
    "workflow": "intelligent_whitelist",
    "authServices": ["cpaneld"],
    "whitelisted": true,
    "flushed": true,
    "ticketCreated": true,
    "scheduledRemoval": true,
    "summary": [
      "Executing cpaneld workflow: flush + whitelist (24hrs) + ticket + schedule removal",
      "Login history flushed successfully",
      "IP whitelisted for 24 hours",
      "IP removal scheduled for 24 hours",
      "Support ticket created with workflow summary"
    ]
  },
  "performance": {
    "totalTime": 2100,
    "cached": false
  }
}
```

#### Response (Success - webmaild/dovecot workflow)

```json
{
  "success": true,
  "status": "SUCCESS",
  "message": "Mail service workflow completed: 2 users identified, IP flushed, whitelisted (24hrs), removal scheduled, and ticket created",
  "timestamp": "2025-12-26T16:30:00.000Z",
  "ip": "115.186.130.67",
  "server": "pcp3",
  "domain": "example.com",
  "client": {
    "id": "123",
    "email": "client@example.com",
    "name": "John Doe"
  },
  "result": {
    "workflow": "intelligent_whitelist",
    "authServices": ["webmaild"],
    "affectedUsers": ["hello@uzairfarooq.pk", "user2@example.com"],
    "whitelisted": true,
    "flushed": true,
    "ticketCreated": true,
    "scheduledRemoval": true,
    "summary": [
      "Executing webmaild/dovecot workflow: analyze users + flush + whitelist (24hrs) + ticket + schedule removal",
      "Identified 2 unique mail users: hello@uzairfarooq.pk, user2@example.com",
      "Login history flushed successfully",
      "IP whitelisted for 24 hours",
      "IP removal scheduled for 24 hours",
      "Support ticket created with user details and workflow summary"
    ]
  },
  "performance": {
    "totalTime": 3200,
    "cached": false
  }
}
```

### 3. Get Service Capabilities

**GET** `/cphulk/capabilities`

Returns information about available cPHulk service capabilities.

#### Response

```json
{
  "success": true,
  "data": {
    "monitoring": {
      "failedLogins": {
        "description": "Monitor failed login attempts by IP address",
        "required": true,
        "requiresServerAccess": true
      },
      "loginDetails": {
        "description": "Get detailed login attempt information including country, service, and timing",
        "required": true,
        "requiresServerAccess": true
      }
    },
    "whitelisting": {
      "ipWhitelist": {
        "description": "Add IP addresses to cPHulk whitelist",
        "requiresServerAccess": true,
        "destructive": false
      }
    },
    "validation": {
      "clientVerification": {
        "description": "Verify client ownership through email or phone",
        "required": true,
        "requiresWhmcsAccess": true
      },
      "serviceStatusCheck": {
        "description": "Validate service is active and not expired/terminated/suspended",
        "required": true,
        "requiresWhmcsAccess": true
      }
    }
  },
  "message": "cPHulk service capabilities"
}
```

### 4. Health Check

**GET** `/cphulk/health`

Check the health status of the cPHulk service.

#### Response

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-12-26T16:30:00.000Z",
    "version": "1.0.0",
    "services": {
      "cphulk": "available",
      "whmcs": "available",
      "whm": "available"
    }
  },
  "message": "cPHulk service is healthy"
}
```

## Error Responses

### Service Status Errors (412 Precondition Failed)

When a service is expired, terminated, or suspended:

```json
{
  "success": false,
  "status": "SERVICE_UNAVAILABLE",
  "message": "Your example.com service has expired. Please renew to continue using cPHulk management features.",
  "timestamp": "2025-12-26T16:30:00.000Z",
  "domain": "example.com",
  "serviceStatus": "EXPIRED",
  "performance": {
    "totalTime": 800,
    "cached": false
  }
}
```

### Phone Verification Errors (400 Bad Request)

When phone number verification fails:

```json
{
  "success": false,
  "error": "Phone number verification failed. Please contact us using the registered number: 123*****90",
  "registeredPhone": "123*****90"
}
```

### Client Not Found (404 Not Found)

When client cannot be found with provided credentials:

```json
{
  "success": false,
  "status": "CLIENT_NOT_FOUND",
  "message": "Client not found with provided email, phone, or domain ownership",
  "timestamp": "2025-12-26T16:30:00.000Z",
  "domain": "example.com",
  "performance": {
    "totalTime": 500,
    "cached": false
  }
}
```

### Validation Errors (400 Bad Request)

When request parameters are invalid:

```json
{
  "success": false,
  "status": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "errors": [
    "\"ip\" must be a valid IP address",
    "When domain is provided, either email or phone is required for client identification"
  ],
  "timestamp": "2025-12-26T16:30:00.000Z"
}
```

## Usage Flow

### Basic Usage (No Domain Validation)

1. Call `/cphulk/check-failed-logins` with just the IP address
2. If failed logins are found, call `/cphulk/whitelist-ip` to whitelist the IP

### Full Validation Flow (Recommended)

1. **Client Resolution**: Provide domain + email/phone to resolve client credentials
2. **Service Validation**: System checks if the service is active (not expired/terminated/suspended)
3. **Server Detection**: System automatically determines the correct server based on domain
4. **cPHulk Operation**: Perform the requested operation (check failed logins or whitelist IP)

## Security Features

- **Client Verification**: Email or phone number verification ensures only authorized users can manage cPHulk
- **Service Status Validation**: Prevents access for expired, terminated, or suspended services
- **Phone Number Masking**: Registered phone numbers are masked in error responses for privacy
- **Audit Logging**: All operations are logged for security auditing
- **Server Isolation**: Operations are performed on the correct server based on domain ownership

## Performance Features

- **Caching**: Failed login results are cached for 5 minutes to improve performance
- **Optimized Queries**: Efficient WHMCS and WHM API calls with minimal overhead
- **Performance Metrics**: Response times and operation breakdowns included in responses
- **Batch Operations**: Automatic cleanup of failed logins when whitelisting IPs

## Rate Limiting

The API includes built-in rate limiting and caching to prevent abuse:

- Failed login checks are cached for 5 minutes
- Client credential resolution is cached for 10 minutes
- Server information is cached for 10 minutes

## Examples

See `examples/cphulk-usage-examples.js` for comprehensive usage examples including:

- Basic failed login checking
- Client validation workflows
- Error handling patterns
- Phone verification examples
- Service status validation

## API Integration

The cPHulk API follows the same patterns as other endpoints in the system:

- Uses the same client credential resolution as WordPress diagnostic endpoint
- Follows the same service status validation as service status endpoint
- Uses the same response formatting and error handling patterns
- Integrates with existing WHM service infrastructure

## Server Requirements

- WHM API access with appropriate permissions
- cPHulk enabled on target servers
- Valid API keys configured for target servers
- WHMCS integration for client and service validation