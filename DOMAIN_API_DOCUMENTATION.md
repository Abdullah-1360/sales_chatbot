# Domain Availability API Documentation

## Overview
The Domain Availability API performs real-time WHOIS lookups to check if domains are available for registration and provides intelligent suggestions for alternative domains when the requested domain is not available. It uses live domain queries for accurate, up-to-date availability information.

## Endpoints

### 1. Single Domain Check
**POST** `/api/domain/check`

Check availability of a single domain and get suggestions if not available.

#### Request Body
```json
{
  "domain": "example.com"
}
```

#### Response (Available)
```json
{
  "success": true,
  "domain": "example.com",
  "available": true,
  "message": "Domain is available for registration!",
  "suggestions": [],
  "source": "whois_lookup"
}
```

#### Response (Not Available with Suggestions)
```json
{
  "success": true,
  "domain": "google.com",
  "available": false,
  "message": "Domain is not available",
  "suggestions": [
    "mygoogle.com",
    "getgoogle.com",
    "google.pk"
  ],
  "suggestionsCount": 3,
  "checkedSuggestions": 5,
  "registrar": "MarkMonitor, Inc.",
  "expirationDate": null
}
```

### 2. Bulk Domain Check
**POST** `/api/domain/bulk-check`

Check availability of multiple domains at once (max 10).

#### Request Body
```json
{
  "domains": [
    "example1.com",
    "example2.net",
    "example3.org"
  ]
}
```

#### Response
```json
{
  "success": true,
  "results": [
    {
      "domain": "example1.com",
      "available": true,
      "message": "Available"
    },
    {
      "domain": "example2.net",
      "available": false,
      "message": "Not available"
    },
    {
      "domain": "example3.org",
      "available": true,
      "message": "Available"
    }
  ],
  "totalChecked": 3,
  "availableCount": 2
}
```

## WHOIS Analysis Engine

The system uses advanced WHOIS data analysis to determine domain availability:

### Availability Indicators
**Domain is AVAILABLE when WHOIS contains:**
- "No match"
- "Not found" 
- "No data found"
- "Domain not found"
- "Not registered"
- "Available for registration"

### Taken Indicators  
**Domain is TAKEN when WHOIS contains:**
- Registrar information
- Creation/expiration dates
- Name servers
- Registrant details
- Admin/technical contacts

### Analysis Logic
1. **Definitive Available**: Clear "not found" patterns → Available
2. **Multiple Taken Indicators**: 2+ registration details → Taken  
3. **Minimal Data**: <200 chars, no indicators → Likely Available
4. **Unclear Status**: Conservative approach → Assume Taken

## Domain Suggestion Algorithm

When a domain is not available, the system generates intelligent suggestions using:

### 1. TLD Alternatives
- `.com` → `.net`, `.org`, `.pk`, `.co`, `.io`, `.biz`, `.info`
- Keeps the same domain name with different extensions

### 2. Prefix Variations
- `example.com` → `myexample.com`, `getexample.com`, `theexample.com`
- Common prefixes: `my`, `get`, `the`, `new`, `best`, `top`

### 3. Suffix Variations  
- `example.com` → `exampleapp.com`, `exampleweb.com`, `examplesite.com`
- Common suffixes: `app`, `web`, `site`, `online`, `pro`, `hub`, `zone`

### 4. Hyphenated Versions
- `example.com` → `example-online.com`, `example-web.com`, `get-example.com`

### 5. Numeric Variations
- `example.com` → `example1.com`, `example2.com`, etc.

## Validation Rules

### Domain Format
- Must be a valid domain format: `name.tld`
- Minimum 2 character TLD
- Alphanumeric characters and hyphens allowed
- Cannot start or end with hyphen

### Examples
✅ **Valid:**
- `example.com`
- `my-site.net`
- `test123.pk`

❌ **Invalid:**
- `example` (no TLD)
- `-example.com` (starts with hyphen)
- `example-.com` (ends with hyphen)
- `example.c` (TLD too short)

## Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "message": "Please provide a valid domain name (e.g., example.com)",
  "field": "domain"
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Domain check failed",
  "error": "Connection timeout"
}
```

## Usage Examples

### JavaScript/Node.js
```javascript
// Single domain check
const response = await fetch('/api/domain/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ domain: 'example.com' })
});

const result = await response.json();
if (result.available) {
  console.log('Domain is available!');
} else {
  console.log('Suggestions:', result.suggestions);
}
```

### cURL
```bash
# Single domain check
curl -X POST http://localhost:4000/api/domain/check \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'

# Bulk domain check
curl -X POST http://localhost:4000/api/domain/bulk-check \
  -H "Content-Type: application/json" \
  -d '{"domains": ["example1.com", "example2.net"]}'
```

### Python
```python
import requests

# Single domain check
response = requests.post('http://localhost:4000/api/domain/check', 
                        json={'domain': 'example.com'})
result = response.json()

if result['available']:
    print('Domain is available!')
else:
    print('Suggestions:', result['suggestions'])
```

## Real-time WHOIS Integration

The domain availability check uses real-time WHOIS lookups for accurate results:

- **Primary Method**: Direct WHOIS queries using `whois-json` package
- **Live Data**: Real-time domain status from authoritative sources
- **Multi-TLD Support**: Supports .com, .net, .org, .pk, .io and many others
- **Intelligent Analysis**: Advanced WHOIS data parsing to determine availability
- **Fallback Handling**: Error analysis for edge cases and network issues
- **Rate Limiting**: 1-second delays between WHOIS requests to respect servers

## Rate Limiting

- Single domain checks: No limit (but WHOIS servers may rate limit)
- Bulk checks: Maximum 10 domains per request
- Automatic 1-second delay between WHOIS requests
- Respects WHOIS server rate limits to avoid blocking
- Suggestion checks limited to 5 domains to balance speed and accuracy

## Performance

- Single domain check: ~2-5 seconds (real-time WHOIS lookup)
- Bulk domain check: ~10-30 seconds (depending on count, with rate limiting)
- Suggestion generation: ~5-15 seconds (checks 5 alternatives with delays)
- Caching: Not implemented (real-time checks for maximum accuracy)
- Timeout: 10-second timeout per WHOIS request

## Configuration

The Domain API uses real-time WHOIS lookups and requires no additional configuration. The `whois-json` package is automatically installed and configured.

### Dependencies
```bash
npm install whois-json
```

### Optional Environment Variables
```env
# No specific configuration needed for WHOIS lookups
# The system automatically detects and queries appropriate WHOIS servers
```

## Testing

Run the test suite:
```bash
node test-domain-api.js
```

This will test:
- Available domain detection
- Unavailable domain with suggestions
- Bulk domain checking
- Input validation
- Error handling

## Frontend Integration

The domain API is designed to work seamlessly with chatbots and frontend applications:

1. **User asks**: "Is example.com available?"
2. **Bot calls**: `POST /api/domain/check`
3. **Bot responds**: 
   - If available: "Yes! example.com is available for registration."
   - If not: "Sorry, example.com is taken. Here are some alternatives: myexample.com, example.net, exampleapp.com"

## Status Codes

- `200` - Success (domain checked)
- `400` - Bad Request (invalid domain format)
- `500` - Server Error (WHMCS API failure)

## Limitations

- Depends on WHOIS server availability and response times
- Real-time checks (no caching for maximum accuracy)
- Some TLD WHOIS servers may have rate limiting or access restrictions
- Network timeouts may affect response times
- Suggestion algorithm is heuristic-based
- Conservative approach: assumes domains are taken when WHOIS data is unclear

## Future Enhancements

- Premium domain suggestions
- Price information for available domains
- Bulk registration support
- Domain monitoring/alerts
- Advanced suggestion algorithms using AI