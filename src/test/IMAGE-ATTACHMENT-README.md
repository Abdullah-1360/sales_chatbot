# Image Attachment Feature - Confirm Payment

## Overview
The `/api/confirmPayment` endpoint now supports attaching payment receipt images to support tickets in WHMCS.

## Feature Implementation

### Request Format

**Option 1: Base64 Image (Recommended)**
```json
{
  "email": "user@example.com",
  "invoiceId": "131836",
  "details": "Bank transfer completed. Transaction ID: TXN123456789",
  "image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...",
  "image_filename": "payment-receipt.png"
}
```

**Option 2: Image URL (Requires network access)**
```json
{
  "email": "user@example.com",
  "invoiceId": "131836",
  "details": "Bank transfer completed. Transaction ID: TXN123456789",
  "image_url": "https://example.com/payment-receipt.jpg"
}
```

### Response Format
```json
{
  "success": true,
  "paid": false,
  "ticketId": "407148",
  "invoiceId": "131836",
  "attachmentIncluded": true,
  "message": "I've opened a support ticket (#407148) for our billing team to verify your payment for Invoice #131836. Payment receipt attached."
}
```

## How It Works

### 1. Image Download
```javascript
// Downloads image from provided URL
const imageInfo = await downloadImage(image_url);
```

**Features:**
- Validates URL protocol (HTTP/HTTPS only)
- Validates content type (must be image/*)
- 30-second timeout
- 10MB max file size
- Generates unique filename

### 2. Image Processing
```javascript
// Convert to base64 for WHMCS API
const base64Data = imageToBase64(imageInfo.filepath);
```

**Supported Formats:**
- PNG (.png)
- JPEG (.jpg, .jpeg)
- GIF (.gif)
- WebP (.webp)
- BMP (.bmp)
- SVG (.svg)

### 3. WHMCS Attachment
```javascript
// Attach to ticket
attachments: [{
  filename: 'payment-receipt-abc123.jpg',
  data: base64Data
}]
```

**WHMCS API Format:**
```
attachments[0] = "filename.ext|base64data"
```

### 4. Cleanup
```javascript
// Automatically removes temp file
cleanupTempFile(tempFilePath);
```

## Implementation Details

### Files Created/Modified

1. **src/utils/imageHelper.js** (NEW)
   - `downloadImage(url)` - Downloads image from URL
   - `imageToBase64(filepath)` - Converts to base64
   - `cleanupTempFile(filepath)` - Removes temp file
   - `getExtensionFromMimeType(mime)` - Gets file extension

2. **src/services/whmcsService.js** (MODIFIED)
   - Added `attachments` parameter to `openTicket()`
   - Formats attachments for WHMCS API

3. **src/controllers/billingController.js** (MODIFIED)
   - Added `image_url` parameter handling
   - Downloads and processes image
   - Attaches to ticket
   - Graceful error handling

## Security Features

### URL Validation
```javascript
// Only HTTP/HTTPS allowed
const url = new URL(imageUrl);
if (!['http:', 'https:'].includes(url.protocol)) {
  throw new Error('Invalid URL protocol');
}
```

### Content Type Validation
```javascript
// Must be an image
if (!contentType.startsWith('image/')) {
  throw new Error('Invalid content type');
}
```

### File Size Limit
```javascript
// Max 10MB
maxContentLength: 10 * 1024 * 1024
```

### Timeout Protection
```javascript
// 30 second timeout
timeout: 30000
```

## Error Handling

### Graceful Fallback
If image download/processing fails, the ticket is still created without the attachment:

```javascript
try {
  // Download and attach image
} catch (imageError) {
  console.log('Warning: Could not process image');
  // Continue without image - don't fail the whole request
  ticketMessage += '\n\nCould not attach image: ' + error.message;
}
```

### Error Messages in Ticket
If image fails, the ticket message includes the error:
```
=== ATTACHMENT ERROR ===
Could not attach image: Failed to download image: timeout of 30000ms exceeded
```

## Ticket Message Format

### With Image
```
=== PAYMENT CONFIRMATION ===
Invoice ID: 131836
Invoice Total: 7800.00
Invoice Balance: 7800.00
Due Date: 2025-12-15

=== PAYMENT DETAILS ===
Bank transfer completed. Transaction ID: TXN123456789

=== ATTACHMENT ===
Payment receipt image attached: payment-receipt-abc123.jpg
```

### Without Image
```
=== PAYMENT CONFIRMATION ===
Invoice ID: 131836
Invoice Total: 7800.00
Invoice Balance: 7800.00
Due Date: 2025-12-15

=== PAYMENT DETAILS ===
Bank transfer completed. Transaction ID: TXN123456789
```

## Testing

### Test File
`src/test/test-confirm-payment-with-image.js`

### Run Tests
```bash
node src/test/test-confirm-payment-with-image.js
```

### Test Cases
1. ✅ PNG image attachment
2. ✅ JPG image attachment
3. ✅ Small image attachment
4. ✅ Without image (backward compatibility)
5. ⚠️  Invalid URL (graceful fallback)
6. ⚠️  Non-image content (graceful fallback)

## Use Cases

### Use Case 1: Mobile App Payment
**Scenario:** User takes photo of bank receipt and uploads

**Request:**
```json
{
  "email": "user@example.com",
  "invoiceId": "131836",
  "details": "Bank transfer receipt attached",
  "image_url": "https://app.example.com/uploads/receipt-123.jpg"
}
```

**Result:**
- Image downloaded from app server
- Attached to WHMCS ticket
- Billing team can view receipt directly

### Use Case 2: Screenshot Upload
**Scenario:** User uploads screenshot of online payment confirmation

**Request:**
```json
{
  "email": "user@example.com",
  "invoiceId": "131836",
  "details": "PayPal payment confirmation screenshot",
  "image_url": "https://cdn.example.com/screenshots/payment-abc.png"
}
```

**Result:**
- Screenshot attached to ticket
- Billing team can verify payment details

### Use Case 3: Chatbot Integration
**Scenario:** User sends image in chat, bot uploads and confirms payment

**Flow:**
1. User: "I paid invoice #131836" + [image]
2. Bot uploads image to CDN
3. Bot calls `/api/confirmPayment` with image URL
4. Ticket created with image attached
5. Bot: "Ticket #407148 created with your receipt"

## Chatbot Integration Example

```javascript
// User sends image in chat
const userImage = message.attachments[0];

// Upload to CDN/storage
const imageUrl = await uploadToCDN(userImage);

// Confirm payment with image
const response = await axios.post('/api/confirmPayment', {
  email: user.email,
  invoiceId: extractInvoiceId(message.text),
  details: message.text,
  image_url: imageUrl
});

// Respond to user
if (response.data.attachmentIncluded) {
  bot.reply('✅ Payment confirmation ticket created with your receipt attached!');
} else {
  bot.reply('✅ Payment confirmation ticket created!');
}
```

## Limitations

### WHMCS API Limitations
- Attachment size limits depend on WHMCS configuration
- Some WHMCS versions may not support attachments
- Base64 encoding increases data size by ~33%

### Current Implementation
- Downloads to temp directory (requires disk space)
- Synchronous processing (blocks during download)
- Single image per request

## Future Enhancements

### Planned Features
1. 🔄 Multiple image support
2. 🔄 Direct base64 upload (skip download)
3. 🔄 Image compression/optimization
4. 🔄 Async processing with queue
5. 🔄 Image preview in response
6. 🔄 Support for PDF receipts

### Possible Improvements
- Add image validation (dimensions, quality)
- Add virus scanning
- Add watermarking
- Add OCR for automatic data extraction
- Add thumbnail generation

## Troubleshooting

### Issue: Image not attached
**Possible Causes:**
1. WHMCS API doesn't support attachments
2. File size too large
3. Invalid base64 encoding
4. WHMCS permissions

**Solution:**
- Check WHMCS version and API capabilities
- Verify attachment appears in WHMCS admin
- Check WHMCS error logs

### Issue: Download timeout
**Possible Causes:**
1. Slow image server
2. Large file size
3. Network issues

**Solution:**
- Increase timeout (currently 30s)
- Use CDN for faster downloads
- Compress images before upload

### Issue: Temp files not cleaned up
**Possible Causes:**
1. Process crash before cleanup
2. Permission issues

**Solution:**
- Implement periodic cleanup job
- Check temp directory permissions
- Monitor disk space

## Environment Variables

No new environment variables required. Uses existing:
```env
BILLING_DEPTID=3
BILLING_DEPTNAME=Billing
```

## Dependencies

### Required Packages
- `axios` - HTTP client for downloading images
- `fs` - File system operations
- `path` - File path handling
- `crypto` - Generate unique filenames

### No Additional Installation
All dependencies already included in project.

## API Documentation Update

### Updated Endpoint: POST /api/confirmPayment

**Request Body:**
```json
{
  "clientId": "string",           // Required (or use email)
  "email": "string",              // Alternative to clientId
  "invoiceId": "string",          // Required
  "details": "string",            // Optional payment details
  "image_url": "string"           // Optional payment receipt image URL
}
```

**Response:**
```json
{
  "success": true,
  "paid": false,
  "ticketId": "407148",
  "invoiceId": "131836",
  "attachmentIncluded": true,     // NEW: Indicates if image was attached
  "message": "I've opened a support ticket (#407148) for our billing team to verify your payment for Invoice #131836. Payment receipt attached."
}
```

## Related Documentation
- See `CONFIRM-PAYMENT-README.md` for endpoint documentation
- See `CONFIRM-PAYMENT-UPDATES.md` for changelog
- See `API-ENDPOINTS.md` for complete API documentation

---

**Last Updated:** December 6, 2025
**Version:** 1.2
**Status:** Production Ready ✅
