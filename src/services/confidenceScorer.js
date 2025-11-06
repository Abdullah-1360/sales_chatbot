/**
 * Confidence Scorer Module
 * Calculates confidence scores for plan recommendations based on weighted criteria
 */

const { getTierFromPlan, getTierRank } = require('../utils/tierHelper');

/**
 * Score storage match (30% weight)
 * @param {number} planStorage - Plan storage in GB
 * @param {number} requiredStorage - Required storage in GB
 * @returns {number} Score (0-30)
 */
function scoreStorage(planStorage, requiredStorage) {
  if (planStorage >= requiredStorage) {
    // Exact or better match
    if (planStorage === requiredStorage) return 30;
    
    // Proportional score: closer to required = higher score
    // If plan has more than needed, reduce score slightly
    const excess = planStorage - requiredStorage;
    const excessRatio = excess / requiredStorage;
    
    // Cap penalty at 50% for excessive storage
    if (excessRatio > 2) return 15; // More than 3x required
    return 30 - (excessRatio * 7.5); // Linear decrease
  }
  
  // Plan has less than required - proportional to how close
  const ratio = planStorage / requiredStorage;
  return ratio * 30;
}

/**
 * Score budget alignment (30% weight)
 * @param {number} planPrice - Plan monthly price
 * @param {number} budget - User's monthly budget
 * @returns {number} Score (0-30)
 */
function scoreBudget(planPrice, budget) {
  if (planPrice <= budget) {
    // Within budget - score based on value
    if (planPrice === budget) return 30;
    
    // Better value (cheaper) gets slightly higher score
    const savings = budget - planPrice;
    const savingsRatio = savings / budget;
    
    // Max bonus for being 50%+ under budget
    if (savingsRatio >= 0.5) return 30;
    return 25 + (savingsRatio * 10); // 25-30 range
  }
  
  // Over budget - proportional penalty
  const overBudget = planPrice - budget;
  const overRatio = overBudget / budget;
  
  // Severe penalty for being way over budget
  if (overRatio > 0.5) return 0; // More than 50% over budget
  return 30 - (overRatio * 60); // Linear decrease
}

/**
 * Score tier appropriateness (25% weight)
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
    
    // Higher tier than needed - slight penalty
    const tierDiff = planRank - minRank;
    return 25 - (tierDiff * 5); // -5 per tier level
  }
  
  // Below required tier - proportional score
  const ratio = planRank / minRank;
  return ratio * 25;
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
 * @param {Object} plan - WHMCS product object
 * @param {Object} requirements - User requirements
 * @param {number} requirements.storage_needed_gb - Required storage
 * @param {number} requirements.monthly_budget - Monthly budget
 * @param {string} requirements.minTier - Minimum tier
 * @param {boolean} requirements.free_domain - Free domain needed
 * @returns {number} Confidence score (0-100)
 */
function calculateConfidence(plan, requirements) {
  try {
    const planStorage = parseFloat(plan.diskspace);
    const planPrice = parseFloat(plan.pricing.USD.monthly);
    
    const storageScore = scoreStorage(planStorage, requirements.storage_needed_gb);
    const budgetScore = scoreBudget(planPrice, requirements.monthly_budget);
    const tierScore = scoreTier(plan, requirements.minTier);
    const domainScore = scoreFreeDomain(plan, requirements.free_domain);
    
    const totalScore = storageScore + budgetScore + tierScore + domainScore;
    
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
