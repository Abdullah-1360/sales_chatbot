const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();
const cors = require('cors');
const router = require('./routes');
const { requestLogger, errorLogger } = require('./middleware/requestLogger');
const { sendWhmcsError } = require('./middleware/errorHandler');

const app = express();

// CORS configuration for frontend communication
//prc
const corsOrigin = process.env.CORS_ORIGIN || 'https://alertme.hostbreak.com';
// Support multiple origins (comma-separated)
const allowedOrigins = corsOrigin.includes(',') 
  ? corsOrigin.split(',').map(origin => origin.trim())
  : [corsOrigin];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl, local files)
    if (!origin) return callback(null, true);
    
    // TEMPORARY: Allow localhost for AutoSSL testing
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list or matches ngrok pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed === '*') return true;
      if (allowed === origin) return true;
      // Allow all ngrok domains
      if (origin.includes('.ngrok-free.dev') || origin.includes('.ngrok.io')) return true;
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(helmet());
app.use(compression());
app.use(express.json());

// Request/Response logging middleware
app.use(requestLogger);

// Mount routes at both root and /api for backward compatibility
app.use('/', router);
app.use('/api', router);

// Error logging middleware
app.use(errorLogger);

// centralised error handler
app.use((err, req, res, _next) => {
  console.error(err);
  
  // JSON parsing errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid JSON format in request body',
      details: 'Common issues: missing values after colons, trailing commas, unquoted strings',
      example: {
        purpose: "shop",
        websites_count: "5",
        storage_needed_gb: 25,
        email_needed: false,
        free_domain: true,
        monthly_budget: 0
      },
      hint: 'Make sure all fields have values and remove trailing commas'
    });
  }
  
  // Joi validation errors should return 400
  const status = err.isJoi ? 400 : (err.status || 500);
  res.status(status).json({ 
    success: false,
    error: err.message || 'Server error' 
  });
});

module.exports = app;