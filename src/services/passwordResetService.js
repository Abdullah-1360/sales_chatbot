const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const WHMCS_URL = process.env.WHMCS_URL;
const WHMCS_USERNAME = process.env.WHMCS_API_IDENTIFIER;
const WHMCS_PASSWORD = process.env.WHMCS_API_SECRET;

/**
 * Load and parse plans data for keyword matching
 */
async function loadPlansData() {
  try {
    const plansPath = path.join(process.cwd(), 'all-plans-1763962201513.json');
    const data = await fs.readFile(plansPath, 'utf8');
    const plansData = JSON.parse(data);
    return plansData.plans || [];
  } catch (error) {
    console.error('Error loading plans data:', error.message);
    return [];
  }
}

/**
 * Generate keywords for plan matching
 */
function generatePlanKeywords(plans) {
  const keywords = new Map();
  
  plans.forEach(plan => {
    const planKeywords = [];
    
    // Add plan name variations
    planKeywords.push(plan.name.toLowerCase());
    planKeywords.push(plan.name.toLowerCase().replace(/\s+/g, ''));
    planKeywords.push(plan.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    
    // Add plan type keywords
    if (plan.gidName) {
      planKeywords.push(plan.gidName.toLowerCase());
      planKeywords.push(plan.gidName.toLowerCase().replace(/\s+/g, ''));
    }
    
    // Add specific plan identifiers
    const nameWords = plan.name.toLowerCase().split(/\s+/);
    nameWords.forEach(word => {
      if (word.length > 2) {
        planKeywords.push(word);
      }
    });
    
    // Add common variations
    if (plan.name.toLowerCase().includes('entry')) {
      planKeywords.push('starter', 'basic', 'beginner');
    }
    if (plan.name.toLowerCase().includes('basic')) {
      planKeywords.push('standard', 'regular');
    }
    if (plan.name.toLowerCase().includes('standard')) {
      planKeywords.push('regular', 'normal');
    }
    if (plan.name.toLowerCase().includes('pro')) {
      planKeywords.push('professional', 'premium');
    }
    if (plan.name.toLowerCase().includes('biz')) {
      planKeywords.push('business', 'commercial');
    }
    
    keywords.set(plan.pid, {
      plan: plan,
      keywords: [...new Set(planKeywords)]
    });
  });
  
  return keywords;
}

/**
 * Match hosting name to plan using fuzzy matching
 */
async function matchHostingPlan(hostingName) {
  const plans = await loadPlansData();
  const planKeywords = generatePlanKeywords(plans);
  
  const searchTerm = hostingName.toLowerCase().trim();
  const matches = [];
  
  // Direct name matching first
  for (const [pid, data] of planKeywords) {
    const { plan, keywords } = data;
    
    // Exact match
    if (keywords.includes(searchTerm)) {
      matches.push({ plan, score: 100, matchType: 'exact' });
      continue;
    }
    
    // Partial matches
    let score = 0;
    let matchType = 'none';
    
    // Check if search term contains any keyword
    for (const keyword of keywords) {
      if (searchTerm.includes(keyword)) {
        score += keyword.length * 10;
        matchType = 'partial';
      }
      if (keyword.includes(searchTerm) && searchTerm.length > 2) {
        score += searchTerm.length * 5;
        matchType = 'contains';
      }
    }
    
    // Check for word matches
    const searchWords = searchTerm.split(/\s+/);
    const planWords = plan.name.toLowerCase().split(/\s+/);
    
    for (const searchWord of searchWords) {
      for (const planWord of planWords) {
        if (searchWord === planWord) {
          score += 20;
          matchType = 'word';
        }
      }
    }
    
    if (score > 0) {
      matches.push({ plan, score, matchType });
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  return matches;
}

/**
 * Make WHMCS API call
 */
async function callWhmcsApi(action, params = {}) {
  const payload = new URLSearchParams({
    action,
    username: WHMCS_USERNAME,
    password: WHMCS_PASSWORD,
    responsetype: 'json',
    ...params
  });

  try {
    const response = await axios.post(WHMCS_URL, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 30000
    });

    if (response.data.result !== 'success') {
      throw new Error(response.data.message || 'WHMCS API call failed');
    }

    return response.data;
  } catch (error) {
    console.error('WHMCS API Error:', error.message);
    throw error;
  }
}

/**
 * Normalize phone number for comparison
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  // Remove all non-digit characters
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
 * Get client details by email or phone
 */
async function getClientByContact(contact) {
  const isEmail = contact.includes('@');
  
  console.log(`🔍 Searching for client by ${isEmail ? 'email' : 'phone'}: ${contact}`);
  
  if (isEmail) {
    try {
      // Try to find client by email first
      const emailResult = await callWhmcsApi('GetClientsDetails', {
        email: contact,
        stats: false
      });
      
      if (emailResult && emailResult.client) {
        console.log(`✅ Client found by email: ${emailResult.client.firstname} ${emailResult.client.lastname}`);
        return emailResult.client;
      }
    } catch (error) {
      console.log('❌ Email search failed:', error.message);
    }
  } else {
    // Phone number search - try multiple approaches
    console.log('📞 Attempting phone number search...');
    
    try {
      // Method 1: Use GetClients with search parameter
      console.log('📞 Method 1: GetClients search...');
      const phoneResult = await callWhmcsApi('GetClients', {
        search: contact,
        limitnum: 50 // Increase limit to catch more potential matches
      });
      
      if (phoneResult && phoneResult.clients && phoneResult.clients.client) {
        const clients = Array.isArray(phoneResult.clients.client) 
          ? phoneResult.clients.client 
          : [phoneResult.clients.client];
        
        console.log(`📞 Found ${clients.length} potential matches from search`);
        
        // Find client with matching phone using flexible matching
        for (const client of clients) {
          if (phoneNumbersMatch(client.phonenumber, contact)) {
            console.log(`✅ Phone match found: ${client.firstname} ${client.lastname} (${client.phonenumber})`);
            
            // Get full client details
            const fullClient = await callWhmcsApi('GetClientsDetails', {
              clientid: client.id,
              stats: false
            });
            return fullClient.client;
          }
        }
      }
      
      // Method 2: Try searching with normalized phone number
      const normalizedContact = normalizePhoneNumber(contact);
      if (normalizedContact !== contact) {
        console.log('📞 Method 2: Trying normalized phone number...');
        const normalizedResult = await callWhmcsApi('GetClients', {
          search: normalizedContact,
          limitnum: 50
        });
        
        if (normalizedResult && normalizedResult.clients && normalizedResult.clients.client) {
          const clients = Array.isArray(normalizedResult.clients.client) 
            ? normalizedResult.clients.client 
            : [normalizedResult.clients.client];
          
          for (const client of clients) {
            if (phoneNumbersMatch(client.phonenumber, contact)) {
              console.log(`✅ Phone match found (normalized): ${client.firstname} ${client.lastname}`);
              
              const fullClient = await callWhmcsApi('GetClientsDetails', {
                clientid: client.id,
                stats: false
              });
              return fullClient.client;
            }
          }
        }
      }
      
      // Method 3: Try with country code variations
      console.log('📞 Method 3: Trying country code variations...');
      const variations = [];
      
      if (!normalizedContact.startsWith('1') && normalizedContact.length === 10) {
        variations.push('1' + normalizedContact); // Add US country code
      }
      if (normalizedContact.startsWith('1') && normalizedContact.length === 11) {
        variations.push(normalizedContact.slice(1)); // Remove country code
      }
      if (normalizedContact.startsWith('92') && normalizedContact.length > 10) {
        variations.push(normalizedContact.slice(2)); // Remove Pakistan country code
      }
      
      for (const variation of variations) {
        try {
          const variationResult = await callWhmcsApi('GetClients', {
            search: variation,
            limitnum: 20
          });
          
          if (variationResult && variationResult.clients && variationResult.clients.client) {
            const clients = Array.isArray(variationResult.clients.client) 
              ? variationResult.clients.client 
              : [variationResult.clients.client];
            
            for (const client of clients) {
              if (phoneNumbersMatch(client.phonenumber, contact)) {
                console.log(`✅ Phone match found (variation ${variation}): ${client.firstname} ${client.lastname}`);
                
                const fullClient = await callWhmcsApi('GetClientsDetails', {
                  clientid: client.id,
                  stats: false
                });
                return fullClient.client;
              }
            }
          }
        } catch (err) {
          console.log(`📞 Variation ${variation} search failed:`, err.message);
        }
      }
      
    } catch (error) {
      console.error('❌ Phone search failed:', error.message);
    }
  }

  console.log('❌ No client found for contact:', contact);
  return null;
}

/**
 * Get client products by domain
 */
async function getClientProductsByDomain(clientId, domain) {
  try {
    const result = await callWhmcsApi('GetClientsProducts', {
      clientid: clientId,
      domain: domain,
      limitnum: 100
    });
    
    return result.products?.product || [];
  } catch (error) {
    console.error('Error getting client products by domain:', error.message);
    return [];
  }
}

/**
 * Check service status
 */
function checkServiceStatus(product) {
  const status = product.status?.toLowerCase();
  const suspendedStatuses = ['suspended', 'terminated', 'cancelled', 'fraud'];
  
  return {
    isActive: status === 'active',
    isSuspended: suspendedStatuses.includes(status),
    status: status,
    needsTicket: suspendedStatuses.includes(status)
  };
}

/**
 * Create support ticket
 */
async function createSupportTicket(clientId, serviceId, subject, message) {
  try {
    const result = await callWhmcsApi('OpenTicket', {
      deptid: process.env.TECHSUPPORT_DEPTID || '2',
      clientid: clientId,
      subject: subject,
      message: message,
      priority: 'Medium',
      serviceid: serviceId
    });
    
    return result;
  } catch (error) {
    console.error('Error creating support ticket:', error.message);
    throw error;
  }
}

/**
 * Reset cPanel password using WHMCS ModuleChangePw API
 */
async function resetCpanelPassword(serviceId) {
  try {
    console.log(`🔐 Resetting cPanel password for service ID: ${serviceId}`);
    
    // Generate a strong password
    const newPassword = generateStrongPassword();
    console.log(`→ Generated strong password for service ${serviceId}`);
    
    // Use WHMCS ModuleChangePw API to reset password
    const result = await callWhmcsApi('ModuleChangePw', {
      serviceid: serviceId,
      servicepassword: newPassword
    });
    
    if (result && result.result === 'success') {
      console.log(`✅ cPanel password reset successful for service ${serviceId}`);
      return {
        success: true,
        message: 'cPanel password reset successfully',
        serviceId: serviceId,
        newPassword: newPassword
      };
    } else {
      const error = result?.message || 'Password reset failed';
      console.log(`❌ cPanel password reset failed for service ${serviceId}: ${error}`);
      throw new Error(error);
    }
    
  } catch (error) {
    console.error('Error resetting cPanel password:', error.message);
    throw error;
  }
}

/**
 * Generate a strong password
 */
function generateStrongPassword(length = 16) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  // Ensure at least one character from each category
  const categories = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', // Uppercase
    'abcdefghijklmnopqrstuvwxyz', // Lowercase  
    '0123456789',                 // Numbers
    '!@#$%^&*'                   // Special characters
  ];
  
  // Add one character from each category
  categories.forEach(category => {
    password += category.charAt(Math.floor(Math.random() * category.length));
  });
  
  // Fill the rest with random characters
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Shuffle the password to avoid predictable patterns
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Send email notification with new password
 */
async function sendEmailNotification(serviceId, messageName = 'Hosting Account - cPanel Login Email', customVars = {}) {
  try {
    const params = {
      messagename: messageName,
      id: serviceId
    };
    
    // Add custom variables if provided (like new password)
    if (customVars && Object.keys(customVars).length > 0) {
      Object.assign(params, customVars);
    }
    
    const result = await callWhmcsApi('SendEmail', params);
    
    return result;
  } catch (error) {
    console.error('Error sending email notification:', error.message);
    throw error;
  }
}

module.exports = {
  matchHostingPlan,
  getClientByContact,
  getClientProductsByDomain,
  checkServiceStatus,
  createSupportTicket,
  resetCpanelPassword,
  sendEmailNotification,
  callWhmcsApi,
  normalizePhoneNumber,
  phoneNumbersMatch,
  generateStrongPassword
};