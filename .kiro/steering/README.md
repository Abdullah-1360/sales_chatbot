# Steering Files Documentation

## Overview
This directory contains comprehensive steering files that guide Kiro AI in understanding and working with the Sales Chatbot & WHMCS Integration Platform project.

## What are Steering Files?
Steering files provide context, best practices, and project-specific knowledge to Kiro. They help ensure consistent, high-quality code and adherence to project standards.

## File Structure

### Core Steering Files

#### 00-project-overview.md
**Inclusion**: Always  
**Purpose**: High-level project architecture and tech stack overview

**Contains**:
- Project architecture description
- Technology stack (Node.js, Express, React, MongoDB, Socket.IO)
- Core business domains
- Project structure
- Key integration points
- Environment information

**When to reference**: Starting any new task, understanding project context

---

#### 01-coding-standards.md
**Inclusion**: Always  
**Purpose**: Code style, conventions, and best practices

**Contains**:
- Module system guidelines (CommonJS vs ES Modules)
- JavaScript conventions
- Naming conventions
- Function design principles
- Error handling patterns
- Logging standards
- API design patterns
- Database patterns
- Security best practices
- Performance guidelines
- Testing standards

**When to reference**: Writing any code, code reviews, refactoring

---

#### 02-whmcs-integration.md
**Inclusion**: Always  
**Purpose**: WHMCS API integration guidelines

**Contains**:
- WHMCS API configuration
- Core API functions
- API call patterns
- Important limitations (service renewals, etc.)
- Client resolution strategies
- Phone number handling
- Caching strategy
- Error handling
- Product Group IDs (GIDs)
- Common pitfalls

**When to reference**: Working with WHMCS API, billing features, client management

---

#### 03-whm-cpanel-integration.md
**Inclusion**: Always  
**Purpose**: WHM/cPanel server management guidelines

**Contains**:
- WHM API configuration
- Server naming conventions
- cPanel library usage
- Credential resolution
- WordPress diagnostics
- MySQL management
- Security (cPHulk, CSF)
- Server cache management
- SSH operations
- Common operations
- Troubleshooting

**When to reference**: Server management, WordPress diagnostics, security operations

---

#### 04-websocket-realtime.md
**Inclusion**: Always  
**Purpose**: Real-time communication with Socket.IO

**Contains**:
- Backend WebSocket configuration
- Frontend WebSocket setup
- Event types (chat, lead, notification)
- Chat notification system
- Audio notifications
- Connection status handling
- Best practices
- Cleanup and maintenance
- Testing WebSocket
- Common issues

**When to reference**: Real-time features, chat system, notifications

---

#### 05-frontend-react-patterns.md
**Inclusion**: File match `frontend/**/*`  
**Purpose**: React development patterns and guidelines

**Contains**:
- Component patterns
- Custom hooks
- State management
- API integration
- Styling guidelines (BEM-like CSS)
- Performance optimization
- Event handling
- Form handling
- Error boundaries
- Best practices
- Common pitfalls

**When to reference**: Frontend development, React components, UI work

---

#### 06-mcp-servers-usage.md
**Inclusion**: Always  
**Purpose**: Guide for using MCP servers with this project

**Contains**:
- MCP server overview
- Recommended servers (Context7, Fetch, Sequential Thinking, Memory, Filesystem)
- Project-specific usage patterns
- Auto-approval configuration
- Best practices
- Troubleshooting
- Integration with workflow
- Example configuration

**When to reference**: Setting up development environment, using MCP tools

---

#### 07-deployment-production.md
**Inclusion**: Always  
**Purpose**: Deployment and production operations

**Contains**:
- Deployment environments
- Pre-deployment checklist
- cPanel deployment (backend and frontend)
- Process management (PM2)
- Database setup
- SSL/TLS configuration
- Monitoring and logging
- Backup strategy
- Rollback procedures
- Performance tuning
- Troubleshooting production issues
- Security maintenance
- Disaster recovery

**When to reference**: Deploying to production, production issues, maintenance

---

#### 08-memory-updater.md
**Inclusion**: Always  
**Purpose**: Project knowledge management with MCP Memory Server

**Contains**:
- Memory update triggers
- Memory structure (entities, relations)
- Automatic memory updates
- Knowledge categories
- Memory maintenance
- Query patterns
- Integration with workflow
- Example memory updates
- Benefits and best practices

**When to reference**: Documenting patterns, storing solutions, querying knowledge

---

#### 09-testing-debugging.md
**Inclusion**: Always  
**Purpose**: Testing strategies and debugging techniques

**Contains**:
- Testing strategy (unit, integration, E2E)
- Jest configuration
- Writing tests
- Mocking external services
- Manual testing
- Debugging techniques
- Common issues and solutions
- Performance debugging
- Testing checklist

**When to reference**: Writing tests, debugging issues, troubleshooting

---

#### 10-git-workflow.md
**Inclusion**: Always  
**Purpose**: Version control and Git best practices

**Contains**:
- Branch strategy
- Commit message conventions
- Workflow (features, fixes, hotfixes)
- Pull request guidelines
- Code review checklist
- Git best practices
- Tagging and releases
- Useful Git commands
- Conflict resolution
- Emergency procedures

**When to reference**: Creating branches, committing code, code reviews

---

#### 11-troubleshooting-guide.md
**Inclusion**: Always  
**Purpose**: Common issues and solutions reference

**Contains**:
- Quick diagnostic commands
- Common issues by category:
  - Application startup
  - WHMCS API
  - WHM/cPanel
  - MongoDB
  - WebSocket
  - Frontend
  - Performance
  - Deployment
- Debugging workflow
- Emergency contacts
- Prevention checklist

**When to reference**: Troubleshooting issues, debugging, emergency situations

---

## How Steering Files Work

### Inclusion Types

1. **Always Included** (`inclusion: always`)
   - Loaded for every Kiro interaction
   - Core project knowledge
   - Most steering files use this

2. **File Match** (`inclusion: fileMatch`)
   - Loaded when working with matching files
   - Example: `05-frontend-react-patterns.md` loads for `frontend/**/*`
   - Reduces context for backend-only work

3. **Manual** (`inclusion: manual`)
   - Loaded only when explicitly referenced
   - Use for specialized, rarely-needed information

### Front Matter
Each steering file has YAML front matter:
```yaml
---
inclusion: always
---
```

or

```yaml
---
inclusion: fileMatch
fileMatchPattern: frontend/**/*
---
```

## Knowledge Base

### Location
`.kiro/knowledge/project-memory.json`

### Purpose
Persistent storage of project-specific knowledge that improves over time.

### Contents
- **Entities**: Services, patterns, features, procedures
- **Relations**: How entities connect and depend on each other
- **Known Issues**: Documented problems and workarounds
- **Best Practices**: Proven patterns and approaches
- **Security Notes**: Security considerations and requirements

### Updating
The knowledge base should be updated when:
- API limitations are discovered
- Integration patterns are established
- Bug fixes are completed
- Performance optimizations are made
- Configuration changes are documented
- Deployment procedures are updated

## Best Practices for Using Steering Files

### For Developers
1. **Read relevant steering files** before starting work
2. **Reference steering files** during code reviews
3. **Update steering files** when patterns change
4. **Suggest improvements** via pull requests

### For Kiro AI
1. **Always check steering files** before implementing
2. **Follow established patterns** from steering files
3. **Update knowledge base** when discovering new patterns
4. **Reference specific steering files** in responses

### For Project Maintenance
1. **Review quarterly** for outdated information
2. **Update after major changes** (new integrations, architecture changes)
3. **Keep examples current** with actual codebase
4. **Maintain consistency** across all steering files

## Adding New Steering Files

### When to Add
- New major integration (e.g., payment gateway)
- New architectural pattern
- Complex feature requiring extensive documentation
- Team-specific workflows

### Naming Convention
```
<number>-<descriptive-name>.md
```
- Number: Sequential (12, 13, 14...)
- Name: Kebab-case, descriptive

### Template
```markdown
---
inclusion: always
---

# Title

## Overview
Brief description of what this file covers

## Section 1
Content...

## Section 2
Content...

## Best Practices
- Practice 1
- Practice 2

## Common Issues
- Issue 1
- Issue 2
```

## Maintenance Schedule

### Weekly
- Review for obvious errors
- Update examples if code changed

### Monthly
- Check for outdated information
- Update version numbers
- Add new patterns discovered

### Quarterly
- Comprehensive review
- Reorganize if needed
- Archive obsolete information
- Update knowledge base

### Annually
- Major restructure if needed
- Align with project evolution
- Update all examples
- Refresh best practices

## Related Files

- `.kiro/knowledge/project-memory.json` - Knowledge base
- `.kiro/settings/mcp.json` - MCP server configuration
- `.env.example` - Environment variable template
- `README.md` - Project README
- `package.json` - Project dependencies

## Support

For questions or suggestions about steering files:
1. Check existing steering files first
2. Review knowledge base
3. Consult with team lead
4. Create issue or PR for improvements

## Version History

- **v1.0.0** (2026-02-07) - Initial comprehensive steering files created
  - 12 steering files covering all major aspects
  - Initial knowledge base with entities and relations
  - Complete project documentation

---

**Last Updated**: February 7, 2026  
**Maintained By**: Development Team  
**Review Frequency**: Quarterly
