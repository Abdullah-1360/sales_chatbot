import React from 'react';
import { formatRelativeTime } from '../utils/dateFormatter';
import '../styles/ChatCard.css';

/**
 * ChatCard Component
 * Displays individual chat information in a modern card format with expand/collapse
 */
const ChatCard = ({ chat, isExpanded = false, onToggleExpand, onDismiss }) => {
  // Extract chat properties with fallbacks
  const {
    firstname = '',
    lastname = '',
    email = '',
    phone = '',
    description = '',
    comment = '',
    createdAt,
    source = 'Chatbot',
    userNs = '',
  } = chat;

  // Use comment if available, otherwise fall back to description
  const messageText = comment || description;

  const fullName = `${firstname} ${lastname}`.trim() || 'Unknown Name';
  const relativeTime = formatRelativeTime(createdAt);

  // Get initials for avatar
  const getInitials = () => {
    const first = firstname?.charAt(0) || '';
    const last = lastname?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  };

  // Get avatar color based on name
  const getAvatarColor = () => {
    const colors = [
      '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
      '#f43f5e', '#f59e0b', '#10b981', '#6366f1'
    ];
    const index = (firstname?.charCodeAt(0) || 0) % colors.length;
    return colors[index];
  };

  // Get UChat inbox URL for this chat
  const getUChatUrl = () => {
    if (!userNs) return '#';
    return `https://www.uchat.com.au/inbox/${userNs}`;
  };

  // Handle dismiss action
  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss(chat);
    }
  };

  return (
    <div className={`chat-card ${isExpanded ? 'expanded' : ''}`}>
      {/* Compact View */}
      <div 
        className="chat-card-compact"
        onClick={onToggleExpand}
      >
        <div className="chat-card-avatar" style={{ backgroundColor: getAvatarColor() }}>
          {getInitials()}
        </div>
        
        <div className="chat-card-info">
          <div className="chat-card-name-row">
            <h3 className="chat-card-name">{fullName}</h3>
            <span className="chat-card-badge">{source}</span>
          </div>
          <div className="chat-card-preview">
            {email && (
              <span className="chat-card-email-preview">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                {email}
              </span>
            )}
            {phone && (
              <span className="chat-card-phone-preview">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                {phone}
              </span>
            )}
          </div>
        </div>

        <div className="chat-card-meta">
          <span className="chat-card-time">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span className="time-text-with-arrow">
              {relativeTime}
            </span>
          </span>
          <button className="chat-card-expand-btn" onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}>
            <svg className="time-arrow" width="8" height="6" viewBox="0 0 8 6" fill="none">
              <path d="M4 6L0 0H8L4 6Z" fill="currentColor"/>
            </svg>
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className={isExpanded ? 'rotated' : ''}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div className="chat-card-details">
          <div className="chat-card-divider"></div>
          
          <div className="chat-card-details-grid">
            {email && (
              <div className="chat-detail-item">
                <div className="chat-detail-icon email-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <div className="chat-detail-content">
                  <span className="chat-detail-label">Email Address</span>
                  <a href={`mailto:${email}`} className="chat-detail-value email-link" onClick={(e) => e.stopPropagation()}>
                    {email}
                  </a>
                </div>
              </div>
            )}

            {phone && (
              <div className="chat-detail-item">
                <div className="chat-detail-icon phone-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </div>
                <div className="chat-detail-content">
                  <span className="chat-detail-label">Phone Number</span>
                  <a href={`tel:${phone}`} className="chat-detail-value phone-link" onClick={(e) => e.stopPropagation()}>
                    {phone}
                  </a>
                </div>
              </div>
            )}

            {messageText && (
              <div className="chat-detail-item full-width">
                <div className="chat-detail-icon description-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="chat-detail-content">
                  <span className="chat-detail-label">Message</span>
                  <p className="chat-detail-value description-text">
                    {messageText}
                  </p>
                </div>
              </div>
            )}

            <div className="chat-detail-item">
              <div className="chat-detail-icon time-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div className="chat-detail-content">
                <span className="chat-detail-label">Received</span>
                <span className="chat-detail-value">
                  {relativeTime}
                  <span className="chat-detail-subtext">
                    {new Date(createdAt).toLocaleString()}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="chat-card-actions">
            {userNs && (
              <a 
                href={getUChatUrl()} 
                target="_blank" 
                rel="noopener noreferrer"
                className="chat-action-btn primary" 
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  <line x1="9" y1="10" x2="15" y2="10"/>
                  <line x1="9" y1="14" x2="13" y2="14"/>
                </svg>
                View Chat
              </a>
            )}
            <button 
              className="chat-action-btn danger" 
              onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatCard;
