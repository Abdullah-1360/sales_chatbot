# cPanel Deployment Guide for Node.js Application

## Prerequisites

1. **cPanel with Node.js support** (version 14.x or higher)
2. **MongoDB Atlas account** (or MongoDB server)
3. **SSH access** to your cPanel account (recommended)
4. **WHMCS API credentials**

## Step-by-Step Deployment

### 1. Prepare Your cPanel Environment

#### A. Enable Node.js Application
1. Log in to your cPanel
2. Go to **"Setup Node.js App"** or **"Application Manager"**
3. Click **"Create Application"**
4. Configure:
   - **Node.js version**: 18.x or 20.x (latest LTS)
   - **Application mode**: Production
   - **Application root**: `sales_chatbot` (or your preferred folder)
   - **Application URL**: Your domain or subdomain
   - **Application startup file**: `app.js`
   - **Port**: Leave default (cPanel will assign)

### 2. Upload Your Project Files

#### Option A: Using File Manager
1. Go to **cPanel → File Manager**
2. Navigate to your application root folder
3. Upload all project files EXCEPT:
   - `node_modules/` (will be installed on server)
   - `.git/` (not needed in production)
   - `*.test.js` files (optional)

#### Option B: Using SSH/FTP
```bash
# Using SCP
scp -r * username@yourserver.com:~/sales_chatbot/

# Or using rsync
rsync -avz --exclude 'node_modules' --exclude '.git' ./ username@yourserver.com:~/sales_chatbot/
```

### 3. Configure Environment Variables

Create a `.env` file in your application root with:

```env
# Server Configuration
PORT=3000
HOST=127.0.0.1

# WHMCS API Configuration
WHMCS_URL=https://portal.hostbreak.com/includes/api.php
WHMCS_API_IDENTIFIER=your_api_identifier_here
WHMCS_API_SECRET=your_api_secret_here
WHMCS_CACHE_TTL=300

# MongoDB Configuration (Use MongoDB Atlas for cPanel)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sales_chatbot?retryWrites=true&w=majority
USE_MONGODB=true

# Sync Configuration
AUTO_SYNC_ON_STARTUP=true
SYNC_INTERVAL_HOURS=24

# Exchange Rate Configuration
FIXED_EXCHANGE_RATE=
AUTO_REFRESH_STALE_PRICING=false

# Legacy fixture mode
USE_FIXTURE=false
```

**Important**: Replace the MongoDB URI with your actual MongoDB Atlas connection string.

### 4. Install Dependencies

#### Using cPanel Node.js App Manager:
1. Go to **Setup Node.js App**
2. Click on your application
3. Scroll to **"Run NPM Install"** section
4. Click **"Run NPM Install"** button
5. Wait for installation to complete

#### Using SSH:
```bash
cd ~/sales_chatbot
npm install --production
```

### 5. Set Up .htaccess (If using subdomain/domain root)

The `.htaccess` file is already created. Make sure it's in your `public_html` or domain root:

```apache
# Disable directory browsing
Options -Indexes

# Redirect all requests to the Node.js app
RewriteEngine On
RewriteRule ^$ http://127.0.0.1:3000/ [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
```

**Note**: Replace `3000` with the port assigned by cPanel.

### 6. Start the Application

#### Using cPanel Node.js App Manager:
1. Go to **Setup Node.js App**
2. Find your application
3. Click **"Start App"** or **"Restart App"**
4. Check the status - it should show "Running"

#### Using SSH:
```bash
cd ~/sales_chatbot
node app.js
```

### 7. Verify Deployment

Test your endpoints:

```bash
# Health check
curl https://yourdomain.com/api/health

# Domain check
curl -X POST https://yourdomain.com/api/domain/check \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "phone_number": "+923001234567"}'

# Recommendation
curl -X POST https://yourdomain.com/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose": "Blog", "monthly_budget": 500}'
```

## Common Issues and Solutions

### Issue 1: "Cannot find module" errors

**Solution**: Make sure all dependencies are installed
```bash
cd ~/sales_chatbot
npm install --production
```

### Issue 2: MongoDB connection fails

**Solution**: 
1. Check your MongoDB Atlas IP whitelist (add `0.0.0.0/0` for testing)
2. Verify connection string in `.env`
3. Check MongoDB Atlas cluster is running

### Issue 3: Port already in use

**Solution**: 
1. cPanel assigns ports automatically
2. Check the assigned port in Node.js App Manager
3. Update `.htaccess` with the correct port

### Issue 4: Application keeps restarting

**Solution**:
1. Check application logs in cPanel
2. Look for errors in startup
3. Verify `.env` file exists and is readable
4. Check MongoDB connection

### Issue 5: 502 Bad Gateway

**Solution**:
1. Ensure Node.js app is running
2. Check `.htaccess` proxy settings
3. Verify port number matches
4. Check application logs

## Viewing Logs

### Using cPanel:
1. Go to **Setup Node.js App**
2. Click on your application
3. Scroll to **"Application Logs"**
4. View recent logs

### Using SSH:
```bash
# View application logs
tail -f ~/sales_chatbot/logs/app.log

# View cPanel Node.js logs
tail -f ~/logs/nodejs.log
```

## Maintenance Commands

### Restart Application
```bash
# Via cPanel: Click "Restart App" button

# Via SSH:
cd ~/nodemods/sales_chatbot
touch tmp/restart.txt
```

### Update Application
```bash
# Upload new files
# Then restart the application
cd ~/sales_chatbot
npm install --production
# Restart via cPanel or touch tmp/restart.txt
```

### Run Sync Manually
```bash
cd ~/sales_chatbot
node src/scripts/syncTldPricing.js
```

## Performance Optimization

### 1. Enable Production Mode
Make sure `NODE_ENV=production` in your environment

### 2. Use PM2 (if available)
```bash
npm install -g pm2
pm2 start app.js --name sales-chatbot
pm2 save
pm2 startup
```

### 3. Enable Compression
Already enabled in the code via `compression` middleware

### 4. Set Up Cron Jobs
Add to cPanel Cron Jobs:
```bash
# Sync TLD pricing daily at 2 AM
0 2 * * * cd ~/sales_chatbot && /usr/bin/node src/scripts/syncTldPricing.js
```

## Security Checklist

- [ ] `.env` file is not publicly accessible
- [ ] MongoDB connection uses authentication
- [ ] WHMCS API credentials are secure
- [ ] HTTPS is enabled on your domain
- [ ] Rate limiting is configured (if needed)
- [ ] CORS is properly configured
- [ ] Helmet.js is enabled (already in code)

## Monitoring

### Set Up Uptime Monitoring
Use services like:
- UptimeRobot
- Pingdom
- StatusCake

Monitor endpoint: `https://yourdomain.com/api/health`

## Backup Strategy

### Regular Backups
1. **Database**: MongoDB Atlas automatic backups
2. **Code**: Git repository
3. **Environment**: Backup `.env` file securely
4. **cPanel**: Use cPanel backup feature

## Support

If you encounter issues:
1. Check application logs
2. Verify all environment variables
3. Test MongoDB connection
4. Check WHMCS API connectivity
5. Review cPanel Node.js documentation

## Additional Resources

- [cPanel Node.js Documentation](https://docs.cpanel.net/knowledge-base/web-services/guide-to-nodejs/)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Express.js Production Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
