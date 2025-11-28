# Architectural Decision Records (ADR)

> This document captures key architectural decisions made during the development of the Promos Ink Supply Chain Platform, including context, alternatives considered, and rationale.

---

## ADR-001: Vercel + Next.js as Hosting Platform

**Date:** November 2025  
**Status:** Accepted  
**Context:** Need a platform for hosting the supply chain API and web dashboard.

### Decision

Use Vercel with Next.js 14 App Router for hosting.

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Vercel + Next.js** | Zero-config deployment, edge functions, blob storage | Vendor lock-in |
| **AWS Lambda + API Gateway** | More control, lower cost at scale | Complex setup, cold starts |
| **Self-hosted Node.js** | Full control | Maintenance burden, uptime |
| **Railway/Render** | Simple, cheap | Less ecosystem |

### Rationale

- **Developer velocity**: Git push → deploy in 30 seconds
- **Blob storage**: Native integration for manifest files
- **Edge functions**: Low latency for API calls
- **Free tier**: Sufficient for current volume (~1000 requests/day)

### Consequences

- Tied to Vercel's pricing model
- Must use their blob storage or external S3

---

## ADR-002: Pre-built JSON Index for Package Lookup

**Date:** November 2025  
**Status:** Accepted  
**Context:** Label print GUI needs instant (<100ms) lookup of tracking numbers.

### Decision

Build a JSON index offline and upload to Vercel Blob. Cache in memory on API server.

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **JSON index + memory cache** | Instant lookup, simple | Stale data until rebuild |
| **Real-time manifest parsing** | Always fresh | 2-5 second latency per lookup |
| **PostgreSQL database** | Queryable, fresh | Additional service, cost |
| **Elasticsearch** | Full-text search | Overkill, expensive |

### Rationale

- **Speed**: Warehouse workers scan 100+ packages/hour; latency kills productivity
- **Simplicity**: Single JSON file, no database to manage
- **Cost**: $0 for blob storage reads
- **Acceptable staleness**: Index rebuilds every 2 hours; 2-hour-old manifest data is fine

### Consequences

- Must run `build_cloud_index.py` periodically
- New packages not visible until next index build
- Index size grows with data (currently 800KB for 8,000 trackings)

---

## ADR-003: Email Forwarding via Make.com for Manifest Ingestion

**Date:** November 2025  
**Status:** Accepted  
**Context:** Sanmar and S&S send shipping manifests via email. Need to auto-ingest.

### Decision

Use Make.com Mailhook to receive forwarded emails and POST to our webhook.

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Make.com Mailhook** | No email server needed, visual workflow | $9/month, third-party dependency |
| **Gmail API polling** | Direct control | Complex OAuth, polling latency |
| **AWS SES + Lambda** | Scalable | Setup complexity |
| **Manual upload** | Simple | Human error, delays |

### Rationale

- **Zero infrastructure**: No email server to maintain
- **Visual debugging**: Make.com shows every step
- **Reliability**: Make.com handles retries, rate limits
- **Speed to implement**: 30 minutes vs days

### Consequences

- Monthly cost ($9-29/month)
- Dependent on Make.com uptime
- Email forwarding must be configured correctly

---

## ADR-004: Python for Label Print GUI (Not Web-Based)

**Date:** November 2025  
**Status:** Accepted  
**Context:** Warehouse floor needs a scanning application.

### Decision

Use Python with Tkinter for a native desktop app, not a web app.

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Python + Tkinter** | Offline capable, direct printer access | Not web, must install |
| **Electron app** | Web tech, cross-platform | Heavy, complex |
| **PWA** | No install, works offline | Limited printer access |
| **Web app** | Accessible anywhere | Requires network, print dialogs |

### Rationale

- **Printer integration**: `os.startfile(path, "print")` sends directly to thermal printer
- **Reliability**: Works even if internet is slow; falls back to local index
- **Existing workflow**: Warehouse already has Python installed
- **Speed**: Native app opens instantly, no browser overhead

### Consequences

- Must maintain two codebases (cloud GUI + offline GUI)
- Updates require re-downloading script
- Windows-only (for `os.startfile`)

---

## ADR-005: Separate Combined Manifests for Offline Use

**Date:** November 2025  
**Status:** Accepted  
**Context:** Offline label print GUI needs access to Sanmar/S&S data without API calls.

### Decision

Maintain `sanmar_combined.xlsx` and `ss_combined.xlsx` as master files that can be downloaded for offline use.

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Combined files in cloud** | Downloadable for offline, same format as original | Two sources of truth |
| **Index-only approach** | Simpler, one source | Offline GUI can't work |
| **Sync entire database** | Full offline capability | Complex, large files |

### Rationale

- **Backward compatibility**: Existing offline GUI expects specific Excel format
- **Simplicity**: Download file, open in offline app, works the same
- **Resilience**: Internet outage doesn't stop receiving

### Consequences

- Must keep combined files in sync with daily manifests
- Column structure must match original supplier format exactly
- Users must manually download updates (or automate)

---

## ADR-006: Customer Name Normalization

**Date:** November 2025  
**Status:** Accepted  
**Context:** Same customer appears with different names across suppliers.

### Decision

Implement a static mapping of known variations to canonical names.

```python
CUSTOMER_NAME_MAPPING = {
    "GATEWAY CDI": "Brand Addition",
    "GatewayCDI Inc": "Brand Addition",
    "Eretailing Technology Group LLC": "Fast Platform",
    "ADVANCED GRAPHIC PRODUCTS": "AOSWAG",
    "GetOnChat LLC": "Ooshirts",
}
```

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Static mapping** | Fast, predictable, easy to maintain | Must manually add new variations |
| **Fuzzy matching** | Auto-handles variations | False positives, slower |
| **Customer master database** | Single source of truth | Another system to maintain |

### Rationale

- **Known customers**: We have ~20 frequent customers with known variations
- **Performance**: Mapping lookup is O(1)
- **Correctness**: No risk of fuzzy match mistakes (e.g., "Fast" ≠ "Fast Platform")

### Consequences

- New customer variations must be manually added
- Occasional unknown customers appear un-normalized

---

## ADR-007: PO Classification Logic

**Date:** November 2025  
**Status:** Accepted  
**Context:** Different PO formats require different label layouts.

### Decision

Classify POs by regex pattern:

| Pattern | Type | Example | Label Style |
|---------|------|---------|-------------|
| `\d{7,10}[A-Z]` | CustomInk Package | 84595597A | Full CI label |
| `\d{7,10}` | CustomInk Plain | 84595597 | Full CI label |
| `\d{7,10}-\d+` | Manifest Sub | 84595597-1 | Manifest label |
| Other | Unknown | ABC123 | Generic label |

### Rationale

- **CustomInk format**: 8-digit number + optional letter suffix is their standard
- **Manifest sub-POs**: Some suppliers split orders (e.g., multi-box shipments)
- **Clear rules**: No ambiguity in classification

### Consequences

- PO formats from new suppliers may need new patterns
- False positives possible if other supplier uses similar format

---

## ADR-008: OAuth Token Caching for Carrier APIs

**Date:** November 2025  
**Status:** Accepted  
**Context:** UPS and FedEx APIs require OAuth tokens that expire.

### Decision

Cache tokens in memory with 1-minute safety buffer before expiry.

```typescript
let tokenCache: Token | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache) {
    const expiresAt = tokenCache.issued_at + (tokenCache.expires_in * 1000) - 60000;
    if (Date.now() < expiresAt) {
      return tokenCache.access_token;
    }
  }
  // Refresh...
}
```

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **In-memory cache** | Simple, fast | Lost on server restart |
| **Redis cache** | Shared across instances | Additional service |
| **Per-request token** | Always fresh | Rate limited, slow |

### Rationale

- **Vercel serverless**: Functions may be warm for several requests
- **Token lifetime**: UPS tokens last 4 hours, FedEx 1 hour
- **Simplicity**: No external cache needed

### Consequences

- Cold starts require fresh token (adds ~500ms)
- Multiple instances may each have their own token (wastes quota)

---

## ADR-009: Scheduled Task Architecture

**Date:** November 2025  
**Status:** Accepted  
**Context:** Multiple background processes need to run on schedules.

### Decision

Use Windows Task Scheduler on local PC, not cloud cron.

| Task | Schedule | Why Local |
|------|----------|-----------|
| `sync-script.ps1` | 5 min | Needs network share access |
| `cloud-sync.ps1` | 5 min | Reads local OneDrive files |
| `build_cloud_index.py` | 2 hrs | Can run anywhere, but kept with others |

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Windows Task Scheduler** | Access to local files, simple | Single point of failure |
| **Vercel Cron** | Managed, no local PC | Can't access local files |
| **GitHub Actions** | Free, managed | 5-minute minimum, no local access |
| **Azure Functions Timer** | Scalable | Overkill, cost |

### Rationale

- **Local file access**: Must read from network share and OneDrive
- **Existing infrastructure**: PC already running 24/7
- **Simplicity**: PowerShell/Python scripts, no deployment pipeline

### Consequences

- If PC is off, tasks don't run
- No centralized monitoring
- Must manage schedules manually

---

## ADR-010: Manifest Retention Policy

**Date:** November 2025  
**Status:** Accepted  
**Context:** Email webhook receives daily manifests; storage grows indefinitely.

### Decision

- Keep **10 most recent manifests per supplier**
- Combined files (`sanmar_combined.xlsx`, `ss_combined.xlsx`) retain **10 days of data**

### Rationale

- **Storage cost**: Vercel Blob charges for storage; limit growth
- **Relevance**: Packages older than 10 days are usually processed
- **Recovery**: Can always re-upload if needed

### Consequences

- Old tracking numbers may disappear from index
- Must ensure combined files are kept in sync

---

## ADR-011: No Authentication on Web UI

**Date:** November 2025  
**Status:** Accepted (Temporary)  
**Context:** Web dashboard is accessible without login.

### Decision

Defer authentication; rely on obscurity and read-only nature.

### Rationale

- **Speed to launch**: Auth adds complexity
- **Read-only**: Dashboard doesn't allow destructive actions
- **Internal use**: Not exposed to public internet (mostly)

### Consequences

- **Security risk**: Anyone with URL can view data
- **Technical debt**: Must add auth before exposing externally

### Future Plan

Add NextAuth.js with Microsoft Entra ID (Azure AD) for SSO with company accounts.

---

## Summary of Key Decisions

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Platform | Vercel + Next.js | Developer velocity |
| Data store | JSON in Blob | Simplicity, cost |
| Email ingestion | Make.com | Zero infrastructure |
| Label GUI | Python + Tkinter | Direct printer access |
| Offline support | Combined XLSX files | Backward compatibility |
| Customer names | Static mapping | Correctness |
| Token caching | In-memory | Simplicity |
| Scheduling | Windows Task Scheduler | Local file access |
| Auth | None (temporary) | Speed to launch |

