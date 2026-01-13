import { useEffect, useCallback, useState } from 'react';
import chatNotificationService from '../services/chatNotificationService';

/**
 * Custom hook for managing chat notifications
 * Now works with backend notification system
 */
const useChatNotifications = () => {
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Initialize the notification service
   */
  useEffect(() => {
    const initializeService = async () => {
      try {
        await chatNotificationService.initialize();
        setIsInitialized(true);
        console.log('✅ Chat notifications initialized');
      } catch (error) {
        console.error('❌ Failed to initialize chat notifications:', error);
      }
    };

    initializeService();
  }, []);

  /**
   * Handle new chat event - backend handles notifications automatically
   * @param {Object} chat - Chat object
   * @param {boolean} isNewChat - Whether this is a truly new chat
   */
  const handleNewChat = useCallback((chat, isNewChat = true) => {
    if (!isInitialized) return;

    const chatId = chat.id || chat._id;
    
    console.log('📝 Chat event handled by backend:', { 
      chatId, 
      isNewChat, 
      isMessageUpdate: chat.isMessageUpdate 
    });
    
    // Backend automatically handles notifications based on chat creation/updates
    // No frontend action needed - notifications are managed server-side
    
  }, [isInitialized]);

  /**
   * Handle view chat action
   * @param {Object} chat - Chat object
   */
  const handleViewChat = useCallback(async (chat) => {
    try {
      const result = await chatNotificationService.handleViewChat(chat);
      console.log('✅ View chat handled successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ Error handling view chat:', error);
      throw error;
    }
  }, []);

  /**
   * Stop notifications for a chat
   * @param {string} chatId - Chat ID
   */
  const stopNotifications = useCallback(async (chatId) => {
    try {
      const result = await chatNotificationService.stopNotifications(chatId);
      console.log('✅ Notifications stopped:', result);
      return result;
    } catch (error) {
      console.error('❌ Error stopping notifications:', error);
      throw error;
    }
  }, []);

  /**
   * Get notification status for a chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object|null>} Notification status
   */
  const getNotificationStatus = useCallback(async (chatId) => {
    try {
      return await chatNotificationService.getNotificationStatus(chatId);
    } catch (error) {
      console.error('❌ Error getting notification status:', error);
      return null;
    }
  }, []);

  /**
   * Get all active notifications
   * @returns {Promise<Array>} Array of active notifications
   */
  const getAllActiveNotifications = useCallback(async () => {
    try {
      return await chatNotificationService.getAllActiveNotifications();
    } catch (error) {
      console.error('❌ Error getting active notifications:', error);
      return [];
    }
  }, []);

  /**
   * Check if notifications are active for a chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<boolean>}
   */
  const hasActiveNotifications = useCallback(async (chatId) => {
    try {
      const status = await chatNotificationService.getNotificationStatus(chatId);
      return status?.isActive || false;
    } catch (error) {
      console.error('❌ Error checking active notifications:', error);
      return false;
    }
  }, []);

  return {
    // State
    isInitialized,

    // Actions
    handleNewChat,
    handleViewChat,
    stopNotifications,

    // Utilities
    getNotificationStatus,
    getAllActiveNotifications,
    hasActiveNotifications,

    // Legacy methods (no-ops for backward compatibility)
    startNotifications: () => console.log('ℹ️ startNotifications - handled by backend'),
    stopAllNotifications: () => console.log('ℹ️ stopAllNotifications - handled by backend'),
    getActiveNotificationsCount: () => console.log('ℹ️ getActiveNotificationsCount - use getAllActiveNotifications()'),
    getActiveChatIds: () => console.log('ℹ️ getActiveChatIds - use getAllActiveNotifications()')
  };
};

export default useChatNotifications;