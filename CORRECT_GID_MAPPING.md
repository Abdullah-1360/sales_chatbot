# Correct GID Mapping - Final Configuration

## ✅ Confirmed GID Structure

Based on your WHMCS setup:

| GID | Name | Product Count | Category |
|-----|------|---------------|----------|
| **1** | cPanel Hosting | 7 | Hosting |
| **2** | cPanel Reseller Hosting | 8 | Reseller |
| **6** | SSL Certificates | 14 | SSL |
| **25** | Business Hosting | 12 | Hosting |
| **26** | Windows Reseller | 4 | Reseller |
| **28** | Windows Hosting | 4 | Hosting |

**Total: 49 products across 6 GIDs**

## Routing Logic

### 1. SSL Certificates (GID 6)
```json
{ "needs_ssl": true }
```

### 2. Windows Reseller (GID 26) - 4 products
```json
{
  "needs_reseller": true,
  "tech_stack": "Windows"
}
```

### 3. cPanel Reseller (GID 2) - 8 products
```json
{
  "needs_reseller": true
}
```

### 4. Business Hosting (GID 25) - 12 products
**Triggers:**
- WooCommerce: `{ "cms": "WooCommerce" }`
- E-commerce: `{ "purpose": "Ecommerce" }`
- High budget: `{ "monthly_budget": 50 }` (>$20)

### 5. Windows Hosting (GID 28) - 4 products
```json
{
  "tech_stack": "Windows"
}
```

### 6. cPanel Hosting (GID 1) - 7 products
```json
{}  // Default
```

## Priority Order

1. SSL (`needs_ssl`) → GID 6
2. Windows Reseller (`needs_reseller` + Windows) → GID 26
3. cPanel Reseller (`needs_reseller`) → GID 2
4. Business Hosting (WooCommerce/E-commerce/High budget) → GID 25
5. Windows Hosting (Windows tech stack) → GID 28
6. cPanel Hosting (default) → GID 1

## What Changed

### Removed GIDs:
- ❌ GID 20 (WordPress Hosting) - Not in your WHMCS
- ❌ GID 21 (WooCommerce Hosting) - Not in your WHMCS

### Correct Mapping:
- ✅ GID 1 = cPanel Hosting (7 products)
- ✅ GID 2 = cPanel Reseller (8 products, not 4)
- ✅ GID 6 = SSL Certificates (14 products)
- ✅ GID 25 = Business Hosting (12 products)
- ✅ GID 26 = Windows Reseller (4 products)
- ✅ GID 28 = Windows Hosting (4 products)

## Files Updated

- ✅ `src/config/index.js` - GID configuration
- ✅ `src/services/gidHelper.js` - GID utilities
- ✅ `src/services/planMatcher.js` - Routing logic

## Test the Configuration

```bash
# Sync products
npm run sync

# Should show:
# GID 1: 7 products
# GID 2: 8 products
# GID 6: 14 products
# GID 25: 12 products
# GID 26: 4 products
# GID 28: 4 products
```

## API Examples

### cPanel Hosting (GID 1)
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{}'
```

### cPanel Reseller (GID 2) - 8 products
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"needs_reseller":true}'
```

### SSL Certificates (GID 6)
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"needs_ssl":true}'
```

### Business Hosting (GID 25) - 12 products
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"cms":"WooCommerce"}'
```

### Windows Reseller (GID 26) - 4 products
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"needs_reseller":true,"tech_stack":"Windows"}'
```

### Windows Hosting (GID 28) - 4 products
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"tech_stack":"Windows"}'
```

---

**Status:** ✅ Configuration updated to match your WHMCS setup  
**Total Products:** 49 across 6 GIDs  
**Reseller Plans:** 12 total (8 cPanel + 4 Windows)
