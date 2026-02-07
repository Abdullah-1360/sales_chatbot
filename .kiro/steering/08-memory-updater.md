---
inclusion: always
---

# Memory Updater - Project Knowledge Management

## Overview
This steering file guides Kiro to automatically update and maintain project knowledge in a structured JSON file using the MCP Memory Server. This creates a persistent knowledge base that improves over time.

## Knowledge Storage Location
`.kiro/knowledge/project-memory.json`

## Memory Update Triggers

### When to Update Memory
1. **API Limitations Discovered** - Store WHMCS/WHM API quirks
2. **Integration Patterns Established** - Document successful patterns
3. **Bug Fixes Completed** - Record the issue and solution
4. **Performance Optimizations** - Track what worked
5. **Configuration Changes** - Document environment changes
6. **Deployment Procedures** - Update deployment steps
7. **Security Incidents** - Record and remediation steps
8. **Third-Party API Changes** - Track external API updates

## Memory Structure

### Entity Types
```javascript
{
  "entities": [
    {
      "name": "WHMCS API",
      "type": "external_service",
      "observations": [
        "AddOrder API does not support service renewals",
        "Phone number search requires exact normalized format",
        "Invoice generation is async, may take 5-10 seconds",
        "Rate limit: 100 requests per minute per IP"
      ]
    },
    {
      "name": "WHM Server CP1",
      "type": "server",
      "observations": [
        "Primary cPanel shared hosting server",
        "API endpoint: https://cp1.hostbreak.com:2087",
        "Requires root username for API calls",
        "AutoSSL runs daily at 2 AM"
      ]
    },
    {
      "name": "MongoDB Connection",
      "type": "database",
      "observations": [
        "Uses connection pooling with max 10 connections",
        "TTL indexes auto-cleanup after 24 hours",
        "Requires IP whitelist in Atlas",
        "Connection timeout: 30 seconds"
      ]
    }
  ],
  "relations": [
    {
      "from": "WHMCS API",
      "to": "Client Resolution",
      "type": "requires",
      "notes": "Client lookup requires normalized phone numbers"
    },
    {
      "from": "WHM Server CP1",
      "to": "cPanel Credentials",
      "type": "provides",
      "notes": "Credentials resolved from WHMCS client data"
    }
  ]
}
```

## Automatic Memory Updates

### Pattern Recognition
When Kiro encounters these patterns, update memory:

#### 1. API Error Patterns
```javascript
// When this error occurs repeatedly:
"WHMCS API returned: Service renewal not supported"

// Store in memory:
{
  entity: "WHMCS API Limitations",
  observation: "AddOrder endpoint cannot renew existing services. Use manual invoice creation in WHMCS admin panel instead."
}
```

#### 2. Successful Workarounds
```javascript
// When a workaround is implemented:
// Code: Using genInvoices() instead of AddOrder for renewals

// Store in memory:
{
  entity: "Service Renewal Pattern",
  observation: "For service renewals, check for existing unpaid invoices first using findRelatedUnpaidInvoice(). If none exist, wait for WHMCS automatic invoice generation (7-14 days before due date)."
}
```

#### 3. Performance Optimizations
```javascript
// When optimization is applied:
// Code: Added caching to server list with 30-minute TTL

// Store in memory:
{
  entity: "Server Cache Strategy",
  observation: "Server list cached in MongoDB with 30-minute TTL and 24-hour force refresh. Reduces WHM API calls by 95%."
}
```

#### 4. Configuration Discoveries
```javascript
// When configuration requirement is found:
// Issue: WebSocket connection fails on shared hosting

// Store in memory:
{
  entity: "WebSocket Configuration",
  observation: "On cPanel shared hosting, WebSocket requires proxy configuration in .htaccess. Use RewriteRule with [P] flag to proxy WebSocket connections."
}
```

## Memory Update Commands

### Using MCP Memory Server
```javascript
// Create new entity
mcp_memory_create_entities({
  entities: [{
    name: "WHMCS Phone Search",
    entityType: "integration_pattern",
    observations: [
      "Phone numbers must be normalized before search",
      "Use normalizePhone() utility to strip formatting",
      "Format: country code + number (e.g., 923001234567)",
      "Comparison should use phonesMatch() for fuzzy matching"
    ]
  }]
});

// Add observation to existing entity
mcp_memory_add_observations({
  observations: [{
    entityName: "WHMCS API",
    contents: [
      "Ticket attachments must be base64 encoded",
      "Maximum attachment size: 5MB per file"
    ]
  }]
});

// Create relation
mcp_memory_create_relations({
  relations: [{
    from: "WordPress Diagnostic",
    to: "cPanel API",
    relationType: "uses"
  }]
});
```

## Knowledge Categories

### 1. API Integrations
```json
{
  "category": "api_integrations",
  "entities": [
    "WHMCS API",
    "WHM API",
    "cPanel API",
    "VTiger CRM API",
    "MongoDB API"
  ],
  "track": [
    "Authentication methods",
    "Rate limits",
    "Error codes and meanings",
    "Request/response formats",
    "Known limitations",
    "Workarounds"
  ]
}
```

### 2. Server Infrastructure
```json
{
  "category": "servers",
  "entities": [
    "CP1", "CP2", "CP3",
    "PCP1", "PCP2", "PCP3",
    "RCP1", "RCP2"
  ],
  "track": [
    "Server capabilities",
    "API endpoints",
    "Special configurations",
    "Maintenance windows",
    "Known issues"
  ]
}
```

### 3. Deployment Procedures
```json
{
  "category": "deployment",
  "entities": [
    "Production Deployment",
    "Frontend Build",
    "Database Migration",
    "Environment Configuration"
  ],
  "track": [
    "Step-by-step procedures",
    "Common issues",
    "Rollback procedures",
    "Verification steps"
  ]
}
```

### 4. Bug Fixes & Solutions
```json
{
  "category": "bug_fixes",
  "entities": [
    "WebSocket Connection Issues",
    "MongoDB Connection Timeout",
    "WHMCS API Errors",
    "cPanel Authentication Failures"
  ],
  "track": [
    "Problem description",
    "Root cause",
    "Solution implemented",
    "Prevention measures"
  ]
}
```

### 5. Performance Optimizations
```json
{
  "category": "performance",
  "entities": [
    "Caching Strategy",
    "Database Indexes",
    "API Call Reduction",
    "Memory Management"
  ],
  "track": [
    "Optimization technique",
    "Performance impact",
    "Trade-offs",
    "Monitoring metrics"
  ]
}
```

## Memory Maintenance

### Regular Reviews
```javascript
// Monthly: Review and update outdated information
// Quarterly: Archive old bug fixes that are no longer relevant
// Annually: Restructure knowledge base for better organization
```

### Memory Cleanup
```javascript
// Remove obsolete information:
mcp_memory_delete_observations({
  deletions: [{
    entityName: "Old API Pattern",
    observations: ["Deprecated method no longer in use"]
  }]
});

// Remove deprecated entities:
mcp_memory_delete_entities({
  entityNames: ["Removed Server", "Deprecated Integration"]
});
```

## Query Patterns

### Finding Relevant Knowledge
```javascript
// Search for specific topics
mcp_memory_search_nodes({
  query: "WHMCS phone number"
});

// Open specific entities
mcp_memory_open_nodes({
  names: ["WHMCS API", "Phone Normalization"]
});

// Read entire knowledge graph
mcp_memory_read_graph({});
```

## Integration with Development Workflow

### During Development
1. **Before implementing**: Search memory for existing patterns
2. **During implementation**: Note any API quirks or issues
3. **After implementation**: Store successful patterns

### During Debugging
1. **Search memory** for similar issues
2. **Document root cause** when found
3. **Store solution** for future reference

### During Code Review
1. **Check memory** for established patterns
2. **Verify compliance** with known best practices
3. **Update memory** with new insights

## Example Memory Updates

### Example 1: API Limitation
```javascript
// Discovered: WHMCS doesn't support service renewals via API
mcp_memory_create_entities({
  entities: [{
    name: "WHMCS Service Renewal Limitation",
    entityType: "api_limitation",
    observations: [
      "WHMCS AddOrder API cannot renew existing services",
      "Manual invoice creation doesn't properly link to services",
      "Services auto-renew 7-14 days before due date",
      "For immediate renewal: Admin must create invoice in WHMCS panel",
      "Workaround: Check for existing unpaid invoices first"
    ]
  }]
});
```

### Example 2: Performance Optimization
```javascript
// Implemented: Server list caching
mcp_memory_create_entities({
  entities: [{
    name: "Server List Caching",
    entityType: "performance_optimization",
    observations: [
      "Implemented MongoDB caching for WHM server list",
      "Cache TTL: 30 minutes (configurable via SERVER_CACHE_TTL_MINUTES)",
      "Force refresh: 24 hours (configurable via SERVER_FORCE_REFRESH_HOURS)",
      "Reduced WHM API calls by 95%",
      "Improved response time from 2s to 50ms"
    ]
  }]
});
```

### Example 3: Deployment Procedure
```javascript
// Documented: Production deployment steps
mcp_memory_create_entities({
  entities: [{
    name: "Production Deployment Checklist",
    entityType: "procedure",
    observations: [
      "1. Run tests: npm run test",
      "2. Build frontend: cd frontend && npm run build",
      "3. Upload files via SFTP to ~/sales_chatbot",
      "4. SSH and run: npm install --production",
      "5. Update .env with production values",
      "6. Restart: pm2 restart sales-chatbot",
      "7. Verify health: curl https://api.domain.com/api/health",
      "8. Monitor logs: pm2 logs sales-chatbot",
      "9. Test critical endpoints",
      "10. Monitor for 1 hour"
    ]
  }]
});
```

## Benefits of Memory System

1. **Persistent Knowledge** - Information survives across sessions
2. **Pattern Recognition** - Identify recurring issues quickly
3. **Onboarding** - New developers can query knowledge base
4. **Documentation** - Auto-generated from actual experience
5. **Decision Support** - Historical context for technical decisions
6. **Debugging** - Quick access to known issues and solutions

## Best Practices

1. **Be Specific** - Include exact error messages, API endpoints, parameters
2. **Include Context** - Why was this decision made? What was tried?
3. **Update Regularly** - Add observations as you discover them
4. **Link Related Entities** - Create relations between connected concepts
5. **Clean Up** - Remove outdated information periodically
6. **Search First** - Always check memory before implementing
7. **Verify Accuracy** - Ensure stored information is correct and current
