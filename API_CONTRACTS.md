# API Contracts

> Complete API documentation for Promos Ink Supply Chain Platform  
> Base URL: `https://package-confirmation-app.vercel.app`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Manifest APIs](#manifest-apis)
3. [Label Lookup APIs](#label-lookup-apis)
4. [Package Lookup APIs](#package-lookup-apis)
5. [Carrier APIs](#carrier-apis)
6. [Sync APIs](#sync-apis)
7. [Index Management APIs](#index-management-apis)
8. [Webhook APIs](#webhook-apis)
9. [Utility APIs](#utility-apis)

---

## Authentication

### API Keys

| Key Name | Header | Used For |
|----------|--------|----------|
| `MANIFEST_UPLOAD_KEY` | `x-api-key` | Manifest upload/delete |
| `LABEL_API_KEY` | `x-api-key` | Label lookup |
| `SYNC_SECRET` | `Authorization: Bearer` | Data sync |
| `EMAIL_WEBHOOK_SECRET` | `x-webhook-secret` | Email webhook |

### Example Header

```http
x-api-key: promos-ink-2024
```

---

## Manifest APIs

### `GET /api/manifests`

**Description:** List all manifests or get info about a specific manifest.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | No | `list` (default), `info`, `download` |
| `type` | string | Conditional | Required for `info` and `download` |

#### Actions

##### List All Manifests

```http
GET /api/manifests?action=list
```

**Response: 200 OK**

```json
{
  "manifests": [
    {
      "type": "sanmar",
      "filename": "sanmar_2025-11-28.csv",
      "url": "https://2hjrsjkqncbwsvoa.public.blob.vercel-storage.com/manifests/sanmar_2025-11-28.csv",
      "size": 245678,
      "uploadedAt": "2025-11-28T15:30:00.000Z"
    },
    {
      "type": "ss",
      "filename": "ss_combined.xlsx",
      "url": "https://2hjrsjkqncbwsvoa.public.blob.vercel-storage.com/manifests/ss_combined.xlsx",
      "size": 822178,
      "uploadedAt": "2025-11-28T17:20:09.000Z"
    }
  ],
  "count": 2,
  "types": ["customink", "sanmar", "ss", "ssactivewear", "inbound", "quantumview", "sanmar_combined", "ss_combined"]
}
```

##### Get Manifest Info

```http
GET /api/manifests?action=info&type=sanmar
```

**Response: 200 OK**

```json
{
  "found": true,
  "type": "sanmar",
  "filename": "manifests/sanmar.xlsx",
  "url": "https://...",
  "size": 924799,
  "uploadedAt": "2025-11-28T17:20:11.000Z"
}
```

**Response: 200 OK (Not Found)**

```json
{
  "found": false,
  "type": "sanmar",
  "message": "Manifest sanmar not found"
}
```

##### Download Manifest

```http
GET /api/manifests?action=download&type=sanmar
```

**Response: 302 Redirect** → Blob URL

---

### `POST /api/manifests`

**Description:** Upload a new manifest file.

#### Headers

| Header | Required | Value |
|--------|----------|-------|
| `x-api-key` | Yes | `promos-ink-2024` |
| `Content-Type` | Yes | `multipart/form-data` or `application/json` |

#### Request Body (Multipart Form)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | The manifest file |
| `type` | string | Yes | Manifest type |

**Valid Types:** `customink`, `sanmar`, `ss`, `ssactivewear`, `inbound`, `quantumview`, `sanmar_combined`, `ss_combined`

#### Example Request (cURL)

```bash
curl -X POST https://package-confirmation-app.vercel.app/api/manifests \
  -H "x-api-key: promos-ink-2024" \
  -F "file=@sanmar_2025-11-28.csv" \
  -F "type=sanmar"
```

#### Example Request (JSON with Base64)

```bash
curl -X POST https://package-confirmation-app.vercel.app/api/manifests \
  -H "x-api-key: promos-ink-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sanmar",
    "filename": "sanmar.csv",
    "data": "RGVjb3JhdG9yIGN1c3RvbWVyIG5hbWUsU2FsZXMgT3JkZXIuLi4="
  }'
```

#### Response: 200 OK

```json
{
  "success": true,
  "message": "Manifest sanmar uploaded successfully",
  "manifest": {
    "type": "sanmar",
    "filename": "sanmar.xlsx",
    "originalFilename": "sanmar_2025-11-28.csv",
    "url": "https://...",
    "size": 245678,
    "uploadedAt": "2025-11-28T15:30:00.000Z"
  }
}
```

#### Response: 401 Unauthorized

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key. Include x-api-key header."
}
```

#### Response: 400 Bad Request

```json
{
  "error": "Invalid manifest type",
  "supportedTypes": ["customink", "sanmar", "ss", ...]
}
```

---

### `DELETE /api/manifests`

**Description:** Delete a manifest file.

#### Headers

| Header | Required | Value |
|--------|----------|-------|
| `x-api-key` | Yes | `promos-ink-2024` |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Either | Manifest type to delete |
| `url` | string | Either | Direct blob URL to delete |

#### Example Request

```bash
curl -X DELETE "https://package-confirmation-app.vercel.app/api/manifests?type=sanmar" \
  -H "x-api-key: promos-ink-2024"
```

#### Response: 200 OK

```json
{
  "success": true,
  "message": "Manifest sanmar deleted"
}
```

---

## Label Lookup APIs

### `GET /api/label-lookup`

**Description:** Instant tracking number lookup from pre-built index. Optimized for warehouse label printing.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `lookup`, `health`, `stats`, `refresh` |
| `tracking` | string | Conditional | Required for `lookup` |
| `key` | string | Conditional | API key (or use header) |

#### Headers

| Header | Required | Value |
|--------|----------|-------|
| `x-api-key` | Yes (except health) | `promos-label-2024` |

---

#### Action: `lookup`

```http
GET /api/label-lookup?action=lookup&tracking=1Z90A10R0306936706&key=promos-label-2024
```

**Response: 200 OK (Found)**

```json
{
  "found": true,
  "tracking": "1Z90A10R0306936706",
  "source": "ss",
  "sourceType": "ss",
  "po": "82866994A",
  "customer": "Customink",
  "department": "Apparel Division",
  "dueDate": "Mon, Dec 02",
  "status": "In Production",
  "pipelineFlag": "",
  "shipperName": null,
  "referenceTokens": null
}
```

**Response: 200 OK (Not Found)**

```json
{
  "found": false,
  "tracking": "1Z90A10R0306936706",
  "message": "Package not found in index"
}
```

**Response: 200 OK (Index Missing)**

```json
{
  "found": false,
  "tracking": "1Z90A10R0306936706",
  "error": "Index not built. Please wait while administrator rebuilds the index.",
  "needsRebuild": true
}
```

---

#### Action: `health`

```http
GET /api/label-lookup?action=health
```

**Response: 200 OK**

```json
{
  "status": "ok",
  "timestamp": "2025-11-28T17:30:00.000Z",
  "version": "3.0",
  "indexLoaded": true,
  "trackingCount": 8328
}
```

---

#### Action: `stats`

```http
GET /api/label-lookup?action=stats&key=promos-label-2024
```

**Response: 200 OK**

```json
{
  "totalTrackings": 8328,
  "bySource": {
    "sanmar": 4366,
    "ss": 3962,
    "customink": 0,
    "inbound": 0
  },
  "cacheAge": 125000
}
```

---

#### Action: `refresh`

```http
GET /api/label-lookup?action=refresh&key=promos-label-2024
```

**Response: 200 OK**

```json
{
  "success": true,
  "message": "Cache cleared and index reloaded",
  "trackingCount": 8328
}
```

---

### `POST /api/label-lookup`

**Description:** Batch lookup for multiple tracking numbers.

#### Headers

| Header | Required | Value |
|--------|----------|-------|
| `x-api-key` | Yes | `promos-label-2024` |
| `Content-Type` | Yes | `application/json` |

#### Request Body

```json
{
  "trackingNumbers": [
    "1Z90A10R0306936706",
    "LP0154998332",
    "794644790045"
  ]
}
```

#### Response: 200 OK

```json
{
  "total": 3,
  "found": 2,
  "results": [
    {
      "found": true,
      "tracking": "1Z90A10R0306936706",
      "source": "ss",
      "sourceType": "ss",
      "po": "82866994A",
      "customer": "Customink"
    },
    {
      "found": true,
      "tracking": "LP0154998332",
      "source": "sanmar",
      "sourceType": "sanmar",
      "po": "84144186A",
      "customer": "CUSTOMINK.COM LLC"
    },
    {
      "found": false,
      "tracking": "794644790045"
    }
  ]
}
```

---

## Package Lookup APIs

### `GET /api/lookup`

**Description:** Full package lookup with live carrier data. Used by web dashboard.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | No | Tracking number or PO to search |
| `recent` | boolean | No | Return recent inbound scans |
| `recentOutbound` | boolean | No | Return recent outbound shipments |
| `stats` | boolean | No | Return statistics |

---

#### Search by Tracking

```http
GET /api/lookup?q=1Z90A10R0306936706
```

**Response: 200 OK**

```json
{
  "found": true,
  "type": "inbound",
  "tracking": "1Z90A10R0306936706",
  "carrier": "UPS",
  "inbound": {
    "scanned": true,
    "scanTimestamp": "2025-11-28 10:15:32",
    "scanStatus": "Manifest Print",
    "poNumber": "82866994A",
    "customer": "Customink"
  },
  "upsLive": {
    "status": "Delivered",
    "deliveredAt": "2025-11-28 09:45:00",
    "location": "DALLAS, TX",
    "isException": false,
    "service": "UPS Ground",
    "events": [
      {
        "date": "2025-11-28",
        "time": "09:45",
        "location": "DALLAS, TX",
        "status": "D",
        "description": "DELIVERED"
      }
    ],
    "poNumber": "82866994A",
    "shipperReference": "ORD-12345"
  }
}
```

---

#### Get Recent Inbound

```http
GET /api/lookup?recent=true
```

**Response: 200 OK**

```json
[
  {
    "tracking": "1Z90A10R0306936706",
    "po": "82866994A",
    "timestamp": "2025-11-28 10:15:32",
    "status": "Manifest Print"
  },
  {
    "tracking": "LP0154998332",
    "po": "84144186A",
    "timestamp": "2025-11-28 10:14:15",
    "status": "Printed"
  }
]
```

---

#### Get Statistics

```http
GET /api/lookup?stats=true
```

**Response: 200 OK**

```json
{
  "inboundTotal": 3560,
  "outboundTotal": 12450
}
```

---

## Carrier APIs

### `GET /api/ups`

**Description:** Direct UPS tracking lookup.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `track` |
| `tracking` | string | Yes | UPS tracking number |

#### Example Request

```http
GET /api/ups?action=track&tracking=1Z90A10R0306936706
```

#### Response: 200 OK

```json
{
  "trackingNumber": "1Z90A10R0306936706",
  "status": "D",
  "statusDescription": "DELIVERED",
  "estimatedDelivery": null,
  "actualDelivery": "2025-11-28T09:45:00",
  "origin": {
    "city": "FORT WORTH",
    "state": "TX",
    "country": "US",
    "postalCode": "76101"
  },
  "destination": {
    "city": "DALLAS",
    "state": "TX",
    "country": "US"
  },
  "service": "UPS Ground",
  "weight": "5.2 LBS",
  "events": [...],
  "isException": false,
  "poNumber": "82866994A",
  "shipperReference": "ORD-12345"
}
```

---

### `GET /api/fedex`

**Description:** Direct FedEx tracking lookup.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `track` |
| `tracking` | string | Yes | FedEx tracking number |

#### Example Request

```http
GET /api/fedex?action=track&tracking=794644790045
```

#### Response: 200 OK

```json
{
  "trackingNumber": "794644790045",
  "status": "DL",
  "statusDescription": "Delivered",
  "actualDelivery": "2025-11-28T14:30:00",
  "origin": {
    "city": "MEMPHIS",
    "state": "TN",
    "country": "US",
    "postalCode": "38118"
  },
  "destination": {
    "city": "DALLAS",
    "state": "TX",
    "country": "US",
    "postalCode": "75201"
  },
  "service": "FedEx Ground",
  "signedBy": "J.SMITH",
  "events": [...],
  "isException": false
}
```

---

## Sync APIs

### `POST /api/sync`

**Description:** Receive inbound/outbound data from local sync scripts.

#### Headers

| Header | Required | Value |
|--------|----------|-------|
| `Authorization` | Yes | `Bearer promos-sync-2024` |
| `Content-Type` | Yes | `application/json` |

#### Request Body

```json
{
  "type": "full",
  "data": {
    "inbound": [
      {
        "tracking": "1Z90A10R0306936706",
        "po": "82866994A",
        "customer": "Customink",
        "dueDate": "2025-12-02",
        "timestamp": "2025-11-28 10:15:32",
        "status": "Manifest Print"
      }
    ],
    "outbound": [
      {
        "tracking": "1Z90A10R9876543210",
        "recipient": "John Smith",
        "company": "Acme Corp",
        "address": "123 Main St",
        "city": "Chicago",
        "state": "IL",
        "zip": "60601",
        "country": "US",
        "service": "UPS Ground",
        "reference": "ORD-67890",
        "location": "FB2",
        "station": "UPS Station 2"
      }
    ]
  }
}
```

#### Response: 200 OK

```json
{
  "success": true,
  "received": {
    "inbound": 1,
    "outbound": 1
  },
  "timestamp": "2025-11-28T17:30:00.000Z"
}
```

---

## Index Management APIs

### `POST /api/upload-index`

**Description:** Upload pre-built tracking index.

#### Headers

| Header | Required | Value |
|--------|----------|-------|
| `x-api-key` | Yes | `promos-label-2024` |
| `Content-Type` | Yes | `application/json` |

#### Request Body

```json
{
  "index": {
    "1Z90A10R0306936706": {
      "source": "ss",
      "sourceType": "ss",
      "po": "82866994A",
      "customer": "Customink",
      "department": "Apparel",
      "dueDate": "Mon, Dec 02",
      "status": "In Production",
      "pipelineFlag": ""
    },
    "LP0154998332": {
      "source": "sanmar",
      "sourceType": "sanmar",
      "po": "84144186A",
      "customer": "CUSTOMINK.COM LLC"
    }
  }
}
```

#### Response: 200 OK

```json
{
  "success": true,
  "message": "Index uploaded successfully",
  "indexSize": 863160,
  "trackingCount": 8328
}
```

---

### `GET /api/index-stats`

**Description:** Get tracking index statistics and combined file info.

#### Example Request

```http
GET /api/index-stats
```

#### Response: 200 OK

```json
{
  "hasIndex": true,
  "trackingCount": 8328,
  "bySource": {
    "ss": 3962,
    "sanmar": 4366
  },
  "indexSize": 863160,
  "lastUpdated": "2025-11-28T17:20:15.000Z",
  "combinedFiles": [
    {
      "name": "sanmar_combined.xlsx",
      "url": "https://...",
      "size": 924799,
      "uploadedAt": "2025-11-28T17:20:11.000Z"
    },
    {
      "name": "ss_combined.xlsx",
      "url": "https://...",
      "size": 822178,
      "uploadedAt": "2025-11-28T17:20:09.000Z"
    }
  ]
}
```

---

## Webhook APIs

### `POST /api/email-webhook`

**Description:** Receive forwarded emails from Make.com containing manifest attachments.

#### Headers

| Header | Required | Value |
|--------|----------|-------|
| `x-webhook-secret` | Yes | `promos-ink-email-2024` |
| `Content-Type` | Yes | `application/json` |

#### Request Body

```json
{
  "from": "shipping@sanmar.com",
  "subject": "Daily Shipping Manifest - SanMar",
  "date": "2025-11-28T15:00:00.000Z",
  "attachments": [
    {
      "filename": "PromoInk_20251128.csv",
      "contentType": "text/csv",
      "data": "RGVjb3JhdG9yIGN1c3RvbWVyIG5hbWUsU2FsZXMgT3JkZXIuLi4="
    }
  ]
}
```

**Alternative: File URL (from Make.com)**

```json
{
  "from": "orders@ssactivewear.com",
  "subject": "S&S Activewear Shipment",
  "attachments": [
    {
      "filename": "shipment_20251128.xlsx",
      "url": "https://make.com/temp/file123.xlsx"
    }
  ]
}
```

#### Response: 200 OK

```json
{
  "success": true,
  "message": "Manifest processed",
  "manifest": {
    "type": "sanmar",
    "filename": "sanmar_2025-11-28.csv",
    "size": 245678
  }
}
```

#### Response: 200 OK (No Attachment)

```json
{
  "success": false,
  "message": "No processable attachment found",
  "detectedType": null
}
```

---

## Utility APIs

### `GET /api/batch-track`

**Description:** Track multiple packages at once with live carrier data.

#### Request (POST preferred)

```http
POST /api/batch-track
Content-Type: application/json

{
  "trackingList": "1Z90A10R0306936706\n794644790045\nLP0154998332"
}
```

#### Response: 200 OK

```json
{
  "results": [
    {
      "tracking": "1Z90A10R0306936706",
      "carrier": "UPS",
      "status": "D",
      "statusDescription": "DELIVERED",
      "deliveredAt": "2025-11-28T09:45:00",
      "isException": false
    },
    {
      "tracking": "794644790045",
      "carrier": "FedEx",
      "status": "DL",
      "statusDescription": "Delivered",
      "deliveredAt": "2025-11-28T14:30:00",
      "isException": false
    }
  ],
  "stats": {
    "total": 3,
    "delivered": 2,
    "inTransit": 0,
    "exceptions": 0,
    "unknown": 1
  }
}
```

---

### `GET /api/suppliers`

**Description:** Get supplier information and shipments.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | `list`, `shipments` |
| `supplierId` | string | For `shipments` action |

#### List Suppliers

```http
GET /api/suppliers?action=list
```

**Response: 200 OK**

```json
{
  "suppliers": [
    {
      "id": "sanmar",
      "name": "SanMar Corporation",
      "shortName": "SanMar",
      "website": "https://www.sanmar.com",
      "zipCodes": ["75261", "76101"],
      "city": "Coppell",
      "state": "TX",
      "category": "Blank Apparel"
    },
    {
      "id": "ssactivewear",
      "name": "S&S Activewear",
      "shortName": "S&S",
      "website": "https://www.ssactivewear.com",
      "zipCodes": ["76177"],
      "city": "Fort Worth",
      "state": "TX",
      "category": "Blank Apparel"
    }
  ]
}
```

---

### `GET /api/reports`

**Description:** Generate shipping reports.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | `summary`, `export` |
| `days` | number | Number of days to include |
| `format` | string | `json`, `csv` |

#### Summary Report

```http
GET /api/reports?action=summary&days=7
```

**Response: 200 OK**

```json
{
  "summary": {
    "totalInbound": 3560,
    "totalOutbound": 12450,
    "todayInbound": 145,
    "todayOutbound": 523,
    "lastUpdated": "2025-11-28T17:30:00.000Z"
  },
  "dailyStats": [
    {
      "date": "2025-11-28",
      "inboundCount": 145,
      "outboundCount": 523,
      "deliveredCount": 498,
      "exceptionsCount": 3
    }
  ],
  "performance": {
    "totalShipments": 16010,
    "avgDailyInbound": 508,
    "avgDailyOutbound": 1778,
    "exceptionsToday": 3
  }
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Error type",
  "message": "Human-readable description",
  "details": "Technical details (optional)"
}
```

### Common HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful request |
| 302 | Redirect | Download redirects to blob URL |
| 400 | Bad Request | Missing/invalid parameters |
| 401 | Unauthorized | Invalid/missing API key |
| 404 | Not Found | Resource doesn't exist |
| 500 | Internal Error | Server-side failure |

---

## Rate Limits

| API | Limit | Notes |
|-----|-------|-------|
| Label Lookup | Unlimited | Cached index, no carrier calls |
| UPS Tracking | 100/day | Free tier limit |
| FedEx Tracking | 500/day | Free tier limit |
| Batch Track | 50 per request | To avoid carrier rate limits |
| Manifests | Unlimited | Blob storage operations |

