/**
 * Integration tests for leads controller
 */

const request = require('supertest');
const app = require('../app');
const Lead = require('../models/Lead');
const mongoose = require('mongoose');

describe('GET /api/leads - Integration Tests', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sales_chatbot_test';
      await mongoose.connect(mongoUri);
    }
  });

  beforeEach(async () => {
    // Clear leads collection before each test
    await Lead.deleteMany({});
  });

  afterAll(async () => {
    // Clean up and close connection
    await Lead.deleteMany({});
    await mongoose.connection.close();
  });

  test('returns empty array when no leads exist', async () => {
    const response = await request(app)
      .get('/api/leads')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('leads');
    expect(response.body.leads).toEqual([]);
    expect(response.body).toHaveProperty('total', 0);
  });

  test('returns leads sorted by creation date descending', async () => {
    // Create test leads with different timestamps
    const lead1 = await Lead.create({
      vtigerId: 'vtiger1',
      firstname: 'John',
      lastname: 'Doe',
      email: 'john@example.com',
      phone: '1234567890',
      description: 'Test lead 1',
      createdAt: new Date('2024-01-01')
    });

    const lead2 = await Lead.create({
      vtigerId: 'vtiger2',
      firstname: 'Jane',
      lastname: 'Smith',
      email: 'jane@example.com',
      phone: '0987654321',
      description: 'Test lead 2',
      createdAt: new Date('2024-01-02')
    });

    const lead3 = await Lead.create({
      vtigerId: 'vtiger3',
      firstname: 'Bob',
      lastname: 'Johnson',
      email: 'bob@example.com',
      phone: '5555555555',
      description: 'Test lead 3',
      createdAt: new Date('2024-01-03')
    });

    const response = await request(app)
      .get('/api/leads')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.leads).toHaveLength(3);
    expect(response.body.total).toBe(3);

    // Verify descending order (newest first)
    expect(response.body.leads[0].email).toBe('bob@example.com');
    expect(response.body.leads[1].email).toBe('jane@example.com');
    expect(response.body.leads[2].email).toBe('john@example.com');
  });

  test('returns leads with correct structure', async () => {
    await Lead.create({
      vtigerId: 'vtiger123',
      firstname: 'Test',
      lastname: 'User',
      email: 'test@example.com',
      phone: '1112223333',
      description: 'Test description',
      source: 'Chatbot'
    });

    const response = await request(app)
      .get('/api/leads')
      .expect(200);

    const lead = response.body.leads[0];
    expect(lead).toHaveProperty('id');
    expect(lead).toHaveProperty('vtigerId', 'vtiger123');
    expect(lead).toHaveProperty('firstname', 'Test');
    expect(lead).toHaveProperty('lastname', 'User');
    expect(lead).toHaveProperty('email', 'test@example.com');
    expect(lead).toHaveProperty('phone', '1112223333');
    expect(lead).toHaveProperty('description', 'Test description');
    expect(lead).toHaveProperty('source', 'Chatbot');
    expect(lead).toHaveProperty('createdAt');
  });

  test('supports pagination with limit parameter', async () => {
    // Create 5 test leads
    for (let i = 1; i <= 5; i++) {
      await Lead.create({
        vtigerId: `vtiger${i}`,
        firstname: `User${i}`,
        lastname: 'Test',
        email: `user${i}@example.com`,
        createdAt: new Date(Date.now() + i * 1000)
      });
    }

    const response = await request(app)
      .get('/api/leads?limit=3')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.leads).toHaveLength(3);
    expect(response.body.total).toBe(5);
    expect(response.body.limit).toBe(3);
    expect(response.body.offset).toBe(0);
  });

  test('supports pagination with offset parameter', async () => {
    // Create 5 test leads
    for (let i = 1; i <= 5; i++) {
      await Lead.create({
        vtigerId: `vtiger${i}`,
        firstname: `User${i}`,
        lastname: 'Test',
        email: `user${i}@example.com`,
        createdAt: new Date(Date.now() + i * 1000)
      });
    }

    const response = await request(app)
      .get('/api/leads?limit=2&offset=2')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.leads).toHaveLength(2);
    expect(response.body.total).toBe(5);
    expect(response.body.limit).toBe(2);
    expect(response.body.offset).toBe(2);
  });

  test('uses default limit of 50 when not specified', async () => {
    const response = await request(app)
      .get('/api/leads')
      .expect(200);

    expect(response.body.limit).toBe(50);
    expect(response.body.offset).toBe(0);
  });

  test('rejects invalid limit values', async () => {
    const response1 = await request(app)
      .get('/api/leads?limit=0')
      .expect(400);

    expect(response1.body.success).toBe(false);
    expect(response1.body.error).toContain('limit must be between 1 and 100');

    const response2 = await request(app)
      .get('/api/leads?limit=101')
      .expect(400);

    expect(response2.body.success).toBe(false);
    expect(response2.body.error).toContain('limit must be between 1 and 100');
  });

  test('rejects negative offset values', async () => {
    const response = await request(app)
      .get('/api/leads?offset=-1')
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('offset must be non-negative');
  });

  test('handles large offset gracefully', async () => {
    await Lead.create({
      vtigerId: 'vtiger1',
      firstname: 'Test',
      lastname: 'User',
      email: 'test@example.com'
    });

    const response = await request(app)
      .get('/api/leads?offset=100')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.leads).toHaveLength(0);
    expect(response.body.total).toBe(1);
  });
});
