/**
 * Request Logger Middleware
 * Automatically logs all incoming requests and outgoing responses
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('HTTP');

/**
 * Middleware to log all HTTP requests and responses
 */
function requestLogger(req, res, next) {
  const startTime = Date.now();
  
  // Log incoming request
  logger.logRequest(req);
  
  // Capture response body
  const originalSend = res.send;
  const originalJson = res.json;
  
  let responseBody = null;
  
  // Override res.send
  res.send = function(body) {
    responseBody = body;
    return originalSend.call(this, body);
  };
  
  // Override res.json
  res.json = function(body) {
    responseBody = body;
    return originalJson.call(this, body);
  };
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.logResponse(req, res, responseBody, duration);
  });
  
  next();
}

/**
 * Error logging middleware
 */
function errorLogger(err, req, res, next) {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl || req.url,
    body: req.body
  });
  
  next(err);
}

module.exports = {
  requestLogger,
  errorLogger
};
