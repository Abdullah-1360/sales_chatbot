# Intelligent Keyword Detection

## Overview

The recommendation system now includes intelligent keyword detection that analyzes natural language input to determine user intent. This makes the API more user-friendly by understanding various ways users describe their hosting needs.

## Supported Keywords

### E-commerce Keywords → WooCommerce Hosting (GID 21)
Routes to e-commerce optimized hosting for online stores.

**Keywords:**
- `shop`
- `store`
- `commerce`
- `ecommerce` / `e-commerce`
- `woocommerce`
- `shopping`
- `cart`
- `payment`
- `checkout`
- `product`

**Examples:**
```json
{ "purpose": "shop" }
{ "purpose": "online store" }
{ "purpose": "ecommerce site" }
{ "purpose": "I need a shopping cart" }
```

**Result:** WooCommerce Hosting (GID 21)

---

### WordPress Keywords → WordPress Hosting (GID 20)
Routes to WordPress optimized hosting for blogs, personal sites, and catalogues.

**Keywords:**
- `personal`
- `catalogue` / `catalog`
- `normal`
- `blog`
- `content`
- `article`
- `post`
- `news`
- `magazine`

**Examples:**
```json
{ "purpose": "personal website" }
{ "purpose": "catalogue" }
{ "purpose": "normal blog" }
{ "purpose": "content site" }
```

**Result:** WordPress Hosting (GID 20)

---

### Business Keywords → Business/WordPress Hosting (GID 25 or 20)
Routes to business hosting based on scale requirements.

**Keywords:**
- `corporate`
- `application` / `app`
- `saas`
- `software`
- `enterprise`
- `professional`
- `company`

**Examples:**
```json
{ "purpose": "corporate website", "websites_count": "1" }
// Result: WordPress Hosting (GID 20) - standard requirements

{ "purpose": "SaaS application", "websites_count": "10+", "storage_needed_gb": 100 }
// Result: Business Hosting (GID 25) - high requirements
```

**Result:** 
- GID 20 (WordPress) for standard requirements
- GID 25 (Business) for high volume or large storage

---

### SSL Keywords → SSL Certificates (GID 6)
Routes to SSL certificate products for security needs.

**Keywords:**
- `certificate`
- `secure`
- `ssl`
- `https`
- `security`
- `encryption`
- `tls`

**Examples:**
```json
{ "purpose": "need certificate" }
{ "purpose": "secure my site" }
{ "purpose": "ssl for website" }
```

**Result:** SSL Certificates (GID 6)

---

## How It Works

### Detection Priority

The system checks keywords in this priority order:

1. **SSL** (highest priority) - Security needs
2. **E-commerce** - Online stores
3. **Business** - Corporate/enterprise applications
4. **WordPress** - Personal/blog/catalogue sites

This ensures the most specific intent is detected first.

### Algorithm

```javascript
function detectKeywords(text) {
  const normalized = text.toLowerCase().trim();
  
  // Check SSL keywords first
  if (text contains SSL keywords) return 'ssl';
  
  // Check e-commerce keywords
  if (text contains ecommerce keywords) return 'ecommerce';
  
  // Check business keywords
  if (text contains business keywords) return 'business';
  
  // Check WordPress keywords
  if (text contains wordpress keywords) return 'wordpress';
  
  return null; // No keywords detected
}
```

### Integration with Purpose Field

The keyword detection works alongside the standard `purpose` field:

```javascript
// Standard purpose values still work
{ "purpose": "Blog" } → WordPress Hosting
{ "purpose": "Ecommerce" } → WooCommerce Hosting
{ "purpose": "Business Site" } → WordPress/Business Hosting

// Natural language also works
{ "purpose": "personal blog" } → WordPress Hosting
{ "purpose": "online shop" } → WooCommerce Hosting
{ "purpose": "corporate app" } → WordPress/Business Hosting
```

## Usage Examples

### E-commerce Store
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"shop","websites_count":"1","storage_needed_gb":10}'
```
**Result:** 3 WooCommerce Hosting plans

### Personal Catalogue
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"personal catalogue","websites_count":"1","storage_needed_gb":10}'
```
**Result:** 3 WordPress Hosting plans

### Corporate Application
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"corporate application","websites_count":"1","storage_needed_gb":10}'
```
**Result:** 3 WordPress Hosting plans (standard requirements)

### SaaS Platform (High Volume)
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"SaaS platform","websites_count":"10+","storage_needed_gb":100}'
```
**Result:** 3 Business Hosting plans (high requirements)

### SSL Certificate
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"need secure certificate","websites_count":"1","storage_needed_gb":10}'
```
**Result:** 3 SSL Certificate products

## Benefits

### For Users
1. **Natural Language** - Describe needs in plain English
2. **Flexible Input** - Multiple ways to express the same intent
3. **No Training Required** - Intuitive keyword matching
4. **Better UX** - Don't need to know exact purpose values

### For Developers
1. **Backward Compatible** - Standard purpose values still work
2. **Easy to Extend** - Add new keywords to mappings
3. **Transparent** - Reasoning field shows detected intent
4. **No Breaking Changes** - Existing integrations unaffected

## Extending Keywords

To add new keywords, update the `KEYWORD_MAPPINGS` in `src/services/planMatcher.js`:

```javascript
const KEYWORD_MAPPINGS = {
  ecommerce: ['shop', 'store', 'commerce', /* add new keywords here */],
  wordpress: ['personal', 'catalogue', 'normal', /* add new keywords here */],
  business: ['corporate', 'application', 'saas', /* add new keywords here */],
  ssl: ['certificate', 'secure', 'ssl', /* add new keywords here */]
};
```

## Testing

### Unit Tests
```javascript
const planMatcher = require('./src/services/planMatcher.js');

// Test e-commerce keyword
const result = planMatcher({ 
  purpose: 'shop', 
  websites_count: '1', 
  storage_needed_gb: 10 
});
console.log(result.gid); // 21 (WooCommerce)
console.log(result.reasoning); // "E-commerce/store detected - WooCommerce optimized hosting"
```

### API Tests
```bash
# Test various keywords
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"shop"}'

curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"personal catalogue"}'

curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"corporate application"}'
```

## Keyword Mapping Reference

| User Input | Detected Intent | GID | Hosting Type |
|------------|----------------|-----|--------------|
| "shop" | ecommerce | 21 | WooCommerce |
| "store" | ecommerce | 21 | WooCommerce |
| "commerce" | ecommerce | 21 | WooCommerce |
| "personal" | wordpress | 20 | WordPress |
| "catalogue" | wordpress | 20 | WordPress |
| "normal" | wordpress | 20 | WordPress |
| "corporate" | business | 20/25 | WordPress/Business |
| "application" | business | 20/25 | WordPress/Business |
| "SaaS" | business | 20/25 | WordPress/Business |
| "certificate" | ssl | 6 | SSL |
| "secure" | ssl | 6 | SSL |

## Notes

- Keywords are case-insensitive
- Partial matches work (e.g., "shopping" matches "shop")
- Multiple keywords can be in the same input
- First matching category wins (based on priority)
- Standard purpose values take precedence over keywords
