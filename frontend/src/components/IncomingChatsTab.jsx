import React, { useEffect, useCallback, useRef } from 'react';
import useChats from '../hooks/useChats';
import useWebSocket from '../hooks/useWebSocket';
import useNotifications from '../hooks/useNotifications';
import ChatCard from './ChatCard';
import '../styles/IncomingChatsTab.css';

/**
 * IncomingChatsTab Component
 * Displays list of chats with real-time updates via WebSocket
 */
const IncomingChatsTab = ({ onNewChat }) => {
  const { chats, loading, error, addChat, removeChat, refreshChats } = useChats();
  const { isConnected, on, off } = useWebSocket();
  const { notifyIncomingChat } = useNotifications();
  const [expandedChatId, setExpandedChatId] = React.useState(null);
  
  // Use ref to access current chats without causing re-renders
  const chatsRef = useRef(chats);
  
  // Keep ref in sync with chats
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  /**
   * Handle new chat events from WebSocket
   */
  const handleNewChat = useCallback((chatData) => {
    console.log('📥 IncomingChatsTab: handleNewChat called');
    console.log('📋 Chat data:', chatData);
    
    // Check if this is a new chat or an update to existing
    // Use ref to get current chats array
    const isNewChat = !chatsRef.current.some((chat) => {
      const chatId = chat.id || chat._id;
      const newChatId = chatData.id || chatData._id;
      return chatId && newChatId && chatId === newChatId;
    });
    
    console.log('🔍 Is new chat?', isNewChat, 'Current chats count:', chatsRef.current.length);
    
    // Add chat to the list (will be inserted at top or updated)
    console.log('➕ Adding chat to list...');
    addChat(chatData);
    console.log('✅ Chat added to list');
    
    // Always trigger notification (for both new and updated chats)
    console.log('🔔 Triggering chat notification...');
    notifyIncomingChat(chatData);
    console.log('✅ Chat notification triggered');
    
    // Only increment unread count for new chats (not updates)
    if (isNewChat) {
      if (onNewChat) {
        console.log('📈 Incrementing unread count (new chat)');
        onNewChat();
      }
    } else {
      console.log('🔄 Chat updated, notification sent but count not incremented');
    }
  }, [addChat, notifyIncomingChat, onNewChat]);

  /**
   * Handle dismiss chat action
   */
  const handleDismissChat = useCallback(async (chat) => {
    console.log('🗑️ Dismissing chat:', chat);
    
    const chatId = chat.id || chat._id;
    
    try {
      // Remove from UI immediately for better UX
      await removeChat(chat);
      
      // Close expanded card if it's the one being dismissed
      if (expandedChatId === chatId) {
        setExpandedChatId(null);
      }
      
      console.log('✅ Chat dismissed successfully');
      
    } catch (error) {
      console.error('❌ Failed to dismiss chat:', error);
      // Optionally: show error notification to user
    }
  }, [removeChat, expandedChatId]);

  /**
   * Handle card expand/collapse
   */
  const handleToggleExpand = useCallback((chatId) => {
    setExpandedChatId((prevId) => (prevId === chatId ? null : chatId));
  }, []);

  /**
   * Subscribe to WebSocket new_chat events
   */
  useEffect(() => {
    // Subscribe to new_chat events
    on('new_chat', handleNewChat);

    // Cleanup: unsubscribe on unmount
    return () => {
      off('new_chat', handleNewChat);
    };
  }, [on, off, handleNewChat]);

  /**
   * Render loading state
   */
  if (loading) {
    return (
      <div className="incoming-chats-tab">
        <div className="incoming-chats-loading">
          <div className="loading-spinner"></div>
          <p>Loading chats...</p>
        </div>
      </div>
    );
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <div className="incoming-chats-tab">
        <div className="incoming-chats-error">
          <p className="error-message">Failed to load chats: {error}</p>
          <button onClick={refreshChats} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  /**
   * Render empty state
   */
  if (chats.length === 0) {
    return (
      <div className="incoming-chats-tab">
        <div className="incoming-chats-empty">
          <p>No chats yet. New chats will appear here in real-time.</p>
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
   * Render chats list
   */
  return (
    <div className="incoming-chats-tab">
      <div className="incoming-chats-header">
        <h2>Incoming Chats ({chats.length})</h2>
        {!isConnected && (
          <span className="connection-warning">
            ⚠️ Reconnecting...
          </span>
        )}
      </div>
      
      <div className="incoming-chats-list">
        {chats.map((chat) => {
          const chatId = chat.id || chat._id;
          return (
            <ChatCard 
              key={chatId || `${chat.email}-${chat.createdAt}`} 
              chat={chat}
              isExpanded={expandedChatId === chatId}
              onToggleExpand={() => handleToggleExpand(chatId)}
              onDismiss={handleDismissChat}
            />
          );
        })}
      </div>
    </div>
  );
};

export default IncomingChatsTab;
