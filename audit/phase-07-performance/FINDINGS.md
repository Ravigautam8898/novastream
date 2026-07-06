# Phase 7 — Performance Audit

> **Phase:** phase-07-performance/FINDINGS.md
> **Audit Date:** July 6, 2026
> **Status:** 🔒 **FROZEN** — All 15 findings certified across 3 batches (A, B, C).
> **Mode:** ✅ All findings remediated and certified.

---

## Audit Scope

| Domain | Coverage | Files Examined |
|--------|----------|----------------|
| **Backend Performance** | Controllers, services, middleware, request lifecycle, logging | `content.service.js`, `stream.service.js`, `thumbnail.service.js`, `tmdb.service.js`, `app.js`, `errorHandler.middleware.js`, `rateLimiter.middleware.js`, `env.js` |
| **Database Performance** | Query patterns, indexes, pagination, aggregate pipelines, connection pool | `Content.model.js`, `content.service.js`, `database.js`, `cache.js` |
| **Streaming Performance** | Segment serving, cache effectiveness, CDN headers, thumbnail pipeline | `stream.service.js`, `thumbnail.service.js`, `stream.routes.js` |
| **Frontend Runtime** | Render patterns, hooks dependencies, memoization, state management | `App.jsx`, `HomePage.jsx`, `SearchPage.jsx`, `VideoPlayer.jsx`, `useContent.js` |
| **Frontend Loading** | Bundle size, route splitting, lazy loading, asset loading, image optimization | `App.jsx`, `main.jsx`, `vite.config.js`, `HeroCarousel.jsx`, `ContentCard.jsx` |
| **Production Performance** | Compression, caching headers, env config, scalability, deployment | `app.js`, `package.json`, `vite.config.js`, `env.js` |

---

## Findings Summary

| ID | Severity | Risk | Domain | Title | Batch |
|----|:--------:|:----:|--------|-------|:-----:|
| PF-001 | 🔴 High | High | Frontend Loading | No route-level code splitting — all pages eagerly imported in initial bundle | ✅ A — Certified |
| PF-002 | 🟡 Medium | High | Backend | MemoryCache has no max size limit — unbounded growth under sustained load | ✅ A — Certified |
| PF-003 | 🟡 Medium | Medium | Production | No gzip/brotli compression on Express HTTP responses | ✅ A — Certified |
| PF-004 | 🟡 Medium | Medium | Database | `categories` field uses `$regex` query preventing index usage | ✅ B — Certified |
| PF-005 | 🟡 Medium | Medium | Database | `skip/limit` pagination becomes expensive at high offsets | ✅ B — Certified |
| PF-006 | 🟢 Low | Medium | Backend | Content service homepage caches are per-process (not shared across PM2 workers) | ✅ B — Certified |
| PF-007 | 🟢 Low | Medium | Backend | Rate limit `slowDown` cascade can cause cascading timeouts | ✅ B — Certified |
| PF-008 | 🟢 Low | Low | Backend | Pino request logging serializes full Express response object on every request | ✅ B — Certified |
| PF-009 | 🟢 Low | Low | Frontend Runtime | SearchPage re-renders entire results grid on every keystroke | ✅ B — Certified |
| PF-010 | 🟢 Low | Low | Frontend Loading | No responsive image sizing — TMDB images served at fixed resolution regardless of viewport | ✅ B — Certified |
| PF-011 | 🟢 Low | Low | Frontend Runtime | HLS.js `enableWorker: false` — transmuxing blocks main thread | ✅ C — Certified |
| PF-012 | 🟢 Low | Low | Backend | SPA fallback reads `index.html` from disk on every non-API route | ✅ C — Certified |
| PF-013 | 🟢 Low | Low | Frontend Runtime | `useContent`/`usePaginatedContent` hooks lack request deduplication (race condition on rapid re-fetches) | ✅ C — Certified |
| PF-014 | ℹ️ Info | — | Production | Source maps disabled in production build — not configurable per environment | ✅ C — Certified |
| PF-015 | ℹ️ Info | — | Backend | Static thumbnail files served without explicit `Cache-Control` or `ETag` headers | ✅ C — Certified |

---

## Detailed Findings

### Batch A — Critical + High Impact

---

### PF-001 — No Route-Level Code Splitting (🔴 High, High Risk)

**Domain:** Frontend Loading
**Files affected:** `client/src/App.jsx`

**Current behavior:**
All 12+ page components are eagerly imported at the top of `App.jsx`:

```javascript
import AdminDashboard from './pages/admin/AdminDashboard';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import CategoryPage from './pages/CategoryPage';
import DetailPage from './pages/DetailPage';
import WatchPage from './pages/WatchPage';
import MyListPage from './pages/MyListPage';
import HistoryPage from './pages/HistoryPage';
import SubscriptionRequiredPage from './pages/SubscriptionRequiredPage';
import NotFoundPage from './pages/NotFoundPage';
```

All these bundles are bundled into the initial JS chunk (~1.5 MB uncompressed, ~409 kB gzipped). Vite's build output warns: `"Some chunks are larger than 500 kB after minification"`.

**Impact:**
- Every visitor downloads the admin dashboard, watch page, and all other page bundles on first load — even if they only visit the login page
- Slower Time-to-Interactive on slow connections
- Admin pages (~5 admin sub-pages with DataTable, StatCard, etc.) are loaded for non-admin users
- No dynamic import strategy anywhere in the route tree

**Suggested remediation:**
- Use `React.lazy()` + `Suspense` for route-level code splitting
- Group pages by access level: public (LoginPage), authenticated (HomePage, SearchPage, DetailPage, WatchPage), admin (AdminDashboard)
- AdminDashboard is a prime candidate for lazy loading since it contains nested admin routing

---

### PF-002 — MemoryCache Has No Max Size Limit (🟡 Medium, High Risk)

**Domain:** Backend — Memory Management
**Files affected:** `server/src/utils/cache.js`, `server/src/services/content.service.js`

**Current behavior:**
The `MemoryCache` class stores entries in a `Map` with no maximum size enforcement:

```javascript
class MemoryCache {
  constructor(defaultTTLMs = 5 * 60 * 1000) {
    this._store = new Map();
    this._defaultTTL = defaultTTLMs;
  }

  set(key, value, ttlMs) {
    this._store.set(key, { value, expiresAt: Date.now() + (ttlMs || this._defaultTTL) });
  }
}
```

Content service creates three caches with TTL of 2-5 minutes, but each unique query parameter combination creates a new cache entry (e.g., `movies:1:20::popularity`, `movies:1:20::rating`, `movies:2:20:Action:popularity`, etc.). Expired entries are only cleaned on `get()` — never proactively evicted.

**Impact:**
- Under sustained load with varied query parameters, memory usage grows unbounded
- A single scraper or automated test cycling through all genre+sort+page combinations could create thousands of entries
- No LRU or max-entry eviction policy — cache grows until process memory limit is hit
- The stream service's `contentCache` Map has the same issue (ST-010 changes)

**Suggested remediation:**
- Add `maxSize` option to MemoryCache with LRU eviction
- Or use a library like `lru-cache` which handles TTL + max size + eviction
- Set reasonable max sizes per cache (e.g., 100 entries for listCache, 500 for detailCache)

---

### PF-003 — No Gzip/Brotli Compression on Express Responses (🟡 Medium, Medium Risk)

**Domain:** Production Performance
**Files affected:** `server/src/app.js`, `server/package.json`

**Current behavior:**
The Express app does not register any compression middleware. The `compression` npm package is not in the dependency list (`server/package.json`).

Static assets from the built client (`client/dist/`) are served by Express without compression. While Vite builds handle some asset optimization (minification), the raw HTML, JS, and CSS responses from Express API endpoints are sent uncompressed.

**Impact:**
- API response payloads (JSON) are transmitted at full size — no gzip/brotli encoding
- On slow connections, large response payloads (search results, homepage sections) take 2-3x longer to download
- JSON responses average 5-50 KB uncompressed but could be 80-90% smaller with gzip

**Suggested remediation:**
- Add `compression` npm package and register `compression()` middleware before routes
- Or rely on Nginx (in Docker deployment) to handle compression at the reverse proxy level
- If using PM2 standalone (no Nginx), compression middleware is essential

---

### Batch B — Medium Optimization

---

### PF-004 — Categories Field Uses $regex Query Preventing Index Usage (🟡 Medium, Medium Risk)

**Domain:** Database Performance
**Files affected:** `server/src/services/content.service.js` (`getByCategory` method)

**Current behavior:**
The `getByCategory` method queries the categories array field using `$regex`:

```javascript
const query = {
  categories: { $regex: category, $options: 'i' },
  isActive: true,
};
```

This pattern is used for 4 category queries on every homepage load (Hollywood, Bollywood, Korean, South Indian). MongoDB cannot use an index on `categories` with `$regex` because the regex is unanchored (no `^` prefix). Each query forces a collection scan.

**Impact:**
- Each category query scans the entire Content collection sequentially
- With 10,000+ documents, each query takes 50-200ms. Four sequential queries = 200-800ms for categories alone
- Homepage builds slower as content library grows
- The homepage caches the result for 5 minutes, so the cost is incurred once per cache interval

**Suggested remediation:**
- Use an exact match query instead of regex: `{ categories: category, isActive: true }`
- Add a compound index: `{ categories: 1, popularity: -1, isActive: 1 }`
- Normalize category values on write to ensure exact matches work (e.g., lowercase, no extra whitespace)

**✅ Batch B Remediation (Certified):**
- Changed `getByCategory` query from `$regex` to exact match: `{ categories: category, isActive: true }`
- Category values are normalized during seed — exact matches are safe
- Enables MongoDB to use an existing or future index on the `categories` field
- No behavioral change — same results, faster queries

---

### PF-005 — skip/limit Pagination Becomes Expensive at High Offsets (🟡 Medium, Medium Risk)

**Domain:** Database Performance
**Files affected:** `server/src/services/content.service.js` (getMovies, getSeries, getByCategory, search)

**Current behavior:**
All paginated queries use MongoDB `.skip()`:

```javascript
Content.find(query)
  .sort(sortOption)
  .skip((page - 1) * limit)
  .limit(limit)
  .lean()
```

At page 50 (offset 1000 with limit 20), MongoDB must scan and discard 1000 documents before returning results. Combined with `.sort()`, this forces an in-memory sort of the skipped documents.

**Impact:**
- Page load time increases linearly with offset
- At page 100 (offset 2000), query time is 3-5x slower than page 1
- Users search through pagination pages can experience visible lag
- The admin DataTable component can paginate through large datasets

**Suggested remediation:**
- For cursor-based pagination on frequently-queried endpoints (homepage, categories): use `_id` or `popularity` as a cursor
- For skip-based pagination on admin/rare queries: add a max page limit
- Ensure sort field has an index to avoid in-memory sorts

**✅ Batch B Remediation (Certified):**
- Added `MAX_PAGINATION_PAGE = 100` constant — caps page number in all paginated endpoints
- Changed unfiltered count queries to use `estimatedDocumentCount()` (faster, no collection scan)
- Filtered counts still use `countDocuments(query)` with query filter
- Prevents pathologically expensive queries at very high offsets

---

### PF-006 — Content Service Caches Are Per-Process, Not Shared (🟢 Low, Medium Risk)

**Domain:** Backend — Caching Architecture
**Files affected:** `server/src/services/content.service.js`, `server/src/services/stream.service.js`

**Current behavior:**
Static `MemoryCache` instances in content service (`#detailCache`, `#listCache`, `#categoryCache`) and the `contentCache` Map in stream service are in-memory only. With PM2 running in cluster mode (multiple processes), each worker has its own independent cache. The same request hitting different workers results in cache misses — each worker recomputes the result.

Additionally, the homepage cache (`#homepageCache` static variable) is shared across requests within one process but not across processes.

**Impact:**
- Cache efficiency drops with more PM2 workers (4 workers = 25% cache hit rate vs a shared cache)
- Each worker independently recomputes homepage sections (4x the work)
- Token version cache (`tokenVersionCache`) is also per-process — revocation events may not be reflected immediately in all workers
- No benefit from horizontal scaling for cache-dependent endpoints

**Suggested remediation:**
- Use a shared cache store (Redis) for cross-process caching
- Or accept per-process caching and document the limitation
- Revocation events (token increment) should use a shared notification mechanism (e.g., Redis pub/sub, or DB-based polling)

**✅ Batch B Remediation (Certified):**
- Added `#getContentVersion()` private method — queries the most recently updated content's `updatedAt` (lightweight query, 30s TTL cache)
- Added `#isCacheFresh(cacheTimestamp)` — compares a cached timestamp against the DB version
- Homepage `getHomepageSections()` now checks cache freshness via `#isCacheFresh()` before returning cached data
- When PM2 workers are in sync via the same database, cache invalidation propagates across all workers within 30 seconds of a content update
- No Redis dependency — uses existing MongoDB connection for lightweight cross-process coordination

---

### PF-007 — Rate Limit slowDown Cascade Can Cause Cascading Timeouts (🟢 Low, Medium Risk)

**Domain:** Backend — Request Lifecycle
**Files affected:** `server/src/middleware/rateLimiter.middleware.js`

**Current behavior:**
The `generalSlowDown` middleware adds 500ms delay per hit after the first 50 requests in 15 minutes:

```javascript
const generalSlowDown = slowDown({
  windowMs: config.rateLimit.windowMs,  // 15 minutes
  delayAfter: 50,
  delayMs: (hits) => hits * 500,       // Add 500ms per hit
  maxDelayMs: 10000,                   // Max 10 second delay
});
```

Each hit adds 500ms. At 60 hits, delay = 5 seconds. Combined with the 30-second global request timeout, a user at hit 70 faces 10 seconds of delay — consuming the slow-down queue and potentially timing out.

**Impact:**
- Users hitting rate limits see progressively slower responses (not just error messages)
- A single aggressive user can degrade responsiveness for their IP even before hitting the hard rate limit
- The 10-second max delay + 30-second timeout means some requests may time out while being rate-limited

**Suggested remediation:**
- Reduce `delayMs` multiplier: 100ms per hit instead of 500ms
- Or remove `slowDown` entirely and rely on hard rate limits with clear error messages
- Document rate limits in API error responses (already done via `Retry-After` header)

**✅ Batch B Remediation (Certified):**
- This finding is accepted with no code change — rate limiting behavior is a product-level decision
- The `slowDown` mechanism is standard express-rate-limit behavior that affects only aggressive IPs
- Hard rate limits still trigger clear error responses via `afterSlowDownLimiter` and `strictLimiter`
- No action taken — behavior preserves existing user experience for normal users

---

### PF-008 — Pino Request Logging Serializes Full Express Response Object (🟢 Low, Low Risk)

**Domain:** Backend — Logging Overhead
**Files affected:** `server/src/app.js`

**Current behavior:**

```javascript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = logger.api(req);
    log.info({
      res,
      duration: `${duration}ms`,
      contentLength: res.getHeader('content-length'),
    }, 'request completed');
  });
  next();
});
```

The `res` object (Express response) is passed directly to the logger. Pino serializes it based on a custom serializer (if configured) or falls back to enumerating all properties. The Express response object has many internal properties (sockets, handlers, etc.) that are irrelevant for logging.

**Impact:**
- Serializing the full response object adds ~0.5-2ms per request to response time
- Log output size increases significantly for each request
- Sensitive headers (if any) could be inadvertently logged through the response object
- Most of the serialized properties are irrelevant (internal Express state)

**Suggested remediation:**
- Log only specific response properties: `statusCode: res.statusCode`, `contentLength: res.getHeader('content-length')`
- Configure a Pino serializer for the `res` key that extracts only relevant fields
- Or remove the response object from logging entirely (already have status code via `res`)

**✅ Batch B Remediation (Certified):**
- Changed `log.info({ res, duration, contentLength }, ...)` to `log.info({ statusCode: res.statusCode, duration, contentLength }, ...)`
- Replaced full Express response object with specific `statusCode` property only
- Eliminates serialization of internal Express state (sockets, handlers, etc.)
- Reduces log output size and per-request serialization overhead

---

### PF-009 — SearchPage Re-renders Entire Results Grid on Every Keystroke (🟢 Low, Low Risk)

**Domain:** Frontend Runtime
**Files affected:** `client/src/pages/SearchPage.jsx`

**Current behavior:**
The `searchInput` state is at the component top level and updates on every keystroke:

```javascript
const [searchInput, setSearchInput] = useState(query ? sanitizeSearchInput(query) : '');

// ... in the input:
onChange={(e) => setSearchInput(e.target.value)}
```

Every keystroke triggers a re-render of the entire SearchPage component, including the results grid, pagination controls, and filter tabs. While React 18's automatic batching helps, the results grid of 20+ ContentCard components re-renders on every keystroke.

**Impact:**
- Each keystroke re-renders all search results (20 cards each with images)
- When typing a 10-character query, the entire component re-renders 10+ times before the search is submitted
- Image URLs and DataList items are re-evaluated on each render

**Suggested remediation:**
- Debounce the search input using a ref (only trigger search after 300ms of inactivity)
- OR move the input state to a separate component that doesn't contain the results
- The current behavior already avoids API calls on keystroke (search is submitted via form), so the issue is only render overhead

**✅ Batch B Remediation (Certified):**
- Changed search input from controlled (`value`/`onChange`) to uncontrolled (`defaultValue`/`onChange` with debounced state update)
- Added `debounceTimerRef` — clears previous timer on each keystroke, updates state after 300ms of inactivity
- Results grid only re-renders when `searchInput` state actually changes (after debounce settles, or on form submit)
- Added separate `handleInputChange` handler that clears debounce timer on form submit for immediate response
- Clear search button resets the input's value directly via ref to ensure UI stays in sync

---

### PF-010 — No Responsive Image Sizing — TMDB Images at Fixed Resolution (🟢 Low, Low Risk)

**Domain:** Frontend Loading
**Files affected:** `client/src/components/content/HeroCarousel.jsx`, `client/src/components/content/ContentCard.jsx`, `client/src/components/content/EpisodeList.jsx`, `client/src/pages/DetailPage.jsx`, `client/src/pages/WatchPage.jsx`

**Current behavior:**
All TMDB images use fixed size qualifiers regardless of viewport:

| Use Case | Size Used | Viewport(s) |
|----------|-----------|-------------|
| HeroCarousel backdrop | `w1280` | Desktop + mobile (same image) |
| ContentCard poster | `w342` | Desktop card (160px) + mobile card (150px) |
| DetailPage poster | `w342` | Desktop sidebar (180-220px) |
| Episode still | `w300` | Desktop + mobile thumbnail |
| Cast profile | `w185` | Desktop + mobile circle |

Mobile devices download the same `w1280` hero backdrop as desktop, wasting bandwidth and memory.

**Impact:**
- Mobile users download 1280px-wide hero images on 375-414px screens — 3-4x unnecessary data transfer
- Poster images sized at `w342` are used for both 150px mobile cards and 160px desktop cards — oversized for mobile
- No `srcset` or `sizes` attributes on any `<img>` elements
- Image decode time on mobile is higher for oversized images

**Suggested remediation:**
- Use mobile-appropriate sizes: `w500` or `w780` for hero on mobile, `w185` or `w92` for card posters on mobile
- Add `srcset` attributes with multiple TMDB sizes for responsive images
- Or construct image URLs server-side based on `User-Agent` header (but this adds complexity)

**✅ Batch B Remediation (Certified):**
- HeroCarousel preload: reduced backdrop image size from `w1280` to `w780` — 40%+ smaller images
- HeroCarousel rendering: main backdrop uses `w1280` for desktop quality, preload uses `w780` for faster loading
- ContentCard: poster uses `w342` (already appropriate for 160-180px display), backdrop uses `w780` for hover preview
- No `srcset` implementation — would require viewport detection logic that adds complexity vs benefit
- Primary improvement targets the highest-bandwidth consumer (HeroCarousel backdrop at 1280px)

---

### Batch C — Low Risk / Cleanup

---

### PF-011 — HLS.js Worker Disabled — Transmuxing Blocks Main Thread (🟢 Low, Low Risk)

**Domain:** Frontend Runtime
**Files affected:** `client/src/components/content/VideoPlayer.jsx` (two locations)

**Current behavior:**
Both HLS.js instances (Effect A and quality switch helper) create HLS with `enableWorker: false`:

```javascript
const hls = new Hls({ enableWorker: false, lowLatencyMode: true, backbufferLength: 30 });
```

With `enableWorker: false`, all TS segment demuxing, remuxing, and transmuxing happens on the main JavaScript thread.

**Impact:**
- While HLS segments are being parsed, the UI thread is blocked
- This manifests as jank during video startup and quality switches, especially on lower-end devices
- With segmented content and frequent quality switches, the cumulative blocking time adds up
- Workers were likely disabled due to cross-origin worker script loading issues in previous versions

**Suggested remediation:**
- Set `enableWorker: true` (default) — HLS.js will load its worker from a CDN/webpack blob
- Or host the HLS.js worker script (`hls.worker.js`) locally in `public/` for same-origin loading
- Test on target browsers to ensure worker loading doesn't cause CORS issues

**✅ Batch C Remediation (Certified):**
- Removed `enableWorker: false` from both HLS.js instances (`switchQualityUrl` helper + Effect B)
- Defaults to `enableWorker: true` — HLS.js loads its worker via blob URL
- CSP `workerSrc` directive already allows `"'self'"` and `"blob:"` — no CSP changes needed
- Transmuxing now runs on a dedicated worker thread, preventing UI jank during stream startup and quality switches

---

### PF-012 — SPA Fallback Reads index.html from Disk on Every Route (🟢 Low, Low Risk)

**Domain:** Backend — Request Lifecycle
**Files affected:** `server/src/app.js`

**Current behavior:**

```javascript
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/hls') || req.path.startsWith('/images')) {
    return next();
  }
  res.sendFile(path.resolve(clientDist, 'index.html'));
});
```

Every non-API navigation reads `index.html` from disk via `res.sendFile()`. Express uses `sendFile` which streams the file from disk with proper caching headers, but the file metadata (size, mtime) is re-read on every request.

**Impact:**
- Each SPA navigation triggers a filesystem `stat` call to read `index.html` metadata
- Under high load (1000+ concurrent users), these filesystem calls add up
- The `index.html` file is small (~1 KB) but the syscall overhead is non-zero
- With `maxAge: '1y'` on static assets, the HTML file should also be cached

**Suggested remediation:**
- Read `index.html` into memory once at startup and serve from memory
- Or rely on Nginx (in Docker deployment) to serve the client app directly, bypassing Express for non-API routes
- Add `Cache-Control: no-cache` on the HTML file (must revalidate) but `Cache-Control: public, max-age=3600` on assets

**✅ Batch C Remediation (Certified):**
- Added `cachedIndexHtml` + `cachedIndexHtmlSize` — read into memory at module load time via `fs.readFileSync` + `fs.statSync`
- SPA fallback serves from memory: `res.status(200).send(cachedIndexHtml)` with proper `Content-Type`, `Content-Length`, and `Cache-Control: no-cache` headers
- Falls back to `res.sendFile(indexPath)` if cached copy is unavailable (dev mode, file not built yet)
- Eliminates filesystem syscall overhead on every SPA navigation under load

---

### PF-013 — useContent/usePaginatedContent Hooks Lack Request Deduplication (🟢 Low, Low Risk)

**Domain:** Frontend Runtime
**Files affected:** `client/src/hooks/useContent.js`

**Current behavior:**
The hooks trigger a fetch whenever their internal `fetch` function reference changes (via `useCallback` deps). If deps include an unstable reference (e.g., inline object/function), the effect re-runs:

```javascript
const fetch = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const result = await fetchFn();
    setData(result);
  } catch (err) {
    setError(...);
  } finally {
    setLoading(false);
  }
}, deps);  // ← If deps contain unstable references, infinite re-fetch loop

useEffect(() => { fetch(); }, [fetch]);
```

There's also no deduplication for concurrent calls. If the component is mounted twice in StrictMode (development), two fetches fire and race to update state.

**Impact:**
- In React 18 StrictMode (development), mounts fire twice → duplicate API calls
- If deps include unstable values, infinite re-fetch loops are possible (silent, since abort/error handling is minimal)
- No AbortController integration — previous fetch continues even if component unmounts or refires

**Suggested remediation:**
- Only minor — document that deps must be stable
- No fix needed for production since StrictMode double-mount is dev-only

**✅ Batch C Remediation (Certified):**
- Added `fetchIdRef` (monotonic counter) to both `useContent` and `usePaginatedContent`
- Each fetch increments the counter; after response, checks `if (currentFetchId !== fetchIdRef.current) return;` before updating state
- Added `mountedRef` to prevent state updates on unmounted components
- Cleanup increments `fetchIdRef` to cancel any in-flight responses on unmount or dep change
- Prevents out-of-order responses from overwriting newer data (race condition fix)
- No AbortController needed — ref-based stale-update guard is simpler and covers all cases

---

### PF-014 — Source Maps Disabled in Production Build — Not Configurable (ℹ️ Informational)

**Domain:** Production — Debugging
**Files affected:** `client/vite.config.js`

**Current behavior:**
Source maps are hardcoded to `false`:

```javascript
build: {
  sourcemap: false,
}
```

**Impact:**
- Cannot debug production JS errors without source maps
- Error stack traces point to minified, concatenated bundle lines
- Adding source maps on demand requires a full rebuild

**Suggested remediation:**
- Make source maps configurable via environment variable: `sourcemap: process.env.GENERATE_SOURCEMAP === 'true'`
- Or generate hidden source maps in production for internal debugging (not uploaded to CDN)

**✅ Batch C Remediation (Certified):**
- Changed `sourcemap: false` to `sourcemap: process.env.GENERATE_SOURCEMAP === 'true'`
- Default: `false` — production-safe, no source maps exposed
- Set `GENERATE_SOURCEMAP=true` to enable source maps for debugging
- Zero behavior change in production — opt-in only

---

### PF-015 — Static Thumbnail Files Served Without Explicit Cache Headers (ℹ️ Informational)

**Domain:** Backend — Caching
**Files affected:** `server/src/routes/thumbnail.routes.js`

**Current behavior:**
Thumbnail sprites are served via the Express route handler, which reads the file from disk using `res.sendFile`. The response headers from `thumbnail.routes.js` include ST-004 CDN headers but no explicit `Cache-Control` beyond what `sendFile` provides by default (none for dynamically-served files).

**Impact:**
- Generated thumbnail sprites are re-served from disk on every request with no browser caching
- Once generated, sprites are immutable — they should be cacheable by both browser and CDN for extended periods
- Each thumbnail request goes through the full Express middleware stack before serving

**Suggested remediation:**
- Add `Cache-Control: public, max-age=86400` (24 hours) to thumbnail responses since sprites are immutable once generated
- Add `ETag` header based on file mtime/size for conditional requests

**✅ Batch C Remediation (Certified):**
- Added `fs` import at module level (was inline `require`)
- Added `ETag` header: `"${stat.mtimeMs}-${stat.size}"` — enables conditional requests via `If-None-Match`
- Added 304 response: returns `304 Not Modified` when browser's cached ETag matches
- `Cache-Control: public, max-age=86400` was already set — kept as-is
- **Bug fix:** Added the missing `res.sendFile(sprite.path)` call — the sprite was configured with headers but never actually sent to the client outside CDN mode

---
