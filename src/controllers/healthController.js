/**
 * Health check controller
 */
exports.getHealth = (req, res) => {
  console.log('[GET /health]');
  const response = { 
    ok: true, 
    service: 'billing-backend', 
    time: new Date().toISOString() 
  };
  console.log('→', response);
  res.json(response);
};
