# Phase C — Dynamic Provider Plugin System — Certification

> **Phase:** C — Dynamic Provider Plugin System
> **Status:** 🔒 FROZEN — Architecture Complete
> **Implementation:** NOT STARTED
> **Phase C1:** Completed July 6, 2026
> **Next Phase:** C2 — Provider Framework Implementation
> **Last Updated:** July 6, 2026

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
| **Status** | 🟡 C1 🔒 FROZEN · C2 ✅ IMPLEMENTED · C3 ❌ Not Started |
| **C1 Start Date** | 2026-07-06 |
| **C1 Freeze Date** | 2026-07-06 |
| **C2 Implementation Date** | 2026-07-07 |
| **Decisions Frozen** | C-001 through C-011 |
| **C2 Implementation** | ✅ COMPLETE (awaiting user certification) |

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

### Next Phase: C3 — YupFlix Migration
- Create `server/src/providers/sources/yupflix.provider.js`
- Update `POST /api/external/play` to use ProviderManager
- Wire frontend expired stream recovery
- Remove tmdb- prefix navigation dependency
