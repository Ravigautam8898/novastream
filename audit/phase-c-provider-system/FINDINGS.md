# Phase C — Dynamic Provider Plugin System — Findings

> **Phase:** C — Dynamic Provider Plugin System
> **Status:** 🔒 C1+C2 FROZEN — C3 ACTIVE
> **Implementation:**
> - C1 Architecture ✅ Complete
> - C2 Provider Framework ✅ Complete
> - C3 YupFlix Migration 🟡 Active
> **Last Updated:** July 7, 2026

---

## Phase Overview

**Purpose:** Move NovaStream from a single embedded provider architecture into a scalable provider plugin system supporting 10+, 20+, 50+ external content providers without modifying core application code.

**Current Architecture:**
```
TMDB Metadata → ContentSourceService → Hardcoded YupFlix Provider → Stream Resolver → Player
```

**Target Architecture:**
```
NovaStream Core → ProviderManager → providers/ (yupflix, castle, bollyflix, ...) → Extractors → Existing Stream System
```

---

## Standard Finding Entry

```
### C-XXX — Short Finding Title

| Field | Value |
|-------|-------|
| **Finding ID** | C-XXX |
| **Phase** | C — Dynamic Provider Plugin System |
| **Category** | [Architecture / Security / Backend / ...] |
| **Severity** | Critical | High | Medium | Low | Information |
| **Risk** | Critical | High | Medium | Low |
| **Status** | OPEN | VERIFIED | APPROVED | IMPLEMENTING | IMPLEMENTED | BUILD PASSED | WAITING USER TEST | REGRESSION PASSED | CERTIFIED | CLOSED | REJECTED | WONT_FIX |
| **Affected Files** | `path/to/file.js:line` |

**Description:**
Brief description of the issue.

**Root Cause:**
The underlying cause, not just the symptom.

**Recommended Remediation:**
Exactly what code changes are needed.

**Implementation Notes:**
*Filled after implementation.*

| User Approval | Implementation Date | Build Status | Browser Test Status | Regression Status |
|:---:|:---:|:---:|:---:|:---:|
| [Approved / Pending] | YYYY-MM-DD | [PASS / FAIL] | [PASS / FAIL] | [PASS / FAIL] |

**Certification Status:** [CERTIFIED / PENDING]

**Certified By:** [Role — Date]

**Notes:**
*Any additional context, edge cases, or follow-up items.*
```

---

## Problem Statement

### Current Flow
```
TMDB Metadata
      |
ContentSourceService
      |
Hardcoded YupFlix Provider
      |
Stream Resolver
      |
Player
```

### Problems

| # | Problem | Impact |
|---|---------|--------|
| 1 | Provider logic is embedded in `ContentSourceService` | Adding another provider requires code changes to core service |
| 2 | No fallback chain | If YupFlix changes domain, API, encryption, or headers, streaming breaks entirely |
| 3 | No provider health tracking | No way to know if a provider is operational without testing a stream |
| 4 | No hot provider replacement | Provider code changes require full server restart |
| 5 | No scalable provider management | No registry, no priority system, no per-provider config |
| 6 | Parsers embedded in SOURCES config | Cannot version or swap parsers independently |

---

## Target Architecture

```
NovaStream Core
        |
ProviderManager
        |
providers/
    yupflix.provider.js
    castle.provider.js
    bollyflix.provider.js
    cinetv.provider.js
```

Each provider is independent. Provider failure must never crash NovaStream.

---

## Proposed Folder Structure

```
server/src/providers/
    ProviderManager.js          — Discovery, loading, priority, fallback chain
    BaseProvider.js             — Abstract class / interface contract
    ProviderRegistry.js         — Database-backed provider config (enable, priority, version)

    sources/
        yupflix.provider.js     — YupFlix provider (migrated from ContentSourceService)
        castle.provider.js      — CastleTV provider
        bollyflix.provider.js   — Bollyflix provider

    extractors/
        streamwish.extractor.js — StreamWish video host resolver
        filemoon.extractor.js   — FileMoon video host resolver
```

**Design rationale:** Providers find content. Extractors resolve video hosts. Never duplicate extractor code inside every provider.

**Resolution flow:**
```
Castle Provider → find iframe/source → ExtractorManager → m3u8 URL → Existing NovaStream Stream System
```

---

## Provider Interface Contract

Every provider MUST expose:

### Metadata
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g. `'castletv'`) |
| `name` | string | Display name |
| `version` | string | Semver |
| `author` | string | Author/ maintainer |
| `enabled` | boolean | Whether provider is active |
| `providerType` | string | `'API'` or `'LIGHT_SCRAPER'` or `'BROWSER_SCRAPER'` — indicates cost tier and execution mode |
| `priority` | number | Lower = tried first (default 100) |
| `execution` | object | Execution strategy: mode, maxConcurrent, timeout (see execution section below) |

**Provider type distinction:**
| Type | Speed | CPU Cost | Execution Mode | Examples |
|------|-------|----------|----------------|---------|
| **API** | Fast | Low | `DIRECT` — runs in ProviderManager inline | CastleTV, CineTv (structured JSON endpoints) |
| **LIGHT_SCRAPER** | Medium | Medium | `QUEUE` — runs through ScraperQueue with concurrency limits | Bollyflix, Bilibili (HTML parsing, cheerio) |
| **BROWSER_SCRAPER** | Slow | High | `WORKER` — runs in isolated worker process | Some WaveStream providers (puppeteer, Playwright) |

**Why three categories?** API providers are cheap and can run directly. LIGHT_SCRAPER providers do HTTP scraping (HTML parsing with cheerio) but can overload the server under high concurrency — they need a controlled queue. BROWSER_SCRAPER providers use browser automation (headless Chrome, Playwright) which is CPU/RAM intensive and must run in isolated worker processes to protect the NovaStream API server. See [Provider Execution Strategy](#provider-execution-strategy) for details.

This distinction drives both ProviderManager selection ordering and execution strategy (see below).

### Lifecycle
| Method | Returns | Description |
|--------|---------|-------------|
| `initialize()` | Promise\<void\> | Set up client, load secrets |
| `healthCheck()` | Promise\<{ok, latency, error?}\> | Check if provider is operational |
| `dispose()` | Promise\<void\> | Cleanup on unload |

### Content Methods
| Method | Returns | Description |
|--------|---------|-------------|
| `search(query)` | Promise\<Array\> | Search movies, series, anime, live TV |
| `getDetails(contentId)` | Promise\<Object\> | Full content metadata |
| `getEpisodes(contentId)` | Promise\<Array\> | Episode list for series |
| `getStreams(contentId, options?)` | Promise\<Array\> | Streaming URLs with qualities |

**Why NOT `getMovie()` / `getSeries()`:** Future providers may include movies, series, anime, and live TV. The interface should be content-type independent.

---

## Provider Resolution Policy — CRITICAL

**DO NOT query providers when user opens a detail page.**

**WRONG:**
```
User opens Avengers → Call 50 providers → Huge server load
```

**CORRECT:**
```
User opens content:
  Load only: TMDB data, images, cast, seasons, episodes
  ZERO provider calls.

Provider resolving happens ONLY when:
  1. User presses PLAY
  2. Background refresh worker runs
```

---

## Auto Provider Mode

**Default user experience:**
```
Movie Details:
  [ PLAY ]
  Source: Auto ⭐

Advanced:
  Change Source
      🔵 Fast Sources (API)
          CastleTV
          CineTv
      🟡 Backup Sources (Scraper)
          Bollyflix
          Bilibili
```

Auto mode is default. Manual selection is optional.

**Source selector UI shows provider type labels** (Fast / Backup) so users understand why some sources resolve faster than others.

---

## Smart Provider Resolution Flow

```
User clicks Play
     |
Step 1: Check StreamCache
     |
     ├── IF FOUND: return cached stream immediately
     |
     └── IF NOT FOUND: Acquire ProviderResolveLock
              |
         Step 2: Try API providers — DIRECT execution (ordered by health → type → success rate → priority → speed)
              |
              ├── Provider A (API): health OK? → try getStreams()
              |       ├── Success: save cache → release lock → return stream
              |       └── Fail: try next API provider
              |
              └── ALL API providers failed
                       |
                  Step 3: Submit SCRAPER requests to ScraperQueue
                       |
                  ScraperQueue (limited concurrency):
                       ├── LIGHT_SCRAPER providers → queued HTTP requests
                       |       ├── Provider B (LIGHT_SCRAPER, queue): success → save cache → return
                       |       └── Fail: try next queued provider
                       |
                       └── BROWSER_SCRAPER providers → isolated WORKER process
                               ├── Provider C (BROWSER_SCRAPER, worker): success → save cache → return
                               └── Fail: try next provider
                       |
                  ALL providers failed → return 404 / "No sources available"
```

---

## Stream Lifecycle Management — Existing Implementation Review

> **Purpose:** Before freezing Track C C1 architecture, verify whether the existing NovaStream/YupFlix streaming flow already supports lifecycle-aware stream caching. Do not duplicate existing functionality.
> **Date reviewed:** July 6, 2026
> **Source files analyzed:** `content-source.service.js`, `stream.service.js`, `stream.routes.js`, `external-source.routes.js`, `WatchPage.jsx`, `external-source.api.js`

### Current Cache Architecture

The existing NovaStream system already implements **two logically separate cache layers**, though they are not explicitly named as such:

**Layer 1 — Provider Match Cache (Content.sourceId)**
| Property | Value |
|----------|-------|
| **Storage** | `Content` document field (`sourceId`, `sourceSite`) |
| **TTL** | Permanent — never expires (survives server restarts) |
| **Purpose** | Maps TMDB content to the provider's internal content ID |
| **Current use** | `ContentSourceService.getStreamUrl()` reads `content.sourceId` to build cache key |

**Layer 2 — Stream URL Cache (_streamCache)**
| Property | Value |
|----------|-------|
| **Storage** | MongoDB `_streamCache` collection |
| **Cache key** | `{sourceSite}:{type}:{sourceId}:{quality}[:season:episode]` |
| **Key examples** | `primary:movie:12345:720p`, `primary:series:12345:s1:e1:720p` |
| **TTL** | Dynamic — based on URL's `expires` param or 24h fallback |
| **Expiry mechanism** | MongoDB TTL index (`expireAfterSeconds: 0`) + 10-minute safety buffer in `get()` |
| **Per-process dedup** | `pendingFetches` Map — prevents duplicate concurrent fetches within same worker |

### YupFlix URL Type Determination

**Result: SIGNED_URL**

The YupFlix CDN URLs include an `expires` query parameter. The code in `_fetchAndCache()` at line 417:
```javascript
expiresAt = parseInt(urlObj.searchParams.get('expires')) || (Math.floor(Date.now() / 1000) + 86400);
```

This confirms YupFlix provides **signed URLs with embedded expiry**. The system correctly:
1. Extracts the `expires` timestamp from the CDN URL
2. Uses it as the cache TTL (MongoDB TTL index auto-cleans expired docs)
3. Falls back to 24 hours if no `expires` param is present
4. Applies a 10-minute safety buffer before actual expiry to prevent stale access

### Existing Refresh Behavior

The system already supports **proactive refresh before expiry**:

**Server side (`content-source.service.js`):**
- `refreshStreamUrl()` — deletes the cache entry, then re-fetches from provider
- `POST /api/external/refresh` — endpoint that the frontend calls ~10 min before expiry

**Client side (`WatchPage.jsx`):**
- Schedules `handleRefresh()` at `expiresAt - 10min` via `setTimeout`
- If refresh fails, retries every 30 seconds
- Proper cleanup on unmount (`clearTimeout` in `useEffect` return)

### Per-Provider Stream Policy — Gap Analysis

| Requirement | Existing Support | Track C Action |
|-------------|:----------------:|:--------------:|
| Provider Match cache (TMDB ID → provider content ID) | ✅ Content.sourceId — permanent, survives restarts | **Reuse as-is** — no separate cache needed |
| Stream URL cache with TTL | ✅ `_streamCache` — MongoDB TTL index + safety buffer | **Reuse as-is** |
| Signed URL detection | ✅ `expires` param parsed from URL | Add explicit `streamPolicy` to metadata |
| Proactive refresh before expiry | ✅ 10-min timer client-side, `/refresh` endpoint server-side | **Reuse as-is** |
| **Playback failure auto-retry** | ❌ NOT supported — 401/403/410 shows error page | **NEW** — add retry on playback failure |
| **`streamPolicy` in provider metadata** | ❌ NOT present — YupFlix behavior is implicit in parser code | **NEW** — add `streamPolicy.type` to provider contract |
| **Cache layer separation** | ✅ Already separated implicitly (sourceId vs _streamCache) | Document explicitly in architecture |

### Required Enhancements Before Multi-Provider Support

#### 1. Add `streamPolicy` to Provider Metadata Contract

Current provider metadata lacks stream lifecycle information. Add:
```json
{
  "id": "yupflix",
  "streamPolicy": {
    "type": "SIGNED_URL",        // STATIC_URL | SIGNED_URL | DYNAMIC
    "ttl": "6h",                 // Typical TTL of signed URLs
    "refreshBefore": "10m"       // Refresh this long before expiry
  }
}
```

**Provider stream policy types:**
| Type | Behavior | TTL | Examples |
|------|----------|:---:|----------|
| **STATIC_URL** | URLs are permanent, no expiry | ∞ | Direct file links, some CDNs |
| **SIGNED_URL** | URLs contain `expires` param | Per-URL | YupFlix CDN |
| **DYNAMIC** | Fresh session required for each request | Minutes | Some DRM-protected streams |

**Why:** Future providers like CastleTV may return STATIC_URL (cache indefinitely) or DYNAMIC (short session TTL). The cache expiry and refresh strategy must be configurable per provider.

#### 2. Add Playback Failure Auto-Retry

When the player receives a 401/403/410 (expired or invalid URL during playback):
1. Automatically **invalidate** the StreamUrlCache entry
2. Request a **fresh stream URL** from the same provider
3. **Retry playback** with the new URL
4. If all retries fail, **fall through** to next provider in chain

**Current behavior:** Player shows `Stream Unavailable` error page. No retry.

#### 3. ProviderMatchCache Reused (No Separate Collection Needed)

`Content.sourceId` already serves as the long-lived provider match cache. Creating a separate collection would duplicate data. The Content document is the single source of truth for the TMDB-ID → provider-ID mapping.

**Design rule:** ProviderManager reads `Content.sourceId` → if present, skips discovery and refreshes URL directly. Only runs full provider chain when `sourceId` is missing.

#### 4. StreamUrlCache Reused (Minor TTL Changes Only)

The `_streamCache` collection with MongoDB TTL index is the right approach. Only change needed: make TTL configurable via `streamPolicy.ttl` instead of hardcoded 24h fallback.

### Play Flow (Updated with Stream Lifecycle)

```
User clicks PLAY
     |
Step 1: Check StreamUrlCache (_streamCache)
     |
     ├── VALID (outside safety buffer): return cached URL immediately
     |
     └── EXPIRED or MISS:
              |
         Step 2: Check ProviderMatchCache (Content.sourceId)
              |
              ├── EXISTS: refresh URL from same provider
              |       └── Save StreamUrlCache with provider-specific TTL → return
              |
              └── MISS (first time):
                       |
                  Step 3: Run full ProviderManager chain (Acquire ProviderResolveLock → try providers)
                       |
                  Save ProviderMatch (Content.sourceId)  ← long-lived
                  Save StreamUrl (with streamPolicy.ttl) ← short-lived
                       |
                  Release lock → return stream
```

### Playback Failure Flow (New — For Future Implementation)

```
Player receives 401 / 403 / 410 during playback
     |
Invalidate StreamUrlCache entry for this content
     |
Request fresh URL from same provider (bypass cache)
     |
     ├── SUCCESS: retry playback with new URL
     |
     └── FAILED: try next provider in chain
              |
              └── ALL providers failed → show "Stream Unavailable" page
```

### Conclusion

The existing system is **well-designed** for single-provider signed-URL streaming. The cache layers (sourceId for discovery, _streamCache for URLs) are already separated. The two gaps — `streamPolicy` metadata and playback failure retry — are small additions needed before adding multi-provider support.

**Recommendation:** Reuse `_streamCache` and `Content.sourceId` as-is. Add `streamPolicy` to provider contract and implement playback failure retry as part of Phase C3 (YupFlix migration) or Phase C4 (CastleTV addition).

---

## Stream Cache Design

```json
{
  "tmdbId": 123,
  "type": "movie",
  "providers": [
    {
      "id": "castle",
      "qualities": ["1080", "720"],
      "url": "https://...",
      "expiresAt": 1728000000,
      "lastChecked": 1727900000
    }
  ]
}
```

**Goal:** First user triggers provider resolve. Future users get database lookup only.

---

## Background Refresh Design

API providers, LIGHT_SCRAPER providers, and BROWSER_SCRAPER providers have different refresh capabilities due to their cost characteristics.

| Provider Type | Refresh Batch Size | Frequency | Notes |
|-------|-------|-------|-------|
| **API** | Large batches (50-100 items) | Every 6 hours (aligned sync window) | Fast, low CPU — can process many items |
| **LIGHT_SCRAPER** | Limited batches (5-10 items) | On-demand or staggered | CPU intensive — avoid large batches |
| **BROWSER_SCRAPER** | Excluded from automated refresh | N/A | Too expensive for background — resolve on PLAY only |

**Design principles:**
- Background refresh uses the same ProviderManager ordering (API first, scraper as fallback)
- Refresh worker prioritizes popular/trending content over all content
- Scraper providers are only triggered if no API provider can resolve the content
- Cache TTL: 6 hours for API-resolved streams, 12 hours for scraper-resolved streams (avoids unnecessary re-scraping)

---

## Provider Resolve Lock — Cache Stampede Protection

**Problem:** Many users can click PLAY on the same uncached content simultaneously. Without protection, 1000 users + cache miss = 1000 provider calls to the same external source.

**Solution:** ProviderManager uses a resolve lock to deduplicate concurrent requests for the same uncached content.

### Flow
```
PLAY
 ↓
Check StreamCache
 ↓
Cache miss
 ↓
Acquire ProviderResolveLock
    - Key: `provider:resolve:{tmdbId}:{type}`
    - Uses MongoDB distributed lock (reuse existing DistributedLock from Phase 9)
    - TTL: 60 seconds (covers provider resolve time)
 ↓
Only one worker resolves provider (others wait)
 ↓
Save StreamCache
 ↓
Release lock
 ↓
Waiting requests serve from cache
```

### Lock Design
| Property | Value |
|----------|-------|
| **Mechanism** | MongoDB `DistributedLock` (reuse `server/src/utils/distributedLock.js`) |
| **Lock Key** | `provider:resolve:{tmdbId}:{contentType}` |
| **TTL** | 60 seconds (plenty for single provider resolve) |
| **Waiting Requests** | `pendingFetches` Map (per-process dedup, already exists in current `ContentSourceService`) |
| **Lock Scope** | Cross-worker (PM2 cluster), cross-request (same worker) |
| **Failure Mode** | Lock acquisition failure → fallback to try next provider without dedup |

### Protection Against Cache Stampede
```
1000 users click PLAY simultaneously
    ↓
Check StreamCache → ALL miss (first time)
    ↓
ProviderResolveLock → only 1 worker acquires
    ↓
999 workers wait (pendingFetches dedup)
    ↓
1 worker resolves provider → saves to StreamCache → releases lock
    ↓
999 waiting workers → check StreamCache → ALL HIT → return cached result
    ↓
Result: 1 provider call instead of 1000
```

**Reuse existing infrastructure:** The `DistributedLock` class from Phase 9 (`server/src/utils/distributedLock.js`) already provides atomic insert + expired takeover + owner-guarded release. No new database tables or packages needed.

---

## Load Protection Design

**Bad design:**
```
10000 users × 20 providers = 200,000 provider requests → NOT ACCEPTABLE
```

**Correct design:**
```
First request: resolve provider once
Next 9999 users: reuse cached result
```

---

## Provider Health System

```json
{
  "providerId": "castletv",
  "online": true,
  "successRate": 0.97,
  "averageResolveTime": 1240,
  "failCount": 3,
  "lastSuccess": "2026-07-06T12:00:00Z",
  "lastFailure": null
}
```

**Provider ordering logic (in order of priority):**
1. Health score (online > degraded > offline)
2. **Provider type priority — API first, then LIGHT_SCRAPER, then BROWSER_SCRAPER**
3. Success rate (higher = better)
4. Configured priority value (lower = tried first)
5. Average resolve speed (lower latency = better)

**Why type priority exists:** Not all providers have equal cost. API providers are fastest and cheapest. LIGHT_SCRAPER providers do HTTP scraping (HTML parsing, cheerio) — medium cost. BROWSER_SCRAPER providers use headless browsers — highest CPU/RAM cost. Prioritizing API providers first reduces CPU usage, improves scalability, and protects server resources.

---

## Provider Execution Strategy

Scraper providers can overload the NovaStream API server when many different uncached movies are requested simultaneously — especially when API providers fail and scraper fallback activates heavily. This section defines how each provider type executes and what protections are in place.

### Execution Modes

| Mode | Description | Used By |
|------|-------------|---------|
| `DIRECT` | Runs inline in ProviderManager. No queueing — immediate execution. | API providers |
| `QUEUE` | Runs through ScraperQueue with limited concurrency. HTTP scraping only. | LIGHT_SCRAPER providers |
| `WORKER` | Runs in an isolated worker process (child_process/fork). Browser automation. | BROWSER_SCRAPER providers |

### Execution Metadata Contract

Every provider now includes an `execution` field in its metadata:
```javascript
static metadata = {
  id: 'bollyflix',
  providerType: 'LIGHT_SCRAPER',
  execution: {
    mode: 'QUEUE',             // 'DIRECT' | 'QUEUE' | 'WORKER'
    maxConcurrent: 3,          // Max concurrent tasks for this provider
    timeout: 15000,            // Per-request timeout in ms
  },
};
```

### Execution Mode Examples

```javascript
// API — direct, no queueing
{ id: 'castletv', providerType: 'API', execution: { mode: 'DIRECT', timeout: 10000 } }

// LIGHT_SCRAPER — queued HTTP scraping, limited concurrency
{ id: 'bollyflix', providerType: 'LIGHT_SCRAPER', execution: { mode: 'QUEUE', maxConcurrent: 3, timeout: 15000 } }

// BROWSER_SCRAPER — isolated worker process
{ id: 'some-browser-provider', providerType: 'BROWSER_SCRAPER', execution: { mode: 'WORKER', maxConcurrent: 1, timeout: 30000 } }
```

### ScraperQueue Design

The ScraperQueue manages all LIGHT_SCRAPER providers under controlled concurrency.

**Properties:**
| Property | Value |
|----------|-------|
| **Global max concurrency** | 5 concurrent scraping tasks across all LIGHT_SCRAPER providers |
| **Per-provider max concurrency** | Configurable via `execution.maxConcurrent` (default 3) |
| **Per-request timeout** | Configurable via `execution.timeout` (default 15000ms) |
| **Queue** | FIFO priority queue for pending scraping requests |
| **Circuit breaker** | Provider auto-disabled after 5 consecutive failures within 5 minutes |
| **Backoff** | Failed providers get 30s/60s/120s exponential backoff before retry |

**How queueing differs from locking:**
| Layer | Scope | Purpose |
|-------|-------|---------|
| ProviderResolveLock (C-008) | Per content item (across all workers) | Prevents cache stampede — 1000 users → 1 resolve |
| ScraperQueue | Per provider (within one worker) | Prevents server overload — limits concurrent HTTP scraping |

The lock ensures only one request resolves a specific piece of content. The queue ensures the server isn't overwhelmed when many different uncached items need scraping simultaneously.

### BROWSER_SCRAPER Worker Process Design

BROWSER_SCRAPER providers require browser automation (headless Chrome, Playwright) which is CPU/RAM intensive. They MUST NOT run in the main Node.js event loop.

```
BROWSER_SCRAPER request
     |
ProviderManager detects execution.mode === 'WORKER'
     |
Submits to ScraperQueue (same queue, higher timeout)
     |
ScraperQueue spawns isolated child process via fork()
     |
Child process:
     ├── Initializes headless browser
     ├── Performs scraping (page load, DOM extraction, screenshot)
     ├── Extracts streaming URLs
     └── Sends result back to parent via IPC
     |
Child process terminates
     |
ProviderManager receives result → saves cache → returns stream
```

**Worker restrictions:**
- Max 1 BROWSER_SCRAPER task globally (configurable)
- 30-second hard timeout per task
- Worker process kills browser if timeout exceeded
- No shared state between workers
- No browser process survives after task completion

### Why NOT Client-Side / Browser Scraping

A common alternative is to run scrapers in the user's browser (client-side JavaScript). This is NOT the primary architecture for these reasons:

| Issue | Impact |
|-------|--------|
| **CORS** | External video hosts often block browser CORS requests |
| **Secrets** | Provider API keys and tokens would be exposed in client-side code |
| **No shared cache** | Each user would scrape the same content independently (no cache benefit) |
| **Harder updates** | Client-side scraping requires frontend deploys or service worker updates |
| **Inconsistent results** | Different browsers, extensions, and network conditions produce different results |

**Future option:** If scraping volume grows significantly, deploy separate scraper worker servers (dedicated machines for browser automation) that the ProviderManager calls via HTTP/RPC. This keeps the NovaStream API server clean and scales scraper capacity independently.

### Protection Summary

| Protection | What It Prevents | Trigger |
|------------|------------------|---------|
| Cache-first | Repeated scraping of same content | StreamCache hit returns immediately |
| ProviderResolveLock | Cache stampede (1000 users → 1 resolve) | Same content, concurrent requests |
| ScraperQueue | Server CPU/RAM overload | Many different uncached items |
| Per-provider concurrency | One scraper monopolizing the queue | Provider-specific limit |
| Timeout | Hanging request blocking the queue | Per-request timeout |
| Circuit breaker | Repeated failures wasting resources | 5 failures in 5 minutes |
| Backoff | Hammering a failing provider | Exponential backoff per provider |
| Worker isolation | Browser crash corrupting API server | BROWSER_SCRAPER in child process |

---

## Provider Registry (Database-Backed)

```json
{
  "id": "castletv",
  "enabled": true,
  "priority": 20,
  "version": "1.0.0",
  "config": {
    "baseUrl": "https://api.hlowb.com",
    "timeout": 10000
  }
}
```

**Purpose:** Future admin panel can enable/disable providers, change priority, update domains — without code changes.

---

## Remote Update Design (Future — Do Not Implement Now)

**provider-registry.json** (remote manifest):
```json
{
  "castle": {
    "version": "1.0.5",
    "updateAvailable": true
  }
}
```

**CLI:** `novactl provider update castle`

**Security:** No automatic unsafe remote execution. Updates are reviewed before deployment.

---

## Security Rules

| Rule | Enforcement |
|------|-------------|
| No `eval()` | Static analysis check |
| No direct remote JS execution | All providers are local files |
| Provider secrets separated from provider files | Each provider reads its own env vars |
| Provider config stored separately | Database-backed `ProviderRegistry` collection |
| Provider failures isolated | Try/catch per provider — one failure never crashes the system |
| Core streaming system protected | `ProviderManager` wraps all provider calls in error boundaries |

---

## Findings

### C-013 — Content Registry & Stable URL Architecture

**Status:** OPEN — Track C2 requirement

**Problem:** Current URL strategy mixes content identity with provider data.

```
Current URLs:
  DB content:    /watch/movie/supergirl-h2vm          ← uses slug (Nova-owned, stable)
  TMDB bridge:   /watch/movie/tmdb-1315772             ← depends on TMDB ID (external)
  External:      /watch/series/from-vz6s                ← uses slug
  TMDB trending: /watch/series/tmdb-125988              ← depends on TMDB ID
```

The `tmdb-` prefix was introduced as a temporary bridge (Pre-C2 Metadata Navigation Bridge fix) to allow TMDB-sourced trending items to open detail pages without a DB record. This works for browsing but is architecturally incorrect for Track C.

### Current Temporary State (Pre-C2, verified in testing)

| URL Pattern | Example | Source | Has DB record? | Notes |
|---|---|---|---|---|
| Nova slug | `/watch/movie/colony-ktgb` | MongoDB Content | ✅ Yes | Content was seeded or synced into MongoDB with a permanent slug |
| TMDB bridge | `/watch/series/tmdb-125988` | TMDB API live | ❌ No | Temporary bridge — TMDB trending item, not yet registered in MongoDB |

**Confirmed behavior:**
- MongoDB content always uses Nova-owned slug (e.g., `from-vz6s`, `colony-ktgb`)
- TMDB-only content (trending items not yet seeded) uses `tmdb-{id}` as a temporary navigation bridge
- The `tmdb-` prefix is a Pre-C2 construct — it works for browsing but must be eliminated in C2
- No provider IDs appear in URLs — that's correct for the current architecture

### C2 Target State — Content Registry

Every metadata item gets a permanent Nova-owned slug at creation time. The slug is the canonical URL identifier and is owned by NovaStream, not any external provider.

```
Content Registry document (future):
{
  slug: "from-epix-s8k2",              // Permanent Nova-owned URL slug
  title: "FROM",
  identities: {                         // External identity links
    tmdbId: 124364,
    imdbId: "tt3232312",
  },
  providers: [                          // Multiple stream providers (C2 requirement)
    { providerId: "primary", externalContentId: "abc123", confidence: 0.95 },
  ],
  metadata: {
    posterPath: "/abc123.jpg",          // From TMDB (authoritative)
    backdropPath: "/def456.jpg",        // From TMDB
    seasons: [...],                      // From TMDB
  },
}

// REMOVED in C2:
//   slug: "tmdb-125988"               ← Never — TMDB IDs are not URL identifiers
//   sourceId: "abc123"                 ← Replaced by providers[] array
//   sourceSite: "primary"              ← Replaced by providers[].providerName
```

**What changes in C2:**
| Aspect | Current (Pre-C2) | C2 Target |
|---|---|---|
| TMDB trending items | `tmdb-{id}` URL, no DB record | Created in ContentRegistry with permanent Nova slug on first appearance |
| URL dependency | Mix of Nova slug + TMDB ID | Nova-owned slug ONLY |
| Provider mapping | Single `sourceId`/`sourceSite` on Content | `providers[]` array with confidence scoring |
| Content creation | Sync script or manual seed | ContentRegistry — first appearance from any source |
| Navigation | `tmdb-` prefix required for non-seeded items | All items have a DB record; `tmdb-` routes become redirects |

**Content flow for provider-only titles (e.g., "Notes from the Last Row" discovered during provider sync):**
```
Provider sync discovers: "Notes from the Last Row" (external ID: abc123)
    │
    1. ContentRegistry.lookup() 
    │    ├─ Match by tmdbId (if provider provides it) → confidence 1.0
    │    ├─ Match by title + year + type → confidence 0.8+
    │    └─ No match → confidence < threshold, log for review
    │
    2. If high-confidence match found:
    │    ├─ Attach provider mapping to existing Content document
    │    └─ Never overwrite title/overview/poster/backdrop
    │
    3. If no match and confidence passes threshold:
    │    ├─ Fetch metadata from TMDB (authoritative identity)
    │    ├─ Create ContentRegistry entry with Nova-owned slug
    │    └─ Attach provider mapping
    │
    4. If confidence below threshold:
         └─ Log warning, manual review required
```

**Design rules:**
1. **Metadata providers** (TMDB) create content identity — title, poster, backdrop, cast
2. **Streaming providers** only attach availability — sourceId maps to provider content
3. **Multiple homepage providers** merge into one catalog — deduplicated by tmdbId
4. **URL slug is Nova owned** — never depends on provider IDs, never changes
5. **Provider failure never changes content identity** — if a provider goes down, the content page still works (metadata remains), only "Play" shows unavailable
6. **Provider-only titles go through ContentRegistry** — they are matched against TMDB/external metadata before a Content entry is created or updated

**Migration path:**
- C2: Create ContentRegistry service that manages slug lifecycle
- C2: When content is first seen (from any source — TMDB trending, provider sync, search), generate and persist a Nova slug
- C2: TMDB bridge routes (`/movies/tmdb/:id`) redirect to the canonical slug if the content is registered
- C2: Provider-only titles discovered during sync follow the confidence-based flow above
- C3: Remove `tmdb-` prefix URLs entirely
- C5: Add metadataSources identity model for multi-provider metadata support

**Impact on providers:**
- Provider plugins do NOT create movies/shows
- Provider plugins only resolve streams for existing content identity
- A provider's `search()` is used to MATCH existing content (find the Nova slug), not to create new entries
- Only ContentRegistry creates new content with a Nova-owned slug

---

## C-012 — Legacy Identity Contamination

**Status:** FOUND IN PRODUCTION TEST — RESOLVED

**Root cause confirmed:** The legacy single-field `sourceId`/`sourceSite` model on Content documents allowed sync-external-content.js to mutate an existing document's provider mapping without strong identity verification. The title matching algorithm could match a provider item to the wrong Content document when titles were dissimilar (e.g., multiple-word provider title matched to a Content document whose slug was generated from a different, short title). Once matched, the `$set` operation persisted the incorrect `sourceId` to the document, contaminating the identity.

**Real-world case:** Content doc with `tmdbId: 124364` (TMDB's "FROM") had its `title` overwritten to "Notes from the Last Row" (a different show on the provider) and its `sourceId` set to the Notes from the Last Row's provider ID. The slug `from-vz6s` was generated from the original title "FROM". When browsing, users saw "Notes from the Last Row" title with FROM's TMDB metadata (posters, ratings). Clicking the item showed FROM's TMDB detail pages. The stream played Notes from the Last Row via the incorrect `sourceId`.

**Fix applied:**
1. `title` restored to "FROM" (from `originalTitle`)
2. `sourceId` and `sourceSite` removed (incorrect provider mapping)
3. Document now has clean TMDB identity with no provider association

**Preventive measures (deployed with this fix):**
- **sync-external-content.js** now checks `tmdbId` first (if external API provides it) before falling back to title matching
- Title-only matches now require year coincidence for non-exact matches
- `$set` operations never mutate `title`, `originalTitle`, `posterPath`, `backdropPath`, or `overview`
- New `audit-content-identity.js` script detects duplicate slugs, tmdbIds, and identity contamination
- New `repair-content-identity.js` script (dry-run default) fixes title-conflict records
- `getSeriesBySlug` reverted to prefer DB seasons (TMDB-authoritative) over external source

**Remaining orphaned-source records:** 596 records have `sourceId` but no `tmdbId`. These were created by the sync script with provider-only data and have no TMDB anchor. They continue to work for streaming but should be TMDB-seeded in Track C2 to establish proper identity.: Single sourceId/sourceSite on Content Model

| Field | Value |
|-------|-------|
| **Finding ID** | C-012 |
| **Phase** | C — Dynamic Provider Plugin System |
| **Category** | Architecture — Data Model |
| **Severity** | High |
| **Risk** | High |
| **Status** | OPEN — Covered by C2 provider mapping design |
| **Affected Files** | `server/src/models/Content.model.js`, `server/scripts/sync-external-content.js`, `server/src/services/sync-scheduler.service.js` |

**Description:**
The legacy Content model stores a single `sourceId`/`sourceSite` pair directly on the document. This creates a tight coupling between content identity (TMDB-based metadata) and provider identity (external streaming source). A bad sync match can overwrite `sourceId` without updating metadata, causing the document to represent one show's metadata with another show's stream mapping.

**Real-world example discovered during Pre-C2 smoke testing:**
- A MongoDB Content document (slug: `from-vz6s`) was originally seeded for the show "FROM" with cached seasons/episodes in the DB
- The sync process(`sync-external-content.js`) matched "Notes from the Last Row" to this existing document and updated its `sourceId`
- Result: DetailPage/WatchPage showed "FROM" metadata(title, cached DB seasons) but the stream resolver used the new `sourceId` pointing to "Notes from the Last Row"
- The stream correctly played "Notes from the Last Row", but the episode list and metadata were wrong

**Mitigation applied:** `getSeriesBySlug` now prioritizes the external source(identified by `sourceId`) over cached DB seasons for episode metadata — see commit `dccde95`. This ensures metadata and stream come from the same provider at runtime.

**Root Cause — Legacy Data Model:**
```javascript
// Content.model.js — Current (problematic)
{
  tmdbId: Number,       // TMDB identity (primary)
  title: String,        // Metadata
  slug: String,         // URL identity
  sourceId: String,     // ← Single provider mapping (overwritable by sync)
  sourceSite: String,   // ← Single provider mapping
}
```

The single `sourceId`/`sourceSite` pattern allows a sync process to atomically overwrite the provider mapping without any identity verification — there is only one slot to fill, no concept of multiple providers, no confidence scoring, and no version tracking.

**Required for Track C2 — Provider mapping replacement:**

The legacy single `sourceId`/`sourceSite` must be replaced with a structured provider mappings array:

```javascript
// Content.model.js — Future (Track C2)
{
  tmdbId: Number,              // TMDB identity remains PRIMARY
  title: String,               // Metadata (never overwritten by provider sync)
  slug: String,                // URL identity (never overwritten by provider sync)

  // Provider mappings — only for stream resolution
  providers: [{
    providerName: String,      // 'yupflix' | 'castletv' | 'bollyflix'
    providerContentId: String, // The provider's internal ID for this content
    confidenceScore: Number,   // 0.0 - 1.0 — how confident the match is
    lastVerified: Date,        // When this mapping was last confirmed
    status: String,            // 'active' | 'stale' | 'failed'
  }],
}

// REMOVED:
// sourceId: String,
// sourceSite: String,
```

**Design rules for Track C2:**
1. **TMDB identity is primary** — `tmdbId`, `title`, `slug` are metadata-only and NEVER overwritten by provider sync
2. **Provider IDs are only stream resolution mappings** — `providers[]` tells ProviderManager which external content IDs to query for streams, nothing more
3. **Provider matching requires confidence validation** — a match below a threshold(e.g. 0.7) must be reviewed rather than automatically applied
4. **Sync process must not mutate metadata** — the sync should only add/update entries in `providers[]`, never touch `title`, `slug`, `posterPath`, etc.

**Backward compatibility:** The `getSeriesBySlug` identity fix(commit `dccde95`) serves as a bridge until C2 migration. When C2 introduces the `providers[]` array, the old `sourceId`/`sourceSite` fields can be deprecated and removed after a data migration phase.

| User Approval | Implementation Date | Build Status | Browser Test Status | Regression Status |
|:---:|:---:|:---:|:---:|:---:|
| Pending | C2 | — | — | — |

**Certification Status:** PENDING

---

## Migration Plan — Implementation Phases

### Phase C1 — Documentation Freeze
- [x] **Status:** ✅ COMPLETE

### Phase C2 — Provider Framework
- [x] **Status:** ✅ COMPLETE

### Phase C3 — YupFlix Migration
- [x] **Status:** ✅ COMPLETE

### Phase C4 — CastleTV + Multi-Provider Fallback
- [x] **Status:** ✅ COMPLETE

### Phase C5 — Metadata Provider System
- [x] **C5a Status:** ✅ COMPLETE — Metadata Provider Framework
- BaseMetadataProvider, MetadataManager, tmdb.metadata adapter
- metadataSources identity model (Map-based, extensible)
- ContentService delegates to MetadataManager for trending/search/details
- Metadata providers live in `server/src/metadata/sources/` (separate from stream providers)
- OTT-style lifecycle: no auto-register on browse, only on detail/playback
- **C5b (pending):** Auto-register on discovery, `registerOrUpdate()`
- **C5c (pending):** Remove tmdb-* navigation bridge
- **C5d (pending):** UI Source Selector
- **C5e (pending):** Homepage Provider Merge

**Files created:**
- `server/src/metadata/BaseMetadataProvider.js`
- `server/src/metadata/MetadataManager.js`
- `server/src/metadata/sources/tmdb.metadata.js`

**Files modified:**
- `server/src/models/Content.model.js` — added `metadataSources` Map
- `server/src/providers/ContentRegistry.js` — added `registerOrUpdate()`, metadataSources lookup
- `server/src/services/content.service.js` — replaced TMDbService with MetadataManager
- `server/src/app.js` — MetadataManager initialization at startup

### Phase C6 — UI Source Selector (Future)
- [ ] **Status:** ❌ NOT STARTED
- Frontend component for provider selection
- Auto mode default, manual override optional

### Phase C7 — Extractor System (Future)
- [ ] **Status:** ❌ NOT STARTED
- ExtractorManager for shared video host resolvers
- streamwish, filemoon extractors

### Phase C8 — Provider Admin Management (Future)
- [ ] **Status:** ❌ NOT STARTED
- Admin API endpoints: list, enable, disable, update priority
- CLI commands

### Phase C9 — Remote Update Support (Future)
- [ ] **Status:** ❌ NOT STARTED
- Remote provider registry manifest

---

## Decision Log

| ID | Decision | Date |
|----|----------|------|
| C-001 | Track C audit framework created | 2026-07-06 |
| C-002 | Architecture proposal: Hybrid approach (local folder + optional remote index) | 2026-07-06 |
| C-003 | Provider interface uses content-type independent methods: search(), getDetails(), getEpisodes(), getStreams() | 2026-07-06 |
| C-004 | NO provider queries on detail page — resolve only on PLAY | 2026-07-06 |
| C-005 | Auto mode is default; manual source selection is optional | 2026-07-06 |
| C-006 | Extractors separated from providers — ExtractorManager resolves video hosts | 2026-07-06 |
| C-007 | No remote code execution — all providers are local, reviewed, and committed | 2026-07-06 |
| C-008 | Provider resolution must use request deduplication locking | 2026-07-06 |
| C-009 | ProviderManager prioritizes API providers before scraper providers | 2026-07-06 |
| C-010 | Provider stream lifecycle management — reuse existing caches, add streamPolicy | 2026-07-06 |
| C-011 | Scraper providers execute through controlled ScraperQueue instead of direct execution | 2026-07-06 |
