# Combined Leads Endpoint Implementation

## Overview
Successfully combined the functionality of `api/checkUserExists` and `api/leads` into a single `api/leads` endpoint.

## What was implemented:

### 1. New Combined Controller (`src/controllers/leadsController.js`)
- **Parallel WHMCS Check**: Checks user existence by email AND phone simultaneously using `Promise.all()`
- **Conditional Lead Creation**: Only creates VTiger lead if user doesn't exist in WHMCS
- **Preserved Original Logic**: Maintains all existing functionality from both endpoints

### 2. Updated Routes
- **API Routes** (`src/routes/apiRoutes.js`): Added new combined endpoint
- **Main Routes** (`src/routes/index.js`): Updated POST /leads to use new controller
- **Deprecated**: Commented out old `checkUserExists` endpoint

### 3. Endpoint Behavior
**POST /api/leads**
- **Input**: `{ username, email, phone, description, comment, User_Ns }`
- **Process**:
  1. Validates required fields (email or phone needed)
  2. Checks WHMCS for user existence (parallel email/phone lookup)
  3. If user exists: Returns `{ userExists: true, leadCreated: false }`
  4. If user doesn't exist: Creates VTiger lead and returns `{ userExists: false, leadCreated: true }`

### 4. Response Format
```json
{
  "success": true,
  "userExists": boolean,
  "leadCreated": boolean,
  "foundBy": "email|phone", // if user exists
  "message": "descriptive message",
  "vtigerResponse": {} // if lead was created
}
```

## Key Features Preserved:
- ✅ Parallel email/phone checking in WHMCS
- ✅ VTiger lead creation with all original logic
- ✅ Database lead storage and WebSocket broadcasting
- ✅ Email generation from User_Ns when needed
- ✅ Lead update functionality for existing VTiger leads
- ✅ Error handling and logging

## Usage:
The endpoint now serves both purposes - checking user existence and creating leads when needed, eliminating the need for separate API calls.