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
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

module.exports = app;