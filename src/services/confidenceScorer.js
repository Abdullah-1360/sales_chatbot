/**
 * Confidence Scorer Module
 * Calculates confidence scores for plan recommendations based on weighted criteria
 */

const { getTierFromPlan, getTierRank } = require('../utils/tierHelper');

/**
 * Score storage match (30% weight)
 * Uses logarithmic scaling for better differentiation across ranges
 * @param {number} planStorage - Plan storage in GB
 * @param {number} requiredStorage - Required storage in GB
 * @returns {number} Score (0-30)
 */
function scoreStorage(planStorage, requiredStorage) {
  if (planStorage >= requiredStorage) {
    // Exact or better match
    if (planStorage === requiredStorage) return 30;
    
    // Use logarithmic scaling for excess storage penalty
    // This provides smoother degradation for over-provisioned plans
    const excess = planStorage - requiredStorage;
    const excessRatio = excess / requiredStorage;
    
    // Logarithmic penalty: log2(1 + excessRatio) normalized
    // Plans with 2x storage get ~23 points, 4x get ~18, 8x get ~15
    if (excessRatio > 10) return 12; // Extreme over-provisioning
    const penalty = Math.log2(1 + excessRatio) * 6;
    return Math.max(12, 30 - penalty);
  }
  
  // Plan has less than required - exponential penalty for severe shortfalls
  const ratio = planStorage / requiredStorage;
  
  // Exponential curve: plans with 90% get ~27 points, 50% get ~15, 25% get ~7.5
  if (ratio >= 0.9) return 27 + (ratio - 0.9) * 30; // Near-match bonus
  if (ratio >= 0.5) return 15 + (ratio - 0.5) * 30; // Moderate shortfall
  return ratio * 30; // Severe shortfall
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
 * Score tier appropriateness (25% weight)
 * Considers both tier matching and growth potential
 * @param {Object} plan - WHMCS product object
 * @param {string} minTier - Minimum required tier (entry/mid/upper)
 * @returns {number} Score (0-25)
 */
function scoreTier(plan, minTier) {
  const planTier = getTierFromPlan(plan);
  const planRank = getTierRank(planTier);
  const minRank = getTierRank(minTier);
  
  if (planRank >= minRank) {
    // Meets or exceeds tier requirement
    if (planRank === minRank) return 25; // Perfect match
    
    // One tier higher: slight bonus for growth room
    if (planRank === minRank + 1) return 24;
    
    // Two+ tiers higher: over-provisioned, diminishing returns
    const tierDiff = planRank - minRank;
    return Math.max(15, 25 - (tierDiff * 6));
  }
  
  // Below required tier - steep penalty
  const tierDiff = minRank - planRank;
  
  // One tier below: significant penalty but not disqualifying
  if (tierDiff === 1) return 12;
  
  // Two+ tiers below: severe penalty
  return Math.max(0, 12 - (tierDiff - 1) * 8);
}

/**
 * Score free domain availability (15% weight)
 * @param {Object} plan - WHMCS product object
 * @param {boolean} freeDomainNeeded - Whether user needs free domain
 * @returns {number} Score (0-15)
 */
function scoreFreeDomain(plan, freeDomainNeeded) {
  if (!freeDomainNeeded) return 15; // Not needed, full score
  
  return plan.freedomain ? 15 : 0; // Has it or doesn't
}

/**
 * Calculate overall confidence score
 * Simplified scoring based on: diskspace, websites_count (tier), free_domain, purpose
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
    
    // Simplified scoring: diskspace (40%), tier (40%), free_domain (20%)
    const storageScore = scoreStorage(planStorage, requirements.storage_needed_gb) * 1.33; // Scale to 40%
    const tierScore = scoreTier(plan, requirements.minTier) * 1.6; // Scale to 40%
    const domainScore = scoreFreeDomain(plan, requirements.free_domain) * 1.33; // Scale to 20%
    
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
