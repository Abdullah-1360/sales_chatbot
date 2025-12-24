/**
 * Database User Management Usage Examples
 * 
 * This file demonstrates how to use the new database user management functionality
 * that runs before Step C (MySQL connection) in the WordPress diagnostic workflow.
 */

const DatabaseUserManagementStep = require('../src/steps/databaseUserManagement');
const CpanelClient = require('../src/lib/cpanel');

/**
 * Example 1: Basic Database and User Check
 */
async function basicDatabaseUserCheck() {
  console.log('=== Basic Database and User Check ===');
  
  const dbUserMgmt = new DatabaseUserManagementStep();
  
  // Example configuration from wp-config.php
  const config = {
    database: 'x98aailqrs_wp27',
    user: 'x98aailqrs_wp27',
    password: 'existing_password',
    host: 'localhost'
  };
  
  // Note: In real usage, you would have actual cPanel credentials
  const cpanelClient = new CpanelClient(
    'pcp3.mywebsitebox.com',
    'x98aailqrs',
    'your_whm_api_key',
    2087
  );
  
  try {
    const checkResult = await dbUserMgmt.checkDatabaseAndUser(cpanelClient, config);
    
    console.log('Database exists:', checkResult.databaseExists);
    console.log('User in database:', checkResult.userInDatabase);
    console.log('Issue:', checkResult.issue || 'None');
    console.log('Message:', checkResult.message);
    
    if (checkResult.databaseExists) {
      console.log('Database info:', {
        name: checkResult.databaseInfo.database,
        users: checkResult.databaseInfo.users,
        diskUsage: checkResult.databaseInfo.disk_usage
      });
    }
    
  } catch (error) {
    console.error('Check failed:', error.message);
  }
  console.log();
}

/**
 * Example 2: Complete User Management Workflow
 */
async function completeUserManagementWorkflow() {
  console.log('=== Complete User Management Workflow ===');
  
  const dbUserMgmt = new DatabaseUserManagementStep();
  
  // Configuration where user needs to be created
  const config = {
    database: 'x98aailqrs_wp27',
    user: 'old_or_missing_user',
    password: 'old_password',
    host: 'localhost'
  };
  
  const cpanelClient = new CpanelClient(
    'pcp3.mywebsitebox.com',
    'x98aailqrs',
    'your_whm_api_key',
    2087
  );
  
  try {
    console.log('Running complete user management workflow...');
    
    const result = await dbUserMgmt.manageDatabaseUser(
      cpanelClient,
      config,
      'public_html/wp-config.php'
    );
    
    console.log('Workflow Results:');
    console.log('  Success:', result.success);
    console.log('  Message:', result.message);
    
    if (result.userCreated) {
      console.log('  ✓ New user created:', result.finalCredentials.username);
    }
    
    if (result.userAssigned) {
      console.log('  ✓ User assigned to database with ALL PRIVILEGES');
    }
    
    if (result.wpConfigUpdated) {
      console.log('  ✓ wp-config.php updated with new credentials');
      console.log('  New username:', result.finalCredentials.username);
      console.log('  Database:', result.finalCredentials.database);
    }
    
    console.log('  Actions performed:');
    result.actions.forEach((action, index) => {
      console.log(`    ${index + 1}. ${action}`);
    });
    
  } catch (error) {
    console.error('Workflow failed:', error.message);
  }
  console.log();
}

/**
 * Example 3: Integration with WordPress Diagnostic Workflow
 */
async function wordpressDiagnosticIntegration() {
  console.log('=== WordPress Diagnostic Integration ===');
  
  // This shows how the database user management step integrates
  // into the complete WordPress diagnostic workflow
  
  const WordPressDiagnosticManager = require('../src/services/wordpressDiagnosticManager');
  
  const diagnosticManager = new WordPressDiagnosticManager();
  
  const params = {
    domain: 'example.com',
    cpanelHost: 'pcp3.mywebsitebox.com',
    cpanelUsername: 'x98aailqrs',
    serverName: 'pcp3', // This will be used to get the WHM API key
    skipGuards: true // Skip guards for this example
  };
  
  try {
    console.log('Running WordPress diagnostic with database user management...');
    
    const result = await diagnosticManager.diagnoseWordPressDatabase(params);
    
    console.log('Diagnostic Results:');
    console.log('  Overall Success:', result.success);
    console.log('  Status:', result.summary?.status);
    
    // Check Step B2 (Database User Management) results
    if (result.workflow.stepB2_databaseUserManagement) {
      const dbUserMgmt = result.workflow.stepB2_databaseUserManagement;
      
      console.log('  Database User Management:');
      console.log('    Success:', dbUserMgmt.success);
      console.log('    User Created:', dbUserMgmt.userCreated);
      console.log('    User Assigned:', dbUserMgmt.userAssigned);
      console.log('    wp-config Updated:', dbUserMgmt.wpConfigUpdated);
      console.log('    Message:', dbUserMgmt.message);
      
      if (dbUserMgmt.wpConfigUpdated) {
        console.log('    New Credentials:');
        console.log('      Username:', dbUserMgmt.finalCredentials.username);
        console.log('      Database:', dbUserMgmt.finalCredentials.database);
      }
    }
    
    // Check if MySQL connection succeeded after user management
    if (result.workflow.stepC_mysqlConnection) {
      console.log('  MySQL Connection:', result.workflow.stepC_mysqlConnection.success ? 'SUCCESS' : 'FAILED');
    }
    
  } catch (error) {
    console.error('Diagnostic failed:', error.message);
  }
  console.log();
}

/**
 * Example 4: Handling Different Scenarios
 */
async function handleDifferentScenarios() {
  console.log('=== Handling Different Scenarios ===');
  
  const dbUserMgmt = new DatabaseUserManagementStep();
  
  // Scenario 1: Database doesn't exist
  console.log('Scenario 1: Database does not exist');
  console.log('  Result: Workflow stops with DATABASE_NOT_FOUND error');
  console.log('  Action: User must create the database first in cPanel');
  console.log();
  
  // Scenario 2: Database exists, user exists and is assigned
  console.log('Scenario 2: Database and user are properly configured');
  console.log('  Result: No action needed, workflow continues to MySQL connection test');
  console.log('  Action: None - configuration is valid');
  console.log();
  
  // Scenario 3: Database exists, user not assigned
  console.log('Scenario 3: Database exists but user is not assigned');
  console.log('  Result: Creates new user and assigns to database');
  console.log('  Actions:');
  console.log('    1. Generate unique username (e.g., x98aailqrs_wp123456789)');
  console.log('    2. Generate strong password (16 characters)');
  console.log('    3. Create MySQL user via cPanel JSON API v3');
  console.log('    4. Assign ALL PRIVILEGES to user on database');
  console.log('    5. Update wp-config.php with new credentials');
  console.log();
  
  // Scenario 4: API call failures
  console.log('Scenario 4: cPanel API failures');
  console.log('  Result: Workflow continues with original credentials');
  console.log('  Action: Log errors and attempt MySQL connection with existing config');
  console.log();
}

/**
 * Example 5: API Endpoints Used
 */
function showApiEndpoints() {
  console.log('=== cPanel API Endpoints Used ===');
  
  console.log('1. List Databases (UAPI):');
  console.log('   URL: https://pcp3.mywebsitebox.com:2087/json-api/uapi_cpanel');
  console.log('   Method: POST');
  console.log('   Body: x-www-form-urlencoded');
  console.log('   Parameters:');
  console.log('     api.version: 1');
  console.log('     cpanel.user: x98aailqrs');
  console.log('     cpanel.module: Mysql');
  console.log('     cpanel.function: list_databases');
  console.log();
  
  console.log('2. Create User (JSON API v3):');
  console.log('   URL: https://pcp3.mywebsitebox.com:2087/json-api/cpanel');
  console.log('   Method: POST');
  console.log('   Body: x-www-form-urlencoded');
  console.log('   Parameters:');
  console.log('     cpanel_jsonapi_user: x98aailqrs');
  console.log('     cpanel_jsonapi_apiversion: 3');
  console.log('     cpanel_jsonapi_module: Mysql');
  console.log('     cpanel_jsonapi_func: create_user');
  console.log('     name: x98aailqrs_wp123456789');
  console.log('     password: [generated_strong_password]');
  console.log();
  
  console.log('3. Set Privileges (JSON API v3):');
  console.log('   URL: https://pcp3.mywebsitebox.com:2087/json-api/cpanel');
  console.log('   Method: POST');
  console.log('   Body: x-www-form-urlencoded');
  console.log('   Parameters:');
  console.log('     cpanel_jsonapi_user: x98aailqrs');
  console.log('     cpanel_jsonapi_apiversion: 3');
  console.log('     cpanel_jsonapi_module: Mysql');
  console.log('     cpanel_jsonapi_func: set_privileges_on_database');
  console.log('     user: x98aailqrs_wp123456789');
  console.log('     database: x98aailqrs_wp27');
  console.log('     privileges: ALL PRIVILEGES');
  console.log();
}

// Export examples for use in other modules
module.exports = {
  basicDatabaseUserCheck,
  completeUserManagementWorkflow,
  wordpressDiagnosticIntegration,
  handleDifferentScenarios,
  showApiEndpoints
};

// Run examples if executed directly
if (require.main === module) {
  async function runExamples() {
    await basicDatabaseUserCheck();
    await completeUserManagementWorkflow();
    await wordpressDiagnosticIntegration();
    await handleDifferentScenarios();
    showApiEndpoints();
    
    console.log('✓ All database user management examples completed!');
  }
  
  runExamples().catch(console.error);
}