# WHMCS Attachment Behavior - Complete Guide

## 🎯 Understanding WHMCS Attachments

### Expected Behavior

**IMPORTANT**: WHMCS attachments are **DOWNLOADABLE FILES**, not embedded images.

When you attach an image to a WHMCS ticket:
- ✅ WHMCS shows the **FILENAME** as a clickable link
- ✅ Admin must **CLICK** the filename to download/view the image
- ✅ The image is **NOT** displayed inline in the ticket
- ✅ This is **STANDARD WHMCS BEHAVIOR** for all attachments

### What You See in WHMCS Admin

```
Ticket #12345
Subject: Payment clarification for Invoice #131836

Message:
=== PAYMENT CONFIRMATION ===
Invoice ID: 131836
...

Attachments:
📎 payment-receipt.png  <-- Click this to download
```

## 🔧 Technical Implementation

### API Format

WHMCS OpenTicket API expects attachments in this format:
```
attachment[] = "filename.ext|base64data"
```

For multiple attachments:
```
attachment[] = "file1.png|base64data1"
attachment[] = "file2.jpg|base64data2"
```

### Code Implementation

**Before Fix** (WRONG):
```javascript
// URLSearchParams was creating: attachment[0]=..., attachment[1]=...
// WHMCS doesn't recognize this format
```

**After Fix** (CORRECT):
```javascript
// Now creates: attachment[]=..., attachment[]=...
// WHMCS recognizes this format
```

## 📝 API Usage

### Method 1: Base64 (Recommended)

**Client sends base64-encoded image:**

```javascript
POST /api/confirmPayment
{
  "email": "user@example.com",
  "invoiceId": "131836",
  "details": "Payment made via bank transfer",
  "image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...",
  "image_filename": "payment-receipt.png"
}
```

**Advantages:**
- ✅ No network required
- ✅ Faster (no download)
- ✅ More reliable
- ✅ Works in restricted networks

**Client-side code (JavaScript):**
```javascript
// Convert file to base64
const file = input.files[0];
const reader = new FileReader();
reader.onload = () => {
  const base64 = reader.result.split(',')[1]; // Remove data:image/png;base64, prefix
  
  fetch('/api/confirmPayment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      invoiceId: invoiceId,
      details: 'Payment receipt attached',
      image_base64: base64,
      image_filename: file.name
    })
  });
};
reader.readAsDataURL(file);
```

### Method 2: URL Download (Fallback)

**Client sends image URL:**

```javascript
POST /api/confirmPayment
{
  "email": "user@example.com",
  "invoiceId": "131836",
  "details": "Payment made via bank transfer",
  "image_url": "https://example.com/receipt.png"
}
```

**Disadvantages:**
- ⚠️ Requires network access
- ⚠️ Slower (download time)
- ⚠️ May fail in restricted networks
- ⚠️ Depends on external server

## 🐛 Troubleshooting

### Issue: "WHMCS shows filename but not image"

**This is EXPECTED behavior!** WHMCS attachments are downloadable, not embedded.

**Solution:** Click the filename in WHMCS to download and view the image.

---

### Issue: "Attachment is not downloadable"

**Possible causes:**

1. **WHMCS attachment storage permissions**
   - Check: `/path/to/whmcs/attachments/` directory permissions
   - Solution: Ensure WHMCS can write to attachments directory

2. **Base64 data is corrupted**
   - Check: Verify base64 encoding on client side
   - Solution: Test with known-good base64 image

3. **WHMCS API version doesn't support attachments**
   - Check: WHMCS version (attachments added in v6.0+)
   - Solution: Update WHMCS to latest version

4. **File size exceeds WHMCS limits**
   - Check: WHMCS attachment size settings
   - Solution: Reduce image size or increase WHMCS limits

5. **PHP upload limits**
   - Check: `upload_max_filesize` and `post_max_size` in php.ini
   - Solution: Increase PHP limits

---

### Issue: "Attachment shows as text instead of file"

**Cause:** Array serialization format was incorrect

**Fixed in:** Latest version (attachment[] format)

**Verify fix:**
```bash
node src/test/test-attachment-verification.js
```

## 🧪 Testing

### Run Verification Test

```bash
node src/test/test-attachment-verification.js
```

This test will:
1. ✅ Verify base64 format is valid
2. ✅ Create a test image file
3. ✅ Send attachment to WHMCS
4. ✅ Provide step-by-step verification instructions

### Manual Verification Steps

1. Run the test script
2. Note the ticket ID from output
3. Log into WHMCS admin panel
4. Go to Support > Tickets
5. Open the test ticket
6. Look for "Attachments" section
7. Click the filename to download
8. Verify the downloaded file is a valid image

## 📊 Comparison: Base64 vs URL

| Feature | Base64 Method | URL Method |
|---------|---------------|------------|
| Network Required | ❌ No | ✅ Yes |
| Speed | ⚡ Fast | 🐌 Slower |
| Reliability | ✅ High | ⚠️ Medium |
| Client Complexity | ⚠️ Must encode | ✅ Simple |
| Works Offline | ✅ Yes | ❌ No |
| **Recommendation** | ✅ **Use this** | ⚠️ Fallback only |

## 🎓 Best Practices

1. **Use Base64 method for production**
   - More reliable and faster
   - No external dependencies

2. **Validate image size on client**
   - Recommend max 5MB
   - Compress large images before encoding

3. **Validate image format**
   - Support: PNG, JPG, GIF, PDF
   - Reject: EXE, ZIP, etc.

4. **Provide user feedback**
   - Show upload progress
   - Confirm successful attachment

5. **Handle errors gracefully**
   - Don't fail entire payment confirmation if attachment fails
   - Log attachment errors for debugging

## 📚 References

- WHMCS API Documentation: https://developers.whmcs.com/api-reference/openticket/
- Base64 Encoding: https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL
- URLSearchParams: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams

## ✅ Summary

- ✅ Attachments work correctly with base64 method
- ✅ WHMCS shows attachments as downloadable links (expected)
- ✅ Array serialization fixed (attachment[] format)
- ✅ Comprehensive testing and verification tools provided
- ✅ Client-side implementation examples included
