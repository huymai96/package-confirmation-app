# Promos Ink Supply Chain Platform - Architecture Documentation

> **Version:** 2.0  
> **Last Updated:** November 28, 2025  
> **Platform:** Next.js 14 + Vercel + Vercel Blob Storage

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Carrier Integrations](#2-carrier-integrations)
3. [Data Flow](#3-data-flow)
4. [Package Confirmation](#4-package-confirmation)
5. [Manifest Management](#5-manifest-management)
6. [API Endpoints](#6-api-endpoints)
7. [Data Types](#7-data-types)
8. [Integration Points](#8-integration-points)
9. [Environment Variables](#9-environment-variables)
10. [Known Issues & Tech Debt](#10-known-issues--tech-debt)

---

## 1. System Overview

### 1.1 Purpose

The Promos Ink Supply Chain Platform provides **end-to-end visibility** for package logistics at a print/decoration company operating two warehouses (FB1 & FB2) in Dallas, TX.

**Core Functions:**
- **Inbound Tracking**: Track packages arriving from suppliers (Sanmar, S&S Activewear, CustomInk, Alphabroder)
- **Outbound Tracking**: Monitor shipments leaving to customers
- **Package Confirmation**: Scan-to-confirm workflow with label printing
- **Manifest Management**: Automated ingestion of supplier shipping manifests
- **Real-time Carrier Data**: Live tracking from UPS and FedEx APIs

### 1.2 Warehouse Operations Supported

| Operation | Description |
|-----------|-------------|
| **Receiving** | Scan inbound packages, print routing labels, log arrivals |
| **Putaway** | Route packages to correct department based on PO/customer |
| **Order Lookup** | Search by tracking number, PO#, or customer |
| **Shipping Visibility** | Monitor outbound shipments from shipping stations |
| **Exception Handling** | Alert on delayed/problem shipments |

### 1.3 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA SOURCES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Sanmar (CSV)    S&S (XLSX)    CustomInk (Scraper)    UPS QV (CSV)         │
│       │               │               │                    │                │
│       └───────────────┴───────────────┴────────────────────┘                │
│                               │                                              │
│                    ┌──────────▼──────────┐                                  │
│                    │   Email Forwarding   │                                  │
│                    │   (Make.com Webhook) │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                              │
├───────────────────────────────▼─────────────────────────────────────────────┤
│                         VERCEL PLATFORM                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  /api/manifests │    │ /api/email-     │    │ /api/upload-    │         │
│  │  Upload/List/   │    │ webhook         │    │ index           │         │
│  │  Delete         │    │ Auto-ingest     │    │ Index builder   │         │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
│           │                      │                      │                   │
│           └──────────────────────┼──────────────────────┘                   │
│                                  │                                          │
│                    ┌─────────────▼─────────────┐                            │
│                    │    VERCEL BLOB STORAGE    │                            │
│                    │  - manifests/*.xlsx/csv   │                            │
│                    │  - tracking-index.json    │                            │
│                    │  - sync-data.json         │                            │
│                    └─────────────┬─────────────┘                            │
│                                  │                                          │
│           ┌──────────────────────┼──────────────────────┐                   │
│           │                      │                      │                   │
│  ┌────────▼────────┐    ┌───────▼────────┐    ┌───────▼────────┐          │
│  │ /api/label-     │    │ /api/lookup    │    │ /api/sync      │          │
│  │ lookup          │    │ Package search │    │ Inbound/       │          │
│  │ Instant index   │    │ + live carrier │    │ Outbound data  │          │
│  └────────┬────────┘    └───────┬────────┘    └───────┬────────┘          │
│           │                     │                     │                    │
├───────────┼─────────────────────┼─────────────────────┼────────────────────┤
│           │              CARRIER APIs                 │                    │
│           │     ┌───────────────┴───────────────┐     │                    │
│           │     │                               │     │                    │
│      ┌────▼─────▼────┐                 ┌───────▼─────▼───┐                 │
│      │   UPS API     │                 │   FedEx API     │                 │
│      │  - OAuth 2.0  │                 │  - OAuth 2.0    │                 │
│      │  - Tracking   │                 │  - Tracking     │                 │
│      │  - Quantum    │                 │  - Visibility   │                 │
│      │    View       │                 │    Webhooks     │                 │
│      └───────────────┘                 └─────────────────┘                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                              CLIENTS                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │   Web UI        │    │ Label Print GUI │    │ Sync Scripts    │         │
│  │   (Next.js)     │    │ (Python/Tk)     │    │ (PowerShell)    │         │
│  │   Dashboard     │    │ Warehouse Floor │    │ Background      │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Carrier Integrations

### 2.1 UPS Integration

#### Configuration

```typescript
const UPS_CONFIG = {
  clientId: process.env.UPS_CLIENT_ID,
  clientSecret: process.env.UPS_CLIENT_SECRET,
  accountNumbers: process.env.UPS_ACCOUNT_NUMBERS.split(','),
  baseUrl: 'https://onlinetools.ups.com',
  tokenUrl: 'https://onlinetools.ups.com/security/v1/oauth/token'
};
```

#### Quantum View Subscriptions

| Subscription Type | Account Numbers | Purpose |
|-------------------|-----------------|---------|
| **Inbound** | PROMOS INK, 13911 | Packages shipping TO warehouses |
| **Outbound** | E45A82, W34D92, W34G18, K9Y228 | Packages shipping FROM warehouses |
| **Third-Party** | E45A82, W34D92, W34G18 | Freight billed to third parties |

#### UPS APIs Used

| API | Endpoint | Purpose |
|-----|----------|---------|
| **OAuth 2.0** | `/security/v1/oauth/token` | Authentication |
| **Track API** | `/track/v1/details/{trackingNumber}` | Real-time tracking |
| **Quantum View** | Portal download | Inbound/outbound visibility |

#### OAuth Token Management

```typescript
// Token is cached and refreshed 1 minute before expiry
let tokenCache: UPSToken | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache) {
    const expiresAt = tokenCache.issued_at + (tokenCache.expires_in * 1000) - 60000;
    if (Date.now() < expiresAt) {
      return tokenCache.access_token;
    }
  }
  // Refresh token...
}
```

### 2.2 FedEx Integration

#### Configuration

```typescript
const FEDEX_CONFIG = {
  apiKey: process.env.FEDEX_API_KEY,
  secretKey: process.env.FEDEX_SECRET_KEY,
  accountNumbers: process.env.FEDEX_ACCOUNT_NUMBERS.split(','),
  baseUrl: 'https://apis.fedex.com'  // Production
  // baseUrl: 'https://apis-sandbox.fedex.com'  // Sandbox
};
```

#### FedEx APIs Used

| API | Endpoint | Purpose |
|-----|----------|---------|
| **OAuth 2.0** | `/oauth/token` | Authentication |
| **Track API** | `/track/v1/trackingnumbers` | Real-time tracking |

#### Tracking Number Detection

```typescript
function isFedExTracking(tracking: string): boolean {
  const t = tracking.trim();
  // 12-digit (Ground), 15-digit (Express), 20-22 digit (SmartPost)
  if (/^\d{12}$/.test(t)) return true;
  if (/^\d{15}$/.test(t)) return true;
  if (/^\d{20,22}$/.test(t)) return true;
  return false;
}
```

---

## 3. Data Flow

### 3.1 Inbound Package Flow

```
1. MANIFEST ARRIVAL
   ├── Sanmar: CSV via email → Make.com → /api/email-webhook
   ├── S&S: XLSX via email → Make.com → /api/email-webhook
   └── CustomInk: Scraper → /api/manifests (scheduled upload)

2. INDEX BUILDING (Every 2 hours)
   └── build_cloud_index.py
       ├── Download all manifests from Vercel Blob
       ├── Parse tracking numbers, PO#, customer
       ├── Enrich with CustomInk order data (department, due date)
       └── Upload tracking-index.json to Vercel Blob

3. PACKAGE SCAN (Warehouse floor)
   └── Label Print GUI
       ├── Scan barcode → /api/label-lookup
       ├── Instant lookup from tracking-index.json
       ├── Return: PO#, customer, department, due date
       └── Print label with routing info

4. CARRIER ENRICHMENT (On-demand)
   └── /api/lookup
       ├── Check local index
       ├── Call UPS/FedEx API for live status
       └── Return combined data
```

### 3.2 Outbound Package Flow

```
1. SHIPPING STATION DATA
   └── OneDrive CSV files (updated by shipping software)
       ├── UPSSHIPPINGSTATION2.csv (FB2)
       ├── FB2SWShippingStation2.csv (FB2)
       ├── FB2ShippingStation1.csv (FB2)
       └── SWShippingStation1.csv (FB1)

2. SYNC TO CLOUD (Every 5 minutes)
   └── cloud-sync.ps1
       ├── Read shipping station CSVs
       ├── Parse tracking, recipient, address
       └── POST to /api/sync

3. VISIBILITY
   └── Web UI Dashboard
       ├── Recent outbound shipments
       ├── Carrier status
       └── Delivery confirmations
```

### 3.3 Exception Handling

| Exception Type | Detection | Action |
|----------------|-----------|--------|
| **Delayed Delivery** | Carrier API `isException: true` | Alert in dashboard |
| **Package Not Found** | Not in index | Log to scan_log.csv, show warning |
| **Manifest Parse Error** | Invalid file format | Skip file, log error |
| **API Timeout** | Carrier API slow | Retry with extended timeout |

---

## 4. Package Confirmation

### 4.1 Scan/Confirmation Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                     LABEL PRINT GUI                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. SCAN BARCODE                                                │
│     └── Tracking number entered (scanner or keyboard)           │
│                                                                  │
│  2. API LOOKUP                                                  │
│     └── GET /api/label-lookup?action=lookup&tracking=1Z...      │
│         Response: { po, customer, department, dueDate, ... }    │
│                                                                  │
│  3. CLASSIFY PACKAGE                                            │
│     ├── CustomInk Order (PO matches 8-digit#A pattern)          │
│     │   └── Print label with Department, Due Date               │
│     ├── Manifest Package (Sanmar/S&S)                           │
│     │   └── Print label with Customer, PO                       │
│     ├── Fast Platform                                           │
│     │   └── Print label with Must Ship By, Processes            │
│     └── Unknown/Inbound                                         │
│         └── Print generic label with shipper info               │
│                                                                  │
│  4. PRINT LABEL                                                 │
│     └── 4x6 thermal label with:                                 │
│         - Company logo                                          │
│         - PO# barcode                                           │
│         - Department/Customer                                   │
│         - Due date (if applicable)                              │
│         - Pipeline flag (On Hold, Pipelined)                    │
│                                                                  │
│  5. LOG SCAN                                                    │
│     └── Append to scan_log.csv:                                 │
│         Timestamp, Tracking, PO, Dept/Customer, Due, Status     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Who Confirms and How

| Role | Tool | Action |
|------|------|--------|
| **Receiving Clerk** | Label Print GUI (Python) | Scan package → Print label |
| **Supervisor** | Web Dashboard | Review scan logs, exceptions |
| **System** | Scheduled tasks | Auto-index, sync data |

---

## 5. Manifest Management

### 5.1 Upload Methods

| Method | Source | Trigger |
|--------|--------|---------|
| **Email Webhook** | Make.com Mailhook | Email forwarded to webhook |
| **API Upload** | CI Scraper | Scheduled POST to /api/manifests |
| **Manual Upload** | Web UI | User uploads file |

### 5.2 Email Webhook Flow (Make.com)

```
1. Supplier sends email with manifest attachment
2. Email forwarded to: b15cp08jrvj2nnmnhxxjn56xl9b7clm6@hook.us2.make.com
3. Make.com extracts:
   - From address
   - Subject line
   - Attachments (base64 or file URL)
4. Make.com POSTs to: /api/email-webhook
   Headers: x-webhook-secret: promos-ink-email-2024
   Body: { from, subject, attachments[] }
5. Webhook detects manifest type from sender patterns
6. Saves to Vercel Blob: manifests/sanmar_2025-11-28.csv
```

### 5.3 CSV/Excel Parsing Logic

#### Sanmar CSV Structure
```
Column Index | Field Name
0            | Decorator customer name
2            | Customer Name
4            | Customer PO
11           | Tracking number
12           | (Alternate tracking)
```

#### S&S XLSX Structure
```
Column Index | Field Name
1            | Customer Name
2            | Customer PO
7            | Tracking Number
```

#### CustomInk Orders XLSX Structure
```
Column Name  | Description
Order #      | PO number (8-digit)
Status       | Order status (On Hold, Pipelined, etc.)
Vendor       | Department name
Due Date     | Ship-by date
```

### 5.4 Cloud Storage Structure

```
Vercel Blob Storage
├── manifests/
│   ├── sanmar_combined.xlsx      # Master combined file
│   ├── ss_combined.xlsx          # Master combined file
│   ├── customink_orders.xlsx     # Latest from scraper
│   ├── sanmar_2025-11-28.csv     # Daily from email
│   └── ss_2025-11-28.xlsx        # Daily from email
├── tracking-index.json           # Pre-built lookup index
└── sync-data.json                # Inbound/outbound sync data
```

---

## 6. API Endpoints

### 6.1 Manifest Management

#### `GET /api/manifests`

**Purpose:** List, download, or get info on manifests

| Action | Parameters | Response |
|--------|------------|----------|
| `list` | none | `{ manifests: ManifestInfo[], count }` |
| `info` | `type` | `{ found, type, filename, url, size }` |
| `download` | `type` | Redirect to blob URL |

#### `POST /api/manifests`

**Purpose:** Upload a manifest file

**Headers:**
```
x-api-key: promos-ink-2024
Content-Type: multipart/form-data
```

**Body:**
```
file: <binary>
type: sanmar | ss | customink | inbound
```

**Response:**
```json
{
  "success": true,
  "manifest": {
    "type": "sanmar",
    "filename": "sanmar.xlsx",
    "url": "https://...",
    "size": 12345
  }
}
```

### 6.2 Package Lookup

#### `GET /api/label-lookup`

**Purpose:** Instant tracking lookup from pre-built index (for label printing)

| Action | Parameters | Response |
|--------|------------|----------|
| `lookup` | `tracking`, `key` | `{ found, po, customer, department, dueDate, pipelineFlag }` |
| `health` | none | `{ status, trackingCount }` |
| `stats` | `key` | `{ totalTrackings, bySource }` |
| `refresh` | `key` | Clear cache, reload index |

#### `GET /api/lookup`

**Purpose:** Full package lookup with live carrier data

| Parameters | Response |
|------------|----------|
| `q` (tracking/PO) | Full package info + UPS/FedEx live data |
| `recent=true` | Recent inbound scans |
| `recentOutbound=true` | Recent outbound shipments |
| `stats=true` | `{ inboundTotal, outboundTotal }` |

### 6.3 Carrier APIs

#### `GET /api/ups`

| Action | Parameters | Response |
|--------|------------|----------|
| `track` | `tracking` | UPS tracking details |

#### `GET /api/fedex`

| Action | Parameters | Response |
|--------|------------|----------|
| `track` | `tracking` | FedEx tracking details |

### 6.4 Sync & Webhooks

#### `POST /api/sync`

**Purpose:** Receive inbound/outbound data from local sync scripts

**Headers:**
```
Authorization: Bearer promos-sync-2024
```

**Body:**
```json
{
  "type": "full",
  "data": {
    "inbound": [{ tracking, po, customer, timestamp }],
    "outbound": [{ tracking, recipient, address, service }]
  }
}
```

#### `POST /api/email-webhook`

**Purpose:** Receive forwarded emails from Make.com

**Headers:**
```
x-webhook-secret: promos-ink-email-2024
```

### 6.5 Index Management

#### `POST /api/upload-index`

**Purpose:** Upload pre-built tracking index

**Body:**
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
      "pipelineFlag": ""
    }
  }
}
```

---

## 7. Data Types

### 7.1 Core Interfaces

```typescript
// Tracking Index Entry
interface IndexEntry {
  source: string;                    // Original manifest filename
  sourceType: 'sanmar' | 'ss' | 'customink' | 'inbound' | 'unknown';
  po: string;                        // Purchase Order number
  customer: string;                  // Customer name (normalized)
  department?: string;               // Department (from CustomInk orders)
  dueDate?: string;                  // Due date (formatted)
  status?: string;                   // Order status
  pipelineFlag?: string;             // "On Hold" | "Pipelined" | ""
  shipperName?: string;              // For inbound packages
  referenceTokens?: string[];        // Reference numbers from shipper
}

// Manifest Info
interface ManifestInfo {
  type: string;                      // sanmar, ss, customink, etc.
  filename: string;                  // File name in blob storage
  url: string;                       // Public download URL
  size: number;                      // File size in bytes
  uploadedAt: string;                // ISO timestamp
}

// UPS Package
interface UPSPackage {
  trackingNumber: string;
  status: string;
  statusDescription: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  origin: { city, state, country, postalCode };
  destination: { city, state, country };
  service: string;
  weight?: string;
  events: UPSTrackingEvent[];
  isException: boolean;
  exceptionReason?: string;
  shipperReference?: string;
  poNumber?: string;
  invoiceNumber?: string;
}

// FedEx Package
interface FedExPackage {
  trackingNumber: string;
  status: string;
  statusDescription: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  origin: { city, state, country, postalCode };
  destination: { city, state, country, postalCode };
  service: string;
  events: FedExTrackingEvent[];
  isException: boolean;
  signedBy?: string;
  customerReference?: string;
}
```

### 7.2 Field Mapping to Carrier APIs

| Our Field | UPS API Field | FedEx API Field |
|-----------|---------------|-----------------|
| `trackingNumber` | `trackingNumber` | `trackingNumber` |
| `status` | `currentStatus.description` | `latestStatusDetail.code` |
| `estimatedDelivery` | `deliveryDate.date` | `estimatedDeliveryTimeWindow` |
| `origin.city` | `shipper.address.city` | `originLocation.locationContactAndAddress` |
| `destination.city` | `shipTo.address.city` | `recipientInformation.address` |
| `events` | `shipmentProgressActivities` | `scanEvents` |
| `poNumber` | `referenceNumber[PO]` | `shipmentDetails.possessionStatus` |

---

## 8. Integration Points

### 8.1 CustomInk Order Scraper

**Location:** QC Computer (warehouse)  
**Schedule:** Every 2 hours (11am, 1pm, 3pm, ...)  
**Output:** `customink_orders.xlsx`

**Integration:**
```python
# Upload to cloud API
response = requests.post(
    "https://package-confirmation-app.vercel.app/api/manifests",
    headers={'x-api-key': 'promos-ink-2024'},
    files={'file': ('customink_orders.xlsx', file_data)},
    data={'type': 'customink'}
)
```

### 8.2 Local Sync Scripts

| Script | Schedule | Function |
|--------|----------|----------|
| `sync-script.ps1` | Every 5 min | Copy files from network share |
| `cloud-sync.ps1` | Every 5 min | Push scan_log + outbound to cloud |
| `build_cloud_index.py` | Every 2 hrs | Rebuild tracking index |

### 8.3 Data Needed from Orders

| Field | Source | Used For |
|-------|--------|----------|
| Order # | CustomInk scraper | PO matching |
| Vendor/Department | CustomInk scraper | Label routing |
| Due Date | CustomInk scraper | Label printing |
| Status | CustomInk scraper | Pipeline flag |

### 8.4 Data Sent Back

| Destination | Data | Method |
|-------------|------|--------|
| Label Print GUI | PO, department, due date | API response |
| scan_log.csv | Scan records | Local CSV append |
| Cloud sync | Inbound/outbound stats | POST /api/sync |

---

## 9. Environment Variables

### 9.1 Vercel Environment

```bash
# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxx

# UPS API
UPS_CLIENT_ID=your_ups_client_id
UPS_CLIENT_SECRET=your_ups_client_secret
UPS_ACCOUNT_NUMBERS=E45A82,W34D92,W34G18,K9Y228

# FedEx API
FEDEX_API_KEY=your_fedex_api_key
FEDEX_SECRET_KEY=your_fedex_secret_key
FEDEX_ACCOUNT_NUMBERS=123456789,987654321

# Webhook Secrets
EMAIL_WEBHOOK_SECRET=promos-ink-email-2024
MANIFEST_UPLOAD_KEY=promos-ink-2024

# API Keys
LABEL_API_KEY=promos-label-2024
SYNC_SECRET=promos-sync-2024
```

### 9.2 Local Python Scripts

```bash
# In build_cloud_index.py
API_BASE = "https://package-confirmation-app.vercel.app"
API_KEY = "promos-label-2024"
UPLOAD_KEY = "promos-ink-2024"
```

---

## 10. Known Issues & Tech Debt

### 10.1 Missing Features

| Feature | Priority | Notes |
|---------|----------|-------|
| **Pending Packages View** | High | Compare manifest vs scanned |
| **Exception Alerts** | High | Slack/email for delayed packages |
| **Partial Shipment Tracking** | Medium | Track multi-box POs |
| **Mobile Scan App** | Medium | PWA for warehouse floor |
| **Customer Portal** | Low | Self-service tracking |

### 10.2 Technical Debt

| Issue | Impact | Remediation |
|-------|--------|-------------|
| **No database** | Limited querying | Add PostgreSQL/Supabase |
| **File-based index** | Rebuild latency | Event-driven updates |
| **No auth on web UI** | Security risk | Add NextAuth.js |
| **Hardcoded API keys** | Maintenance burden | Use env vars consistently |

### 10.3 Alignment Gaps

| Gap | Description | Fix |
|-----|-------------|-----|
| **Fast Platform lookup** | Cloud version lacks local report data | Upload report to cloud |
| **Inbound CI fallback** | Reference token parsing differs | Unify logic |
| **S&S header row** | Different header positions | Standardize parsing |

### 10.4 Performance Considerations

- **Index size**: ~8,000 tracking numbers = ~800KB JSON
- **API latency**: Index lookup <50ms, carrier APIs 500ms-2s
- **Blob storage**: Files are cached at edge, fast retrieval
- **Rate limits**: UPS (100/day free), FedEx (500/day free)

