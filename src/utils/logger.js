/**
 * Logger Utility
 * Console + rotating file output via Winston.
 *
 * Files written to ./logs/
 *   app-YYYY-MM-DD.log      INFO + WARN  (14-day retention, 20 MB max)
 *   error-YYYY-MM-DD.log    ERROR only   (30-day retention, 20 MB max)
 *   http-YYYY-MM-DD.log     HTTP traffic (7-day retention, 20 MB max)
 *
 * All rotated files are gzip-compressed automatically.
 * The createLogger(context) API is unchanged — no other files need editing.
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ── formats ──────────────────────────────────────────────────────────────────

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, context, stack, ...meta }) => {
    const ctx = context ? `[${context}] ` : '';
    const extra = Object.keys(meta).length ? JSON.stringify(meta) : '';
    const err = stack ? `\n${stack}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${ctx}${message}${extra ? ' ' + extra : ''}${err}`;
  })
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
    const ctx = context ? `[${context}] ` : '';
    const extra = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] ${level} ${ctx}${message}${extra ? ' ' + extra : ''}`;
  })
);

// ── transports ────────────────────────────────────────────────────────────────

function makeRotatingTransport(filename, level, maxDays) {
  return new DailyRotateFile({
    filename: path.join(LOG_DIR, `${filename}-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: `${maxDays}d`,
    level,
    format: fileFormat,
  });
}

const appTransport   = makeRotatingTransport('app',   'info',  14);
const errorTransport = makeRotatingTransport('error', 'error', 30);
const httpTransport  = makeRotatingTransport('http',  'http',   7);

// Shared winston instance (all contexts write to the same files)
const winstonLogger = winston.createLogger({
  level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    appTransport,
    errorTransport,
  ],
});

// Separate HTTP logger (only used by requestLogger middleware)
const httpLogger = winston.createLogger({
  levels: { ...winston.config.npm.levels, http: 5 },
  level: 'http',
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    httpTransport,
  ],
});

// ── Logger class (same public API as before) ──────────────────────────────────

class Logger {
  constructor(context = 'APP') {
    this.context = context;
  }

  _meta(data) {
    if (!data) return {};
    if (typeof data === 'object') return data;
    return { detail: data };
  }

  error(message, data = null) {
    winstonLogger.error(message, { context: this.context, ...this._meta(data) });
  }

  warn(message, data = null) {
    winstonLogger.warn(message, { context: this.context, ...this._meta(data) });
  }

  info(message, data = null) {
    winstonLogger.info(message, { context: this.context, ...this._meta(data) });
  }

  debug(message, data = null) {
    winstonLogger.debug(message, { context: this.context, ...this._meta(data) });
  }

  // HTTP request logging (used by requestLogger middleware)
  logRequest(req) {
    httpLogger.log('http', 'Incoming request', {
      context: this.context,
      method: req.method,
      url: req.originalUrl || req.url,
      headers: this._sanitizeHeaders(req.headers),
      body: this._sanitizeBody(req.body),
      query: req.query,
      ip: req.ip || req.connection?.remoteAddress,
    });
  }

  logResponse(req, res, responseBody = null, duration = null) {
    const info = {
      context: this.context,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: duration ? `${duration}ms` : null,
      body: this._sanitizeBody(responseBody),
    };
    if (res.statusCode >= 400) {
      winstonLogger.error(`Response ${res.statusCode}`, info);
    } else {
      httpLogger.log('http', `Response ${res.statusCode}`, info);
    }
  }

  logWHMCSRequest(action, params) {
    const sanitized = { ...params };
    if (sanitized.secret) sanitized.secret = '***';
    if (sanitized.identifier) sanitized.identifier = '***';
    winstonLogger.debug(`WHMCS Request: ${action}`, { context: this.context, ...sanitized });
  }

  logWHMCSResponse(action, success, data = null) {
    if (success) {
      winstonLogger.debug(`WHMCS Response: ${action} OK`, { context: this.context });
    } else {
      winstonLogger.error(`WHMCS Response: ${action} FAILED`, { context: this.context, ...this._meta(data) });
    }
  }

  logDBQuery(operation, collection, query = null) {
    winstonLogger.debug(`DB ${operation}: ${collection}`, { context: this.context, query });
  }

  logDBResult(operation, collection, result) {
    winstonLogger.debug(`DB ${operation} result: ${collection}`, { context: this.context, result });
  }

  _sanitizeHeaders(headers) {
    const s = { ...headers };
    ['authorization', 'cookie', 'x-api-key'].forEach(h => { if (s[h]) s[h] = '***'; });
    return s;
  }

  _sanitizeBody(body) {
    if (!body) return null;
    if (typeof body !== 'object') return body;
    const clone = JSON.parse(JSON.stringify(body));
    const sensitive = ['password', 'secret', 'token', 'api_key', 'apiKey'];
    const redact = obj => {
      for (const k in obj) {
        if (sensitive.includes(k)) obj[k] = '***';
        else if (typeof obj[k] === 'object' && obj[k]) redact(obj[k]);
      }
    };
    redact(clone);
    return clone;
  }
}

function createLogger(context) {
  return new Logger(context);
}

module.exports = { Logger, createLogger, LOG_LEVELS: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 } };
