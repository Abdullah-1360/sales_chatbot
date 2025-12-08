const { getClientsDetails } = require('../services/whmcsService');
const { normalizePhone, maskPhone, phonesMatch } = require('../utils/phoneNormalizer');

/**
 * Middleware to validate phone number against WHMCS client data
 * Requires clientId to be present in req.body (should run after resolveClientId)
 * 
 * If phone number is provided and doesn't match WHMCS record:
 * - Returns error with masked WHMCS phone number
 * 
 * If phone number matches or is not provided:
 * - Continues to next middleware
 */
async function validatePhoneNumber(req, res, next) {
  try {
    const { clientId, phoneNumber, phone } = req.body;
    
    // Get phone from either phoneNumber or phone field
    const providedPhone = phoneNumber || phone;
    
    // If no phone number provided, skip validation
    if (!providedPhone) {
      return next();
    }
    
    // If no clientId, we can't validate (should not happen if resolveClientId ran first)
    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Client identification required for phone validation'
      });
    }
    
    // Fetch client details from WHMCS
    let clientData;
    try {
      clientData = await getClientsDetails({ clientid: clientId });
    } catch (err) {
      console.error('Error fetching client details for phone validation:', err.message);
      return res.status(500).json({
        success: false,
        error: 'Unable to verify client information'
      });
    }
    
    if (!clientData || !clientData.userid) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }
    
    // Get phone number from WHMCS (try phonenumber first, then phone)
    const whmcsPhone = clientData.phonenumber || clientData.phone;
    
    if (!whmcsPhone) {
      // No phone on record in WHMCS, allow request to proceed
      console.log(`⚠️ No phone number on record for client ${clientId}`);
      return next();
    }
    
    // Compare normalized phone numbers
    if (phonesMatch(providedPhone, whmcsPhone)) {
      // Phone numbers match, proceed
      console.log(`✅ Phone number validated for client ${clientId}`);
      return next();
    }
    
    // Phone numbers don't match - return error with masked WHMCS phone
    const maskedPhone = maskPhone(whmcsPhone);
    console.log(`❌ Phone number mismatch for client ${clientId}. Expected: ${maskedPhone}`);
    
    return res.status(403).json({
      success: false,
      error: `Phone number verification failed. Please contact us using the registered number: ${maskedPhone}`,
      registeredPhone: maskedPhone
    });
    
  } catch (err) {
    console.error('Error in phone validation middleware:', err);
    return res.status(500).json({
      success: false,
      error: 'Error validating phone number',
      details: err.message
    });
  }
}

module.exports = validatePhoneNumber;
