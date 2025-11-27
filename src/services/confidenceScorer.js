/**
 * Confidence Scorer Module
 * Calculates confidence scores for plan recommendations based on weighted criteria
 */

const { getTierFromPlan, getTierRank } = require('../utils/tierHelper');

/**
 * Score storage match (40% weight)
 * Prioritizes exact matches and plans that meet requirements
 * Heavily penalizes plans far below requirements
 * @param {number} planStorage - Plan storage in GB
 * @param {number} requiredStorage - Required storage in GB
 * @returns {number} Score (0-40)
 */
function scoreStorage(planStorage, requiredStorage) {
  if (planStorage >= requiredStorage) {
    // EXACT MATCH - highest score
    if (planStorage === requiredStorage) return 40;
    
    // Meets requirement with reasonable overhead (1-2x) - very good
    const excessRatio = planStorage / requiredStorage;
    
    if (excessRatio <= 1.5) return 38; // Up to 50% more - excellent
    if (excessRatio <= 2.0) return 35; // Up to 2x - very good
    if (excessRatio <= 3.0) return 30; // Up to 3x - good
    if (excessRatio <= 5.0) return 25; // Up to 5x - acceptable
    
    // Extreme over-provisioning (>5x) - diminishing returns
    return Math.max(15, 40 - Math.log2(excessRatio) * 8);
  }
  
  // Plan has less than required - HEAVY PENALTY
  const ratio = planStorage / requiredStorage;
  
  // Near-match (90-99%) - minor penalty
  if (ratio >= 0.9) return 35 + (ratio - 0.9) * 50;
  
  // Close match (80-90%) - moderate penalty
  if (ratio >= 0.8) return 28 + (ratio - 0.8) * 70;
  
  // Moderate shortfall (60-80%) - significant penalty
  if (ratio >= 0.6) return 18 + (ratio - 0.6) * 50;
  
  // Severe shortfall (40-60%) - heavy penalty
  if (ratio >= 0.4) return 10 + (ratio - 0.4) * 40;
  
  // Critical shortfall (20-40%) - very heavy penalty
  if (ratio >= 0.2) return 5 + (ratio - 0.2) * 25;
  
  // Extreme shortfall (<20%) - near zero score
  return ratio * 25;
}

/**
 * Score budget alignment (30% weight)
 * Uses value-based scoring with sweet spot optimization
 * @param {number} planPrice - Plan monthly price
 * @param {number} budget - User's monthly budget
 * @returns {number} Score (0-30)
 */
function scoreBudget(planPrice, budget) {
  // Handle zero budget edge case
  if (budget === 0) {
    // Prefer cheapest plans when no budget specified
    return planPrice <= 5 ? 30 : Math.max(0, 30 - planPrice * 2);
  }
  
  if (planPrice <= budget) {
    // Within budget - optimize for value sweet spot
    const utilizationRatio = planPrice / budget;
    
    // Sweet spot: 70-90% of budget gets highest scores (28-30)
    // This balances value with getting a good plan
    if (utilizationRatio >= 0.7 && utilizationRatio <= 0.9) {
      return 28 + (0.9 - Math.abs(utilizationRatio - 0.8)) * 10;
    }
    
    // Exact match is good but not optimal (might be under-utilizing)
    if (utilizationRatio >= 0.95) return 27;
    
    // Too cheap might indicate insufficient features (50-70% range)
    if (utilizationRatio < 0.5) return 22 + utilizationRatio * 10;
    
    // 50-70% range: decent value
    return 24 + (utilizationRatio - 0.5) * 10;
  }
  
  // Over budget - exponential penalty
  const overRatio = (planPrice - budget) / budget;
  
  // Graduated penalties: slight over-budget is more acceptable
  if (overRatio <= 0.1) return 25; // Within 10% over: minor penalty
  if (overRatio <= 0.25) return 20 - (overRatio - 0.1) * 33; // 10-25% over
  if (overRatio <= 0.5) return 10 - (overRatio - 0.25) * 40; // 25-50% over
  return 0; // More than 50% over budget
}

/**
 * Score tier appropriateness (40% weight)
 * Prioritizes exact tier matches and plans that meet website count requirements
 * @param {Object} plan - WHMCS product object
 * @param {string} minTier - Minimum required tier (entry/mid/upper)
 * @returns {number} Score (0-40)
 */
function scoreTier(plan, minTier) {
  const planTier = getTierFromPlan(plan);
  const planRank = getTierRank(planTier);
  const minRank = getTierRank(minTier);
  
  if (planRank >= minRank) {
    // EXACT MATCH - highest score
    if (planRank === minRank) return 40;
    
    // One tier higher: excellent for growth potential
    if (planRank === minRank + 1) return 38;
    
    // Two tiers higher: good but over-provisioned
    if (planRank === minRank + 2) return 32;
    
    // Three+ tiers higher: significant over-provisioning
    const tierDiff = planRank - minRank;
    return Math.max(20, 40 - (tierDiff * 8));
  }
  
  // Below required tier - HEAVY penalty (doesn't meet requirements)
  const tierDiff = minRank - planRank;
  
  // One tier below: major penalty
  if (tierDiff === 1) return 15;
  
  // Two+ tiers below: severe penalty (likely unusable)
  return Math.max(0, 15 - (tierDiff - 1) * 10);
}

/**
 * Score free domain availability (20% weight)
 * @param {Object} plan - WHMCS product object
 * @param {boolean} freeDomainNeeded - Whether user needs free domain
 * @returns {number} Score (0-20)
 */
function scoreFreeDomain(plan, freeDomainNeeded) {
  if (!freeDomainNeeded) return 20; // Not needed, full score
  
  return plan.freedomain ? 20 : 0; // Has it or doesn't
}

/**
 * Calculate overall confidence score
 * Prioritizes exact matches: storage (40%), tier/websites (40%), free_domain (20%)
 * @param {Object} plan - WHMCS product object
 * @param {Object} requirements - User requirements
 * @param {number} requirements.storage_needed_gb - Required storage (40% weight)
 * @param {string} requirements.minTier - Minimum tier from websites_count (40% weight)
 * @param {boolean} requirements.free_domain - Free domain needed (20% weight)
 * @param {string} requirements.purpose - Purpose (informational, not scored)
 * @returns {number} Confidence score (0-100)
 */
function calculateConfidence(plan, requirements) {
  try {
    const planStorage = parseFloat(plan.diskspace);
    
    // Direct scoring: storage (40%), tier (40%), free_domain (20%)
    const storageScore = scoreStorage(planStorage, requirements.storage_needed_gb);
    const tierScore = scoreTier(plan, requirements.minTier);
    const domainScore = scoreFreeDomain(plan, requirements.free_domain);
    
    const totalScore = storageScore + tierScore + domainScore;
    
    // Round to 2 decimal places and ensure 0-100 range
    return Math.max(0, Math.min(100, Math.round(totalScore * 100) / 100));
  } catch (error) {
    console.error('Error calculating confidence:', error);
    return 0; // Default fallback score
  }
}

module.exports = {
  scoreStorage,
  scoreBudget,
  scoreTier,
  scoreFreeDomain,
  calculateConfidence
};
