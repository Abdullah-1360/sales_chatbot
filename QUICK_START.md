# Quick Start Guide

## Your Example Request

```json
{
  "purpose": "Business Site",
  "websites_count": "2-3",
  "storage_needed_gb": 25,
  "free_domain": false
}
```

## How It Works

1. **Routes to:** GID 1 (cPanel Hosting)
2. **Filters by:** >= 25GB storage, Mid tier
3. **Scores by:** Diskspace (40%) + Tier (40%) + Free Domain (20%)
4. **Returns:** Top 3 plans

## Expected Response

```json
{
  "version": "v1",
  "content": {
    "messages": [
      {
        "type": "text",
        "text": "Business Pro\n💰 Rs. 850/month | 💾 30GB SSD | 🌐 No Domain\n\n✓ 30GB SSD Storage\n✓ Unlimited Bandwidth\n✓ Free SSL Certificate\n✓ 24/7 Support\n✓ Daily Backups",
        "buttons": [
          {
            "type": "url",
            "caption": "Select This Plan",
            "url": "https://portal.hostbreak.com/order/1/123"
          }
        ]
      }
      // 2 more plans...
    ]
  }
}
```

## Test It

```bash
# Start server
npm start

# Test your example
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{
    "purpose": "Business Site",
    "websites_count": "2-3",
    "storage_needed_gb": 25,
    "free_domain": false
  }'
```

## Core Criteria

1. **Diskspace** - Plans must have >= 25GB
2. **Websites Count** - "2-3" = Mid tier
3. **Free Domain** - false = no preference
4. **Purpose** - "Business Site" = informational

## All Request Options

```json
{
  "purpose": "Blog | Business Site | Ecommerce | Portfolio | Other",
  "websites_count": "1 | 2-3 | 4-10 | 10+ | unlimited",
  "storage_needed_gb": 10,
  "free_domain": false,
  "needs_reseller": false,
  "needs_ssl": false,
  "tech_stack": "Linux | Windows"
}
```

## Documentation

- 📖 `COMPLETE_SYSTEM_SUMMARY.md` - Full overview
- 📋 `SIMPLIFIED_MATCHING_LOGIC.md` - Matching details
- 🚀 `FRONTEND_API_GUIDE.md` - Complete API guide
- 📊 `FINAL_GID_MAPPING.md` - All 8 GIDs

---

**Ready to use!** 🎉
