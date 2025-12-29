# Ticket Keyword Improvements

## Problem with Previous Keywords

The previous ticket system used technical terminology that customers might not understand:
- **"cPHulk"** - Technical name that doesn't explain what it does
- **"CSF"** or **"ConfigServer Firewall"** - Technical jargon

## New User-Friendly Keywords

### For CSF Issues → "Firewall System"
- **Before**: "cPHulk IP Whitelisting"
- **After**: "Firewall System IP Whitelisting"

### For cPHulk Issues → "Anti-Brute Force System"  
- **Before**: "cPHulk IP Whitelisting"
- **After**: "Anti-Brute Force System IP Whitelisting"

## Implementation Details

### Dynamic Subject Line
The ticket subject is now dynamically generated based on the issue type:

```javascript
if (workflowResult.csfAnalysis?.csf?.inDenyList) {
  // CSF issue detected - use Firewall System terminology
  ticketSubject = `Firewall System IP Whitelisting - ${ip} ${domain ? `(${domain})` : ''}`;
} else {
  // cPHulk issue - use Anti-Brute Force System terminology
  ticketSubject = `Anti-Brute Force System IP Whitelisting - ${ip} ${domain ? `(${domain})` : ''}`;
}
```

### Updated Content Keywords

#### CSF-Related Content
- **Before**: "CSF analysis", "ConfigServer Firewall (CSF)"
- **After**: "Firewall System Analysis", "Firewall System (ConfigServer Security & Firewall)"
