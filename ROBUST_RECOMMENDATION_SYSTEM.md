# Robust Recommendation System

## Overview

The recommendation system has been enhanced to provide intelligent hosting plan recommendations based on a priority-based routing algorithm. The system analyzes multiple factors to determine the best hosting solution.

## Removed Parameters

The following parameters have been **removed** for simplicity:
- ❌ `cms` (WordPress, WooCommerce, None)
- ❌ `tech_stack` (Linux, Windows)

## Active Parameters

### Required Parameters
- `purpose` - The primary use case for the website
- `websites_count` - Number of websites to host
- `storage_needed_gb` - Storage requirements in GB

### Optional Parameters
- `needs_ssl` - Boolean flag for SSL certificate requests
- `needs_reseller` - Boolean flag for reseller hosting
- `free_domain` - Boolean flag for free domain preference

## Routing Logic

The system uses a **priority-based routing algorithm** with the following hierarchy:

### Priority 1: SSL Certificates
```json
{ "needs_ssl": true }
```
**Routes to:** GID 6 (SSL Certificates)
**Reasoning:** Dedicated SSL certificate products

### Priority 2: Reseller Hosting
```json
{ "needs_reseller": true }
```
**Routes to:** GID 2 (cPanel Reseller Hosting)
**Reasoning:** For managing multiple client websites

### Priority 3: Purpose-Based Routing

#### E-commerce Sites
```json
{ "purpose": "Ecommerce" }
```
**Routes to:** GID 21 (WooCommerce Hosting)
**Reasoning:** Optimized for online stores with shopping cart, payments, inventory

#### Blog Sites
```json
{ "purpose": "Blog" }
```
**Routes to:** GID 20 (WordPress Hosting)
**Reasoning:** Optimized for content management and blogging

#### Portfolio Sites
```json
{ "purpose": "Portfolio" }
```
**Routes to:** GID 20 (WordPress Hosting)
**Reasoning:** Great for showcasing work with visual themes

#### Business Sites
```json
{ "purpose": "Business Site", "websites_count": "1", "storage_needed_gb": 15 }
```
**Routes to:** GID 20 (WordPress Hosting) for standard requirements

```json
{ "purpose": "Business Site", "websites_count": "10+", "storage_needed_gb": 100 }
```
**Routes to:** GID 25 (Business Hosting) for high volume/storage

**Reasoning:** Business sites route intelligently based on scale

### Priority 4: Intelligent Fallback

#### High Volume Sites
```json
{ "websites_count": "10+" }
```
**Routes to:** GID 25 (Business Hosting)
**Reasoning:** High capacity hosting for 10+ websites

#### Large Storage Requirements
```json
{ "storage_needed_gb": 75 }
```
**Routes to:** GID 25 (Business Hosting)
**Reasoning:** Large storage needs (>50GB)

#### Multi-Site with Medium Storage
```json
{ "websites_count": "4-10", "storage_needed_gb": 30 }
```
**Routes to:** GID 20 (WordPress Hosting)
**Reasoning:** Good balance for multiple sites

### Priority 5: Default Fallback
```json
{ "purpose": "Other" }
```
**Routes to:** GID 1 (cPanel Hosting)
**Reasoning:** General purpose hosting

## Storage Tiers

The system categorizes storage requirements into three tiers:

- **Small:** < 20GB
- **Medium:** 20-50GB
- **Large:** > 50GB

These tiers influence routing decisions for optimal plan matching.

## Website Count Normalization

The system intelligently normalizes various input formats:

| Input | Normalized | Tier |
|-------|-----------|------|
| "1", "one", "single" | "1" | entry |
| "2", "3", "2-3", "two", "three" | "2-3" | mid |
| "4" through "10", "4-10" | "4-10" | upper |
| "10+", "unlimited", ">10" | "10+" | upper |

## Example Requests

### Simple Blog
```json
{
  "purpose": "Blog",
  "websites_count": "1",
  "storage_needed_gb": 10
}
```
**Result:** WordPress Hosting (GID 20), Entry tier

### E-commerce Store
```json
{
  "purpose": "Ecommerce",
  "websites_count": "1",
  "storage_needed_gb": 25
}
```
**Result:** WooCommerce Hosting (GID 21), Entry tier

### High-Volume Business
```json
{
  "purpose": "Business Site",
  "websites_count": "10+",
  "storage_needed_gb": 100
}
```
**Result:** Business Hosting (GID 25), Upper tier

### Portfolio Site
```json
{
  "purpose": "Portfolio",
  "websites_count": "1",
  "storage_needed_gb": 15
}
```
**Result:** WordPress Hosting (GID 20), Entry tier

### Reseller Account
```json
{
  "needs_reseller": true,
  "websites_count": "10+"
}
```
**Result:** cPanel Reseller Hosting (GID 2), Upper tier

### SSL Certificate
```json
{
  "needs_ssl": true
}
```
**Result:** SSL Certificates (GID 6)

## Enhanced Features

### 1. Reasoning Output
Every recommendation now includes a `reasoning` field explaining why that GID was selected:

```javascript
{
  gid: 21,
  minTier: 'entry',
  reasoning: 'E-commerce site requires WooCommerce optimized hosting'
}
```

### 2. Intelligent Business Routing
Business sites are routed based on their actual requirements:
- Standard business sites → WordPress Hosting (GID 20)
- High-volume or large storage → Business Hosting (GID 25)

### 3. Scale-Based Intelligence
The system considers:
- Number of websites (single, few, many, high-volume)
- Storage requirements (small, medium, large)
- Purpose-specific needs

### 4. Smart Storage Filtering
The system uses progressive fallback logic to ensure 3 plans are always shown:
- **Exact matches first:** Plans that meet or exceed storage requirement
- **Small requests (< 20GB):** Shows all plans (users can upgrade)
- **Large requests (≥ 20GB):** Includes plans within 20% of requirement
- **Final fallback:** Uses all available plans if needed

This ensures relevant recommendations even when exact storage matches are limited.

### 5. Robust Fallbacks
Multiple fallback layers ensure appropriate recommendations even with minimal input.

## Testing

Test the system with curl:

```bash
# Blog site
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Blog","websites_count":"1","storage_needed_gb":10}'

# E-commerce
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Ecommerce","websites_count":"1","storage_needed_gb":25}'

# High-volume business
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Business Site","websites_count":"10+","storage_needed_gb":100}'

# Reseller
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"needs_reseller":true,"websites_count":"10+"}'
```

## Response Format

Each plan in the response includes:

1. **Plan Name** - Clear identification
2. **Monthly Price** - In PKR for easy comparison
3. **5 Key Features** - Automatically extracted and deduplicated:
   - Storage capacity (always shown first)
   - Free domain status (if included)
   - Top features from plan description
   - No duplicate information

### Example Response

```
WP Commerce
@PKR 1000/month

✓ 8GB SSD Storage
✓ Free Domain Included
✓ Host 1 Premium Website
✓ Suitable for a large e-commerce site
✓ Free SSL certificate
```

### Feature Extraction

The system intelligently:
- Extracts up to 5 key features per plan
- Prioritizes storage and domain information
- Removes duplicate information (e.g., won't show storage twice)
- Cleans up formatting (removes trailing commas, bullets)
- Filters out redundant features

## Benefits

1. **Simpler API** - Removed unnecessary parameters (CMS, tech_stack)
2. **Smarter Routing** - Multi-factor decision making
3. **Better Transparency** - Reasoning field explains decisions
4. **Flexible Input** - Handles various input formats gracefully
5. **Scale-Aware** - Considers both volume and storage needs
6. **Purpose-Optimized** - Routes to specialized hosting types
7. **Always 3 Plans** - Smart filtering ensures 3 relevant recommendations
8. **Rich Features** - Each plan shows 5 key features for easy comparison
