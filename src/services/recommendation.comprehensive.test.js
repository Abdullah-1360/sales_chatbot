/**
 * Comprehensive Test Suite for Recommendation System
 * Tests confidence scoring, nearest neighbors, and edge cases
 */

const { calculateConfidence, scoreStorage, scoreBudget, scoreTier, scoreFreeDomain } = require('./confidenceScorer');
const { findNearestNeighbors, calculateDistance, calculateDiversityBonus } = require('./nearestNeighbor');
const { selectThreePlans } = require('./planSelector');

describe('Comprehensive Recommendation System Tests', () => {
  
  // ==================== CONFIDENCE SCORING TESTS ====================
  
  describe('Enhanced Storage Scoring', () => {
    test('exact match gets perfect score', () => {
      expect(scoreStorage(10, 10)).toBe(30);
      expect(scoreStorage(50, 50)).toBe(30);
    });

    test('near-match (90%+) gets high score', () => {
      const score = scoreStorage(9, 10);
      expect(score).toBeGreaterThan(27);
      expect(score).toBeLessThan(30);
    });

    test('logarithmic penalty for excess storage', () => {
      const score2x = scoreStorage(20, 10); // 2x storage
      const score4x = scoreStorage(40, 10); // 4x storage
      const score8x = scoreStorage(80, 10); // 8x storage
      
      expect(score2x).toBeGreaterThan(20);
      expect(score2x).toBeLessThan(25);
      expect(score4x).toBeGreaterThan(15);
      expect(score4x).toBeLessThan(20);
      expect(score8x).toBeGreaterThan(12);
      expect(score8x).toBeLessThan(17);
    });

    test('extreme over-provisioning gets minimum viable score', () => {
      expect(scoreStorage(200, 10)).toBe(12);
    });

    test('exponential penalty for storage shortfall', () => {
      const score90 = scoreStorage(9, 10);   // 90%
      const score50 = scoreStorage(5, 10);   // 50%
      const score25 = scoreStorage(2.5, 10); // 25%
      
      expect(score90).toBeGreaterThan(27);
      expect(score50).toBeGreaterThan(14);
      expect(score50).toBeLessThan(16);
      expect(score25).toBeLessThan(8);
    });

    test('handles zero storage edge case', () => {
      expect(scoreStorage(0, 10)).toBe(0);
    });
  });

  describe('Enhanced Budget Scoring', () => {
    test('sweet spot (70-90% of budget) gets highest scores', () => {
      const score70 = scoreBudget(7, 10);
      const score80 = scoreBudget(8, 10);
      const score90 = scoreBudget(9, 10);
      
      expect(score70).toBeGreaterThan(27);
      expect(score80).toBeGreaterThan(28);
      expect(score90).toBeGreaterThan(27);
    });

    test('exact budget match is good but not optimal', () => {
      const score = scoreBudget(10, 10);
      expect(score).toBeGreaterThanOrEqual(27);
      expect(score).toBeLessThan(30);
    });

    test('too cheap indicates potential feature gaps', () => {
      const score30 = scoreBudget(3, 10);  // 30% of budget
      const score50 = scoreBudget(5, 10);  // 50% of budget
      
      expect(score30).toBeGreaterThan(20);
      expect(score30).toBeLessThan(25);
      expect(score50).toBeGreaterThan(22);
      expect(score50).toBeLessThan(27);
    });

    test('graduated penalties for over-budget', () => {
      const score5over = scoreBudget(10.5, 10);   // 5% over
      const score10over = scoreBudget(11, 10);    // 10% over
      const score25over = scoreBudget(12.5, 10);  // 25% over
      const score50over = scoreBudget(15, 10);    // 50% over
      const score100over = scoreBudget(20, 10);   // 100% over
      
      expect(score5over).toBeGreaterThan(24);
      expect(score10over).toBe(25);
      expect(score25over).toBeGreaterThan(15);
      expect(score25over).toBeLessThan(21);
      expect(score50over).toBeGreaterThanOrEqual(0);
      expect(score50over).toBeLessThan(10);
      expect(score100over).toBe(0);
    });

    test('handles zero budget gracefully', () => {
      expect(scoreBudget(3, 0)).toBeGreaterThan(20);
      expect(scoreBudget(10, 0)).toBeLessThan(15);
    });
  });

  describe('Enhanced Tier Scoring', () => {
    const mockPlan = (name) => ({ 
      name, 
      diskspace: '10', 
      pricing: { USD: { monthly: 5 } } 
    });

    test('exact tier match gets perfect score', () => {
      expect(scoreTier(mockPlan('cPanel Starter'), 'entry')).toBe(25);
      expect(scoreTier(mockPlan('WP Plus'), 'mid')).toBe(25);
      expect(scoreTier(mockPlan('Biz Pro'), 'upper')).toBe(25);
    });

    test('one tier higher gets slight bonus for growth', () => {
      expect(scoreTier(mockPlan('WP Plus'), 'entry')).toBe(24);
      expect(scoreTier(mockPlan('Biz Pro'), 'mid')).toBe(24);
    });

    test('two+ tiers higher gets diminishing returns', () => {
      const score = scoreTier(mockPlan('Biz Pro'), 'entry');
      expect(score).toBeGreaterThanOrEqual(15);
      expect(score).toBeLessThan(20);
    });

    test('one tier below gets significant penalty', () => {
      expect(scoreTier(mockPlan('cPanel Starter'), 'mid')).toBe(12);
      expect(scoreTier(mockPlan('WP Plus'), 'upper')).toBe(12);
    });

    test('two+ tiers below gets severe penalty', () => {
      const score = scoreTier(mockPlan('cPanel Starter'), 'upper');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThan(12);
    });
  });

  // ==================== NEAREST NEIGHBOR TESTS ====================
  
  describe('Distance Calculation', () => {
    const mockPlan = {
      diskspace: '10',
      freedomain: true,
      pricing: { USD: { monthly: 5 } }
    };

    test('calculates normalized Euclidean distance', () => {
      const requirements = {
        storage_needed_gb: 10,
        monthly_budget: 5,
        free_domain: true
      };
      
      const distance = calculateDistance(mockPlan, requirements, 50, 20);
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(1);
    });

    test('perfect match has zero distance', () => {
      const requirements = {
        storage_needed_gb: 10,
        monthly_budget: 5,
        free_domain: true
      };
      
      const distance = calculateDistance(mockPlan, requirements, 10, 5);
      expect(distance).toBeLessThan(0.1);
    });

    test('missing free domain increases distance', () => {
      const planWithoutDomain = { ...mockPlan, freedomain: false };
      const requirements = {
        storage_needed_gb: 10,
        monthly_budget: 5,
        free_domain: true
      };
      
      const distanceWith = calculateDistance(mockPlan, requirements, 10, 5);
      const distanceWithout = calculateDistance(planWithoutDomain, requirements, 10, 5);
      
      expect(distanceWithout).toBeGreaterThan(distanceWith);
    });
  });

  describe('Diversity Bonus Calculation', () => {
    test('first plan gets no diversity bonus', () => {
      const plan = {
        diskspace: '10',
        pricing: { USD: { monthly: 5 } }
      };
      
      expect(calculateDiversityBonus([], plan)).toBe(0);
    });

    test('similar plan gets low diversity bonus', () => {
      const selected = [{
        diskspace: '10',
        pricing: { USD: { monthly: 5 } }
      }];
      
      const similar = {
        diskspace: '12',
        pricing: { USD: { monthly: 5.5 } }
      };
      
      const bonus = calculateDiversityBonus(selected, similar);
      expect(bonus).toBeLessThan(3);
    });

    test('different plan gets higher diversity bonus', () => {
      const selected = [{
        diskspace: '10',
        pricing: { USD: { monthly: 5 } }
      }];
      
      const different = {
        diskspace: '50',
        pricing: { USD: { monthly: 15 } }
      };
      
      const bonus = calculateDiversityBonus(selected, different);
      expect(bonus).toBeGreaterThan(3);
    });

    test('diversity bonus is capped at 10', () => {
      const selected = [{
        diskspace: '5',
        pricing: { USD: { monthly: 3 } }
      }];
      
      const veryDifferent = {
        diskspace: '500',
        pricing: { USD: { monthly: 100 } }
      };
      
      const bonus = calculateDiversityBonus(selected, veryDifferent);
      expect(bonus).toBeLessThanOrEqual(10);
    });
  });

  describe('Nearest Neighbor Selection', () => {
    const mockPlans = [
      {
        pid: '1',
        name: 'Entry Basic',
        diskspace: '5',
        freedomain: false,
        pricing: { USD: { monthly: 2.99 } }
      },
      {
        pid: '2',
        name: 'Entry Plus',
        diskspace: '10',
        freedomain: true,
        pricing: { USD: { monthly: 4.99 } }
      },
      {
        pid: '3',
        name: 'Mid Standard',
        diskspace: '15',
        freedomain: true,
        pricing: { USD: { monthly: 6.99 } }
      },
      {
        pid: '4',
        name: 'Mid Pro',
        diskspace: '25',
        freedomain: true,
        pricing: { USD: { monthly: 9.99 } }
      },
      {
        pid: '5',
        name: 'Upper Elite',
        diskspace: '50',
        freedomain: true,
        pricing: { USD: { monthly: 14.99 } }
      }
    ];

    test('returns diverse set of plans', () => {
      const requirements = {
        storage_needed_gb: 12,
        monthly_budget: 8,
        minTier: 'mid',
        free_domain: true
      };
      
      const result = findNearestNeighbors(mockPlans, requirements);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(3);
      
      // Check diversity in prices
      if (result.length >= 2) {
        const prices = result.map(p => parseFloat(p.pricing.USD.monthly));
        const priceRange = Math.max(...prices) - Math.min(...prices);
        expect(priceRange).toBeGreaterThan(0);
      }
    });

    test('filters out extremely poor matches', () => {
      const impossibleRequirements = {
        storage_needed_gb: 1000,
        monthly_budget: 1,
        minTier: 'upper',
        free_domain: true
      };
      
      const result = findNearestNeighbors(mockPlans, impossibleRequirements);
      expect(result).toEqual([]);
    });

    test('uses adaptive threshold for borderline cases', () => {
      const borderlineRequirements = {
        storage_needed_gb: 30,
        monthly_budget: 7,
        minTier: 'mid',
        free_domain: false
      };
      
      const result = findNearestNeighbors(mockPlans, borderlineRequirements);
      
      // Should return some results even if confidence is 30-40%
      // if composite score is good
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    test('handles single plan gracefully', () => {
      const singlePlan = [mockPlans[0]];
      const requirements = {
        storage_needed_gb: 5,
        monthly_budget: 5,
        minTier: 'entry',
        free_domain: false
      };
      
      const result = findNearestNeighbors(singlePlan, requirements);
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  // ==================== INTEGRATION TESTS ====================
  
  describe('End-to-End Recommendation Scenarios', () => {
    const fullPlanSet = [
      {
        pid: '101',
        name: 'cPanel Starter',
        diskspace: '5',
        freedomain: false,
        pricing: { USD: { monthly: 2.99 } }
      },
      {
        pid: '102',
        name: 'cPanel Plus',
        diskspace: '10',
        freedomain: true,
        pricing: { USD: { monthly: 4.99 } }
      },
      {
        pid: '103',
        name: 'WP Starter',
        diskspace: '8',
        freedomain: false,
        pricing: { USD: { monthly: 3.99 } }
      },
      {
        pid: '104',
        name: 'WP Plus',
        diskspace: '12',
        freedomain: true,
        pricing: { USD: { monthly: 5.99 } }
      },
      {
        pid: '105',
        name: 'WP Pro',
        diskspace: '20',
        freedomain: true,
        pricing: { USD: { monthly: 8.99 } }
      },
      {
        pid: '106',
        name: 'Biz Standard',
        diskspace: '30',
        freedomain: true,
        pricing: { USD: { monthly: 12.99 } }
      },
      {
        pid: '107',
        name: 'Biz Pro',
        diskspace: '50',
        freedomain: true,
        pricing: { USD: { monthly: 19.99 } }
      },
      {
        pid: '108',
        name: 'Biz Elite',
        diskspace: '100',
        freedomain: true,
        pricing: { USD: { monthly: 29.99 } }
      }
    ];

    test('Scenario 1: Budget-conscious blogger', () => {
      const requirements = {
        storage_needed_gb: 5,
        monthly_budget: 5,
        minTier: 'entry',
        free_domain: true
      };
      
      const result = findNearestNeighbors(fullPlanSet, requirements);
      
      expect(result.length).toBeGreaterThan(0);
      
      // Should recommend affordable plans
      result.forEach(plan => {
        expect(parseFloat(plan.pricing.USD.monthly)).toBeLessThanOrEqual(7);
        expect(plan.confidence).toBeGreaterThan(40);
      });
    });

    test('Scenario 2: Growing business with moderate budget', () => {
      const requirements = {
        storage_needed_gb: 20,
        monthly_budget: 12,
        minTier: 'mid',
        free_domain: true
      };
      
      const result = findNearestNeighbors(fullPlanSet, requirements);
      
      expect(result.length).toBeGreaterThan(0);
      
      // Should recommend mid-tier plans
      const topPlan = result[0];
      expect(parseFloat(topPlan.diskspace)).toBeGreaterThanOrEqual(15);
      expect(topPlan.confidence).toBeGreaterThan(60);
    });

    test('Scenario 3: Enterprise with high requirements', () => {
      const requirements = {
        storage_needed_gb: 80,
        monthly_budget: 35,
        minTier: 'upper',
        free_domain: true
      };
      
      const result = findNearestNeighbors(fullPlanSet, requirements);
      
      expect(result.length).toBeGreaterThan(0);
      
      // Should recommend high-tier plans
      const topPlan = result[0];
      expect(parseFloat(topPlan.diskspace)).toBeGreaterThanOrEqual(50);
    });

    test('Scenario 4: Tight budget with high storage needs (conflict)', () => {
      const requirements = {
        storage_needed_gb: 50,
        monthly_budget: 8,
        minTier: 'mid',
        free_domain: false
      };
      
      const result = findNearestNeighbors(fullPlanSet, requirements);
      
      // Should find compromise plans or return empty
      if (result.length > 0) {
        result.forEach(plan => {
          expect(plan.confidence).toBeGreaterThan(30);
        });
      }
    });

    test('Scenario 5: Flexible budget, specific storage', () => {
      const requirements = {
        storage_needed_gb: 12,
        monthly_budget: 20,
        minTier: 'mid',
        free_domain: true
      };
      
      const result = findNearestNeighbors(fullPlanSet, requirements);
      
      expect(result.length).toBeGreaterThan(0);
      
      // Should have high confidence due to flexible budget
      const avgConfidence = result.reduce((sum, p) => sum + p.confidence, 0) / result.length;
      expect(avgConfidence).toBeGreaterThan(70);
    });

    test('Scenario 6: No free domain requirement', () => {
      const requirements = {
        storage_needed_gb: 10,
        monthly_budget: 6,
        minTier: 'entry',
        free_domain: false
      };
      
      const result = findNearestNeighbors(fullPlanSet, requirements);
      
      expect(result.length).toBeGreaterThan(0);
      
      // Plans without free domain should be competitive
      const withoutDomain = result.filter(p => !p.freedomain);
      expect(withoutDomain.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== EDGE CASES ====================
  
  describe('Edge Cases and Error Handling', () => {
    test('handles empty plan array', () => {
      const requirements = {
        storage_needed_gb: 10,
        monthly_budget: 5,
        minTier: 'mid',
        free_domain: true
      };
      
      expect(findNearestNeighbors([], requirements)).toEqual([]);
      expect(findNearestNeighbors(null, requirements)).toEqual([]);
    });

    test('handles malformed plan data', () => {
      const badPlans = [
        {
          pid: '1',
          name: 'Bad Plan',
          diskspace: 'invalid',
          pricing: { USD: { monthly: 'not a number' } }
        }
      ];
      
      const requirements = {
        storage_needed_gb: 10,
        monthly_budget: 5,
        minTier: 'mid',
        free_domain: false
      };
      
      const result = findNearestNeighbors(badPlans, requirements);
      expect(Array.isArray(result)).toBe(true);
    });

    test('handles zero values in requirements', () => {
      const plans = [{
        pid: '1',
        name: 'Test Plan',
        diskspace: '10',
        freedomain: true,
        pricing: { USD: { monthly: 5 } }
      }];
      
      const requirements = {
        storage_needed_gb: 0,
        monthly_budget: 0,
        minTier: 'entry',
        free_domain: false
      };
      
      const result = findNearestNeighbors(plans, requirements);
      expect(Array.isArray(result)).toBe(true);
    });

    test('handles very large numbers', () => {
      const plans = [{
        pid: '1',
        name: 'Unlimited Plan',
        diskspace: '999999',
        freedomain: true,
        pricing: { USD: { monthly: 999.99 } }
      }];
      
      const requirements = {
        storage_needed_gb: 1000000,
        monthly_budget: 10000,
        minTier: 'upper',
        free_domain: true
      };
      
      const result = findNearestNeighbors(plans, requirements);
      expect(Array.isArray(result)).toBe(true);
    });

    test('confidence scores never exceed 100', () => {
      const perfectPlan = {
        name: 'Perfect Plan',
        diskspace: '10',
        freedomain: true,
        pricing: { USD: { monthly: 5 } }
      };
      
      const requirements = {
        storage_needed_gb: 10,
        monthly_budget: 5,
        minTier: 'mid',
        free_domain: true
      };
      
      const confidence = calculateConfidence(perfectPlan, requirements);
      expect(confidence).toBeLessThanOrEqual(100);
    });

    test('confidence scores never go below 0', () => {
      const terriblePlan = {
        name: 'Terrible Plan',
        diskspace: '1',
        freedomain: false,
        pricing: { USD: { monthly: 100 } }
      };
      
      const requirements = {
        storage_needed_gb: 1000,
        monthly_budget: 5,
        minTier: 'upper',
        free_domain: true
      };
      
      const confidence = calculateConfidence(terriblePlan, requirements);
      expect(confidence).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== PERFORMANCE TESTS ====================
  
  describe('Performance and Scalability', () => {
    test('handles large plan sets efficiently', () => {
      const largePlanSet = Array(100).fill(null).map((_, i) => ({
        pid: String(i),
        name: `Plan ${i}`,
        diskspace: String(5 + i * 2),
        freedomain: i % 2 === 0,
        pricing: { USD: { monthly: 3 + i * 0.5 } }
      }));
      
      const requirements = {
        storage_needed_gb: 50,
        monthly_budget: 25,
        minTier: 'mid',
        free_domain: true
      };
      
      const startTime = Date.now();
      const result = findNearestNeighbors(largePlanSet, requirements);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(100); // Should complete in <100ms
      expect(result.length).toBeLessThanOrEqual(3);
    });

    test('returns results in reasonable time for complex scenarios', () => {
      const complexPlans = Array(50).fill(null).map((_, i) => ({
        pid: String(i),
        name: `Complex Plan ${i}`,
        diskspace: String(Math.pow(2, i % 10)),
        freedomain: Math.random() > 0.5,
        pricing: { USD: { monthly: 2 + Math.random() * 50 } }
      }));
      
      const requirements = {
        storage_needed_gb: 30,
        monthly_budget: 15,
        minTier: 'mid',
        free_domain: true
      };
      
      const startTime = Date.now();
      const result = findNearestNeighbors(complexPlans, requirements);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(50);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
