const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const router = require('./routes');

const app = express();
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use('/api', router);

// centralised error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  
  // JSON parsing errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ 
      error: 'Invalid JSON format. Please check your request body for syntax errors.',
      details: 'Common issues: missing values, trailing commas, unquoted strings'
    });
  }
  
  // Joi validation errors should return 400
  const status = err.isJoi ? 400 : (err.status || 500);
  res.status(status).json({ error: err.message || 'Server error' });
});

module.exports = app;