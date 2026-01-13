import { io } from 'socket.io-client';
import config from '../config';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.eventHandlers = new Map();
  }

  /**
   * Initialize WebSocket connection
   * @returns {Promise} Resolves when connection is established
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        // Initialize Socket.IO client with reconnection configuration
        this.socket = io(config.wsUrl, {
          reconnection: true,
          reconnectionDelay: 3000, // 3 seconds between reconnection attempts
          reconnectionAttempts: Infinity,
          transports: ['websocket', 'polling'],
        });

        // Connection established
        this.socket.on('connect', () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.triggerStatusChange('connected');
          resolve();
        });

        // Connection error
        this.socket.on('connect_error', (error) => {
          console.error('WebSocket connection error:', error);
          this.isConnected = false;
          this.triggerStatusChange('error', error);
          
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        });

        // Disconnection
        this.socket.on('disconnect', (reason) => {
          console.log('WebSocket disconnected:', reason);
          this.isConnected = false;
          this.triggerStatusChange('disconnected', reason);
        });

        // Reconnection attempt
        this.socket.io.on('reconnect_attempt', (attemptNumber) => {
          console.log(`WebSocket reconnection attempt ${attemptNumber}`);
          this.reconnectAttempts = attemptNumber;
          this.triggerStatusChange('reconnecting', attemptNumber);
        });

        // Reconnection successful
        this.socket.io.on('reconnect', (attemptNumber) => {
          console.log(`WebSocket reconnected after ${attemptNumber} attempts`);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.triggerStatusChange('reconnected', attemptNumber);
        });

        // Reconnection failed
        this.socket.io.on('reconnect_failed', () => {
          console.error('WebSocket reconnection failed');
          this.isConnected = false;
          this.triggerStatusChange('reconnect_failed');
        });

        // Listen for new_lead events
        this.socket.on('new_lead', (payload) => {
          console.log('🔔 WebSocket: new_lead event received');
          console.log('📦 Raw payload:', JSON.stringify(payload, null, 2));
          
          // Extract lead data from payload (backend sends { type, data, timestamp })
          const leadData = payload.data || payload;
          // console.log('📋 Extracted lead data:', JSON.stringify(leadData, null, 2));
          // console.log('🎯 Triggering new_lead event to', this.eventHandlers.get('new_lead')?.length || 0, 'handlers');
          
          this.triggerEvent('new_lead', leadData);
        });

        // Listen for new_chat events
        this.socket.on('new_chat', (payload) => {
          console.log('💬 WebSocket: new_chat event received');
          console.log('📦 Raw payload:', JSON.stringify(payload, null, 2));
          
          // Extract chat data from payload (backend sends { type, data, timestamp })
          const chatData = payload.data || payload;
          // console.log('📋 Extracted chat data:', JSON.stringify(chatData, null, 2));
          // console.log('🎯 Triggering new_chat event to', this.eventHandlers.get('new_chat')?.length || 0, 'handlers');
          
          this.triggerEvent('new_chat', chatData);
        });

        // Listen for chat notification events from backend
        this.socket.on('chat_notification', (notificationData) => {
          console.log('🔔 WebSocket: chat_notification event received');
          console.log('📦 Notification data:', JSON.stringify(notificationData, null, 2));
          
          this.triggerEvent('chat_notification', notificationData);
        });

        // Generic error handler
        this.socket.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.triggerEvent('error', error);
        });

      } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect WebSocket connection
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('WebSocket disconnected manually');
    }
  }

  /**
   * Register event handler for specific event type
   * @param {string} eventType - Event type (e.g., 'new_lead', 'status_change')
   * @param {Function} handler - Callback function
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Unregister event handler
   * @param {string} eventType - Event type
   * @param {Function} handler - Callback function to remove
   */
  off(eventType, handler) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Trigger event handlers for specific event type
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   */
  triggerEvent(eventType, data) {
    console.log(`🚀 Triggering event: ${eventType}`);
    
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      console.log(`   Found ${handlers.length} handler(s) for ${eventType}`);
      
      handlers.forEach((handler, index) => {
        try {
          console.log(`   Calling handler #${index + 1}`);
          handler(data);
          console.log(`   ✅ Handler #${index + 1} completed`);
        } catch (error) {
          console.error(`   ❌ Error in ${eventType} handler #${index + 1}:`, error);
        }
      });
    } else {
      console.warn(`   ⚠️ No handlers registered for ${eventType}`);
    }
  }

  /**
   * Trigger status change handlers
   * @param {string} status - Connection status
   * @param {*} data - Additional data
   */
  triggerStatusChange(status, data) {
    this.triggerEvent('status_change', { status, data });
  }

  /**
   * Get current connection status
   * @returns {boolean} Connection status
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * Get number of reconnection attempts
   * @returns {number} Reconnection attempts
   */
  getReconnectAttempts() {
    return this.reconnectAttempts;
  }

  /**
   * Emit event to server
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   */
  emit(eventType, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit(eventType, data);
    } else {
      console.warn('Cannot emit event: WebSocket not connected');
    }
  }
}

// Export singleton instance
const websocketService = new WebSocketService();
export default websocketService;
