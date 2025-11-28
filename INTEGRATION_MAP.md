# Integration Map

> Complete documentation of external integrations and inter-service communication

---

## Table of Contents

1. [Integration Overview](#integration-overview)
2. [Inbound Integrations](#inbound-integrations)
3. [Outbound Integrations](#outbound-integrations)
4. [Internal Communication](#internal-communication)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Authentication Summary](#authentication-summary)
7. [Error Handling](#error-handling)

---

## Integration Overview

### System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌─────────────────┐     ┌──────────────────────────────────────────────┐   │
│  │   Email/SMTP    │────>│              Make.com                        │   │
│  │  (SanMar, S&S)  │     │         (Email Automation)                   │   │
│  └─────────────────┘     └────────────────┬─────────────────────────────┘   │
│                                           │                                 │
│                                           │ POST /api/email-webhook         │
│                                           ▼                                 │
│  ┌─────────────────┐     ┌──────────────────────────────────────────────┐   │
│  │  CustomInk/     │────>│                                              │   │
│  │  OOShirts Web   │     │      Package Confirmation App                │   │
│  │  (QC Scraper)   │     │      (Vercel + Next.js)                      │   │
│  └─────────────────┘     │                                              │   │
│         │                │  • API Routes                                │   │
│         │                │  • Blob Storage                              │   │
│         │                │  • Tracking Index                            │   │
│         │                │                                              │   │
│  ┌──────▼──────────┐     │                                              │   │
│  │  build_cloud_   │────>│                                              │   │
│  │  index.py       │     └──────────────────────────────────────────────┘   │
│  │  (This PC)      │                         │                              │
│  └─────────────────┘                         │                              │
│                                              │ Query APIs                   │
│                                              ▼                              │
│  ┌─────────────────┐     ┌──────────────────────────────────────────────┐   │
│  │  Label Print    │<────│           Warehouse Floor                    │   │
│  │  GUI (Cloud)    │     │                                              │   │
│  └─────────────────┘     │  • Inbound Receiving                         │   │
│                          │  • Outbound Shipping                         │   │
│  ┌─────────────────┐     │  • Label Printing                            │   │
│  │  Label Print    │<────│                                              │   │
│  │  GUI (Offline)  │     └──────────────────────────────────────────────┘   │
│  └─────────────────┘                                                        │
│                                                                             │
│  ┌─────────────────┐     ┌──────────────────────────────────────────────┐   │
│  │  UPS Quantum    │────>│          cloud-sync.ps1                      │   │
│  │  View Portal    │     │       (Sync to Cloud)                        │   │
│  └─────────────────┘     └──────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   External Carrier APIs                              │    │
│  │  ┌───────────────────────┐    ┌────────────────────────┐            │    │
│  │  │     UPS Track API     │    │    FedEx Track API     │            │    │
│  │  │   (OAuth 2.0)         │    │     (OAuth 2.0)        │            │    │
│  │  └───────────────────────┘    └────────────────────────┘            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Inbound Integrations

### 1. Make.com Email Webhook

**Purpose:** Automated ingestion of supplier shipping manifests from email.

| Attribute | Value |
|-----------|-------|
| **Provider** | Make.com (formerly Integromat) |
| **Trigger** | Email received to monitored inbox |
| **Target** | `POST /api/email-webhook` |
| **Auth** | `x-webhook-secret` header |

#### Data Received

```json
{
  "from": "shipping@sanmar.com",
  "subject": "Daily Shipping Manifest",
  "date": "2025-11-28T15:00:00Z",
  "attachments": [
    {
      "filename": "PromoInk_20251128.csv",
      "contentType": "text/csv",
      "data": "<base64-encoded-content>"
    }
  ]
}
```

**Alternative: URL-based attachment**

```json
{
  "attachments": [
    {
      "filename": "shipment.xlsx",
      "url": "https://make.com/temp/file123.xlsx"
    }
  ]
}
```

#### Processing Flow

1. Make.com monitors `shipping@promosink.com` inbox
2. Filters emails by sender domain (sanmar.com, ssactivewear.com)
3. Extracts attachments (CSV/XLSX)
4. POSTs to webhook with base64 or URL
5. API detects type from filename/sender
6. Stores in Vercel Blob as `manifests/{type}_{date}.{ext}`

#### Make.com Scenario Configuration

```
Trigger: Gmail - Watch Emails
  └─> Filter: Subject contains "manifest" OR "shipping"
      └─> Iterate: Attachments
          └─> HTTP: POST to webhook
              Headers:
                x-webhook-secret: [secret]
              Body:
                from: {{1.from.email}}
                subject: {{1.subject}}
                attachments: [{ filename, data }]
```

---

### 2. CustomInk/OOShirts Scraper

**Purpose:** Extract order data from CustomInk and OOShirts web portals.

| Attribute | Value |
|-----------|-------|
| **Script** | `ci_scraper.py` |
| **Location** | QC Computer |
| **Schedule** | Every 2 hours starting at 11 AM |
| **Target** | `POST /api/manifests` |
| **Auth** | `x-api-key` header |

#### Data Sent

```bash
POST /api/manifests
Content-Type: multipart/form-data
x-api-key: promos-ink-2024

file: customink_orders.xlsx
type: customink
```

#### XLSX Structure

| Order # | Status | Vendor | Units | Screens | Shipper | Check-In | Due Date |
|---------|--------|--------|-------|---------|---------|----------|----------|
| 84595597 | In Production | ooshirts DTG | 24 | 0 | UPS | 11/25 | 12/02 |

#### Scraper Logic

1. Login to CustomInk vendor portal
2. Navigate to "Open Orders" page
3. Export orders table to XLSX
4. POST to cloud API
5. Repeat for OOShirts portal
6. Combined into single `customink_orders.xlsx`

---

### 3. UPS Quantum View

**Purpose:** Inbound shipment visibility (packages shipping TO warehouse).

| Attribute | Value |
|-----------|-------|
| **Portal** | UPS Flex Global View |
| **Subscription** | Company Quantum View Desktop (QVD) |
| **Export** | Manual CSV download or API |
| **Target** | `POST /api/manifests` (type: inbound) |

#### Data Format

```csv
Tracking Number,Reference Numbers,Ship Date,Scheduled Delivery,Shipper Name,Shipper Address
1Z90A10R0306936706,"84595597A,ORD-12345",2025-11-27,2025-11-28,SANMAR CORP,"1000 SANMAR DR, COPPELL TX"
```

#### Reference Number Parsing

Reference numbers are tokenized and matched against CustomInk POs:

```python
ref_tokens = reference.split(',')
for token in ref_tokens:
    clean = token.strip()
    if re.match(r'^\d{7,10}[A-Z]?$', clean):
        # Looks like a CustomInk PO
        po_number = clean
```

---

### 4. Python Index Builder

**Purpose:** Build tracking index locally and upload to cloud.

| Attribute | Value |
|-----------|-------|
| **Script** | `build_cloud_index.py` |
| **Location** | This PC |
| **Schedule** | Every 2 hours starting at 12 PM |
| **Target** | `POST /api/upload-index` |
| **Auth** | `x-api-key` header |

#### Data Sent

```bash
POST /api/upload-index
Content-Type: application/json
x-api-key: promos-label-2024

{
  "index": {
    "1Z90A10R0306936706": {
      "source": "ss",
      "sourceType": "ss",
      "po": "82866994A",
      "customer": "Customink",
      "department": "Apparel Division",
      "dueDate": "Mon, Dec 02",
      "status": "In Production",
      "pipelineFlag": ""
    }
  }
}
```

#### Processing Steps

1. Fetch all manifests from `/api/manifests?action=list`
2. Download and parse each manifest (CSV/XLSX)
3. Extract tracking → (po, customer) mappings
4. Enrich with CustomInk order data (department, dueDate, status)
5. Upload combined index to cloud

---

## Outbound Integrations

### 1. UPS Track API

**Purpose:** Real-time tracking lookup for UPS packages.

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `https://onlinetools.ups.com/api/track/v1/details/{tracking}` |
| **Auth** | OAuth 2.0 Client Credentials |
| **Rate Limit** | 100 requests/day (free tier) |
| **Caching** | 5 minutes in-memory |

#### OAuth Flow

```
1. POST https://onlinetools.ups.com/security/v1/oauth/token
   Content-Type: application/x-www-form-urlencoded
   Authorization: Basic base64(client_id:client_secret)
   
   grant_type=client_credentials
   
2. Response: { "access_token": "...", "expires_in": 14399 }

3. GET https://onlinetools.ups.com/api/track/v1/details/{tracking}
   Authorization: Bearer {access_token}
   transId: unique-request-id
   transactionSrc: PromoInkSCM
```

#### Data Returned

```json
{
  "trackingNumber": "1Z90A10R0306936706",
  "status": "D",
  "statusDescription": "DELIVERED",
  "events": [...],
  "poNumber": "82866994A"
}
```

---

### 2. FedEx Track API

**Purpose:** Real-time tracking lookup for FedEx packages.

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `https://apis.fedex.com/track/v1/trackingnumbers` |
| **Auth** | OAuth 2.0 Client Credentials |
| **Rate Limit** | 500 requests/day (free tier) |
| **Caching** | 5 minutes in-memory |

#### OAuth Flow

```
1. POST https://apis.fedex.com/oauth/token
   Content-Type: application/x-www-form-urlencoded
   
   grant_type=client_credentials
   client_id={api_key}
   client_secret={secret_key}
   
2. Response: { "access_token": "...", "expires_in": 3600 }

3. POST https://apis.fedex.com/track/v1/trackingnumbers
   Authorization: Bearer {access_token}
   Content-Type: application/json
   
   {
     "trackingInfo": [{ "trackingNumberInfo": { "trackingNumber": "794644790045" } }],
     "includeDetailedScans": true
   }
```

---

### 3. Vercel Blob Storage

**Purpose:** Persistent storage for manifests and tracking index.

| Attribute | Value |
|-----------|-------|
| **Provider** | Vercel Blob |
| **SDK** | `@vercel/blob` |
| **Auth** | `BLOB_READ_WRITE_TOKEN` environment variable |

#### Operations

```typescript
// Upload
const { url } = await put(`manifests/${filename}`, buffer, {
  access: 'public',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});

// List
const { blobs } = await list({ prefix: 'manifests/' });

// Download
const response = await fetch(blobUrl);
const content = await response.arrayBuffer();

// Delete
await del(blobUrl);
```

---

## Internal Communication

### Label Print GUI (Cloud) → API

| Operation | Endpoint | Method | Auth |
|-----------|----------|--------|------|
| Lookup tracking | `/api/label-lookup` | GET | `x-api-key` |
| Health check | `/api/label-lookup?action=health` | GET | None |
| Refresh cache | `/api/label-lookup?action=refresh` | GET | `x-api-key` |

#### Request Example

```python
response = requests.get(
    f"{API_BASE}/api/label-lookup",
    params={
        "action": "lookup",
        "tracking": tracking_number,
        "key": API_KEY
    }
)
```

---

### Label Print GUI (Offline) → Local Files

| Operation | Source | Format |
|-----------|--------|--------|
| Lookup tracking | Combined XLSX files | Local file read |
| Sanmar data | `sanmar_combined.xlsx` | Downloaded from API |
| S&S data | `ss_combined.xlsx` | Downloaded from API |

---

### Cloud Sync Script → API

| Operation | Endpoint | Method | Auth |
|-----------|----------|--------|------|
| Sync data | `/api/sync` | POST | Bearer token |

#### Request Example

```powershell
$headers = @{
    "Authorization" = "Bearer $env:SYNC_SECRET"
    "Content-Type" = "application/json"
}

$body = @{
    type = "full"
    data = @{
        inbound = $inboundRecords
        outbound = $outboundRecords
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "$VERCEL_URL/api/sync" -Method Post -Headers $headers -Body $body
```

---

## Data Flow Diagrams

### Manifest Processing Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Supplier  │────>│  Make.com   │────>│   Webhook   │
│   Email     │     │  Automation │     │   API       │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Index     │<────│   Blob      │<────│   Detect    │
│   Builder   │     │   Storage   │     │   & Store   │
└──────┬──────┘     └─────────────┘     └─────────────┘
       │
       │ Parse + Merge
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Upload     │────>│   Index     │────>│   Label     │
│  Index      │     │   Blob      │     │   Lookup    │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Label Printing Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Barcode   │────>│   Label     │────>│   Lookup    │
│   Scan      │     │   Print GUI │     │   API       │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                   │
                           │                   │ Index
                           │                   │ Match
                           │                   ▼
                    ┌──────▼──────┐     ┌─────────────┐
                    │   Display   │<────│   Return    │
                    │   Info      │     │   PO/Cust   │
                    └──────┬──────┘     └─────────────┘
                           │
                           │ Generate ZPL
                           ▼
                    ┌─────────────┐
                    │   Thermal   │
                    │   Printer   │
                    └─────────────┘
```

---

## Authentication Summary

### API Keys Reference

| Key | Variable | Used By | Endpoints |
|-----|----------|---------|-----------|
| Manifest Upload | `MANIFEST_UPLOAD_KEY` | Make.com, CI Scraper | `/api/manifests`, `/api/email-webhook` |
| Label Lookup | `LABEL_API_KEY` | Label Print GUI | `/api/label-lookup` |
| Sync | `SYNC_SECRET` | cloud-sync.ps1 | `/api/sync` |
| Webhook | `EMAIL_WEBHOOK_SECRET` | Make.com | `/api/email-webhook` |

### OAuth Tokens

| Provider | Token Lifetime | Cached | Refresh Strategy |
|----------|---------------|--------|------------------|
| UPS | 4 hours | Yes | Lazy (on 401) |
| FedEx | 1 hour | Yes | Lazy (on 401) |

### Header Formats

```
# API Key
x-api-key: promos-label-2024

# Webhook Secret
x-webhook-secret: promos-ink-email-2024

# Bearer Token
Authorization: Bearer promos-sync-2024

# OAuth
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Error Handling

### Retry Policies

| Integration | Max Retries | Backoff | Circuit Breaker |
|-------------|-------------|---------|-----------------|
| UPS API | 3 | Exponential | 5 failures = 5 min pause |
| FedEx API | 3 | Exponential | 5 failures = 5 min pause |
| Blob Storage | 3 | Linear | No |
| Webhook | 0 | N/A | N/A |

### Common Error Responses

| Code | Integration | Meaning | Action |
|------|-------------|---------|--------|
| 401 | Any | Invalid/expired auth | Refresh token, check key |
| 429 | Carrier APIs | Rate limited | Wait, retry later |
| 503 | Any | Service unavailable | Retry with backoff |
| 504 | Vercel | Function timeout | Reduce batch size |

### Fallback Strategies

```
Label Lookup:
  1. Check cloud index → Found? Return result
  2. Index missing? → Return needsRebuild flag
  3. API error? → Return graceful error message

Manifest Upload:
  1. Parse file → Success? Store in blob
  2. Parse error? → Return detailed error
  3. Blob error? → Retry 3 times, then fail

Carrier Tracking:
  1. API call → Success? Return data
  2. 401? → Refresh OAuth, retry once
  3. Rate limited? → Return cached data if available
  4. Timeout? → Return partial data + error flag
```

---

## Integration Checklist

### Adding New Integration

- [ ] Document endpoint URL and authentication method
- [ ] Add environment variables to `ENV_TEMPLATE.md`
- [ ] Add data schema to `DATA_DICTIONARY.md`
- [ ] Update this file with data flow
- [ ] Implement error handling and retry logic
- [ ] Add integration tests
- [ ] Update `ARCHITECTURE.md` diagrams

### Verifying Integration Health

- [ ] Check API endpoint responds (health check)
- [ ] Verify authentication works
- [ ] Confirm data format matches schema
- [ ] Test error scenarios
- [ ] Monitor rate limits
- [ ] Check scheduled task runs

