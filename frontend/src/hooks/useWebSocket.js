import { useEffect, useState, useCallback, useRef } from 'react';
import websocketService from '../services/websocket';

/**
 * Custom hook for managing WebSocket connection lifecycle
 * Provides connection status, event subscription, and automatic cleanup
 * 
 * @returns {Object} WebSocket hook interface
 * @property {boolean} isConnected - Current connection status
 * @property {number} reconnectAttempts - Number of reconnection attempts
 * @property {string} connectionStatus - Detailed connection status (connected, disconnected, reconnecting, error)
 * @property {Function} on - Subscribe to WebSocket events
 * @property {Function} off - Unsubscribe from WebSocket events
 * @property {Function} emit - Emit event to server
 */
const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const isInitialized = useRef(false);

  // Handle status changes from WebSocket service
  const handleStatusChange = useCallback(({ status, data }) => {
    setConnectionStatus(status);
    
    switch (status) {
      case 'connected':
      case 'reconnected':
        setIsConnected(true);
        setReconnectAttempts(0);
        break;
      case 'disconnected':
      case 'error':
      case 'reconnect_failed':
        setIsConnected(false);
        break;
      case 'reconnecting':
        setIsConnected(false);
        setReconnectAttempts(data || 0);
        break;
      default:
        break;
    }
  }, []);

  // Initialize WebSocket connection on mount
  useEffect(() => {
    // Subscribe to status changes
    websocketService.on('status_change', handleStatusChange);

    // Initialize connection only if not already connected
    if (!websocketService.socket || !websocketService.isConnected) {
      // Prevent double initialization in React StrictMode
      if (isInitialized.current) {
        return;
      }
      isInitialized.current = true;

      websocketService.connect()
        .then(() => {
          console.log('WebSocket connection initialized');
        })
        .catch((error) => {
          console.error('Failed to initialize WebSocket connection:', error);
        });
    } else {
      console.log('WebSocket already connected, reusing connection');
    }

    // Cleanup on unmount - DON'T disconnect, just unsubscribe
    return () => {
      websocketService.off('status_change', handleStatusChange);
      // Don't disconnect - keep WebSocket alive for the app lifetime
    };
  }, [handleStatusChange]);

  // Subscribe to WebSocket events
  const on = useCallback((eventType, handler) => {
    websocketService.on(eventType, handler);
  }, []);

  // Unsubscribe from WebSocket events
  const off = useCallback((eventType, handler) => {
    websocketService.off(eventType, handler);
  }, []);

  // Emit event to server
  const emit = useCallback((eventType, data) => {
    websocketService.emit(eventType, data);
  }, []);

  return {
    isConnected,
    reconnectAttempts,
    connectionStatus,
    on,
    off,
    emit,
  };
};

export default useWebSocket;
