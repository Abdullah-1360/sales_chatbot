import React from 'react';
import '../styles/IncomingChatsTab.css';

/**
 * IncomingChatsTab Component
 * Placeholder component for future incoming chats functionality
 * 
 * Requirements:
 * - 4.1: Display empty state message when tab is clicked
 * - 4.2: Display "Coming Soon" or similar placeholder text
 * - 4.3: Maintain same layout structure as NewLeadsTab
 * - 4.5: Allow users to switch between tabs without errors
 */
function IncomingChatsTab() {
  return (
    <div className="incoming-chats-tab">
      <div className="incoming-chats-placeholder">
        <div className="placeholder-icon">
          <svg 
            width="80" 
            height="80" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2>Coming Soon</h2>
        <p className="placeholder-description">
          The Incoming Chats feature is currently under development.
        </p>
        <p className="placeholder-subdescription">
          Real-time chat notifications and management will be available here soon.
        </p>
      </div>
    </div>
  );
}

export default IncomingChatsTab;
