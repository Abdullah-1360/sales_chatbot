# cPanel Deployment Checklist

## Pre-Deployment

- [ ] MongoDB Atlas cluster is created and running
- [ ] MongoDB connection string is ready
- [ ] WHMCS API credentials are available
- [ ] cPanel account has Node.js support enabled
- [ ] Domain/subdomain is configured in cPanel

## Files to Upload

- [ ] All source files (`src/` folder)
- [ ] `package.json`
- [ ] `app.js` (cPanel entry point)
- [ ] `server.js`
- [ ] `.env` file (create on server)
- [ ] `.htaccess` file
- [ ] `README.md` (optional)

## Files NOT to Upload

- [ ] `node_modules/` (install on server)
- [ ] `.git/` (not needed)
- [ ] `*.test.js` (optional, can exclude)
- [ ] `.env.example` (reference only)

## Configuration Steps

- [ ] Create Node.js application in cPanel
- [ ] Set Node.js version (18.x or 20.x)
- [ ] Set application startup file to `app.js`
- [ ] Create `.env` file with correct values
- [ ] Update MongoDB URI in `.env`
- [ ] Update WHMCS credentials in `.env`
- [ ] Run `npm install` via cPanel or SSH
- [ ] Update `.htaccess` with correct port (if needed)

## Testing

- [ ] Start the application in cPanel
- [ ] Check application status (should be "Running")
- [ ] Test health endpoint: `/api/health`
- [ ] Test domain check: `/api/domain/check`
- [ ] Test recommendations: `/api/recommendations`
- [ ] Verify MongoDB connection (check logs)
- [ ] Verify WHMCS API connection (check logs)

## Post-Deployment

- [ ] Set up cron job for TLD sync (optional)
- [ ] Configure uptime monitoring
- [ ] Enable HTTPS/SSL
- [ ] Test all API endpoints
- [ ] Monitor application logs for errors
- [ ] Document the deployment date and version

## Troubleshooting

If application doesn't start:
1. Check application logs in cPanel
2. Verify `.env` file exists and has correct values
3. Check MongoDB connection string
4. Ensure all dependencies are installed
5. Verify Node.js version compatibility

## Quick Commands

```bash
# SSH into server
ssh username@yourserver.com

# Navigate to app directory
cd ~/sales_chatbot

# Install dependencies
npm install --production

# Test the application
node app.js

# View logs
tail -f logs/*.log

# Restart application (via cPanel or)
touch tmp/restart.txt
```

## Emergency Rollback

If deployment fails:
1. Stop the application in cPanel
2. Restore previous version from backup
3. Restart the application
4. Investigate issues in logs
5. Fix and redeploy

## Success Criteria

✅ Application status shows "Running" in cPanel  
✅ Health endpoint returns `{"status": "ok"}`  
✅ Domain check returns pricing data  
✅ MongoDB connection is successful  
✅ WHMCS API calls are working  
✅ No errors in application logs  
✅ All API endpoints respond correctly  

## Notes

- Default port is usually assigned by cPanel (check Node.js App Manager)
- MongoDB Atlas requires IP whitelist (add `0.0.0.0/0` for all IPs)
- WHMCS API calls may be slow on first request (caching helps)
- TLD sync runs on startup if `AUTO_SYNC_ON_STARTUP=true`
