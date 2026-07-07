# NovaStream — ChatGPT Context

> **Purpose:** Single context file for ChatGPT sessions. Upload at the start of every new conversation to continue the audit.
> **Last Updated:** July 6, 2026
> **Next Action:** Track A — Phase 8 Production 🔒 **FROZEN** (14/14 batches A+B+C). Ready for Phase 9 Scalability Audit.

---

## Instructions for ChatGPT (Auditor)

You are the **NovaStream Auditor**. Your role is to systematically audit each phase of the NovaStream streaming platform using the governance rules defined in `audit/GOVERNANCE.md`.

**Workflow for each finding:**
1. Read the finding from the current phase's `FINDINGS.md`
2. **Verify** the issue by reading the affected source files
3. **Document** root cause analysis
4. **Propose remediation** — describe exactly what code changes are needed
5. **Wait for USER APPROVAL** before implementing
6. **Implement** the approved changes
7. **Self-review** the changes for correctness
8. **Build test** — run `npx vite build` (client) or `node -e 'require(...)'` (server)
9. **Request user browser test** — tell the user what to test
10. **Certify** after user confirms the fix works
11. **Update all audit documents** — FINDINGS.md, CERTIFICATION.md, AUDIT_STATUS.md, REMEDIATION_ROADMAP.md, DECISIONS.md, CHATGPT_CONTEXT.md

**Rules to follow (from GOVERNANCE.md):**
- One finding at a time — never work on multiple findings simultaneously
- Never implement without user approval
- Never self-certify — user must confirm in browser
- Never continue after failed testing — stop and fix first
- Architecture Protection Rules are immutable (thin controllers, business logic in services, provider abstraction, etc.)
- No speculative improvements — only implement what the finding requires
- No unrelated refactoring

---

## Project Overview

NovaStream is a Netflix-style streaming platform:

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + Tailwind CSS + Framer Motion |
| **Video Player** | ArtPlayer + HLS.js (two-effect architecture, no black flash) |
| **Backend** | Express.js + Mongoose + Pino (structured logging) |
| **Database** | MongoDB Atlas (6 collections, 15+ indexes) |
| **Validation** | Zod schemas (auth, content, search) |
| **Auth** | JWT tokens + server-side sessions + bcrypt (12 rounds) |
| **Streaming** | HLS with signed JWT tokens (24h expiry, optional IP binding) |
| **Deployment** | PM2 + Docker (Nginx + Node.js multi-stage) |
| **CLI** | `novactl` — 16 sub-commands (server, user, IP, config management) |
| **External Source** | YupFlix (provider-agnostic via ContentSourceService abstraction) |
| **Subscription** | Full lifecycle management (14 service methods, 15 endpoints, ownership transfer) |
| **Admin CLI** | `npm run admin` — 6 sections (status, user, subscription, database, security, backup) |
| **Deployment** | Docker (multi-stage), PM2, Nginx (HTTPS-ready), automated deploy/release scripts |

### Key Architecture

```
Request → Middleware Stack (10 modules) → Routes (11 modules)
    → Controllers (2 modules, thin HTTP) → Services (8 modules, all business logic)
    → Models (6 Mongoose schemas)
```

- **Server:** 46+ source files in `server/src/` — 14 route modules, 10 services, 10 middleware, 8 models, 4 validators, config + utils + CLI
- **Client:** 40+ source files in `client/src/` — 16 pages, 25+ components, 7 API modules, context, hooks
- **CLI:** 2 CLIs — `novactl` (Commander.js, 16 sub-commands) + `npm run admin` (readline, 6 sections)

---

## ⚠️ Active Governance Tracks

NovaStream currently has **THREE independent governance tracks**. They must NOT be mixed.

### Track A — Full System Audit
| Field | Value |
|-------|-------|
| **Purpose** | Finding and fixing existing architecture/security/code issues |
| **Phases 1-7** | ✅ All complete and FROZEN 🔒 |
| **Certified Findings** | 88 total — Foundation (20) + Security (6) + Backend (13) + Database (10) + Streaming (10) + Frontend (14) + Performance (15) ✅
| **Informational** | 1 (ST-011 — thumbnail route intentionally unauthenticated) |
| **Open** | None — Phases 1-7 complete ✅ |
| **Next Phase** | Phase 8 — Production |
| **Governance** | Follow `GOVERNANCE.md` lifecycle for each finding |

### Track B — Full Project Implementation 🏆 COMPLETED 🔒
| Field | Value |
|-------|-------|
| **Purpose** | Build complete NovaStream platform — auth, streaming, subscription, admin, deployment |
| **Status** | ✅ **ALL PHASES COMPLETE** — Production Release Candidate v1.0.0-RC |
| **Phases** | Foundation, Auth, Content API, Frontend, Video Player, Security, Subscription System, Manager Ownership, Production Operations, Deployment Pipeline, Documentation Freeze |
| **Tracked In** | `docs/STATUS.md` — full phase-by-phase breakdown |
| **Frozen Modules 🔒** | Authentication, SubscriptionService (14 methods), Subscription Middleware, Plan Management, Admin RBAC, Audit System, Backup System |

**⚠️ Track B is COMPLETE and FROZEN.** Do not modify frozen modules without explicit approval (Audit → Proposal → Implementation → Certification). Future work resumes with Track A audit findings.

### Track C — Dynamic Provider Plugin System 🔒 FROZEN
| Field | Value |
|-------|-------|
| **Purpose** | Move NovaStream from single embedded provider to scalable multi-provider plugin system |
| **Status** | 🔒 **FROZEN** — C1 Architecture + C2 Framework Complete |
| **Phase C1** | Architecture documentation, review, and freeze ✅ 🔒 FROZEN |
| **Phase C2** | Provider Framework (ContentRegistry, BaseProvider, ProviderRegistry, ScraperQueue, ProviderManager) ✅ 🔒 FROZEN |
| **Phase C3** | YupFlix Provider Migration ⏳ NEXT |
| **Governance** | Follows Track A governance model (findings lifecycle, certification, decisions) |
| **Proposal** | `audit/phase-c-provider-system/FINDINGS.md` |
| **SDK Guide** | `audit/phase-c-provider-system/PROVIDER_DEVELOPMENT.md` — Full provider conversion guide with templates |
| **Decisions** | C-001 through C-013 — frozen baseline |

**⚠️ Track C Phases C1 + C2 are 🔒 FROZEN.** No further architecture or framework changes. Do not modify frozen decisions without an architecture amendment process. Begin Phase C3 — YupFlix Provider Migration.

> 📍 `audit/phase-c-provider-system/` tracks Track C architecture. `audit/` tracks Track A audit progress.

---

## Current Session State

| Field | Value |
|-------|-------|
| **Phase** | Phase 9 — Scalability 🟡 **Active** |
| **Last Completed** | Batch A1 (SC-014 + SC-015) — Certified ✅ |
| **Next Up** | Phase 9 Batch A2 — SC-001 (lockout state), SC-002 (stream caches), SC-003 (cache invalidation) |

### Phase 8 Production Audit — Certified

Phase 8 covered production readiness across 3 batches:

| Batch | Items | Fixes |
|-------|-------|-------|
| **A** | P8-RUNTIME-001 | TMDB timeout fix (10s), IPv4 DNS preference, sanitized error logging |
| **B** | PPR-004 → PPR-008 | DB connection retry logic (5 attempts/5s delay), health endpoint DB status, migration runner |
| **C** | PPR-009 → PPR-014 | Docker client build fix (`npm ci`), Nginx CSP + security header inheritance fix, deploy nginx config sync |

**14 findings certified. Phase 8 🔒 FROZEN.**

### Phase 9 Scalability Audit — Batch A1 Certified (June 2026)

| Finding | Severity | Resolution |
|:-------:|:--------:|:----------:|
| **SC-014** — Duplicate sync scheduler in PM2 cluster | High | MongoDB DistributedLock (`server/src/utils/distributedLock.js`). Only one worker per interval. |
| **SC-015** — No distributed sync locking mechanism | High | Atomic insert + expired takeover protocol. Owner-guarded release in `finally`. 45-min TTL. |

**2/17 findings resolved. Next: Batch A2 (SC-001, SC-002, SC-003).**

### What's Been Done So Far

**Finding F-010 — Inconsistent Error Responses (CERTIFIED)**
- **Problem:** 5 inline JSON error responses across `imageProxy` (×3) and `contentType` (×1) bypassed the standard `ApiError` + `next(err)` + `errorHandler` pattern. `unsupportedMediaType()` was missing from ApiError.
- **Fix:** Added `static unsupportedMediaType()` to `ApiError`. Converted imageProxy (3 responses) and contentType (1 response) to `next(ApiError.*())`. Left `ipBlocker` unchanged — legitimate `reason`/`expiresAt` business fields.
- **Files changed:** `server/src/utils/ApiError.js`, `server/src/middleware/imageProxy.middleware.js`, `server/src/middleware/contentType.middleware.js`
- **Decision logged:** D-010 — Convert inline error responses to ApiError pattern

**Finding F-009 — Inline require() in Admin Routes (CERTIFIED)**
- **Problem:** 9 inline `require()` calls in 7 admin route handlers (`SystemService` ×7, `mongoose` ×1, `path` ×1, `fs` ×1) instead of standard top-level imports
- **Fix:** Added `mongoose`, `path`, `fs`, `SystemService` to top-level imports. Removed all inline `require()` calls from handlers. Cleaned up redundant inline requires in `/logs` handler too.
- **Scope:** F-009 only — no routes, APIs, business logic, or permissions modified.
- **Files changed:** `server/src/routes/admin.routes.js`
- **Decision logged:** D-009 — Move inline require() calls to top-level imports

**Finding F-008 — controllers/README.md is Dead Code (CERTIFIED)**
- **Problem:** A stale planning document inside `server/src/controllers/` described what controllers *should do*, listed 5 controllers as "To be implemented" (2 already existed), and duplicated pattern info already covered elsewhere
- **Fix:** Deleted `server/src/controllers/README.md` (Option A). No move, no replacement, no architecture changes.
- **Files changed:** `server/src/controllers/README.md` (deleted)
- **Decision logged:** D-008 — Delete stale controllers/README.md

**Finding F-007 — Defensive Trim Duplication (CERTIFIED)**
- **Problem:** 6 copies of structurally similar trim logic duplicated across 3 route files (watch history defensive trim ×3, max enforcement ×1, favorites trim ×1, favorites cap enforcement ×1)
- **Fix:** Added `trimWatchHistory()` and `trimWatchlist()` instance methods to User model. All 6 inline blocks replaced with explicit method calls. Pattern: `modify array → call trim method → save`.
- **Rules followed:** No pre-save hooks, no automatic trimming, no schema changes, no hidden logic.
- **Files changed:** `server/src/models/User.model.js`, `server/src/routes/progress.routes.js`, `server/src/routes/history.routes.js`, `server/src/routes/favorites.routes.js`
- **Decision logged:** D-007 — Extract duplicate trim logic into User model methods

**Finding F-006 — Magic Numbers (CERTIFIED)**
- **Problem:** Undocumented numeric constants (90, 210, 200) scattered inline across 3 route files with no named constants
- **Fix:** Created `server/src/config/constants.js` with 5 named constants (WATCH_HISTORY_MAX, WATCH_HISTORY_TRIM_THRESHOLD, FAVORITES_MAX, FAVORITES_TRIM_THRESHOLD, CONTINUE_WATCHING_MIN_REMAINING_SEC). Replaced all ~9 inline occurrences in progress.routes.js, history.routes.js, favorites.routes.js.
- **Scope:** F-006 only — no duplicate logic cleanup, no helper functions, no pagination constants (20, 5). Those belong to F-007.
- **Files changed:** `server/src/config/constants.js` (new), `server/src/routes/progress.routes.js`, `server/src/routes/history.routes.js`, `server/src/routes/favorites.routes.js`
- **Decision logged:** D-006 — Extract magic numbers into named constants

**Finding F-004 — Duplicate Password Hashing Strategies (CERTIFIED)**
- **Problem:** Three inconsistent hashing strategies — `pre('save')` hook (12 rounds), admin route pre-hashing (10 rounds, then double-hashed by hook), CLI (12 rounds, bypassed Mongoose)
- **Fix:** Removed `pre('save')` hook. Made `User.createUser()` the canonical method with explicit `bcrypt.hash(password, 12)`. Admin routes now delegate to `createUser()` instead of manual hashing. Password reset upgraded from 10→12 rounds. Added cache-busting `_t` timestamp to all GET requests (prevented stale browser cache after user deletion).
- **Files changed:** `server/src/models/User.model.js`, `server/src/routes/admin.routes.js`, `client/src/api/client.js`
- **Decision logged:** D-003 — Remove pre('save') hook, make createUser() canonical

**Finding F-005 — Duplicate Validation: Zod vs Inline in Admin Routes (CERTIFIED)**
- **Problem:** `POST /api/admin/users` had 12 lines of inline validation duplicating the Zod `createUserSchema` in `auth.validator.js`
- **Fix:** Wired `validate(createUserSchema)` as route middleware. Removed inline validation. Handler uses `req.validatedBody` for validated fields. `displayName` kept from `req.body` (not validated).
- **Files changed:** `server/src/routes/admin.routes.js`
- **Decision logged:** D-004 — Wire validate() middleware, remove inline validation

**Admin User Created**
- Username: `administrator`
- Password: `admin399125`
- Role: admin
- Use this to login and test all findings

---

## Audit Files Structure

```
audit/
├── GOVERNANCE.md            — Audit rules, lifecycle, classifications (READ FIRST)
├── PROJECT_PRINCIPLES.md    — Permanent engineering philosophy
├── MASTER_INDEX.md          — Index of all 10 phases with file scope
├── AUDIT_STATUS.md          — Live dashboard (update after each finding)
├── REMEDIATION_ROADMAP.md   — All findings with priority/effort/dependencies
├── DECISIONS.md             — Architectural decisions log (D-001, D-002, D-003, D-004)
├── CHATGPT_CONTEXT.md       ← THIS FILE — upload to ChatGPT each session
├── templates/
│   ├── FINDINGS.md          — Finding entry template
│   └── CERTIFICATION.md     — Phase certification template
├── phase-01-foundation/
│   ├── FINDINGS.md          — 20 findings (F-001 through F-020)
│   └── CERTIFICATION.md     — Phase 1 certification record
├── phase-02-security/
├── phase-03-backend/
... (phases 03-10 follow same pattern, all empty until started)
```

> 📍 `docs/STATUS.md` tracks Track B (implementation) progress. `audit/` tracks Track A (audit) progress. They are the **only two tracks** — do not create a third.

---

## Phase 1 — Foundation: All 20 Findings

| ID | Category | Severity | Risk | Title | Status |
|----|----------|:--------:|:----:|-------|:------:|
| F-001 | Testing | Critical | System | No automated tests exist | ✅ CERTIFIED (Batch Foundation) |
| F-002 | Frontend | Critical | High | 401 interceptor causes full page reload | ✅ CERTIFIED (Batch Foundation) |
| F-003 | Backend | High | High | Content routes global auth creates fragile ordering | ✅ CERTIFIED (Batch Foundation) |
| F-004 | Security | High | Medium | Duplicate password hashing strategies | ✅ CERTIFIED |
| F-005 | Code Quality | High | Medium | Duplicate validation: Zod vs inline in admin routes | ✅ CERTIFIED |
| F-006 | Code Quality | High | Medium | Magic numbers scattered without named constants | ✅ CERTIFIED |
| F-007 | Code Quality | Medium | Medium | Defensive trim logic duplicated across 3 route files | ✅ CERTIFIED |
| F-008 | Backend | Medium | Low | `controllers/README.md` is dead/placeholder code | ✅ CERTIFIED |
| F-009 | Backend | Medium | Low | Inline `require()` calls in admin route handlers | ✅ CERTIFIED |
| F-010 | API | Medium | Medium | Inconsistent error responses bypass standard format | ✅ CERTIFIED |
| F-011 | Backend | Medium | Medium | No global request timeout middleware | ✅ CERTIFIED |
| F-012 | Frontend | Medium | High | No React Error Boundaries (crash → blank page) | ✅ CERTIFIED |
| F-013 | Security | Medium | Medium | Segment filename lacks whitelist validation | ✅ CERTIFIED (Final Batch) |
| F-014 | Backend | Medium | Low | `pino-pretty` transport could load in production | ✅ CERTIFIED (Batch A+B) |
| F-015 | Code Quality | Low | Low | CLI creates new connection per command | ✅ CERTIFIED (Batch A+B) |
| F-016 | Documentation | Low | Low | No OpenAPI/Swagger API documentation | ✅ CERTIFIED (Batch A+B) |
| F-017 | Code Quality | Low | Low | TMDB image URLs constructed in multiple places | ✅ CERTIFIED (Batch A+B) |
| F-018 | Backend | Low | Low | Admin logs endpoint hardcodes PM2 log path | ✅ CERTIFIED (Batch A+B) |
| F-019 | Architecture | Low | Low | No graceful degradation when external source is down | ✅ CERTIFIED (Final Batch) |
| F-020 | Backend | Low | Low | Auth middleware sets both `_id` and `id` on req.user | ✅ CERTIFIED (Final Batch) |

**Note:** These are Track A (audit) findings. Track B (implementation) is complete — see `docs/STATUS.md` for full breakdown.

---

## Key Architectural Decisions

| ID | Decision | Summary |
|----|----------|---------|
| D-001 | Audit Framework Creation | Created `audit/` with 10 phases, governance, and standardized workflows |
| D-002 | Framework Finalization & Lock | Applied 12 governance refinements. Framework is now locked — no structural changes |
| D-003 | Remove `pre('save')` Hook | Removed Mongoose hook causing double-hashing. Made `User.createUser()` canonical. Hash explicitly with bcrypt at 12 rounds everywhere |
| D-004 | Wire `validate()` Middleware | Wired `validate(createUserSchema)` to POST /admin/users. Removed 12-line inline validation. Single source of truth via Zod |
| D-005 | Role System | Created role constants, permission matrix, middleware updates, backward-compatible role normalization |
| D-006 | Extract Magic Numbers | Created constants.js with 5 named constants, replaced ~9 inline occurrences across 3 route files |
| D-007 | Extract Duplicate Trim Logic | Added trimWatchHistory() + trimWatchlist() to User model, replaced 6 inline blocks across 3 route files |
| D-008 | Delete Stale controllers/README.md | Deleted dead/placeholder planning document from source code directory |
| D-009 | Move Inline require() Calls | Moved 9 inline require() calls to top-level imports in admin.routes.js |
| D-010 | Convert Inline Error Responses | Added unsupportedMediaType(), converted imageProxy + contentType to ApiError pattern |
| D-011 | Batch A+B (F-014 → F-018) | 5 low-risk findings: pino-pretty, CLI connections, OpenAPI docs, TMDB images, PM2 log path |
| D-012 | Batch Foundation (F-001 → F-003) | 3 high-severity findings: test framework, 401 redirect, route ordering |
| D-013 | Request Timeout Middleware (F-011) | Added global timeout middleware (30s/120s) using JS timer, no new dependencies |
| D-014 | React Error Boundary (F-012) | Added ErrorBoundary class component wrapping Routes, fallback with retry |
| D-015 | Final Batch (F-013 + F-019 + F-020) | Segment whitelist, external URL validation, auth _id canonicalization |
| D-016 | Batch 1 Security (S-001 + S-004 + S-005) | JWT algorithm constraint, IP binding always, 404 path sanitized |
| D-017 | S-002 Token Refresh Fix | Removed ignoreExpiration, added session validity check, 9 new tests |

---

## Governance Summary (Full details in GOVERNANCE.md)

**Lifecycle:** DISCOVER → VERIFY → ROOT CAUSE ANALYSIS → DOCUMENT → PROPOSE REMEDIATION → USER APPROVAL → IMPLEMENT → SELF REVIEW → BUILD TEST → USER BROWSER TEST → REGRESSION TEST → CERTIFICATION → CLOSED

**Statuses (12):** OPEN → VERIFIED → APPROVED → IMPLEMENTING → IMPLEMENTED → BUILD PASSED → WAITING USER TEST → REGRESSION PASSED → CERTIFIED → CLOSED. Branches: REJECTED, WONT_FIX

**Categories (14):** Architecture, Security, Backend, API, Database, Streaming, Frontend, Performance, Accessibility, UX, DevOps, Code Quality, Testing, Documentation

**Key Rules:**
- One finding at a time — never work on multiple findings simultaneously
- Never implement without user approval
- Never self-certify — user must confirm in browser
- Never continue after failed testing — stop and fix first
- 13 Architecture Protection Rules (thin controllers, business logic in services, no circular deps, provider abstraction, etc.)
- 9 Audit Restrictions (no feature creep, no unrelated refactoring, no dependency upgrades without justification)

---

## Engineering Principles (Full details in PROJECT_PRINCIPLES.md)

1. Provider-Agnostic Architecture
2. Security First
3. Maintainability Before Cleverness
4. Production-Ready Code Only
5. Thin Controllers (zero business logic)
6. Business Logic in Services
7. Consistent API Contracts
8. Scalable Design (DB sessions, per-IP rate limiting, explicit caching)
9. Performance Conscious (no N+1 queries, monitored bundle size)
10. No Hidden Technical Debt
11. Testable Code
12. Documentation-Driven Changes
13. Minimal Complexity
14. Long-Term Maintainability
15. No Vendor Lock-In

---

## How To Continue

1. **Upload this file** to a new ChatGPT conversation
2. **Read** `audit/GOVERNANCE.md` and `audit/MASTER_INDEX.md` for context
3. **Read** `audit/phase-01-foundation/FINDINGS.md` for the full details of all 20 findings
4. **Start with Phase 3 — Backend** (Phase 1 + Phase 2 complete — 26/26 findings across both phases)
5. Each finding must go through the full lifecycle: VERIFY → PROPOSE → GET APPROVAL → IMPLEMENT → BUILD TEST → USER TEST → CERTIFY → DOCUMENT

---

## Quick Commands

```bash
# Development
cd ~/Desktop/Novastream && npm run dev         # Start server + client concurrently

# Build
cd ~/Desktop/Novastream/client && npx vite build  # Client build check

# Admin CLI
cd ~/Desktop/Novastream/server && npm run admin   # Interactive admin menu

# Security
cd ~/Desktop/Novastream/server && npm run security:check  # 12-point audit

# Production check
cd ~/Desktop/Novastream && node scripts/production-check.js

# Release
cd ~/Desktop/Novastream && node scripts/release.js patch

# Deploy
cd ~/Desktop/Novastream && node scripts/deploy.js

# Admin login
# Username: administrator
# Password: admin399125
```

## Key Commands Reference

```bash
npm run build              # Build client (Vite)
npm run start:prod         # Build + start production server
npm run pm2:start          # Start with PM2
npm run pm2:restart        # Restart PM2
npm run pm2:status         # Check PM2 status
npm run security:check     # Server security audit
npm run production:check   # Pre-flight production check
node scripts/deploy.js     # Automated deployment
node scripts/release.js    # Create a release (patch/minor/major)
```

---

## Files to Read to Continue

- `docs/STATUS.md` — Full project status tracker (all phases)
- `docs/AUDIT_INDEX.md` — Complete file-by-file project audit
- `DEPLOYMENT.md` — Deployment guide
- `CHANGELOG.md` — Version history
- `audit/GOVERNANCE.md` — Full governance rules
- `audit/MASTER_INDEX.md` — Phase scope and file index
- `audit/phase-01-foundation/FINDINGS.md` — All 20 findings with full details
- `audit/AUDIT_STATUS.md` — Current status dashboard
- `audit/REMEDIATION_ROADMAP.md` — Priority-ordered remediation plan
- `audit/DECISIONS.md` — All decisions made so far
- `audit/PROJECT_PRINCIPLES.md` — Engineering philosophy

*End of ChatGPT Context — upload this file to continue the NovaStream audit.*
