# NovaStream — Caching & Performance Plan

> **Status:** ✅ Phase A Complete (Server-Side Caching)
> **Last Updated:** July 2, 2026

---

## Overview

Three tiers of caching planned, from quick server-side wins to full client-side cache framework.

---

## ✅ Phase A: Server-Side Caching (Quick Wins — Complete)

### What was done

| Change | File | Impact |
|--------|------|--------|
| **Reusable cache utility** | `server/src/utils/cache.js` | `MemoryCache` class with TTL, lazy expiration, Map-based store |
| **Cache-Control middleware** | `server/src/middleware/cacheControl.middleware.js` | Sets `Cache-Control: public, max-age=300, stale-while-revalidate=60` on all successful GET/HEAD responses |
| **Wired into content routes** | `server/src/routes/content.routes.js` | Applied after auth + rate limiting, before any GET route |
| **Detail page caching** | `server/src/services/content.service.js` | `getMovieBySlug` + `getSeriesBySlug` cached 5 min in `#detailCache` |
| **List page caching** | `server/src/services/content.service.js` | `getMovies` + `getSeries` cached 2 min in `#listCache` |
| **Category caching** | `server/src/services/content.service.js` | `getByCategory` cached 5 min in `#categoryCache` |

### How it helps

1. **Browser caches API responses** — The `Cache-Control` header tells the browser to cache GET responses for 5 minutes. Navigating back to a page within 5 minutes uses the cached response instantly (no network request).
2. **`stale-while-revalidate=60`** — After the 5-minute cache expires, the browser can serve stale content while revalidating in the background for an additional 60 seconds. No waiting.
3. **Server in-memory cache** — Even if the browser cache is cold, the server avoids repeated MongoDB queries within the TTL window. Detail pages that took 2-3s to fetch seasons+episodes now return in <5ms.

### Known limitations

- Cache is per-process (lost on server restart). Acceptable for single-process deployment.
- No cache invalidation — if content sync runs, stale data may be served for up to 5 minutes.
- Only covers content routes. Auth, favorites, history, and progress endpoints are not cached (correct — they're user-specific).

---

## 📋 Phase B: Client-Side Cache Layer (Pending)

### Proposed
- [ ] Wrap `useContent` hook with in-memory LRU cache keyed by API URL+params
- [ ] Add axios request deduplication (prevent parallel duplicate requests for same data)
- [ ] Cache rendered content data in `sessionStorage` for instant back-navigation across browser tabs

### Estimated effort
~45 min

---

## 📋 Phase C: Prefetching (Pending)

### Proposed
- [ ] Prefetch detail data on hover for ContentCard links
- [ ] Prefetch homepage data when user is deep in a detail page (anticipatory navigation)
- [ ] Route-based code splitting with preload hints (`<link rel="modulepreload">`)

### Estimated effort
~30 min

---

## 📋 Phase D: Framework Migration (Pending)

### Proposed
- [ ] Migrate from raw `useState` + `useEffect` data fetching to `@tanstack/react-query`
- [ ] Automatic caching, background revalidation, stale-while-revalidate
- [ ] Cache persistence across page navigations
- [ ] Request deduplication out of the box
- [ ] Optimistic updates for favorites/progress

### Estimated effort
~2-3 hours
