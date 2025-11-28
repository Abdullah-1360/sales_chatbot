# Implementation Plan

- [x] 1. Set up React frontend project structure
  - Initialize React project in frontend folder using Vite
  - Install required dependencies (socket.io-client, axios, dayjs)
  - Create folder structure (components, services, hooks, utils, styles)
  - Set up environment configuration file
  - Create basic App.jsx and index.jsx entry points
  - _Requirements: 5.5, 6.1_

- [x] 2. Implement backend WebSocket server
  - [x] 2.1 Install Socket.IO on backend
    - Add socket.io dependency to package.json
    - Install CORS middleware for frontend communication
    - _Requirements: 3.1, 5.1_
  
  - [x] 2.2 Create WebSocket service module
    - Create src/services/websocket.js
    - Implement Socket.IO server initialization
    - Set up connection event handlers
    - Implement broadcast function for new leads
    - Add error handling and logging
    - _Requirements: 3.1, 3.2_
  
  - [x] 2.3 Integrate WebSocket with Express app
    - Update src/app.js to initialize Socket.IO
    - Configure CORS for frontend origin
    - Attach Socket.IO to HTTP server in server.js
    - _Requirements: 3.1, 5.1_
  
  - [x] 2.4 Update lead creation to broadcast events
    - Modify src/controllers/vtiger.js to emit WebSocket event after lead creation
    - Include full lead data in broadcast payload
    - Add timestamp to lead object
    - _Requirements: 1.3, 3.1_

- [x] 3. Create backend API endpoint for fetching leads
  - [x] 3.1 Create leads controller with GET endpoint
    - Create src/controllers/leads.js
    - Implement GET handler with pagination support
    - Add sorting by creation date (descending)
    - Handle query parameters (limit, offset)
    - _Requirements: 5.3, 1.2_
  
  - [x] 3.2 Add route for leads endpoint
    - Update src/routes/index.js
    - Add GET /api/leads route
    - _Requirements: 5.3_
  
  - [x] 3.3 Write integration tests for leads endpoint
    - Test successful lead fetching
    - Test pagination functionality
    - Test error handling
    - _Requirements: 5.3_

- [x] 4. Build frontend WebSocket integration
  - [x] 4.1 Create WebSocket service
    - Create src/services/websocket.js
    - Implement Socket.IO client connection
    - Add event listeners for new_lead events
    - Implement reconnection logic with 3-second intervals
    - Add connection status tracking
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 4.2 Create useWebSocket custom hook
    - Create src/hooks/useWebSocket.js
    - Manage WebSocket connection lifecycle
    - Expose connection status and event handlers
    - Handle cleanup on component unmount
    - _Requirements: 3.1, 3.2, 3.5_
  
  - [x] 4.3 Create API service for HTTP requests
    - Create src/services/api.js
    - Implement fetchLeads function using axios
    - Add error handling and response validation
    - Configure base URL from environment variables
    - _Requirements: 5.3, 5.4_

- [x] 5. Implement notification system
  - [x] 5.1 Create notification service
    - Create src/services/notifications.js
    - Implement browser notification permission request
    - Create function to show notifications
    - Add audio playback functionality
    - Handle permission denied gracefully
    - _Requirements: 2.1, 2.2, 2.5_
  
  - [x] 5.2 Add notification audio files
    - Add public/sounds/new-lead.mp3 audio file
    - Add public/sounds/new-chat.mp3 placeholder
    - Ensure audio files are optimized for web
    - _Requirements: 2.2, 2.3_
  
  - [x] 5.3 Create useNotifications custom hook
    - Create src/hooks/useNotifications.js
    - Manage notification state and permissions
    - Expose functions to trigger notifications
    - Implement notification queuing for multiple leads
    - _Requirements: 2.1, 2.4_

- [x] 6. Build core dashboard components
  - [x] 6.1 Create Dashboard container component
    - Create src/components/Dashboard.jsx
    - Implement tab state management
    - Render TabNavigation and tab content
    - Add basic styling and layout
    - _Requirements: 1.1, 6.1, 6.5_
  
  - [x] 6.2 Create TabNavigation component
    - Create src/components/TabNavigation.jsx
    - Implement tab buttons for "Incoming Chats" and "New Leads"
    - Add active tab indicator styling
    - Handle tab click events
    - _Requirements: 1.1, 6.3_
  
  - [x] 6.3 Create ConnectionStatus component
    - Create src/components/ConnectionStatus.jsx
    - Display connection status indicator
    - Show reconnection attempts
    - Add visual styling for connected/disconnected states
    - _Requirements: 3.4, 3.5_

- [x] 7. Implement New Leads tab functionality
  - [x] 7.1 Create useLeads custom hook
    - Create src/hooks/useLeads.js
    - Manage leads state array
    - Implement initial data fetching
    - Handle new lead insertion at top of list
    - Sort leads by timestamp descending
    - _Requirements: 1.2, 1.3, 1.5_
  
  - [x] 7.2 Create NewLeadsTab component
    - Create src/components/NewLeadsTab.jsx
    - Use useLeads and useWebSocket hooks
    - Implement loading state display
    - Render list of LeadCard components
    - Handle empty state
    - Subscribe to WebSocket new_lead events
    - Trigger notifications for new leads
    - _Requirements: 1.2, 1.3, 1.5, 2.1, 6.2_
  
  - [x] 7.3 Create LeadCard component
    - Create src/components/LeadCard.jsx
    - Display lead information (name, email, phone, description)
    - Format timestamp to relative time
    - Add styling for card layout
    - _Requirements: 1.4, 6.4_
  
  - [x] 7.4 Create date formatting utility
    - Create src/utils/dateFormatter.js
    - Implement relative time formatting using dayjs
    - Handle edge cases (just now, minutes ago, hours ago, etc.)
    - _Requirements: 6.4_

- [ ] 8. Implement Incoming Chats placeholder tab
  - [x] 8.1 Enhance IncomingChatsTab component
    - Update frontend/src/components/IncomingChatsTab.jsx
    - Display "Coming Soon" message with proper styling
    - Maintain consistent layout with NewLeadsTab
    - Add placeholder styling matching the design system
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 9. Request notification permissions on app load
  - [x] 9.1 Update App component to request permissions
    - Modify frontend/src/App.jsx
    - Request notification permissions on mount using useNotifications hook
    - Handle permission states gracefully
    - _Requirements: 2.5_

- [x] 10. Configuration and environment setup
  - [x] 10.1 Create frontend configuration
    - Create src/config.js to read environment variables
    - Set up API_URL and WS_URL configuration
    - Add .env.example with sample values
    - _Requirements: 5.1_
  
  - [x] 10.2 Update backend environment configuration
    - Add CORS_ORIGIN to .env
    - Update src/config/index.js if needed
    - Document new environment variables
    - _Requirements: 5.1_
  
  - [x] 10.3 Configure build tools
    - Set up Vite configuration (vite.config.js)
    - Configure proxy for development
    - Set up build output directory
    - _Requirements: 5.5_
