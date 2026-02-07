---
inclusion: always
---

# Deployment & Production Guidelines

## Deployment Environments

### Development
- Local machine with nodemon
- MongoDB: Local or cloud instance
- Hot reload enabled
- Debug logging enabled
- CORS: Allow localhost

### Production
- Linux/cPanel shared hosting
- MongoDB: Cloud (MongoDB Atlas)
- Process manager: PM2 or cPanel Node.js app
- Error logging only
- CORS: Specific domain only

## Pre-Deployment Checklist

### 1. Environment Configuration
```bash
# Verify all required environment variables
✓ WHMCS_URL
✓ WHMCS_API_IDENTIFIER
✓ WHMCS_API_SECRET
✓ MONGODB_URI
✓ WHM_API_KEY_* (for each server)
✓ CORS_ORIGIN (production domain)
✓ NODE_ENV=production
✓ LOG_LEVEL=ERROR or WARN
```

### 2. Security Hardening
```bash
# Enable security features
✓ WHM_VERIFY_SSL=true
✓ Helmet middleware enabled
✓ CORS restricted to production domain
✓ Rate limiting configured
✓ API keys rotated
✓ No sensitive data in logs
```

### 3. Performance Optimization
```bash
# Enable production optimizations
✓ Compression middleware enabled
✓ MongoDB indexes created
✓ Cache TTLs configured
✓ AUTO_SYNC_ON_STARTUP=false (for shared hosting)
✓ Connection pooling configured
```

### 4. Code Quality
```bash
# Run checks before deployment
npm run test              # Run test suite
npm run lint              # Check code style
node --check server.js    # Syntax check
```

## cPanel Deployment

### Backend Deployment

#### 1. Upload Files
```bash
# Via FTP/SFTP or cPanel File Manager
# Upload to: /home/username/sales_chatbot/
- src/
- node_modules/ (or install on server)
- package.json
- package-lock.json
- server.js
- .env (create on server, don't upload)
```

#### 2. Install Dependencies
```bash
# SSH into server
cd ~/sales_chatbot
npm install --production
```

#### 3. Configure Node.js App in cPanel
```
Application Root: sales_chatbot
Application URL: api.yourdomain.com or /api
Application Startup File: server.js
Node.js Version: 18.x or higher
Environment Variables: (add from .env)
```

#### 4. Configure .htaccess
```apache
# .htaccess in public_html or subdomain root
RewriteEngine On
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://localhost:4000/$1 [P,L]
```

### Frontend Deployment

#### 1. Build Frontend
```bash
cd frontend
npm run build
# Creates frontend/dist/ folder
```

#### 2. Upload to cPanel
```bash
# Upload dist/ contents to:
# - public_html/ (main domain)
# - public_html/subdomain/ (subdomain)
# - Or separate domain document root
```

#### 3. Configure .htaccess for SPA
```apache
# frontend/.htaccess.template
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

#### 4. Update API URL
```javascript
// frontend/.env.production
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

## Process Management

### Using PM2 (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name sales-chatbot

# Configure auto-restart
pm2 startup
pm2 save

# Monitor
pm2 status
pm2 logs sales-chatbot
pm2 monit

# Restart after changes
pm2 restart sales-chatbot

# Stop
pm2 stop sales-chatbot
```

### PM2 Ecosystem File
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'sales-chatbot',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};

// Start with: pm2 start ecosystem.config.js
```

### Using cPanel Node.js App Manager
```
1. Go to cPanel → Setup Node.js App
2. Create Application
3. Set environment variables
4. Click "Start Application"
5. Monitor via cPanel interface
```

## Database Setup

### MongoDB Atlas (Recommended)
```bash
# 1. Create cluster at mongodb.com
# 2. Create database user
# 3. Whitelist server IP (or 0.0.0.0/0 for any IP)
# 4. Get connection string
# 5. Add to .env:
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
```

### Initial Data Sync
```bash
# After deployment, sync data from WHMCS
npm run sync        # Sync products
npm run sync:tlds   # Sync TLD pricing
```

## SSL/TLS Configuration

### Let's Encrypt via cPanel
```
1. cPanel → SSL/TLS Status
2. Select domain
3. Click "Run AutoSSL"
4. Wait for certificate issuance
```

### Force HTTPS
```apache
# .htaccess
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

## Monitoring & Logging

### Application Logs
```bash
# Winston logs location
logs/error.log
logs/combined.log

# PM2 logs
pm2 logs sales-chatbot

# cPanel logs
~/logs/
```

### Health Check Endpoint
```javascript
// Already implemented at /api/health
GET /api/health

Response:
{
  status: 'ok',
  timestamp: '2024-01-01T00:00:00.000Z',
  uptime: 12345,
  mongodb: 'connected',
  whmcs: 'reachable'
}
```

### Monitoring Setup
```bash
# Set up cron job for health checks
*/5 * * * * curl -f https://api.yourdomain.com/api/health || echo "API Down"

# Or use external monitoring:
# - UptimeRobot
# - Pingdom
# - StatusCake
```

## Backup Strategy

### Database Backups
```bash
# MongoDB Atlas automatic backups (enabled by default)
# Or manual backup:
mongodump --uri="mongodb+srv://..." --out=./backup/$(date +%Y%m%d)
```

### Code Backups
```bash
# Git repository (recommended)
git push origin main

# Or manual backup
tar -czf backup-$(date +%Y%m%d).tar.gz \
  --exclude=node_modules \
  --exclude=frontend/node_modules \
  --exclude=frontend/dist \
  .
```

### Environment Variables Backup
```bash
# Store .env securely (encrypted)
# Never commit to git
# Keep in password manager or secure vault
```

## Rollback Procedure

### Quick Rollback
```bash
# 1. Stop current version
pm2 stop sales-chatbot

# 2. Restore previous version
cd ~/sales_chatbot
git checkout previous-tag
npm install --production

# 3. Restart
pm2 restart sales-chatbot
```

### Database Rollback
```bash
# Restore from MongoDB Atlas backup
# Or restore from mongodump:
mongorestore --uri="mongodb+srv://..." ./backup/20240101
```

## Performance Tuning

### Node.js Memory Limits
```bash
# Increase memory for large operations
node --max-old-space-size=2048 server.js

# Or in PM2:
pm2 start server.js --node-args="--max-old-space-size=2048"
```

### MongoDB Optimization
```javascript
// Ensure indexes are created
// Run in MongoDB shell or via script
db.chats.createIndex({ createdAt: -1 });
db.leads.createIndex({ phone: 1 });
db.chatnotifications.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });
```

### Caching Configuration
```bash
# Adjust cache TTLs for production
WHMCS_CACHE_TTL=600              # 10 minutes
SERVER_CACHE_TTL_MINUTES=60      # 1 hour
SERVER_FORCE_REFRESH_HOURS=24    # 24 hours
```

## Troubleshooting Production Issues

### Application Won't Start
```bash
# Check logs
pm2 logs sales-chatbot --lines 100

# Check port availability
netstat -tulpn | grep 4000

# Check environment variables
pm2 env 0

# Verify Node.js version
node --version  # Should be 18.x or higher
```

### High Memory Usage
```bash
# Monitor memory
pm2 monit

# Check for memory leaks
node --inspect server.js
# Connect Chrome DevTools

# Restart periodically if needed
pm2 restart sales-chatbot --cron "0 3 * * *"  # Daily at 3 AM
```

### Database Connection Issues
```bash
# Test MongoDB connection
node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('OK'))"

# Check IP whitelist in MongoDB Atlas
# Verify credentials
# Check network connectivity
```

### WHMCS API Errors
```bash
# Verify API credentials
# Check WHMCS API logs
# Test with curl:
curl -X POST https://portal.hostbreak.com/includes/api.php \
  -d "action=GetInvoice&invoiceid=1&identifier=XXX&secret=XXX&responsetype=json"
```

## Security Maintenance

### Regular Updates
```bash
# Update dependencies monthly
npm outdated
npm update

# Check for security vulnerabilities
npm audit
npm audit fix
```

### API Key Rotation
```bash
# Rotate every 90 days:
# 1. Generate new keys in WHMCS/WHM
# 2. Update .env
# 3. Restart application
# 4. Verify functionality
# 5. Revoke old keys
```

### Access Control
```bash
# Review and update:
# - MongoDB user permissions
# - WHM API key permissions
# - WHMCS API role permissions
# - Server firewall rules
```

## Disaster Recovery

### Complete System Failure
```bash
# 1. Provision new server
# 2. Install Node.js and dependencies
# 3. Restore code from git
# 4. Restore .env from secure backup
# 5. Restore MongoDB from backup
# 6. Update DNS if needed
# 7. Test all integrations
# 8. Monitor for 24 hours
```

### Data Corruption
```bash
# 1. Stop application
# 2. Restore database from last known good backup
# 3. Verify data integrity
# 4. Restart application
# 5. Re-sync from WHMCS if needed
```
