# Varied Responses Guide

## Purpose-Based Routing

The system now routes to different GIDs based on **purpose** to provide varied responses.

## Routing by Purpose

| Purpose | GID | Hosting Type | Products |
|---------|-----|--------------|----------|
| **Ecommerce** | 21 | WooCommerce Hosting | 3 plans |
| **Blog** | 20 | WordPress Hosting | 4 plans |
| **Business Site** | 25 | Business Hosting | 12 plans |
| **Portfolio** | 20 | WordPress Hosting | 4 plans |
| **Other** | 1 | cPanel Hosting | 7 plans |

## Example Requests & Responses

### 1. Business Site → GID 25 (12 plans)
```json
{
  "purpose": "Business Site",
  "websites_count": "2-3",
  "storage_needed_gb": 25,
  "free_domain": false
}
```
**Returns:** Business Hosting plans (GID 25)

---

### 2. E-commerce → GID 21 (3 plans)
```json
{
  "purpose": "Ecommerce",
  "websites_count": "1",
  "storage_needed_gb": 30,
  "free_domain": true
}
```
**Returns:** WooCommerce Hosting plans (GID 21)

---

### 3. Blog → GID 20 (4 plans)
```json
{
  "purpose": "Blog",
  "websites_count": "1",
  "storage_needed_gb": 10,
  "free_domain": true
}
```
**Returns:** WordPress Hosting plans (GID 20)

---

### 4. Portfolio → GID 20 (4 plans)
```json
{
  "purpose": "Portfolio",
  "websites_count": "1",
  "storage_needed_gb": 5,
  "free_domain": false
}
```
**Returns:** WordPress Hosting plans (GID 20)

---

### 5. Other → GID 1 (7 plans)
```json
{
  "purpose": "Other",
  "websites_count": "2-3",
  "storage_needed_gb": 20,
  "free_domain": false
}
```
**Returns:** cPanel Hosting plans (GID 1)

---

## Complete Routing Logic

### Priority Order:

1. **SSL** (`needs_ssl: true`) → GID 6 (14 plans)
2. **Windows Reseller** (`needs_reseller + Windows`) → GID 26 (4 plans)
3. **cPanel Reseller** (`needs_reseller`) → GID 2 (8 plans)
4. **Windows Hosting** (`tech_stack: "Windows"`) → GID 28 (4 plans)
5. **E-commerce** (`purpose: "Ecommerce"`) → GID 21 (3 plans)
6. **Blog** (`purpose: "Blog"`) → GID 20 (4 plans)
7. **Business** (`purpose: "Business Site"`) → GID 25 (12 plans)
8. **Portfolio** (`purpose: "Portfolio"`) → GID 20 (4 plans)
9. **Default** (everything else) → GID 1 (7 plans)

## Testing Different Responses

```bash
# Test 1: Business Site
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Business Site","websites_count":"2-3","storage_needed_gb":25,"free_domain":false}'

# Test 2: E-commerce
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Ecommerce","websites_count":"1","storage_needed_gb":30,"free_domain":true}'

# Test 3: Blog
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Blog","websites_count":"1","storage_needed_gb":10,"free_domain":true}'

# Test 4: Portfolio
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Portfolio","websites_count":"1","storage_needed_gb":5,"free_domain":false}'

# Test 5: Windows
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Business Site","tech_stack":"Windows","websites_count":"1","storage_needed_gb":15}'
```

## Why Different Responses?

### Different Product Pools:
- **Business Site** → 12 Business Hosting plans to choose from
- **E-commerce** → 3 WooCommerce plans to choose from
- **Blog** → 4 WordPress plans to choose from
- **Portfolio** → 4 WordPress plans to choose from
- **Other** → 7 cPanel plans to choose from

### Different Features:
- **Business Hosting** - Business-focused features
- **WooCommerce** - E-commerce features
- **WordPress** - Blog/CMS features
- **cPanel** - General hosting features

### Different Pricing:
- Each GID has different price ranges
- Different storage options
- Different tier structures

## Matching Still Based On:

1. **Diskspace** (storage_needed_gb) - 40%
2. **Websites Count** (tier) - 40%
3. **Free Domain** - 20%
4. **Purpose** - Routes to appropriate GID

## Benefits

✅ **Varied responses** - Different purpose = different plans  
✅ **Appropriate plans** - E-commerce gets WooCommerce plans  
✅ **Better matching** - Purpose-specific features  
✅ **More options** - Different product pools  
✅ **Predictable** - Same purpose = same GID  

---

**Status:** ✅ System now provides varied responses based on purpose  
**Routing:** Purpose determines which GID (product pool)  
**Matching:** Still based on diskspace, tier, free_domain
