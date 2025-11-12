# Quick Reference: Robust Recommendation System

## What Changed?
- ❌ Removed: `cms` parameter
- ❌ Removed: `tech_stack` parameter  
- ✅ Added: Intelligent multi-factor routing
- ✅ Added: Storage tier analysis
- ✅ Added: Reasoning output

## API Request Format

```json
{
  "purpose": "Blog|Business Site|Ecommerce|Portfolio|Other",
  "websites_count": "1|2-3|4-10|10+",
  "storage_needed_gb": 10,
  "needs_ssl": false,
  "needs_reseller": false,
  "free_domain": false
}
```

## Routing Quick Reference

| Input | GID | Hosting Type | Reasoning |
|-------|-----|--------------|-----------|
| `needs_ssl: true` | 6 | SSL Certificates | SSL requested |
| `needs_reseller: true` | 2 | cPanel Reseller | Reseller hosting |
| `purpose: "Ecommerce"` | 21 | WooCommerce | E-commerce optimized |
| `purpose: "Blog"` | 20 | WordPress | Blog optimized |
| `purpose: "Portfolio"` | 20 | WordPress | Portfolio optimized |
| `purpose: "Business Site"` + high volume | 25 | Business | High volume/storage |
| `purpose: "Business Site"` + standard | 20 | WordPress | Standard requirements |
| `websites_count: "10+"` | 25 | Business | High volume |
| `storage_needed_gb: > 50` | 25 | Business | Large storage |
| Default | 1 | cPanel | General purpose |

## Storage Tiers

- **Small:** < 20GB
- **Medium:** 20-50GB  
- **Large:** > 50GB

## Test Commands

```bash
# Blog
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Blog","websites_count":"1","storage_needed_gb":10}'

# E-commerce
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Ecommerce","websites_count":"1","storage_needed_gb":25}'

# Business (high volume)
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Business Site","websites_count":"10+","storage_needed_gb":100}'
```

## Key Improvements

1. **Smarter** - Multi-factor decision making
2. **Simpler** - Fewer parameters to manage
3. **Transparent** - Reasoning explains decisions
4. **Flexible** - Better fallback logic
5. **Scale-aware** - Considers volume + storage together
