# Phase 3 — Backend Audit: Findings

> **Phase:** Backend Architecture — Routes, Controllers, Services
> **Last Updated:** 2026-07-04
> **Status:** DISCOVERY COMPLETE — 13 findings identified, 4 certified in Batch A

---

## Executive Summary

The Phase 3 Backend Audit reviewed all 14 route files, 2 controllers, 10 services, 4 validators, and 9 models. The primary architectural finding is that **only 2 of 14 route files** use the controller abstraction pattern — the remaining 12 embed business logic directly in route handlers. This creates maintainability issues, testability gaps, and duplicated patterns across files.

**Batch A (Certified):** Extracted business logic from 4 route files into 5 services + 3 controllers. Created proper architecture boundaries for progress, history, favorites, and admin routes.

---

## Finding Summary

| ID | Severity | Risk | Category | Title | Status |
|----|:--------:|:----:|----------|-------|:------:|
| **B-001** | 🔴 High | High | Architecture | Business logic inlined in route handlers | ✅ CERTIFIED (Batch A) |
| **B-002** | 🟡 Medium | Medium | Duplicate Logic | Duplicate watch history population logic | ✅ CERTIFIED (Batch A) |
| **B-003** | 🔴 High | Medium | God File | admin.routes.js is a god file (400+ lines, 7 concerns) | ✅ CERTIFIED (Batch A) |
| **B-004** | 🟡 Medium | Low | Error Consistency | Inconsistent error response formatting | ✅ CERTIFIED (Batch B) |
| **B-005** | 🟡 Medium | Medium | Architecture Gap | Missing controller abstraction for 12 route modules | ✅ CERTIFIED (Batch A) |
| **B-006** | 🔴 High | Medium | Authorization | External source cache endpoints lack admin guard | ✅ CERTIFIED (Batch C) |
| **B-007** | 🟢 Low | Low | Dead Import | auth.controller.js imports unused config | ✅ CERTIFIED (Batch B) |
| **B-008** | 🟢 Low | Low | Route Duplication | Health endpoint duplication (index.js + health.routes.js) | ✅ CERTIFIED (Batch B) |
| **B-009** | 🟡 Medium | Medium | Fragile Contract | Stream URL template contains literal `:slug` | ✅ CERTIFIED (Batch B) |
| **B-010** | 🟢 Low | Low | Mounting Fragility | Fragile route mounting order in routes/index.js | ✅ CERTIFIED (Batch D) |
| **B-011** | 🟢 Low | Low | URL Inconsistency | Content routes mounted without prefix | ✅ CERTIFIED (Batch D) |
| **B-012** | 🟢 Low | Low | Dependency Risk | thumbnail.service.js lazy requires('canvas') at runtime | ✅ CERTIFIED (Batch B) |
| **B-014** | 🟢 Low | Low | Dead Import | watch-history.routes.js imports unused WATCH_HISTORY_MAX | ✅ RESOLVED (Batch A) |

---

## Batch A — Architecture Boundary Enforcement (Certified)

| Finding | Files Created | Files Modified | Lines Moved |
|---------|---------------|----------------|:-----------:|
| **B-001** | 8 new files | 4 modified | ~750 lines extracted |
| **B-002** | — | Included in B-001 | ~50 lines deduplicated |
| **B-003** | 2 new services | admin.routes.js | ~300 lines extracted |
| **B-005** | 3 new controllers | 3 route files | ~200 lines thinned |

### Files Created (9 new)

| File | Purpose |
|------|---------|
| `server/src/services/progress.service.js` | Continue-watching batch queries, save/get/remove progress (includes 30s MemoryCache) |
| `server/src/services/history.service.js` | Paginated history listing, recent history, clear history |
| `server/src/services/favorites.service.js` | List, toggle, check, remove favorites |
| `server/src/services/admin-user.service.js` | User CRUD (list, create, delete, reset), activity timeline, recent activity feed |
| `server/src/services/admin-content.service.js` | Content list, update, deactivate |
| `server/src/controllers/progress.controller.js` | Thin handlers: req parsing → service → ApiResponse |
| `server/src/controllers/history.controller.js` | Thin handlers: req parsing → service → ApiResponse |
| `server/src/controllers/favorites.controller.js` | Thin handlers: req parsing → service → ApiResponse |

### Files Modified (4)

| File | Change |
|------|--------|
| `server/src/routes/progress.routes.js` | ~200 lines inline logic → controller references (5 route definitions) |
| `server/src/routes/history.routes.js` | ~180 lines inline logic → controller references (3 route definitions) |
| `server/src/routes/favorites.routes.js` | ~170 lines inline logic → controller references (4 route definitions) |
| `server/src/routes/admin.routes.js` | ~300 lines extracted → AdminUserService + AdminContentService calls; imports cleaned |

### Validation

| Check | Result |
|-------|:------:|
| Module load (12 modules) | ✅ All clean |
| Test suite (52 tests) | ✅ 52/52 pass |
| Client build | ✅ Built in 4.20s |
| Code review | ✅ Passed — 1 bug found (missing Content import in stats handler) → fixed |

### Design Decisions

- All services use static methods (matching existing ContentService/AuthService pattern)
- All controllers are pure thin layers — zero business logic
- All existing route paths and middleware chains preserved
- All response formats preserved (ApiResponse.success, .paginated, .created)
- MemoryCache stays inside ProgressService (not re-exported)
- admin.routes.js imports cleaned: removed bcrypt, Content (restored for stats handler), canCreateRole

---

## Detailed Findings

### B-001 — Business Logic Inlined in Route Handlers (Architecture)

**Severity:** High
**Risk:** High
**Category:** Architecture

**Affected Files:** `admin.routes.js`, `progress.routes.js`, `history.routes.js`, `favorites.routes.js`

**Status:** ✅ CERTIFIED (Batch A)

**Remediation Summary:**
- Extracted all inline business logic into 5 dedicated service modules
- Created 3 new controllers following the existing auth/content controller pattern
- Services encapsulate data access, business rules, and caching
- Routes now define only middleware chains with controller references

**Files Changed:** 8 created, 4 modified

---

### B-002 — Duplicate Watch History Population Logic

**Severity:** Medium
**Risk:** Medium
**Category:** Duplicate Logic

**Affected Files:** `progress.routes.js`, `history.routes.js`

**Status:** ✅ CERTIFIED (Batch A — resolved as side effect of B-001 extraction)

**Remediation Summary:**
- Both progress and history now call `ProgressService` and `HistoryService` respectively
- Each service owns its data access pattern — no cross-file duplication
- Progress percentage calculation lives in each service (different context: continue-watching vs full history)

---

### B-003 — admin.routes.js is a God File

**Severity:** High
**Risk:** Medium
**Category:** God File

**Affected Files:** `admin.routes.js`

**Status:** ✅ CERTIFIED (Batch A)

**Remediation Summary:**
- User management → `AdminUserService` (CRUD, activity, recent feed)
- Content management → `AdminContentService` (list, update, deactivate)
- System, security, sessions, config, health handlers remain inline (already delegate to `SystemService`)
- admin.routes.js reduced from ~400 lines to ~150 lines of route definitions

---

### B-005 — Missing Controller Abstraction (Architecture Gap)

**Severity:** Medium
**Risk:** Medium
**Category:** Architecture

**Affected Files:** `progress.routes.js`, `history.routes.js`, `favorites.routes.js`, `admin.routes.js`

**Status:** ✅ CERTIFIED (Batch A)

**Remediation Summary:**
- Created `ProgressController`, `HistoryController`, `FavoritesController` matching the existing pattern
- admin.routes.js handlers now delegate to `AdminUserService` and `AdminContentService`
- Architecture is now consistent: all 4 files use controller/service pattern

---

### B-004 — Inconsistent Error Response Formatting

**Severity:** Medium
**Risk:** Low
**Category:** Error Consistency

**Affected Files:** `stream.routes.js`, `thumbnail.routes.js`

**Status:** ⏳ OPEN — Batch B candidate

---

### B-006 — External Source Cache Endpoints Lack Admin Authorization

**Severity:** High
**Risk:** Medium
**Category:** Authorization

**Affected Files:** `external-source.routes.js`

**Status:** ⏳ OPEN — Batch C candidate

---

### B-007 — auth.controller.js Imports Unused config

**Severity:** Low
**Risk:** Low
**Category:** Dead Import

**Affected Files:** `auth.controller.js`

**Status:** ⏳ OPEN — Batch B candidate

---

### B-008 — Health Endpoint Duplication

**Severity:** Low
**Risk:** Low
**Category:** Route Duplication

**Affected Files:** `routes/index.js`, `health.routes.js`

**Status:** ⏳ OPEN — Batch B candidate

---

### B-009 — Stream URL Template Contains Literal `:slug`

**Severity:** Medium
**Risk:** Medium
**Category:** Fragile Contract

**Affected Files:** `stream.routes.js`

**Status:** ⏳ OPEN — Batch B candidate

---

### B-010 — Fragile Route Mounting Order

**Severity:** Low
**Risk:** Low
**Category:** Mounting Fragility

**Affected Files:** `routes/index.js`

**Status:** ⏳ OPEN — Batch D candidate

---

### B-011 — Content Routes Mounted Without Prefix

**Severity:** Low
**Risk:** Low
**Category:** URL Inconsistency

**Affected Files:** `routes/index.js`

**Status:** ⏳ OPEN — Batch D candidate

---

### B-012 — thumbnail.service.js Lazy require('canvas')

**Severity:** Low
**Risk:** Low
**Category:** Dependency Risk

**Affected Files:** `thumbnail.service.js`

**Status:** ⏳ OPEN — Batch B candidate

---

### B-014 — history.routes.js Unused WATCH_HISTORY_MAX Import

**Severity:** Low
**Risk:** Low
**Category:** Dead Import

**Affected Files:** `history.routes.js` (previously, now resolved by Batch A refactor)

**Status:** ✅ RESOLVED (side effect of Batch A — history.routes.js no longer imports this)

---

## Remaining Status

| Batch | Findings | Status |
|-------|----------|:------:|
| **Batch A** | B-001, B-002, B-003, B-005 | ✅ CERTIFIED |
| **Batch B** | B-004, B-007, B-008, B-009, B-012 | ✅ CERTIFIED |
| **Batch C** | B-006 | ✅ CERTIFIED |
| **Batch D** | B-010, B-011 | ✅ CERTIFIED |
| **Resolved** | B-014 | ✅ RESOLVED (side effect) |

**13 of 13 findings certified. Phase 3 Complete ✅**

---

*End of Phase 3 Findings — 13 findings documented. 10 certified (Batch A + Batch B). 3 remaining.*
