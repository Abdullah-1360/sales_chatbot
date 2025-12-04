/**
 * Error handler middleware for WHMCS API errors
 */
function sendWhmcsError(res, err) {
  const status = 400;
  res.status(status).json({
    success: false,
    error: err.message || 'WHMCS error',
    code: err.code
  });
}

module.exports = { sendWhmcsError };
