# Database User Repair Process

## Issue: User Doesn't Exist (e.g., x98aaiqrs_wp489 instead of x98aailqrs_wp489)

When the WordPress diagnostic encounters a database connection error like:
```
Access denied for user 'x98aaiqrs_wp489'@'110.93.226.228' (using password: YES)
```

## Automatic Repair Process

### 1. Initial Detection
- **Phase 3**: Database connection test fails with `ER_ACCESS_DENIED_ERROR`
- **Status**: `user_access_denied` 
- **Action**: Background repair is automatically scheduled

### 2. Background Repair Steps

#### Step 1: MySQL Host Management
```javascript
// Add local machine IP to MySQL remote access hosts
const hostResult = await mysqlHostManagement.addLocalMachineIPToMySQLHosts(cpanelClient);
// Result: Local IP (110.93.226.228) added to MySQL allowed hosts
```

#### Step 2: Database & User Analysis
```javascript
const checkResult = await dbUserManagement.checkDatabaseAndUser(cpanelClient, dbConfig);
// Checks:
// - Does database exist? ✅ (usually yes)
// - Does user exist? ❌ (x98aaiqrs_wp489 doesn't exist)
// - Is user assigned to database? ❌ (can't be assigned if doesn't exist)
```

#### Step 3: New User Creation
```javascript
// Generate new unique username with correct prefix
const newUsername = generateUniqueUsername('x98aailqrs_', 'wp'); 
// Result: x98aailqrs_wp1234 (with correct spelling)

// Generate strong password
const newPassword = generateStrongPassword();
// Result: 16-character strong password

// Create MySQL user via cPanel API
const createResult = await createMySQLUser(cpanelClient, newUsername, newPassword);
```

#### Step 4: Database Privileges
```javascript
// Assign ALL PRIVILEGES to the new user on the database
const assignResult = await assignUserToDatabase(cpanelClient, newUsername, database, 'ALL PRIVILEGES');
// Result: User can SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, etc.
```

#### Step 5: wp-config.php Update
```javascript
// Read current wp-config.php
const wpConfigContent = await cpanelClient.readFile('public_html/wp-config.php');

// Update DB_USER and DB_PASSWORD
const updatedContent = wpConfigContent
  .replace(/define\s*\(\s*['"]DB_USER['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;/g, 
           `define('DB_USER', '${newUsername}');`)
  .replace(/define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;/g, 
           `define('DB_PASSWORD', '${newPassword}');`);

// Write updated content back to file
await cpanelClient.writeFile('public_html/wp-config.php', updatedContent);
```

#### Step 6: Connection Verification
```javascript
// Test new connection to ensure it works
const testResult = await mysqlClient.testConnectionPromise({
  database: dbConfig.database,
  user: newUsername,
  password: newPassword,
  host: dbConfig.host
});
// Result: Connection should now succeed
```

#### Step 7: Cleanup
```javascript
// Remove local IP from MySQL hosts after 5 minutes
setTimeout(() => {
  mysqlHostManagement.removeLocalMachineIPFromMySQLHosts(cpanelClient);
}, 300000);
```

## Expected Results

### Before Repair:
```
❌ Database connection: FAILED
❌ User: x98aaiqrs_wp489 (doesn't exist)
❌ Error: Access denied for user 'x98aaiqrs_wp489'@'110.93.226.228'
```

### After Repair:
```
✅ Database connection: SUCCESS
✅ User: x98aailqrs_wp1234 (newly created)
✅ Privileges: ALL PRIVILEGES granted
✅ wp-config.php: Updated with new credentials
✅ WordPress: Can now connect to database
```

## Logging Output

The system provides detailed logging throughout the process:

```
[INFO] Database user issue detected, creating new user and updating wp-config.php
[INFO] Successfully read wp-config.php for user creation
[INFO] Generated new credentials - Username: x98aailqrs_wp1234
[INFO] MySQL user 'x98aailqrs_wp1234' created successfully
[INFO] User 'x98aailqrs_wp1234' successfully assigned to database
[INFO] wp-config.php updated successfully
[INFO] New database user connection test successful
[INFO] Background database repair completed successfully
```

## API Methods Used

1. **cPanel JSON API v3 - MySQL Module**:
   - `create_user` - Create new MySQL user
   - `set_privileges_on_database` - Grant ALL PRIVILEGES
   - `add_host` - Add remote IP to MySQL hosts
   - `delete_host` - Remove remote IP (cleanup)

2. **cPanel UAPI - Fileman Module**:
   - `get_file_content` - Read wp-config.php
   - `save_file_content` - Write updated wp-config.php

3. **MySQL2 Library**:
   - Direct database connection testing
   - Connection verification

## Security Features

- **Strong Password Generation**: 16-character passwords with mixed case, numbers, and symbols
- **Unique Username Generation**: Timestamp + random number to prevent conflicts
- **Proper Privilege Management**: Only grants necessary database privileges
- **Temporary Remote Access**: MySQL host access is automatically cleaned up
- **Secure API Communication**: Uses WHM API keys for authentication

This process ensures that when a WordPress site has database connection issues due to missing or incorrect users, the system automatically creates a new user, grants proper privileges, and updates the WordPress configuration - all without manual intervention.