# WordPress Database Diagnostic API

A comprehensive system for diagnosing and fixing WordPress database connection errors through automated analysis of wp-config.php, MySQL connection testing, and targeted remediation.

## Overview

The WordPress Database Diagnostic API provides a complete workflow for identifying and resolving database connectivity issues in WordPress installations. It follows a structured approach with guards, parsing, diagnosis, and remediation steps.

## Architecture

### Core Components

- **Manager Pattern**: `WordPressDiagnosticManager` orchestrates the entire workflow
- **Step-based Processing**: Modular steps for guards, parsing, diagnosis, and remediation
- **Client Libraries**: Abstracted cPanel and MySQL clients for API interactions
- **Security First**: All passwords are masked in logs, destructive actions require approval

### Directory Structure

```
src/
├── lib/
│   ├── cpanel.js          # cPanel UAPI client
│   └── mysql.js           # MySQL connection and error handling
├── steps/
│   ├── guards.js          # Prerequisite validation
│   ├── parser.js          # wp-config.php parsing
│   ├── diagnosis.js       # Connection testing and error mapping
│   └── remediation.js     # Automated fixes
├── services/
│   └── wordpressDiagnosticManager.js  # Main orchestrator
├── controllers/
│   └── wordpressDiagnosticController.js  # API endpoints
└── routes/
    └── wordpressDiagnosticRoutes.js      # Route definitions
```

## API Endpoints

### 1. Full Diagnostic Workflow

**POST** `/wordpress/diagnose`

Performs complete diagnostic workflow including guards, parsing, diagnosis, and optional remediation.

#### Request Body

```json
{
  "domain": "example.com",
  "email": "client@example.com"
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-20T10:30:00.000Z",
    "domain": "example.com",
    "workflow": {
      "guards": {
        "passed": true,
        "checks": {
          "whmcsProduct": { "passed": true, "message": "Active product found" },
          "dns": { "passed": true, "resolvedIps": ["192.168.1.100"] },
          "wordpress": { "passed": true, "message": "WordPress installation found" }
        }
      },
      "parser": {
        "success": true,
        "config": {
          "database": "wp_database",
          "user": "wp_user",
          "host": "localhost",
          "port": 3306
        },
        "validation": {
          "valid": true,
          "warnings": ["Using default table prefix"]
        }
      },
      "diagnosis": {
        "basicDiagnosis": {
          "connectionTest": { "success": false },
          "rootCause": {
            "cause": "ACCESS_DENIED",
            "description": "Database user credentials are incorrect",
            "severity": "HIGH"
          },
          "recommendations": [
            "Verify database username and password",
            "Check if database user has proper privileges"
          ]
        },
        "databaseExists": true,
        "userExists": true
      },
      "remediation": {
        "success": true,
        "actionsAttempted": ["RE_GRANT_PRIVILEGES"],
        "results": [
          {
            "action": "RE_GRANT_PRIVILEGES",
            "success": true,
            "message": "Successfully re-granted privileges"
          }
        ]
      }
    },
    "summary": {
      "status": "FIXED",
      "message": "Database connection issues were successfully resolved"
    },
    "duration": 5432
  }
}
```

### 2. Quick Connection Test

**POST** `/wordpress/quick-test`

Lightweight test that parses wp-config.php and tests database connection.

#### Request Body

```json
{
  "domain": "example.com",
  "phone": "+1234567890"
}
```

#### Response

```json
{
  "success": false,
  "data": {
    "success": false,
    "config": "mysql://wp_user:***MASKED***@localhost:3306/wp_database",
    "error": "Access denied for user 'wp_user'@'localhost'",
    "rootCause": {
      "cause": "ACCESS_DENIED",
      "description": "Database user credentials are incorrect",
      "severity": "HIGH"
    },
    "type": "CONNECTION_ERROR"
  }
}
```

### 3. Service Capabilities

**GET** `/wordpress/capabilities`

Returns available diagnostic features and requirements.

#### Response

```json
{
  "success": true,
  "data": {
    "guards": {
      "whmcsProductCheck": {
        "description": "Verify WHMCS product is active",
        "required": false,
        "requiresWhmcsAccess": true
      },
      "dnsCheck": {
        "description": "Verify DNS configuration",
        "required": false
      },
      "wordpressCheck": {
        "description": "Verify WordPress installation",
        "required": true,
        "requiresCpanelAccess": true
      }
    },
    "remediation": {
      "privilegeRepair": {
        "description": "Re-grant database privileges",
        "requiresCpanelAccess": true,
        "destructive": false
      },
      "serviceRestart": {
        "description": "Restart MySQL service",
        "requiresWhmAccess": true,
        "destructive": true,
        "requiresApproval": true
      }
    }
  }
}
```

### 4. Health Check

**GET** `/wordpress/health`

Service health status for monitoring.

## Workflow Steps

### 1. Guards (Prerequisites)

Validates that conditions are met before proceeding:

- **WHMCS Product Check**: Verifies active hosting product exists
- **DNS Check**: Confirms domain resolves correctly
- **WordPress Check**: Ensures WordPress installation exists

### 2. Parser (Configuration Extraction)

Reads and parses wp-config.php to extract:

- Database name, username, password, host, port
- Table prefix and character set
- Validates configuration completeness and security

### 3. Diagnosis (Problem Identification)

Tests database connection and maps errors to root causes:

- **ACCESS_DENIED**: Wrong credentials or missing privileges
- **UNKNOWN_DATABASE**: Database doesn't exist
- **CONNECTION_REFUSED**: MySQL service down
- **TABLE_CORRUPT**: Database corruption
- **TOO_MANY_CONNECTIONS**: Connection limit reached

### 4. Remediation (Automated Fixes)

Attempts to resolve identified issues:

- **Privilege Repair**: Re-grant database user privileges
- **Service Restart**: Restart MySQL service (requires approval)
- **Table Repair**: Fix corrupted database tables (requires approval)

## Error Mapping

| MySQL Error | Root Cause | Severity | Auto-Fix Available |
|-------------|------------|----------|-------------------|
| ER_ACCESS_DENIED_ERROR | ACCESS_DENIED | HIGH | Yes (privilege repair) |
| ER_BAD_DB_ERROR | UNKNOWN_DATABASE | HIGH | No (manual creation) |
| ECONNREFUSED | CONNECTION_REFUSED | CRITICAL | Yes (service restart) |
| ER_CRASHED_ON_USAGE | TABLE_CORRUPT | HIGH | Yes (table repair) |
| ER_TOO_MANY_CONNECTIONS | TOO_MANY_CONNECTIONS | MEDIUM | Partial |

## Security Features

### Password Masking

All passwords are automatically masked in logs and responses:

```javascript
// Original
{ password: "secret123", user: "admin" }

// Logged/Returned
{ password: "***MASKED***", user: "admin" }
```

### Approval Requirements

Destructive actions require explicit approval flags:

```json
{
  "approveServiceRestart": true,    // Allow MySQL restart
  "approveTableRepair": true,       // Allow table repair
  "approveKillConnections": true    // Allow connection termination
}
```

## Usage Examples

### Basic Diagnostic

```bash
curl -X POST http://localhost:3000/wordpress/diagnose \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "email": "client@example.com"
  }'
```

### Quick Test Only

```bash
curl -X POST http://localhost:3000/wordpress/quick-test \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "phone": "+1234567890"
  }'
```

### Alternative with Phone

```bash
curl -X POST http://localhost:3000/wordpress/diagnose \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "phone": "+1234567890"
  }'
```

## Integration

### With WHMCS

The system can integrate with existing WHMCS services to validate product status:

```javascript
// In your application
const whmcsService = require('./services/whmService');
req.whmcsService = whmcsService;
// The diagnostic controller will automatically use it
```

### With Monitoring

Health check endpoint for monitoring systems:

```bash
# Check service health
curl http://localhost:3000/wordpress/health

# Expected response
{
  "success": true,
  "data": {
    "status": "healthy",
    "services": {
      "mysql": "available",
      "cpanel": "available"
    }
  }
}
```

## Error Handling

### Validation Errors (400)

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    "\"domain\" is required",
    "\"cpanelHost\" is required"
  ]
}
```

### Guard Failures (412)

```json
{
  "success": false,
  "data": {
    "summary": {
      "status": "FAILED_GUARDS",
      "message": "Guard checks failed - prerequisites not met",
      "issues": ["No active WHMCS product found"]
    }
  }
}
```

### System Errors (500)

```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to connect to cPanel API"
}
```

## Testing

Run the test suite:

```bash
npm test src/test/wordpressDiagnostic.test.js
```

Tests cover:
- API endpoint validation
- Parameter validation
- Password masking functionality
- wp-config.php parsing
- Database configuration validation

## Dependencies

- **mysql2**: MySQL client with promise support
- **winston**: Structured logging with password masking
- **axios**: HTTP client for cPanel/WHM API calls
- **joi**: Request validation
- **express**: Web framework

## Limitations

1. **cPanel Access Required**: Most features require cPanel UAPI access
2. **WHM Optional**: Advanced features like service restart need WHM access
3. **Network Connectivity**: Requires network access to target servers
4. **MySQL Version**: Tested with MySQL 5.7+ and MariaDB 10.3+
5. **WordPress Version**: Compatible with WordPress 4.0+

## Future Enhancements

- Support for WordPress multisite configurations
- Database performance analysis
- Automated backup before repairs
- Integration with more hosting control panels
- Real-time monitoring and alerting