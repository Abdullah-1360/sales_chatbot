/**
 * Chat Notification Service
 * Frontend service that communicates with backend notification system
 */

import config from '../config';

class ChatNotificationService {
  constructor() {
    this.baseUrl = `${config.apiUrl}/chat-notifications`;
    this.isInitialized = false;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Request notification permission for browser notifications
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        console.log('Notification permission:', permission);
      }

      this.isInitialized = true;
      console.log('✅ ChatNotificationService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize ChatNotificationService:', error);
    }
  }

  /**
   * Handle view chat action - calls backend API
   * @param {Object} chat - Chat object
   */
  async handleViewChat(chat) {
    const chatId = chat.id || chat._id;
    const userNs = chat.userNs;
    
    console.log('🔗 View Chat clicked for:', userNs);
    console.log('👁️ View chat clicked for:', chatId);
    console.log('🌐 API Base URL:', this.baseUrl);
    console.log('📡 Full API URL:', `${this.baseUrl}/view-chat`);

    try {
      // Call backend API to handle view chat
      const response = await fetch(`${this.baseUrl}/view-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json', // Explicitly request JSON
          'Cache-Control': 'no-cache', // Prevent caching issues
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({
          chatId,
          userNs
        })
      });

      console.log('📊 Response details:');
      console.log('  Status:', response.status);
      console.log('  Status Text:', response.statusText);
      console.log('  URL:', response.url);
      console.log('  Headers:', Object.fromEntries(response.headers.entries()));

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        console.error('❌ Non-JSON response received:', textResponse.substring(0, 200));
        console.error('🔍 This usually indicates:');
        console.error('  1. Browser cache serving old HTML responses');
        console.error('  2. Network proxy/CDN serving cached content');
        console.error('  3. Wrong API endpoint being called');
        console.error('💡 Try: Hard refresh (Ctrl+Shift+R) or clear browser cache');
        throw new Error(`Server returned ${response.status}: ${response.statusText}. Expected JSON but got ${contentType}. Try clearing browser cache.`);
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to handle view chat');
      }

      console.log('✅ View chat action completed:', result);

      // Open UChat URL if provided
      if (result.result?.uchatUrl && result.result.uchatUrl !== '#') {
        window.open(result.result.uchatUrl, '_blank', 'noopener,noreferrer');
      }

      // Show success notification
      this.showSuccessNotification('Chat opened successfully! Notifications stopped.');

      return result;

    } catch (error) {
      console.error('❌ Error handling view chat:', error);
      
      // Show error notification with helpful message
      if (error.message.includes('Unexpected token')) {
        this.showErrorNotification('Browser cache issue detected. Please hard refresh (Ctrl+Shift+R) and try again.');
      } else {
        this.showErrorNotification('Failed to open chat. Please try again.');
      }
      
      throw error;
    }
  }

  /**
   * Stop notifications for a chat
   * @param {string} chatId - Chat ID
   */
  async stopNotifications(chatId) {
    console.log('🛑 Stopping notifications for chat:', chatId);
    console.log('🔗 API URL:', `${this.baseUrl}/stop`);

    try {
      const response = await fetch(`${this.baseUrl}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({
          chatId,
          reason: 'dismissed'
        })
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        console.error('❌ Non-JSON response received:', textResponse.substring(0, 200));
        console.error('💡 Try clearing browser cache (Ctrl+Shift+R)');
        throw new Error(`Server returned ${response.status}: ${response.statusText}. Try clearing browser cache.`);
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to stop notifications');
      }

      console.log('✅ Notifications stopped:', result);
      
      // Show success notification
      this.showSuccessNotification('Notifications dismissed successfully.');

      return result;

    } catch (error) {
      console.error('❌ Error stopping notifications:', error);
      
      // Show error notification
      if (error.message.includes('cache')) {
        this.showErrorNotification('Browser cache issue. Please refresh and try again.');
      } else {
        this.showErrorNotification('Failed to dismiss notifications. Please try again.');
      }
      
      throw error;
    }
  }

  /**
   * Get notification status for a chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object|null>} Notification status
   */
  async getNotificationStatus(chatId) {
    try {
      const response = await fetch(`${this.baseUrl}/status/${chatId}`);
      
      if (response.status === 404) {
        return null; // No notification record found
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        console.error('❌ Non-JSON response received:', textResponse.substring(0, 200));
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to get notification status');
      }

      return result.status;

    } catch (error) {
      console.error('❌ Error getting notification status:', error);
      return null;
    }
  }

  /**
   * Get all active notifications
   * @returns {Promise<Array>} Array of active notifications
   */
  async getAllActiveNotifications() {
    try {
      const response = await fetch(`${this.baseUrl}/active`);
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        console.error('❌ Non-JSON response received:', textResponse.substring(0, 200));
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to get active notifications');
      }

      return result.notifications || [];

    } catch (error) {
      console.error('❌ Error getting active notifications:', error);
      return [];
    }
  }

  /**
   * Show success notification
   * @param {string} message - Success message
   */
  showSuccessNotification(message) {
    this.showToast(message, 'success');
  }

  /**
   * Show error notification
   * @param {string} message - Error message
   */
  showErrorNotification(message) {
    this.showToast(message, 'error');
  }

  /**
   * Show toast notification
   * @param {string} message - Message to show
   * @param {string} type - Type of toast (success, error, info)
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    // Add toast styles if not already present
    if (!document.querySelector('#toast-styles')) {
      const styles = document.createElement('style');
      styles.id = 'toast-styles';
      styles.textContent = `
        .toast {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 20px;
          border-radius: 6px;
          color: white;
          font-weight: 500;
          z-index: 10000;
          transform: translateX(400px);
          transition: transform 0.3s ease;
          max-width: 300px;
          word-wrap: break-word;
        }
        .toast.show {
          transform: translateX(0);
        }
        .toast-success {
          background-color: #10b981;
        }
        .toast-error {
          background-color: #ef4444;
        }
        .toast-info {
          background-color: #3b82f6;
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(toast);

    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);

    // Remove toast
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Legacy methods for backward compatibility (now no-ops since backend handles everything)
  startNotifications() {
    console.log('ℹ️ startNotifications called - backend handles this automatically');
  }

  resetNotifications() {
    console.log('ℹ️ resetNotifications called - backend handles this automatically');
  }

  showNotification() {
    console.log('ℹ️ showNotification called - backend handles this automatically');
  }

  stopAllNotifications() {
    console.log('ℹ️ stopAllNotifications called - backend handles this automatically');
  }

  getActiveNotificationsCount() {
    console.log('ℹ️ getActiveNotificationsCount called - use getAllActiveNotifications() instead');
    return 0;
  }

  getActiveChatIds() {
    console.log('ℹ️ getActiveChatIds called - use getAllActiveNotifications() instead');
    return [];
  }
}

// Create singleton instance
const chatNotificationService = new ChatNotificationService();

// Make it globally available for onclick handlers
if (typeof window !== 'undefined') {
  window.chatNotificationService = chatNotificationService;
}

export default chatNotificationService;