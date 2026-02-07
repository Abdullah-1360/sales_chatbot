---
inclusion: always
---

# Testing & Debugging Guidelines

## Testing Strategy

### Test Pyramid
```
    /\
   /  \    E2E Tests (Few)
  /____\   
 /      \  Integration Tests (Some)
/________\ 
Unit Tests (Many)
```

### Test Locations
- Unit tests: Co-located with source files (`*.test.js`)
- Integration tests: `/src/test/` directory
- E2E tests: `/src/test/` directory with descriptive names

## Unit Testing

### Jest Configuration
```javascript
// package.json
{
  "jest": {
    "testEnvironment": "node",
    "setupFilesAfterEnv": ["<rootDir>/src/test/setup.js"],
    "testTimeout": 30000
  }
}
```

### Writing Unit Tests
```javascript
// src/services/confidenceScorer.test.js
const { calculateConfidence } = require('./confidenceScorer');

describe('confidenceScorer', () => {
  describe('calculateConfidence', () => {
    it('should return high confidence for exact matches', () => {
      const result = calculateConfidence({
        exactMatch: true,
        partialMatch: false
      });
      
      expect(result.score).toBeGreaterThan(0.8);
      expect(result.confidence).toBe('high');
    });
    
    it('should return low confidence for no matches', () => {
      const result = calculateConfidence({
        exactMatch: false,
        partialMatch: false
      });
      
      expect(result.score).toBeLessThan(0.3);
      expect(result.confidence).toBe('low');
    });
  });
});
```

### Mocking External Services
```javascript
// Mock WHMCS service
jest.mock('../services/whmcsService', () => ({
  getClients: jest.fn(),
  getInvoice: jest.fn(),
  openTicket: jest.fn()
}));

const { getClients } = require('../services/whmcsService');

// In test
getClients.mockResolvedValue({
  result: 'success',
  clients: { client: [{ id: 1, firstname: 'John' }] }
});
```

## Integration Testing

### API Endpoint Testing
```javascript
// src/test/api.test.js
const request = require('supertest');
const app = require('../app');

describe('API Endpoints', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('mongodb');
    });
  });
  
  describe('POST /api/clients/search', () => {
    it('should search clients by phone', async () => {
      const response = await request(app)
        .post('/api/clients/search')
        .send({ phone: '+92 300 1234567' })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toBeInstanceOf(Array);
    });
    
    it('should return 400 for invalid phone', async () => {
      const response = await request(app)
        .post('/api/clients/search')
        .send({ phone: 'invalid' })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
    });
  });
});
```

### Database Testing
```javascript
// src/test/database.test.js
const mongoose = require('mongoose');
const Chat = require('../models/Chat');

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_TEST_URI);
});

afterAll(async () => {
  await mongoose.connection.close();
});

afterEach(async () => {
  await Chat.deleteMany({});
});

describe('Chat Model', () => {
  it('should create a chat', async () => {
    const chat = await Chat.create({
      chatId: 'test123',
      message: 'Test message',
      userId: 'user1'
    });
    
    expect(chat.chatId).toBe('test123');
    expect(chat.message).toBe('Test message');
  });
  
  it('should enforce required fields', async () => {
    await expect(Chat.create({})).rejects.toThrow();
  });
});
```

## Manual Testing

### Test Scripts Location
`/src/test/` contains manual test scripts:
- `test-client-resolution.js` - Test client lookup
- `test-invoice-matching.js` - Test invoice matching
- `test-ticket-creation.js` - Test ticket creation
- `test-whm-integration.js` - Test WHM API calls

### Running Manual Tests
```bash
# Test client resolution
node src/test/test-client-resolution.js

# Test with specific phone number
node src/test/find-client-id.js "+92 300 1234567"

# Test invoice matching
node src/test/test-invoice-matching.js

# Test WHM integration
node src/test/test-whm-integration.js
```

### Creating Test Scripts
```javascript
// src/test/test-my-feature.js
require('dotenv').config();
const { myFunction } = require('../services/myService');

async function test() {
  console.log('Testing myFunction...');
  
  try {
    const result = await myFunction('test-input');
    console.log('✓ Success:', result);
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
}

test();
```

## Debugging Techniques

### Console Logging Best Practices
```javascript
// ✅ Good - Contextual logging
console.log('[ServiceName] Action:', { param1, param2 });

// ✅ Good - Error logging with context
console.error('[functionName] Error:', error.message, { context });

// ❌ Bad - Generic logging
console.log('error', error);

// ❌ Bad - Logging sensitive data
console.log('Password:', password); // Never do this!
```

### Winston Logger Usage
```javascript
const logger = require('../utils/logger');

// Different log levels
logger.error('Critical error occurred', { error, context });
logger.warn('Potential issue detected', { details });
logger.info('Important event', { data });
logger.debug('Detailed debug info', { verbose });

// Log with metadata
logger.info('User action', {
  userId: user.id,
  action: 'login',
  timestamp: new Date()
});
```

### Debugging WHMCS API Calls
```javascript
// Enable detailed logging
const result = await callApi('GetInvoice', { invoiceid: 123 });
console.log('[WHMCS] Request:', { action: 'GetInvoice', params: { invoiceid: 123 } });
console.log('[WHMCS] Response:', JSON.stringify(result, null, 2));

// Check for errors
if (result.result === 'error') {
  console.error('[WHMCS] API Error:', result.message);
  console.error('[WHMCS] Full response:', result);
}
```

### Debugging WHM API Calls
```javascript
// Log WHM requests
console.log('[WHM] Calling:', { server, function: 'listaccts', params });

try {
  const result = await callWhmApi(server, 'listaccts', params);
  console.log('[WHM] Success:', { accountCount: result.data?.acct?.length });
} catch (error) {
  console.error('[WHM] Error:', {
    server,
    function: 'listaccts',
    error: error.message,
    code: error.code
  });
}
```

### Debugging WebSocket Issues
```javascript
// Backend
io.on('connection', (socket) => {
  console.log('[WebSocket] Client connected:', {
    id: socket.id,
    address: socket.handshake.address
  });
  
  socket.on('error', (error) => {
    console.error('[WebSocket] Socket error:', error);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('[WebSocket] Client disconnected:', {
      id: socket.id,
      reason
    });
  });
});

// Frontend
socket.on('connect', () => {
  console.log('[WebSocket] Connected:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('[WebSocket] Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('[WebSocket] Disconnected:', reason);
});
```

### Debugging MongoDB Issues
```javascript
// Enable Mongoose debug mode
mongoose.set('debug', true);

// Log queries
const query = Chat.find({ userId: 'user1' });
console.log('[MongoDB] Query:', query.getQuery());

// Check connection status
console.log('[MongoDB] Connection state:', mongoose.connection.readyState);
// 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting

// Handle connection errors
mongoose.connection.on('error', (error) => {
  console.error('[MongoDB] Connection error:', error);
});
```

## Common Issues & Solutions

### Issue: WHMCS API Returns Empty Results
```javascript
// Debug steps:
1. Log the exact request parameters
2. Check if phone number is normalized
3. Verify API credentials are correct
4. Test with WHMCS admin panel search
5. Check WHMCS API logs

// Solution:
const normalized = normalizePhone(phone);
console.log('[Debug] Original:', phone, 'Normalized:', normalized);
const result = await getClients({ search: normalized });
```

### Issue: WHM API Authentication Fails
```javascript
// Debug steps:
1. Verify API key exists for server
2. Check server name matches environment variable
3. Test API key in WHM directly
4. Verify SSL settings

// Solution:
const apiKey = process.env[`WHM_API_KEY_${serverName.toUpperCase()}`];
if (!apiKey) {
  throw new Error(`No API key configured for server: ${serverName}`);
}
console.log('[Debug] Using API key for:', serverName);
```

### Issue: MongoDB Connection Timeout
```javascript
// Debug steps:
1. Check MongoDB URI format
2. Verify IP whitelist in Atlas
3. Test connection with mongo shell
4. Check network connectivity

// Solution:
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
}).catch(error => {
  console.error('[MongoDB] Connection failed:', error.message);
  console.error('[MongoDB] URI format:', process.env.MONGODB_URI.replace(/:[^:]*@/, ':***@'));
});
```

### Issue: WebSocket Not Connecting
```javascript
// Debug steps:
1. Check CORS configuration
2. Verify WebSocket URL is correct
3. Check firewall/proxy settings
4. Test with Socket.IO test client

// Solution:
// Backend
const io = socketIO(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Frontend
const socket = io(WS_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true
});
```

## Performance Debugging

### Measuring Response Times
```javascript
const start = Date.now();
const result = await expensiveOperation();
const duration = Date.now() - start;
console.log('[Performance] Operation took:', duration, 'ms');

if (duration > 1000) {
  console.warn('[Performance] Slow operation detected:', {
    operation: 'expensiveOperation',
    duration,
    threshold: 1000
  });
}
```

### Memory Leak Detection
```javascript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('[Memory]', {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB'
  });
}, 60000); // Every minute
```

### Database Query Performance
```javascript
// Log slow queries
const start = Date.now();
const results = await Chat.find({ userId }).lean();
const duration = Date.now() - start;

if (duration > 100) {
  console.warn('[MongoDB] Slow query:', {
    collection: 'chats',
    query: { userId },
    duration,
    resultCount: results.length
  });
}
```

## Testing Checklist

### Before Committing
- [ ] All tests pass: `npm test`
- [ ] No console errors in browser
- [ ] No linting errors: `npm run lint`
- [ ] Manual testing of changed features
- [ ] Check for sensitive data in logs

### Before Deploying
- [ ] All integration tests pass
- [ ] Manual testing in staging environment
- [ ] Performance testing for critical paths
- [ ] Security testing (API authentication, CORS)
- [ ] Database migrations tested
- [ ] Rollback procedure tested

### After Deploying
- [ ] Health check endpoint responds
- [ ] Critical features work in production
- [ ] Monitor logs for errors
- [ ] Check performance metrics
- [ ] Verify WebSocket connections
- [ ] Test WHMCS/WHM integrations
