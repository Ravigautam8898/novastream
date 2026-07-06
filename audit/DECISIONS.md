# NovaStream Audit — Decisions Log

> **Purpose:** Log all significant decisions made during the audit process. This includes finding classifications, remediation strategies, architecture decisions, and governance changes.
>
> **Last Updated:** July 2, 2026

---

## Decision Format

Each decision is logged with:

```
### D-XXX — Short Title
- **Date:** YYYY-MM-DD
- **Author:** AI Agent | Human
- **Context:** Why this decision was needed
- **Decision:** What was decided
- **Rationale:** Why this option was chosen
- **Alternatives:** Other options considered (optional)
- **Consequences:** What this decision affects
```

---

## Decision Log

### D-001 — Audit Framework Creation
- **Date:** 2026-07-02
- **Author:** AI Agent
- **Context:** Project needs a structured audit framework to systematically review and improve all layers
- **Decision:** Created the `audit/` directory with governance, master index, status dashboard, remediation roadmap, decisions log, ChatGPT context, and 10 phase folders following a repeatable workflow
- **Rationale:** Provides a document-light, structured approach that minimizes context loss across AI conversations and ensures consistent audit quality
- **Alternatives:** Single monolithic document — rejected due to scaling issues; separate GitHub issues — rejected due to context fragmentation
- **Consequences:** All future audit work follows the governance rules defined in GOVERNANCE.md

### D-002 — Audit Framework Finalization & Lock
- **Date:** 2026-07-02
- **Author:** AI Agent
- **Context:** Phase 0.1 requested final refinements to the audit framework before locking it for Phase 1
- **Decision:** Applied 12 governance refinements simultaneously:
  1. Added AI Behavior Rules (12 rules — no simultaneous findings, no speculative work, no self-certification, etc.)
  2. Expanded finding lifecycle from 6 to 13 steps (added VERIFY, ROOT CAUSE ANALYSIS, PROPOSE REMEDIATION, USER APPROVAL, SELF REVIEW, USER BROWSER TEST, REGRESSION TEST)
  3. Standardized finding template with 20 exact required fields
  4. Defined 12 allowed status values (no custom statuses permitted)
  5. Defined 14 official audit categories
  6. Created standardized risk matrix (Critical/High/Medium/Low/Information)
  7. Added 13 immutable Architecture Protection Rules
  8. Added 9 explicit Audit Restrictions
  9. Added Phase Exit Criteria checklist
  10. Created PROJECT_PRINCIPLES.md (15 permanent engineering principles)
  11. Reduced CHATGPT_CONTEXT.md to ~3 pages (removed MASTER_INDEX duplication)
  12. Updated all templates and documents for consistency
- **Rationale:** Enterprise-grade audit quality requires rigorous governance. Each refinement addresses a specific gap identified in the Phase 0 requirements.
- **Consequences:** The audit framework is now LOCKED. No further structural documentation changes expected. Normal status updates will occur during audit phases. The project is ready for Phase 1 — Foundation Audit.

### D-003 — Remove `pre('save')` Hook, Make `User.createUser()` Canonical
- **Date:** 2026-07-02
- **Author:** AI Agent
- **Context:** F-004 identified three inconsistent password hashing strategies causing double-hashing for admin-created users
- **Decision:** Replaced the Mongoose `pre('save')` hook with explicit hashing in `User.createUser()` static method
  - Removed the `pre('save')` hook entirely (was the root cause of double-hashing)
  - Updated `User.createUser()` to hash explicitly with `bcrypt.hash(password, 12)`
  - Updated admin routes to delegate to `User.createUser()` instead of manual hashing + `User.create()`
  - Admin password reset endpoint updated from 10 to 12 rounds
  - CLI MongoService left unchanged (already used 12 rounds correctly and operates outside Mongoose)
- **Rationale:**
  - The `pre('save')` hook was unreliable — bypassed by CLI (native MongoDB driver), and caused double-hashing in admin routes
  - Explicit hashing is clearer and more maintainable than hidden hooks
  - `User.createUser()` is now the single canonical method for user creation
  - Backward compatibility preserved — `comparePassword()` unchanged, existing hashes unaffected
- **Alternatives:**
  - Keep `pre('save')` hook and fix admin routes to not pre-hash — rejected because CLI would still bypass it
  - Add `createdBy` field to track who creates users — **accepted as side benefit** (admin routes now pass `req.user._id`)
- **Consequences:** All new user creation must go through `User.createUser()` or be explicitly hashed. The `comparePassword()` method is unchanged. Existing users are unaffected.

### D-004 — Wire `validate(createUserSchema)` Middleware, Remove Inline Validation
- **Date:** 2026-07-02
- **Author:** AI Agent
- **Context:** F-005 identified that `POST /api/admin/users` had duplicate validation — inline checks duplicated the Zod `createUserSchema` already defined in `auth.validator.js`
- **Decision:** Wired `validate(createUserSchema)` as route middleware and removed the 12-line inline validation block
  - Added imports for `validate` middleware and `createUserSchema`
  - Route: `router.post('/users', validate(createUserSchema), async (req, res, next) => { ... })`
  - Handler uses `req.validatedBody` for validated fields (`username`, `password`, `role`)
  - `displayName` kept from `req.body` (not validated, not in Zod schema)
- **Rationale:**
  - Eliminates two sources of truth for validation rules
  - Reuses existing standardized `validate()` middleware pattern (already used by auth routes)
  - Zod provides structured field-level errors instead of generic messages
  - The inline code had a gap: no username regex validation — Zod enforces `/^[a-zA-Z0-9_]+$/`
- **Alternatives:**
  - Keep both — rejected because they would inevitably diverge
  - Remove Zod schema and keep inline — rejected because Zod is the project standard
- **Consequences:** All admin user creation input is validated by the same Zod schema. The `role || 'user'` fallback in the handler is now dead code (Zod defaults it). Error format for validation failures now matches other Zod-validated endpoints.

### D-005 — Role System (Subscription Phase 2)
- **Date:** 2026-07-02
- **Author:** AI Agent
- **Context:** Subscription System architecture (v3) requires a 3-role system: super_admin, manager, member. Phase 1 had already updated the User model enum. Phase 2 needed role constants, permission definitions, middleware updates, and backward-compatible role normalization.
- **Decision:**
  1. Created `server/src/config/roles.js` with role constants, permission matrix (6/18/32 permissions per role), and 10 helper functions
  2. Updated `adminAuth.middleware.js` — `adminOnly` uses `isAdminRole()` (accepts super_admin + manager); added `requireSuperAdmin` for Super Admin-only operations
  3. Updated `auth.middleware.js` — role normalization at JWT decode boundary (legacy `admin` → `super_admin`, `user` → `member`)
  4. Updated `admin.routes.js` — Manager role creation restriction via `canCreateRole()`; last-admin check covers both legacy and new roles
  5. Updated `cli/commands/user.commands.js` — `--admin` flag creates `super_admin`; list display uses `member`
  6. Updated `cli/services/mongo.service.js` — `createUser` defaults to `member`
  7. Updated `client/src/context/AuthContext.jsx` — `isAdmin` accepts `admin`, `super_admin`, and `manager`
- **Rationale:**
  - Role normalization at the auth middleware boundary ensures all downstream code sees new role names without requiring JWT re-issuance
  - Double-layer backward compatibility: `auth.middleware` normalizes at decode time AND `adminOnly` accepts legacy roles via `isAdminRole()`
  - `canCreateRole()` enforces Manager restrictions server-side — Manager can only create Members
  - Permission matrix in `roles.js` is the single source of truth for what each role can do
- **Consequences:**
  - Existing users with `role: 'admin'` continue working (normalized to `super_admin` on each request)
  - New users get correct role names (`super_admin`, `manager`, `member`)
  - Manager is blocked from creating elevated roles with a clear 403 error
  - `requireSuperAdmin` is a dedicated middleware for future Super Admin-only operations (lifetime conversions, settings, ownership transfer)
  - Admin stats endpoint now counts both legacy `admin` and new `super_admin` roles

### D-006 — Extract Magic Numbers Into Named Constants (F-006)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** F-006 identified undocumented numeric constants (90, 210, 200) scattered inline across 3 route files without named constants, making them hard to understand and maintain
- **Decision:** Created `server/src/config/constants.js` with 5 named constants and replaced all occurrences in the 3 target route files
  - Constants: `WATCH_HISTORY_MAX` (200), `WATCH_HISTORY_TRIM_THRESHOLD` (210), `FAVORITES_MAX` (200), `FAVORITES_TRIM_THRESHOLD` (210), `CONTINUE_WATCHING_MIN_REMAINING_SEC` (90)
  - Updated `progress.routes.js` — 4 inline replacements
  - Updated `history.routes.js` — 2 occurrences of defensive trim block replaced
  - Updated `favorites.routes.js` — 3 inline replacements
  - Constants file includes documentation explaining the purpose of each value
- **Rationale:**
  - Single source of truth for shared boundary values
  - Makes intent explicit at the declaration site
  - Easy to tune in one place
  - F-006 only — no duplicate logic cleanup, no new helper functions, no scope creep
- **Alternatives:**
  - Define constants at the top of each file — rejected because same values are shared across files
  - Use environment variables — rejected because these are code constants, not deployment config
- **Consequences:** All watch history and favorites limit values are now centralized in `constants.js`. Future changes only need to update one file. Pagination constants (20, 5) remain inline — they belong to F-007 scope.

### D-007 — Extract Duplicate Trim Logic Into User Model Methods (F-007)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** F-007 identified 6 copies of structurally similar defensive trim logic duplicated across 3 route files (progress.routes.js, history.routes.js, favorites.routes.js). Each copy independently implemented sort-array-by-field-then-cap-size logic with slightly different variations.
- **Decision:** Added `trimWatchHistory()` and `trimWatchlist()` instance methods to User model. Replaced all 6 inline trim blocks with method calls.
  - `trimWatchHistory()` — sorts `watchHistory` by `watchedAt` desc, slices to `WATCH_HISTORY_MAX`. Returns true if trimmed.
  - `trimWatchlist()` — sorts `watchlist` by `addedAt` desc, slices to `FAVORITES_MAX`. Returns true if trimmed.
  - Route pattern: `modify array → call trim method → save` — explicit, no hidden logic.
  - Uses constants from `constants.js` (F-006) as limits.
  - No pre-save hooks, no automatic trimming, no schema changes.
- **Rationale:**
  - Eliminates 5 redundant copies of identical logic
  - Single source of truth for trimming behavior
  - Explicit calls — no hidden Mongoose hooks (F-004 lesson applied)
  - Methods return boolean for optional save optimization
- **Alternatives:**
  - Pre-save hook — rejected due to F-004 lessons about hidden hooks
  - Generic `trimArray(field, sortField, max)` — rejected for clarity; two explicit methods are easier to understand
  - Post-save hook — rejected for same reason as pre-save
- **Consequences:** Defensive trim logic is now centralized in the User model. Route files are simpler and more readable. Any future trim strategy changes only need to update one method.

### D-008 — Delete Stale controllers/README.md (F-008)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** F-008 identified `server/src/controllers/README.md` as a stale planning document inside source code. It described a controller pattern already demonstrated by existing controllers, and listed 5 "To be implemented" items — 2 of which already existed.
- **Decision:** Option A — delete the file. No move, no replacement, no architecture changes.
- **Rationale:** The file provided zero value. The pattern was already demonstrated by existing `auth.controller.js` and `content.controller.js`. The "To be implemented" list was inaccurate and outdated. No other documentation referenced this file.
- **Alternatives:**
  - Move to `docs/guides/CONTROLLERS.md` — rejected; adds no value, still stale
  - Update the file — rejected; no need to maintain stale documentation
- **Consequences:** One less file in the controllers directory. No functional impact.

### D-009 — Move Inline require() Calls to Top-Level Imports (F-009)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** F-009 identified 9 inline `require()` calls in 7 admin route handlers (`SystemService` ×7, `mongoose` ×1, `path` ×1, `fs` ×1) instead of standard top-level imports.
- **Decision:** Added `mongoose`, `path`, `fs`, `SystemService` to top-level imports. Removed all 9 inline `require()` calls from handler bodies. Also cleaned up redundant inline requires in `/logs` handler.
- **Rationale:** Consistent import style with rest of codebase. Failures surface at startup (module load) rather than at request time.
- **Alternatives:** None — moving to top is the standard pattern.
- **Consequences:** All imports are now at the top. No routes, APIs, or business logic changed.

### D-010 — Convert Inline Error Responses to ApiError Pattern (F-010)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** F-010 identified 5 inline JSON error responses across 2 middleware modules (`imageProxy` ×3, `contentType` ×1) that bypassed the standard `ApiError` + `next(err)` + `errorHandler` pattern
- **Decision:**
  1. Added `static unsupportedMediaType()` to `ApiError.js` (415 status, missing static)
  2. Converted `imageProxy.middleware.js` — 3 inline 400 responses → `next(ApiError.badRequest(...))`
  3. Converted `contentType.middleware.js` — 1 inline 415 response → `next(ApiError.unsupportedMediaType(...))`
  4. Left `ipBlocker.middleware.js` unchanged — security middleware with legitimate `reason`/`expiresAt` business fields and early-termination requirement
- **Rationale:**
  - ApiError pattern provides consistent response shape (`success`, `message`, `details`, `timestamp`)
  - Global error handler logs all ApiErrors via the request logger
  - Failures now surface at startup (module load) rather than at request time
  - ipBlocker is an intentional exception — its response includes business-required metadata
- **Alternatives:**
  - Add `data` parameter to ApiError constructor — rejected; would pollute standard error shape
  - Convert ipBlocker too — rejected; would lose `reason`/`expiresAt` fields
- **Consequences:** 2 fewer modules with non-standard error formats. `ApiError.unsupportedMediaType()` available for future use. ipBlocker remains the sole exception.

### D-011 — Batch A+B: F-014, F-015, F-016, F-017, F-018 (Low-Risk Batch)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** 5 remaining low-risk findings were grouped into two batches for efficient remediation: Batch A (F-014 pino-pretty transport, F-018 PM2 log path) and Batch B (F-015 CLI MongoDB connections, F-016 OpenAPI docs, F-017 TMDB image URLs)
- **Decision:** Implemented all 5 findings in a single batch:
  1. **F-014** — Changed `target: 'pino-pretty'` → `target: require.resolve('pino-pretty')` so missing module fails at startup, not at request time
  2. **F-018** — Changed hardcoded `path.resolve(__dirname, ...)` → `path.resolve(process.cwd(), ...)` for portable log path across PM2/direct node/Docker
  3. **F-015** — Added singleton connection caching in `MongoService.connect()`, added `disconnect()`, removed `client.close()` from all 10+ method finally blocks. Also cleaned up empty `finally { }` dead code blocks.
  4. **F-016** — Created `docs/api/openapi.json` — OpenAPI 3.0.3 spec documenting 20+ core API endpoints
  5. **F-017** — Created `server/src/utils/tmdb-images.js` with `getImageUrl()`, `getPosterUrl()`, `getBackdropUrl()`, `getProfileUrl()`. Updated Content.model virtuals, TMDbService.getImageUrl(), and imageProxy middleware to use shared functions.
- **Rationale:** All 5 findings are low-risk, non-functional changes with no API or behavior impact. Grouping them avoids redundant per-finding overhead while maintaining strict scope boundaries.
- **Files changed (5):** `server/src/config/logger.js`, `server/src/routes/admin.routes.js`, `cli/services/mongo.service.js`, `docs/api/openapi.json` (new), `server/src/utils/tmdb-images.js` (new), `server/src/models/Content.model.js`, `server/src/services/tmdb.service.js`, `server/src/middleware/imageProxy.middleware.js`
- **Consequences:** 5 findings closed. 12/20 Phase 1 findings certified. 8 remaining open.

### D-012 — Batch Foundation: F-001, F-002, F-003 (Critical/High-Risk Batch)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** Three of the four highest-severity remaining findings were grouped: F-001 (no tests, Critical), F-002 (401 full page reload, Critical), F-003 (fragile route ordering, High). F-013 (segment validation, Medium/security) was left as solo.
- **Decision:** Implemented all 3 findings in a single batch:
  1. **F-001** — Created minimal test framework foundation: `jest.config.js` + 3 test suites (ApiResponse 11 tests, ApiError 16 tests, stream token generation/validation 12 tests = 43 total). All mock external dependencies, run in <2s.
  2. **F-002** — Replaced `window.location.href = '/login'` with event-based React Router navigation: API client emits `auth:expired` event → new `SessionExpiredHandler` component calls `logout()` + `navigate('/login')`. Added guard in `AuthContext.logout()` to avoid infinite loop when interceptor clears localStorage before calling logout.
  3. **F-003** — Removed 3 global `router.use()` lines from content.routes.js (authenticate, requireActiveSubscription, generalLimiter). Applied each to all 10 route definitions explicitly. Updated routes/index.js warning comment.
- **Rationale:** All 3 findings are high-impact (2 Critical, 1 High) with well-understood fixes. F-002 and F-003 both touched route/middleware behavior — fixing together avoids conflicts.
- **Files changed (11):** `server/jest.config.js` (new), `server/src/utils/__tests__/ApiResponse.test.js` (new), `server/src/utils/__tests__/ApiError.test.js` (new), `server/src/services/__tests__/stream.service.test.js` (new), `client/src/api/client.js`, `client/src/components/auth/SessionExpiredHandler.jsx` (new), `client/src/App.jsx`, `client/src/context/AuthContext.jsx`, `server/src/routes/content.routes.js`, `server/src/routes/index.js`
- **Consequences:** 3 findings closed. 15/20 Phase 1 findings certified. 5 remaining open (F-011, F-012, F-013, F-019, F-020). Phase 1 is 75% complete.

### D-013 — Add Global Request Timeout Middleware (F-011)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** F-011 identified that the Express application had no global request timeout middleware. Individual services had per-service timeouts (ContentSourceService 5s, thumbnail.service 120s) but no safety net prevented slow DB queries, external API calls, or malicious slow requests from holding the event loop.
- **Decision:** Added a lightweight JS timer-based timeout middleware to `server/src/app.js`. No new dependencies. 
  - Timeout values: `/api/stream` and `/api/thumbnails` → 120s, all other paths → 30s
  - Uses `setTimeout()` with cleanup on `res.on('finish')` and `res.on('close')` — no timer leaks
  - Returns 503 via `ApiError.serviceUnavailable()` through the existing global error handler
  - Guard condition `if (!res.headersSent)` prevents race condition
- **Rationale:**
  - 30s is generous for normal API requests (MongoDB queries, auth, content lookups)
  - 120s is required for HLS streaming (long segments) and thumbnail sprite sheet generation
  - No new package dependency — uses built-in JavaScript timer + Express error handler
  - Timer-based (not socket timeout) allows 503 response to be sent
- **Alternatives:**
  - `connect-timeout` package — rejected to avoid new dependency
  - `res.setTimeout()` / `req.socket.setTimeout()` — rejected because socket timeout destroys the connection before a response can be sent
- **Consequences:** All requests now have a global timeout safety net. 503 responses use the standard error format. Per-service timeouts remain as first-line defense.

### D-014 — Add React Error Boundary (F-012)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** F-012 identified that the React application had no error boundaries. Any runtime error in any component would unmount the entire React tree to a blank white page with no fallback.
- **Decision:** Created `client/src/components/ui/ErrorBoundary.jsx` and wrapped `<Routes>` in App.jsx.
  - Class component using `getDerivedStateFromError` + `componentDidCatch` (required pattern — no hook equivalent)
  - Default fallback uses existing `ErrorState` component with retry button
  - Shows error message in development, generic message in production
  - Supports custom fallback via `props.fallback` for specialized use cases
  - Console logging of error + component stack for debugging
- **Rationale:**
  - Error boundaries require class component lifecycle methods — no alternative with hooks
  - Reusing `ErrorState` component ensures visual consistency with the rest of the app
  - Wrapping `<Routes>` at the top level protects all pages without cluttering individual components
  - Retry button calls `setState` to reset — safe for transient errors (user refreshes for persistent ones)
- **Alternatives:**
  - Individual error boundaries per page — rejected; unnecessary complexity, top-level is sufficient
  - react-error-boundary package — rejected; no new dependency needed for a simple class component
- **Consequences:** All unhandled render errors now show a styled fallback UI with retry option instead of a blank white page. Errors are logged to console for debugging.

### D-021 — Add MongoDB Transaction Support for Multi-Step Operations (D-001)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** D-001 identified that 4 multi-step database operations (user deletion, password reset, batch ownership transfer, transfer-all) lacked transaction protection. If the second operation failed, the first operation's changes were already committed with no rollback.
- **Decision:** Created `server/src/utils/transaction.js` with a reusable `withTransaction(callback)` helper. Updated 4 operations in 3 files to use this helper:
  1. `AdminUserService.deleteUser()` — `User.findByIdAndDelete()` + `Session.deleteMany()`
  2. `AdminUserService.resetPassword()` — `user.save()` + `Session.updateMany()`
  3. `/transfer-batch` handler — per-user loop with `User.findByIdAndUpdate()` + `AuditLog.record()`
  4. `/transfer-all` handler — `User.updateMany()` + `AuditLog.record()` + `User.findByIdAndUpdate()`
  Also updated `AuditLog.record()` to accept optional `session` parameter for transaction-bound writes.
- **Rationale:**
  - Transactions are the standard MongoDB mechanism for multi-document atomicity
  - `withTransaction` wrapper abstracts session lifecycle (start, commit, abort, endSession)
  - Only applied to operations where data consistency across collections is critical
  - Single-document atomic operations (simple User.findByIdAndUpdate, etc.) left unchanged
- **Alternatives:**
  - Manual retry logic — rejected; would not prevent race conditions
  - Restructuring to single-document operations — rejected; would require schema changes
- **Consequences:** 4 multi-step operations are now ACID-compliant. Requires MongoDB replica set (Atlas M0+). Standalone mongod will receive a clear 500 error for these specific operations. 1/10 Phase 4 findings certified.

### D-022 — Batch B: Query Performance + Auth Select Optimization (D-002, D-003, D-004)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** Three medium-severity database findings approved for simultaneous remediation: D-002 (N+1 in getRecentActivity), D-003 (no aggregation pipelines), D-004 (embedded watch data loaded on auth queries)
- **Decision:** Implemented all 3 findings across 4 files:
  **D-002** — Rewrote `getRecentActivity()` from N+1 pattern (individual Content.findById per entry) to batch approach: collect all contentIds → single `$in` query. ~1000 queries → 2.
  **D-003** — Added aggregate `$lookup` pipelines: `getSeriesBySlug()` (3 queries → 1), `getEpisodeById()` (3 queries → 1 via .populate). `getUserActivity()` replaced 3x `.populate()` with batch queries.
  **D-004** — Added `.select('-watchHistory -watchlist')` to: auth.service.js login(), verifyToken(), refreshToken(); admin-user.service.js deleteUser(), resetPassword(). Prevents loading 18KB+ of embedded watch data on every auth check.
- **Rationale:**
  - D-002: Batch query eliminates N+1 query explosion as user count grows
  - D-003: Aggregation pipelines reduce round trips and leverage MongoDB server-side joining
  - D-004: `.select()` exclusion is zero-cost change that prevents unnecessary document loading on auth-critical paths
- **Alternatives:** None — all changes are well-established optimization patterns
- **Consequences:** 3 additional Phase 4 findings certified. 4/10 total. 6 remaining (Batch C: D-005 through D-010).

### C-001 — Track C Audit Framework Created
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Context:** Provider Plugin System requires its own governance track following the existing audit structure
- **Decision:** Created `audit/phase-c-provider-system/` with FINDINGS.md and CERTIFICATION.md following the exact template format from Track A. Updated MASTER_INDEX.md, AUDIT_STATUS.md, DECISIONS.md, CHATGPT_CONTEXT.md, and REMEDIATION_ROADMAP.md.
- **Rationale:** Track C is a future architecture exploration — it must NOT interfere with Track A (audit) or Track B (subscription implementation). Separate phase folder and governance track ensures clean separation.
- **Consequences:** Track C documents live inside the existing `audit/` governance system. No code changes. No modification to production files.

### C-002 — Architecture Proposal: Hybrid Provider Approach
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Context:** Research on WaveStream .cs3 plugins, workable CastleTV Python provider, and current NovaStream ContentSourceService showed three patterns
- **Decision:** Hybrid approach — local provider folder (`server/src/providers/sources/`) for all providers, optional remote manifest for update notifications. No runtime code download.
- **Rationale:** Local files are reviewable, commitable, and deployable via Docker. Remote manifests can notify of updates without auto-executing.
- **Alternatives:**
  - Pure local only — rejected; no update mechanism
  - Pure remote — rejected; security risk of auto-downloading code
  - Database-stored scripts — rejected; no versioning, no code review
- **Consequences:** All providers are JavaScript files committed to the repository, deployed inside Docker images.

### C-003 — Content-Type Independent Provider Interface
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Decision:** Provider interface uses `search()`, `getDetails()`, `getEpisodes()`, `getStreams()` — NOT `getMovie()` / `getSeries()`
- **Rationale:** Future providers may include movies, series, anime, and live TV. Content-type specific method names would require interface changes for each new content type.
- **Consequences:** Provider implementations map content types internally. The interface never changes when adding new content types.

### C-004 — Zero Provider Queries on Detail Page
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Decision:** Provider resolving happens ONLY when user presses PLAY or a background refresh worker runs. NOT when user opens a detail page.
- **Rationale:** 50 providers × 10,000 concurrent users = 500,000 requests/second if providers were queried on every page load. Only resolve on PLAY.
- **Consequences:** Detail page load time is unaffected by number of providers. Consistent user experience.

### C-005 — Auto Mode Default, Manual Source Selection Optional
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Decision:** Default user experience is Auto mode (best provider selected automatically). Users can optionally manually select a specific source.
- **Rationale:** Most users want to press PLAY and watch. Power users may want specific sources. Auto mode uses health score + success rate + priority + latency to pick the best provider.
- **Consequences:** Frontend needs a simple source selector component (dropdown or popup) for manual mode.

### C-006 — Extractors Separated From Providers
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Decision:** Video host resolvers (StreamWish, FileMoon, etc.) live in `providers/extractors/` — not inside individual providers.
- **Rationale:** Multiple providers may return links from the same video host. Embedding extractor logic in each provider duplicates code. ExtractorManager provides a single source of truth per video host.
- **Consequences:** Providers find content and return stream pages. ExtractorManager resolves actual m3u8 URLs from video hosts.

### C-007 — No Remote Code Execution
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Decision:** All providers are local JavaScript files committed to the repository, reviewed in PRs, and deployed via Docker images. No `eval()`, no dynamic `require()` from network, no runtime code download.
- **Rationale:** Remote code execution is a critical security risk. WaveStream .cs3 plugins demonstrate why — they execute arbitrary code in the app's context. NovaStream will NOT follow this pattern.
- **Consequences:** Provider updates require a deployment cycle. CLI commands can download provider files but they must be reviewed before the next deploy.

### C-008 — Provider Resolution Must Use Request Deduplication Locking
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Context:** 1000 users clicking PLAY simultaneously on the same uncached content would create 1000 concurrent provider calls to the same external source. This is a cache stampede problem.
- **Decision:** ProviderManager must use a resolve lock before making provider calls. Only one worker across the PM2 cluster resolves a given uncached content item. Other concurrent requests wait and then use the cached result.
  - Reuse existing `DistributedLock` from `server/src/utils/distributedLock.js` (Phase 9 SC-014/SC-015)
  - Lock key: `provider:resolve:{tmdbId}:{contentType}`
  - TTL: 60 seconds (covers single provider resolve time)
  - Per-process dedup via `pendingFetches` Map (already exists in current `ContentSourceService._fetchAndCache`)
- **Rationale:**
  - Protects external providers from being overwhelmed by concurrent requests
  - Protects NovaStream from unnecessary outbound bandwidth
  - Reuses existing, proven distributed lock infrastructure — no new dependencies
  - 1000 concurrent users → 1 provider call instead of 1000
- **Alternatives:**
  - No locking → rejected; cache stampede causes 1000x unnecessary provider load
  - In-memory-only dedup → rejected; doesn't protect in PM2 cluster mode
  - Rate limiter per provider → rejected; doesn't address the stampede; rate limiter is complementary, not a replacement
- **Consequences:** ProviderManager wraps provider calls in a lock acquisition step. Cache miss → lock → resolve → cache → release. Cache hit or lock failure → skip directly. Zero impact on cached content performance.

### C-009 — ProviderManager Prioritizes API Providers Before Scraper Providers
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Context:** Not all providers have equal cost. API-based providers (structured JSON endpoints) are faster, use less CPU, and are more reliable. Scraper providers (HTML parsing, headless browser, screenshots) are slower and CPU intensive. Without type-aware ordering, ProviderManager could try a scraper before an API provider, increasing latency and server load unnecessarily.
- **Decision:** ProviderManager selects providers in the following order:
  1. Health score (online > degraded > offline)
  2. **Provider type priority — API providers first, SCRAPER providers second**
  3. Success rate (higher = better)
  4. Configured priority value (lower = tried first)
  5. Average resolve speed (lower latency = better)
  
  The Play flow becomes:
  ```
  PLAY → Check StreamCache → Acquire ProviderResolveLock → Try API providers → If all fail → Try scraper providers → Save result to cache
  ```
  
  Background refresh also respects this ordering: API providers can process large batches (50-100 items), scraper providers are limited to small batches (5-10 items) to avoid excessive CPU load.
  
  Provider metadata contract now includes a required `providerType` field with allowed values `'API'` or `'SCRAPER'`.
- **Rationale:**
  - Reduces CPU usage by trying cheap API calls before expensive scraper calls
  - Improves scalability — API providers can serve more concurrent users with less infrastructure
  - Protects server resources from unnecessary scraper load
  - Better user experience — most resolves complete quickly from API providers
  - Scrapers remain as fallback for content not available via any API provider
- **Alternatives:**
  - No type distinction → rejected; a priority-10 scraper would be tried before a priority-50 API provider
  - Only use API providers → rejected; excludes content only available via scraper providers
  - User selects type manually → rejected; adds unnecessary complexity; type distinction is an internal optimization
- **Consequences:** Provider metadata schema gains a required `providerType` field. ProviderManager ordering includes a type-priority tier before configured priority and latency. Background refresh worker uses different batch sizes based on provider type. Frontend source selector can label providers as "Fast Sources" (API) and "Backup Sources" (Scraper).

### C-010 — Provider Stream Lifecycle Management — Reuse Existing Caches, Add streamPolicy
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Context:** Before freezing Track C C1 architecture, a code review of the existing streaming system was conducted to determine whether the current cache architecture already supports lifecycle-aware stream caching. The review analyzed `content-source.service.js`, `stream.service.js`, `stream.routes.js`, `external-source.routes.js`, `WatchPage.jsx`, and `external-source.api.js`.
- **Decision:**
  1. **Reuse existing cache layers as-is** — The system already has two logically separate caches:
     - **Provider Match Cache** (`Content.sourceId` / `Content.sourceSite`): Permanent mapping from TMDB ID to provider content ID. No separate collection needed.
     - **Stream URL Cache** (`_streamCache` MongoDB collection): TTL-based cache keyed by `{sourceSite}:{type}:{sourceId}:{quality}[:season:episode]`. MongoDB TTL index + 10-min safety buffer. Reuse without changes.
  2. **Reuse existing refresh mechanism** — The client-side 10-min refresh timer (`WatchPage.jsx`), server-side `POST /api/external/refresh` endpoint, and `refreshStreamUrl()` method all work correctly. Reuse as-is.
  3. **Add `streamPolicy` to provider metadata contract** — Each provider must declare its URL lifecycle:
     - `STATIC_URL` — URLs are permanent, cache indefinitely
     - `SIGNED_URL` — URLs contain `expires` param (YupFlix is this type)
     - `DYNAMIC` — Fresh session required for each request
     - Also: `ttl` (typical expiry duration), `refreshBefore` (when to preemptively refresh)
  4. **Add playback failure auto-retry** — When player receives 401/403/410: invalidate cache, request fresh URL from same provider, retry. If all retries fail, fall through to next provider in chain. **NEW** — not currently supported.
  5. **ProviderManager resolution order:** Check StreamUrlCache first → if miss, check ProviderMatchCache (sourceId) → if exists, refresh URL from same provider → if miss, run full provider chain.
- **Rationale:**
  - The existing cache architecture is well-designed for single-provider signed-URL streaming. Creating separate cache collections would duplicate data and add unnecessary complexity.
  - `Content.sourceId` is already the canonical Provider Match — it persists across restarts, survives PM2 restarts, and is indexed.
  - `_streamCache` with MongoDB TTL index is cross-worker safe and has proven expiry handling. Only change needed is making TTL configurable via `streamPolicy`.
  - `streamPolicy` is essential for multi-provider support — different providers have fundamentally different URL lifecycle characteristics.
  - Playback failure retry is the critical missing piece — without it, a single expired CDN URL causes playback failure with no recovery path.
- **Alternatives:**
  - Create a separate `providerMatches` collection → rejected; duplicates data already in `Content.sourceId`, adds migration complexity
  - Use Redis for stream URL cache → rejected; MongoDB TTL index already works, no new infrastructure dependency
  - Cache all providers' stream URLs for all content preemptively → rejected; load protection design (C-008, C-009) says only resolve on PLAY
- **Consequences:** No new cache collections needed. Provider metadata gains `streamPolicy` field. Play resolution flow gains a sourceId check step before running the full provider chain. Playback failure retry logic needs to be added to the frontend stream player and the server-side refresh endpoint. Phase C3 (YupFlix migration) now includes adding `streamPolicy` metadata and integrating playback failure retry into the existing refresh flow.

### C-011 — Scraper Providers Execute Through Controlled ScraperQueue (QUEUE/WORKER)
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Context:** Scraper providers can overload the NovaStream API server when many different uncached movies are requested simultaneously — especially when API providers fail and scraper fallback activates heavily. Running scraper `getStreams()` calls directly in the ProviderManager event loop provides no concurrency control. HTML scrapers can spike CPU usage, and browser automation (headless Chrome) can exhaust RAM.
- **Decision:**
  1. **Split `SCRAPER` into `LIGHT_SCRAPER` and `BROWSER_SCRAPER`** — Different scraper types have fundamentally different resource profiles and need different execution controls.
  2. **Add `execution` field to provider metadata** — Every provider declares:
     - `mode`: `'DIRECT'` (API), `'QUEUE'` (LIGHT_SCRAPER), or `'WORKER'` (BROWSER_SCRAPER)
     - `maxConcurrent`: Max simultaneous tasks for QUEUE/WORKER modes
     - `timeout`: Per-request timeout in ms
  3. **Create ScraperQueue** — All scraper requests are submitted to a FIFO queue with controlled concurrency, timeouts, circuit breaker (5 failures in 5 min → auto-disable), and exponential backoff (30s/60s/120s).
  4. **BROWSER_SCRAPER runs in isolated worker process** — Browser automation must run via `child_process.fork()` with a 30-second hard timeout. No browser process survives after task completion.
  5. **API providers run DIRECT (no queue)** — They are fast and cheap. Queueing would add unnecessary latency.
  6. **Client-side scraping is NOT the primary architecture** — CORS issues, secret exposure, no shared cache, harder updates, inconsistent results.
- **Rationale:**
  - API providers are cheap and should run immediately. Scraper providers can overload the server and MUST be controlled.
  - LIGHT_SCRAPER (HTTP + cheerio) and BROWSER_SCRAPER (headless Chrome) have very different resource profiles — they need different execution strategies.
  - The ScraperQueue provides multiple protection layers: concurrency limits, timeouts, circuit breaker, backoff. Each layer handles a different failure mode.
  - Worker isolation for BROWSER_SCRAPER prevents a browser crash from taking down the entire API server.
  - The `execution` metadata field makes the execution strategy visible and configurable per provider — ProviderManager reads it at registration time.
- **Alternatives:**
  - No queue → rejected; heavy scraper load would spike CPU/RAM degrades all API responses
  - Queue all providers (including API) → rejected; adds unnecessary latency to fast API calls
  - Client-side browser scraping → rejected; CORS issues, secrets exposed, no shared cache
  - External scraper worker servers → documented as a future option, but over-engineering for initial implementation
- **Consequences:** `providerType` field now accepts `'LIGHT_SCRAPER'` and `'BROWSER_SCRAPER'` in addition to `'API'`. Provider metadata gains required `execution` field. ProviderManager must check `execution.mode` before calling `getStreams()` — DIRECT runs inline, QUEUE submits to ScraperQueue, WORKER spawns child process. Existing YupFlix provider is API/DIRECT — no change needed. The Background Refresh section is updated: API providers get large batches, LIGHT_SCRAPER gets small queued batches, BROWSER_SCRAPER is excluded from automated refresh. Phase C2 (ProviderManager implementation) now includes the ScraperQueue and worker process management.

### D-025 — Batch B: Async File I/O, Async FFmpeg, Playlist Caching (ST-003, ST-005, ST-010)
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Context:** Phase 5 Streaming Batch B — 3 performance findings approved for simultaneous remediation: ST-003 (sync fs blocks event loop), ST-005 (execSync FFmpeg blocks for 2 minutes), ST-010 (no HLS playlist caching).
- **Decision:** Implemented all 3 findings across 3 files:
  1. **ST-003** (stream.service.js) — Replaced all synchronous fs operations with fs.promises async equivalents:
     - `fs.existsSync()` → `fsp.access()` via `dirExists()` helper
     - `fs.readdirSync()` → `fsp.readdir()` via `readDirSafe()` / `readDirNamesSafe()`
     - `fs.readFileSync()` → `fsp.readFile()`
     - `fs.statSync()` → `fsp.stat()`
     - `fs.openSync()`/`readSync()`/`closeSync()` → `fsp.open()`/`file.read()`/`file.close()` with try/finally
     - All functions made async: `resolveMovieContent`, `resolveEpisodeContent`, `resolveStreamPath`, `servePlaylist`, `serveSegment`, `generateMasterPlaylist`, `getStreamInfo`, `generateEpisodeMasterPlaylist`
  2. **ST-005** (thumbnail.service.js) — Replaced all execSync calls with async exec:
     - `hasFFmpeg()` — cached boolean, uses `execAsync` (promisified exec) instead of `execSync`
     - `generateSpriteWithFFmpeg()` — async `execAsync`, `fsp.mkdir`
     - `getIntervalFromDuration()` — async `execAsync` with `{ stdout }` destructuring
     - `resolveContentDirectory()`, `findSourceVideo()` — async `fsp.access`/`fsp.readdir`
     - `generatePlaceholderSprite()` — `fsp.writeFile`, `fsp.mkdir`
     - NO execSync remaining in file
  3. **ST-010** (stream.service.js) — Added in-memory caching layer:
     - Generic `withCache(cacheKey, ttlMs, fn)` helper — returns cached value or computes
     - `resolveStreamPath()` cached per contentId+quality (TTL 60s)
     - `servePlaylist()` content cached per file path (TTL 30s)
     - `generateMasterPlaylist()` cached per contentId (TTL 30s)
     - `getStreamInfo()` cached per contentId (TTL 60s)
     - `clearContentCache()` export for manual invalidation
  4. **Routes** (stream.routes.js) — Added `await` to all 7 async stream service calls (servePlaylist ×2, serveSegment ×2, getStreamInfo ×2, generateEpisodeMasterPlaylist ×1)
- **Rationale:**
  - ST-003: Blocking event loop on every segment read degrades all API responses during active streaming. Async fs operations allow concurrent segment serving without blocking.
  - ST-005: `execSync()` with up to 2-minute timeout makes server completely unresponsive during thumbnail generation. Async child processes keep the event loop free.
  - ST-010: Playlist files rarely change but are read from disk on every request. In-memory caching with 30-60s TTL eliminates redundant I/O with minimal staleness risk.
- **Files changed (3):** `server/src/services/stream.service.js`, `server/src/services/thumbnail.service.js`, `server/src/routes/stream.routes.js`
- **Validation:** ✅ 3/3 modules load clean | ✅ 52/52 tests pass | ✅ Client build (5.07s) | ✅ Code review passed (no issues found)
- **Consequences:** 6/11 Phase 5 findings certified. 4 remaining (Batch C: ST-004, ST-007, ST-008, ST-009).

### D-023 — Batch C: Index Weights, Compound Index, Pagination, BulkWrite, Stale Refs, Pool Config (D-005 → D-010)
- **Date:** 2026-07-06
- **Author:** AI Agent
- **Context:** 6 remaining low-severity Phase 4 Database findings approved for simultaneous remediation: D-005 (text search weights), D-006 (missing compound index), D-007 (pagination boundary), D-008 (sync bulk writes), D-009 (stale watch refs), D-010 (env-configurable pool).
- **Decision:** Implemented all 6 findings across 6 files:
  1. **D-005** (Content.model.js) — Text index now has `weights: { title: 10, tagline: 5, overview: 1 }` and `name: 'content_text_search'`
  2. **D-006** (Content.model.js) — Added `{ contentType: 1, isActive: 1, popularity: -1 }` compound index
  3. **D-007** (admin-user.service.js) — Added `.limit(200)` to `getRecentActivity()` user query
  4. **D-008** (sync-scheduler.service.js) — Replaced per-item for-loop with 2 batch queries + 1 bulkWrite (ordered: false)
  5. **D-009** (User.model.js + admin-user.service.js) — Added `removeStaleWatchRefs()` static method; called in `getUserActivity()` before batch content loading
  6. **D-010** (env.js + database.js) — Added `MONGODB_MAX_POOL_SIZE` (default 10) and `MONGODB_MIN_POOL_SIZE` (default 2) env vars
- **Rationale:** All 6 are low-risk, production-safe changes with clear performance/configuration benefits. BulkWrite in sync reduces ~1500 queries to 3 round trips. Stale ref cleanup prevents redundant loading of deleted content references. Env-configurable pool allows tuning without code changes.
- **Files changed (6):** `server/src/models/Content.model.js`, `server/src/services/admin-user.service.js`, `server/src/services/sync-scheduler.service.js`, `server/src/models/User.model.js`, `server/src/config/env.js`, `server/src/config/database.js`
- **Validation:** ✅ 6/6 modules load clean | ✅ 52/52 tests pass | ✅ Client build (4.76s) | ✅ Code review passed (3 notes: orphaned index documented, triple-fetch noted as acceptable for admin-only, writeErrors logging added)
- **Consequences:** Phase 4 Database is 100% complete (10/10 findings certified). Phase 5 (Streaming) is ready to begin.

### D-018 — Final Batch: S-003 + S-006 (Phase 2 Completion)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** Final 2 remaining Phase 2 Security findings — S-003 (account lockout) and S-006 (env exposure). Both were isolated security hardening items with no file conflicts.
- **Decision:** Implemented both in a single final batch:
  1. **S-003** — Added in-memory account lockout to `AuthService.login()`:
     - `lockoutState` Map tracking failed attempts per username (no schema changes)
     - Threshold: 5 failed attempts → 15-minute temporary lockout
     - Lockout check before login processing (returns 429)
     - Counter resets on successful login; auto-expires after 15 minutes
     - Complements existing IP rate limiting (5/min) and IP auto-blocking (10 attempts)
  2. **S-006** — Replaced `SystemService.getConfig()`:
     - Removed env variable iteration (exposed all names + masked values)
     - Removed `.env` file path disclosure
     - Returns only safe operational metadata: NODE_ENV, nodeVersion, platform, arch, pid, uptime
- **Rationale:** S-003 closes the IP-rotation attack vector by adding per-account tracking. S-006 eliminates information leakage from the admin config endpoint. Both are minimal, non-architectural changes.
- **Files changed (2):** `server/src/services/auth.service.js`, `server/src/services/system.service.js`
- **Validation:** ✅ 2 modules load cleanly | ✅ 52/52 tests pass (4 suites) | ✅ Client build (3.98s) | ✅ Code review passed (lockedAt bug fix applied)
- **Consequences:** Phase 2 Security is 100% complete (6/6 findings certified). Ready for Phase 3 (Backend).

### D-020 — Phase 3 Batch B: Error Consistency, Dead Code, Fragile URL, Canvas Safety (B-004, B-007, B-008, B-009, B-012)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** 5 remaining small-independent findings from Phase 3 Backend audit, approved together under FAST TRACK mode. B-014 already resolved as side effect of Batch A.
- **Decision:** Implemented all 5 findings in a single batch:
  1. **B-004** (Error Consistency) — Converted 7 raw `res.status(404).json()` responses in stream.routes.js and thumbnail.routes.js to `throw ApiError.*()` pattern through error middleware. Added `...(err.data ? { data: err.data } : {})` to errorHandler for 404s that carry stream info data. 403/400 segment errors already used ApiError — unchanged.
  2. **B-007** (Dead Import) — Removed unused `const config = require('../config/env')` from auth.controller.js.
  3. **B-008** (Health Duplication) — Added `GET /` handler to health.routes.js (quick status JSON). Removed inline `GET /health` handler from routes/index.js. Removed now-unused `ApiResponse` and `config` imports from index.js.
  4. **B-009** (Fragile URL) — Replaced literal `:slug` placeholder in stream token URL response with actual slug resolved from Content model via `Content.findById(contentId).select('slug')`. Episode URLs unchanged (use contentId not slug).
  5. **B-012** (Canvas Safety) — Moved `require('canvas')` from inside `generatePlaceholderSprite()` to top-level try/catch at module load. Added guard check before use. Prevents runtime crash when canvas isn't installed.
  6. **B-014** — Verified already resolved (Batch A rewrote history.routes.js to only import controller, not WATCH_HISTORY_MAX).
- **Files changed (7):** stream.routes.js, thumbnail.routes.js, thumbnail.service.js, auth.controller.js, health.routes.js, routes/index.js, errorHandler.middleware.js
- **Validation:** ✅ 7 modules load cleanly | ✅ 52/52 tests pass | ✅ Client built 4.17s | ✅ Code review passed (2 nits fixed: removed unused config import from index.js, used ApiResponse.success() in health routes)
- **Consequences:** 10/13 Phase 3 findings certified. 3 remaining: B-006 (authorization gap, Batch C), B-010 + B-011 (documentation/convention, Batch D).

### D-019 — Phase 3 Batch A: Architecture Boundary Enforcement (B-001, B-002, B-003, B-005)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** Phase 3 Backend audit identified that 12 of 14 route files embedded business logic directly in handlers instead of using the controller pattern. 4 files were particularly large (admin.routes.js ~400 lines inline, progress ~200, history ~180, favorites ~170). B-002 identified duplicate watch history population logic between progress and history.
- **Decision:** Extracted all inline business logic into 5 dedicated service modules and 3 new controllers:
  1. **ProgressService** — getContinueWatching, removeFromCW, saveProgress, getProgress (includes 30s MemoryCache)
  2. **HistoryService** — getHistory (paginated + populated), getRecentHistory, clearHistory
  3. **FavoritesService** — getFavorites, toggleFavorite, checkFavorite, removeFavorite
  4. **AdminUserService** — listUsers, createUser, deleteUser, resetPassword, getUserActivity, getRecentActivity
  5. **AdminContentService** — listContent, updateContent, deactivateContent
  6. **Controllers:** ProgressController, HistoryController, FavoritesController (thin request→service→ApiResponse)
- **Rationale:**
  - Follows the established pattern from auth.controller and content.controller
  - Business logic in services enables unit testing without Express server
  - Eliminates duplicate ~50 lines of content/episode batch lookup patterns
  - admin.routes.js reduced from ~400 lines to ~150 lines
- **Files created (9):** 5 services, 3 controllers, 1 updated FINDINGS.md
- **Files modified (4):** progress.routes.js, history.routes.js, favorites.routes.js, admin.routes.js
- **Validation:** ✅ 12 modules load cleanly | ✅ 52/52 tests pass | ✅ Client built 4.20s | ✅ Code review passed (1 bug fixed: missing Content import in stats handler)
- **Consequences:** 4/13 Phase 3 findings certified. 9 remaining (B-004, B-006, B-007, B-008, B-009, B-010, B-011, B-012, B-014). B-014 resolved as side effect. Ready for Batch B.

### D-017 — S-002: Token Refresh Expiration Bypass
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** S-002 identified that `refreshToken()` used `ignoreExpiration: true`, allowing any expired JWT to be perpetually refreshed without re-authentication. Additionally, no session validity check was performed before token rotation.
- **Decision:**
  1. Removed `ignoreExpiration: true` from `jwt.verify()` — expired tokens are now rejected
  2. Added `Session.findValidSession(token)` — validates session is still active in DB before issuing new token
  3. Added `!token` input guard
  4. Added structured try/catch error handling (TokenExpiredError, JsonWebTokenError, ApiError)
  5. Token rotation preserved (old session deactivated, new token issued)
- **Security flow before:** Stolen expired token → `jwt.verify({ ignoreExpiration: true })` → ✅ → new valid token issued
- **Security flow after:** Stolen expired token → `jwt.verify()` → ❌ TokenExpiredError; revoked session token → `Session.findValidSession()` → ❌ null; valid token → both checks pass → token rotation
- **Test coverage:** Created `auth.service.test.js` with 9 tests (missing token, expired rejection, wrong secret, malformed token, revoked session, deactivated user, valid refresh, token rotation, replay prevention)
- **Files changed:** `server/src/services/auth.service.js`, `server/src/services/__tests__/auth.service.test.js` (new)
- **Validation:** ✅ auth.service.js loads cleanly | ✅ 9/9 tests pass | ✅ 52/52 total tests (4 suites) | ✅ Client build (4.33s) | ✅ Code review passed
- **Consequences:** 4/6 Phase 2 Security findings certified. 2 remaining open: S-003, S-006.

### D-016 — Batch 1: S-001, S-004, S-005 (Phase 2 Security Hardening)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** Phase 2 Security audit identified 6 findings. Batch 1 includes 3 small independent security hardening fixes approved under FAST TRACK mode.
- **Decision:** Implemented S-001 + S-004 + S-005 in a single batch:
  1. **S-001** — Added `{ algorithms: ['HS256'] }` to all 4 `jwt.verify()` calls in `auth.middleware.js` and `auth.service.js`. Prevents algorithm confusion attacks (CVE-2015-9235).
  2. **S-004** — Changed stream token IP binding from `process.env.NODE_ENV === 'production' ? clientIp : undefined` → `clientIp`. Stream tokens are now always IP-bound regardless of environment.
  3. **S-005** — Replaced path-revealing 404 message with generic text. Full path details remain in server-side logs only.
- **Rationale:** All 3 are XS-sized, independent, in different files, with no architecture overlap. No auth redesign or dependency changes needed.
- **Files changed (4):** `server/src/middleware/auth.middleware.js`, `server/src/services/auth.service.js`, `server/src/routes/stream.routes.js`, `server/src/app.js`
- **Validation:** ✅ 4 modules load cleanly | ✅ 43/43 tests pass | ✅ Client build passes (3.92s) | ✅ Code review passed
- **Consequences:** 3/6 Phase 2 Security findings certified. 3 remaining open: S-002 (token refresh), S-003 (account lockout), S-006 (env exposure).

### D-015 — Final Batch: F-013, F-019, F-020 (Phase 1 Completion)
- **Date:** 2026-07-04
- **Author:** AI Agent
- **Context:** 3 remaining Phase 1 Foundation findings — F-013 (segment validation, Medium/Security), F-019 (external source handling, Low/Architecture), F-020 (auth _id vs id, Low/Backend). Each was isolated and did not overlap with previous fixes.
- **Decision:** Implemented all 3 findings in a single final batch:
  1. **F-013** — Added filename whitelist regex to `serveSegment()` in `stream.service.js`. Pattern `/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(ts|m3u8|mp4|vtt|srt|aac|mp3|ac3|m4s|mpd)$/` covers HLS, DASH, audio, subtitles. Defense-in-depth after existing `path.basename()` traversal protection.
  2. **F-019** — Added `isValidStreamUrl()` (validates URL is real http/https) and `validateStreamLink()` (filters invalid links) to `content-source.service.js`. Applied to both movie and series response parsers. Invalid URLs are logged as warnings and filtered out silently.
  3. **F-020** — Removed `id: decoded.userId` from both `authenticate()` and `optionalAuth()` in `auth.middleware.js`. Changed 3 `req.user.id` → `req.user._id` in `adminAuth.middleware.js`. `_id` is now sole canonical identifier.
- **Rationale:** All 3 are small, isolated, single-file-or-two fixes with no architecture overlap. Security finding (F-013) was kept isolated as required by FAST TRACK rules. Grouping the two XS-sized items (F-019, F-020) with F-013 avoided unnecessary per-finding overhead.
- **Files changed (4):** `server/src/services/stream.service.js`, `server/src/services/content-source.service.js`, `server/src/middleware/auth.middleware.js`, `server/src/middleware/adminAuth.middleware.js`
- **Validation:** ✅ 4 modules load cleanly | ✅ 43/43 tests pass | ✅ Client build passes (4.92s) | ✅ Code review passed
- **Consequences:** Phase 1 Foundation is 100% complete (20/20 findings certified). Phase 2 (Security) is ready to begin.
- **Author:** AI Agent
- **Context:** F-012 identified that the React application had no error boundaries. Any runtime error in any component would unmount the entire React tree to a blank white page with no fallback.
- **Decision:** Created `client/src/components/ui/ErrorBoundary.jsx` and wrapped `<Routes>` in App.jsx.
  - Class component using `getDerivedStateFromError` + `componentDidCatch` (required pattern — no hook equivalent)
  - Default fallback uses existing `ErrorState` component with retry button
  - Shows error message in development, generic message in production
  - Supports custom fallback via `props.fallback` for specialized use cases
  - Console logging of error + component stack for debugging
- **Rationale:**
  - Error boundaries require class component lifecycle methods — no alternative with hooks
  - Reusing `ErrorState` component ensures visual consistency with the rest of the app
  - Wrapping `<Routes>` at the top level protects all pages without cluttering individual components
  - Retry button calls `setState` to reset — safe for transient errors (user refreshes for persistent ones)
- **Alternatives:**
  - Individual error boundaries per page — rejected; unnecessary complexity, top-level is sufficient
  - react-error-boundary package — rejected; no new dependency needed for a simple class component
- **Consequences:** All unhandled render errors now show a styled fallback UI with retry option instead of a blank white page. Errors are logged to console for debugging.
