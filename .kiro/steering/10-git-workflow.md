---
inclusion: always
---

# Git Workflow & Version Control

## Branch Strategy

### Main Branches
- `main` - Production-ready code
- `develop` - Integration branch for features
- `staging` - Pre-production testing

### Feature Branches
- `feature/feature-name` - New features
- `fix/bug-name` - Bug fixes
- `hotfix/critical-fix` - Production hotfixes
- `refactor/component-name` - Code refactoring
- `docs/topic` - Documentation updates

## Commit Message Convention

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, no logic change)
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `chore` - Maintenance tasks
- `build` - Build system changes
- `ci` - CI/CD changes

### Examples
```bash
# Feature
git commit -m "feat(whmcs): add invoice generation endpoint"

# Bug fix
git commit -m "fix(websocket): resolve connection timeout on shared hosting"

# Documentation
git commit -m "docs(api): update WHMCS integration guide"

# Refactor
git commit -m "refactor(services): extract phone normalization to utility"

# Performance
git commit -m "perf(cache): implement MongoDB caching for server list"

# With body
git commit -m "feat(wordpress): add comprehensive diagnostic controller

- Implement multi-step diagnostic flow
- Add database connection testing
- Include plugin/theme conflict detection
- Add error log analysis

Closes #123"
```

## Workflow

### Starting New Feature
```bash
# Update develop branch
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/new-feature

# Work on feature
git add .
git commit -m "feat(scope): description"

# Push to remote
git push origin feature/new-feature

# Create pull request to develop
```

### Bug Fix
```bash
# Create fix branch from develop
git checkout develop
git pull origin develop
git checkout -b fix/bug-description

# Fix the bug
git add .
git commit -m "fix(scope): description"

# Push and create PR
git push origin fix/bug-description
```

### Hotfix (Production)
```bash
# Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue

# Fix the issue
git add .
git commit -m "hotfix(scope): description"

# Merge to main
git checkout main
git merge hotfix/critical-issue
git push origin main

# Also merge to develop
git checkout develop
git merge hotfix/critical-issue
git push origin develop

# Delete hotfix branch
git branch -d hotfix/critical-issue
```

## Pull Request Guidelines

### PR Title Format
```
[TYPE] Brief description of changes
```

### PR Description Template
```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] No console errors

## Related Issues
Closes #123
Related to #456

## Screenshots (if applicable)
[Add screenshots here]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No sensitive data in commits
```

## Code Review Checklist

### Reviewer Checklist
- [ ] Code follows project conventions
- [ ] No security vulnerabilities
- [ ] Error handling is appropriate
- [ ] Tests are adequate
- [ ] Performance considerations addressed
- [ ] Documentation is clear
- [ ] No sensitive data exposed
- [ ] Breaking changes documented

### Author Checklist (Before PR)
- [ ] All tests pass
- [ ] Code is self-documented
- [ ] No debug code left
- [ ] Environment variables documented
- [ ] Migration scripts included (if needed)
- [ ] Backward compatibility maintained

## Git Best Practices

### Commit Frequency
- Commit logical units of work
- Don't commit broken code
- Commit before switching tasks
- Use meaningful commit messages

### What to Commit
```bash
# ✅ Do commit
- Source code changes
- Configuration templates (.env.example)
- Documentation
- Test files
- Build scripts

# ❌ Don't commit
- .env files (use .env.example)
- node_modules/
- dist/ or build/ folders
- IDE-specific files (.vscode/, .idea/)
- Log files
- Temporary files
- API keys or secrets
```

### .gitignore
```bash
# Dependencies
node_modules/
frontend/node_modules/

# Build outputs
frontend/dist/
frontend/build/

# Environment
.env
.env.local
.env.production

# Logs
logs/
*.log
npm-debug.log*

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Temporary
temp/
tmp/
*.tmp

# Test coverage
coverage/

# Database
*.sqlite
*.db
```

## Tagging & Releases

### Semantic Versioning
```
MAJOR.MINOR.PATCH

MAJOR: Breaking changes
MINOR: New features (backward compatible)
PATCH: Bug fixes
```

### Creating Tags
```bash
# Create annotated tag
git tag -a v1.2.3 -m "Release version 1.2.3"

# Push tag to remote
git push origin v1.2.3

# Push all tags
git push origin --tags

# List tags
git tag -l

# Delete tag
git tag -d v1.2.3
git push origin :refs/tags/v1.2.3
```

### Release Process
```bash
# 1. Update version in package.json
npm version patch  # or minor, or major

# 2. Update CHANGELOG.md
# Add release notes

# 3. Commit changes
git add .
git commit -m "chore: bump version to 1.2.3"

# 4. Create tag
git tag -a v1.2.3 -m "Release 1.2.3"

# 5. Push to remote
git push origin develop
git push origin v1.2.3

# 6. Merge to main
git checkout main
git merge develop
git push origin main
```

## Useful Git Commands

### Viewing History
```bash
# View commit history
git log --oneline --graph --all

# View changes in a file
git log -p filename

# View commits by author
git log --author="name"

# View commits in date range
git log --since="2024-01-01" --until="2024-01-31"
```

### Undoing Changes
```bash
# Discard local changes
git checkout -- filename

# Unstage file
git reset HEAD filename

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Revert a commit (create new commit)
git revert commit-hash
```

### Stashing
```bash
# Stash current changes
git stash

# Stash with message
git stash save "work in progress"

# List stashes
git stash list

# Apply latest stash
git stash apply

# Apply specific stash
git stash apply stash@{0}

# Pop stash (apply and remove)
git stash pop

# Drop stash
git stash drop stash@{0}
```

### Branch Management
```bash
# List branches
git branch -a

# Delete local branch
git branch -d branch-name

# Delete remote branch
git push origin --delete branch-name

# Rename branch
git branch -m old-name new-name

# Track remote branch
git branch --set-upstream-to=origin/branch-name
```

### Syncing
```bash
# Fetch all remotes
git fetch --all

# Pull with rebase
git pull --rebase origin develop

# Update all branches
git fetch --all
git pull --all
```

## Conflict Resolution

### Resolving Merge Conflicts
```bash
# 1. Pull latest changes
git pull origin develop

# 2. If conflicts occur, view them
git status

# 3. Open conflicted files and resolve
# Look for conflict markers:
<<<<<<< HEAD
Your changes
=======
Their changes
>>>>>>> branch-name

# 4. After resolving, stage files
git add resolved-file

# 5. Complete merge
git commit -m "merge: resolve conflicts with develop"

# 6. Push changes
git push origin feature-branch
```

### Avoiding Conflicts
- Pull frequently from develop
- Keep feature branches short-lived
- Communicate with team about overlapping work
- Use small, focused commits

## Emergency Procedures

### Accidentally Committed Secrets
```bash
# 1. Remove from latest commit
git rm --cached .env
git commit --amend -m "fix: remove .env file"
git push --force

# 2. If already pushed, rotate all secrets immediately
# 3. Use git-filter-branch or BFG Repo-Cleaner for history

# 4. Add to .gitignore
echo ".env" >> .gitignore
git add .gitignore
git commit -m "chore: add .env to gitignore"
```

### Recover Deleted Branch
```bash
# Find the commit hash
git reflog

# Recreate branch
git checkout -b recovered-branch commit-hash
```

### Recover Deleted Commits
```bash
# View reflog
git reflog

# Checkout the commit
git checkout commit-hash

# Create branch from it
git checkout -b recovery-branch
```
