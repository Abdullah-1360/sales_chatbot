/**
 * Optimized performance monitoring utility for WordPress diagnostic endpoints
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.enabled = process.env.NODE_ENV !== 'production';
    this.maxMetrics = 100; // Prevent memory bloat
    this.lastCleanup = Date.now();
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Start timing an operation (optimized)
   */
  startTimer(operationName) {
    if (!this.enabled) return { end: () => 0 };
    
    const startTime = process.hrtime.bigint();
    return {
      operationName,
      startTime,
      end: () => this.endTimer(operationName, startTime)
    };
  }

  /**
   * End timing an operation (optimized)
   */
  endTimer(operationName, startTime) {
    if (!this.enabled) return 0;
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    this.recordMetric(operationName, duration);
    return duration;
  }

  /**
   * Record a metric with memory management
   */
  recordMetric(name, value) {
    if (!this.enabled) return;
    
    // Cleanup old metrics if needed
    this.cleanupIfNeeded();
    
    if (!this.metrics.has(name)) {
      // Don't add new metrics if we're at capacity
      if (this.metrics.size >= this.maxMetrics) {
        return;
      }
      
      this.metrics.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: 0,
        avg: 0,
        lastUpdated: Date.now()
      });
    }
    
    const metric = this.metrics.get(name);
    metric.count++;
    metric.total += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.avg = metric.total / metric.count;
    metric.lastUpdated = Date.now();
  }

  /**
   * Cleanup old metrics to prevent memory leaks
   */
  cleanupIfNeeded() {
    const now = Date.now();
    
    if (now - this.lastCleanup < this.cleanupInterval) return;
    
    // Remove metrics that haven't been updated in the last 10 minutes
    const cutoffTime = now - (10 * 60 * 1000);
    
    for (const [name, metric] of this.metrics.entries()) {
      if (metric.lastUpdated < cutoffTime) {
        this.metrics.delete(name);
      }
    }
    
    this.lastCleanup = now;
  }

  /**
   * Get performance summary (optimized)
   */
  getSummary() {
    if (!this.enabled) return {};
    
    const summary = Object.create(null); // Faster than {}
    
    for (const [name, metric] of this.metrics.entries()) {
      summary[name] = {
        count: metric.count,
        avgMs: Math.round(metric.avg * 100) / 100,
        minMs: Math.round(metric.min * 100) / 100,
        maxMs: Math.round(metric.max * 100) / 100,
        totalMs: Math.round(metric.total * 100) / 100
      };
    }
    
    return summary;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.lastCleanup = Date.now();
  }

  /**
   * Get memory usage stats
   */
  getMemoryStats() {
    if (!this.enabled) return {};
    
    return {
      metricsCount: this.metrics.size,
      maxMetrics: this.maxMetrics,
      memoryUsage: process.memoryUsage()
    };
  }
}

// Export singleton instance
module.exports = new PerformanceMonitor();