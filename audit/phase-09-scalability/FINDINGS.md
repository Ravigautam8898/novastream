# Phase 09 — Scalability Audit — Findings

> **Purpose:** Audit NovaStream's scalability readiness — stateless architecture, provider abstraction, horizontal scaling, database, cache, background jobs, rate limiting, and storage.
> **Status:** 🟢 BATCH A1 CERTIFIED — SC-014 + SC-015 resolved. Remaining findings pending.
> **Last Updated:** July 6, 2026

---

## Scope Areas

| # | Area | Focus |
|---|------|-------|
| 1 | Stateless architecture | Server memory state, session handling, PM2 cluster, multi-instance |
| 2 | Provider abstraction | ContentSourceService, TMDB, stream providers, dependency isolation |
| 3 | Horizontal scaling | Load balancer, workers, shared resources, filesystem assumptions |
| 4 | Database scalability | Connection pooling, query patterns, indexes, pagination, aggregation |
| 5 | Cache architecture | In-memory limitations, multi-node compatibility, invalidation |
| 6 | Background jobs | Schedulers, cron duplication risks, worker separation |
| 7 | Rate limiting | Multi-instance behavior, shared counters, Redis readiness |
| 8 | Storage scaling | Uploads, thumbnails, HLS files, CDN readiness |

---

## Batch A — Critical Scaling Blockers

These findings block horizontal scaling and must be resolved before running multiple instances.

### SC-001: In-Memory Lockout State Is Per-Process

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Risk** | High |
| **File** | `server/src/services/auth.service.js` (LockoutState Map) |
| **Current behavior** | Failed login attempts are tracked in an in-memory `lockoutState` Map. The lockout threshold (5 attempts) and window (15 min) are enforced per Node.js process. |
| **Production impact** | In PM2 cluster mode, an attacker can distribute 5 login attempts per process across 8 workers = 40 attempts before any single lockout triggers. The per-user lockout is effectively Nx weaker than intended. |
| **Suggested remediation** | Move lockout state to MongoDB (BlockedIP collection already tracks per-IP). Add a `lockedUntil` field to User model, or store lockout attempts in a capped MongoDB collection with TTL index. This ensures lockout is shared across all workers. |

### SC-002: In-Memory Stream Caches Are Per-Process

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Risk** | Medium |
| **Files affected** | `server/src/utils/cache.js` (MemoryCache), `server/src/services/content-source.service.js` (StreamCache), `server/src/services/stream.service.js` (contentCache) |
| **Current behavior** | Three independent in-memory caches store stream paths, playlist content, and external source stream URLs. Each PM2 worker has its own cache. On worker restart or new worker spawn, all caches are cold. |
| **Production impact** | After a rolling restart (common in deployment), every cache miss hits the filesystem or external API until all workers warm up. Cache-miss storms on cold workers can overwhelm the external source API and spike filesystem I/O. |
| **Suggested remediation** | For filesystem stream paths: use a shared filesystem (NFS) where cache warming is redundant. For external source URLs: add Redis-backed cache with the same TTL strategy. Implement cache-warming on worker startup (pre-fetch popular content). |

### SC-003: Weak Cross-Process Cache Invalidation

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Risk** | Medium |
| **Files affected** | `server/src/services/content.service.js` (ContentService caches), `server/src/services/progress.service.js` (continueWatchingCache), `server/src/services/stream.service.js` (tokenVersionCache) |
| **Current behavior** | ContentService has a `#getContentVersion()` method that queries MongoDB every 30s to check if content has been modified. If a change is detected in another process, the in-memory cache is invalidated. This provides **weak consistency** — up to 30s of staleness. The continueWatchingCache and tokenVersionCache have no cross-process invalidation. |
| **Production impact** | In cluster mode, one worker updating content (admin panel) doesn't invalidate other workers' caches. Users on the same worker see stale data for up to 30s (content) or indefinitely (continue-watching, stream tokens). Token version increments (on logout/password reset) may not take effect immediately on all workers. |
| **Suggested remediation** | Implement Redis pub/sub for cross-process cache invalidation. On content mutation, publish a message that all workers subscribe to, triggering immediate cache clear. For the token version cache, move the version check to a shared store (Redis) with local LRU cache on top. |

---

## Batch B — Multi-Instance / Database / Cache Issues

These findings degrade performance or correctness in multi-instance deployments but have workarounds.

### SC-006: Per-Process Rate Limiting Is Bypassable in Cluster Mode

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Risk** | Medium |
| **Files affected** | `server/src/middleware/rateLimiter.middleware.js` (all rate limiters) |
| **Current behavior** | `express-rate-limit` stores IP counters in an in-memory Map. In PM2 cluster mode, each worker has its own counter. Nginx rate limiting (configured in docker/nginx.conf) provides defense-in-depth at the proxy layer. |
| **Production impact** | The Nginx rate limit acts as the effective limit. The Express-level limit is N-1 times weaker than configured (N = worker count). An attacker could send 100 req/min per worker × 8 workers = 800 req/min before hitting the Nginx limit (100 req/s). Note: Nginx's limit is much higher (100 req/s), so this is partially mitigated. |
| **Suggested remediation** | Option A (simple): Increase reliance on Nginx rate limiting — it's shared across all workers. Option B (proper): Use `express-rate-limit` with an external store (Redis). The package supports external stores via the `store` configuration option. |

### SC-009: Embedded Watch History Has Growth Ceiling

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Risk** | Low (currently mitigated) |
| **Files affected** | `server/src/models/User.model.js` (watchHistory embedded array), `server/src/services/history.service.js`, `server/src/services/progress.service.js` |
| **Current behavior** | Watch history is stored as an embedded array in the User document, capped at 200 entries. On every read, all 200 entries are loaded from MongoDB into memory, sorted, filtered, and paginated in-process. |
| **Production impact** | At 200 entries per user × N active users: each User document read includes the full watch history array. For 10,000 users with 200 entries each, that's ~2 million history objects stored inside user documents. Each query fetches the full array even when only the most recent 20 entries are needed. The 200-item cap is a hard ceiling that can't be raised without performance impact. |
| **Suggested remediation** | Extract watch history into a separate collection (`watch_history`) with a compound index on `{userId, watchedAt}` and TTL for automatic cleanup. This allows efficient pagination, aggregation, and unlimited history retention. The User.watchHistory array can be removed or replaced with a lightweight `lastWatchedAt` field. |

### SC-010: estimatedDocumentCount Has Limited Applicability

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Risk** | Medium |
| **Files affected** | `server/src/services/content.service.js` (getMovies, getSeries, search) |
| **Current behavior** | Uses `estimatedDocumentCount()` when no filters are applied (fast, metadata-only), falls back to `countDocuments()` with filters (slow, scans collection). This pattern is applied in getMovies, getSeries, and search. |
| **Production impact** | On large databases (100K+ content items), filtered count queries scan the entire collection even with indexes. This adds 100ms-500ms to paginated browse queries. The MAX_PAGINATION_PAGE (100) prevents users from hitting deep pages, but the count query still runs on every request. |
| **Suggested remediation** | For filtered queries, consider approximate counts: countDocuments with `maxTimeMS(100)` to fail fast on slow queries, falling back to a cached count or no count. Alternatively, use MongoDB's `collStats` to get approximate counts for indexed fields. |

### SC-011: No MongoDB Read Preference Configuration

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Risk** | Low |
| **File** | `server/src/config/database.js` |
| **Current behavior** | No read preference is configured. Mongoose defaults to `primary` — all reads go to the primary node in a replica set. |
| **Production impact** | In a replica set deployment, all read traffic hits the single primary node. Secondary nodes sit idle for reads. Even secondary-preferred or nearest read preference would distribute load across the replica set. |
| **Suggested remediation** | Add a `readPreference` option to the Mongoose connection config, defaulting to `secondaryPreferred` for read-heavy queries. Add a `readPreferenceTags` configuration option for geo-distributed deployments. Note: this requires a MongoDB replica set (not a standalone instance). |

### SC-014: Duplicate Sync Scheduler in Cluster Mode

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Risk** | High |
| **Files affected** | `server/src/app.js` (startup), `server/src/services/sync-scheduler.service.js` |
| **Current behavior** | The sync scheduler is started in `app.js` during server boot. In PM2 cluster mode, every worker process calls `start()`, creating N instances of the scheduler (N = worker count). All N schedulers run the sync at the same aligned time (00:00, 06:00, 12:00, 18:00). |
| **Production impact** | Multiple concurrent syncs: (1) race conditions on bulkWrite (upsert conflicts), (2) double/triple writes to MongoDB, (3) N× the API calls to the external source (could trigger rate limiting). The `isSyncing` flag only prevents duplicate runs within the SAME process — it doesn't prevent inter-process races. |
| **Suggested remediation** | Option A (simple): Use a MongoDB atomic lock via `findOneAndUpdate` with a lock document. Only the worker that acquires the lock runs the sync. Option B (better): Run the scheduler as a separate PM2 process (`fork` mode, single instance) instead of in the cluster workers. Add `PM2_SCHEDULER_INSTANCE` env var check before starting the scheduler. |
| **Resolution** | ✅ **CERTIFIED** — Phase 9 Batch A1. Implemented MongoDB distributed lock (`DistributedLock` class) in `server/src/utils/distributedLock.js`. Refactored `sync-scheduler.service.js` to acquire/release lock in `finally`. 45-min TTL, owner-guarded release. Only one PM2 worker proceeds per interval. 52/52 tests pass. |

### SC-015: No Sync Locking Mechanism

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Risk** | Medium |
| **File** | `server/src/services/sync-scheduler.service.js` |
| **Current behavior** | The `isSyncing` boolean flag provides per-process mutual exclusion. There is no distributed lock for multi-instance coordination. |
| **Production impact** | Same as SC-014 — duplicate syncs cause data races, double-writes, and external API abuse. Even in single-instance mode, the flag is not persisted (process crash during sync = flag is lost, no recovery logic). |
| **Suggested remediation** | Implement a MongoDB-based distributed lock using `findOneAndUpdate` with a lock collection. Lock expiry TTL prevents stuck locks from crashing processes. Or use a dedicated Redis lock. |
| **Resolution** | ✅ **CERTIFIED** — Phase 9 Batch A1. Implemented `DistributedLock` class with atomic `insertOne` / `findOneAndUpdate` protocol and owner-guarded `deleteOne` release. Replaced per-process `isSyncing` boolean with distributed lock acquisition. Lock released in `finally` on both success and failure. |

### SC-016: No CDN Integration for HLS Streaming

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Risk** | Medium |
| **Files affected** | `server/src/services/stream.service.js`, `server/src/routes/stream.routes.js` |
| **Current behavior** | HLS segments are served directly by the Node.js Express server. Requests go through the full middleware stack (auth, rate limiter, logging, etc.) for every .ts segment. |
| **Production impact** | Each .ts segment request consumes Node.js event loop time for file reads (async but still I/O). On popular content, a single viewer watching 1080p can request 100+ segments in 30 minutes. With 100 concurrent viewers, that's 10,000+ segment requests going through Node.js. This is a major bottleneck before CPU or memory limits are hit. |
| **Suggested remediation** | Serve HLS segments from Nginx directly (via `internal` directive) or from a CDN (Cloudflare, CloudFront). The Express API would only serve signed playlist files. Segments can be served by Nginx with `X-Accel-Redirect` or pre-signed CDN URLs. This offloads all segment serving from Node.js. |

### SC-017: Thumbnail Sprites Written to Local Disk Only

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Risk** | Low |
| **File** | `server/src/services/thumbnail.service.js` |
| **Current behavior** | Generated thumbnail sprite sheets are written to `server/thumbnails/` — local filesystem. In Docker deployments, this is a Docker volume. |
| **Production impact** | With multiple server instances, each instance must generate its own thumbnail sprites. No shared cache means N× the FFmpeg CPU time per unique content item. If sprites are generated on demand (cold start), the first viewer of each title triggers a CPU-intensive FFmpeg operation. |
| **Suggested remediation** | Store sprites in a shared filesystem (NFS) or object store (S3). The thumbnail service already caches generated sprites to disk — switching the cache target to a shared path or S3 would make sprites available across all instances. Add CDN fronting for popular sprites. |

---

## Batch C — Future Scale Improvements

These findings are not blocking but would improve performance, observability, or maintainability at scale.

### SC-004: ContentSourceService Has Single-Source Implementation

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Risk** | Low |
| **File** | `server/src/services/content-source.service.js` |
| **Current behavior** | The SOURCES_MAP supports multiple sources but only `primary` is configured. The abstraction is clean and extensible. |
| **Production impact** | No immediate impact. Adding a second source requires only adding to SOURCES_MAP and defining parsers. The architecture is ready. |
| **Suggested remediation** | None needed. Documented as ready for multi-source. |

### SC-005: TMDB Service Has No Fallback Provider

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Risk** | Low |
| **File** | `server/src/services/tmdb.service.js` |
| **Current behavior** | Only TMDB is used for metadata fallback. If TMDB is unreachable, content falls back to DB-only (already synced data). New content discovery (trending, search) has no alternative source. |
| **Production impact** | During TMDB outages, trending and search return DB-only results. New content discovery stops. |
| **Suggested remediation** | Add a secondary metadata provider (e.g., OMDb, TheTVDB) as a tier-2 fallback. This is low priority — TMDB has high uptime. |

### SC-008: Thumbnails Served Through Node.js

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Risk** | Low |
| **File** | `server/src/routes/thumbnail.routes.js` |
| **Current behavior** | Thumbnail sprites are served through Express routes with authentication (same as API endpoints). |
| **Production impact** | Every thumbnail request goes through the full middleware stack. Thumbnails are fetched by browser `<img>` tags (ArtPlayer seek preview) — each seek triggers a sprite request. |
| **Suggested remediation** | Serve thumbnail sprites from Nginx or CDN with long cache headers. Generate signed URLs with expiry instead of requiring auth middleware. This is lower priority than HLS segments (SC-016). |

### SC-012: No Cache Observability

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Risk** | Low |
| **Files affected** | `server/src/utils/cache.js` (MemoryCache), `server/src/services/content-source.service.js` (StreamCache) |
| **Current behavior** | No cache hit/miss metrics, TTL tracking, or size monitoring. The MemoryCache and StreamCache classes don't expose metrics. ContentService caches don't expose hit rates. |
| **Production impact** | Impossible to tune cache TTLs or sizes without manual log analysis. Cache storms, eviction loops, or cold starts are invisible until they cause user-facing latency. |
| **Suggested remediation** | Add hit/miss counters, size histograms, and TTL expiry tracking to all cache implementations. Expose via a `/api/admin/cache-stats` endpoint for monitoring. Add Prometheus metrics for production monitoring. |

### SC-013: Multiple Independent Cache Implementations

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Risk** | Low |
| **Files affected** | `server/src/utils/cache.js`, `server/src/services/content-source.service.js`, `server/src/services/stream.service.js` |
| **Current behavior** | Three separate cache implementations: MemoryCache (utils/cache.js), StreamCache (content-source.service.js, class with LRU+TTL), contentCache (stream.service.js, simple Map with TTL). Each has different eviction policies, different API surfaces, and no shared interface. |
| **Production impact** | Code duplication, inconsistent behavior when adding Redis support (need to update 3 places). Metrics are fragmented across caches. |
| **Suggested remediation** | Unify behind a single interface (e.g., `Cache` interface with `get/set/has/delete/clear/metrics`). Implement MemoryCache as one backend, RedisCache as another. Have all services depend on the `Cache` interface. Then adding Redis support is a one-time change. |

---

## Recommended Remediation Order

| Priority | Finding | Batch | Effort | Impact | Status |
|:--------:|---------|:-----:|:------:|:------:|:------:|
| 1 | **SC-014** — Duplicate sync scheduler in cluster | B | Medium | Prevents data corruption | ✅ RESOLVED |
| 2 | **SC-001** — Per-process lockout state | A | Small | Closes security bypass | ⬜ |
| 3 | **SC-015** — No sync locking mechanism | B | Small | Prevents data races | ✅ RESOLVED |
| 4 | **SC-006** — Per-process rate limiting | B | Medium | Strengthens cluster security | ⬜ |
| 5 | **SC-003** — Weak cache invalidation | A | Large | Consistency guarantee | ⬜ |
| 6 | **SC-016** — CDN for HLS streaming | B | Large | Removes Node.js bottleneck | ⬜ |
| 7 | **SC-009** — Embedded watch history extraction | B | Large | Removes growth ceiling | ⬜ |
| 8 | **SC-002** — Stream caches are per-process | A | Large | Prevents cache-miss storms | ⬜ |
| 9 | **SC-012** — Cache observability | C | Small | Enables monitoring | ⬜ |
| 10 | **SC-013** — Unify cache implementations | C | Medium | Simplifies Redis addition | ⬜ |
| 11 | **SC-017** — Shared thumbnail storage | B | Medium | Reduces CPU load | ⬜ |
| 12 | **SC-011** — Read preference config | B | Small | Better replica set utilization | ⬜ |
| 13 | **SC-010** — estimatedDocumentCount limits | B | Small | Faster filtered queries | ⬜ |
| 14 | **SC-008** — Thumbnail CDN | C | Medium | Optimization | ⬜ |
| 15 | **SC-005** — TMDB fallback provider | C | Small | Resilience | ⬜ |

### Effort Estimates
- **Small** — ≤ 1 file, ≤ 50 lines changed
- **Medium** — 1-3 files, 50-200 lines
- **Large** — 3+ files, 200+ lines, may include new dependencies (Redis, NFS)

---

## Batch A1 Certification — June 2026

| Finding | Status | Files Changed | Verification |
|:-------:|:------:|:-------------:|:------------:|
| **SC-014** | ✅ RESOLVED | `server/src/services/sync-scheduler.service.js` (refactored), `server/src/utils/distributedLock.js` (new) | 52/52 tests pass, code review clean, multi-worker lock protocol verified |
| **SC-015** | ✅ RESOLVED | `server/src/services/sync-scheduler.service.js` (lock acquisition/release), `server/src/utils/distributedLock.js` (lock utility) | Atomic insert + expired takeover protocol, owner-guarded release, `finally`-guarded release |

---

## Discovery Summary

**17 findings** identified across 8 scalability areas:

| Batch | Count | Focus |
|:-----:|:-----:|-------|
| **A** | 3 | Critical scaling blockers — prevent horizontal scaling |
| **B** | 10 | Multi-instance / database / cache issues — degrade performance |
| **C** | 4 | Future improvements — monitoring, abstraction, optimization |

### Key Architectural Observations

1. **The architecture is not stateless.** In-memory caches, lockout state, and scheduler state are tied to process lifetime. Adding Redis support would resolve the majority of Batch A findings.

2. **PM2 cluster mode is configured but not fully compatible.** The scheduler and lockout state assume single-process deployment. Cluster mode works for request handling but background jobs need isolation.

3. **Filesystem assumptions are the main scaling blocker.** HLS segments, thumbnails, and uploads all assume local disk. A shared filesystem (NFS/EFS) or object store (S3) plus CDN would enable horizontal scaling.

4. **Provider abstraction is solid.** ContentSourceService, TMDB service, and Stream service are cleanly separated. Adding new providers or backends requires minimal changes.

5. **Database patterns are well-optimized for single-instance.** `.lean()`, batch queries, caching, and pagination are all correct. The main concern is the embedded watch history growth ceiling.

---

## Files Read During Discovery

| File | Relevance |
|------|-----------|
| `server/src/app.js` | Server startup, middleware, index.html cache |
| `server/src/services/auth.service.js` | LockoutState (in-memory), session management |
| `server/src/services/stream.service.js` | contentCache, tokenVersionCache, filesystem HLS serving |
| `server/src/services/content-source.service.js` | StreamCache, SOURCES_MAP, external API abstraction |
| `server/src/services/sync-scheduler.service.js` | Background scheduler, `isSyncing` flag |
| `server/src/services/content.service.js` | #detailCache, #listCache, #homepageCache, #getContentVersion |
| `server/src/services/progress.service.js` | continueWatchingCache (in-memory, no cross-process) |
| `server/src/utils/cache.js` | MemoryCache — reusable in-memory cache |
| `server/src/config/database.js` | Connection pooling, read preference |
| `server/src/middleware/rateLimiter.middleware.js` | Per-process rate limit counters |
| `server/src/middleware/auth.middleware.js` | Session check, JWT verify |
| `server/src/middleware/ipBlocker.middleware.js` | DB-backed IP blocking |
| `server/src/models/User.model.js` | Embedded watchHistory, watchlist |
| `ecosystem.config.js` | Cluster mode configuration |
| `docker/nginx.conf` | Nginx rate limiting, proxy config |
