# Text Response Format Guide

## Response Structure

The API now returns **text messages with buttons** instead of cards.

## Format

```json
{
  "version": "v1",
  "content": {
    "messages": [
      {
        "type": "text",
        "text": "Plan Name\n💰 Rs. X/month | 💾 XGB SSD | 🌐 Free Domain",
        "buttons": [
          {
            "type": "url",
            "caption": "Select This Plan",
            "url": "https://portal.hostbreak.com/order/..."
          }
        ]
      },
      {
        "type": "text",
        "text": "Another Plan\n💰 Rs. Y/month | 💾 YGB SSD | 🌐 No Domain",
        "buttons": [
          {
            "type": "url",
            "caption": "Select This Plan",
            "url": "https://portal.hostbreak.com/order/..."
          }
        ]
      }
    ],
    "actions": [],
    "quick_replies": []
  }
}
```

## Example Response

### Request:
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"tech_stack":"Windows"}'
```

### Response:
```json
{
  "version": "v1",
  "content": {
    "messages": [
      {
        "type": "text",
        "text": "Pro Plan (Windows)\n💰 Rs. 650/month | 💾 5GB SSD | 🌐 Free Domain",
        "buttons": [
          {
            "type": "url",
            "caption": "Select This Plan",
            "url": "https://portal.hostbreak.com/order/28/217"
          }
        ]
      },
      {
        "type": "text",
        "text": "Standard Plan (Windows)\n💰 Rs. 525/month | 💾 3GB SSD | 🌐 Free Domain",
        "buttons": [
          {
            "type": "url",
            "caption": "Select This Plan",
            "url": "https://portal.hostbreak.com/order/28/216"
          }
        ]
      },
      {
        "type": "text",
        "text": "Entry Plan (Windows)\n💰 Rs. 225/month | 💾 1GB SSD | 🌐 No Domain",
        "buttons": [
          {
            "type": "url",
            "caption": "Select This Plan",
            "url": "https://portal.hostbreak.com/order/28/214"
          }
        ]
      }
    ],
    "actions": [],
    "quick_replies": []
  }
}
```

## Message Format

Each message contains:

### Text Field
```
Plan Name
💰 Rs. X/month | 💾 XGB SSD | 🌐 Free Domain
```

- **Line 1:** Plan name
- **Line 2:** Price, Storage, Domain status (separated by `|`)

### Buttons Array
```json
[
  {
    "type": "url",
    "caption": "Select This Plan",
    "url": "https://portal.hostbreak.com/order/GID/PID"
  }
]
```

## Text Components

### Price
- Format: `💰 Rs. X/month`
- Calculated from PKR annual price / 12
- Rounded to nearest integer
- Example: `💰 Rs. 650/month`

### Storage
- Format: `💾 XGB SSD` or `💾 ∞ Unlimited`
- Shows disk space allocation
- Examples:
  - `💾 5GB SSD`
  - `💾 ∞ Unlimited`

### Domain
- Format: `🌐 Free Domain` or `🌐 No Domain`
- Indicates if plan includes free domain
- Examples:
  - `🌐 Free Domain` (freedomain = true)
  - `🌐 No Domain` (freedomain = false)

## Button Configuration

Each message has one button:
- **Type:** `url`
- **Caption:** `"Select This Plan"`
- **URL:** Direct link to WHMCS order page

## Empty Response

When no plans match:
```json
{
  "version": "v1",
  "content": {
    "messages": [
      {
        "type": "text",
        "text": "No hosting plans found matching your requirements.",
        "buttons": []
      }
    ],
    "actions": [],
    "quick_replies": []
  }
}
```

## Error Handling

If a plan fails to format:
```json
{
  "type": "text",
  "text": "Plan Name\nError loading plan details",
  "buttons": [
    {
      "type": "url",
      "caption": "View Details",
      "url": "https://portal.hostbreak.com"
    }
  ]
}
```

## Complete Examples

### WordPress Hosting
```json
{
  "type": "text",
  "text": "WordPress Starter\n💰 Rs. 450/month | 💾 10GB SSD | 🌐 Free Domain",
  "buttons": [
    {
      "type": "url",
      "caption": "Select This Plan",
      "url": "https://portal.hostbreak.com/order/20/101"
    }
  ]
}
```

### WooCommerce Hosting
```json
{
  "type": "text",
  "text": "WooCommerce Pro\n💰 Rs. 850/month | 💾 20GB SSD | 🌐 Free Domain",
  "buttons": [
    {
      "type": "url",
      "caption": "Select This Plan",
      "url": "https://portal.hostbreak.com/order/21/105"
    }
  ]
}
```

### Reseller Hosting
```json
{
  "type": "text",
  "text": "cPanel Reseller Bronze\n💰 Rs. 1200/month | 💾 50GB SSD | 🌐 No Domain",
  "buttons": [
    {
      "type": "url",
      "caption": "Select This Plan",
      "url": "https://portal.hostbreak.com/order/2/201"
    }
  ]
}
```

### SSL Certificate
```json
{
  "type": "text",
  "text": "Comodo PositiveSSL\n💰 Rs. 350/month | 💾 N/A | 🌐 No Domain",
  "buttons": [
    {
      "type": "url",
      "caption": "Select This Plan",
      "url": "https://portal.hostbreak.com/order/6/301"
    }
  ]
}
```

## Testing

```bash
# Test Windows hosting
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"tech_stack":"Windows"}'

# Test WordPress
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"cms":"WordPress"}'

# Test WooCommerce
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"cms":"WooCommerce"}'

# Test Reseller
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"needs_reseller":true}'
```

## Advantages

✅ **Simpler format** - No nested card/element structure  
✅ **Better for chatbots** - Direct text messages  
✅ **Cleaner display** - Plan name on separate line  
✅ **Easy to parse** - Flat structure  
✅ **Mobile-friendly** - Text messages work everywhere  

## Files Modified

- ✅ `src/controllers/recommendation.js` - Changed from cards to text format

---

**Status:** ✅ Response format changed to text with buttons  
**Format:** `{"type": "text", "text": "...", "buttons": [...]}`  
**Compatibility:** Works with all messaging platforms
