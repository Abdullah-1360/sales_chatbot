# MongoDB Migration Guide

## Overview
The application has been migrated from file-based fixture data to MongoDB for better scalability and data management.

## What Changed

### Before (File-based)
- Products stored in `src/_fixtures/whmcs-products.json`
- Data loaded from file on every request
- No ability to update products without code changes

### After (MongoDB)
- Products stored in MongoDB database
- Efficient querying with indexes
- Easy to update products via database
- Falls back to WHMCS API if MongoDB is unavailable

## Setup Instructions

### 1. Install MongoDB
If you don't have MongoDB installed:

**Ubuntu/Debian:**
```bash
sudo apt-get install mongodb
sudo systemctl start mongodb
```

**macOS:**
```bash
brew install mongodb-community
brew services start mongodb-community
```

**Docker:**
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 2. Configure Environment Variables
Add to your `.env` file:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/sales_chatbot
USE_MONGODB=true
```

### 3. Seed the Database
Run the seed script to migrate fixture data to MongoDB:

```bash
npm run seed
```

Expected output:
```
✅ MongoDB connected successfully
🌱 Starting product seeding...
🗑️  Deleted 0 existing products
✅ Inserted 15 products

📊 Products by GID:
   GID 1: 3 products
   GID 20: 3 products
   GID 21: 3 products
   GID 25: 3 products
   GID 28: 3 products

✅ Seeding completed successfully
```

### 4. Start the Server
```bash
npm start
```

The server will automatically connect to MongoDB on startup.

## New Files Created

### Database Configuration
- `src/config/database.js` - MongoDB connection management
- `src/models/Product.js` - Mongoose schema for products

### Scripts
- `src/scripts/seedProducts.js` - Seed script to migrate fixture data

### Updated Files
- `src/services/whmcs.js` - Now queries MongoDB instead of fixture file
- `src/config/index.js` - Added MongoDB configuration
- `server.js` - Connects to MongoDB on startup
- `package.json` - Added `seed` script

## Product Schema

```javascript
{
  pid: String,        // Product ID (unique)
  gid: String,        // Group ID (indexed)
  name: String,       // Product name
  description: String,
  diskspace: String,  // Storage in GB
  freedomain: Boolean,
  pricing: {
    USD: {
      monthly: Number,
      quarterly: Number,
      yearly: Number
    }
  },
  link: String
}
```

## Database Operations

### Query Products by GID
```javascript
const Product = require('./src/models/Product');

// Get all WordPress hosting plans (GID 20)
const wpPlans = await Product.find({ gid: '20' });
```

### Add New Product
```javascript
const newProduct = new Product({
  pid: '99',
  gid: '1',
  name: 'cPanel Premium',
  description: 'Premium hosting plan',
  diskspace: '100',
  freedomain: true,
  pricing: {
    USD: {
      monthly: 19.99,
      quarterly: 59.97,
      yearly: 239.88
    }
  },
  link: 'https://your-domain.com/order/1/99'
});

await newProduct.save();
```

### Update Product
```javascript
await Product.updateOne(
  { pid: '24' },
  { $set: { 'pricing.USD.monthly': 6.00 } }
);
```

### Delete Product
```javascript
await Product.deleteOne({ pid: '99' });
```

## Fallback Behavior

The system has built-in fallback mechanisms:

1. **MongoDB Unavailable**: Falls back to WHMCS API
2. **WHMCS API Fails**: Returns error (no longer uses fixture file)
3. **Disable MongoDB**: Set `USE_MONGODB=false` in `.env`

## Testing

All existing tests continue to work. The test environment uses the same MongoDB connection.

To test with MongoDB:
```bash
npm test
```

## Performance Benefits

### Before (File-based)
- File read on every request
- No caching at database level
- Linear search through all products

### After (MongoDB)
- Indexed queries by GID
- In-memory caching via NodeCache
- Sub-millisecond query times
- Scalable to thousands of products

## Monitoring

Check MongoDB connection status in server logs:
```
✅ MongoDB connected successfully
🚀 API running on :4000
📦 MongoDB: enabled
```

## Troubleshooting

### Connection Error
```
❌ MongoDB connection error: connect ECONNREFUSED
```
**Solution**: Ensure MongoDB is running
```bash
sudo systemctl status mongodb
# or
brew services list
```

### Seed Script Fails
```
❌ Seeding failed: MongoError
```
**Solution**: Check MongoDB URI in `.env` and ensure database is accessible

### No Products Returned
**Solution**: Run the seed script
```bash
npm run seed
```

## Migration Checklist

- [x] Install MongoDB
- [x] Configure `MONGODB_URI` in `.env`
- [x] Run `npm run seed` to migrate data
- [x] Test API endpoints
- [x] Verify products are returned with confidence scores
- [x] Remove or archive `src/_fixtures/whmcs-products.json` (optional)

## Rollback

To rollback to file-based fixtures:

1. Set in `.env`:
```env
USE_MONGODB=false
USE_FIXTURE=true
```

2. Restart
uction use.rodmended for ps not recome: This i

Notver ser