import axios from 'axios';
import config from '../config';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: config.apiUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    
    if (error.response) {
      // Server responded with error status
      const errorMessage = error.response.data?.message || error.response.statusText;
      throw new Error(`API Error: ${errorMessage}`);
    } else if (error.request) {
      // Request made but no response received
      throw new Error('Network Error: Unable to reach the server');
    } else {
      // Error in request setup
      throw new Error(`Request Error: ${error.message}`);
    }
  }
);

/**
 * Fetch leads from the backend API
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of leads to fetch
 * @param {number} options.offset - Number of leads to skip
 * @param {string} options.sort - Sort order (e.g., '-createdAt' for descending)
 * @returns {Promise<Object>} Response with leads array and total count
 */
export const fetchLeads = async ({ limit = 50, offset = 0, sort = '-createdAt' } = {}) => {
  try {
    const response = await apiClient.get('/api/leads', {
      params: { limit, offset, sort },
    });

    // Validate response structure
    if (!response.data) {
      throw new Error('Invalid response format: missing data');
    }

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to fetch leads');
    }

    if (!Array.isArray(response.data.leads)) {
      throw new Error('Invalid response format: leads must be an array');
    }

    return {
      leads: response.data.leads,
      total: response.data.total || response.data.leads.length,
    };
  } catch (error) {
    console.error('Error fetching leads:', error);
    throw error;
  }
};

/**
 * Create a new lead (for testing purposes)
 * @param {Object} leadData - Lead data
 * @returns {Promise<Object>} Created lead
 */
export const createLead = async (leadData) => {
  try {
    const response = await apiClient.post('/api/leads', leadData);
    
    if (!response.data) {
      throw new Error('Invalid response format: missing data');
    }

    return response.data;
  } catch (error) {
    console.error('Error creating lead:', error);
    throw error;
  }
};

/**
 * Delete a lead by ID
 * @param {string} leadId - Lead ID to delete
 * @returns {Promise<Object>} Deletion result
 */
export const deleteLead = async (leadId) => {
  try {
    const response = await apiClient.delete(`/api/leads/${leadId}`);
    
    if (!response.data) {
      throw new Error('Invalid response format: missing data');
    }

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete lead');
    }

    return response.data;
  } catch (error) {
    console.error('Error deleting lead:', error);
    throw error;
  }
};

export default {
  fetchLeads,
  createLead,
  deleteLead,
};
