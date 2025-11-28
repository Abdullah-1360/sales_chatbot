/**
 * Lead Cleanup Service
 * Automatically deletes leads older than 24 hours
 */

const Lead = require('../models/Lead');
const { createLogger } = require('../utils/logger');

const logger = createLogger('LEAD_CLEANUP');

/**
 * Delete leads older than 24 hours
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupOldLeads() {
  try {
    // Calculate timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    logger.info('Starting lead cleanup', { 
      cutoffTime: twentyFourHoursAgo.toISOString() 
    });
    
    // Find and delete leads older than 24 hours
    const result = await Lead.deleteMany({
      createdAt: { $lt: twentyFourHoursAgo }
    });
    
    if (result.deletedCount > 0) {
      logger.info('Lead cleanup completed', { 
        deletedCount: result.deletedCount,
        cutoffTime: twentyFourHoursAgo.toISOString()
      });
    } else {
      logger.info('No old leads to clean up');
    }
    
    return {
      success: true,
      deletedCount: result.deletedCount,
      cutoffTime: twentyFourHoursAgo
    };
  } catch (error) {
    logger.error('Error during lead cleanup', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Schedule automatic lead cleanup
 * Runs every hour to check for old leads
 */
function scheduleLeadCleanup() {
  // Run cleanup immediately on startup
  cleanupOldLeads();
  
  // Schedule cleanup to run every hour (3600000 ms)
  const intervalId = setInterval(() => {
    cleanupOldLeads();
  }, 60 * 60 * 1000); // 1 hour
  
  logger.info('Lead cleanup scheduled to run every hour');
  
  return intervalId;
}

module.exports = {
  cleanupOldLeads,
  scheduleLeadCleanup
};
