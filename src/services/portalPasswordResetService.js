const axios = require('axios');

const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_USERNAME = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_PASSWORD = process.env.WHMCS_API_SECRET;

/**
 * Call WHMCS API
 */
async function callWhmcsApi(action, params = {}) {
  try {
    const response = await axios.post(WHMCS_URL, null, {
      params: {
        action,
        username: WHMCS_USERNAME,
        password: WHMCS_PASSWORD,
        responsetype: 'json',
        ...params
      },
      timeout: 30000
    });

    if (response.data.result === 'error') {
      throw new Error(response.data.message || 'WHMCS API error');
    }

    return response.data;
  } catch (error) {
    console.error(`[WHMCS API] ${action} failed:`, error.message);
    throw error;
  }
}

/**
 * Normalize phone number to digits only
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Check if phone numbers match (with various format tolerance)
 */
function phoneNumbersMatch(phone1, phone2) {
  if (!phone1 || !phone2) return false;
  
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);
  
  // Direct match
  if (normalized1 === normalized2) return true;
  
  // Match ignoring country codes (last 10 digits for US/international)
  if (normalized1.length >= 10 && normalized2.length >= 10) {
    const last10_1 = normalized1.slice(-10);
    const last10_2 = normalized2.slice(-10);
    if (last10_1 === last10_2) return true;
  }
  
  // Match ignoring leading 1 (US country code)
  if (normalized1.startsWith('1') && normalized1.slice(1) === normalized2) return true;
  if (normalized2.startsWith('1') && normalized2.slice(1) === normalized1) return true;
  
  return false;
}

/**
 * Reset WHMCS portal password using ResetPassword action
 * @param {string} clientId - WHMCS client ID
 * @param {string} email - Client email address
 * @returns {Promise<Object>} Reset result
 */
async function resetWhmcsPassword(clientId, email) {
  try {
    console.log(`[resetWhmcsPassword] Resetting password for client ID: ${clientId}`);
    
    // Call WHMCS ResetPassword API
    const result = await callWhmcsApi('ResetPassword', {
      id: clientId
    });
    
    console.log('[resetWhmcsPassword] WHMCS ResetPassword response:', result);
    
    if (result.result === 'success') {
      return {
        success: true,
        message: 'Password reset email sent successfully',
        email: email
      };
    } else {
      return {
        success: false,
        error: result.message || 'Password reset failed'
      };
    }
    
  } catch (error) {
    console.error('[resetWhmcsPassword] Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  callWhmcsApi,
  normalizePhoneNumber,
  phoneNumbersMatch,
  resetWhmcsPassword
};
