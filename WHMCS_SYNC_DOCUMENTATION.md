# WHMCS → MongoDB Sync Documentation

## Overview
The system now fetches product data directly from WHMCS API and syncs it to MongoDB, from where the frontend retrieves recommendations.

## Architecture

```
WHMCS API (portal.hostbreak.com)
         ↓
    Sync Service
         ↓
    MongoDB Database
         ↓
  Recommendation API
         ↓
     Frontend
```

## Configuration

### Environment Variables (.env)

```env
# WHMCS API Configuration
WHMCS_URL=https://portal.hostbreak.com/includes/api.php
WHMCS_API_IDENTIFIER=asjw4DxLW5PU7GRkljFd1TGT2tTW2LR2
WHMCS_API_SECRET=dP3hHZvMYCsVJ6Nsg9rMaEBAQ13TDbWo

# MongoDB Configuration
MONGODB_URI=mongodb+srv://your-connection-string
USE_MONGODB=true

# Sync Configuration
AUTO_SYNC_ON_STARTUP=true    # Sync when server starts
SYNC_INTERVAL_HOURS=24       # Auto-sync every 24 hours
```

## Sync Methods

### 1. Automatic Sync on Startup

When the server starts, it automatically fetches fresh data from WHMCS:

```bash
npm start
```

Output:
```
✅ MongoDB connected successfully
🔄 Auto-sync enabled, fetching products from WHMCS...
📡 Fetching products from WHMCS for GID 1...
✅ Fetched 7 products for GID 1
...
✅ Initial sync completed: 30 products loaded
🚀 API running on :4000
```

### 2. Manual Sync (All GIDs)

Sync all product groups manually:

```bash
npm run sync
```

### 3. Manual Sync (Specific GID)

Sync only one product group:

```bash
npm run sync:gid 20    # Sync only WordPress hosting (GID 20)
npm run sync:gid 21    # Sync only WooCommerce hosting (GID 21)
npm run sync:gid 28    # Sync only Windows hosting (GID 28)
```

### 4. Scheduled Automatic Sync

The system automatically syncs every 24 hours (configurable):

```env
SYNC_INTERVAL_HOURS=24    # Sync every 24 hours
SYNC_INTERVAL_HOURS=12    # Sync every 12 hours
SYNC_INTERVAL_HOURS=0     # Disable automatic sync
```

## WHMCS API Integration

### API Endpoint
```
https://portal.hostbreak.com/includes/api.php
```

### Authentication
- **Method**: API Identifier & Secret
- **Identifier**: `asjw4DxLW5PU7GRkljFd1TGT2tTW2LR2`
- **Secret**: `dP3hHZvMYCsVJ6Nsg9rMaEBAQ13TDbWo`

### API Call Example
```
GET https://portal.hostbreak.com/includes/api.php?
    action=GetProducts&
    gid=21&
    responsetype=json&
    identifier=asjw4DxLW5PU7GRkljFd1TGT2tTW2LR2&
    secret=dP3hHZvMYCsVJ6Nsg9rMaEBAQ13TDbWo
```

### Product Groups (GIDs)
- **GID 1**: cPanel Hosting, Linux hosting, Web hosting
- **GID 20**: WordPress Hosting
- **GID 21**: WooCommerce Hosting, Ecommerce hosting
- **GID 25**: Business Hosting
- **GID 28**: Windows Hosting, ASP Hosting, .NET hosting

## Data Transformation

### WHMCS Format → MongoDB Format

```javascript
// WHMCS Response
{
  "pid": "24",
  "gid": "20",
  "name": "WP Mid",
  "description": "2-3 WP sites, 12 GB.",
  "diskspace": "12",
  "freedomain": true,
  "pricing": {
    "USD": {
      "monthly": "5.50",
      "quarterly": "16.50",
      "annually": "66.00"
    }
  }
}

// Transformed for MongoDB
{
  "pid": "24",
  "gid": "20",
  "name": "WP Mid",
  "description": "2-3 WP sites, 12 GB.",
  "diskspace": "12",
  "freedomain": true,
  "pricing": {
    "USD": {
      "monthly": 5.50,
      "quarterly": 16.50,
      "yearly": 66.00
    }
  },
  "link": "https://portal.hostbreak.com/order/20/24"
}
```

## Sync Process Flow

```
1. Connect to MongoDB
   ↓
2. For each GID (1, 20, 21, 25, 28):
   - Fetch products from WHMCS API
   - Transform data format
   - Add to collection
   ↓
3. Delete existing products in MongoDB
   ↓
4. Insert all fetched products
   ↓
5. Display summary by GID
   ↓
6. Complete
```

## Current Sync Results

```
📊 Products by GID:
   GID 1: 7 products   (cPanel Hosting)
   GID 20: 4 products  (WordPress Hosting)
   GID 21: 3 products  (WooCommerce Hosting)
   GID 25: 12 products (Business Hosting)
   GID 28: 4 products  (Windows Hosting)

Total: 30 products
```

## Error Handling

### WHMCS API Errors
- If WHMCS API fails, the sync logs the error but continues
- Server starts even if sync fails (uses existing MongoDB data)
- Warning displayed: "Server will start but may have stale data"

### MongoDB Errors
- Connection errors prevent server startup
- Sync errors are logged but don't crash the server

## Monitoring

### Sync Logs
```
✅ Fetched 7 products for GID 1
✅ Fetched 4 products for GID 20
🗑️  Deleted 38 existing products
✅ Inserted 30 products
✅ Sync completed successfully!
```

### Scheduled Sync Logs
```
⏰ Scheduled automatic sync every 24 hours
⏰ Running scheduled sync...
```

## Frontend Integration

The frontend retrieves data from the recommendation API, which reads from MongoDB:

```
Frontend Request
    ↓
POST /api/recommendations
    ↓
Recommendation Controller
    ↓
MongoDB Query (getProductsByGid)
    ↓
Confidence Scoring
    ↓
Return Top 3 Plans
    ↓
Frontend Display
```

## Advantages

### ✅ Real-time Data
- Always fetches latest products from WHMCS
- No manual data entry needed
- Automatic updates every 24 hours

### ✅ Performance
- MongoDB provides fast queries
- Indexed by GID for efficiency
- Cached in-memory for repeated requests

### ✅ Reliability
- Fallback to existing data if sync fails
- Graceful error handling
- Automatic retry on schedule

### ✅ Flexibility
- Manual sync on demand
- Configurable sync intervals
- Can sync specific GIDs

## Troubleshooting

### Sync Not Working

1. **Check WHMCS credentials**:
```bash
# Test WHMCS API directly
curl "https://portal.hostbreak.com/includes/api.php?action=GetProducts&gid=20&responsetype=json&identifier=YOUR_ID&secret=YOUR_SECRET"
```

2. **Check MongoDB connection**:
```bash
# Verify MongoDB URI in .env
MONGODB_URI=mongodb+srv://...
```

3. **Check logs**:
```bash
npm run sync
# Look for error messages
```

### No Products Returned

1. **Verify sync completed**:
```bash
node src/scripts/verifyMongoDB.js
```

2. **Check GID mapping**:
```bash
# Ensure correct GID is being queried
```

3. **Re-sync manually**:
```bash
npm run sync
```

## Commands Reference

```bash
# Start server (auto-sync on startup)
npm start

# Manual sync all GIDs
npm run sync

# Manual sync specific GID
npm run sync:gid 20

# Verify MongoDB data
node src/scripts/verifyMongoDB.js

# Test API
node test-all-requirements.js
```

## Security Notes

⚠️ **Important**: Keep WHMCS credentials secure!

- Never commit `.env` file to git
- Use environment variables in production
- Rotate API credentials periodically
- Monitor API usage

## Next Steps

1. ✅ WHMCS API integration complete
2. ✅ MongoDB sync working
3. ✅ Auto-sync on startup enabled
4. ✅ Scheduled sync configured
5. ✅ Manual sync available
6. ✅ Frontend can retrieve data

**Status**: Production Ready ✅
