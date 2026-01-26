# CQC API Key Setup Guide

## Current Status

The CQC API is returning `403 Forbidden`, which indicates the API key needs to be properly configured.

## How to Get a CQC API Key

### Option 1: Official CQC API Portal (Recommended)

1. **Visit CQC Developer Portal:**
   - Go to: https://www.cqc.org.uk/about-us/transparency/using-cqc-data
   - Look for "API Access" or "Developer Portal"

2. **Register for API Access:**
   - Create an account on the CQC API portal
   - Request API credentials/subscription key

3. **Get Your API Key:**
   - Once approved, you'll receive an API subscription key
   - This key will look like: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (32 characters)

4. **Update .env File:**
   ```bash
   CQC_API_KEY=your-actual-api-key-here
   ```

5. **Restart API Server:**
   ```bash
   # Stop current server (Ctrl+C)
   pnpm api:dev
   ```

### Option 2: Manual Entry Fallback (Available Now)

If you can't get a CQC API key right away, the system has a **manual fallback mode**:

1. Enter the CQC Location ID
2. If API fails, manually enter all facility details
3. System will still create the facility record

## Testing CQC API Key

Once you have a valid API key, test it:

```bash
# Replace YOUR_API_KEY with your actual key
curl -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" \
     -H "Accept: application/json" \
     "https://api.cqc.org.uk/public/v1/locations/1-101675029"
```

**Expected Response (Success):**
```json
{
  "locationId": "1-101675029",
  "name": "Example Care Home",
  "postalCode": "RG40 2AG",
  ...
}
```

**Error Response (Invalid Key):**
```json
{
  "statusCode": 403,
  "message": "Forbidden"
}
```

## Alternative: Test with Mock Data

For development/testing without a real API key, you can use the manual entry mode:

1. Go to: http://localhost:3000/facilities/new
2. Enter CQC Location ID: `1-999999999` (will fail on purpose)
3. System will show: "Failed to fetch CQC data. Please enter details manually."
4. Fill in all fields manually
5. Click "Create Facility"

This tests the complete workflow without needing a valid CQC API key.

## API Key Header Name

The CQC API uses Azure API Management. The header name should be one of:

- `Ocp-Apim-Subscription-Key` (most common)
- `subscription-key` (alternative)
- Check CQC documentation for the exact header name

## Troubleshooting

### 403 Forbidden
- **Cause**: Invalid API key or wrong header name
- **Solution**: Verify API key from CQC portal, check header name in documentation

### 404 Not Found
- **Cause**: CQC Location ID doesn't exist in database
- **Solution**: Verify the CQC Location ID on https://www.cqc.org.uk/

### 429 Rate Limited
- **Cause**: Too many requests
- **Solution**: Wait 60 seconds before retrying

### Timeout
- **Cause**: CQC API is slow or down
- **Solution**: Use manual entry fallback, try again later

## Current Implementation

The system currently:
- ✅ Validates CQC Location IDs (format: `1-XXXXXXXXX` with 9-11 digits)
- ✅ Attempts to fetch from CQC API with your key
- ✅ Falls back to manual entry if API fails
- ✅ Supports both auto-population and manual entry

## Next Steps

1. **Get Valid API Key:** Contact CQC or register on their developer portal
2. **Update .env:** Add valid key to `CQC_API_KEY=...`
3. **Restart Servers:** Both API and Web servers
4. **Test:** Try onboarding with a real CQC Location ID

For now, you can use the **manual entry mode** to continue testing the system!
