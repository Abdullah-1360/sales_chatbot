/**
 * Simple performance monitoring utility for WordPress diagnostic endpoints
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.enabled = process.env.NODE_ENV !== 'production';
  }

  /**
   * Start timing an operation
   */
  startTimer(operationName) {
    if (!this.enabled) return null;
    
    const startTime = process.hrtime.bigint();
    return {
      operationName,
      startTime,
      end: () => this.endTimer(operationName, startTime)
    };
  }

  /**
   * End timing an operation
   */
  endTimer(operationName, startTime) {
    if (!this.enabled) return 0;
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    this.recordMetric(operationName, duration);
    return duration;
  }

  /**
   * Record a metric
   */
  recordMetric(name, value) {
    if (!this.enabled) return;
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: 0,
        avg: 0
      });
    }
    
    const metric = this.metrics.get(name);
    metric.count++;
    metric.total += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.avg = metric.total / metric.count;
  }

  /**
   * Get performance summary
   */
  getSummary() {
    if (!this.enabled) return {};
    
    const summary = {};
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
  }

  /**
   * Log performance summary
   */
  logSummary() {
    if (!this.enabled) return;
    
    const summary = this.getSummary();
    if (Object.keys(summary).length > 0) {
      // Performance summary logging disabled for production performance
      // console.log('Performance Summary:', JSON.stringify(summary, null, 2));
    }
  }
}

// Export singleton instance
module.exports = new PerformanceMonitor();