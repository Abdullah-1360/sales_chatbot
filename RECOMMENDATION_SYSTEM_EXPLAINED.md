# Recommendation System - Complete Explanation

## Overview
The recommendation system suggests hosting plans based on user requirements using a two-phase approach:
1. **Exact Match Phase**: Find plans that meet all hard requirements
2. **Nearest Neighbor Phase**: If no exact matches, find the closest alternatives within the same product category

## Phase 1: Product Group Selection (GID Determination)

Before filtering plans, the system determines which product group (GID) to search based on user needs:

### GID Mapping Logic (`src/services/planMatcher.js`)

```javascript
// Priority order:
1. WooCommerce/Ecommerce → GID 21 (WooCommerce Hosting)
2. WordPress → GID 20 (WordPress Hosting)
3. Windows tech_stack → GID 20 (WordPress Hosting) ⚠️ Changed!
4. Business needs → GID 25 (Business Hosting)
5. Default → GID 1 (cPanel Shared Hosting)
```

**⚠️ Important Change**: Users selecting Windows tech_stack now receive WordPress hosting plans (GID 20) instead of Windows hosting.

### Tier Determination
Based on website count, the system determines minimum tier:
- **1 website** → `entry` tier
- **2-3 websites** → `mid` tier
- **4-10 or 10+ websites** → `upper` tier

### Example:
```javascript
Input: {
  cms: 'WordPress',
  websites_count: '2-3',
  storage_needed_gb: 12,
  monthly_budget: 10
}

Result: GID = 20 (WordPress), minTier = 'mid'
```

---

## Phase 2: Exact Match Filtering

The system applies **hard filters** in sequence:

### Filter 1: Storage (Hard Requirement)
```javascript
plans = plans.filter(p => parseInt(p.diskspace) >= storage_needed_gb)
```
- **Rule**: Plan storage MUST be >= required storage
- **Example**: If user needs 12 GB, plans with 8 GB are excluded

### Filter 2: Tier (Hard Requirement)
```javascript
plans = plans.filter(p => getTierRank(getTierFromPlan(p)) >= getTierRank(minTier))
```
- **Rule**: Plan tier MUST be >= minimum tier
- **Tier Ranks**: entry=1, mid=2, upper=3
- **Example**: If minTier is 'mid', only 'mid' and 'upper' plans pass

### Filter 3: Budget (Hard Requirement)
```javascript
plans = plans.filter(p => Number(p.pricing.USD.monthly) <= monthly_budget)
```
- **Rule**: Plan price MUST be <= budget
- **Example**: If budget is $10, plans costing $12 are excluded

### Filter 4: Free Domain (Soft Preference)
```javascript
if (free_domain) {
  const withDomain = plans.filter(p => p.freedomain);
  if (withDomain.length) plans = withDomain;  // Only if any exist
}
```
- **Rule**: Prefer plans with free domain, but don't exclude all plans if none have it
- **Soft**: Won't result in empty matches

---

## Phase 3: Confidence Score Calculation

If exact matches are found, OR if using nearest neighbor, each plan gets a confidence score (0-100).

### Confidence Formula (Weighted)

```
Total Confidence = Storage Score (30%) 
                 + Budget Score (30%) 
                 + Tier Score (25%) 
                 + Free Domain Score (15%)
```

### 1. Storage Score (30% weight)

**Perfect Match (30 points):**
```javascript
if (planStorage === requiredStorage) return 30;
```

**More than needed (15-30 points):**
```javascript
// Slight penalty for excess storage
const excess = planStorage - requiredStorage;
const excessRatio = excess / requiredStorage;

if (excessRatio > 2) return 15;  // More than 3x required
return 30 - (excessRatio * 7.5);  // Linear decrease
```

**Less than needed (0-30 points):**
```javascript
// Proportional to how close
const ratio = planStorage / requiredStorage;
return ratio * 30;
```

**Examples:**
- Required: 10 GB, Plan: 10 GB → **30 points** ✓
- Required: 10 GB, Plan: 12 GB → **28.5 points**
- Required: 10 GB, Plan: 40 GB → **15 points** (too much)
- Required: 10 GB, Plan: 5 GB → **15 points** (50% match)

### 2. Budget Score (30% weight)

**At or under budget (25-30 points):**
```javascript
if (planPrice <= budget) {
  if (planPrice === budget) return 30;
  
  const savings = budget - planPrice;
  const savingsRatio = savings / budget;
  
  if (savingsRatio >= 0.5) return 30;  // 50%+ under budget
  return 25 + (savingsRatio * 10);     // 25-30 range
}
```

**Over budget (0-30 points):**
```javascript
const overBudget = planPrice - budget;
const overRatio = overBudget / budget;

if (overRatio > 0.5) return 0;        // More than 50% over
return 30 - (overRatio * 60);         // Linear decrease
```

**Examples:**
- Budget: $10, Plan: $10 → **30 points** ✓
- Budget: $10, Plan: $5 → **30 points** (great value)
- Budget: $10, Plan: $8 → **27 points**
- Budget: $10, Plan: $12 → **18 points** (20% over)
- Budget: $10, Plan: $16 → **0 points** (60% over)

### 3. Tier Score (25% weight)

**Exact tier match (25 points):**
```javascript
if (planRank === minRank) return 25;
```

**Higher tier (15-20 points):**
```javascript
// Slight penalty for over-provisioning
const tierDiff = planRank - minRank;
return 25 - (tierDiff * 5);  // -5 per tier level
```

**Lower tier (0-25 points):**
```javascript
// Proportional score
const ratio = planRank / minRank;
return ratio * 25;
```

**Examples:**
- Required: mid (2), Plan: mid (2) → **25 points** ✓
- Required: entry (1), Plan: mid (2) → **20 points**
- Required: entry (1), Plan: upper (3) → **15 points**
- Required: mid (2), Plan: entry (1) → **12.5 points**

### 4. Free Domain Score (15% weight)

**Simple binary:**
```javascript
if (!freeDomainNeeded) return 15;     // Not needed, full score
return plan.freedomain ? 15 : 0;      // Has it or doesn't
```

**Examples:**
- Not needed → **15 points** ✓
- Needed + Has it → **15 points** ✓
- Needed + Doesn't have it → **0 points**

---

## Complete Confidence Examples

### Example 1: Perfect Match
```javascript
Plan: {
  name: 'WP Mid',
  diskspace: '12',
  pricing: { USD: { monthly: 5.50 } },
  freedomain: true
}

Requirements: {
  storage_needed_gb: 12,
  monthly_budget: 5.50,
  minTier: 'mid',
  free_domain: true
}

Calculation:
- Storage: 12 GB = 12 GB → 30 points
- Budget: $5.50 = $5.50 → 30 points
- Tier: mid = mid → 25 points
- Free Domain: needed + has → 15 points

Total: 100 points (Perfect Match!)
```

### Example 2: Good Match
```javascript
Plan: {
  name: 'WP Mid',
  diskspace: '12',
  pricing: { USD: { monthly: 5.50 } },
  freedomain: true
}

Requirements: {
  storage_needed_gb: 10,
  monthly_budget: 6,
  minTier: 'mid',
  free_domain: true
}

Calculation:
- Storage: 12 GB > 10 GB (20% excess) → 28.5 points
- Budget: $5.50 < $6 (8% savings) → 25.8 points
- Tier: mid = mid → 25 points
- Free Domain: needed + has → 15 points

Total: 94.3 points (Excellent Match!)
```

### Example 3: Nearest Neighbor
```javascript
Plan: {
  name: 'WP Upper',
  diskspace: '40',
  pricing: { USD: { monthly: 10 } },
  freedomain: false
}

Requirements: {
  storage_needed_gb: 100,
  monthly_budget: 15,
  minTier: 'upper',
  free_domain: true
}

Calculation:
- Storage: 40 GB < 100 GB (40% match) → 12 points
- Budget: $10 < $15 (33% savings) → 28.3 points
- Tier: upper = upper → 25 points
- Free Domain: needed but missing → 0 points

Total: 65.3 points (Acceptable Nearest Neighbor)
```

---

## Phase 4: Nearest Neighbor Fallback

If **no exact matches** are found, the system searches for nearest neighbors:

### Nearest Neighbor Rules

1. **Same GID Only**: Only search within the originally determined product group
2. **Calculate Confidence**: Score ALL plans in the GID (no hard filters)
3. **Minimum Threshold**: Filter out plans with confidence < 40%
4. **Sort**: By confidence (desc), then price (asc)
5. **Limit**: Return maximum 3 plans

### Why 40% Threshold?
Plans below 40% confidence are considered too poor a match to recommend.

**Example:**
```javascript
// User needs 100 GB storage, $15 budget, upper tier
// No exact matches in GID 20 (WordPress)

Available plans:
- WP Entry: 0.5 GB, $1.99 → 25% confidence (rejected)
- WP Mid: 12 GB, $5.50 → 45% confidence (accepted)
- WP Upper: 40 GB, $10 → 65% confidence (accepted)

Result: Return [WP Upper, WP Mid] sorted by confidence
```

---

## Complete Flow Diagram

```
User Request
    ↓
┌─────────────────────────────────┐
│ 1. Determine GID & Min Tier     │
│    (planMatcher)                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 2. Fetch Plans from MongoDB     │
│    (by GID)                     │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 3. Apply Hard Filters           │
│    - Storage >= required        │
│    - Tier >= minimum            │
│    - Price <= budget            │
│    - Prefer free domain         │
└─────────────────────────────────┘
    ↓
    ├─ Exact Matches Found? ─────┐
    │                             │
   YES                           NO
    │                             │
    ↓                             ↓
┌─────────────────────┐  ┌──────────────────────┐
│ 4a. Calculate       │  │ 4b. Nearest Neighbor │
│     Confidence      │  │     - All plans      │
│     for matches     │  │     - Calculate conf │
└─────────────────────┘  │     - Filter >= 40%  │
    │                    └──────────────────────┘
    │                             │
    └──────────┬──────────────────┘
               ↓
    ┌─────────────────────────────┐
    │ 5. Sort by Confidence (desc)│
    │    then Price (asc)         │
    └─────────────────────────────┘
               ↓
    ┌─────────────────────────────┐
    │ 6. Return Top 3 Plans       │
    └─────────────────────────────┘
```

---

## Real-World Example

### User Input:
```json
{
  "purpose": "Blog",
  "websites_count": "2-3",
  "tech_stack": "Linux",
  "cms": "WordPress",
  "email_needed": true,
  "storage_needed_gb": 12,
  "monthly_budget": 10,
  "free_domain": true,
  "migrate_from_existing_host": false
}
```

### Step 1: GID Determination
- CMS = WordPress → **GID 20**
- websites_count = "2-3" → **minTier = 'mid'**

### Step 2: Fetch Plans (GID 20)
```
Available:
- WP Entry: 0.5 GB, $1.99, entry, no domain
- WP Mid: 12 GB, $5.50, mid, free domain
- WP Upper: 40 GB, $10, upper, no domain
```

### Step 3: Apply Hard Filters

**Filter 1 - Storage >= 12 GB:**
- ❌ WP Entry (0.5 GB)
- ✅ WP Mid (12 GB)
- ✅ WP Upper (40 GB)

**Filter 2 - Tier >= mid:**
- ✅ WP Mid (mid)
- ✅ WP Upper (upper)

**Filter 3 - Budget <= $10:**
- ✅ WP Mid ($5.50)
- ✅ WP Upper ($10)

**Filter 4 - Prefer Free Domain:**
- ✅ WP Mid (has domain) → Keep
- ❌ WP Upper (no domain) → Remove

**Exact Matches: [WP Mid]**

### Step 4: Calculate Confidence

**WP Mid:**
- Storage: 12 = 12 → 30 points
- Budget: $5.50 < $10 (45% savings) → 29.5 points
- Tier: mid = mid → 25 points
- Free Domain: has it → 15 points
- **Total: 99.5%**

### Step 5: Sort & Return
```json
{
  "matches": [
    {
      "pid": "24",
      "name": "WP Mid",
      "diskspace": "12",
      "freedomain": true,
      "pricing": { "USD": { "monthly": 5.50 } },
      "confidence": 99.5
    }
  ]
}
```

---

## Key Design Decisions

### 1. Why Two-Phase Approach?
- **Exact Match First**: Ensures users get plans that meet ALL requirements when possible
- **Nearest Neighbor Fallback**: Prevents empty results when requirements are too strict

### 2. Why Same GID Constraint?
- Maintains product category consistency
- WordPress users get WordPress hosting, not Windows hosting
- Prevents inappropriate recommendations

### 3. Why 40% Confidence Threshold?
- Below 40% means the plan fails on multiple criteria
- Better to show no results than very poor matches
- Encourages users to adjust requirements

### 4. Why Weighted Scoring?
- Storage and Budget are most critical (30% each)
- Tier is important but flexible (25%)
- Free Domain is nice-to-have (15%)

### 5. Why Soft Free Domain Filter?
- Many plans don't offer free domains
- Hard requirement would eliminate too many options
- Better to show plans without domain than no plans at all

---

## Summary

The recommendation system uses a **smart, multi-phase approach**:

1. **Intelligent GID Selection**: Routes users to the right product category
2. **Hard Filtering**: Ensures basic requirements are met
3. **Confidence Scoring**: Quantifies match quality with weighted criteria
4. **Nearest Neighbor Fallback**: Finds alternatives when exact matches don't exist
5. **Same-GID Constraint**: Maintains product category consistency

This results in **relevant, high-quality recommendations** that balance user requirements with available options.
