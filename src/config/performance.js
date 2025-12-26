/**
 * Performance optimization configuration
 */

module.exports = {
  // Cache settings
  cache: {
    diagnosticTTL: 5 * 60 * 1000, // 5 minutes
    clientTTL: 10 * 60 * 1000, // 10 minutes
    serverTTL: 10 * 60 * 1000, // 10 minutes
    dnsTTL: 10 * 60 * 1000, // 10 minutes
    cleanupInterval: 60 * 1000, // 1 minute
  },

  // Timeout settings
  timeouts: {
    dnsResolution: 5000, // 5 seconds
    serverDnsResolution: 3000, // 3 seconds
    mysqlConnection: 10000, // 10 seconds
    cpanelApi: 15000, // 15 seconds
    whmcsApi: 10000, // 10 seconds
  },

  // Logging settings
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    enablePerformanceMonitoring: process.env.NODE_ENV !== 'production',
    enableDetailedErrors: process.env.NODE_ENV !== 'production',
    enableVerboseLogging: process.env.NODE_ENV === 'development',
  },

  // Optimization flags
  optimizations: {
    enableCaching: true,
    enableParallelLookups: true,
    enableFastValidation: true,
    enableEarlyReturns: true,
    enableObjectPooling: false, // Advanced optimization, disabled by default
    enableConnectionPooling: false, // Advanced optimization, disabled by default
  },

  // Performance thresholds (in milliseconds)
  thresholds: {
    warning: {
      totalDiagnostic: 10000, // 10 seconds
      credentialResolution: 3000, // 3 seconds
      configParsing: 2000, // 2 seconds
      mysqlConnection: 5000, // 5 seconds
    },
    error: {
      totalDiagnostic: 30000, // 30 seconds
      credentialResolution: 10000, // 10 seconds
      configParsing: 5000, // 5 seconds
      mysqlConnection: 15000, // 15 seconds
    }
  }
};