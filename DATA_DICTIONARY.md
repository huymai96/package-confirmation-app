# Data Dictionary

> Complete documentation of all data entities in Promos Ink Supply Chain Platform

---

## Table of Contents

1. [Tracking Index Entry](#1-tracking-index-entry)
2. [Manifest Info](#2-manifest-info)
3. [UPS Package](#3-ups-package)
4. [FedEx Package](#4-fedex-package)
5. [Tracking Event](#5-tracking-event)
6. [Inbound Scan Record](#6-inbound-scan-record)
7. [Outbound Shipment](#7-outbound-shipment)
8. [Supplier](#8-supplier)
9. [Sync Data](#9-sync-data)
10. [Source Manifest Schemas](#10-source-manifest-schemas)

---

## 1. Tracking Index Entry

**Description:** Core entity representing a package in the pre-built tracking index.

**Storage:** `tracking-index.json` in Vercel Blob

**Primary Key:** Normalized tracking number (uppercase, alphanumeric only)

### Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `source` | string | Yes | Original manifest filename | `"ss"`, `"sanmar_2025-11-28.csv"` |
| `sourceType` | enum | Yes | Manifest type | `"sanmar"`, `"ss"`, `"customink"`, `"inbound"`, `"unknown"` |
| `po` | string | Yes | Purchase Order number | `"82866994A"`, `"84144186A"` |
| `customer` | string | Yes | Customer name (normalized) | `"Customink"`, `"Fast Platform"` |
| `department` | string | No | Department/vendor (from CustomInk orders) | `"Apparel Division"`, `"ooshirts DTG"` |
| `dueDate` | string | No | Due date (formatted) | `"Mon, Dec 02"`, `"12/02"` |
| `status` | string | No | Order status | `"In Production"`, `"On Hold"` |
| `pipelineFlag` | string | No | Pipeline indicator | `"On Hold"`, `"Pipelined"`, `""` |
| `shipperName` | string | No | Shipper name (for inbound) | `"SANMAR CORP, COPPELL TX"` |
| `referenceTokens` | string[] | No | Reference numbers from shipper | `["84595597A", "ORD-12345"]` |

### Validation Rules

| Field | Rule |
|-------|------|
| `sourceType` | Must be one of: `sanmar`, `ss`, `customink`, `inbound`, `unknown` |
| `po` | Non-empty string, typically 7-10 digits with optional letter suffix |
| `dueDate` | Formatted date string or empty |
| `pipelineFlag` | One of: `"On Hold"`, `"Pipelined"`, `""` |

### Example

```json
{
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
```

### Relationships

```
IndexEntry
    └── Created from: Manifest (Sanmar/S&S/CustomInk)
    └── Enriched by: CustomInk Orders (department, dueDate, status)
    └── Queried by: Label Print GUI, Web Dashboard
```

---

## 2. Manifest Info

**Description:** Metadata about an uploaded manifest file.

**Storage:** Vercel Blob metadata + API response

### Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `type` | string | Yes | Manifest type identifier | `"sanmar"`, `"ss"`, `"customink"` |
| `filename` | string | Yes | File name in storage | `"sanmar_2025-11-28.csv"` |
| `url` | string | Yes | Public download URL | `"https://...blob.vercel-storage.com/..."` |
| `size` | number | Yes | File size in bytes | `245678` |
| `uploadedAt` | string | Yes | ISO 8601 timestamp | `"2025-11-28T15:30:00.000Z"` |

### Valid Manifest Types

| Type | Default Extension | Source |
|------|-------------------|--------|
| `customink` | `.xlsx` | CI Scraper |
| `sanmar` | `.csv` | Email (Make.com) |
| `ss` | `.xlsx` | Email (Make.com) |
| `ssactivewear` | `.xlsx` | Alias for `ss` |
| `inbound` | `.csv` | UPS Quantum View |
| `quantumview` | `.csv` | Alias for `inbound` |
| `sanmar_combined` | `.xlsx` | Master file |
| `ss_combined` | `.xlsx` | Master file |

### Example

```json
{
  "type": "sanmar",
  "filename": "sanmar_2025-11-28.csv",
  "url": "https://2hjrsjkqncbwsvoa.public.blob.vercel-storage.com/manifests/sanmar_2025-11-28.csv",
  "size": 245678,
  "uploadedAt": "2025-11-28T15:30:00.000Z"
}
```

---

## 3. UPS Package

**Description:** Package tracking data from UPS API.

### Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `trackingNumber` | string | Yes | UPS tracking number | `"1Z90A10R0306936706"` |
| `status` | string | Yes | Status code | `"D"`, `"I"`, `"X"` |
| `statusDescription` | string | Yes | Human-readable status | `"DELIVERED"`, `"IN TRANSIT"` |
| `estimatedDelivery` | string | No | Expected delivery date | `"2025-11-28"` |
| `actualDelivery` | string | No | Actual delivery timestamp | `"2025-11-28T09:45:00"` |
| `origin` | object | Yes | Origin address | See below |
| `destination` | object | Yes | Destination address | See below |
| `service` | string | Yes | Service type | `"UPS Ground"`, `"UPS Next Day Air"` |
| `weight` | string | No | Package weight | `"5.2 LBS"` |
| `events` | array | Yes | Tracking events | See TrackingEvent |
| `isException` | boolean | Yes | Has delivery exception | `true`, `false` |
| `exceptionReason` | string | No | Exception description | `"DELIVERY ATTEMPTED"` |
| `shipperReference` | string | No | Shipper's reference | `"ORD-12345"` |
| `poNumber` | string | No | PO number from reference | `"82866994A"` |
| `invoiceNumber` | string | No | Invoice number | `"INV-67890"` |
| `shipperName` | string | No | Shipper company name | `"SANMAR CORP"` |
| `recipientName` | string | No | Recipient name | `"PROMOS INK"` |

### Address Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `city` | string | Yes | City name |
| `state` | string | Yes | State/province code |
| `country` | string | Yes | Country code |
| `postalCode` | string | No | ZIP/postal code |

### UPS Status Codes

| Code | Description |
|------|-------------|
| `D` | Delivered |
| `I` | In Transit |
| `X` | Exception |
| `P` | Pickup |
| `M` | Manifest |
| `O` | Out for Delivery |

### Example

```json
{
  "trackingNumber": "1Z90A10R0306936706",
  "status": "D",
  "statusDescription": "DELIVERED",
  "actualDelivery": "2025-11-28T09:45:00",
  "origin": {
    "city": "FORT WORTH",
    "state": "TX",
    "country": "US",
    "postalCode": "76177"
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
  "shipperName": "S&S ACTIVEWEAR"
}
```

---

## 4. FedEx Package

**Description:** Package tracking data from FedEx API.

### Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `trackingNumber` | string | Yes | FedEx tracking number | `"794644790045"` |
| `status` | string | Yes | Status code | `"DL"`, `"IT"`, `"DE"` |
| `statusDescription` | string | Yes | Human-readable status | `"Delivered"`, `"In transit"` |
| `estimatedDelivery` | string | No | Expected delivery | `"2025-11-28T18:00:00"` |
| `actualDelivery` | string | No | Actual delivery | `"2025-11-28T14:30:00"` |
| `origin` | object | Yes | Origin address | See Address |
| `destination` | object | Yes | Destination address | See Address |
| `service` | string | Yes | Service type | `"FedEx Ground"`, `"FedEx Express"` |
| `weight` | string | No | Package weight | `"3.5 LBS"` |
| `events` | array | Yes | Tracking events | See TrackingEvent |
| `isException` | boolean | Yes | Has delivery exception | `true`, `false` |
| `exceptionReason` | string | No | Exception description | `"Customer not available"` |
| `signedBy` | string | No | Signature | `"J.SMITH"` |
| `shipperReference` | string | No | Shipper's reference | `"REF-12345"` |
| `poNumber` | string | No | PO number | `"84144186A"` |
| `customerReference` | string | No | Customer reference | `"CUST-99999"` |
| `shipperName` | string | No | Shipper company | `"ALPHABRODER"` |
| `recipientName` | string | No | Recipient name | `"PROMOS INK INC"` |

### FedEx Status Codes

| Code | Description |
|------|-------------|
| `DL` | Delivered |
| `IT` | In Transit |
| `DE` | Delivery Exception |
| `PU` | Picked Up |
| `OD` | Out for Delivery |
| `DP` | Departed |
| `AR` | Arrived |

---

## 5. Tracking Event

**Description:** A single tracking event/scan in a package's journey.

### Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `date` | string | Yes | Event date | `"2025-11-28"` |
| `time` | string | Yes | Event time | `"09:45"` |
| `location` | string | Yes | Event location | `"DALLAS, TX"` |
| `status` | string | Yes | Status code | `"D"`, `"I"` |
| `description` | string | Yes | Event description | `"DELIVERED"`, `"ARRIVAL SCAN"` |

### Example

```json
{
  "date": "2025-11-28",
  "time": "09:45",
  "location": "DALLAS, TX",
  "status": "D",
  "description": "DELIVERED"
}
```

---

## 6. Inbound Scan Record

**Description:** A scanned package logged at receiving.

**Storage:** `scan_log.csv` (local file, synced to cloud)

### Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `Timestamp` | string | Yes | Scan date/time | `"2025-11-28 10:15:32"` |
| `Tracking/LPN` | string | Yes | Tracking number | `"1Z90A10R0306936706"` |
| `PO#` | string | Yes | Purchase Order | `"82866994A"` |
| `Department/Customer` | string | No | Department or customer | `"Customink"` |
| `Due Date` | string | No | Due date | `"Mon, Dec 02"` |
| `Status` | string | Yes | Scan result | `"Printed"`, `"Not Found"` |

### Valid Status Values

| Status | Description |
|--------|-------------|
| `Printed` | Label printed for CustomInk order |
| `Manifest Print` | Label printed for manifest package |
| `Fast Platform Manifest Print` | Label for Fast Platform |
| `Inbound→CI Fallback` | CI order found via inbound reference |
| `Inbound Strict-Not-Found` | Inbound package, no CI match |
| `Not Found` | Package not in any manifest |

### CSV Format

```csv
Timestamp,Tracking/LPN,PO#,Department/Customer,Due Date,Status
2025-11-28 10:15:32,1Z90A10R0306936706,82866994A,Customink,Mon Dec 02,Manifest Print
2025-11-28 10:14:15,LP0154998332,84144186A,CUSTOMINK.COM LLC,,Printed
```

---

## 7. Outbound Shipment

**Description:** An outgoing shipment from warehouse shipping stations.

**Storage:** Shipping station CSVs (OneDrive), synced to cloud

### Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `tracking` | string | Yes | Tracking number | `"1Z90A10R9876543210"` |
| `recipient` | string | Yes | Recipient name | `"John Smith"` |
| `company` | string | No | Company name | `"Acme Corp"` |
| `address` | string | Yes | Street address | `"123 Main St"` |
| `city` | string | Yes | City | `"Chicago"` |
| `state` | string | Yes | State | `"IL"` |
| `zip` | string | Yes | ZIP code | `"60601"` |
| `country` | string | Yes | Country | `"US"` |
| `service` | string | Yes | Shipping service | `"UPS Ground"` |
| `reference` | string | No | Reference numbers | `"ORD-67890 INV-12345"` |
| `location` | string | Yes | Warehouse location | `"FB1"`, `"FB2"` |
| `station` | string | Yes | Shipping station | `"UPS Station 2"` |

### Example

```json
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
```

---

## 8. Supplier

**Description:** A known supplier with shipping to our warehouses.

### Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | string | Yes | Unique identifier | `"sanmar"` |
| `name` | string | Yes | Full company name | `"SanMar Corporation"` |
| `shortName` | string | Yes | Display name | `"SanMar"` |
| `website` | string | Yes | Website URL | `"https://www.sanmar.com"` |
| `zipCodes` | string[] | Yes | Known origin ZIPs | `["75261", "76101"]` |
| `city` | string | Yes | Primary city | `"Coppell"` |
| `state` | string | Yes | State | `"TX"` |
| `category` | string | Yes | Business category | `"Blank Apparel"` |
| `contact` | object | No | Contact info | `{ phone, email }` |
| `notes` | string | No | Additional notes | `"Primary blank supplier"` |

### Known Suppliers

| ID | Name | ZIP Codes | Category |
|----|------|-----------|----------|
| `sanmar` | SanMar Corporation | 75261, 76101 | Blank Apparel |
| `ssactivewear` | S&S Activewear | 76177 | Blank Apparel |
| `alphabroder` | alphabroder | 66219 | Blank Apparel |
| `imagetech` | Image Technology | 92801 | Equipment |

---

## 9. Sync Data

**Description:** Combined inbound/outbound data stored in cloud.

**Storage:** `sync-data.json` in Vercel Blob

### Structure

```json
{
  "lastUpdated": "2025-11-28T17:30:00.000Z",
  "inbound": {
    "records": [...],
    "count": 3560,
    "lastSync": "2025-11-28T17:30:00.000Z"
  },
  "outbound": {
    "records": [...],
    "count": 12450,
    "lastSync": "2025-11-28T17:30:00.000Z"
  },
  "stats": {
    "inboundTotal": 3560,
    "outboundTotal": 12450,
    "todayInbound": 145,
    "todayOutbound": 523
  }
}
```

---

## 10. Source Manifest Schemas

### Sanmar CSV

| Column | Index | Field Name | Description |
|--------|-------|------------|-------------|
| A | 0 | Decorator customer name | Account name |
| B | 1 | Sales Order | Sanmar SO number |
| C | 2 | Customer Name | End customer |
| D | 3 | Customer Account | Account ID |
| E | 4 | Customer PO | **PO Number** |
| F | 5 | Line Status | Line status |
| G | 6 | Order Status | Order status |
| H | 7 | Whse | Warehouse code |
| I | 8 | ShipDate | Ship date |
| J | 9 | ShipVia | Carrier |
| K | 10 | Pro number | Pro number |
| L | 11 | Tracking number | **Tracking** |
| M | 12 | Carton Number | Box number |
| N | 13 | Weight | Weight |
| O | 14 | Catalog Style | Style |
| P | 15 | Catalog Color | Color |
| Q | 16 | Catalog Size | Size |
| R | 17 | Qty shipped | Quantity |

### S&S XLSX

| Column | Index | Field Name | Description |
|--------|-------|------------|-------------|
| A | 0 | Ship Date | Ship date |
| B | 1 | Customer Name | **Customer** |
| C | 2 | Customer PO | **PO Number** |
| D | 3 | Customer Invoice Number | Invoice |
| E | 4 | Box Number | Box number |
| F | 5 | Warehouse | Warehouse |
| G | 6 | Shipping Method | Carrier |
| H | 7 | Tracking Number | **Tracking** |
| I | 8 | Sku | SKU |
| J | 9 | Mill | Brand |
| K | 10 | Style | Style |
| L | 11 | Color | Color |
| M | 12 | Size | Size |
| N | 13 | QtyOrdered | Ordered |
| O | 14 | QtyShipped | Shipped |
| P | 15 | OrderNumber | S&S order |

### CustomInk Orders XLSX

| Column | Field Name | Description |
|--------|------------|-------------|
| A | Order # | **PO Number** (8-digit) |
| B | Status | Order status |
| C | Vendor | **Department** |
| D | Units | Unit count |
| E | Screens | Screen count |
| F | Shipper | Shipper info |
| G | Check-In | Check-in date |
| H | Due Date | **Due Date** |

### UPS Quantum View Inbound CSV

| Column | Index | Field Name | Description |
|--------|-------|------------|-------------|
| A | 0 | Tracking Number | **Tracking** |
| B | 1 | Reference Numbers | PO/reference tokens |
| C | 2 | Ship Date | Ship date |
| D | 3 | Scheduled Delivery | Expected delivery |
| E | 4 | Shipper Name | **Shipper** |
| F | 5 | Shipper Address | Full address |
| G | 6 | Consignee Name | Recipient |
| H | 7 | Consignee Address | Delivery address |

---

## Customer Name Normalization Map

| Raw Value | Normalized |
|-----------|------------|
| `GATEWAY CDI` | `Brand Addition` |
| `GatewayCDI Inc` | `Brand Addition` |
| `Gateway CDI` | `Brand Addition` |
| `Eretailing Technology Group LLC` | `Fast Platform` |
| `eRetailing Technology Group` | `Fast Platform` |
| `ADVANCED GRAPHIC PRODUCTS` | `AOSWAG` |
| `GetOnChat LLC` | `Ooshirts` |
| `BSN SPORTS INC` | `BSN Sports` |

---

## PO Classification Patterns

| Pattern | Type | Example | Description |
|---------|------|---------|-------------|
| `\d{7,10}[A-Z]` | ci_package | `84595597A` | CustomInk package |
| `\d{7,10}` | ci_plain | `84595597` | CustomInk plain |
| `\d{7,10}-\d+` | manifest_sub | `84595597-1` | Multi-box shipment |
| `*` | unknown | `ABC123` | Other format |


