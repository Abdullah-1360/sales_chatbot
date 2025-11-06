/**
 * Unit tests for Confidence Scorer Module
 */

const {
  scoreStorage,
  scoreBudget,
  scoreTier,
  scoreFreeDomain,
  calculateConfidence
} = require('./confidenceScorer');

describe('Confidence Scorer', () => {
  describe('scoreStorage', () => {
    test('exact match returns 30', () => {
      expect(scoreStorage(10, 10)).toBe(30);
    });

    test('plan with more storage returns slightly less', () => {
      const score = scoreStorage(20, 10);
      expect(score).toBeGreaterThan(15);
      expect(score).toBeLessThan(30);
    });

    test('plan with 3x+ storage returns 15', () => {
      expect(scoreStorage(40, 10)).toBe(15);
    });

    test('plan with less storage returns proportional score', () => {
      expect(scoreStorage(5, 10)).toBe(15); // 50% of required
      expect(scoreStorage(7.5, 10)).toBe(22.5); // 75% of required
    });

    test('plan with no storage returns 0', () => {
      expect(scoreStorage(0, 10)).toBe(0);
    });
  });

  describe('scoreBudget', () => {
    test('exact budget match returns 30', () => {
      expect(scoreBudget(10, 10)).toBe(30);
    });

    test('plan cheaper than budget returns 25-30', () => {
      const score = scoreBudget(5, 10);
      expect(score).toBeGreaterThanOrEqual(25);
      expect(score).toBeLessThanOrEqual(30);
    });

    test('plan 50%+ under budget returns 30', () => {
      expect(scoreBudget(4, 10)).toBe(30);
    });

    test('plan slightly over budget returns reduced score', () => {
      const score = scoreBudget(11, 10);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(30);
    });

    test('plan 50%+ over budget returns 0', () => {
      expect(scoreBudget(16, 10)).toBe(0);
    });
  });

  describe('scoreTier', () => {
    const mockPlan = (name) => ({ name, diskspace: '10', pricing: { USD: { monthly: 5 } } });

    test('exact tier match returns 25', () => {
      expect(scoreTier(mockPlan('cPanel Starter'), 'entry')).toBe(25);
      expect(scoreTier(mockPlan('WP Plus'), 'mid')).toBe(25);
      expect(scoreTier(mockPlan('Biz Pro'), 'upper')).toBe(25);
    });

    test('higher tier than required returns slightly less', () => {
      expect(scoreTier(mockPlan('WP Plus'), 'entry')).toBe(20);
      expect(scoreTier(mockPlan('Biz Pro'), 'entry')).toBe(15);
    });

    test('lower tier than required returns proportional score', () => {
      const score = scoreTier(mockPlan('cPanel Starter'), 'mid');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(25);
    });
  });

  describe('scoreFreeDomain', () => {
    const mockPlan = (freedomain) => ({ 
      name: 'Test', 
      diskspace: '10', 
      pricing: { USD: { monthly: 5 } },
      freedomain 
    });

    test('not needed returns 15', () => {
      expect(scoreFreeDomain(mockPlan(false), false)).toBe(15);
      expect(scoreFreeDomain(mockPlan(true), false)).toBe(15);
    });

    test('needed and available returns 15', () => {
      expect(scoreFreeDomain(mockPlan(true), true)).toBe(15);
    });

    test('needed but not available returns 0', () => {
      expect(scoreFreeDomain(mockPlan(false), true)).toBe(0);
    });
  });

  describe('calculateConfidence', () => {
    const mockPlan = {
      name: 'WP Mid',
      diskspace: '12',
      freedomain: true,
      pricing: { USD: { monthly: 5.50 } }
    };

    test('perfect match returns 100', () => {
      const perfectPlan = {
        name: 'WP Plus',
        diskspace: '12',
        freedomain: true,
        pricing: { USD: { monthly: 5.50 } }
      };
      const requirements = {
        storage_needed_gb: 12,
        monthly_budget: 5.50,
        minTier: 'mid',
        free_domain: true
      };
      expect(calculateConfidence(perfectPlan, requirements)).toBe(100);
    });

    test('good match returns high score', () => {
      const requirements = {
        storage_needed_gb: 10,
        monthly_budget: 6,
        minTier: 'mid',
        free_domain: true
      };
      const score = calculateConfidence(mockPlan, requirements);
      expect(score).toBeGreaterThan(85);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('partial match returns moderate score', () => {
      const requirements = {
        storage_needed_gb: 20,
        monthly_budget: 4,
        minTier: 'upper',
        free_domain: false
      };
      const score = calculateConfidence(mockPlan, requirements);
      expect(score).toBeGreaterThan(30);
      expect(score).toBeLessThan(80);
    });

    test('poor match returns low score', () => {
      const requirements = {
        storage_needed_gb: 50,
        monthly_budget: 2,
        minTier: 'upper',
        free_domain: false
      };
      const score = calculateConfidence(mockPlan, requirements);
      expect(score).toBeLessThan(50);
    });

    test('score is always between 0 and 100', () => {
      const requirements = {
        storage_needed_gb: 1000,
        monthly_budget: 0.5,
        minTier: 'upper',
        free_domain: true
      };
      const score = calculateConfidence(mockPlan, requirements);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('handles errors gracefully', () => {
      const badPlan = { name: 'Bad', diskspace: 'invalid', pricing: {} };
      const requirements = {
        storage_needed_gb: 10,
        monthly_budget: 5,
        minTier: 'mid',
        free_domain: false
      };
      expect(calculateConfidence(badPlan, requirements)).toBe(0);
    });
  });
});
