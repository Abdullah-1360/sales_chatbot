---
inclusion: always
---

# WebSocket & Real-Time Communication

## Overview
Socket.IO provides real-time bidirectional communication between the backend and frontend for live updates of chats, leads, and notifications.

## Backend Configuration

### Service: `src/services/websocket.js`
```javascript
const { initializeWebSocket, emitToAll, emitToRoom } = require('../services/websocket');

// Initialize in server.js
const io = initializeWebSocket(server);

// Emit to all connected clients
emitToAll('event-name', data);

// Emit to specific room
emitToRoom('room-name', 'event-name', data);
```

### Server Setup (server.js)
```javascript
const http = require('http');
const socketIO = require('socket.io');

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true
  }
});

// Connection handling
io.on('connection', (socket) => {
  console.log('[WebSocket] Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('[WebSocket] Client disconnected:', socket.id);
  });
});
```

## Frontend Configuration

### Service: `frontend/src/services/websocket.js`
```javascript
import { io } from 'socket.io-client';

const socket = io(WEBSOCKET_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

export default socket;
```

### Hook: `frontend/src/hooks/useWebSocket.js`
```javascript
import { useEffect, useState } from 'react';
import socket from '../services/websocket';

export function useWebSocket(eventName, callback) {
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on(eventName, callback);
    
    return () => {
      socket.off(eventName, callback);
    };
  }, [eventName, callback]);
  
  return { isConnected };
}
```

## Event Types

### Chat Events
```javascript
// Backend emits
emitToAll('new-chat', {
  id: chatId,
  message: messageText,
  timestamp: new Date(),
  user: userData
});

// Frontend listens
socket.on('new-chat', (data) => {
  // Update UI with new chat
});
```

### Lead Events
```javascript
// Backend emits
emitToAll('new-lead', {
  id: leadId,
  name: leadName,
  phone: leadPhone,
  source: leadSource
});

// Frontend listens
socket.on('new-lead', (data) => {
  // Update leads list
  // Play notification sound
});
```

### Notification Events
```javascript
// Backend emits
emitToAll('notification', {
  type: 'info|success|warning|error',
  message: 'Notification message',
  duration: 5000
});

// Frontend listens
socket.on('notification', (data) => {
  // Show toast/notification
});
```

## Chat Notification System

### Backend: `src/services/chatNotificationService.js`
Manages chat notifications with MongoDB persistence:

```javascript
const { 
  createNotification,
  markAsRead,
  getUnreadCount,
  cleanupOldNotifications
} = require('../services/chatNotificationService');

// Create notification
await createNotification({
  chatId: 'chat_123',
  message: 'New message received',
  type: 'new_message'
});

// Mark as read
await markAsRead(notificationId);

// Get unread count
const count = await getUnreadCount();
```

### Model: `src/models/ChatNotification.js`
```javascript
const schema = new mongoose.Schema({
  chatId: { type: String, required: true, index: true },
  message: String,
  type: { type: String, enum: ['new_message', 'status_change'] },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // 24h TTL
});
```

### Frontend: `frontend/src/hooks/useChatNotifications.js`
```javascript
import { useEffect, useState } from 'react';
import socket from '../services/websocket';

export function useChatNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  useEffect(() => {
    socket.on('chat-notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      
      // Play sound
      playNotificationSound();
    });
    
    return () => socket.off('chat-notification');
  }, []);
  
  return { notifications, unreadCount };
}
```

## Audio Notifications

### Sound Files
Located in `frontend/public/sounds/`:
- `new-chat.mp3` - New chat message sound
- `new-lead.mp3` - New lead notification sound

### Audio Service: `frontend/src/utils/audioGenerator.js`
```javascript
export function playNotificationSound(type = 'chat') {
  const audio = new Audio(`/sounds/new-${type}.mp3`);
  audio.volume = 0.5;
  audio.play().catch(err => {
    console.warn('Audio playback failed:', err);
  });
}
```

### Browser Permissions
```javascript
// Request audio permission on user interaction
document.addEventListener('click', () => {
  const audio = new Audio('/sounds/new-chat.mp3');
  audio.volume = 0;
  audio.play().then(() => audio.pause());
}, { once: true });
```

## Connection Status Indicator

### Component: `frontend/src/components/ConnectionStatus.jsx`
```javascript
import { useWebSocket } from '../hooks/useWebSocket';

export function ConnectionStatus() {
  const { isConnected } = useWebSocket();
  
  return (
    <div className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
      {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
    </div>
  );
}
```

## Best Practices

### 1. Event Naming
- Use kebab-case: `new-chat`, `lead-updated`
- Be specific: `chat-message-sent` not just `message`
- Namespace events: `chat:new`, `lead:updated`

### 2. Data Structure
```javascript
// Always include metadata
{
  type: 'event-type',
  timestamp: new Date().toISOString(),
  data: { /* actual payload */ },
  metadata: { source: 'system', version: '1.0' }
}
```

### 3. Error Handling
```javascript
// Backend
socket.on('error', (error) => {
  console.error('[WebSocket] Error:', error);
  socket.emit('error-response', { message: 'Error occurred' });
});

// Frontend
socket.on('error-response', (error) => {
  console.error('Server error:', error);
  showErrorNotification(error.message);
});
```

### 4. Reconnection Strategy
```javascript
// Frontend
socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  // Refresh data that might have been missed
  fetchMissedUpdates();
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect');
  showErrorNotification('Connection lost. Please refresh.');
});
```

### 5. Room Management
```javascript
// Backend - Join room
socket.on('join-room', (roomId) => {
  socket.join(roomId);
  console.log(`Socket ${socket.id} joined room ${roomId}`);
});

// Backend - Leave room
socket.on('leave-room', (roomId) => {
  socket.leave(roomId);
});

// Emit to specific room
io.to(roomId).emit('room-event', data);
```

### 6. Performance
- Throttle high-frequency events (typing indicators, mouse movements)
- Batch multiple updates when possible
- Use rooms to limit broadcast scope
- Implement message queuing for offline clients
- Clean up old notifications (TTL indexes)

### 7. Security
- Validate all incoming socket events
- Authenticate socket connections
- Rate limit socket events
- Sanitize data before broadcasting
- Use CORS properly

## Cleanup & Maintenance

### Automatic Cleanup
```javascript
// MongoDB TTL index (in model)
createdAt: { type: Date, default: Date.now, expires: 86400 }

// Manual cleanup service
const { cleanupOldNotifications } = require('../services/chatNotificationService');
await cleanupOldNotifications(24); // hours
```

### Job Scheduler
```javascript
// src/services/jobScheduler.js
agenda.define('cleanup-notifications', async () => {
  await cleanupOldNotifications(24);
});

agenda.every('1 hour', 'cleanup-notifications');
```

## Testing WebSocket

### Backend Test
```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:4000');

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('test-event', { data: 'test' });
});

socket.on('response', (data) => {
  console.log('Received:', data);
});
```

### Frontend Test
```javascript
// In browser console
window.socket = socket;
socket.emit('test-event', { test: true });
socket.on('test-response', console.log);
```

## Common Issues

### Connection Fails
- Check CORS configuration matches frontend URL
- Verify WebSocket port is accessible
- Check firewall rules
- Ensure Socket.IO versions match (client/server)

### Events Not Received
- Verify event names match exactly (case-sensitive)
- Check if socket is connected before emitting
- Ensure listeners are registered before events fire
- Check for typos in event names

### Memory Leaks
- Always clean up listeners in useEffect return
- Unsubscribe from rooms when component unmounts
- Implement TTL for stored notifications
- Monitor connection count and memory usage
