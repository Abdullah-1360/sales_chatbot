/**
 * MySQL Connection Demo
 * 
 * This script demonstrates the MySQL connection functionality that was added
 * after stepB_parseConfig in the WordPress diagnostic workflow.
 */

const MySQLStep = require('../src/steps/mysql');

// Mock parsed configuration (as would come from stepB_parseConfig)
const mockParsedConfig = {
  success: true,
  config: {
    database: 'wordpress_db',
    user: 'wp_user',
    password: 'wp_password',
    host: 'localhost',
    port: 3306,
    charset: 'utf8',
    collate: '',
    tablePrefix: 'wp_'
  },
  rawConfig: {
    DB_NAME: 'wordpress_db',
    DB_USER: 'wp_user',
    DB_PASSWORD: 'wp_password',
    DB_HOST: 'localhost',
    DB_CHARSET: 'utf8',
    DB_COLLATE: '',
    table_prefix: 'wp_'
  },
  validation: {
    valid: true,
    issues: [],
    warnings: []
  }
};

async function demonstrateMySQLConnection() {
  console.log('=== MySQL Connection Demo ===\n');
  
  const mysqlStep = new MySQLStep();
  
  console.log('1. Testing MySQL connection with parsed configuration...');
  console.log('   Configuration:');
  console.log(`   - Host: ${mockParsedConfig.config.host}`);
  console.log(`   - Database: ${mockParsedConfig.config.database}`);
  console.log(`   - User: ${mockParsedConfig.config.user}`);
  console.log(`   - Port: ${mockParsedConfig.config.port}\n`);
  
  try {
    // Test the MySQL connection
    const result = await mysqlStep.testMySQLConnection(mockParsedConfig);
    
    console.log('2. Connection test results:');
    console.log(`   - Overall Success: ${result.success}`);
    
    if (result.dnsResolution) {
      console.log('\n3. DNS Resolution:');
      console.log(`   - Success: ${result.dnsResolution.success}`);
      console.log(`   - Hostname: ${result.dnsResolution.hostname}`);
      console.log(`   - Resolved IP: ${result.dnsResolution.ip}`);
      console.log(`   - Skipped: ${result.dnsResolution.skipped || false}`);
      if (result.dnsResolution.reason) {
        console.log(`   - Reason: ${result.dnsResolution.reason}`);
      }
    }
    
    if (result.connectionTest) {
      console.log('\n4. Connection Tests:');
      
      // Original hostname test
      if (result.connectionTest.originalHost) {
        const originalTest = result.connectionTest.originalHost;
        console.log('   Original Hostname Test:');
        console.log(`   - Success: ${originalTest.success}`);
        console.log(`   - Host: ${originalTest.connectionDetails.host}`);
        if (!originalTest.success) {
          console.log(`   - Error: ${originalTest.error}`);
          if (originalTest.rootCause) {
            console.log(`   - Root Cause: ${originalTest.rootCause.cause}`);
            console.log(`   - Description: ${originalTest.rootCause.description}`);
          }
        }
      }
      
      // Resolved IP test (if performed)
      if (result.connectionTest.resolvedIp) {
        const resolvedTest = result.connectionTest.resolvedIp;
        console.log('\n   Resolved IP Test:');
        console.log(`   - Success: ${resolvedTest.success}`);
        console.log(`   - Host: ${resolvedTest.connectionDetails.host}`);
        if (!resolvedTest.success) {
          console.log(`   - Error: ${resolvedTest.error}`);
          if (resolvedTest.rootCause) {
            console.log(`   - Root Cause: ${resolvedTest.rootCause.cause}`);
            console.log(`   - Description: ${resolvedTest.rootCause.description}`);
          }
        }
      }
    }
    
    if (result.finalResult) {
      console.log('\n5. Final Result:');
      console.log(`   - Success: ${result.finalResult.success}`);
      console.log(`   - Used Resolved IP: ${result.finalResult.connectionDetails.usedResolvedIp}`);
      if (result.finalResult.success) {
        console.log(`   - Message: ${result.finalResult.message}`);
      } else {
        console.log(`   - Error: ${result.finalResult.error}`);
      }
    }
    
    // Generate recommendations
    console.log('\n6. Recommendations:');
    const recommendations = mysqlStep.generateConnectionRecommendations(result);
    if (recommendations.length > 0) {
      recommendations.forEach(rec => {
        console.log(`   - [${rec.priority.toUpperCase()}] ${rec.message}`);
        console.log(`     Action: ${rec.action}`);
      });
    } else {
      console.log('   - No recommendations (connection successful)');
    }
    
  } catch (error) {
    console.error('\nError during MySQL connection test:', error.message);
  }
}

// Example with different host configurations
async function demonstrateWithDifferentHosts() {
  console.log('\n\n=== Testing Different Host Configurations ===\n');
  
  const mysqlStep = new MySQLStep();
  
  const testConfigs = [
    {
      name: 'Localhost',
      config: { ...mockParsedConfig.config, host: 'localhost' }
    },
    {
      name: 'IP Address',
      config: { ...mockParsedConfig.config, host: '127.0.0.1' }
    },
    {
      name: 'Remote Host',
      config: { ...mockParsedConfig.config, host: 'mysql.example.com' }
    }
  ];
  
  for (const testConfig of testConfigs) {
    console.log(`Testing ${testConfig.name} (${testConfig.config.host}):`);
    
    const testParsedConfig = {
      ...mockParsedConfig,
      config: testConfig.config
    };
    
    try {
      const result = await mysqlStep.testMySQLConnection(testParsedConfig);
      console.log(`  - Success: ${result.success}`);
      
      if (result.dnsResolution && !result.dnsResolution.skipped) {
        console.log(`  - DNS Resolution: ${result.dnsResolution.success ? 'Success' : 'Failed'}`);
        if (result.dnsResolution.success) {
          console.log(`  - Resolved to: ${result.dnsResolution.ip}`);
        }
      }
      
      if (!result.success && result.finalResult?.error) {
        console.log(`  - Error: ${result.finalResult.error}`);
      }
      
    } catch (error) {
      console.log(`  - Error: ${error.message}`);
    }
    
    console.log('');
  }
}

// Run the demonstration
if (require.main === module) {
  console.log('MySQL Connection Step Demonstration');
  console.log('===================================\n');
  
  demonstrateMySQLConnection()
    .then(() => demonstrateWithDifferentHosts())
    .then(() => {
      console.log('\n=== Demo Complete ===');
      console.log('This demonstrates the MySQL connection step that runs after stepB_parseConfig');
      console.log('in the WordPress diagnostic workflow. The step:');
      console.log('1. Resolves the database hostname to an IP address using DNS');
      console.log('2. Tests MySQL connection using the original hostname');
      console.log('3. If the first test fails, tries connecting with the resolved IP');
      console.log('4. Provides detailed error analysis and recommendations');
      console.log('5. Maps MySQL errors to root causes for better troubleshooting');
    })
    .catch(error => {
      console.error('Demo failed:', error.message);
      process.exit(1);
    });
}

module.exports = {
  demonstrateMySQLConnection,
  demonstrateWithDifferentHosts
};