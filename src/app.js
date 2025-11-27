const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const router = require('./routes');
const { requestLogger, errorLogger } = require('./middleware/requestLogger');

const app = express();
app.use(helmet());
app.use(compression());
app.use(express.json());

// Request/Response logging middleware
app.use(requestLogger);

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