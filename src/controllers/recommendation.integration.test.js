/**
 * Integration tests for recommendation controller with confidence scoring
 */

const request = require('supertest');
const app = require('../app');

describe('POST /api/recommendations - Integration Tests', () => {
  const validRequest = {
    purpose: 'Blog',
    websites_count: '1',
    tech_stack: 'Linux',
    cms: 'WordPress',
    email_needed: true,
    storage_needed_gb: 10,
    monthly_budget: 6,
    free_domain: true,
    migrate_from_existing_host: false,
    email_deliverability_priority: false
  };

  test('returns recommendations with confidence scores', async () => {
    const response = await request(app)
      .post('/api/recommendations')
      .send(validRequest)
      .expect(200);

    expect(response.body).toHaveProperty('matches');
    expect(Array.isArray(response.body.matches)).toBe(true);
    
    if (response.body.matches.length > 0) {
      response.body.matches.forEach(plan => {
        expect(plan).toHaveProperty('confidence');
        expect(typeof plan.confidence).toBe('number');
        expect(plan.confidence).toBeGreaterThanOrEqual(0);
        expect(plan.confidence).toBeLessThanOrEqual(100);
      });
    }
  });

  test('returns plans sorted by confidence descending', async () => {
    const response = await request(app)
      .post('/api/recommendations')
      .send(validRequest)
      .expect(200);

    const { matches } = response.body;
    
    if (matches.length > 1) {
      for (let i = 0; i < matches.length - 1; i++) {
        expect(matches[i].confidence).toBeGreaterThanOrEqual(matches[i + 1].confidence);
      }
    }
  });

  test('returns maximum 3 plans', async () => {
    const response = await request(app)
      .post('/api/recommendations')
      .send(validRequest)
      .expect(200);

    expect(response.body.matches.length).toBeLessThanOrEqual(3);
  });

  test('maintains backward compatibility with existing fields', async () => {
    const response = await request(app)
      .post('/api/recommendations')
      .send(validRequest)
      .expect(200);

    const { matches } = response.body;
    
    if (matches.length > 0) {
      matches.forEach(plan => {
        // Existing fields should still be present
        expect(plan).toHaveProperty('pid');
        expect(plan).toHaveProperty('gid');
        expect(plan).toHaveProperty('name');
        expect(plan).toHaveProperty('description');
        expect(plan).toHaveProperty('diskspace');
        expect(plan).toHaveProperty('freedomain');
        expect(plan).toHaveProperty('pricing');
        expect(plan).toHaveProperty('link');
        
        // New confidence field
        expect(plan).toHaveProperty('confidence');
      });
    }
  });

  test('handles exact match scenario with high confidence', async () => {
    const exactMatchRequest = {
      ...validRequest,
      storage_needed_gb: 12,
      monthly_budget: 10,
      websites_count: '2-3'
    };

    const response = await request(app)
      .post('/api/recommendations')
      .send(exactMatchRequest)
      .expect(200);

    const { matches } = response.body;
    
    if (matches.length > 0) {
      // At least one plan should have high confidence for good match
      const highConfidencePlans = matches.filter(p => p.confidence >= 80);
      expect(highConfidencePlans.length).toBeGreaterThan(0);
    }
  });

  test('handles nearest neighbor fallback when no exact matches', async () => {
    const hardRequest = {
      ...validRequest,
      storage_needed_gb: 100,
      monthly_budget: 15,
      websites_count: '10+'
    };

    const response = await request(app)
      .post('/api/recommendations')
      .send(hardRequest)
      .expect(200);

    const { matches } = response.body;
    
    // Should either return nearest neighbors or empty array
    expect(Array.isArray(matches)).toBe(true);
    
    if (matches.length > 0) {
      // Nearest neighbors should have confidence >= 40
      matches.forEach(plan => {
        expect(plan.confidence).toBeGreaterThanOrEqual(40);
      });
    }
  });

  test('returns empty array when no viable plans in GID', async () => {
    const impossibleRequest = {
      ...validRequest,
      storage_needed_gb: 10000,
      monthly_budget: 1
    };

    const response = await request(app)
      .post('/api/recommendations')
      .send(impossibleRequest)
      .expect(200);

    expect(response.body.matches).toEqual([]);
  });

  test('handles free domain preference correctly', async () => {
    const freeDomainRequest = {
      ...validRequest,
      free_domain: true,
      monthly_budget: 10
    };

    const response = await request(app)
      .post('/api/recommendations')
      .send(freeDomainRequest)
      .expect(200);

    const { matches } = response.body;
    
    if (matches.length > 0) {
      // Plans with free domain should have higher confidence
      const withDomain = matches.filter(p => p.freedomain);
      const withoutDomain = matches.filter(p => !p.freedomain);
      
      if (withDomain.length > 0 && withoutDomain.length > 0) {
        // Plans with domain should generally rank higher
        expect(withDomain[0].confidence).toBeGreaterThanOrEqual(withoutDomain[0].confidence - 15);
      }
    }
  });

  test('validates request body schema', async () => {
    const invalidRequest = {
      purpose: 'InvalidPurpose',
      websites_count: '1'
    };

    const response = await request(app)
      .post('/api/recommendations')
      .send(invalidRequest)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  test('handles different GID selections correctly', async () => {
    // Test WooCommerce (GID 21)
    const wooRequest = {
      ...validRequest,
      cms: 'WooCommerce',
      storage_needed_gb: 2,
      monthly_budget: 8
    };

    const wooResponse = await request(app)
      .post('/api/recommendations')
      .send(wooRequest)
      .expect(200);

    if (wooResponse.body.matches.length > 0) {
      // Should return WooCommerce plans (GID 21)
      expect(wooResponse.body.matches[0].gid).toBe('21');
    }

    // Test Windows (GID 28)
    const winRequest = {
      ...validRequest,
      tech_stack: 'Windows',
      cms: 'None',
      storage_needed_gb: 5,
      monthly_budget: 8
    };

    const winResponse = await request(app)
      .post('/api/recommendations')
      .send(winRequest)
      .expect(200);

    if (winResponse.body.matches.length > 0) {
      // Should return Windows plans (GID 28)
      expect(winResponse.body.matches[0].gid).toBe('28');
    }
  });

  test('confidence scores reflect storage match quality', async () => {
    const storageRequest = {
      ...validRequest,
      storage_needed_gb: 10,
      monthly_budget: 20
    };

    const response = await request(app)
      .post('/api/recommendations')
      .send(storageRequest)
      .expect(200);

    const { matches } = response.body;
    
    if (matches.length > 1) {
      // Plans closer to required storage should have better confidence
      matches.forEach(plan => {
        const storage = parseFloat(plan.diskspace);
        if (storage >= storageRequest.storage_needed_gb) {
          expect(plan.confidence).toBeGreaterThan(0);
        }
      });
    }
  });
});
