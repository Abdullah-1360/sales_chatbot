---
inclusion: always
---

# Coding Standards & Best Practices

## Module System
- **Backend**: CommonJS (`require`/`module.exports`) - DO NOT convert to ES modules
- **Frontend**: ES Modules (`import`/`export`)
- Never mix module systems within the same environment

## Code Style

### JavaScript Conventions
- Use `const` by default, `let` when reassignment needed, avoid `var`
- Prefer arrow functions for callbacks and short functions
- Use async/await over raw promises
- Destructure objects and arrays when it improves readability
- Use template literals for string interpolation

### Naming Conventions
- **Files**: camelCase for modules (e.g., `whmcsService.js`)
- **Classes/Models**: PascalCase (e.g., `ChatNotification`)
- **Functions/Variables**: camelCase (e.g., `getUserInvoices`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `WHMCS_API_URL`)
- **Private functions**: Prefix with underscore (e.g., `_validateInput`)

### Function Design
- Keep functions small and focused (single responsibility)
- Limit parameters to 3-4; use options object for more
- Return early to reduce nesting
- Validate inputs at function entry
- Document complex logic with comments

### Error Handling
```javascript
// Always use try-catch for async operations
try {
  const result = await externalService.call();
  return result;
} catch (error) {
  console.error('[Context] Error description:', error);
  throw new Error('User-friendly message');
}
```

### Logging Standards
- Use Winston logger from `src/utils/logger.js`
- Log levels: ERROR (production issues), WARN (potential issues), INFO (key events), DEBUG (detailed flow)
- Include context in brackets: `console.log('[ServiceName] Action:', data)`
- Never log sensitive data (passwords, API keys, full credit cards)
- Mask phone numbers using `maskPhone()` utility

## API Design

### Controller Pattern (Thin Controllers)
```javascript
exports.actionName = async (req, res, next) => {
  console.log('[POST /api/endpoint]', { relevantParams });
  
  try {
    // 1. Extract and validate input
    const { param1, param2 } = req.body;
    
    // 2. Call service layer
    const result = await serviceName.doWork(param1, param2);
    
    // 3. Return response
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[actionName] Error:', error);
    next(error); // Pass to error handler
  }
};
```

### Service Pattern (Thick Services)
- All business logic lives in services
- Services should be reusable and testable
- Services can call other services
- Keep external API calls in services, not controllers

### Response Format
```javascript
// Success
{ success: true, data: {...}, message: "Optional message" }

// Error
{ success: false, error: "Error message", code: "ERROR_CODE" }
```

## Database Patterns

### MongoDB (Mongoose)
- Define schemas in `/src/models`
- Use indexes for frequently queried fields
- Implement TTL indexes for auto-cleanup (chats, notifications)
- Use lean queries when you don't need Mongoose documents
- Always handle connection errors

### MySQL (WHMCS Database)
- **READ-ONLY** access recommended
- Use parameterized queries to prevent SQL injection
- Close connections properly
- Cache results when appropriate

## Security Best Practices
- Never commit `.env` files
- Validate all user inputs (use Joi for complex validation)
- Sanitize data before database queries
- Use helmet middleware for HTTP headers
- Implement rate limiting for public endpoints
- Mask sensitive data in logs and responses
- Use HTTPS in production
- Validate CORS origins strictly

## Performance Guidelines
- Use caching (node-cache, MongoDB) for expensive operations
- Implement pagination for large datasets
- Use compression middleware
- Avoid N+1 queries
- Use connection pooling for databases
- Set appropriate cache TTLs
- Monitor memory usage on shared hosting

## Testing Standards
- Write tests for critical business logic
- Use Jest for unit and integration tests
- Mock external services (WHMCS, WHM, VTiger)
- Test error scenarios, not just happy paths
- Keep test files in `/src/test` or co-located with `*.test.js`
