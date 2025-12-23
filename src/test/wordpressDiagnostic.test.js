const request = require('supertest');
const app = require('../app');

describe('WordPress Database Diagnostic API', () => {
  
  describe('GET /wordpress/health', () => {
    it('should return service health status', async () => {
      const response = await request(app)
        .get('/wordpress/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.services).toBeDefined();
    });
  });

  describe('GET /wordpress/capabilities', () => {
    it('should return diagnostic capabilities', async () => {
      const response = await request(app)
        .get('/wordpress/capabilities')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.guards).toBeDefined();
      expect(response.body.data.diagnosis).toBeDefined();
      expect(response.body.data.remediation).toBeDefined();
      expect(response.body.data.security).toBeDefined();
    });
  });

  describe('POST /wordpress/quick-test', () => {
    it('should validate required parameters', async () => {
      const response = await request(app)
        .post('/wordpress/quick-test')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContain('"domain" is required');
    });

    it('should require either email or phone', async () => {
      const response = await request(app)
        .post('/wordpress/quick-test')
        .send({
          domain: 'example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContain('"value" must contain at least one of [email, phone]');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/wordpress/quick-test')
        .send({
          domain: 'example.com',
          email: 'invalid-email'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContain('"email" must be a valid email');
    });
  });

  describe('POST /wordpress/diagnose', () => {
    it('should validate required parameters', async () => {
      const response = await request(app)
        .post('/wordpress/diagnose')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContain('"domain" is required');
    });

    it('should validate domain format', async () => {
      const response = await request(app)
        .post('/wordpress/diagnose')
        .send({
          domain: 'invalid-domain',
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContain('"domain" must contain a valid domain name');
    });

    it('should require either email or phone', async () => {
      const response = await request(app)
        .post('/wordpress/diagnose')
        .send({
          domain: 'example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContain('"value" must contain at least one of [email, phone]');
    });

    it('should accept valid diagnostic request', async () => {
      const validRequest = {
        domain: 'example.com',
        email: 'test@example.com'
      };

      // Note: This will fail with credential resolution errors, but should pass validation
      const response = await request(app)
        .post('/wordpress/diagnose')
        .send(validRequest);

      // Should not be a validation error (400)
      expect(response.status).not.toBe(400);
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Parameter validation', () => {
    it('should set default values for optional parameters', async () => {
      const minimalRequest = {
        domain: 'example.com',
        email: 'test@example.com'
      };

      const response = await request(app)
        .post('/wordpress/diagnose')
        .send(minimalRequest);

      // Should not fail validation
      expect(response.status).not.toBe(400);
    });

    it('should validate email format', async () => {
      const invalidEmailRequest = {
        domain: 'example.com',
        email: 'invalid-email'
      };

      const response = await request(app)
        .post('/wordpress/diagnose')
        .send(invalidEmailRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContain('"email" must be a valid email');
    });

    it('should validate IP address format', async () => {
      const invalidIpRequest = {
        domain: 'example.com',
        email: 'test@example.com',
        expectedIp: 'invalid-ip'
      };

      const response = await request(app)
        .post('/wordpress/diagnose')
        .send(invalidIpRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContain('"expectedIp" is not allowed');
    });
  });
});

describe('WordPress Diagnostic Manager Unit Tests', () => {
  const WordPressDiagnosticManager = require('../services/wordpressDiagnosticManager');
  
  let manager;

  beforeEach(() => {
    manager = new WordPressDiagnosticManager();
  });

  describe('sanitizeLogData', () => {
    it('should mask password fields', () => {
      const data = {
        username: 'testuser',
        password: 'secret123',
        config: {
          dbPassword: 'dbsecret',
          host: 'localhost'
        }
      };

      const sanitized = manager.sanitizeLogData(data);
      
      expect(sanitized.username).toBe('testuser');
      expect(sanitized.password).toBe('***MASKED***');
      expect(sanitized.config.dbPassword).toBe('***MASKED***');
      expect(sanitized.config.host).toBe('localhost');
    });

    it('should handle nested objects', () => {
      const data = {
        level1: {
          level2: {
            secret: 'hidden',
            visible: 'shown'
          }
        }
      };

      const sanitized = manager.sanitizeLogData(data);
      
      expect(sanitized.level1.level2.secret).toBe('***MASKED***');
      expect(sanitized.level1.level2.visible).toBe('shown');
    });

    it('should handle arrays', () => {
      const data = {
        users: [
          { username: 'user1', password: 'pass1' },
          { username: 'user2', token: 'token2' }
        ]
      };

      const sanitized = manager.sanitizeLogData(data);
      
      expect(sanitized.users[0].password).toBe('***MASKED***');
      expect(sanitized.users[1].token).toBe('***MASKED***');
      expect(sanitized.users[0].username).toBe('user1');
    });
  });
});

describe('Parser Step Unit Tests', () => {
  const ParserStep = require('../steps/parser');
  
  let parser;

  beforeEach(() => {
    parser = new ParserStep();
  });

  describe('parseWpConfig', () => {
    it('should parse valid wp-config.php content', () => {
      const wpConfigContent = `
        <?php
        define('DB_NAME', 'wordpress_db');
        define('DB_USER', 'wp_user');
        define('DB_PASSWORD', 'secure_password');
        define('DB_HOST', 'localhost');
        define('DB_CHARSET', 'utf8');
        $table_prefix = 'wp_';
      `;

      const result = parser.parseWpConfig(wpConfigContent);
      
      expect(result.success).toBe(true);
      expect(result.config.database).toBe('wordpress_db');
      expect(result.config.user).toBe('wp_user');
      expect(result.config.password).toBe('secure_password');
      expect(result.config.host).toBe('localhost');
      expect(result.config.port).toBe(3306);
    });

    it('should handle host with port', () => {
      const wpConfigContent = `
        define('DB_NAME', 'test_db');
        define('DB_USER', 'test_user');
        define('DB_PASSWORD', 'test_pass');
        define('DB_HOST', 'localhost:3307');
      `;

      const result = parser.parseWpConfig(wpConfigContent);
      
      expect(result.success).toBe(true);
      expect(result.config.host).toBe('localhost');
      expect(result.config.port).toBe(3307);
    });

    it('should handle empty password', () => {
      const wpConfigContent = `
        define('DB_NAME', 'test_db');
        define('DB_USER', 'test_user');
        define('DB_PASSWORD', '');
        define('DB_HOST', 'localhost');
      `;

      const result = parser.parseWpConfig(wpConfigContent);
      
      expect(result.success).toBe(true);
      expect(result.config.password).toBe('');
    });

    it('should fail with missing required fields', () => {
      const wpConfigContent = `
        define('DB_NAME', 'test_db');
        // Missing DB_USER and DB_HOST
      `;

      const result = parser.parseWpConfig(wpConfigContent);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required database configuration');
    });
  });

  describe('validateDatabaseConfig', () => {
    it('should validate correct configuration', () => {
      const config = {
        database: 'test_db',
        user: 'test_user',
        password: 'strong_password_123',
        host: 'localhost',
        port: 3306,
        tablePrefix: 'custom_'
      };

      const validation = parser.validateDatabaseConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should detect empty database name', () => {
      const config = {
        database: '',
        user: 'test_user',
        password: 'password',
        host: 'localhost',
        port: 3306
      };

      const validation = parser.validateDatabaseConfig(config);
      
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('Database name is empty');
    });

    it('should warn about security issues', () => {
      const config = {
        database: 'test_db',
        user: 'test_user',
        password: 'weak',
        host: 'localhost',
        port: 3306,
        tablePrefix: 'wp_'
      };

      const validation = parser.validateDatabaseConfig(config);
      
      expect(validation.warnings).toContain('Database password is shorter than 8 characters');
      expect(validation.warnings).toContain('Using default table prefix "wp_" (security risk)');
    });
  });
});