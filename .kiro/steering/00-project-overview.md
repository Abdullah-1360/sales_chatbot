---
inclusion: always
---

# Project Overview: Sales Chatbot & WHMCS Integration Platform

## Architecture
This is a **full-stack Node.js/Express + React** application that integrates with WHMCS (Web Host Manager Complete Solution) for hosting business automation.

### Tech Stack
**Backend:**
- Node.js with Express 5.x
- MongoDB (Mongoose) for data persistence
- Socket.IO for real-time WebSocket communication
- MySQL2 for direct database queries
- SSH2 for server management
- Agenda for job scheduling
- Winston for logging

**Frontend:**
- React 19.x with Vite
- Socket.IO client for real-time updates
- Axios for API calls
- Day.js for date formatting

### Core Domains
1. **Sales & Lead Management** - Chat notifications, lead tracking, VTiger CRM integration
2. **Billing & Invoicing** - WHMCS invoice management, payment tracking
3. **Hosting Services** - cPanel/WHM integration, WordPress diagnostics, server management
4. **Security** - cPHulk management, CSF firewall, password resets
5. **DNS & Domains** - Domain lookups, DNS resolution, TLD pricing

## Project Structure
```
/src
  /config       - Configuration and constants
  /controllers  - Request handlers (thin layer)
  /services     - Business logic (thick layer)
  /models       - MongoDB schemas
  /routes       - API route definitions
  /middleware   - Express middleware
  /utils        - Helper functions
  /lib          - External service wrappers (cPanel, MySQL)
  /steps        - WordPress diagnostic/repair steps
  /scripts      - CLI utilities and data sync
  /test         - Test files and documentation

/frontend
  /src
    /components - React UI components
    /hooks      - Custom React hooks
    /services   - API and WebSocket clients
    /styles     - Component-specific CSS
    /utils      - Frontend utilities
```

## Key Integration Points
- **WHMCS API**: Primary billing/hosting management system
- **WHM API**: Server-level cPanel management
- **VTiger CRM**: Optional lead management
- **MongoDB**: Primary database for caching and app data
- **MySQL**: Direct WHMCS database queries (read-only recommended)

## Environment
- Production: Linux/cPanel shared hosting
- Development: Local with nodemon
- Module System: CommonJS (backend), ES Modules (frontend)
