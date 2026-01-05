const { getClientsDetails } = require('../services/whmcsService');

/**
 * Check if user exists in WHMCS by email or phone number
 * Returns true if user exists, false otherwise
 */
exports.checkUserExists = async (req, res, next) => {
  console.log('[POST /api/checkUserExists]', { 
    hasEmail: !!req.body.email,
    hasPhone: !!req.body.phone
  });
  
  try {
    const { email, phone } = req.body || {};
    
    if (!email && !phone) {
      console.log('✗ Missing required parameters');
      return res.status(400).json({ 
        success: false, 
        error: 'email or phone required' 
      });
    }
    
    let userExists = false;
    let foundBy = null;
    
    // Check by email first if provided
    if (email) {
      try {
        console.log('→ Checking user by email:', email);
        const emailResult = await getClientsDetails({ email });
        
        if (emailResult && emailResult.userid) {
          console.log('→ User found by email:', emailResult.userid);
          userExists = true;
          foundBy = 'email';
        }
      } catch (err) {
        console.log('→ Email check failed:', err.message);
        // Continue to phone check if email fails
      }
    }
    
    // Check by phone if not found by email and phone is provided
    if (!userExists && phone) {
      try {
        console.log('→ Checking user by phone:', phone);
        const phoneResult = await getClientsDetails({ phonenumber: phone });
        
        if (phoneResult && phoneResult.userid) {
          console.log('→ User found by phone:', phoneResult.userid);
          userExists = true;
          foundBy = 'phone';
        }
      } catch (err) {
        console.log('→ Phone check failed:', err.message);
        // User not found by either method
      }
    }
    
    console.log('→ User exists:', userExists, foundBy ? `(found by ${foundBy})` : '');
    
    // Return simple boolean response
    res.json({ 
      exists: userExists
    });
    
  } catch (err) {
    console.log('✗ Error:', err.message);
    next(err);
  }
};