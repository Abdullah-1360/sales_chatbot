# Purpose Parameter Handling

## Overview
The `purpose` parameter accepts any string value and uses intelligent keyword detection to route requests to the appropriate hosting type.

## How It Works

### 1. Keyword Detection
The system checks the purpose string against predefined keyword mappings:

```javascript
const KEYWORD_MAPPINGS = {
  ecommerce: ['shop', 'store', 'commerce', 'ecommerce', 'e-commerce', 'woocommerce', 
              'shopping', 'cart', 'payment', 'checkout', 'product', 'online store', 'webshop'],
  
  wordpress: ['personal', 'catalogue', 'catalog', 'normal', 'blog', 'content', 'article', 
              'post', 'news', 'magazine', 'wordpress', 'wp', 'website', 'portfolio', 'landing'],
  
  business: ['business', 'corporate', 'application', 'app', 'saas', 'software', 'enterprise', 
             'professional', 'company', 'agency', 'startup', 'organization', 'firm'],
  
  ssl: ['certificate', 'cert', 'secure', 'ssl', 'https', 'security', 'encryption', 'tls']
};
```

### 2. Routing Priority
Keywords are checked in this order:
1. SSL keywords → GID 6 (SSL Certificates)
2. E-commerce keywords → GID 21 (WooCommerce Hosting)
3. Business keywords → GID 25 (Business Hosting)
4. WordPress keywords → GID 20 (WordPress Hosting)

### 3. Fallback Behavior
If no keywords match, the system falls back to:
- **GID 1** (cPanel Hosting) - General purpose hosting

## Supported Purpose Values

### Standard Values
- `"Blog"` → WordPress Hosting (GID 20)
- `"Business Site"` → Business Hosting (GID 25)
- `"Ecommerce"` → WooCommerce Hosting (GID 21)
- `"Portfolio"` → WordPress Hosting (GID 20)
- `"Other"` → cPanel Hosting (GID 1)

### Keyword Detection (Case Insensitive)

#### E-commerce Keywords
- `"shop"`, `"store"`, `"online store"`, `"webshop"`
- `"ecommerce"`, `"e-commerce"`, `"woocommerce"`
- `"shopping"`, `"cart"`, `"checkout"`, `"product"`
- **Routes to:** WooCommerce Hosting (GID 21)

#### WordPress Keywords
- `"wordpress"`, `"wp"`, `"website"`
- `"blog"`, `"content"`, `"article"`, `"post"`
- `"personal"`, `"portfolio"`, `"landing"`
- `"catalogue"`, `"catalog"`, `"magazine"`, `"news"`
- **Routes to:** WordPress Hosting (GID 20)

#### Business Keywords
- `"business"`, `"corporate"`, `"company"`, `"firm"`
- `"agency"`, `"startup"`, `"organization"`
- `"application"`, `"app"`, `"saas"`, `"software"`
- `"enterprise"`, `"professional"`
- **Routes to:** Business Hosting (GID 25)

#### SSL Keywords
- `"ssl"`, `"certificate"`, `"cert"`
- `"secure"`, `"https"`, `"security"`
- `"encryption"`, `"tls"`
- **Routes to:** SSL Certificates (GID 6)

## Examples

### Recognized Keywords

#### Example 1: "wordpress"
```json
{
  "purpose": "wordpress",
  "websites_count": "1",
  "storage_needed_gb": 10
}
```
**Result:** Routes to WordPress Hosting (GID 20)

#### Example 2: "agency"
```json
{
  "purpose": "agency",
  "websites_count": "4-10",
  "storage_needed_gb": 30
}
```
**Result:** Routes to Business Hosting (GID 25)

#### Example 3: "online store"
```json
{
  "purpose": "online store",
  "websites_count": "1",
  "storage_needed_gb": 20
}
```
**Result:** Routes to WooCommerce Hosting (GID 21)

### Unrecognized Values (Fallback)

#### Example 4: "random_stuff"
```json
{
  "purpose": "random_stuff",
  "websites_count": "1",
  "storage_needed_gb": 10
}
```
**Result:** Falls back to cPanel Hosting (GID 1)

**Log:**
```
[INFO] Plan matcher result: {
  "gid": 1,
  "reasoning": "General purpose cPanel hosting (purpose: \"random_stuff\" - no specific routing matched)"
}
```

#### Example 5: Empty or Null
```json
{
  "purpose": null,
  "websites_count": "1",
  "storage_needed_gb": 10
}
```
**Result:** Defaults to "Other", falls back to cPanel Hosting (GID 1)

**Log:**
```
[INFO] Plan matcher result: {
  "gid": 1,
  "reasoning": "General purpose cPanel hosting"
}
```

## Case Insensitivity

All keyword matching is case-insensitive:
- `"WordPress"` = `"wordpress"` = `"WORDPRESS"` ✅
- `"Agency"` = `"agency"` = `"AGENCY"` ✅
- `"Online Store"` = `"online store"` = `"ONLINE STORE"` ✅

## Partial Matching

Keywords work as partial matches within longer phrases:
- `"I need a wordpress site"` → Detects "wordpress" ✅
- `"Building an agency website"` → Detects "agency" ✅
- `"Setting up online store"` → Detects "online store" ✅

## Validation

The `purpose` parameter:
- ✅ Accepts any string value
- ✅ Accepts null (defaults to "Other")
- ✅ Accepts empty string (defaults to "Other")
- ✅ No validation errors for unrecognized values
- ✅ Always returns valid recommendations

## Error Handling

### No Errors Thrown
Unrecognized purpose values do NOT cause errors. The system:
1. Attempts keyword detection
2. Falls back to default routing (GID 1)
3. Returns appropriate plans
4. Logs the unrecognized value for monitoring

### Logging
When an unrecognized purpose is used:
```
[INFO] Plan matcher result: {
  "gid": 1,
  "minTier": "entry",
  "reasoning": "General purpose cPanel hosting (purpose: \"xyz\" - no specific routing matched)"
}
```

This helps identify:
- New keywords that should be added
- User intent patterns
- Potential improvements to routing logic

## Testing

Run the test script to verify purpose handling:
```bash
./test-purpose-handling.sh
```

This tests:
1. Standard purpose values
2. Recognized keywords (wordpress, agency, etc.)
3. Unrecognized values (fallback behavior)
4. Empty/null values
5. Case insensitivity
6. Partial matching

## Adding New Keywords

To add support for new keywords, update the `KEYWORD_MAPPINGS` in `src/services/planMatcher.js`:

```javascript
const KEYWORD_MAPPINGS = {
  business: [
    'business', 'corporate', 'agency',
    'new_keyword_here'  // Add new keyword
  ]
};
```

## Best Practices

1. **Use descriptive purposes** - Helps with keyword detection
2. **Check logs** - Monitor for unrecognized values
3. **Add common keywords** - Improve routing accuracy
4. **Test new keywords** - Verify routing behavior
5. **Document patterns** - Track user intent

## Summary

✅ **Flexible** - Accepts any string value  
✅ **Intelligent** - Keyword detection for routing  
✅ **Robust** - Fallback for unrecognized values  
✅ **Case Insensitive** - Works with any case  
✅ **No Errors** - Always returns valid results  
✅ **Logged** - Unrecognized values are tracked  
