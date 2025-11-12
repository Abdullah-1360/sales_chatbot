/**
 * Logger Utility
 * Provides consistent logging across the application
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const LOG_COLORS = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[90m', // Gray
  RESET: '\x1b[0m'
};

class Logger {
  constructor(context = 'APP') {
    this.context = context;
    this.level = process.env.LOG_LEVEL || 'INFO';
  }

  _shouldLog(level) {
    const currentLevel = LOG_LEVELS[this.level] || LOG_LEVELS.INFO;
    const messageLevel = LOG_LEVELS[level];
    return messageLevel <= currentLevel;
  }

  _formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const color = LOG_COLORS[level] || '';
    const reset = LOG_COLORS.RESET;
    
    let logMessage = `${color}[${timestamp}] [${level}] [${this.context}]${reset} ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        logMessage += `\n${JSON.stringify(data, null, 2)}`;
      } else {
        logMessage += ` ${data}`;
      }
    }
    
    return logMessage;
  }

  error(message, data = null) {
    if (this._shouldLog('ERROR')) {
      console.error(this._formatMessage('ERROR', message, data));
    }
  }

  warn(message, data = null) {
    if (this._shouldLog('WARN')) {
      console.warn(this._formatMessage('WARN', message, data));
    }
  }

  info(message, data = null) {
    if (this._shouldLog('INFO')) {
      console.log(this._formatMessage('INFO', message, data));
    }
  }

  debug(message, data = null) {
    if (this._shouldLog('DEBUG')) {
      console.log(this._formatMessage('DEBUG', message, data));
    }
  }

  // HTTP request logging
  logRequest(req) {
    const requestInfo = {
      method: req.method,
      url: req.originalUrl || req.url,
      headers: this._sanitizeHeaders(req.headers),
      body: this._sanitizeBody(req.body),
      query: req.query,
      ip: req.ip || req.connection?.remoteAddress
    };
    
    this.info(`Incoming ${req.method} request`, requestInfo);
  }

  // HTTP response logging
  logResponse(req, res, responseBody = null, duration = null) {
    const responseInfo = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: duration ? `${duration}ms` : null,
      body: this._sanitizeBody(responseBody)
    };
    
    if (res.statusCode >= 400) {
      this.error(`Response ${res.statusCode}`, responseInfo);
    } else {
      this.info(`Response ${res.statusCode}`, responseInfo);
    }
  }

  // WHMCS API logging
  logWHMCSRequest(action, params) {
    const sanitizedParams = { ...params };
    if (sanitizedParams.secret) sanitizedParams.secret = '***REDACTED***';
    if (sanitizedParams.identifier) sanitizedParams.identifier = '***REDACTED***';
    
    this.debug(`WHMCS API Request: ${action}`, sanitizedParams);
  }

  logWHMCSResponse(action, success, data = null) {
    if (success) {
      this.debug(`WHMCS API Response: ${action} - Success`, data);
    } else {
      this.error(`WHMCS API Response: ${action} - Failed`, data);
    }
  }

  // Database logging
  logDBQuery(operation, collection, query = null) {
    this.debug(`DB ${operation}: ${collection}`, query);
  }

  logDBResult(operation, collection, result) {
    this.debug(`DB ${operation} Result: ${collection}`, result);
  }

  // Sanitize sensitive data
  _sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '***REDACTED***';
      }
    });
    
    return sanitized;
  }

  _sanitizeBody(body) {
    if (!body) return null;
    if (typeof body !== 'object') return body;
    
    const sanitized = JSON.parse(JSON.stringify(body)); // Deep clone
    const sensitiveFields = ['password', 'secret', 'token', 'api_key', 'apiKey'];
    
    const redactRecursive = (obj) => {
      for (const key in obj) {
        if (sensitiveFields.includes(key)) {
          obj[key] = '***REDACTED***';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          redactRecursive(obj[key]);
        }
      }
    };
    
    redactRecursive(sanitized);
    return sanitized;
  }
}

// Create logger instances for different contexts
function createLogger(context) {
  return new Logger(context);
}

module.exports = {
  Logger,
  createLogger,
  LOG_LEVELS
};
