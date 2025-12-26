/**
 * Silent logger for production performance optimization
 * Replaces Winston logger with no-op functions in production
 */

class SilentLogger {
  constructor() {
    // Create no-op functions for all logging methods
    this.info = () => {};
    this.warn = () => {};
    this.error = () => {};
    this.debug = () => {};
    this.log = () => {};
    this.verbose = () => {};
    this.silly = () => {};
  }

  // Support for different logging patterns
  child() {
    return new SilentLogger();
  }

  // Support for Winston-style logging
  createLogger() {
    return new SilentLogger();
  }
}

// Export based on environment
module.exports = process.env.NODE_ENV === 'production' 
  ? new SilentLogger()
  : require('winston').createLogger({
      level: 'error', // Only errors in development
      format: require('winston').format.simple(),
      transports: [
        new (require('winston').transports.Console)({
          silent: process.env.NODE_ENV === 'test'
        })
      ]
    });