# Windows → WordPress Mapping Change

## Summary
Users who select **Windows** as their `tech_stack` will now receive **WordPress hosting plans (GID 20)** instead of Windows hosting plans (GID 28).

## Changes Made

### 1. Plan Matcher Logic (`src/services/planMatcher.js`)

**Before:**
```javascript
if (tech_stack === TECH_STACK.WIN || wantsWindows(answers)) return { gid: 28, minTier };
```

**After:**
```javascript
if (tech_stack === TECH_STACK.WIN || wantsWindows(answers)) return { gid: 20, minTier };
```

### 2. Fixture Data (`src/_fixtures/whmcs-products.json`)

**Changed 3 Windows plans to WordPress plans:**

| PID | Old Name | Old GID | New Name | New GID |
|-----|----------|---------|----------|---------|
| 53  | Win Entry | 28 | WP Starter | 20 |
| 54  | Win Mid | 28 | WP Plus | 20 |
| 55  | Win Upper | 28 | WP Pro | 20 |

**Details:**

**PID 53 - WP Starter:**
- Storage: 2 GB
- Price: $2.49/mo
- Free Domain: No
- Description: "1 WP site, 2 GB storage."

**PID 54 - WP Plus:**
- Storage: 12 GB
- Price: $6.00/mo
- Free Domain: Yes
- Description: "2-3 WP sites, 12 GB storage."

**PID 55 - WP Pro:**
- Storage: 35 GB
- Price: $11.50/mo
- Free Domain: No
- Description: "4-10 WP sites, 35 GB storage."

### 3. MongoDB Data

Database has been re-seeded with updated products:
```bash
npm run seed
```

**Current WordPress Plans (GID 20):**
- 11 total plans (including the 3 converted from Windows)

## Testing

All tests pass with the new mapping:

```bash
✅ Test 1: Windows tech_stack → GID 20 (WordPress)
✅ Test 2: WordPress CMS → GID 20 (WordPress)
✅ Test 3: WooCommerce → GID 21 (WooCommerce)
✅ Test 4: Default Linux → GID 1 (cPanel)
```

## Priority Order (Updated)

The system now follows this priority:

1. **WooCommerce/Ecommerce** → GID 21 (WooCommerce Hosting)
2. **WordPress CMS** → GID 20 (WordPress Hosting)
3. **Windows tech_stack** → GID 20 (WordPress Hosting) ⚠️ **NEW**
4. **Business needs** → GID 25 (Business Hosting)
5. **Default** → GID 1 (cPanel Shared Hosting)

## Example Scenarios

### Scenario 1: Windows + No CMS
```json
{
  "tech_stack": "Windows",
  "cms": "None",
  "websites_count": "2-3"
}
```
**Result:** GID 20 (WordPress), minTier: 'mid'

### Scenario 2: Windows + WordPress
```json
{
  "tech_stack": "Windows",
  "cms": "WordPress",
  "websites_count": "1"
}
```
**Result:** GID 20 (WordPress), minTier: 'entry'

### Scenario 3: Windows + WooCommerce
```json
{
  "tech_stack": "Windows",
  "cms": "WooCommerce",
  "websites_count": "4-10"
}
```
**Result:** GID 21 (WooCommerce), minTier: 'upper'
*Note: WooCommerce takes priority over Windows*

## Impact

### Positive:
- ✅ Simplified product offering
- ✅ More WordPress plans available for Windows users
- ✅ Better pricing options
- ✅ Consistent recommendation experience

### Considerations:
- ⚠️ Users expecting Windows-specific features (ASP.NET, MSSQL) will receive WordPress plans
- ⚠️ May need to update user-facing documentation/UI

## Verification

To verify the changes:

```bash
# Test the mapping logic
node test-windows-to-wp.js

# Verify MongoDB data
node src/scripts/verifyMongoDB.js

# Run full test suite
npm test
```

## Rollback

To rollback this change:

1. Revert `src/services/planMatcher.js`:
```javascript
if (tech_stack === TECH_STACK.WIN || wantsWindows(answers)) return { gid: 28, minTier };
```

2. Restore Windows plans in `src/_fixtures/whmcs-products.json`

3. Re-seed database:
```bash
npm run seed
```

## Files Modified

- ✅ `src/services/planMatcher.js` - Updated GID mapping
- ✅ `src/_fixtures/whmcs-products.json` - Converted 3 Windows plans to WordPress
- ✅ `RECOMMENDATION_SYSTEM_EXPLAINED.md` - Updated documentation
- ✅ MongoDB database - Re-seeded with new data

## Date
November 1, 2025
