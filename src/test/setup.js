/**
 * Test setup - runs before all tests
 */

// Disable MongoDB for unit tests by default
process.env.USE_MONGODB = 'false';

const { connectDB } = require('../config/database');

beforeAll(async () => {
  // Only connect to MongoDB if explicitly enabled for integration tests
  if (process.env.TEST_WITH_MONGODB === 'true') {
    try {
      await connectDB();
    } catch (error) {
      console.warn('MongoDB connection failed in tests, will use fallback');
    }
  }
});

afterAll(async () => {
  // Close MongoDB connection after tests
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});
