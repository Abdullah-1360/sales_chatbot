# Design Document

## Overview

The real-time dashboard is a React.js single-page application that displays new leads and incoming chats in separate tabs. The application uses WebSocket connections for real-time updates and integrates with the existing Express.js backend. The frontend will be built with modern React patterns (hooks, functional components) and will provide a responsive, user-friendly interface with real-time notifications.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Client)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           React Dashboard Application                   │ │
│  │  ┌──────────────┐  ┌──────────────┐                   │ │
│  │  │ New Leads    │  │ Incoming     │                   │ │
│  │  │ Tab          │  │ Chats Tab    │                   │ │
│  │  └──────────────┘  └──────────────┘                   │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │      WebSocket Client Manager                     │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │      Notification System                          │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ HTTP/WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Express.js Backend Server                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           WebSocket Server (Socket.IO)                  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           REST API Endpoints                            │ │
│  │           - POST /api/leads                             │ │
│  │           - GET /api/leads (new endpoint)               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           VTiger Integration Service                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- React 18.x (with hooks)
- Socket.IO Client (for WebSocket connections)
- Axios (for HTTP requests)
- CSS Modules or Styled Components (for styling)
- date-fns or dayjs (for timestamp formatting)

**Backend Additions:**
- Socket.IO (WebSocket server)
- CORS middleware (for frontend-backend communication)

## Components and Interfaces

### Frontend Components

#### 1. App Component
- Root component that manages routing and global state
- Handles WebSocket connection initialization
- Manages notification permissions

#### 2. Dashboard Component
- Container component for the entire dashboard
- Manages tab state (active tab selection)
- Renders TabNavigation and TabContent components

#### 3. TabNavigation Component
- Displays tab buttons ("Incoming Chats", "New Leads")
- Handles tab switching
- Shows active tab indicator

#### 4. NewLeadsTab Component
- Displays list of leads sorted by timestamp (newest first)
- Handles initial data fetching via HTTP
- Subscribes to WebSocket events for new leads
- Manages lead list state
- Shows loading and error states

#### 5. IncomingChatsTab Component
- Placeholder component with "Coming Soon" message
- Maintains consistent layout structure

#### 6. LeadCard Component
- Displays individual lead information
- Props: lead object (firstname, lastname, email, phone, description, timestamp)
- Formats timestamp to relative time (e.g., "2 minutes ago")

#### 7. ConnectionStatus Component
- Displays WebSocket connection status
- Shows connected/disconnected indicator
- Provides visual feedback during reconnection attempts

#### 8. NotificationManager Component
- Handles browser notifications
- Plays audio alerts for new leads
- Manages notification permissions
- Provides different sounds for different event types

### WebSocket Events

#### Client → Server
- `connection`: Initial connection establishment
- `authenticate`: Send authentication token (if required)
- `disconnect`: Client disconnection

#### Server → Client
- `connect`: Connection established
- `disconnect`: Connection lost
- `new_lead`: New lead created (payload: lead object)
- `reconnect`: Successful reconnection
- `error`: Error message

### REST API Endpoints

#### Existing Endpoint
- `POST /api/leads`: Create new lead (already implemented)

#### New Endpoints Required
- `GET /api/leads`: Fetch all leads (with pagination and sorting)
  - Query params: `limit`, `offset`, `sort`
  - Response: `{ success: true, leads: [...], total: number }`

### Data Models

#### Lead Object
```javascript
{
  id: string,              // Unique identifier from VTiger
  firstname: string,       // First name
  lastname: string,        // Last name
  email: string,          // Email address
  phone: string,          // Phone number (optional)
  description: string,    // Lead description (optional)
  createdAt: Date,        // Timestamp of creation
  source: string          // Lead source (e.g., "Chatbot")
}
```

#### WebSocket Message Format
```javascript
{
  type: 'new_lead',
  data: {
    ...leadObject
  },
  timestamp: Date
}
```

## Error Handling

### Frontend Error Scenarios

1. **WebSocket Connection Failure**
   - Display connection status indicator
   - Attempt automatic reconnection every 3 seconds
   - Show user-friendly error message
   - Fall back to HTTP polling if WebSocket unavailable

2. **HTTP Request Failure**
   - Display error message in UI
   - Provide retry button
   - Log errors to console for debugging

3. **Notification Permission Denied**
   - Gracefully degrade to in-app notifications only
   - Show message explaining how to enable notifications

4. **Invalid Data Received**
   - Validate data structure before rendering
   - Log validation errors
   - Skip invalid entries without crashing

### Backend Error Scenarios

1. **WebSocket Broadcast Failure**
   - Log error details
   - Continue processing (don't block lead creation)
   - Clients will sync on reconnection

2. **Lead Fetch Failure**
   - Return appropriate HTTP error code
   - Include error message in response
   - Log error for monitoring

## Testing Strategy

### Frontend Testing

1. **Unit Tests**
   - Component rendering tests
   - State management logic
   - Utility functions (timestamp formatting, data validation)
   - WebSocket event handlers

2. **Integration Tests**
   - Tab switching functionality
   - WebSocket connection and reconnection
   - HTTP API integration
   - Notification system

3. **Manual Testing**
   - Real-time lead updates
   - Audio notifications
   - Connection status indicators
   - Responsive design on different screen sizes

### Backend Testing

1. **Unit Tests**
   - WebSocket event emission
   - Lead fetch endpoint
   - Data formatting

2. **Integration Tests**
   - End-to-end lead creation and broadcast
   - Multiple client connections
   - Reconnection handling

## Implementation Considerations

### WebSocket Implementation

- Use Socket.IO for cross-browser compatibility and automatic reconnection
- Implement heartbeat mechanism to detect stale connections
- Store lead creation events temporarily for clients that reconnect
- Consider using Redis for multi-server deployments (future enhancement)

### Performance Optimization

- Implement virtual scrolling for large lead lists (if needed)
- Debounce notification sounds to prevent audio overlap
- Use React.memo for LeadCard components to prevent unnecessary re-renders
- Lazy load audio files

### Security

- Validate all incoming WebSocket messages
- Sanitize lead data before rendering (prevent XSS)
- Implement CORS properly for frontend-backend communication
- Consider authentication for WebSocket connections (future enhancement)

### Deployment

- Frontend: Static files served from `/frontend` directory
- Backend: Existing Express server with Socket.IO added
- Environment variables for WebSocket URL configuration
- Build process for React application (webpack/vite)

## File Structure

```
frontend/
├── public/
│   ├── index.html
│   ├── sounds/
│   │   ├── new-lead.mp3
│   │   └── new-chat.mp3 (placeholder)
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── Dashboard.jsx
│   │   ├── TabNavigation.jsx
│   │   ├── NewLeadsTab.jsx
│   │   ├── IncomingChatsTab.jsx
│   │   ├── LeadCard.jsx
│   │   ├── ConnectionStatus.jsx
│   │   └── NotificationManager.jsx
│   ├── services/
│   │   ├── websocket.js
│   │   ├── api.js
│   │   └── notifications.js
│   ├── utils/
│   │   ├── dateFormatter.js
│   │   └── validators.js
│   ├── hooks/
│   │   ├── useWebSocket.js
│   │   ├── useLeads.js
│   │   └── useNotifications.js
│   ├── styles/
│   │   ├── Dashboard.module.css
│   │   ├── LeadCard.module.css
│   │   └── global.css
│   ├── App.jsx
│   ├── index.jsx
│   └── config.js
├── package.json
├── vite.config.js (or webpack.config.js)
└── .env.example

src/ (backend)
├── controllers/
│   └── leads.js (new controller for GET /api/leads)
├── services/
│   └── websocket.js (new WebSocket service)
└── app.js (updated to include Socket.IO)
```

## Configuration

### Environment Variables

**Frontend (.env):**
```
REACT_APP_API_URL=http://localhost:3000
REACT_APP_WS_URL=http://localhost:3000
```

**Backend (.env additions):**
```
CORS_ORIGIN=http://localhost:5173
WS_PORT=3000
```

## Future Enhancements

1. Implement "Incoming Chats" tab functionality
2. Add filtering and search capabilities
3. Implement lead assignment to sales representatives
4. Add lead status updates (contacted, qualified, etc.)
5. Implement authentication and user management
6. Add analytics dashboard
7. Support for multiple notification channels (email, SMS)
8. Mobile responsive design improvements
