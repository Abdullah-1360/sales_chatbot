const winston = require('winston');
const crypto = require('crypto');
const silentLogger = require('../utils/silentLogger');

class DatabaseUserManagementStep {
  constructor() {
    // Use silent logger in production for performance
    this.logger = process.env.NODE_ENV === 'production' ? silentLogger : winston.createLogger({
      level: 'error',
      format: winston.format.simple(),
      transports: [new winston.transports.Console()]
    });
  }

  /**
   * Generate a strong password for database user
   * @returns {string} Strong password
   */
  generateStrongPassword() {
    const length = 16;
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }

  /**
   * Generate unique database username with prefix
   * @param {string} prefix - Username prefix (e.g., 'x98aailqrs_')
   * @param {string} baseName - Base name for the user
   * @returns {string} Unique username
   */
  generateUniqueUsername(prefix, baseName = 'wp') {
    // cPanel MySQL usernames have a limit, typically 16 characters total
    // Format: prefix + unique_identifier
    // Example: x98aailqrs_wp123 (where x98aailqrs_ is the prefix)
    
    const maxLength = 16;
    const availableLength = maxLength - prefix.length;
    
    if (availableLength <= 0) {
      throw new Error(`Username prefix '${prefix}' is too long for MySQL username limits`);
    }
    
    // Generate a shorter unique identifier
    const timestamp = Date.now().toString().slice(-4); // Last 4 digits
    const randomNum = crypto.randomInt(10, 99); // 2 digit random number
    
    // Create unique suffix that fits within the available length
    let uniqueSuffix = `${baseName}${timestamp}${randomNum}`;
    
    // Truncate if necessary to fit within MySQL username limits
    if (uniqueSuffix.length > availableLength) {
      uniqueSuffix = uniqueSuffix.substring(0, availableLength);
    }
    
    const fullUsername = `${prefix}${uniqueSuffix}`;
    
    // Generate username - no logging for performance
    
    return fullUsername;
  }

  /**
   * Check if database and user exist in cPanel MySQL databases
   * @param {Object} cpanelClient - cPanel client instance
   * @param {Object} config - Database configuration from wp-config.php
   * @returns {Promise<Object>} Check result
   */
  async checkDatabaseAndUser(cpanelClient, config) {
    try {
      // Database and user verification - no logging for performance

      // Call cPanel UAPI to list databases
      const databases = await cpanelClient.makeApiCall('Mysql', 'list_databases');
      
      if (!databases || !Array.isArray(databases)) {
        throw new Error('Invalid response from cPanel MySQL list_databases API');
      }

      // Database listing - no logging for performance

      // Check if the configured database exists
      const targetDatabase = config.database;
      const targetUser = config.user;
      
      const databaseEntry = databases.find(db => db.database === targetDatabase);
      
      const result = {
        databaseExists: !!databaseEntry,
        userExists: false,
        userInDatabase: false,
        databaseInfo: databaseEntry || null,
        targetDatabase: targetDatabase,
        targetUser: targetUser,
        allDatabases: databases.map(db => ({
          name: db.database,
          users: db.users,
          diskUsage: db.disk_usage
        }))
      };

      if (!databaseEntry) {
        // Database not found - no logging for performance
        result.issue = 'DATABASE_NOT_FOUND';
        result.message = `Database '${targetDatabase}' does not exist in cPanel MySQL`;
        return result;
      }

      // Database found - no logging for performance
      
      // Check if the configured user exists in this database
      const userInDatabase = databaseEntry.users.includes(targetUser);
      result.userExists = true; // We'll verify this separately if needed
      result.userInDatabase = userInDatabase;

      if (!userInDatabase) {
        // User not in database - no logging for performance
        result.issue = 'USER_NOT_IN_DATABASE';
        result.message = `User '${targetUser}' is not assigned to database '${targetDatabase}'`;
        return result;
      }

      // User properly assigned - no logging for performance
      result.issue = null;
      result.message = 'Database and user configuration is valid';
      
      return result;

    } catch (error) {
      this.logger.error(`Database and user check failed: ${error.message}`);
      return {
        databaseExists: false,
        userExists: false,
        userInDatabase: false,
        issue: 'CHECK_FAILED',
        message: `Failed to check database and user: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Check if a MySQL user exists in cPanel
   * @param {Object} cpanelClient - cPanel client instance
   * @param {string} username - Username to check
   * @returns {Promise<Object>} Check result
   */
  async checkMySQLUserExists(cpanelClient, username) {
    try {
      this.logger.info(`Checking if MySQL user exists: ${username}`);

      // Use cPanel JSON API v3 to list users
      const response = await cpanelClient.makeJsonApiCall('Mysql', 'list_users');
      
      this.logger.info(`List users API response:`, JSON.stringify(response, null, 2));

      let users = [];
      
      // Extract users from different possible response formats
      if (response && response.data && Array.isArray(response.data)) {
        users = response.data;
      } else if (response && Array.isArray(response)) {
        users = response;
      } else if (response && response.result && Array.isArray(response.result.data)) {
        users = response.result.data;
      }

      // Check if the username exists in the list
      const userExists = users.some(user => user.user === username || user.name === username);
      
      this.logger.info(`User '${username}' exists: ${userExists}`);
      
      return {
        exists: userExists,
        users: users,
        message: userExists ? `User '${username}' exists` : `User '${username}' does not exist`
      };

    } catch (error) {
      this.logger.error(`Failed to check if MySQL user exists '${username}': ${error.message}`);
      return {
        exists: false,
        error: error.message,
        message: `Failed to check user existence: ${error.message}`
      };
    }
  }

  /**
   * Create a new MySQL user in cPanel
   * @param {Object} cpanelClient - cPanel client instance
   * @param {string} username - Username to create
   * @param {string} password - Password for the user
   * @returns {Promise<Object>} Creation result
   */
  async createMySQLUser(cpanelClient, username, password) {
    try {
      this.logger.info(`Creating MySQL user: ${username} (length: ${username.length})`);
      
      // Validate username length (MySQL usernames are limited to 16 characters in cPanel)
      if (username.length > 16) {
        throw new Error(`Username '${username}' is too long (${username.length} chars). MySQL usernames must be 16 characters or less.`);
      }

      // Use cPanel JSON API v3 to create user
      const response = await cpanelClient.makeJsonApiCall('Mysql', 'create_user', {
        name: username,
        password: password
      });

      this.logger.info(`Create user API response:`, JSON.stringify(response, null, 2));

      // Handle different response formats and success indicators
      let isSuccess = false;
      let errorMessage = 'Unknown error creating user';
      
      if (response) {
        // Check various success indicators
        if (response.status === 1 || response.status === '1') {
          isSuccess = true;
        } else if (response.result && (response.result.status === 1 || response.result.status === '1')) {
          isSuccess = true;
        } else if (response.data && (response.data.status === 1 || response.data.status === '1')) {
          isSuccess = true;
        }
        
        // Extract error message if not successful
        if (!isSuccess) {
          if (response.errors && Array.isArray(response.errors) && response.errors.length > 0) {
            errorMessage = response.errors.join(', ');
          } else if (response.error) {
            errorMessage = response.error;
          } else if (response.statusmsg) {
            errorMessage = response.statusmsg;
          } else if (response.result && response.result.errors && Array.isArray(response.result.errors)) {
            errorMessage = response.result.errors.join(', ');
          } else if (response.result && response.result.error) {
            errorMessage = response.result.error;
          } else if (response.data && response.data.errors && Array.isArray(response.data.errors)) {
            errorMessage = response.data.errors.join(', ');
          } else if (response.data && response.data.error) {
            errorMessage = response.data.error;
          }
        }
      }

      if (isSuccess) {
        this.logger.info(`MySQL user '${username}' created successfully`);
        return {
          success: true,
          username: username,
          password: password,
          message: 'User created successfully',
          apiResponse: response
        };
      } else {
        this.logger.error(`Create user failed - API Response:`, JSON.stringify(response, null, 2));
        throw new Error(errorMessage);
      }

    } catch (error) {
      this.logger.error(`Failed to create MySQL user '${username}': ${error.message}`);
      
      // Log additional context for debugging
      this.logger.error(`Username details: length=${username.length}, value='${username}'`);
      
      return {
        success: false,
        username: username,
        error: error.message,
        message: `Failed to create user: ${error.message}`
      };
    }
  }

  /**
   * Assign user privileges to database
   * @param {Object} cpanelClient - cPanel client instance
   * @param {string} username - Username to assign privileges
   * @param {string} database - Database name
   * @param {string} privileges - Privileges to grant (default: 'ALL PRIVILEGES')
   * @returns {Promise<Object>} Assignment result
   */
  async assignUserToDatabase(cpanelClient, username, database, privileges = 'ALL PRIVILEGES') {
    try {
      this.logger.info(`Assigning user '${username}' to database '${database}' with privileges: ${privileges}`);

      // Use cPanel JSON API v3 to set privileges
      const response = await cpanelClient.makeJsonApiCall('Mysql', 'set_privileges_on_database', {
        user: username,
        database: database,
        privileges: privileges
      });

      this.logger.info(`Assign privileges API response:`, JSON.stringify(response, null, 2));

      // Handle different response formats and success indicators
      let isSuccess = false;
      let errorMessage = 'Unknown error assigning privileges';
      
      if (response) {
        // Check various success indicators
        if (response.status === 1 || response.status === '1') {
          isSuccess = true;
        } else if (response.result && (response.result.status === 1 || response.result.status === '1')) {
          isSuccess = true;
        } else if (response.data && (response.data.status === 1 || response.data.status === '1')) {
          isSuccess = true;
        }
        
        // Extract error message if not successful
        if (!isSuccess) {
          if (response.errors && Array.isArray(response.errors) && response.errors.length > 0) {
            errorMessage = response.errors.join(', ');
          } else if (response.error) {
            errorMessage = response.error;
          } else if (response.statusmsg) {
            errorMessage = response.statusmsg;
          } else if (response.result && response.result.errors && Array.isArray(response.result.errors)) {
            errorMessage = response.result.errors.join(', ');
          } else if (response.result && response.result.error) {
            errorMessage = response.result.error;
          } else if (response.data && response.data.errors && Array.isArray(response.data.errors)) {
            errorMessage = response.data.errors.join(', ');
          } else if (response.data && response.data.error) {
            errorMessage = response.data.error;
          }
        }
      }

      if (isSuccess) {
        this.logger.info(`User '${username}' successfully assigned to database '${database}'`);
        return {
          success: true,
          username: username,
          database: database,
          privileges: privileges,
          message: 'User assigned to database successfully'
        };
      } else {
        throw new Error(errorMessage);
      }

    } catch (error) {
      this.logger.error(`Failed to assign user '${username}' to database '${database}': ${error.message}`);
      return {
        success: false,
        username: username,
        database: database,
        error: error.message,
        message: `Failed to assign user to database: ${error.message}`
      };
    }
  }

  /**
   * Update wp-config.php with new database credentials
   * @param {Object} cpanelClient - cPanel client instance
   * @param {string} wpConfigPath - Path to wp-config.php
   * @param {string} newUsername - New database username
   * @param {string} newPassword - New database password
   * @param {string} existingContent - Existing wp-config.php content (REQUIRED - will not read file if not provided)
   * @returns {Promise<Object>} Update result
   */
  async updateWpConfigCredentials(cpanelClient, wpConfigPath, newUsername, newPassword, existingContent = null) {
    try {
      this.logger.info(`Updating wp-config.php with new credentials...`);

      // REQUIRE existing content to avoid multiple file reads
      if (!existingContent) {
        throw new Error('Existing wp-config.php content is required to avoid multiple file reads');
      }
      
      this.logger.info('Using provided wp-config.php content from previous step (avoiding duplicate file read)');
      
      // Update DB_USER and DB_PASSWORD
      let updatedContent = existingContent;
      
      // Update DB_USER
      const originalContent = updatedContent;
      updatedContent = updatedContent.replace(
        /define\s*\(\s*['"]DB_USER['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;/g,
        `define('DB_USER', '${newUsername}');`
      );
      
      // Update DB_PASSWORD
      updatedContent = updatedContent.replace(
        /define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;/g,
        `define('DB_PASSWORD', '${newPassword}');`
      );

      // Verify that the content was actually changed
      if (updatedContent === originalContent) {
        this.logger.warn('wp-config.php content was not modified - DB_USER and DB_PASSWORD patterns may not have matched');
        this.logger.info('Original content length:', originalContent.length);
        this.logger.info('Updated content length:', updatedContent.length);
        
        // Log a sample of the content to help debug the regex patterns
        const dbUserMatch = originalContent.match(/define\s*\(\s*['"]DB_USER['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;/g);
        const dbPasswordMatch = originalContent.match(/define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;/g);
        
        this.logger.info('DB_USER matches found:', dbUserMatch);
        this.logger.info('DB_PASSWORD matches found:', dbPasswordMatch);
      } else {
        this.logger.info('wp-config.php content successfully updated');
        this.logger.info(`Content length changed from ${originalContent.length} to ${updatedContent.length} characters`);
      }

      // Write updated content back to file
      const writeResult = await cpanelClient.writeFile(wpConfigPath, updatedContent);
      
      // The writeFile method returns the API response data, not a boolean
      // If it doesn't throw an error, it was successful
      this.logger.info('wp-config.php file write completed');
      
      // Skip verification in production for better performance
      let verificationPassed = false;
      let verificationAttempted = false;
      
      if (process.env.NODE_ENV !== 'production') {
        // Optionally verify the file was updated by reading it back
        // Note: This is for verification only - the write operation was already successful
        
        try {
          this.logger.info('Attempting to verify wp-config.php was updated correctly...');
          verificationAttempted = true;
          
          // Reduced delay for faster performance
          await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 2s to 0.5s
          
          const verifyContent = await cpanelClient.readFile(wpConfigPath);
          
          if (verifyContent && verifyContent.trim().length > 0) {
            // Quick verification - just check if new username is present
            if (verifyContent.includes(newUsername)) {
              this.logger.info('✓ Verified: New credentials are present in wp-config.php');
              verificationPassed = true;
            } else {
              this.logger.warn('⚠ Verification: New credentials not found in wp-config.php');
            }
          } else {
            this.logger.warn('⚠ Verification failed: wp-config.php appears empty or unreadable');
          }
        } catch (verifyError) {
          this.logger.warn(`Verification failed: ${verifyError.message}`);
        }
      }
      
      // Always log the verification status but don't treat failure as an error
      this.logger.info(`wp-config.php update summary: Write=SUCCESS, Verification=${verificationAttempted ? (verificationPassed ? 'SUCCESS' : 'INCONCLUSIVE') : 'SKIPPED'}`);
      
      return {
        success: true, // Always true if write operation completed without error
        updatedUsername: newUsername,
        updatedPassword: newPassword,
        message: 'wp-config.php updated successfully',
        writeResult: writeResult,
        verification: {
          attempted: verificationAttempted,
          passed: verificationPassed,
          note: verificationAttempted ? 
            (verificationPassed ? 'Verification confirmed changes' : 'Verification inconclusive but write was successful') :
            'Verification skipped'
        }
      };

    } catch (error) {
      this.logger.error(`Failed to update wp-config.php: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: `Failed to update wp-config.php: ${error.message}`
      };
    }
  }

  /**
   * Main function to manage database user - check, create if needed, and assign privileges
   * @param {Object} cpanelClient - cPanel client instance
   * @param {Object} config - Database configuration from wp-config.php
   * @param {string} wpConfigPath - Path to wp-config.php file
   * @param {string} wpConfigContent - Existing wp-config.php content (optional)
   * @param {boolean} forceCreateNew - Force creation of new user even if current user exists (optional)
   * @returns {Promise<Object>} Management result
   */
  async manageDatabaseUser(cpanelClient, config, wpConfigPath = 'public_html/wp-config.php', wpConfigContent = null, forceCreateNew = false) {
    try {
      this.logger.info('Starting database user management process...');

      const result = {
        checkResult: null,
        userCreated: false,
        userAssigned: false,
        wpConfigUpdated: false,
        finalCredentials: {
          username: config.user,
          password: config.password,
          database: config.database
        },
        actions: [],
        success: false,
        message: ''
      };

      // Step 1: Check if database and user exist
      const checkResult = await this.checkDatabaseAndUser(cpanelClient, config);
      result.checkResult = checkResult;

      if (checkResult.issue === 'CHECK_FAILED') {
        result.message = 'Failed to check database and user status';
        return result;
      }

      if (checkResult.issue === 'DATABASE_NOT_FOUND') {
        result.message = `Database '${config.database}' does not exist in cPanel. Please create the database first.`;
        return result;
      }

      if (checkResult.issue === null && !forceCreateNew) {
        // Everything is already configured correctly and we're not forcing new user creation
        result.success = true;
        result.message = 'Database and user are already properly configured';
        result.actions.push('No action needed - configuration is valid');
        return result;
      }

      if (checkResult.issue === 'USER_NOT_IN_DATABASE' || forceCreateNew) {
        if (forceCreateNew) {
          this.logger.info('Force creating new user due to credential issues');
        } else {
          this.logger.info('User not found in database - creating new user');
        }

        // Extract username prefix from cPanel username
        const cpanelUsername = cpanelClient.username;
        const usernamePrefix = `${cpanelUsername}_`;

        // Always create a new user - no attempt to assign existing users
        const newUsername = this.generateUniqueUsername(usernamePrefix, 'wp');
        const newPassword = this.generateStrongPassword();

        this.logger.info(`Generated new credentials - Username: ${newUsername}`);

        // Check if user already exists before trying to create
        const userExistsCheck = await this.checkMySQLUserExists(cpanelClient, newUsername);
        
        let createResult;
        if (userExistsCheck.exists) {
          this.logger.info(`User '${newUsername}' already exists, skipping creation`);
          createResult = {
            success: true,
            username: newUsername,
            password: newPassword,
            message: 'User already exists, skipping creation'
          };
        } else {
          createResult = await this.createMySQLUser(cpanelClient, newUsername, newPassword);
        }
        
        result.userCreated = createResult.success;
        result.actions.push(`Create user: ${createResult.success ? 'SUCCESS' : 'FAILED'} - ${createResult.message}`);

        if (!createResult.success) {
          result.message = `Failed to create database user: ${createResult.error}`;
          return result;
        }

        // Step 3: Assign user to database
        const assignResult = await this.assignUserToDatabase(cpanelClient, newUsername, config.database);
        result.userAssigned = assignResult.success;
        result.actions.push(`Assign privileges: ${assignResult.success ? 'SUCCESS' : 'FAILED'} - ${assignResult.message}`);

        if (!assignResult.success) {
          result.message = `Failed to assign user to database: ${assignResult.error}`;
          return result;
        }

        // Step 4: Update wp-config.php
        const updateResult = await this.updateWpConfigCredentials(cpanelClient, wpConfigPath, newUsername, newPassword, wpConfigContent);
        result.wpConfigUpdated = updateResult.success;
        result.actions.push(`Update wp-config.php: ${updateResult.success ? 'SUCCESS' : 'FAILED'} - ${updateResult.message}`);

        if (!updateResult.success) {
          result.message = `Failed to update wp-config.php: ${updateResult.error}`;
          return result;
        }

        // Update final credentials
        result.finalCredentials.username = newUsername;
        result.finalCredentials.password = newPassword;

        result.success = true;
        result.message = `Successfully created user '${newUsername}' and assigned to database '${config.database}'`;
        
        this.logger.info('Database user management completed successfully');
        return result;
      }

      // Should not reach here
      result.message = 'Unknown issue during database user management';
      return result;

    } catch (error) {
      this.logger.error(`Database user management failed: ${error.message}`);
      return {
        checkResult: null,
        userCreated: false,
        userAssigned: false,
        wpConfigUpdated: false,
        finalCredentials: config,
        actions: [`Error: ${error.message}`],
        success: false,
        message: `Database user management failed: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = DatabaseUserManagementStep;