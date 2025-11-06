# Quick Start Guide

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and update:
```env
MONGODB_URI=your_mongodb_connection_string
WHMCS_API_IDENTIFIER=your_identifier
WHMCS_API_SECRET=your_secret
```

### 3. Sync Data from WHMCS
```bash
npm run sync
```

### 4. Start Server
```bash
npm start
```

## Commands

```bash
# Development
npm run dev              # Start with nodemon

# Sync
npm run sync             # Sync all products from WHMCS
npm run sync:gid 20      # Sync specific GID

# Testing
npm test                 # Run all tests
node test-all-requirements.js  # Test all requirements

# Verification
node src/scripts/verifyMongoDB.js  # Verify MongoDB data
```

## API Usage

### Request
```bash
POST http://localhost:4000/api/recommendations
Content-Type: application/json

{
  "purpose": "Blog",
  "websites_count": "2-3",
  "tech_stack": "Linux",
  "cms": "WordPress",
  "email_needed": true,
  "storage_needed_gb": 12,
  "monthly_budget": 10,
  "free_domain": true,
  "migrate_from_existing_host": false,
  "email_deliverability_priority": false
}
```

### Response
```json
{
  "matches": [
    {
      "pid": "52",
      "gid": "20",
      "name": "WP Studio",
      "confidence": 95.5,
      "pricing": {
        "USD": {
          "monthly": 3.5
        }
      }
    }
  ]
}
```

## Troubleshooting

### Sync Not Working
```bash
# Check WHMCS connection
curl "https://portal.hostbreak.com/includes/api.php?action=GetProducts&gid=20&responsetype=json&identifier=YOUR_ID&secret=YOUR_SECRET"

# Re-sync manually
npm run sync
```

### No Products Returned
```bash
# Verify MongoDB data
node src/scripts/verifyMongoDB.js

# Check if sync completed
npm run sync
```

### Server Won't Start
```bash
# Check MongoDB connection
# Verify .env file exists
# Check logs for errors
```

## Documentation

- `WHMCS_SYNC_DOCUMENTATION.md` - Complete sync documentation
- `FINAL_REQUIREMENTS_DOCUMENTATION.md` - Requirements & logic
- `RECOMMENDATION_SYSTEM_EXPLAINED.md` - How recommendations work
- `WHMCS_INTEGRATION_COMPLETE.md` - Integration summary

## Status

✅ WHMCS API integrated
✅ MongoDB synced (30 products)
✅ Auto-sync enabled
✅ All tests passing
✅ Production ready
