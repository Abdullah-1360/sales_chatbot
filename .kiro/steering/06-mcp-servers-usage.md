---
inclusion: always
---

# MCP Servers Usage Guide

## What are MCP Servers?
Model Context Protocol (MCP) servers extend Kiro's capabilities by providing specialized tools and integrations. This project can benefit from various MCP servers for enhanced development workflows.

## Configuration Location
MCP servers are configured in `.kiro/settings/mcp.json` (workspace-level) or `~/.kiro/settings/mcp.json` (user-level).

## Recommended MCP Servers for This Project

### 1. Context7 Documentation Server
**Purpose**: Access up-to-date documentation for libraries used in the project

**Installation**:
```json
{
  "mcpServers": {
    "context7": {
      "command": "uvx",
      "args": ["mcp-server-context7"],
      "disabled": false,
      "autoApprove": ["resolve_library_id", "query_docs"]
    }
  }
}
```

**Usage Examples**:
```javascript
// When working with Express.js
// Ask: "How do I implement rate limiting in Express 5.x?"
// Context7 will fetch latest Express documentation

// When working with Socket.IO
// Ask: "Show me Socket.IO room management examples"

// When working with Mongoose
// Ask: "How to create TTL indexes in Mongoose?"
```

**Best For**:
- Getting latest API documentation
- Finding code examples for libraries
- Checking breaking changes in library versions
- Understanding best practices for dependencies

### 2. Fetch Server (Web Content)
**Purpose**: Fetch and analyze web content, documentation, and API references

**Installation**:
```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "disabled": false,
      "autoApprove": ["fetch"]
    }
  }
}
```

**Usage Examples**:
```javascript
// Fetch WHMCS API documentation
// "Fetch the latest WHMCS API docs for GetInvoice"

// Check cPanel API changes
// "Fetch cPanel UAPI documentation for Email module"

// Get WHM API reference
// "Fetch WHM API docs for listaccts function"
```

**Best For**:
- Accessing external API documentation
- Checking third-party service updates
- Reading blog posts about integration patterns
- Verifying API endpoint specifications

### 3. Sequential Thinking Server
**Purpose**: Break down complex problems into step-by-step reasoning

**Installation**:
```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "uvx",
      "args": ["mcp-server-sequential-thinking"],
      "disabled": false,
      "autoApprove": ["sequentialthinking"]
    }
  }
}
```

**Usage Examples**:
```javascript
// Complex debugging scenarios
// "Why is the WordPress diagnostic failing intermittently?"

// Architecture decisions
// "Should we cache WHMCS responses in Redis or MongoDB?"

// Performance optimization
// "How can we reduce the number of WHM API calls?"

// Integration planning
// "What's the best way to implement VTiger CRM sync?"
```

**Best For**:
- Debugging complex issues
- Planning architectural changes
- Analyzing performance bottlenecks
- Making technical decisions

### 4. Memory Server (Knowledge Graph)
**Purpose**: Maintain project-specific knowledge and context across sessions

**Installation**:
```json
{
  "mcpServers": {
    "memory": {
      "command": "uvx",
      "args": ["mcp-server-memory"],
      "disabled": false,
      "autoApprove": ["create_entities", "create_relations", "search_nodes"]
    }
  }
}
```

**Usage Examples**:
```javascript
// Store API quirks and gotchas
// "Remember: WHMCS AddOrder doesn't support service renewals"

// Track integration patterns
// "Store the pattern for resolving cPanel credentials"

// Document workarounds
// "Remember the workaround for cPHulk IP unblocking"

// Keep deployment notes
// "Store the production deployment checklist"
```

**Best For**:
- Remembering project-specific patterns
- Tracking API limitations and workarounds
- Storing deployment procedures
- Maintaining institutional knowledge

### 5. Filesystem Server
**Purpose**: Advanced file operations and search capabilities

**Installation**:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "uvx",
      "args": ["mcp-server-filesystem"],
      "disabled": false,
      "autoApprove": ["read_file", "search_files"]
    }
  }
}
```

**Usage Examples**:
```javascript
// Find all WHMCS API calls
// "Search for all files calling whmcsService"

// Locate error handling patterns
// "Find all try-catch blocks in controllers"

// Identify unused code
// "Find functions that are never imported"
```

**Best For**:
- Code search and analysis
- Refactoring assistance
- Finding usage patterns
- Identifying dead code

## Project-Specific MCP Usage Patterns

### Working with WHMCS Integration
```javascript
// 1. Check latest WHMCS API docs
// Use: fetch or context7
// "What are the parameters for WHMCS GetClientsDetails?"

// 2. Debug API issues
// Use: sequential-thinking
// "Why is GetInvoice returning empty results?"

// 3. Remember API quirks
// Use: memory
// "Store: WHMCS phone search requires exact format"
```

### Working with WHM/cPanel
```javascript
// 1. Get API documentation
// Use: fetch
// "Fetch WHM API docs for start_autossl_check"

// 2. Plan complex operations
// Use: sequential-thinking
// "How should we implement WordPress auto-repair?"

// 3. Store server configurations
// Use: memory
// "Remember: CP1 uses port 2087, PCP3 uses custom port"
```

### Frontend Development
```javascript
// 1. React best practices
// Use: context7
// "Show me React 19 useEffect cleanup patterns"

// 2. Socket.IO integration
// Use: context7 or fetch
// "How to handle Socket.IO reconnection in React?"

// 3. Debug WebSocket issues
// Use: sequential-thinking
// "Why are WebSocket events not reaching the frontend?"
```

### Database Operations
```javascript
// 1. MongoDB/Mongoose patterns
// Use: context7
// "How to create compound indexes in Mongoose?"

// 2. Query optimization
// Use: sequential-thinking
// "How can we optimize the chat notification queries?"

// 3. Store schema decisions
// Use: memory
// "Remember: ChatNotification uses 24h TTL index"
```

## Auto-Approval Configuration

### Recommended Auto-Approvals
```json
{
  "mcpServers": {
    "context7": {
      "autoApprove": [
        "resolve_library_id",
        "query_docs"
      ]
    },
    "fetch": {
      "autoApprove": [
        "fetch"
      ]
    },
    "memory": {
      "autoApprove": [
        "search_nodes",
        "read_graph",
        "open_nodes"
      ]
    },
    "sequential-thinking": {
      "autoApprove": [
        "sequentialthinking"
      ]
    }
  }
}
```

### When NOT to Auto-Approve
- `create_entities` - Review before storing knowledge
- `delete_entities` - Prevent accidental data loss
- `write_file` - Review file modifications
- Any destructive operations

## Best Practices

### 1. Use the Right Tool
- **Documentation lookup** → context7 or fetch
- **Complex reasoning** → sequential-thinking
- **Project knowledge** → memory
- **Code search** → filesystem

### 2. Combine MCP Servers
```javascript
// Example workflow:
// 1. Use context7 to understand library API
// 2. Use sequential-thinking to plan implementation
// 3. Use memory to store the pattern for future reference
```

### 3. Keep Memory Organized
```javascript
// Create entities for:
- API limitations and quirks
- Deployment procedures
- Integration patterns
- Performance optimizations
- Security considerations

// Create relations between:
- Services and their dependencies
- APIs and their authentication methods
- Servers and their configurations
```

### 4. Leverage Context7 for Dependencies
```javascript
// Always check latest docs for:
- express (v5.x specific features)
- mongoose (v8.x changes)
- socket.io (v4.x patterns)
- axios (latest best practices)
- react (v19.x hooks)
```

## Troubleshooting MCP Servers

### Server Won't Start
1. Check if `uv` and `uvx` are installed: `uvx --version`
2. Verify JSON syntax in mcp.json
3. Check server logs in Kiro MCP panel
4. Try disabling and re-enabling the server

### Tools Not Available
1. Verify server is running (check MCP panel)
2. Ensure `disabled: false` in configuration
3. Restart Kiro or reconnect server
4. Check for typos in server name

### Performance Issues
1. Limit auto-approvals to frequently used tools
2. Disable unused servers
3. Clear memory server data if too large
4. Use specific queries instead of broad searches

## Integration with Project Workflow

### During Development
1. **Before coding**: Use context7 for API docs
2. **While coding**: Use sequential-thinking for complex logic
3. **After coding**: Use memory to store patterns

### During Debugging
1. **Understand the issue**: Use sequential-thinking
2. **Check documentation**: Use context7 or fetch
3. **Find similar code**: Use filesystem search
4. **Store the solution**: Use memory

### During Code Review
1. **Verify best practices**: Use context7
2. **Check for patterns**: Use filesystem search
3. **Document decisions**: Use memory

## Example MCP Configuration File

```json
{
  "mcpServers": {
    "context7": {
      "command": "uvx",
      "args": ["mcp-server-context7"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "disabled": false,
      "autoApprove": ["resolve_library_id", "query_docs"]
    },
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "disabled": false,
      "autoApprove": ["fetch"]
    },
    "sequential-thinking": {
      "command": "uvx",
      "args": ["mcp-server-sequential-thinking"],
      "disabled": false,
      "autoApprove": ["sequentialthinking"]
    },
    "memory": {
      "command": "uvx",
      "args": ["mcp-server-memory"],
      "disabled": false,
      "autoApprove": ["search_nodes", "read_graph", "open_nodes"]
    }
  }
}
```

## Resources
- MCP Documentation: https://modelcontextprotocol.io
- Available MCP Servers: https://github.com/modelcontextprotocol/servers
- Kiro MCP Guide: Use command palette → "MCP" to find MCP commands
