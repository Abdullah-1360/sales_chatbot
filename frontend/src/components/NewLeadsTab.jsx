import React, { useEffect, useCallback } from 'react';
import useLeads from '../hooks/useLeads';
import useWebSocket from '../hooks/useWebSocket';
import useNotifications from '../hooks/useNotifications';
import LeadCard from './LeadCard';
import { deleteLead } from '../services/api';
import '../styles/NewLeadsTab.css';

/**
 * NewLeadsTab Component
 * Displays list of leads with real-time updates via WebSocket
 * 
 * Requirements:
 * - 1.2: Display list of leads sorted by creation timestamp descending
 * - 1.3: Receive updates within 2 seconds and insert at top
 * - 1.5: Insert new leads at top of list
 * - 2.1: Trigger notifications for new leads
 * - 6.2: Display loading states while fetching initial data
 */
const NewLeadsTab = () => {
  const { leads, loading, error, addLead, removeLead, refreshLeads } = useLeads();
  const { isConnected, on, off } = useWebSocket();
  const { notifyNewLead } = useNotifications();
  const [expandedLeadId, setExpandedLeadId] = React.useState(null);

  /**
   * Handle new lead events from WebSocket
   * Requirement 1.3: Receive updates within 2 seconds
   * Requirement 1.5: Insert new lead at top of list
   * Requirement 2.1: Trigger notification for new lead
   */
  const handleNewLead = useCallback((leadData) => {
    console.log('📥 NewLeadsTab: handleNewLead called');
    console.log('📋 Lead data:', leadData);
    
    // Add lead to the list (will be inserted at top)
    console.log('➕ Adding lead to list...');
    addLead(leadData);
    console.log('✅ Lead added to list');
    
    // Trigger notification
    // Requirement 2.1: Display visual notification with lead's name and email
    console.log('🔔 Triggering notification...');
    notifyNewLead(leadData);
    console.log('✅ Notification triggered');
  }, [addLead, notifyNewLead]);

  /**
   * Handle dismiss lead action
   */
  const handleDismissLead = useCallback(async (lead) => {
    console.log('🗑️ Dismissing lead:', lead);
    
    const leadId = lead.id || lead._id;
    
    try {
      // Remove from UI immediately for better UX
      removeLead(lead);
      
      // Close expanded card if it's the one being dismissed
      if (expandedLeadId === leadId) {
        setExpandedLeadId(null);
      }
      
      // Delete from backend
      await deleteLead(leadId);
      console.log('✅ Lead deleted from database');
      
    } catch (error) {
      console.error('❌ Failed to delete lead from database:', error);
      // Optionally: show error notification to user
      // For now, the lead is still removed from UI even if backend fails
    }
  }, [removeLead, expandedLeadId]);

  /**
   * Handle card expand/collapse
   */
  const handleToggleExpand = useCallback((leadId) => {
    setExpandedLeadId((prevId) => (prevId === leadId ? null : leadId));
  }, []);

  /**
   * Subscribe to WebSocket new_lead events
   * Requirement 1.3: Subscribe to WebSocket new_lead events
   */
  useEffect(() => {
    // Subscribe to new_lead events
    on('new_lead', handleNewLead);

    // Cleanup: unsubscribe on unmount
    return () => {
      off('new_lead', handleNewLead);
    };
  }, [on, off, handleNewLead]);

  /**
   * Render loading state
   * Requirement 6.2: Display loading states while fetching initial data
   */
  if (loading) {
    return (
      <div className="new-leads-tab">
        <div className="new-leads-loading">
          <div className="loading-spinner"></div>
          <p>Loading leads...</p>
        </div>
      </div>
    );
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <div className="new-leads-tab">
        <div className="new-leads-error">
          <p className="error-message">Failed to load leads: {error}</p>
          <button onClick={refreshLeads} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  /**
   * Render empty state
   * Handle case when no leads are available
   */
  if (leads.length === 0) {
    return (
      <div className="new-leads-tab">
        <div className="new-leads-empty">
          <p>No leads yet. New leads will appear here in real-time.</p>
          {!isConnected && (
            <p className="connection-warning">
              ⚠️ Not connected to real-time updates. Reconnecting...
            </p>
          )}
        </div>
      </div>
    );
  }

  /**
   * Render leads list
   * Requirement 1.2: Display list of leads sorted by creation timestamp descending
   */
  return (
    <div className="new-leads-tab">
      <div className="new-leads-header">
        <h2>New Leads ({leads.length})</h2>
        {!isConnected && (
          <span className="connection-warning">
            ⚠️ Reconnecting...
          </span>
        )}
      </div>
      
      <div className="new-leads-list">
        {leads.map((lead) => {
          const leadId = lead.id || lead._id;
          return (
            <LeadCard 
              key={leadId || `${lead.email}-${lead.createdAt || lead.created_time}`} 
              lead={lead}
              isExpanded={expandedLeadId === leadId}
              onToggleExpand={() => handleToggleExpand(leadId)}
              onDismiss={handleDismissLead}
            />
          );
        })}
      </div>
    </div>
  );
};

export default NewLeadsTab;
