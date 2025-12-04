import { useState, useEffect, useCallback } from 'react';
import { fetchLeads, deleteLead as deleteLeadAPI } from '../services/api';

/**
 * Custom hook for managing leads state
 * Handles initial data fetching, new lead insertion, and sorting
 * 
 * Requirements: 1.2, 1.3, 1.5
 */
const useLeads = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Fetch initial leads from the API
   */
  const loadLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { leads: fetchedLeads } = await fetchLeads({
        limit: 50,
        offset: 0,
        sort: '-createdAt', // Descending order (newest first)
      });

      // Sort leads by timestamp descending (newest first)
      const sortedLeads = [...fetchedLeads].sort((a, b) => {
        const dateA = new Date(a.createdAt || a.created_time);
        const dateB = new Date(b.createdAt || b.created_time);
        return dateB - dateA; // Descending order
      });

      // Merge with existing leads to avoid losing WebSocket updates during load
      setLeads((prevLeads) => {
        if (prevLeads.length === 0) {
          // First load, just set the fetched leads
          return sortedLeads;
        }
        
        // Merge: keep leads from WebSocket that aren't in fetched data
        const fetchedIds = new Set(sortedLeads.map(l => l.id || l._id));
        const newLeadsFromWS = prevLeads.filter(l => !fetchedIds.has(l.id || l._id));
        
        // Combine and sort
        const combined = [...newLeadsFromWS, ...sortedLeads];
        return combined.sort((a, b) => {
          const dateA = new Date(a.createdAt || a.created_time);
          const dateB = new Date(b.createdAt || b.created_time);
          return dateB - dateA;
        });
      });
    } catch (err) {
      console.error('Failed to load leads:', err);
      setError(err.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Add a new lead to the top of the list or update existing lead
   * Requirement 1.3: Insert new lead at top of list
   * 
   * @param {Object} newLead - The new lead object to add or update
   */
  const addLead = useCallback((newLead) => {
    console.log('🔧 useLeads: addLead called with:', newLead);
    
    setLeads((prevLeads) => {
      console.log('📊 Current leads count:', prevLeads.length);
      
      // Check if lead already exists by ID, vtigerId, or email
      const existingLeadIndex = prevLeads.findIndex((lead) => {
        const leadId = lead.id || lead._id;
        const newLeadId = newLead.id || newLead._id;
        
        // Match by MongoDB ID
        if (leadId && newLeadId && leadId === newLeadId) {
          return true;
        }
        
        // Match by VTiger ID
        if (lead.vtigerId && newLead.vtigerId && lead.vtigerId === newLead.vtigerId) {
          return true;
        }
        
        // Match by email (as fallback)
        if (lead.email && newLead.email && lead.email === newLead.email) {
          return true;
        }
        
        return false;
      });

      if (existingLeadIndex !== -1) {
        // Lead exists - update it
        console.log('🔄 Lead already exists, updating:', prevLeads[existingLeadIndex].id);
        console.log('📝 Old lead data:', prevLeads[existingLeadIndex]);
        console.log('📝 New lead data:', newLead);
        
        const updatedLeads = [...prevLeads];
        updatedLeads[existingLeadIndex] = {
          ...updatedLeads[existingLeadIndex],
          ...newLead,
          // Preserve the original createdAt if not provided
          createdAt: newLead.createdAt || updatedLeads[existingLeadIndex].createdAt
        };
        
        console.log('📝 Updated lead data:', updatedLeads[existingLeadIndex]);
        console.log('✅ Lead updated successfully');
        return updatedLeads;
      }

      console.log('✨ Adding new lead to list');
      // Insert new lead at the top and maintain sort order
      const updatedLeads = [newLead, ...prevLeads];
      
      // Re-sort to ensure proper ordering
      const sortedLeads = updatedLeads.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.created_time);
        const dateB = new Date(b.createdAt || b.created_time);
        return dateB - dateA; // Descending order
      });
      
      console.log('✅ New leads count:', sortedLeads.length);
      return sortedLeads;
    });
  }, []);

  /**
   * Remove a lead from the list and delete from backend
   * @param {Object} leadToRemove - The lead object to remove
   */
  const removeLead = useCallback(async (leadToRemove) => {
    console.log('🗑️ useLeads: removeLead called with:', leadToRemove);
    
    const leadId = leadToRemove.id || leadToRemove._id;
    
    // Optimistically remove from UI first
    setLeads((prevLeads) => {
      const filteredLeads = prevLeads.filter((lead) => {
        const currentLeadId = lead.id || lead._id;
        return currentLeadId !== leadId;
      });
      
      console.log('✅ Lead removed from UI. New count:', filteredLeads.length);
      return filteredLeads;
    });
    
    // Delete from backend
    try {
      await deleteLeadAPI(leadId);
      console.log('✅ Lead deleted from backend:', leadId);
    } catch (error) {
      console.error('❌ Failed to delete lead from backend:', error);
      // Optionally: re-add the lead to the list if backend deletion fails
      // For now, we keep it removed from UI even if backend fails
    }
  }, []);

  /**
   * Refresh leads list
   */
  const refreshLeads = useCallback(() => {
    loadLeads();
  }, [loadLeads]);

  // Load leads on mount
  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  return {
    leads,
    loading,
    error,
    addLead,
    removeLead,
    refreshLeads,
  };
};

export default useLeads;
