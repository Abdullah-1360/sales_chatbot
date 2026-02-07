---
inclusion: always
---

# WHM/cPanel Integration Guidelines

## Overview
WHM (Web Host Manager) provides server-level management for cPanel hosting. This integration allows automated server management, security operations, and WordPress diagnostics.

## Configuration
```bash
# WHM API Configuration
WHM_USERNAME=root
WHM_VERIFY_SSL=false

# Server-specific API keys (one per server)
WHM_API_KEY_CP1=your_cp1_api_key
WHM_API_KEY_PCP3=your_pcp3_api_key
WHM_API_KEY_RCP2=your_rcp2_api_key
```

## Server Naming Convention
- **CP1, CP2, CP3...**: cPanel shared hosting servers
- **PCP1, PCP2...**: Premium cPanel servers
- **RCP1, RCP2...**: Reseller cPanel servers
- **WCP1, WCP2...**: Windows hosting servers

## Service Layer: `src/services/whmService.js`

### Core Functions
```javascript
const { callWhmApi } = require('../services/whmService');

// List accounts on server
await callWhmApi(serverName, 'listaccts');

// Get account info
await callWhmApi(serverName, 'accountsummary', { user: 'username' });

// Manage SSL
await callWhmApi(serverName, 'start_autossl_check', { username: 'user' });

// Server statistics
await callWhmApi(serverName, 'getloadavg');
```

## cPanel Library: `src/lib/cpanel.js`

### Direct cPanel API Access
```javascript
const { CPanel } = require('../lib/cpanel');

const cpanel = new CPanel({
  host: 'server.example.com',
  username: 'cpanel_user',
  password: 'password', // or API token
  port: 2083,
  secure: true
});

// Execute cPanel API call
const result = await cpanel.execute('Module', 'function', { params });
```

## Credential Resolution
Use `cpanelCredentialResolver` service to automatically find credentials:

```javascript
const { resolveCpanelCredentials } = require('../services/cpanelCredentialResolver');

// Resolves from WHMCS client data
const credentials = await resolveCpanelCredentials(clientId, domain);
// Returns: { host, username, password, port, secure }
```

## WordPress Diagnostics

### Comprehensive Diagnostic Flow
Located in `src/controllers/wordpressComprehensiveDiagnosticController.js`:

1. **Connection Test** - Verify server reachability
2. **File System Check** - Verify WordPress files exist
3. **Database Connection** - Test MySQL connectivity
4. **Configuration Validation** - Check wp-config.php
5. **Plugin/Theme Check** - Identify problematic extensions
6. **Permission Check** - Verify file permissions
7. **Error Log Analysis** - Parse PHP/WordPress errors

### Diagnostic Steps Pattern
```javascript
// Located in src/steps/
const { diagnoseDatabase } = require('../steps/diagnosis');
const { fixDatabaseConnection } = require('../steps/remediation');

// Each step returns structured result
const result = {
  success: true/false,
  message: 'Human-readable message',
  details: { /* additional info */ },
  fixes: ['Applied fix 1', 'Applied fix 2']
};
```

## MySQL Management via cPanel

### Database Operations
```javascript
const { createDatabase, createUser, grantPrivileges } = require('../steps/mysql');

// Create database
await createDatabase(cpanel, 'dbname');

// Create user
await createUser(cpanel, 'username', 'password');

// Grant privileges
await grantPrivileges(cpanel, 'dbname', 'username');
```

### Database Host Management
```javascript
const { addMysqlHost, removeMysqlHost } = require('../steps/mysqlHostManagement');

// Add remote MySQL host
await addMysqlHost(cpanel, 'remote.mysql.com');
```

## Security: cPHulk Management

### cPHulk (Brute Force Protection)
Located in `src/services/cphulkManager.js`:

```javascript
const { unblockIP, listBlocked } = require('../services/cphulkManager');

// Unblock IP address
await unblockIP(serverName, ipAddress);

// List all blocked IPs
const blocked = await listBlocked(serverName);
```

### CSF (ConfigServer Firewall)
Located in `src/services/csfService.js`:

```javascript
const { allowIP, denyIP, removeIP } = require('../services/csfService');

// Allow IP through firewall
await allowIP(serverName, ipAddress, comment);

// Deny IP
await denyIP(serverName, ipAddress, comment);

// Remove from firewall
await removeIP(serverName, ipAddress);
```

## Server Cache Management

### MongoDB Server Cache
Servers are cached in MongoDB to reduce WHM API calls:

```javascript
const { getServers, refreshServerCache } = require('../services/mongoServerService');

// Get cached servers (auto-refresh if stale)
const servers = await getServers();

// Force refresh
await refreshServerCache();
```

Cache TTL: 30 minutes (configurable via `SERVER_CACHE_TTL_MINUTES`)
Force refresh: 24 hours (configurable via `SERVER_FORCE_REFRESH_HOURS`)

## SSH Operations

### SSH2 Library Usage
```javascript
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('command', (err, stream) => {
    stream.on('data', (data) => {
      console.log('Output:', data.toString());
    });
  });
});

conn.connect({
  host: 'server.example.com',
  port: 22,
  username: 'root',
  privateKey: require('fs').readFileSync('/path/to/key')
});
```

## Best Practices

### 1. Server Selection
- Always validate server name exists in configuration
- Use server cache to avoid repeated WHM API calls
- Handle server unavailability gracefully

### 2. Error Handling
```javascript
try {
  const result = await callWhmApi(server, 'action', params);
  
  if (result.metadata?.result === 0) {
    throw new Error(result.metadata?.reason || 'WHM API error');
  }
  
  return result.data;
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    throw new Error(`Server ${server} is unreachable`);
  }
  throw error;
}
```

### 3. Rate Limiting
- WHM API has rate limits per IP
- Implement exponential backoff for retries
- Cache results aggressively

### 4. Security
- Never log passwords or API keys
- Use API tokens instead of passwords when possible
- Verify SSL certificates in production (`WHM_VERIFY_SSL=true`)
- Rotate API keys regularly

### 5. WordPress Repairs
- Always backup before making changes
- Test fixes in staging when possible
- Log all repair actions for audit trail
- Provide rollback mechanism for critical changes

## Common Operations

### Check Account Exists
```javascript
const accounts = await callWhmApi(server, 'listaccts');
const exists = accounts.data.acct.some(a => a.user === username);
```

### Get Disk Usage
```javascript
const summary = await callWhmApi(server, 'accountsummary', { user: username });
const diskUsed = summary.data.acct[0].diskused;
```

### Restart Service
```javascript
await callWhmApi(server, 'restartservice', { service: 'httpd' });
```

### AutoSSL Check
```javascript
await callWhmApi(server, 'start_autossl_check', { username });
```

## Troubleshooting

### Connection Issues
- Verify WHM API key is correct for the server
- Check firewall allows connections from your IP
- Ensure WHM API is enabled on the server
- Verify port 2087 (WHM) or 2083 (cPanel) is accessible

### Authentication Failures
- Confirm username is 'root' for WHM
- Verify API token format (no extra spaces/newlines)
- Check token permissions in WHM

### Timeout Issues
- Increase timeout for long-running operations
- Use async operations for bulk actions
- Implement progress tracking for user feedback
