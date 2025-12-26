/**
 * Performance configuration for WordPress diagnostic endpoints
 */

const performanceConfig = {
  // Cache settings
  cache: {
    diagnosticTTL: 5 * 60 * 1000, // 5 minutes
    credentialTTL: 10 * 60 * 1000, // 10 minutes
    dnsTTL: 5 * 60 * 1000, // 5 minutes
    maxCacheSize: 1000,
    cleanupInterval: 60 * 1000 // 1 minute
  },

  // Timeout settings
  timeouts: {
    credentialResolution: 30000, // 30 seconds
    diagnosticWorkflow: 60000, // 60 seconds
    dnsResolution: 5000, // 5 seconds
    mysqlConnection: 10000, // 10 seconds
    emailLookup: 10000, // 10 seconds
    phoneLookup: 10000, // 10 seconds
    domainLookup: 15000, // 15 seconds
    hostingServiceLookup: 15000, // 15 seconds
    serverInfoLookup: 10000, // 10 seconds
    usernameLookup: 10000 // 10 seconds
  },

  // Connection pool settings
  connectionPool: {
    connectionLimit: 5,
    acquireTimeout: 5000,
    timeout: 10000,
    reconnect: false,
    idleTimeout: 30000,
    poolCleanupInterval: 5 * 60 * 1000 // 5 minutes
  },

  // Performance monitoring
  monitoring: {
    enabled: process.env.NODE_ENV !== 'production',
    maxMetrics: 100,
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
    metricRetentionTime: 10 * 60 * 1000 // 10 minutes
  },

  // Memory management
  memory: {
    maxCacheEntries: 500,
    gcInterval: 2 * 60 * 1000, // 2 minutes
    memoryThreshold: 100 * 1024 * 1024 // 100MB
  },

  // Logging levels by environment
  logging: {
    production: 'silent',
    development: 'error',
    test: 'silent'
  },

  // Feature flags for performance optimizations
  features: {
    enableCaching: true,
    enableConnectionPooling: true,
    enableDnsCache: true,
    enableParallelLookups: true,
    enableTimeouts: true,
    enableMemoryManagement: true
  }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'production') {
  // Production optimizations
  performanceConfig.cache.maxCacheSize = 2000;
  performanceConfig.monitoring.enabled = false;
  performanceConfig.connectionPool.connectionLimit = 10;
} else if (process.env.NODE_ENV === 'development') {
  // Development settings for debugging
  performanceConfig.timeouts.credentialResolution = 60000; // Longer for debugging
  performanceConfig.timeouts.diagnosticWorkflow = 120000;
} else if (process.env.NODE_ENV === 'test') {
  // Test environment - faster timeouts
  performanceConfig.timeouts.credentialResolution = 5000;
  performanceConfig.timeouts.diagnosticWorkflow = 10000;
  performanceConfig.cache.diagnosticTTL = 1000; // 1 second for testing
}

module.exports = performanceConfig;