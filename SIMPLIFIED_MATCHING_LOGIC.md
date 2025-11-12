# Simplified Matching Logic

## Overview

The recommendation system has been simplified to focus on **4 core criteria**:

1. **Diskspace** (storage_needed_gb)
2. **Number of websites** (websites_count → tier)
3. **Free domain** (free_domain)
4. **Purpose** (purpose - informational)

## Matching Criteria

### 1. Diskspace (40% weight)
- **Hard filter:** Plans must have >= required storage
- **Scoring:** Exact match = 40 points, excess storage penalized slightly

### 2. Websites Count → Tier (40% weight)
- **Conversion:** websites_count → tier (entry/mid/upper)
- **Hard filter:** Plans must meet minimum tier
- **Scoring:** Exact tier match = 40 points

### 3. Free Domain (20% weight)
- **Soft filter:** Prefer plans with free domain if requested
- **Scoring:** Has free domain = 20 points, doesn't have = 0 points

### 4. Purpose (Informational)
- **Not scored:** Used for context only
- **Not filtered:** Doesn't affect matching

## Routing Logic

### Priority Order:
1. **SSL** (`needs_ssl: true`) → GID 6
2. **Windows Reseller** (`needs_reseller: true` + `tech_stack: "Windows"`) → GID 26
3. **cPanel Reseller** (`needs_reseller: true`) → GID 2
4. **Default Hosting** (all other requests) → GID 1

## Request Format

### Minimal Request:
```json
{
  "storage_needed_gb": 25,
  "websites_count": "2-3",
  "free_domain": false,
  "purpose": "Business Site"
}
```

### Full Request:
```json
{
  "purpose": "Business Site",
  "websites_count": "2-3",
  "storage_needed_gb": 25,
  "free_domain": false,
  "needs_reseller": false,
  "needs_ssl": false,
  "tech_stack": "Linux"
}
```

## Confidence Scoring

### Formula:
```
Confidence = (Diskspace Score × 40%) + (Tier Score × 40%) + (Free Domain × 20%)
```

### Example:
```
Plan: 30GB, Mid tier, Free domain
Request: 25GB, 2-3 websites (mid tier), Free domain

Diskspace: 40/40 (meets requirement)
Tier: 40/40 (exact match)
Free Domain: 20/20 (has it)
Total: 100/100
```

## Filtering Process

### Step 1: Route to GID
- Check for SSL request → GID 6
- Check for reseller request → GID 2 or 26
- Default → GID 1

### Step 2: Hard Filters
- Filter by diskspace >= required
- Filter by tier >= required

### Step 3: Soft Filters
- Prefer plans with free domain if requested

### Step 4: Score & Rank
- Calculate confidence for each plan
- Sort by confidence score
- Return top 3 plans

## Removed Criteria

The following criteria have been **removed** from matching:

- ❌ CMS (WordPress, WooCommerce)
- ❌ Monthly budget
- ❌ Email needed
- ❌ Migration status
- ❌ Tech stack (except for reseller routing)

## Examples

### Example 1: Business Site
```json
{
  "purpose": "Business Site",
  "websites_count": "2-3",
  "storage_needed_gb": 25,
  "free_domain": false
}
```

**Matching:**
- GID: 1 (cPanel Hosting)
- Tier: Mid (from "2-3")
- Filter: Plans with >= 25GB
- Filter: Plans with mid or upper tier
- Score: Based on diskspace, tier, free_domain
- Return: Top 3 plans

### Example 2: E-commerce Store
```json
{
  "purpose": "Ecommerce",
  "websites_count": "1",
  "storage_needed_gb": 50,
  "free_domain": true
}
```

**Matching:**
- GID: 1 (cPanel Hosting)
- Tier: Entry (from "1")
- Filter: Plans with >= 50GB
- Filter: Plans with entry or higher tier
- Prefer: Plans with free domain
- Score: Based on diskspace, tier, free_domain
- Return: Top 3 plans

### Example 3: Reseller
```json
{
  "purpose": "Business Site",
  "websites_count": "unlimited",
  "storage_needed_gb": 100,
  "free_domain": false,
  "needs_reseller": true
}
```

**Matching:**
- GID: 2 (cPanel Reseller)
- Tier: Upper (from "unlimited")
- Filter: Plans with >= 100GB
- Filter: Plans with upper tier
- Score: Based on diskspace, tier, free_domain
- Return: Top 3 plans

## Benefits

✅ **Simpler logic** - Only 4 criteria  
✅ **Faster matching** - Fewer filters  
✅ **More predictable** - Clear scoring  
✅ **Easier to understand** - Transparent criteria  
✅ **Better performance** - Less computation  

## Files Modified

- ✅ `src/services/planMatcher.js` - Simplified routing
- ✅ `src/services/confidenceScorer.js` - Removed budget scoring
- ✅ `src/controllers/recommendation.js` - Removed budget filter
- ✅ `src/controllers/recommendation.js` - Simplified validation schema

---

**Status:** ✅ Matching logic simplified to 4 core criteria  
**Scoring:** Diskspace (40%) + Tier (40%) + Free Domain (20%)  
**Routing:** SSL > Reseller > Default Hosting
