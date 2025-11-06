/**
 * Nearest Neighbor Finder Module
 * Finds best matching plans within the same GID based on confidence scores
 */

const { calculateConfidence } = require('./confidenceScorer');

/**
 * Find nearest neighbor plans within the same GID
 * @param {Array} plans - Array of WHMCS product objects (all from same GID)
 * @param {Object} requirements - User requirements
 * @param {number} requirements.storage_needed_gb - Required storage
 * @param {number} requirements.monthly_budget - Monthly budget
 * @param {string} requirements.minTier - Minimum tier
 * @param {boolean} requirements.free_domain - Free domain needed
 * @returns {Array} Top 3 plans sorted by confidence (desc) and price (asc)
 */
function findNearestNeighbors(plans, requirements) {
  if (!plans || plans.length === 0) {
    return [];
  }
  // If required storage is astronomically larger than any plan in this GID,
  // treat as impossible and return empty (prevents returning low-quality nearest neighbors)
  try {
    const maxDisk = Math.max(...plans.map(p => parseFloat(p.diskspace) || 0));
    if (requirements.storage_needed_gb && maxDisk > 0 && requirements.storage_needed_gb > maxDisk * 10) {
      return [];
    }
  } catch (err) {
    // ignore and continue
  }
  
  // Calculate confidence for all plans
  const plansWithConfidence = plans.map(plan => {
    const confidence = calculateConfidence(plan, requirements);
    const priceNum = parseFloat(plan.pricing.USD.monthly);
    
    return {
      ...plan,
      confidence,
      priceNum
    };
  });
  
  // Filter out plans with confidence <= 40 (too poor match)
  // Use strict > 40 so borderline 40.00 matches are treated as non-viable
  const viablePlans = plansWithConfidence.filter(p => p.confidence > 40);
  
  if (viablePlans.length === 0) {
    // If no plans meet 40% threshold, return empty
    return [];
  }
  
  // Sort by confidence (descending), then by price (ascending)
  viablePlans.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence; // Higher confidence first
    }
    return a.priceNum - b.priceNum; // Cheaper first for same confidence
  });
  
  // Return top 3 plans maximum
  const topPlans = viablePlans.slice(0, 3);
  
  // Clean up temporary priceNum field
  topPlans.forEach(p => delete p.priceNum);
  
  return topPlans;
}

module.exports = {
  findNearestNeighbors
};
