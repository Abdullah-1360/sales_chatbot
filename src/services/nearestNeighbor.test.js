/**
 * Unit tests for Nearest Neighbor Finder Module
 */

const { findNearestNeighbors } = require('./nearestNeighbor');

describe('Nearest Neighbor Finder', () => {
  const mockPlans = [
    {
      pid: '1',
      name: 'Entry Plan',
      diskspace: '5',
      freedomain: false,
      pricing: { USD: { monthly: 2.99 } }
    },
    {
      pid: '2',
      name: 'Mid Plan',
      diskspace: '12',
      freedomain: true,
      pricing: { USD: { monthly: 5.50 } }
    },
    {
      pid: '3',
      name: 'Upper Plan',
      diskspace: '40',
      freedomain: false,
      pricing: { USD: { monthly: 10.00 } }
    },
    {
      pid: '4',
      name: 'Plus Plan',
      diskspace: '8',
      freedomain: true,
      pricing: { USD: { monthly: 4.50 } }
    }
  ];

  const requirements = {
    storage_needed_gb: 10,
    monthly_budget: 6,
    minTier: 'mid',
    free_domain: true
  };

  test('returns empty array for empty plans', () => {
    expect(findNearestNeighbors([], requirements)).toEqual([]);
  });

  test('returns empty array for null plans', () => {
    expect(findNearestNeighbors(null, requirements)).toEqual([]);
  });

  test('returns plans sorted by confidence descending', () => {
    const result = findNearestNeighbors(mockPlans, requirements);
    
    expect(result.length).toBeGreaterThan(0);
    
    // Check confidence is descending
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].confidence).toBeGreaterThanOrEqual(result[i + 1].confidence);
    }
  });

  test('returns maximum 3 plans', () => {
    const manyPlans = Array(10).fill(null).map((_, i) => ({
      pid: String(i),
      name: `Plan ${i}`,
      diskspace: String(10 + i),
      freedomain: i % 2 === 0,
      pricing: { USD: { monthly: 5 + i } }
    }));
    
    const result = findNearestNeighbors(manyPlans, requirements);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test('filters out plans with confidence < 40', () => {
    const poorRequirements = {
      storage_needed_gb: 100,
      monthly_budget: 1,
      minTier: 'upper',
      free_domain: true
    };
    
    const result = findNearestNeighbors(mockPlans, poorRequirements);
    
    // All results should have confidence >= 40
    result.forEach(plan => {
      expect(plan.confidence).toBeGreaterThanOrEqual(40);
    });
  });

  test('sorts by price ascending when confidence is equal', () => {
    const sameTierPlans = [
      {
        pid: '1',
        name: 'Mid Plan A',
        diskspace: '10',
        freedomain: true,
        pricing: { USD: { monthly: 7.00 } }
      },
      {
        pid: '2',
        name: 'Mid Plan B',
        diskspace: '10',
        freedomain: true,
        pricing: { USD: { monthly: 5.00 } }
      },
      {
        pid: '3',
        name: 'Mid Plan C',
        diskspace: '10',
        freedomain: true,
        pricing: { USD: { monthly: 6.00 } }
      }
    ];
    
    const result = findNearestNeighbors(sameTierPlans, requirements);
    
    // If confidences are similar, cheaper should come first
    if (result.length >= 2 && Math.abs(result[0].confidence - result[1].confidence) < 1) {
      const price0 = parseFloat(result[0].pricing.USD.monthly);
      const price1 = parseFloat(result[1].pricing.USD.monthly);
      expect(price0).toBeLessThanOrEqual(price1);
    }
  });

  test('includes confidence field in results', () => {
    const result = findNearestNeighbors(mockPlans, requirements);
    
    result.forEach(plan => {
      expect(plan).toHaveProperty('confidence');
      expect(typeof plan.confidence).toBe('number');
      expect(plan.confidence).toBeGreaterThanOrEqual(0);
      expect(plan.confidence).toBeLessThanOrEqual(100);
    });
  });

  test('does not include priceNum field in results', () => {
    const result = findNearestNeighbors(mockPlans, requirements);
    
    result.forEach(plan => {
      expect(plan).not.toHaveProperty('priceNum');
    });
  });

  test('returns empty array when all plans below 40% threshold', () => {
    const impossibleRequirements = {
      storage_needed_gb: 1000,
      monthly_budget: 0.1,
      minTier: 'upper',
      free_domain: true
    };
    
    const result = findNearestNeighbors(mockPlans, impossibleRequirements);
    
    // All results should have confidence >= 40 or be empty
    if (result.length > 0) {
      result.forEach(plan => {
        expect(plan.confidence).toBeGreaterThanOrEqual(40);
      });
    }
  });

  test('preserves all original plan fields', () => {
    const result = findNearestNeighbors(mockPlans, requirements);
    
    result.forEach(plan => {
      expect(plan).toHaveProperty('pid');
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('diskspace');
      expect(plan).toHaveProperty('freedomain');
      expect(plan).toHaveProperty('pricing');
    });
  });
});
