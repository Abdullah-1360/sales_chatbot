---
inclusion: always
---

# Troubleshooting Guide - Common Issues & Solutions

## Quick Diagnostic Commands

### System Health Check
```bash
# Check application status
curl http://localhost:4000/api/health

# Check Node.js version
node --version  # Should be 18.x or higher

# Check MongoDB connection
node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('✓ MongoDB OK')).catch(e => console.error('✗ MongoDB Error:', e.message))"

# Check WHMCS API
curl -X POST https://portal.hostbreak.com/includes/api.php \
  -d "action=GetInvoice&invoiceid=1&identifier=${WHMCS_API_IDENTIFIER}&secret=${WHMCS_API_SECRET}&responsetype=json"

# Check process
ps aux | grep node
```

## Common Issues by Category

### 1. Application Won't Start

#### Symptom: Port already in use
```bash
Error: listen EADDRINUSE: address already in use :::4000
```

**Solution:**
```bash
# Find process using port
lsof -i :4000
# or
netstat -tulpn | grep 4000

# Kill the process
kill -9 <PID>

# Or change port in .env
PORT=4001
```

#### Symptom: Module not found
```bash
Error: Cannot find module 'express'
```

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Or install specific module
npm install express
```

#### Symptom: Environment variables not loaded
```bash
Error: Missing WHMCS configuration
```

**Solution:**
```bash
# Verify .env file exists
ls -la .env

# Check .env is loaded
node -e "require('dotenv').config(); console.log(process.env.WHMCS_URL)"

# Ensure .env is in project root
# Restart application after .env changes
```

### 2. WHMCS API Issues

#### Symptom: Authentication failed
```bash
Error: Invalid API credentials
```

**Solution:**
```bash
# Verify credentials in .env
echo $WHMCS_API_IDENTIFIER
echo $WHMCS_API_SECRET

# Test credentials directly
curl -X POST https://portal.hostbreak.com/includes/api.php \
  -d "action=GetInvoice&invoiceid=1&identifier=XXX&secret=XXX&responsetype=json"

# Check WHMCS API role permissions
# Regenerate API credentials if needed
```

#### Symptom: Empty results from client search
```bash
Result: { clients: { client: [] } }
```

**Solution:**
```javascript
// Phone number must be normalized
const { normalizePhone } = require('./utils/phoneNormalizer');
const normalized = normalizePhone('+92 300 1234567');
console.log('Searching for:', normalized); // Should be: 923001234567

// Test in WHMCS admin panel first
// Verify client exists with that phone number
```

#### Symptom: Rate limit exceeded
```bash
Error: Too many requests
```

**Solution:**
```javascript
// Implement caching
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 });

// Check cache before API call
const cached = cache.get(cacheKey);
if (cached) return cached;

// Implement exponential backoff
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await delay(1000 * attempt);
```

### 3. WHM/cPanel Issues

#### Symptom: WHM API authentication fails
```bash
Error: Authentication failed for server CP1
```

**Solution:**
```bash
# Check API key exists
echo $WHM_API_KEY_CP1

# Verify server name matches
# Server name is case-sensitive: CP1, not cp1

# Test API key in WHM directly
# WHM → Development → Manage API Tokens

# Regenerate API token if needed
```

#### Symptom: SSL verification fails
```bash
Error: unable to verify the first certificate
```

**Solution:**
```bash
# For development/testing only
WHM_VERIFY_SSL=false

# For production, fix SSL certificate
# Or add CA certificate to Node.js
NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.crt
```

#### Symptom: cPanel credentials not found
```bash
Error: Could not resolve cPanel credentials for domain
```

**Solution:**
```javascript
// Verify client has hosting service
const products = await getClientsProducts(clientId);
console.log('Products:', products);

// Check domain is in WHMCS
const domains = await getClientsDomains(clientId);
console.log('Domains:', domains);

// Verify custom fields contain cPanel credentials
// Check WHMCS product configuration
```

### 4. MongoDB Issues

#### Symptom: Connection timeout
```bash
Error: MongoServerSelectionError: connection timed out
```

**Solution:**
```bash
# Check MongoDB URI format
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# Verify IP whitelist in MongoDB Atlas
# Add 0.0.0.0/0 for testing (not recommended for production)

# Test connection
mongosh "mongodb+srv://user:pass@cluster.mongodb.net/dbname"

# Check network connectivity
ping cluster.mongodb.net
```

#### Symptom: Authentication failed
```bash
Error: Authentication failed
```

**Solution:**
```bash
# Verify username and password
# Check special characters are URL-encoded
# Example: p@ssw0rd becomes p%40ssw0rd

# Verify database user exists in Atlas
# Check user has correct permissions

# Test with mongo shell
mongosh "mongodb+srv://user:pass@cluster.mongodb.net/dbname"
```

#### Symptom: Slow queries
```bash
Warning: Query took 2500ms
```

**Solution:**
```javascript
// Add indexes
db.chats.createIndex({ createdAt: -1 });
db.leads.createIndex({ phone: 1 });
db.chatnotifications.createIndex({ read: 1, createdAt: -1 });

// Use lean queries
const results = await Chat.find({ userId }).lean();

// Limit results
const results = await Chat.find({ userId }).limit(100);

// Use projection
const results = await Chat.find({ userId }, 'chatId message createdAt');
```

### 5. WebSocket Issues

#### Symptom: Connection fails
```bash
Error: WebSocket connection failed
```

**Solution:**
```javascript
// Backend - Check CORS
const io = socketIO(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true
  }
});

// Frontend - Check URL
const socket = io('http://localhost:4000', {
  transports: ['websocket', 'polling']
});

// Check firewall allows WebSocket
// Verify port is accessible
```

#### Symptom: Events not received
```bash
// No error, but events don't trigger
```

**Solution:**
```javascript
// Verify event names match exactly (case-sensitive)
// Backend
io.emit('new-chat', data);

// Frontend
socket.on('new-chat', callback); // Must match exactly

// Check socket is connected
console.log('Connected:', socket.connected);

// Verify listeners are registered before events fire
```

#### Symptom: Memory leak from socket listeners
```bash
Warning: Possible EventEmitter memory leak detected
```

**Solution:**
```javascript
// Always cleanup in useEffect
useEffect(() => {
  socket.on('event', handler);
  
  return () => {
    socket.off('event', handler);
  };
}, []);

// Remove all listeners on unmount
useEffect(() => {
  return () => {
    socket.removeAllListeners();
  };
}, []);
```

### 6. Frontend Issues

#### Symptom: API calls fail with CORS error
```bash
Access to fetch blocked by CORS policy
```

**Solution:**
```bash
# Backend - Update CORS_ORIGIN
CORS_ORIGIN=https://yourdomain.com

# Or allow multiple origins
CORS_ORIGIN=https://domain1.com,https://domain2.com

# Frontend - Verify API URL
VITE_API_URL=https://api.yourdomain.com

# Check credentials are included
fetch(url, { credentials: 'include' })
```

#### Symptom: Build fails
```bash
Error: Build failed with errors
```

**Solution:**
```bash
# Clear cache and rebuild
rm -rf frontend/node_modules frontend/dist
cd frontend
npm install
npm run build

# Check for syntax errors
npm run lint

# Verify all imports are correct
# Check for missing dependencies
```

#### Symptom: White screen after deployment
```bash
// No errors in console, just blank page
```

**Solution:**
```bash
# Check .htaccess for SPA routing
# Should have:
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

# Verify base URL in vite.config.js
base: '/subdirectory/' // if deployed to subdirectory

# Check browser console for errors
# Verify all assets loaded correctly
```

### 7. Performance Issues

#### Symptom: Slow API responses
```bash
Response time: 3000ms (expected < 500ms)
```

**Solution:**
```javascript
// Implement caching
const cache = new NodeCache({ stdTTL: 300 });

// Use MongoDB indexes
db.collection.createIndex({ field: 1 });

// Optimize queries
const results = await Model.find().lean().limit(100);

// Use pagination
const results = await Model.find()
  .skip((page - 1) * limit)
  .limit(limit);

// Profile slow operations
const start = Date.now();
await operation();
console.log('Duration:', Date.now() - start);
```

#### Symptom: High memory usage
```bash
Memory usage: 1.5GB (expected < 500MB)
```

**Solution:**
```bash
# Monitor memory
node --inspect server.js
# Open chrome://inspect

# Increase memory limit if needed
node --max-old-space-size=2048 server.js

# Check for memory leaks
# - Unclosed database connections
# - Event listeners not removed
# - Large objects in memory
# - Circular references

# Restart periodically
pm2 restart app --cron "0 3 * * *"
```

### 8. Deployment Issues

#### Symptom: Application crashes on shared hosting
```bash
Error: WebAssembly memory allocation failed
```

**Solution:**
```bash
# Disable auto-sync on startup
AUTO_SYNC_ON_STARTUP=false

# Run sync manually or via cron
node src/scripts/syncFromWHMCS.js

# Reduce memory usage
# - Disable debug logging
# - Implement pagination
# - Clear caches regularly
```

#### Symptom: PM2 won't start
```bash
Error: PM2 not found
```

**Solution:**
```bash
# Install PM2 globally
npm install -g pm2

# Or use npx
npx pm2 start server.js

# Check PM2 status
pm2 status

# View logs
pm2 logs
```

#### Symptom: Environment variables not loaded in production
```bash
Error: Missing configuration
```

**Solution:**
```bash
# Verify .env exists in production
ls -la .env

# Check PM2 loads .env
pm2 start ecosystem.config.js

# Or set in PM2 directly
pm2 start server.js --env production

# Verify variables
pm2 env 0
```

## Debugging Workflow

### Step 1: Identify the Issue
```bash
# Check logs
pm2 logs
tail -f logs/error.log

# Check health endpoint
curl http://localhost:4000/api/health

# Check process status
pm2 status
ps aux | grep node
```

### Step 2: Isolate the Problem
```bash
# Test individual components
node src/test/test-whmcs-integration.js
node src/test/test-mongodb-connection.js

# Enable debug logging
LOG_LEVEL=DEBUG

# Test in isolation
node -e "require('./src/services/whmcsService').getClients({search:'test'})"
```

### Step 3: Fix and Verify
```bash
# Apply fix
# Test locally
npm test

# Deploy to staging
# Test in staging environment

# Deploy to production
# Monitor for issues
pm2 logs --lines 100
```

## Emergency Contacts & Resources

### When to Escalate
- Database corruption
- Security breach
- Complete system failure
- Data loss
- API credentials compromised

### Quick Recovery
```bash
# Stop application
pm2 stop all

# Restore from backup
git checkout last-known-good-commit
npm install --production

# Restore database
mongorestore --uri="..." ./backup/date

# Restart
pm2 restart all

# Verify
curl http://localhost:4000/api/health
```

## Prevention Checklist

- [ ] Regular backups (daily)
- [ ] Monitoring alerts configured
- [ ] Health checks running
- [ ] Logs reviewed weekly
- [ ] Dependencies updated monthly
- [ ] Security audit quarterly
- [ ] Disaster recovery tested
- [ ] Documentation up to date
