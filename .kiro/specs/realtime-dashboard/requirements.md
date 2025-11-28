# Requirements Document

## Introduction

This document specifies the requirements for a real-time dashboard frontend application that displays incoming chats and new leads. The dashboard will be built using React.js and will integrate with the existing backend API to display new leads in real-time with minimal delay. The system will use WebSocket connections for real-time updates and provide distinct visual and audio notifications for new leads.

## Glossary

- **Dashboard Application**: The React.js frontend web application that displays real-time data
- **Lead Management System**: The existing backend API that handles lead creation via VTiger CRM integration
- **WebSocket Server**: The real-time communication server that pushes lead updates to connected clients
- **Lead Entity**: A customer record containing firstname, lastname, email, phone, description, and timestamp
- **Notification System**: The browser-based alert mechanism that provides visual and audio feedback
- **Tab Component**: A UI element that allows switching between "Incoming Chats" and "New Leads" views

## Requirements

### Requirement 1

**User Story:** As a sales representative, I want to view new leads in real-time on a dashboard, so that I can respond to potential customers immediately

#### Acceptance Criteria

1. WHEN the Dashboard Application loads, THE Dashboard Application SHALL display two tab options labeled "Incoming Chats" and "New Leads"
2. WHEN a user clicks on the "New Leads" tab, THE Dashboard Application SHALL display a list of Lead Entities sorted by creation timestamp in descending order
3. WHEN a new Lead Entity is created in the Lead Management System, THE Dashboard Application SHALL receive the update within 2 seconds
4. THE Dashboard Application SHALL display each Lead Entity with firstname, lastname, email, phone, description, and formatted timestamp
5. WHEN a new Lead Entity arrives, THE Dashboard Application SHALL insert it at the top of the list

### Requirement 2

**User Story:** As a sales representative, I want to receive immediate notifications when new leads arrive, so that I don't miss any opportunities

#### Acceptance Criteria

1. WHEN a new Lead Entity is received by the Dashboard Application, THE Notification System SHALL display a visual notification with the lead's name and email
2. WHEN a new Lead Entity is received by the Dashboard Application, THE Notification System SHALL play a distinct audio notification sound
3. THE Notification System SHALL use a different audio sound for new leads than for incoming chats
4. WHEN multiple Lead Entities arrive within 5 seconds, THE Notification System SHALL display individual notifications for each lead
5. THE Dashboard Application SHALL request browser notification permissions on initial load

### Requirement 3

**User Story:** As a sales representative, I want the dashboard to maintain a persistent real-time connection, so that I receive updates without manual refreshing

#### Acceptance Criteria

1. WHEN the Dashboard Application initializes, THE WebSocket Server SHALL establish a bidirectional connection with the client
2. WHEN the WebSocket connection is lost, THE Dashboard Application SHALL attempt to reconnect every 3 seconds
3. WHEN the WebSocket connection is re-established, THE Dashboard Application SHALL synchronize missed Lead Entities from the server
4. THE Dashboard Application SHALL display the connection status (connected/disconnected) in the user interface
5. WHILE the WebSocket connection is disconnected, THE Dashboard Application SHALL display a warning indicator to the user

### Requirement 4

**User Story:** As a sales representative, I want the "Incoming Chats" tab to be present but empty, so that I know the feature will be available in the future

#### Acceptance Criteria

1. WHEN a user clicks on the "Incoming Chats" tab, THE Dashboard Application SHALL display an empty state message
2. THE Dashboard Application SHALL display the text "Coming Soon" or similar placeholder in the "Incoming Chats" tab
3. THE Dashboard Application SHALL maintain the same layout structure in the "Incoming Chats" tab as the "New Leads" tab
4. THE Dashboard Application SHALL NOT attempt to fetch or display any data in the "Incoming Chats" tab
5. THE Dashboard Application SHALL allow users to switch between tabs without errors

### Requirement 5

**User Story:** As a system administrator, I want the frontend to integrate seamlessly with the existing backend API, so that no backend modifications are required

#### Acceptance Criteria

1. THE Dashboard Application SHALL connect to the WebSocket Server using a configurable URL endpoint
2. THE Dashboard Application SHALL authenticate WebSocket connections if required by the backend
3. WHEN the Dashboard Application starts, THE Dashboard Application SHALL fetch the initial list of Lead Entities via HTTP GET request
4. THE Dashboard Application SHALL handle API errors gracefully and display user-friendly error messages
5. THE Dashboard Application SHALL be deployable in the existing frontend folder structure

### Requirement 6

**User Story:** As a sales representative, I want the dashboard to be visually appealing and easy to use, so that I can efficiently manage leads

#### Acceptance Criteria

1. THE Dashboard Application SHALL use a modern, responsive design that works on desktop screens
2. THE Dashboard Application SHALL display loading states while fetching initial data
3. THE Dashboard Application SHALL use distinct visual styling to differentiate between the two tabs
4. THE Dashboard Application SHALL display timestamps in a human-readable format (e.g., "2 minutes ago")
5. THE Dashboard Application SHALL provide smooth transitions when switching between tabs
