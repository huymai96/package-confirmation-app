# Environment Variables Template

> Complete list of environment variables for Promos Ink Supply Chain Platform

---

## Quick Setup

Copy the template below to your `.env.local` file (for local development) or Vercel Environment Variables (for production).

```bash
# ============================================
# VERCEL BLOB STORAGE (Required)
# ============================================
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxxxxxx

# ============================================
# UPS API CREDENTIALS
# ============================================
UPS_CLIENT_ID=your_ups_client_id
UPS_CLIENT_SECRET=your_ups_client_secret
UPS_ACCOUNT_NUMBERS=E45A82,W34D92,W34G18,K9Y228

# ============================================
# FEDEX API CREDENTIALS
# ============================================
FEDEX_API_KEY=your_fedex_api_key
FEDEX_SECRET_KEY=your_fedex_secret_key
FEDEX_ACCOUNT_NUMBERS=123456789,987654321

# ============================================
# API AUTHENTICATION KEYS
# ============================================
MANIFEST_UPLOAD_KEY=promos-ink-2024
LABEL_API_KEY=promos-label-2024
SYNC_SECRET=promos-sync-2024
EMAIL_WEBHOOK_SECRET=promos-ink-email-2024
```

---

## Detailed Variable Reference

### Vercel Blob Storage

| Variable | Description | Required | Example | Environments |
|----------|-------------|----------|---------|--------------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage access token. Enables reading/writing manifest files and tracking index. | **Yes** | `vercel_blob_rw_abc123...` | Dev, Staging, Prod |

**How to get:**
1. Go to Vercel Dashboard → Project → Storage
2. Create a Blob store
3. Copy the `BLOB_READ_WRITE_TOKEN`

---

### UPS API Credentials

| Variable | Description | Required | Example | Environments |
|----------|-------------|----------|---------|--------------|
| `UPS_CLIENT_ID` | OAuth 2.0 Client ID from UPS Developer Portal | No* | `abc123def456` | Dev, Staging, Prod |
| `UPS_CLIENT_SECRET` | OAuth 2.0 Client Secret from UPS Developer Portal | No* | `xyz789secret` | Dev, Staging, Prod |
| `UPS_ACCOUNT_NUMBERS` | Comma-separated UPS account numbers for Quantum View subscriptions | No* | `E45A82,W34D92` | Prod |

*Required for UPS tracking functionality

**How to get:**
1. Register at [UPS Developer Kit](https://developer.ups.com)
2. Create an app with "Track API" access
3. Note your Client ID and Client Secret
4. Request Quantum View access for inbound/outbound visibility

**Quantum View Subscription Types:**
- **Inbound (CompanyQVD)**: Packages shipping TO your location
- **Outbound (UserQVD)**: Packages shipping FROM your accounts
- **Third-Party**: Packages billed to third parties

---

### FedEx API Credentials

| Variable | Description | Required | Example | Environments |
|----------|-------------|----------|---------|--------------|
| `FEDEX_API_KEY` | API Key from FedEx Developer Portal | No* | `l7abc123def456` | Dev, Staging, Prod |
| `FEDEX_SECRET_KEY` | Secret Key from FedEx Developer Portal | No* | `secretkey123` | Dev, Staging, Prod |
| `FEDEX_ACCOUNT_NUMBERS` | Comma-separated FedEx account numbers | No* | `123456789,987654321` | Prod |

*Required for FedEx tracking functionality

**How to get:**
1. Register at [FedEx Developer Portal](https://developer.fedex.com)
2. Create a project with "Track API" permission
3. Get your API Key and Secret Key
4. Production credentials require approval process

**Sandbox vs Production:**
- Sandbox URL: `https://apis-sandbox.fedex.com`
- Production URL: `https://apis.fedex.com`

---

### API Authentication Keys

| Variable | Description | Required | Default | Environments |
|----------|-------------|----------|---------|--------------|
| `MANIFEST_UPLOAD_KEY` | API key for manifest upload/delete operations | No | `promos-ink-2024` | Dev, Staging, Prod |
| `LABEL_API_KEY` | API key for label lookup operations | No | `promos-label-2024` | Dev, Staging, Prod |
| `SYNC_SECRET` | Bearer token for sync API | No | `promos-sync-2024` | Dev, Staging, Prod |
| `EMAIL_WEBHOOK_SECRET` | Secret for Make.com webhook | No | `promos-ink-email-2024` | Prod |

**Security Notes:**
- Change default values in production!
- Use strong, unique values for each environment
- Rotate keys periodically

---

## Environment-Specific Configuration

### Development (`dev`)

```bash
# Minimal setup - only blob storage required
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_dev_token

# Use defaults for API keys
# UPS/FedEx optional - system works without them
```

### Staging (`staging`)

```bash
# Full setup with test credentials
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_staging_token

# UPS Sandbox
UPS_CLIENT_ID=sandbox_client_id
UPS_CLIENT_SECRET=sandbox_client_secret
UPS_ACCOUNT_NUMBERS=TEST01

# FedEx Sandbox
FEDEX_API_KEY=sandbox_api_key
FEDEX_SECRET_KEY=sandbox_secret_key
FEDEX_ACCOUNT_NUMBERS=510087100

# Different keys from production
MANIFEST_UPLOAD_KEY=staging-manifest-key
LABEL_API_KEY=staging-label-key
```

### Production (`prod`)

```bash
# Full production setup
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_production_token

# UPS Production
UPS_CLIENT_ID=production_client_id
UPS_CLIENT_SECRET=production_client_secret
UPS_ACCOUNT_NUMBERS=E45A82,W34D92,W34G18,K9Y228

# FedEx Production
FEDEX_API_KEY=production_api_key
FEDEX_SECRET_KEY=production_secret_key
FEDEX_ACCOUNT_NUMBERS=real_account_1,real_account_2

# Strong, unique keys
MANIFEST_UPLOAD_KEY=prod-unique-manifest-key-abc123
LABEL_API_KEY=prod-unique-label-key-def456
SYNC_SECRET=prod-unique-sync-key-ghi789
EMAIL_WEBHOOK_SECRET=prod-unique-webhook-key-jkl012
```

---

## Local Python Scripts

These variables are used in local Python scripts (`build_cloud_index.py`, `upload_master.py`):

```python
# In build_cloud_index.py
API_BASE = "https://package-confirmation-app.vercel.app"  # or localhost for dev
API_KEY = "promos-label-2024"
UPLOAD_KEY = "promos-ink-2024"
```

**For local development:**
```python
API_BASE = "http://localhost:3000"
```

---

## PowerShell Scripts

These variables are used in sync scripts (`cloud-sync.ps1`):

```powershell
# In cloud-sync.ps1
$VERCEL_URL = "https://package-confirmation-app.vercel.app"
$SYNC_SECRET = "promos-sync-2024"
```

---

## Vercel Dashboard Setup

### Adding Environment Variables in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:
   - **Name**: Variable name (e.g., `UPS_CLIENT_ID`)
   - **Value**: The secret value
   - **Environments**: Select which environments (Production, Preview, Development)
5. Click **Save**
6. **Redeploy** for changes to take effect

### Recommended Environment Separation

| Variable | Production | Preview | Development |
|----------|------------|---------|-------------|
| `BLOB_READ_WRITE_TOKEN` | ✅ Prod token | ✅ Staging token | ✅ Dev token |
| `UPS_CLIENT_ID` | ✅ Prod | ❌ | ❌ |
| `UPS_CLIENT_SECRET` | ✅ Prod | ❌ | ❌ |
| `FEDEX_API_KEY` | ✅ Prod | ❌ | ❌ |
| `FEDEX_SECRET_KEY` | ✅ Prod | ❌ | ❌ |
| `MANIFEST_UPLOAD_KEY` | ✅ Unique | ✅ Unique | ✅ Default |
| `LABEL_API_KEY` | ✅ Unique | ✅ Unique | ✅ Default |

---

## Validation Checklist

Before deploying, verify:

- [ ] `BLOB_READ_WRITE_TOKEN` is set and valid
- [ ] API keys are unique for production
- [ ] UPS credentials work (test with `/api/ups?action=track&tracking=1Z...`)
- [ ] FedEx credentials work (test with `/api/fedex?action=track&tracking=...`)
- [ ] Webhook secret matches Make.com configuration
- [ ] Sync secret matches local PowerShell scripts

---

## Troubleshooting

### "BLOB_READ_WRITE_TOKEN not found"

- Ensure the token is set in Vercel Environment Variables
- Redeploy after adding the variable
- Check the token hasn't expired

### "UPS API returns 401"

- Verify `UPS_CLIENT_ID` and `UPS_CLIENT_SECRET` are correct
- Check if using sandbox credentials against production URL
- Ensure OAuth scope includes "Track API"

### "FedEx API returns error"

- Verify API key and secret key are correct
- For production, ensure your app is approved (not sandbox-only)
- Check account numbers are valid

### "Manifest upload returns 401"

- Verify `x-api-key` header matches `MANIFEST_UPLOAD_KEY`
- Check for typos in the key value
- Ensure the key is set for the correct environment

