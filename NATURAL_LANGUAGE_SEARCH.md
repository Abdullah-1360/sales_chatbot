# Natural Language Plan Search

The `/api/plans/search` endpoint now supports natural language queries! Users can describe what they're looking for in plain English, and the system will intelligently parse and filter results.

## How It Works

Everything goes in the `q` parameter. The system automatically extracts:
- Plan name/type
- Price filters
- Diskspace requirements
- Billing period
- Free domain preference

## Supported Query Patterns

### 1. Simple Plan Name
```
GET /api/plans/search?q=wp pro
GET /api/plans/search?q=biz
GET /api/plans/search?q=reseller
```

### 2. Plan with Billing Period
```
GET /api/plans/search?q=wp pro with 2 years
GET /api/plans/search?q=biz plan annually
GET /api/plans/search?q=ssl certificate 1 year
```

**Supported periods:**
- `monthly`, `1 month`
- `quarterly`, `3 months`
- `semiannually`, `6 months`, `semi`
- `annually`, `yearly`, `1 year`
- `biennially`, `2 years`
- `triennially`, `3 years`

### 3. Plan with Price Filter
```
GET /api/plans/search?q=biz plan under 2000
GET /api/plans/search?q=wordpress below 1500
GET /api/plans/search?q=reseller max 3000
GET /api/plans/search?q=ssl above 1000
```

**Supported price keywords:**
- `under`, `below`, `less than`, `max`, `maximum`, `upto`, `up to` → sets max price
- `above`, `over`, `more than`, `min`, `minimum`, `from` → sets min price
- `price 1000`, `cost 1000`, `rs 1000` → sets exact price

### 4. Plan with Diskspace
```
GET /api/plans/search?q=wordpress 10gb
GET /api/plans/search?q=reseller 20 gb
GET /api/plans/search?q=biz 15gb storage
```

**Supported space keywords:**
- `10gb`, `10 gb`, `10g`
- `10 space`, `10 storage`, `10 disk`

### 5. Plan with Free Domain
```
GET /api/plans/search?q=reseller with free domain
GET /api/plans/search?q=biz freedomain
GET /api/plans/search?q=wordpress with domain
```

### 6. Complex Combinations
```
GET /api/plans/search?q=biz plan under 2000 with 2 years
GET /api/plans/search?q=wordpress 10gb annually under 6000
GET /api/plans/search?q=reseller with free domain under 3000
GET /api/plans/search?q=ssl certificate under 5000 annually
```

## Response Format

```json
{
  "success": true,
  "query": "wp pro with 2 years",
  "parsed": {
    "planName": "wp pro",
    "filters": {
      "period": "biennially"
    }
  },
  "count": 3,
  "results": [
    {
      "name": "Pro Plan",
      "description": "Professional hosting, Advanced features, Premium support",
      "diskspace": "20",
      "freedomain": true,
      "price": {
        "monthly": "2500.00",
        "biennially": "48000.00"
      },
      "link": "https://portal.hostbreak.com/order/1/213"
    }
  ]
}
```

## Examples with Results

### Example 1: "biz plan under 2000"
**Parsed:**
- Plan name: "biz"
- Max price: 2000 (monthly)

**Results:** BIZ-5 Plan (1500), BIZ-10 Plan (2000)

### Example 2: "wp pro with 2 years"
**Parsed:**
- Plan name: "wp pro"
- Period: biennially

**Results:** Pro Plan, WP Studio, WP Agency (with 2-year pricing)

### Example 3: "wordpress 10gb annually"
**Parsed:**
- Plan name: "wordpress"
- Min space: 10GB
- Period: annually

**Results:** WordPress plans with 10GB+ storage (annual pricing shown)

## Smart Features

1. **Automatic Keyword Expansion**: "wp" finds "WordPress" plans
2. **Filler Word Removal**: "with", "and", "for", "the" are ignored
3. **Case Insensitive**: Works with any capitalization
4. **Flexible Syntax**: Multiple ways to express the same thing
5. **Top 3 Results**: Returns most relevant matches
6. **Exact Match Priority**: If query exactly matches a plan name, returns only that plan

## Testing

```bash
# Test various natural language queries
curl "http://localhost:3000/api/plans/search?q=wp%20pro%20with%202%20years"
curl "http://localhost:3000/api/plans/search?q=biz%20plan%20under%202000"
curl "http://localhost:3000/api/plans/search?q=reseller%20with%20free%20domain"
curl "http://localhost:3000/api/plans/search?q=wordpress%2010gb%20annually"
```
