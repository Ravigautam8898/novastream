# Phase C — Dynamic Provider Plugin System — Certification

> **Phase:** C — Dynamic Provider Plugin System
> **Status:** 🔒 C1+C2+C3+C4+C5 FROZEN ✅
> **Implementation:** C1 + C2 + C3 + C4 + C5 Complete
> **Phase C1:** Completed July 6, 2026
> **Phase C2:** Completed July 7, 2026
> **Phase C3:** Completed July 7, 2026
> **Phase C4:** Completed July 7, 2026
> **Phase C5:** Completed July 8, 2026
> **Next Phase:** C6 — Extractor System
> **C5a:** Metadata Provider System ✅ 🔒 FROZEN
> **C5b:** Nova Identity Registration ✅ 🔒 FROZEN
> **C5c:** TMDB Bridge Removal ✅ 🔒 FROZEN
> **C5d:** Playback Recovery + Stream Lifecycle UX ✅ 🔒 FROZEN
> **C5e:** Auto Provider Source UI ✅ 🔒 FROZEN
> **C5f:** Runtime Architecture Cleanup ✅ 🔒 FROZEN
> **Last Updated:** July 8, 2026

---

## Phase Summary

| Field | Value |
|-------|-------|
| **Phase** | C — Dynamic Provider Plugin System |
| **Total Findings** | 0 |
| **Certified** | 0 |
| **Closed** | 0 |
| **Rejected** | 0 |
| **Won't Fix** | 0 |
| **Status** | 🟢 C1 🔒 FROZEN · C2 🔒 FROZEN · C3 🔒 FROZEN · C4 🔒 FROZEN · C5 🔒 FROZEN ✅ |
| **C1 Start Date** | 2026-07-06 |
| **C1 Freeze Date** | 2026-07-06 |
| **C2 Implementation Date** | 2026-07-07 |
| **C2 Freeze Date** | 2026-07-07 |
| **C3 Implementation Date** | 2026-07-07 |
| **C3 Freeze Date** | 2026-07-07 |
| **C4 Implementation Date** | 2026-07-07 |
| **C4 Freeze Date** | 2026-07-07 |
| **C5 Implementation Date** | 2026-07-08 |
| **C5 Freeze Date** | 2026-07-08 |
| **Decisions Frozen** | C-001 through C-013 |
| **C2 Implementation** | ✅ CERTIFIED 🔒 FROZEN |
| **C3 Implementation** | ✅ CERTIFIED 🔒 FROZEN |
| **C4 Implementation** | ✅ CERTIFIED 🔒 FROZEN |
| **C5 Implementation** | ✅ CERTIFIED 🔒 FROZEN |

---

## Phase Exit Checklist — C1 ✅

- [x] All documentation reviews complete (final consistency audit passed)
- [x] Architecture decisions frozen (C-001 through C-011)
- [x] Provider Developer SDK Guide published (PROVIDER_DEVELOPMENT.md)
- [x] CERTIFICATION.md updated with freeze status
- [x] AUDIT_STATUS.md updated with freeze status
- [x] MASTER_INDEX.md updated with freeze status
- [x] CHATGPT_CONTEXT.md updated with freeze status
- [x] DECISIONS.md logs all 11 decisions (C-001 through C-011)
- [x] No stale terminology — all SCRAPER references updated to LIGHT_SCRAPER/BROWSER_SCRAPER

---

## Phase C2 — Implementation Checklist

### Created Files

| # | File | Status |
|---|------|--------|
| 1 | `server/src/providers/ContentRegistry.js` | ✅ Implemented |
| 2 | `server/src/providers/BaseProvider.js` | ✅ Implemented |
| 3 | `server/src/providers/ProviderRegistry.js` | ✅ Implemented |
| 4 | `server/src/providers/ScraperQueue.js` | ✅ Implemented |
| 5 | `server/src/providers/ProviderManager.js` | ✅ Implemented |
| 6 | `server/src/providers/sources/.gitkeep` | ✅ Created |
| 7 | `server/src/providers/extractors/.gitkeep` | ✅ Created |
| 8 | `server/src/models/Content.model.js` (updated) | ✅ providers[] field added |

### C2 Functional Requirements

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Split metadata and streaming responsibility | ✅ | ContentRegistry handles metadata identity; ProviderManager handles stream resolution |
| 2 | ContentRegistry with permanent Nova-owned slug | ✅ | `register()`, `lookup()`, `identify()`, `attachProvider()` |
| 3 | providers[] mapping on Content model | ✅ | Backward compatible with legacy sourceId/sourceSite |
| 4 | BaseProvider abstract class | ✅ | Metadata validation, lifecycle methods, error wrapping |
| 5 | ProviderRegistry database-backed config | ✅ | `_providerConfigs` collection, env fallback, health tracking |
| 6 | ProviderManager orchestrator | ✅ | Discovery, ordering (API→scraper), cache integration, distributed lock |
| 7 | ScraperQueue for controlled execution | ✅ | FIFO queue, circuit breaker, exponential backoff |
| 8 | Stream cache reuse (_streamCache) | ✅ | Same collection, same key format, same TTL logic |
| 9 | Expired stream recovery hooks | ✅ | `handleExpiredStream()`, `attemptRecovery()` with retries |
| 10 | Legacy sourceId/sourceSite compatibility | ✅ | `_getProviderMapping()` checks providers[] first, falls back to legacy |
| 11 | StreamPolicy metadata support | ✅ | STATIC_URL, SIGNED_URL, DYNAMIC in BaseProvider metadata |
| 12 | ProviderType execution modes | ✅ | API→DIRECT, LIGHT_SCRAPER→QUEUE, BROWSER_SCRAPER→WORKER |

## C2 Validation Results (2026-07-07)

### 1. Content Model Migration Safety ✅

| Check | Result |
|-------|--------|
| Existing sourceId/sourceSite still present | ✅ Both fields intact (backward compatible) |
| New providers[] field is optional | ✅ Not required — old documents unaffected |
| All existing indexes preserved | ✅ 8 indexes verified (slug unique, tmdbId sparse unique, text search, compound) |
| No duplicate slug/tmdbId risk | ✅ Slug unique index, tmdbId sparse unique index prevent duplicates |
| Old queries not broken | ✅ 52/52 tests pass — zero regressions |

### 2. ContentRegistry Validation ✅

| Scenario | Expected | Result |
|----------|----------|--------|
| Same TMDB item discovered twice | Existing content reused, no duplicate | ✅ `lookup()` returns existing by tmdbId first |
| Same title, different year/type | Not incorrectly merged | ✅ Year validation in `identify()` returns low confidence (0.3) on mismatch |
| FROM vs Notes corruption prevention | Cannot happen again | ✅ `identify()` requires year+type match for non-exact titles; `attachProvider()` uses `$addToSet` |
| Provider item with tmdbId | Matched at confidence 1.0 | ✅ tmdbId is priority 1 in lookup chain |
| Provider item with title+year+type only | Matched at confidence 0.85 | ✅ With year validation |

### 3. ProviderManager Validation ✅

| Check | Result |
|-------|--------|
| API before LIGHT_SCRAPER before BROWSER_SCRAPER | ✅ Ordering simulation verified |
| Unhealthy provider skipped | ✅ Sorts after healthy providers of same type |
| Failed provider doesn't block playback | ✅ Per-provider try/catch in loop; continues to next |
| Fallback path works | ✅ Tries API → LIGHT_SCRAPER → BROWSER_SCRAPER in sequence |
| Cache-first before provider calls | ✅ `_checkCache()` before lock acquisition |
| Distributed lock prevents stampede | ✅ Reuses existing DistributedLock |

### 4. ScraperQueue Validation ✅

| Check | Result |
|-------|--------|
| Global concurrency limit (5) | ✅ Enforced — tasks 6+ correctly queued |
| Circuit breaker opens at 5 failures | ✅ Simulation confirmed |
| Exponential backoff (30s → 60s → 120s) | ✅ Verified after circuit trips |
| Server CPU protected at capacity | ✅ Active tasks never exceed GLOBAL_MAX |

### 5. Legacy Compatibility ✅

| Check | Result |
|-------|--------|
| ContentSourceService unchanged | ✅ All functions intact (getStreamUrl, refreshStreamUrl, etc.) |
| sourceId/sourceSite lookups working | ✅ Verified in source file |
| Existing YupFlix playback unaffected | ✅ C3 not started — ContentSourceService still sole resolver |

### 6. Runtime Validation ✅

| Check | Result |
|-------|--------|
| All 6 framework modules load | ✅ Module load test passed (no DB required) |
| 52/52 tests pass | ✅ 4 suites, 52 tests, 0 failures (1.862s) |
| All 7 source files pass syntax check | ✅ ContentRegistry, BaseProvider, ProviderRegistry, ScraperQueue, ProviderManager, Content.model, app.js |
| Content schema verified | ✅ All critical paths present, indexes valid, providers[] optional |

### C2 Not In Scope (deferred to C3+)

| # | Item | Target Phase |
|---|------|:------------:|
| 1 | Migrate YupFlix from ContentSourceService to provider plugin | C3 |
| 2 | Add CastleTV provider plugin | C4 |
| 3 | Update POST /api/external/play to use ProviderManager | C3 |
| 4 | Frontend expired stream recovery integration | C3 |
| 5 | Provider admin management UI | C6 |
| 6 | Remote update support | C7 |
| 7 | Remove tmdb- prefix navigation | C3 |

---

## Finding Summary

| ID | Title | Category | Severity | Status | Certified By | Date |
|----|-------|----------|----------|--------|-------------|------|
| — | Phase C1 — Architecture Freeze | Documentation | Information | CLOSED | AI Agent | 2026-07-06 |
| — | Phase C2 — Provider Framework | Implementation | Information | 🟡 PENDING | — | 2026-07-07 |

---

## Architecture Decisions (Frozen Baseline)

| ID | Decision | Impact |
|----|----------|--------|
| C-001 | Track C audit framework created | Governance structure established |
| C-002 | Hybrid approach: local provider folder + optional remote index | Security + flexibility balance |
| C-003 | Content-type independent interface (search/getDetails/getEpisodes/getStreams) | Supports movies, series, anime, live TV |
| C-004 | Zero provider queries on detail page | Prevents 50-provider load explosion |
| C-005 | Auto mode default, manual source selection optional | Best UX for most users |
| C-006 | Extractors separated from providers | No duplicate resolver code |
| C-007 | No remote code execution | All providers are reviewed, committed, local files |
| C-008 | Provider resolution uses request deduplication locking | Prevents cache stampede — 1000 users → 1 resolve |
| C-009 | ProviderManager prioritizes API before LIGHT_SCRAPER before BROWSER_SCRAPER | Reduces CPU usage, protects server resources |
| C-010 | Provider stream lifecycle management — reuse existing caches, add streamPolicy | No duplicate caches; configurable TTL per provider |
| C-011 | Scraper providers execute through controlled ScraperQueue (QUEUE/WORKER) | Protects API server from CPU/RAM overload |
| C-013 | Content Registry & Stable URL Architecture | Nova-owned slugs, identity matching |

---

## Certified By

| Role | Name | Date |
|------|------|------|
| Auditor | AI Agent | 2026-07-06 |
| Architecture Proposal | AI Agent | 2026-07-06 |
| Approved By | ✅ Architecture APPROVED by user | 2026-07-06 |
| C2 Implementation | AI Agent | 2026-07-07 |
| C2 User Certification | ⏳ PENDING | — |

## Notes

**Phase C1 is 🔒 FROZEN.** The architecture is complete and approved. No further architecture changes are required.

**Phase C2 is ✅ IMPLEMENTED** — awaiting user certification. All 5 framework files created, Content model updated, cache and distributed lock integration complete. Existing YupFlix streaming continues to work via ContentSourceService (unchanged). ProviderManager is ready for C3 migration.

All 12 decisions (C-001 through C-011, C-013) are frozen as the baseline. Future implementation phases must not modify these decisions without an architecture amendment process.

### Key Documents
- `FINDINGS.md` — Full architecture proposal, provider interface contract, migration plan, C-013
- `PROVIDER_DEVELOPMENT.md` — Provider Developer SDK Guide with templates and checklists
- `DECISIONS.md` (C-001 → C-013) — All 12 architectural decisions logged in master decisions log
- `MASTER_INDEX.md` — Track C added to master index
- `AUDIT_STATUS.md` — Track C status added to dashboard
- `CHATGPT_CONTEXT.md` — Track C section added

### C3a — YupFlix Migration ✅ Complete (2026-07-07)

| Task | Status |
|------|--------|
| Create `yupflix.provider.js` extending BaseProvider with legacyIds: ['primary'] | ✅ Done |
| Move YupFlix API logic from ContentSourceService (fetch, parse, validate, retry) | ✅ Done — moved verbatim |
| ContentSourceService.getStreamUrl/refreshStreamUrl/getStreamInfo → delegate to ProviderManager | ✅ Done — backward-compatible transforms |
| ProviderManager legacyIds alias: sourceSite='primary' → yupflix provider | ✅ Done — `_matchesProvider()` checks `meta.legacyIds` |
| Cache key compatibility preserved (primary:type:id:quality format) | ✅ Done — same key format, existing cache intact |
| Soft-error message compatibility for route handler | ✅ Done — getStreamUrl catches and re-throws with legacy message |
| All 52 tests pass | ✅ 52/52 pass, zero regressions |
| Syntax checks on all 3 files | ✅ All pass |
| Runtime certification | ✅ All 8 tests passed |

### C3b — Provider Mapping Migration ✅ Complete (2026-07-07)

| Task | Status |
|------|--------|
| Create `migrate-provider-mappings.js` (dry-run default, idempotent) | ✅ Done |
| Run migration — scanned 637 docs, migrated 612 | ✅ 612 yupflix mappings added to providers[] |
| Duplicate prevention verified | ✅ Second run found 0 docs needing migration |
| ProviderManager prefers providers[] over legacy | ✅ `_getProviderMapping()` checks `verified`/`active` status first |
| Legacy fallback logging | ✅ Debug log when sourceId/sourceSite used instead of providers[] |
| Runtime validation (series, movie, cache, refresh) | ✅ All tests pass |

### C3c — Privacy Hardening + Cleanup ✅ Complete (2026-07-07)

| Task | Status |
|------|--------|
| .gitignore — ignore *.provider.js, allow example.provider.js + README.md | ✅ Done |
| git rm --cached yupflix.provider.js (local file preserved) | ✅ Done |
| Create `example.provider.js` — full provider template | ✅ Done — all patterns documented |
| Create `README.md` — integration guide with provider types, stream policies, flow | ✅ Done |
| Template `isTemplate: true` — skipped at registration | ✅ ProviderManager skips templates before validation |
| sourceId/sourceSite marked deprecated but NOT removed | ✅ Legacy fallback active |
| ProviderManager prefers providers[] first | ✅ Legacy fallback only for old installs |
| Runtime validation (syntax, tests) | ✅ All pass |

### C3 Certification ✅

| Validation | Result |
|------------|--------|
| YupFlix provider registration | ✅ Provider discovered and registered at startup |
| Playback (movie + series) | ✅ Both resolve stream URLs correctly |
| Cache HIT | ✅ Second call returns source:'cache' |
| Refresh | ✅ Cache bypass works correctly |
| providers[] migration | ✅ 612 documents migrated, 0 duplicates |
| Provider privacy | ✅ *.provider.js gitignored, template skipped |
| Template skip | ✅ isTemplate:true prevents registration |
| All 52 tests | ✅ Pass, zero regressions |

### C4 — Multi-Provider Integration ✅ Complete (2026-07-07)

| Task | Status |
|------|--------|
| C4a: Create CastleTV provider with AES/CBC crypto, API endpoints, quality mapping | ✅ Done |
| C4b: Multi-provider fallback — try providers array content mapping until one succeeds | ✅ Done |
| C4c: Provider contract compatibility — providerData, full mapping passthrough, docs | ✅ Done |
| C4a search() fixes: _classifyType (numeric movieType), publishTime→year extraction | ✅ Done |
| C4a _apiGet() User-Agent fix: okhttp/4.11.0 per Python reference | ✅ Done |
| C4a getStreams() episodeId fix: movies need separate episode ID from movie ID | ✅ Done |
| C4a ProviderManager static property access bug (p.provider.constructor.metadata.id) | ✅ Done |
| Provider privacy: *.provider.js gitignored, only example.provider.js tracked | ✅ Done |
| Mapping tool: map-provider-content.js — generic search+confidence content mapper | ✅ Done |
| Provider conversion guide: APK→NovaStream workflow documented | ✅ Done |

### C4 Certification ✅

| Validation | Result |
|------------|--------|
| CastleTV direct playback | ✅ Stream URL returned |
| YupFlix playback | ✅ Stream URL returned |
| Provider fallback (YupFlix fail → CastleTV success) | ✅ Fallback works across providers |
| Cache HIT | ✅ Cache returns cached URL |
| Refresh | ✅ Cache bypass works |
| providerData compatibility | ✅ Passed via full mapping object |
| Provider privacy | ✅ Only example.provider.js tracked in git |
| All 52 tests | ✅ Pass, zero regressions |

### Rules Frozen (C4c)

1. ProviderManager never contains provider-specific logic (routing only)
2. Providers own their own IDs
3. `providerContentId` = simple primary identifier
4. `providerData` = provider-specific data (opaque to ProviderManager)
5. All future decoded APK providers must follow PROVIDER_DEVELOPMENT.md

### C5 — Metadata + Playback Architecture ✅ Certified 🔒 FROZEN

**C5a — Metadata Provider Framework (2026-07-07):**
- BaseMetadataProvider, MetadataManager, tmdb.metadata adapter
- metadataSources identity model (Map-based, extensible)
- ContentService delegates to MetadataManager for trending/search/details

**C5b — Nova Identity Registration (2026-07-07):**
- ContentRegistry.registerOrUpdate() with safe merge rules
- getByTmdbId() returns real Content doc (Mongo _id, Nova slug)
- verify-content-identity.js audit script

**C5c — TMDB Bridge Removal (2026-07-07):**
- ContentCard async registration, slug-only URLs
- DetailPage/WatchPage: removed all tmdb- detection
- All URLs: /watch/movie/{nova-slug}, /watch/series/{nova-slug}

### C5f — Runtime Architecture Cleanup ✅ Complete

| Task | Status |
|------|--------|
| Delete old sync-scheduler.service.js | ✅ Deleted — was creating Content from provider catalog every 6h |
| Delete old sync-external-content.js | ✅ Deleted — did same catalog sync on demand |
| Create MetadataRefreshScheduler service | ✅ Created — pre-warms homepage cache on startup, refreshes every 30min |
| Modify app.js — remove old sync hooks, add new scheduler + EADDRINUSE | ✅ Done |
| Update CLI — remove sync command, keep status | ✅ Done |
| Cache design review — homepage vs stream cache | ✅ Confirmed separate (homepage = in-memory MemoryCache, stream = _streamCache MongoDB) |
| All 52 tests pass | ✅ Zero regressions |
| Frontend build | ✅ Passes |
| EADDRINUSE detection | ✅ Clean diagnostic message instead of Node stack trace |
| 22 PM2 instances online | ✅ Health endpoint returns 200 |

**Key architectural change:** Stream providers (YupFlix, CastleTV) NEVER create catalog entries. Only MetadataManager → ContentRegistry.registerOrUpdate() creates Content documents. The old sync scheduler's provider-catalog-to-Content pipeline is eliminated.

### C5 Freeze Certification — July 8, 2026

**Phases certified:** C5a (Metadata System) · C5b (Identity Lifecycle) · C5c (TMDB Bridge Removal) · C5d (Playback Recovery) · C5e (Auto Source UI) · C5f (Runtime Cleanup)

**Final validation results:**

| Check | Result |
|-------|--------|
| Git status — clean working tree | ✅ Clean |
| All 52 tests pass | ✅ Zero regressions |
| Frontend build | ✅ Passes (6.62s) |
| Identity audit — 769 items scanned | ✅ 0 duplicates, 0 missing slugs, 2 Class B conflicts (acceptable) |
| Provider safety — *.provider.js gitignored | ✅ example.provider.js tracked, real providers ignored |
| Runtime startup — MetadataRefreshScheduler | ✅ 22 instances online, health endpoint 200

**Certified By:** AI Agent — 2026-07-08

### Next Phase: C6 — Extractor System
