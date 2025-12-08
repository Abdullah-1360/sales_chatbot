/**
 * Phone number normalization and masking utilities
 */

/**
 * Normalize phone number by removing all non-digit characters
 * @param {string} phone - Phone number to normalize
 * @returns {string} - Normalized phone number (digits only)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Mask phone number for security (shows first 3 and last 2 digits)
 * Example: 1234567890 -> 123*****90
 * @param {string} phone - Phone number to mask
 * @returns {string} - Masked phone number
 */
function maskPhone(phone) {
  if (!phone) return '';
  const normalized = normalizePhone(phone);
  
  if (normalized.length < 5) {
    // Too short to mask meaningfully
    return '*'.repeat(normalized.length);
  }
  
  const firstThree = normalized.substring(0, 3);
  const lastTwo = normalized.substring(normalized.length - 2);
  const middleLength = normalized.length - 5;
  
  return `${firstThree}${'*'.repeat(middleLength)}${lastTwo}`;
}

/**
 * Compare two phone numbers after normalization
 * Handles country code variations (e.g., +92 vs without country code)
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @returns {boolean} - True if phones match
 */
function phonesMatch(phone1, phone2) {
  const normalized1 = normalizePhone(phone1);
  const normalized2 = normalizePhone(phone2);
  
  if (!normalized1 || !normalized2) return false;
  
  // Direct match
  if (normalized1 === normalized2) return true;
  
  // Try matching with common country code variations
  // If one has country code and other doesn't, try matching without it
  
  // Common country codes to try removing
  const countryCodes = ['92', '1', '44', '91', '86', '61', '81', '49', '33', '39'];
  
  for (const code of countryCodes) {
    // Check if phone1 starts with country code and phone2 doesn't
    if (normalized1.startsWith(code) && !normalized2.startsWith(code)) {
      const phone1WithoutCode = normalized1.substring(code.length);
      if (phone1WithoutCode === normalized2) return true;
    }
    
    // Check if phone2 starts with country code and phone1 doesn't
    if (normalized2.startsWith(code) && !normalized1.startsWith(code)) {
      const phone2WithoutCode = normalized2.substring(code.length);
      if (phone2WithoutCode === normalized1) return true;
    }
  }
  
  return false;
}

module.exports = {
  normalizePhone,
  maskPhone,
  phonesMatch
};
