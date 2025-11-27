# All Possible Keywords for Purpose Parameter

## Complete Keyword Reference

This document lists ALL keywords that the recommendation system recognizes in the `purpose` parameter.

---

## 1. E-commerce Keywords → WooCommerce Hosting (GID 21)

These keywords route to WooCommerce optimized hosting for online stores.

### Primary Keywords
- `shop`
- `store`
- `commerce`
- `ecommerce`
- `e-commerce`
- `woocommerce`

### Shopping Related
- `shopping`
- `cart`
- `checkout`

### Transaction Related
- `payment`
- `product`
- `products`

### Example Usage
```json
{ "purpose": "shop" }
{ "purpose": "online store" }
{ "purpose": "ecommerce site" }
{ "purpose": "shopping cart" }
{ "purpose": "woocommerce" }
{ "purpose": "payment gateway" }
{ "purpose": "product catalogue" }
```

**Total E-commerce Keywords:** 11

---

## 2. WordPress Keywords → WordPress Hosting (GID 20)

These keywords route to WordPress optimized hosting for blogs, personal sites, and content sites.

### Personal/General
- `personal`
- `normal`

### Catalogue/Directory
- `catalogue`
- `catalog`

### Blog/Content
- `blog`
- `content`
- `article`
- `post`

### Publishing
- `news`
- `magazine`

### Example Usage
```json
{ "purpose": "personal" }
{ "purpose": "personal website" }
{ "purpose": "catalogue" }
{ "purpose": "catalog site" }
{ "purpose": "normal blog" }
{ "purpose": "blog" }
{ "purpose": "content site" }
{ "purpose": "article publishing" }
{ "purpose": "news site" }
{ "purpose": "magazine" }
```

**Total WordPress Keywords:** 10

---

## 3. Business Keywords → Business/WordPress Hosting (GID 25 or 20)

These keywords route to Business Hosting (high requirements) or WordPress Hosting (standard requirements).

### Corporate
- `corporate`
- `company`
- `enterprise`
- `professional`

### Applications
- `application`
- `app`
- `software`

### SaaS/Cloud
- `saas`
- `software as a service`

### Example Usage
```json
// Standard requirements → WordPress (GID 20)
{ "purpose": "corporate", "websites_count": "1", "storage_needed_gb": 10 }
{ "purpose": "company website", "websites_count": "1", "storage_needed_gb": 15 }
{ "purpose": "professional site", "websites_count": "1", "storage_needed_gb": 20 }

// High requirements → Business (GID 25)
{ "purpose": "corporate", "websites_count": "10+", "storage_needed_gb": 100 }
{ "purpose": "enterprise application", "websites_count": "10+", "storage_needed_gb": 150 }
{ "purpose": "saas platform", "websites_count": "10+", "storage_needed_gb": 200 }
```

**Total Business Keywords:** 8

---

## 4. SSL Keywords → SSL Certificates (GID 6)

These keywords route to SSL certificate products for security needs.

### Certificate
- `certificate`
- `cert`

### Security
- `secure`
- `security`
- `encryption`

### SSL/TLS
- `ssl`
- `https`
- `tls`

### Example Usage
```json
{ "purpose": "certificate" }
{ "purpose": "need certificate" }
{ "purpose": "secure" }
{ "purpose": "secure my site" }
{ "purpose": "security" }
{ "purpose": "ssl" }
{ "purpose": "https" }
{ "purpose": "encryption" }
{ "purpose": "tls certificate" }
```

**Total SSL Keywords:** 8

---

## 5. Standard Purpose Values (Backward Compatible)

These are the original purpose values that still work:

- `Blog` → WordPress Hosting (GID 20)
- `Ecommerce` → WooCommerce Hosting (GID 21)
- `Business Site` → WordPress/Business Hosting (GID 20/25)
- `Portfolio` → WordPress Hosting (GID 20)
- `Other` → cPanel Hosting (GID 1)

### Example Usage
```json
{ "purpose": "Blog" }
{ "purpose": "Ecommerce" }
{ "purpose": "Business Site" }
{ "purpose": "Portfolio" }
{ "purpose": "Other" }
```

**Total Standard Values:** 5

---

## Complete Keyword List (Alphabetical)

### A-C
- `app`
- `application`
- `article`
- `blog`
- `cart`
- `catalog`
- `catalogue`
- `certificate`
- `cert`
- `checkout`
- `commerce`
- `company`
- `content`
- `corporate`

### D-M
- `e-commerce`
- `ecommerce`
- `encryption`
- `enterprise`
- `https`
- `magazine`

### N-P
- `news`
- `normal`
- `payment`
- `personal`
- `post`
- `product`
- `products`
- `professional`

### S-W
- `saas`
- `secure`
- `security`
- `shop`
- `shopping`
- `software`
- `ssl`
- `store`
- `tls`
- `woocommerce`

**Total Unique Keywords:** 37

---

## Keyword Priority Order

When multiple keywords are detected, the system uses this priority:

1. **SSL Keywords** (Highest Priority)
   - certificate, secure, ssl, https, security, encryption, tls

2. **E-commerce Keywords**
   - shop, store, commerce, ecommerce, woocommerce, shopping, cart, payment, checkout, product

3. **Business Keywords**
   - corporate, application, app, saas, software, enterprise, professional, company

4. **WordPress Keywords** (Lowest Priority)
   - personal, catalogue, catalog, normal, blog, content, article, post, news, magazine

---

## Usage Tips

### Case Insensitive
All keywords work regardless of case:
```json
{ "purpose": "SHOP" } ✓
{ "purpose": "Shop" } ✓
{ "purpose": "shop" } ✓
```

### Partial Matches
Keywords work within longer phrases:
```json
{ "purpose": "I need a shop" } ✓ (contains "shop")
{ "purpose": "personal blog site" } ✓ (contains "personal" and "blog")
{ "purpose": "corporate website" } ✓ (contains "corporate")
```

### Multiple Keywords
When multiple keywords are present, the highest priority wins:
```json
{ "purpose": "secure shop" } → SSL (GID 6) - "secure" has higher priority
{ "purpose": "personal store" } → E-commerce (GID 21) - "store" has higher priority
{ "purpose": "corporate blog" } → Business (GID 20/25) - "corporate" has higher priority
```

### Combining with Other Parameters
Keywords work alongside other parameters:
```json
{
  "purpose": "shop",
  "websites_count": "1",
  "storage_needed_gb": 20,
  "free_domain": true
}
```

---

## Quick Reference Table

| Category | Keywords Count | Routes To | GID |
|----------|---------------|-----------|-----|
| E-commerce | 11 | WooCommerce Hosting | 21 |
| WordPress | 10 | WordPress Hosting | 20 |
| Business | 8 | Business/WordPress | 25/20 |
| SSL | 8 | SSL Certificates | 6 |
| Standard | 5 | Various | 1/20/21/25 |
| **TOTAL** | **42** | - | - |

---

## Testing All Keywords

### Test E-commerce Keywords (11)
```bash
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"shop"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"store"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"commerce"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"ecommerce"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"e-commerce"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"woocommerce"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"shopping"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"cart"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"checkout"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"payment"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"product"}'
```

### Test WordPress Keywords (10)
```bash
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"personal"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"normal"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"catalogue"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"catalog"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"blog"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"content"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"article"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"post"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"news"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"magazine"}'
```

### Test Business Keywords (8)
```bash
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"corporate"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"company"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"enterprise"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"professional"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"application"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"app"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"software"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"saas"}'
```

### Test SSL Keywords (8)
```bash
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"certificate"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"cert"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"secure"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"security"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"encryption"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"ssl"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"https"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"tls"}'
```

### Test Standard Values (5)
```bash
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"Blog"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"Ecommerce"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"Business Site"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"Portfolio"}'
curl -X POST http://localhost:3000/api/recommendations -H "Content-Type: application/json" -d '{"purpose":"Other"}'
```

---

## Summary

**Total Keywords Supported:** 42
- E-commerce: 11 keywords
- WordPress: 10 keywords
- Business: 8 keywords
- SSL: 8 keywords
- Standard: 5 values

**Features:**
- ✅ Case insensitive
- ✅ Partial matching
- ✅ Priority-based detection
- ✅ Backward compatible
- ✅ Natural language support

**All keywords work in the `purpose` parameter to provide intelligent, user-friendly routing to the appropriate hosting solution.**
