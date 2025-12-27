const Agenda = require('agenda');
const CphulkManager = require('./cphulkManager');

// Optimized logger for job scheduler - silent in production
const logger = (() => {
  const winston = require('winston');
  
  // Silent logger in production for maximum performance
  if (process.env.NODE_ENV === 'production') {
    return {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    };
  }
  
  // Minimal logging in development
  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.simple()
    ),
    transports: [
      new winston.transports.Console({
        silent: process.env.NODE_ENV === 'test'
      })
    ]
  });
})();

class JobScheduler {
  constructor() {
    this.agenda = null;
    this.isInitialized = false;
    this.cphulkManager = new CphulkManager();
    this.logger = logger;
  }

  /**
   * Initialize Agenda with MongoDB connection
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        return;
      }

      // Get MongoDB connection string from environment
      const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/sales_chatbot';
      
      this.logger.info(`Connecting to MongoDB: ${mongoUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
      
      // Initialize Agenda with MongoDB Cloud compatible options
      this.agenda = new Agenda({
        db: { 
          address: mongoUrl, 
          collection: 'agendaJobs',
          options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000, // 10 seconds timeout
            connectTimeoutMS: 10000, // 10 seconds connection timeout
            socketTimeoutMS: 45000, // 45 seconds socket timeout
            maxPoolSize: 5, // Maintain up to 5 socket connections
            minPoolSize: 1, // Maintain at least 1 socket connection
            maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
          }
        },
        processEvery: '30 seconds', // Check for jobs every 30 seconds
        maxConcurrency: 3, // Maximum concurrent jobs (reduced for cloud)
        defaultConcurrency: 1, // Default concurrency per job type
        defaultLockLifetime: 5 * 60 * 1000, // 5 minutes lock lifetime (reduced)
        defaultLockLimit: 0 // No limit on locks per job type
      });

      // Define job handlers
      this.defineJobHandlers();

      // Test connection before starting
      this.logger.info('Testing MongoDB connection...');
      
      // Start the agenda with timeout
      const startPromise = this.agenda.start();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Agenda start timeout after 15 seconds')), 15000)
      );
      
      await Promise.race([startPromise, timeoutPromise]);
      
      this.isInitialized = true;
      this.logger.info('Job scheduler initialized successfully with MongoDB Cloud');

      // Graceful shutdown handling
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.error('Failed to initialize job scheduler:', error);
      
      // Provide helpful error messages for common MongoDB Cloud issues
      if (error.message.includes('ECONNREFUSED')) {
        this.logger.error('MongoDB connection refused. Please check:');
        this.logger.error('1. MongoDB Cloud cluster is running');
        this.logger.error('2. Network access is configured (IP whitelist)');
        this.logger.error('3. Database user credentials are correct');
      } else if (error.message.includes('authentication failed')) {
        this.logger.error('MongoDB authentication failed. Please check username/password in MONGODB_URI');
      } else if (error.message.includes('timeout')) {
        this.logger.error('MongoDB connection timeout. This may be due to network issues or MongoDB Cloud being slow');
      }
      
      throw error;
    }
  }

  /**
   * Define all job handlers
   */
  defineJobHandlers() {
    // cPHulk IP removal job
    this.agenda.define('remove cphulk ip', async (job) => {
      const { ip, serverName, scheduledAt, reason } = job.attrs.data;
      
      try {
        this.logger.info(`Executing scheduled IP removal: ${ip} from server ${serverName}`);
        
        // Remove IP from whitelist
        const result = await this.cphulkManager.removeFromWhitelist(ip, serverName);
        
        if (result.success) {
          this.logger.info(`Successfully removed IP ${ip} from cPHulk whitelist on server ${serverName}`);
          
          // Log the completion for audit trail
          await this.logJobCompletion({
            jobType: 'cphulk_ip_removal',
            ip: ip,
            serverName: serverName,
            scheduledAt: scheduledAt,
            executedAt: new Date().toISOString(),
            status: 'completed',
            reason: reason || 'Scheduled 24-hour removal'
          });
          
        } else {
          this.logger.error(`Failed to remove IP ${ip} from cPHulk whitelist:`, result.error);
          
          // Log the failure
          await this.logJobCompletion({
            jobType: 'cphulk_ip_removal',
            ip: ip,
            serverName: serverName,
            scheduledAt: scheduledAt,
            executedAt: new Date().toISOString(),
            status: 'failed',
            error: result.error,
            reason: reason || 'Scheduled 24-hour removal'
          });
          
          throw new Error(`IP removal failed: ${result.error}`);
        }
        
      } catch (error) {
        this.logger.error(`Job execution failed for IP ${ip}:`, error);
        throw error;
      }
    });

    // Job cleanup - remove completed jobs older than 7 days
    this.agenda.define('cleanup old jobs', async (job) => {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const result = await this.agenda.cancel({
          lastFinishedAt: { $lt: sevenDaysAgo },
          $or: [
            { lastRunAt: { $exists: true } },
            { failedAt: { $exists: true } }
          ]
        });
        
        this.logger.info(`Cleaned up ${result} old completed jobs`);
        
      } catch (error) {
        this.logger.error('Job cleanup failed:', error);
        throw error;
      }
    });

    this.logger.info('Job handlers defined successfully');
  }

  /**
   * Schedule IP removal after specified hours
   * @param {string} ip - IP address to remove
   * @param {string} serverName - Server name
   * @param {number} hours - Hours until removal
   * @param {string} reason - Reason for removal
   * @returns {Promise<Object>} Scheduling result
   */
  async scheduleIPRemoval(ip, serverName, hours, reason = 'Scheduled removal') {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Check for existing scheduled jobs for this IP/server combination
      const existingJobs = await this.agenda.jobs({
        name: 'remove cphulk ip',
        'data.ip': ip,
        'data.serverName': serverName,
        $or: [
          { nextRunAt: { $gt: new Date() } }, // Future jobs
          { lockedAt: { $exists: true } } // Currently running jobs
        ]
      });

      // Cancel existing jobs to prevent duplicates
      if (existingJobs.length > 0) {
        this.logger.info(`Found ${existingJobs.length} existing jobs for IP ${ip}, cancelling them first`);
        await this.cancelIPRemoval(ip, serverName);
      }

      const scheduledTime = new Date(Date.now() + (hours * 60 * 60 * 1000));
      const jobData = {
        ip: ip,
        serverName: serverName,
        scheduledAt: new Date().toISOString(),
        reason: reason
      };

      // Schedule the new job
      const job = await this.agenda.schedule(scheduledTime, 'remove cphulk ip', jobData);
      
      // Save the job
      await job.save();
      
      this.logger.info(`Scheduled IP ${ip} removal from server ${serverName} at ${scheduledTime.toISOString()}`);
      
      return {
        success: true,
        ip: ip,
        serverName: serverName,
        scheduledFor: scheduledTime.toISOString(),
        hoursUntilRemoval: hours,
        jobId: job.attrs._id?.toString() || 'unknown',
        reason: reason
      };

    } catch (error) {
      this.logger.error(`Error scheduling IP removal for ${ip}:`, error);
      throw error;
    }
  }

  /**
   * Cancel scheduled IP removal
   * @param {string} ip - IP address
   * @param {string} serverName - Server name
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelIPRemoval(ip, serverName) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Cancel jobs matching the IP and server
      const cancelCount = await this.agenda.cancel({
        name: 'remove cphulk ip',
        'data.ip': ip,
        'data.serverName': serverName,
        $or: [
          { lockedAt: null }, // Not currently running
          { lockedAt: { $exists: false } } // Not locked
        ]
      });

      this.logger.info(`Cancelled ${cancelCount} scheduled IP removal jobs for ${ip} on server ${serverName}`);

      return {
        success: true,
        ip: ip,
        serverName: serverName,
        cancelledJobs: cancelCount
      };

    } catch (error) {
      this.logger.error(`Error cancelling IP removal for ${ip}:`, error);
      throw error;
    }
  }

  /**
   * Get scheduled jobs for an IP
   * @param {string} ip - IP address (optional)
   * @param {string} serverName - Server name (optional)
   * @returns {Promise<Array>} List of scheduled jobs
   */
  async getScheduledJobs(ip = null, serverName = null) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const query = { name: 'remove cphulk ip' };
      
      if (ip) {
        query['data.ip'] = ip;
      }
      
      if (serverName) {
        query['data.serverName'] = serverName;
      }

      const jobs = await this.agenda.jobs(query);
      
      return jobs.map(job => ({
        id: job.attrs._id,
        ip: job.attrs.data.ip,
        serverName: job.attrs.data.serverName,
        scheduledFor: job.attrs.nextRunAt,
        scheduledAt: job.attrs.data.scheduledAt,
        status: this.getJobStatus(job),
        reason: job.attrs.data.reason
      }));

    } catch (error) {
      this.logger.error('Error getting scheduled jobs:', error);
      throw error;
    }
  }

  /**
   * Get job status from job attributes
   */
  getJobStatus(job) {
    if (job.attrs.failedAt) {
      return 'failed';
    } else if (job.attrs.lastFinishedAt) {
      return 'completed';
    } else if (job.attrs.lockedAt) {
      return 'running';
    } else if (job.attrs.nextRunAt && job.attrs.nextRunAt > new Date()) {
      return 'scheduled';
    } else {
      return 'pending';
    }
  }

  /**
   * Log job completion for audit trail
   */
  async logJobCompletion(jobInfo) {
    try {
      // In a production environment, this could write to a separate audit log collection
      // For now, we'll use the regular logger
      this.logger.info('Job completed:', {
        type: jobInfo.jobType,
        ip: jobInfo.ip,
        server: jobInfo.serverName,
        scheduled: jobInfo.scheduledAt,
        executed: jobInfo.executedAt,
        status: jobInfo.status,
        reason: jobInfo.reason,
        error: jobInfo.error || null
      });

    } catch (error) {
      this.logger.error('Error logging job completion:', error);
    }
  }

  /**
   * Start periodic cleanup job
   */
  async startPeriodicCleanup() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Schedule cleanup to run daily at 2 AM
      await this.agenda.every('0 2 * * *', 'cleanup old jobs');
      
      this.logger.info('Periodic job cleanup scheduled for daily 2 AM');

    } catch (error) {
      this.logger.error('Error starting periodic cleanup:', error);
    }
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const gracefulShutdown = async () => {
      try {
        this.logger.info('Gracefully shutting down job scheduler...');
        await this.agenda.stop();
        this.logger.info('Job scheduler stopped successfully');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }

  /**
   * Get scheduler statistics
   */
  async getStats() {
    try {
      if (!this.isInitialized) {
        return { initialized: false };
      }

      const jobs = await this.agenda.jobs({});
      const stats = {
        initialized: true,
        totalJobs: jobs.length,
        scheduled: jobs.filter(job => this.getJobStatus(job) === 'scheduled').length,
        running: jobs.filter(job => this.getJobStatus(job) === 'running').length,
        completed: jobs.filter(job => this.getJobStatus(job) === 'completed').length,
        failed: jobs.filter(job => this.getJobStatus(job) === 'failed').length
      };

      return stats;

    } catch (error) {
      this.logger.error('Error getting scheduler stats:', error);
      return { error: error.message };
    }
  }
}

// Create singleton instance
const jobScheduler = new JobScheduler();

module.exports = jobScheduler;