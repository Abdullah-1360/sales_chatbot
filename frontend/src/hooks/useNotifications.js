/**
 * useNotifications Hook
 * Custom React hook for managing notification state and permissions
 * Requirements: 2.1, 2.4
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import notificationService from '../services/notifications.js';

/**
 * Custom hook for managing browser notifications
 * Requirement 2.1: Display visual notification with lead's name and email
 * Requirement 2.4: Display individual notifications for each lead when multiple arrive within 5 seconds
 * 
 * @returns {Object} Notification state and functions
 */
export function useNotifications() {
  const [permission, setPermission] = useState('default');
  const [isEnabled, setIsEnabled] = useState(false);
  const notificationQueueRef = useRef([]);
  const isProcessingRef = useRef(false);

  /**
   * Initialize notification permissions on mount
   * Requirement 2.5: Request browser notification permissions on initial load
   */
  useEffect(() => {
    const initPermissions = async () => {
      // Check browser's actual permission status
      if ('Notification' in window) {
        const browserPermission = Notification.permission;
        notificationService.permission = browserPermission;
        setPermission(browserPermission);
        setIsEnabled(browserPermission === 'granted');
      } else {
        setPermission('denied');
        setIsEnabled(false);
      }
    };

    initPermissions();
  }, []);

  /**
   * Request notification permission from the user
   * @returns {Promise<string>} Permission status
   */
  const requestPermission = useCallback(async () => {
    const result = await notificationService.requestPermission();
    setPermission(result);
    setIsEnabled(result === 'granted');
    return result;
  }, []);

  /**
   * Process notification queue
   * Requirement 2.4: Display individual notifications for each lead
   * Ensures notifications are shown one at a time with proper spacing
   */
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || notificationQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;

    while (notificationQueueRef.current.length > 0) {
      const notification = notificationQueueRef.current.shift();
      
      try {
        if (notification.type === 'lead') {
          await notificationService.notifyNewLead(notification.data);
        } else if (notification.type === 'chat') {
          await notificationService.notifyIncomingChat(notification.data);
        }

        // Small delay between notifications to prevent overlap
        // Requirement 2.4: Handle multiple leads arriving within 5 seconds
        if (notificationQueueRef.current.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error('Error processing notification:', error);
      }
    }

    isProcessingRef.current = false;
  }, []);

  /**
   * Notify about a new lead
   * Requirement 2.1: Display visual notification with lead's name and email
   * Requirement 2.2: Play distinct audio notification sound
   * @param {Object} lead - Lead object
   */
  const notifyNewLead = useCallback((lead) => {
    if (!lead) {
      console.warn('Cannot notify: lead data is missing');
      return;
    }

    // Add to queue for processing
    // Requirement 2.4: Queue notifications when multiple arrive
    notificationQueueRef.current.push({
      type: 'lead',
      data: lead,
      timestamp: Date.now(),
    });

    // Start processing queue
    processQueue();
  }, [processQueue]);

  /**
   * Notify about an incoming chat
   * Requirement 2.3: Use different audio sound for chats
   * @param {Object} chat - Chat object
   */
  const notifyIncomingChat = useCallback((chat) => {
    if (!chat) {
      console.warn('Cannot notify: chat data is missing');
      return;
    }

    // Add to queue for processing
    notificationQueueRef.current.push({
      type: 'chat',
      data: chat,
      timestamp: Date.now(),
    });

    // Start processing queue
    processQueue();
  }, [processQueue]);

  /**
   * Play a notification sound without showing a visual notification
   * @param {string} soundType - Type of sound ('new-lead' or 'new-chat')
   */
  const playSound = useCallback(async (soundType = 'new-lead') => {
    try {
      await notificationService.playSound(soundType);
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }, []);

  /**
   * Clear the notification queue
   * Useful for cleanup or when user navigates away
   */
  const clearQueue = useCallback(() => {
    notificationQueueRef.current = [];
    isProcessingRef.current = false;
  }, []);

  /**
   * Get the current queue length
   * @returns {number} Number of pending notifications
   */
  const getQueueLength = useCallback(() => {
    return notificationQueueRef.current.length;
  }, []);

  return {
    // State
    permission,
    isEnabled,
    
    // Functions
    requestPermission,
    notifyNewLead,
    notifyIncomingChat,
    playSound,
    clearQueue,
    getQueueLength,
  };
}

export default useNotifications;
