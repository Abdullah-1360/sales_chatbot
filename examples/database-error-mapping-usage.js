/**
 * Database Error Mapping Usage Examples
 * 
 * This file demonstrates how to use the new mapDatabaseError function,
 * mysql2/promise functionality, and localhost validation in the WordPress diagnostic tool.
 */

const MySQLClient = require('../src/lib/mysql');

/**
 * Example 1: Localhost Validation
 */
async function localhostValidationExample() {
  console.log('=== Localhost Validation Example ===');
  
  const client = new MySQLClient();
  
  // Test with remote host (should fail validation)
  const remoteConfig = {
    host: 'remote-mysql.example.com',
    user: 'wp_user',
    password: 'wp_password',
    database: 'wordpress_db'
  };
  
  console.log('Testing remote host configuration...');
  const result = await client.testConnectionPromise(remoteConfig);
  
  if (!result.success && result.errorCode === 'NON_LOCALHOST_HOST') {
    console.log('✗ Remote host detected - connection blocked');
    console.log('Message:', result.mappedError.userFriendlyMessage);
    console.log('Recommendations:');
    result.mappedError.recommendations.forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`);
    });
  }
  console.log();
}

/**
 * Example 2: Basic Error Mapping
 */
async function basicErrorMapping() {
  console.log('=== Basic Error Mapping Example ===');
  
  const client = new MySQLClient();
  
  // Simulate a common MySQL error
  const error = {
    code: 'ER_ACCESS_DENIED_ERROR',
    errno: 1045,
    message: "Access denied for user 'wp_user'@'localhost' (using password: YES)"
  };
  
  const result = client.mapDatabaseError(error);
  
  console.log('Diagnosis:', result.diagnosis);
  console.log('User-friendly message:', result.userFriendlyMessage);
  console.log('Severity:', result.severity);
  console.log('Recommendations:');
  result.recommendations.forEach((rec, index) => {
    console.log(`  ${index + 1}. ${rec}`);
  });
  console.log();
}

/**
 * Example 2: ER_DBACCESS_DENIED_ERROR with Probe
 */
async function dbAccessErrorWithProbe() {
  console.log('=== ER_DBACCESS_DENIED_ERROR with Probe Example ===');
  
  const client = new MySQLClient();
  
  const error = {
    code: 'ER_DBACCESS_DENIED_ERROR',
    errno: 1044,
    message: "Access denied for user 'wp_user'@'localhost' to database 'wordpress_db'"
  };
  
  // Scenario 1: Database is missing
  console.log('Scenario 1: Database Missing');
  const probeMissingDb = { diagnosis: 'DATABASE_MISSING' };
  const resultMissingDb = client.mapDatabaseError(error, probeMissingDb);
  console.log('  Diagnosis:', resultMissingDb.diagnosis);
  console.log('  Message:', resultMissingDb.userFriendlyMessage);
  console.log();
  
  // Scenario 2: Permissions are missing
  console.log('Scenario 2: Permissions Missing');
  const probePermMissing = { diagnosis: 'PERMISSION_MISSING' };
  const resultPermMissing = client.mapDatabaseError(error, probePermMissing);
  console.log('  Diagnosis:', resultPermMissing.diagnosis);
  console.log('  Message:', resultPermMissing.userFriendlyMessage);
  console.log('  SQL Fix:', resultPermMissing.recommendations[1]);
  console.log();
}

/**
 * Example 3: Promise-based Connection Testing
 */
async function promiseBasedConnection() {
  console.log('=== Promise-based Connection Testing ===');
  
  const client = new MySQLClient();
  
  const config = {
    host: 'localhost',
    user: 'test_user',
    password: 'test_password',
    database: 'test_database',
    port: 3306
  };
  
  try {
    const result = await client.testConnectionPromise(config);
    
    if (result.success) {
      console.log('✓ Connection successful!');
      console.log('Connected to:', result.connectionDetails.host);
    } else {
      console.log('✗ Connection failed');
      console.log('Error:', result.error);
      
      if (result.mappedError) {
        console.log('Mapped diagnosis:', result.mappedError.diagnosis);
        console.log('User message:', result.mappedError.userFriendlyMessage);
        console.log('Severity:', result.mappedError.severity);
      }
    }
  } catch (error) {
    console.error('Connection test error:', error.message);
  }
  console.log();
}

/**
 * Example 4: Database Probe for ER_DBACCESS_DENIED_ERROR
 */
async function databaseProbeExample() {
  console.log('=== Database Probe Example ===');
  
  const client = new MySQLClient();
  
  const config = {
    host: 'localhost',
    user: 'test_user',
    password: 'test_password',
    database: 'maybe_missing_db',
    port: 3306
  };
  
  try {
    const probeResult = await client.probeDatabaseAccess(config);
    
    console.log('Probe success:', probeResult.success);
    console.log('Diagnosis:', probeResult.diagnosis);
    console.log('Message:', probeResult.message);
    console.log('Details:', probeResult.details);
    
    // Now use the probe result with error mapping
    if (probeResult.success) {
      const mockError = {
        code: 'ER_DBACCESS_DENIED_ERROR',
        errno: 1044,
        message: `Access denied for user '${config.user}' to database '${config.database}'`
      };
      
      const mappedResult = client.mapDatabaseError(mockError, probeResult);
      console.log('Final diagnosis:', mappedResult.diagnosis);
      console.log('User message:', mappedResult.userFriendlyMessage);
    }
  } catch (error) {
    console.error('Probe error:', error.message);
  }
  console.log();
}

/**
 * Example 5: Complete WordPress Diagnostic Workflow
 */
async function completeWorkflowExample() {
  console.log('=== Complete WordPress Diagnostic Workflow ===');
  
  const client = new MySQLClient();
  
  // WordPress configuration from wp-config.php
  const wpConfig = {
    host: 'localhost',
    user: 'wp_user',
    password: 'wp_password',
    database: 'wordpress_db',
    port: 3306
  };
  
  try {
    // Step 1: Test connection
    console.log('Step 1: Testing connection...');
    const connectionResult = await client.testConnectionPromise(wpConfig);
    
    if (connectionResult.success) {
      console.log('✓ WordPress database connection successful!');
      return;
    }
    
    console.log('✗ Connection failed:', connectionResult.error);
    
    // Step 2: Check if it's ER_DBACCESS_DENIED_ERROR
    if (connectionResult.mappedError && 
        connectionResult.mappedError.code === 1044) {
      
      console.log('Step 2: Probing database access...');
      const probeResult = await client.probeDatabaseAccess(wpConfig);
      
      // Step 3: Re-map error with probe result
      const finalDiagnosis = client.mapDatabaseError(
        { code: 'ER_DBACCESS_DENIED_ERROR', errno: 1044, message: connectionResult.error },
        probeResult
      );
      
      console.log('Final diagnosis:', finalDiagnosis.diagnosis);
      console.log('User message:', finalDiagnosis.userFriendlyMessage);
      console.log('Recommendations:');
      finalDiagnosis.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    } else {
      // Step 3: Use direct error mapping
      console.log('Step 2: Using direct error mapping...');
      console.log('Diagnosis:', connectionResult.mappedError.diagnosis);
      console.log('User message:', connectionResult.mappedError.userFriendlyMessage);
    }
    
  } catch (error) {
    console.error('Workflow error:', error.message);
  }
}

// Run examples
async function runExamples() {
  await basicErrorMapping();
  await dbAccessErrorWithProbe();
  await promiseBasedConnection();
  await databaseProbeExample();
  await completeWorkflowExample();
  
  console.log('✓ All examples completed!');
}

// Export for use in other modules
module.exports = {
  localhostValidationExample,
  basicErrorMapping,
  dbAccessErrorWithProbe,
  promiseBasedConnection,
  databaseProbeExample,
  completeWorkflowExample
};

// Run if executed directly
if (require.main === module) {
  async function runExamples() {
    await localhostValidationExample();
    await basicErrorMapping();
    await dbAccessErrorWithProbe();
    await promiseBasedConnection();
    await databaseProbeExample();
    await completeWorkflowExample();
    
    console.log('✓ All examples completed!');
  }
  
  runExamples().catch(console.error);
}