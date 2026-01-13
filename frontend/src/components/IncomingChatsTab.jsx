import React, { useEffect, useCallback, useRef } from 'react';
import useChats from '../hooks/useChats';
import useWebSocket from '../hooks/useWebSocket';
import useNotifications from '../hooks/useNotifications';
import useChatNotifications from '../hooks/useChatNotifications';
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
  const { handleNewChat: handleChatNotification } = useChatNotifications();
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
    
    // Check if this is a notification reminder
    const isNotificationReminder = chatData.isNotificationReminder || false;
    const notificationCount = chatData.notificationCount || 1;
    const maxNotifications = chatData.maxNotifications || 5;
    const isFinalNotification = chatData.isFinalNotification || false;
    
    // Check if this is a new chat or an update to existing
    const existingChat = chatsRef.current.find((chat) => {
      const chatId = chat.id || chat._id;
      const newChatId = chatData.id || chatData._id;
      
      // Match by ID first
      if (chatId && newChatId && chatId === newChatId) {
        return true;
      }
      
      // Match by User_Ns if both have it
      if (chat.userNs && chatData.userNs && chat.userNs === chatData.userNs) {
        return true;
      }
      
      return false;
    });
    
    const isNewChat = !existingChat && !isNotificationReminder;
    const isUpdate = chatData.isUpdate || !chatData.isNewChat;
    
    console.log('🔍 Is new chat?', isNewChat, 'Is update?', isUpdate, 'Is notification reminder?', isNotificationReminder);
    
    // Only add/update chat in list if it's not just a notification reminder
    if (!isNotificationReminder) {
      console.log('➕ Adding/updating chat in list...');
      addChat(chatData);
      console.log('✅ Chat processed in list');
    }
    
    // Always trigger notification (for new chats, updates, and reminders)
    console.log('🔔 Triggering chat notification...');
    
    // Show browser notification for reminders and new chats
    if (isNotificationReminder || isNewChat) {
      const fullName = `${chatData.firstname || ''} ${chatData.lastname || ''}`.trim() || 'Unknown User';
      const messageText = chatData.messages && chatData.messages.length > 0 
        ? chatData.messages[chatData.messages.length - 1].text 
        : chatData.comment || chatData.description || 'New message';
      
      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        const title = isNotificationReminder 
          ? `🔔 Reminder ${notificationCount}/${maxNotifications}: Chat from ${fullName}`
          : `💬 New Chat from ${fullName}`;
        
        const body = chatData.messageCount > 1 
          ? `${chatData.messageCount} messages - Latest: ${messageText}`
          : messageText;

        const notification = new Notification(title, {
          body: body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `chat-${chatData.id}`,
          requireInteraction: true,
          data: chatData
        });

        // Handle notification click
        notification.onclick = () => {
          handleNotificationClick(chatData);
          notification.close();
        };

        // Auto-close after 10 seconds
        setTimeout(() => {
          notification.close();
        }, 10000);
      }

      // Show in-app notification
      showInAppNotification(chatData, isNotificationReminder, notificationCount, maxNotifications, isFinalNotification);
    }
    
    // Regular notification for all events
    notifyIncomingChat(chatData);
    console.log('✅ Chat notification triggered');
    
    // Handle chat notification system for new chats only
    if (isNewChat) {
      console.log('🔔 Handling chat notification system for new chat...');
      
      // Wait a bit for the chat to be processed in the list
      setTimeout(() => {
        handleChatNotification(chatData, isNewChat);
      }, 100);
      
      console.log('✅ Chat notification system activated');
    }
    
    // Only increment unread count for truly new chats
    if (isNewChat && !isUpdate) {
      if (onNewChat) {
        console.log('📈 Incrementing unread count (new chat)');
        onNewChat();
      }
    } else {
      console.log('🔄 Chat updated, notification reminder, or message appended');
    }
  }, [addChat, notifyIncomingChat, handleChatNotification, onNewChat]);

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
   * Handle notification click - call backend API
   */
  const handleNotificationClick = useCallback(async (chatData) => {
    try {
      const chat = {
        id: chatData.id,
        userNs: chatData.userNs,
        firstname: chatData.firstname,
        lastname: chatData.lastname,
        email: chatData.email,
        phone: chatData.phone
      };

      await chatNotificationService.handleViewChat(chat);
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  }, []);

  /**
   * Show in-app notification
   */
  const showInAppNotification = useCallback((chatData, isReminder, currentCount, maxCount, isFinal) => {
    const fullName = `${chatData.firstname || ''} ${chatData.lastname || ''}`.trim() || 'Unknown User';
    const messageText = chatData.messages && chatData.messages.length > 0 
      ? chatData.messages[chatData.messages.length - 1].text 
      : chatData.comment || chatData.description || 'New message';
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'in-app-notification';
    
    const notificationTitle = isReminder 
      ? `Chat Reminder ${currentCount}/${maxCount} - ${fullName}`
      : `New Chat - ${fullName}`;
    
    const finalNotificationWarning = isFinal 
      ? '<div class="notification-warning">⚠️ This is the final reminder for this chat</div>' 
      : '';
    
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-header">
          <span class="notification-icon">${isReminder ? '🔔' : '💬'}</span>
          <span class="notification-title">${notificationTitle}</span>
          <button class="notification-close" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="notification-body">${messageText}</div>
        ${finalNotificationWarning}
        <div class="notification-actions">
          <button class="notification-btn primary" onclick="window.handleInAppNotificationViewChat('${chatData.id}', '${chatData.userNs}', '${chatData.firstname}', '${chatData.lastname}', '${chatData.email}', '${chatData.phone}'); this.parentElement.parentElement.parentElement.remove();">
            View Chat
          </button>
          <button class="notification-btn secondary" onclick="window.handleInAppNotificationDismiss('${chatData.id}'); this.parentElement.parentElement.parentElement.remove();">
            Dismiss
          </button>
        </div>
      </div>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 8 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 8000);

    // Add entrance animation
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
  }, []);

  /**
   * Set up global handlers for in-app notification actions
   */
  useEffect(() => {
    // View chat handler
    window.handleInAppNotificationViewChat = async (chatId, userNs, firstname, lastname, email, phone) => {
      try {
        const chat = {
          id: chatId,
          userNs: userNs,
          firstname: firstname,
          lastname: lastname,
          email: email,
          phone: phone
        };

        await chatNotificationService.handleViewChat(chat);
      } catch (error) {
        console.error('Error in in-app notification view chat handler:', error);
      }
    };

    // Dismiss handler
    window.handleInAppNotificationDismiss = async (chatId) => {
      try {
        await chatNotificationService.stopNotifications(chatId);
      } catch (error) {
        console.error('Error in in-app notification dismiss handler:', error);
      }
    };

    // Cleanup on unmount
    return () => {
      delete window.handleInAppNotificationViewChat;
      delete window.handleInAppNotificationDismiss;
    };
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
