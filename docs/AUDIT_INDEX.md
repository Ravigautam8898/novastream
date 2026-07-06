# NovaStream — Project Audit Index

> **Purpose:** Complete file-by-file audit of the NovaStream project. Use this document to navigate every endpoint, component, model, middleware, service, and configuration file across all phases.
>
> **Last Updated:** July 6, 2026
> **Phase 8 Status:** 🔒 FROZEN ✅ — Production Audit Complete (14/14 findings)
> **Total Files:** 100+ source files (server: 47, client: 52, cli: 10, root: 8+, docker: 4)

---

## Table of Contents

1. [Server Architecture](#1-server-architecture)
   - [1.1 Config Layer](#11-config-layer)
   - [1.2 Models (Mongoose Schemas)](#12-models-mongoose-schemas)
   - [1.3 Services (Business Logic)](#13-services-business-logic)
   - [1.4 Controllers (HTTP Handlers)](#14-controllers-http-handlers)
   - [1.5 Routes (Endpoint Definitions)](#15-routes-endpoint-definitions)
   - [1.6 Middleware (Request Pipeline)](#16-middleware-request-pipeline)
   - [1.7 Validators (Zod Schemas)](#17-validators-zod-schemas)
   - [1.8 Utils (Shared Utilities)](#18-utils-shared-utilities)
   - [1.9 Entry Point (app.js)](#19-entry-point-appjs)
2. [Client Architecture](#2-client-architecture)
   - [2.1 Pages](#21-pages)
   - [2.2 Components](#22-components)
   - [2.3 API Client Modules](#23-api-client-modules)
   - [2.4 Context & Hooks](#24-context--hooks)
   - [2.5 Styles](#25-styles)
   - [2.6 Utils](#26-utils)
   - [2.7 App Entry & Routing](#27-app-entry--routing)
3. [CLI Architecture (novactl)](#3-cli-architecture-novactl)
4. [Root Files & Config](#4-root-files--config)
5. [Complete API Endpoint Map](#5-complete-api-endpoint-map)
6. [Complete Database Schema Map](#6-complete-database-schema-map)
7. [Middleware Pipeline (Request Flow)](#7-middleware-pipeline-request-flow)
8. [Security Layers](#8-security-layers)
9. [Phase-by-Phase Feature Map](#9-phase-by-phase-feature-map)
10. [Environment Variables](#10-environment-variables)
11. [Known Gaps & Technical Debt](#11-known-gaps--technical-debt)

---

## 1. Server Architecture

**Location:** `server/src/` — 46 source files across 9 subdirectories (was 38)

```
server/src/
├── app.js                          # Express app entry point
├── config/                         # Environment, DB, Logger (5)
│   ├── env.js
│   ├── database.js
│   ├── logger.js
│   ├── plans.js                    # Subscription plan templates (10 plans)
│   └── roles.js                    # Role constants + permission matrix
├── models/                         # Mongoose schemas (8)
│   ├── Content.model.js
│   ├── Season.model.js
│   ├── Episode.model.js
│   ├── User.model.js               # Updated: subscription sub-doc, pendingPlan
│   ├── Session.model.js
│   ├── BlockedIP.model.js
│   ├── SubscriptionPlan.model.js   # NEW: DB-stored plans with seeding
│   └── AuditLog.model.js           # NEW: Subscription mutation audit trail
├── routes/                         # Route modules (13)
│   ├── index.js                    # Route aggregator
│   ├── auth.routes.js
│   ├── content.routes.js
│   ├── search.routes.js
│   ├── stream.routes.js
│   ├── progress.routes.js
│   ├── thumbnail.routes.js
│   ├── history.routes.js
│   ├── favorites.routes.js
│   ├── external-source.routes.js
│   ├── admin.routes.js             # Admin dashboard (users, content, stats, logs)
│   ├── subscription.routes.js      # NEW: 15 subscription management endpoints
│   ├── ownership.routes.js         # NEW: Ownership transfer + quotas + settings
│   └── plan.routes.js              # NEW: Plan CRUD (Super Admin)
├── controllers/                    # HTTP handlers (2)
│   ├── auth.controller.js
│   ├── README.md                   # Placeholder (dead file)
│   └── content.controller.js
├── services/                       # Business logic (10)
│   ├── auth.service.js
│   ├── content.service.js
│   ├── content-source.service.js
│   ├── subscription.service.js     # NEW: 14 subscription methods
│   ├── tmdb.service.js
│   ├── stream.service.js
│   ├── thumbnail.service.js
│   ├── sync-scheduler.service.js
│   ├── system.service.js
│   └── thumbnail.service.js
├── middleware/                     # Request pipeline (10)
│   ├── auth.middleware.js
│   ├── adminAuth.middleware.js
│   ├── rateLimiter.middleware.js   # Updated: +adminLimiter (60 req/min)
│   ├── ipBlocker.middleware.js
│   ├── sanitize.middleware.js
│   ├── contentType.middleware.js
│   ├── validate.middleware.js
│   ├── errorHandler.middleware.js
│   ├── imageProxy.middleware.js
│   └── streamAuth.middleware.js
├── validators/                     # Zod schemas (4)
│   ├── auth.validator.js
│   ├── content.validator.js
│   ├── subscription.validator.js   # NEW: 15+ subscription schemas
│   └── search.validator.js
└── utils/                          # Helpers (3)
    ├── ApiResponse.js
    ├── ApiError.js
    └── cache.js                    # MemoryCache with TTL
```

**Changes since July 1:**
- +7 route modules (history, favorites, external-source, admin, subscription, ownership, plans)
- **+1 route module (health.routes.js)** — health/simple (plain OK) + health/full (detailed)
- +5 services (content-source, sync-scheduler, subscription, system + cache utility)
- **+1 service (backup.service.js)** — mongodump/mongorestore backup wrapper
- **+1 CLI directory (server/src/cli/)** — interactive admin CLI with 6 command modules + log management
- **+1 script (security-check.js)** — 12-point security audit
- +2 config files (plans.js, roles.js)
- +2 models (SubscriptionPlan, AuditLog)
- +1 validator (subscription)
- User model updated with subscription sub-document
- rateLimiter updated with adminLimiter (60 req/min)
- Search routes re-ordered BEFORE content routes to avoid redundant JWT auth check

---

### 1.1 Config Layer

| File | Purpose | Key Configs | Phase |
|------|---------|-------------|-------|
| `config/env.js` | Zod-validated env loader. Validates 15+ env vars at startup. Fail-fast on missing required vars. | `JWT_SECRET`, `MONGODB_URI`, `TMDB_API_KEY`, `TMDB_ACCESS_TOKEN`, `STREAM_SECRET`, `PORT`, `NODE_ENV`, `LOG_LEVEL`, `CORS_ORIGIN`, `STREAM_TOKEN_EXPIRY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `IP_BLOCK_THRESHOLD` | Pre, 1 |
| `config/database.js` | Mongoose connection with retry logic (5 retries, 5s delay). Logs connection state changes. | Connection URI from env | 1 |
| `config/logger.js` | Pino structured logger. Pretty-print in dev, JSON in prod. Auto-redacts passwords/tokens. Custom serializers for req/res/err. | `LOG_LEVEL` env | 1 |

### 1.2 Models (Mongoose Schemas)

| Model | File | Key Fields | Indexes | Relations | Phase |
|-------|------|------------|---------|-----------|-------|
| **Content** | `Content.model.js` | `tmdbId`, `slug`, `title`, `overview`, `contentType` (movie\|series), `posterPath`, `backdropPath`, `genre`, `genres[]`, `categories[]`, `releaseDate`, `runtime`, `voteAverage`, `voteCount`, `popularity`, `viewCount`, `isActive`, `isFeatured`, `isPinned`, `isPremium`, `cast[]`, `streams[]` (quality/filePath/bitrate/resolution), `videos[]`, `similarContent[]`, `sourceId`, `sourceSite` | `{slug:1}` unique, `{tmdbId:1}` sparse, `{title:"text",overview:"text"}`, `{contentType:1,isActive:1,isFeatured:-1}`, `{contentType:1,categories:1}`, `{popularity:-1}`, `{createdAt:-1}` | `similarContent[]` → Content | 1, 5 |
| **Season** | `Season.model.js` | `contentId` → Content, `tmdbId`, `seasonNumber`, `name`, `overview`, `posterPath`, `airDate`, `episodeCount` | `{contentId:1,seasonNumber:1}` unique | `contentId` → Content | 1 |
| **Episode** | `Episode.model.js` | `seasonId` → Season, `contentId` → Content, `tmdbId`, `episodeNumber`, `name`, `overview`, `stillPath`, `airDate`, `runtime`, `voteAverage`, `streams[]` (quality/filePath/playlistUrl/bitrate/resolution), `downloadEnabled` | `{seasonId:1,episodeNumber:1}` unique | `seasonId` → Season, `contentId` → Content | 1, 5 |
| **User** | `User.model.js` | `username` unique, `passwordHash`, `displayName`, `role` (super_admin\|manager\|member), `isActive`, `subscription` {plan, status, flags: {trial}, expiryDate, activationDate, version, pendingPlan}, `quotaUsage`, `createdBy` → User, `lastLoginAt`, `lastLoginIp`, `loginHistory[]`, `watchHistory[]` (contentId/episodeId/progress/duration/watchedAt), `watchlist[]` (contentId/addedAt) | `{username:1}` unique, `{isActive:1,role:1}` | `createdBy` → User | 1, 2, 6.5 |
| **Session** | `Session.model.js` | `userId` → User, `token` (JWT hash), `ip`, `userAgent`, `isActive`, `expiresAt` (TTL index) | `{userId:1}`, `{token:1}`, `{expiresAt:1}` TTL | `userId` → User | 2 |
| **BlockedIP** | `BlockedIP.model.js` | `ip`, `reason` (abuse\|bruteforce\|scraping\|manual), `blockedBy` (system\|admin), `blockedAt`, `expiresAt`, `attemptCount`, `isActive` | `{ip:1,isActive:1}` | — | 2 |
| **SubscriptionPlan** | `SubscriptionPlan.model.js` | `planId` (unique slug), `name`, `description`, `durationDays`, `type` (trial\|standard\|promotional\|custom), `price`, `maxDevices`, `maxStreams`, `isActive`, `isTrial`, `displayOrder`, `badgeColor` | `{planId:1}` unique, `{isActive:1,displayOrder:1}` | — | 6.5 |
| **AuditLog** | `AuditLog.model.js` | `action`, `category`, `level`, `targetUserId` → User, `actorUserId` → User, `previousState`, `newState`, `reason`, `notes`, `source`, `correlationId` | `{targetUserId:1,createdAt:-1}`, `{action:1}`, `{category:1,createdAt:-1}` | `targetUserId` → User, `actorUserId` → User | 6.5 |

### 1.3 Services (Business Logic)

| Service | File | Key Methods | Purpose | Phase |
|---------|------|-------------|---------|-------|
| **AuthService** | `services/auth.service.js` | `login()`, `logout()`, `verifyToken()`, `refreshToken()`, `createUser()` | JWT auth flow, bcrypt password compare, session create/invalidate/verify, token refresh with rotation | 2 |
| **ContentService** | `services/content.service.js` | `getHomepageSections()`, `getMovies()`, `getMovieBySlug()`, `getSeries()`, `getSeriesBySlug()`, `getSeasonsBySlug()`, `getEpisodeById()`, `getTrending()`, `getByCategory()`, `search()` | DB-first content fetching with TMDB fallback. `getHomepageSections` builds 5+ sections (featured/trending/4 categories) with 5-min in-memory cache. `getSeriesBySlug` populates seasons + episodes; falls back to external source via `ContentSourceService.fetchSeriesSeasonData()` when DB has no season/episode docs (fixes "0 Seasons 0 Episodes" bug). | 3 |
| **ContentSourceService** | `services/content-source.service.js` | `fetchSeriesSeasonData(content)`, `fetchMovieStreamData(content)`, `fetchEpisodeStreamData(content, season, episode)` | NEW: External source (YupFlix) integration. Fetches series structure (seasons + episodes) from external API when DB has no records. Assigns synthetic `_id` fallback (`s{season}e{episode}`) for episode tracking. Returns empty array on any error (non-fatal). | 8 |
| **TMDbService** | `services/tmdb.service.js` | `syncMovie()`, `syncSeries()`, `syncSeason()`, `search()`, `getTrending()` | TMDB API integration using `moviedb-promise`. Syncs movies/series with cast (top 20), seasons, episodes. Maps TMDB fields to NovaStream schema | 1 |
| **StreamService** | `services/stream.service.js` | `generateStreamToken()`, `validateStreamToken()`, `resolveMovieContent()`, `resolveEpisodeContent()`, `resolveStreamPath()`, `servePlaylist()`, `serveSegment()`, `getStreamInfo()`, `generateMasterPlaylist()`, `generateEpisodeMasterPlaylist()` | HLS streaming engine. JWT token generation/validation (HS256, 24h expiry, optional IP binding). File system + DB stream resolution. M3U8 playlist and TS segment serving with HTTP range support (206 Partial Content). Path traversal prevention. Dynamic master playlist generation from quality dirs | 5 |
| **ThumbnailService** | `services/thumbnail.service.js` | `getOrGenerateSprite()`, `generatePlaceholderSprite()`, `resolveContentDirectory()`, `findSourceVideo()`, `generateSpriteWithFFmpeg()` | Seek preview sprite sheets. FFmpeg frame extraction + tiling (5 cols × 5 rows = 25 thumbnails). `node-canvas` placeholder fallback with colored frames. Cached to disk at `thumbnails/`. Config: 160×90px per thumbnail | 5 |
| **SyncSchedulerService** | `services/sync-scheduler.service.js` | `start()`, `stop()`, `scheduleNext()` | NEW: Periodic external content sync via node-cron. Runs every 6 hours. Fetches new content from external providers and syncs to local DB. Non-blocking on startup. | 8 |
| **SystemService** | `services/system.service.js` | `getDashboardStats()`, `getServerHealth()`, `getRecentLogs()` | NEW: Server metrics and admin dashboard data aggregation. Returns counts, system info, and recent log entries for the admin panel. | 7 |
| **SubscriptionService** | `services/subscription.service.js` | `create()`, `renew()`, `extend()`, `activate()`, `deactivate()`, `suspend()`, `resume()`, `expire()`, `upgrade()`, `cancelUpgrade()`, `canAccess()`, `remainingDays()`, `getStatus()`, `_activatePendingPlan()` | NEW: Full subscription lifecycle management with audit logging, atomic operations, pending plan queue, role-based access, and auto-activation. 14 methods. | 6.5 |

### 1.4 Controllers (HTTP Handlers)

| Controller | File | Methods | Style | Phase |
|------------|------|---------|-------|-------|
| **AuthController** | `controllers/auth.controller.js` | `login()`, `logout()`, `verify()`, `refresh()` | Thin HTTP handlers — delegates to AuthService, formats response via ApiResponse | 2 |
| **ContentController** | `controllers/content.controller.js` | `getHomepageSections()`, `getMovies()`, `getMovieBySlug()`, `getSeries()`, `getSeriesBySlug()`, `getSeriesSeasons()`, `getEpisodeById()`, `getTrending()`, `getByCategory()`, `search()` | Maps route params to ContentService calls, standardizes pagination response | 3 |

### 1.5 Routes (Endpoint Definitions)

| Route File | Mount Point | Endpoints | Middleware | Phase |
|------------|-------------|-----------|------------|-------|
| **`routes/index.js`** | `/api` (all) | Route aggregator, mounts all sub-routers. **IMPORTANT ordering:** health → auth → stream → thumbnails → images → search → content → progress → external → favorites → history → admin | Route-specific | Pre, 3, 5 |
| **`routes/auth.routes.js`** | `/api/auth` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/verify`, `POST /api/auth/refresh` | Login: `ipBlocker` + `authLimiter` + `validate(loginSchema)`. Others: `authenticate` | 2 |
| **`routes/content.routes.js`** | `/api` (direct) | `GET /api/homepage/sections`, `GET /api/movies`, `GET /api/movies/:slug`, `GET /api/series`, `GET /api/series/:slug`, `GET /api/series/:slug/seasons`, `GET /api/episode/:id`, `GET /api/trending`, `GET /api/categories/:category` | Global `authenticate` + `generalLimiter` on router | 3 |
| **`routes/search.routes.js`** | `/api/search` | `GET /api/search?q=&type=&page=` | `authenticate` + `generalLimiter` + Zod validation | 3 |
| **`routes/stream.routes.js`** | `/api/stream` | `POST /api/stream/token`, `GET /api/stream/movie/:slug/index.m3u8`, `GET /api/stream/movie/:slug/:quality/index.m3u8`, `GET /api/stream/movie/:slug/:quality/segments/:segment`, `GET /api/stream/episode/:id/index.m3u8`, `GET /api/stream/episode/:id/:quality/index.m3u8`, `GET /api/stream/episode/:id/:quality/segments/:segment`, `GET /api/stream/info/:type/:slug` | Token: `authenticate` + `streamLimiter`. Playlist/segment: `requireStreamToken`. Info: `authenticate` | 5 |
| **`routes/progress.routes.js`** | `/api/progress` | `POST /api/progress/save`, `GET /api/progress/:type/:id`, `GET /api/progress/continue-watching`, `DELETE /api/progress/continue-watching/:id` | Save: `authenticate` + `streamLimiter`. Others: `authenticate`. Uses 30-second in-memory cache on continue-watching endpoint | 5, 8 |
| **`routes/thumbnail.routes.js`** | `/api/thumbnails` | `GET /api/thumbnails/:type/:id` | `authenticate` + `streamLimiter` | 5 |
| **`routes/history.routes.js`** | `/api/history` | `GET /api/history?page=&limit=`, `GET /api/history/recent`, `DELETE /api/history` | `authenticate`. Paginated with population. Grouped by date on frontend. | 8 |
| **`routes/favorites.routes.js`** | `/api/favorites` | `GET /api/favorites`, `POST /api/favorites/:contentId`, `GET /api/favorites/check/:contentId`, `DELETE /api/favorites/:contentId` | `authenticate`. Toggle add/remove with 200-item cap. | 8 |
| **`routes/external-source.routes.js`** | `/api/external` | `POST /api/external/play`, `POST /api/external/refresh` | `authenticate`. Proxies streaming from external providers (YupFlix CDN). Handles token expiry refresh. | 8 |
| **`routes/admin.routes.js`** | `/api/admin` | `GET /api/admin/users`, `POST /api/admin/users`, `DELETE /api/admin/users/:id`, `POST /api/admin/users/:id/reset`, `GET /api/admin/content`, `PUT /api/admin/content/:id`, `DELETE /api/admin/content/:id`, `GET /api/admin/stats`, `GET /api/admin/logs` | `authenticate` + `adminOnly` + `streamLimiter` | 7 |

**Route ordering is critical** (see §7 for the full pipeline):

1. **Health** (no auth)
2. **Auth** (own auth)
3. **Stream** (query token, not JWT — must precede content router's global authenticate)
4. **Thumbnails** (no JWT — fetched natively by `<img>` tags)
5. **Images** (no auth — proxy)
6. **Search** (own authenticate — mounted BEFORE content to avoid double auth)
7. **Content** (has global `router.use(authenticate)` — catches ALL unmatched paths)
8. **Progress** (authenticate)
9. **External source** (authenticate)
10. **Favorites** (authenticate)
11. **History** (authenticate)
12. **Admin** (authenticate + adminOnly)

### 1.6 Middleware (Request Pipeline)

| Middleware | File | What It Does | Applied | Phase |
|------------|------|-------------|---------|-------|
| **authenticate** | `auth.middleware.js` | Extracts JWT from `Authorization: Bearer` header. Verifies with `jsonwebtoken`. Checks session validity in DB. Attaches `req.user` | Route-level on protected endpoints | 2 |
| **adminAuth** | `adminAuth.middleware.js` | `adminOnly()` — checks `req.user.role === 'admin'`, `requireRole(roles)` — checks against allowed roles | Route-level on `/api/admin/*` endpoints | 2 |
| **rateLimiter** | `rateLimiter.middleware.js` | `generalLimiter` (100/15min), `authLimiter` (5/min, skipSuccessful), `streamLimiter` (30/min), `generalSlowDown` (50 → 500ms delay) | Route-level per endpoint group | 2 |
| **ipBlocker** | `ipBlocker.middleware.js` | Checks IP against `BlockedIP` collection. Auto-blocks on login failure. `autoBlockIP()` for honeypot detection | Global on all routes | 2 |
| **sanitize** | `sanitize.middleware.js` | `express-mongo-sanitize` strips `$` and `.` from body/query/params. `hpp` rejects duplicate params. Logs injection attempts | Global on all routes | 6 |
| **contentType** | `contentType.middleware.js` | Validates `Content-Type: application/json` on POST/PUT/PATCH/DELETE. Returns 415 on invalid | Global on all routes | 6 |
| **validate** | `validate.middleware.js` | Generic Zod schema runner. Parses `{body, query, params}` against schema. Returns 400 with field-level errors | Route-level on auth/search routes | 2 |
| **errorHandler** | `errorHandler.middleware.js` | Global catch-all. Handles: Zod errors, Mongoose errors, Multer errors, JSON parse errors, custom `ApiError`. Stack traces in dev only, generic messages in prod | Global (last middleware) | 1 |
| **imageProxy** | `imageProxy.middleware.js` | Proxies TMDB images through server. Validates size parameter (`w500`, `w1280`, `w185`). Caching headers. SVG fallback on failure | Route: `GET /api/images/:type/:size/*` | 3 |
| **streamAuth** | `streamAuth.middleware.js` | `requireStreamToken` — extracts `?token=` query param, validates via `StreamService.validateStreamToken()`, attaches decoded payload to `req.streamToken` | Route-level on HLS playlist/segment endpoints | 5 |

### 1.7 Validators (Zod Schemas)

| Validator | File | Schemas | Phase |
|-----------|------|---------|-------|
| **auth.validator.js** | `validators/auth.validator.js` | `loginSchema` (username: 3-50 chars, password: 6-100 chars), `createUserSchema` (username alphanumeric+underscore, password 6-100, role optional) | 2 |
| **content.validator.js** | `validators/content.validator.js` | `searchSchema` (q: 1-200 chars, type: movie\|series\|all, page/limit coerce), `slugParamSchema` (slug: 1-200 chars), `paginationSchema` (page/limit coerce) | 3 |
| **search.validator.js** | `validators/search.validator.js` | `searchQuerySchema` (q min 1, type, page, limit, additional string filters) | 3 |
| **subscription.validator.js** | `validators/subscription.validator.js` | `createSubscriptionSchema`, `renewSubscriptionSchema`, `extendSubscriptionSchema`, `upgradeSubscriptionSchema`, `cancelUpgradeSchema`, `adminActionSchema`, `modifyDatesSchema`, `addNotesSchema`, `ownershipTransferSchema`, `ownershipTransferBatchSchema`, `ownershipTransferAllSchema`, `quotaUpdateSchema`, `settingUpdateSchema`, `userIdParamSchema` | 6.5 |

### 1.8 Utils (Shared Utilities)

| File | Exports | Phase |
|------|---------|-------|
| `utils/ApiResponse.js` | `success(res, data, message, statusCode)`, `paginated(res, data, pagination)`, `created(res, data, message)`, `noContent(res)` | 1 |
| `utils/ApiError.js` | `ApiError.badRequest(msg, details)`, `.unauthorized(msg)`, `.forbidden(msg)`, `.notFound(msg)`, `.conflict(msg)`, `.tooMany(msg)`, `.internal(msg)` — All return `{statusCode, message, details, isOperational: true}` | 1 |
| `utils/cache.js` | `MemoryCache(defaultTTLMs)` — `get(key)`, `set(key, value, ttlMs?)`, `has(key)`, `delete(key)`, `clear()`, `size`. Lazy expiry: expired entries cleaned on read. Used by progress routes (30s) and homepage sections (5 min). | 8 |
| `services/backup.service.js` | **NEW:** `createBackup()`, `listBackups()`, `restoreBackup()`, `checkTools()` — mongodump/mongorestore wrapper. Backups stored in `server/backups/` as `.gz` archives. | 7 |
| `deploy/nginx.conf.example` | **NEW (Phase 8):** HTTPS-ready Nginx template with TLS, HSTS, gzip, security headers, SPA fallback, API proxy | 8 |
| `scripts/deploy.js` | **NEW (Phase 8):** Automated deployment — git pull → install deps → build → test → backup DB → restart. Supports --dry-run, --rollback, --tag=XXX | 8 |
| `scripts/release.js` | **NEW (Phase 8):** Version bump (patch/minor/major), updates VERSION + CHANGELOG + package.json, build verification, git tag | 8 |
| `scripts/production-check.js` | **NEW (Phase 8):** 12-point pre-flight check — env, DB, JWT strength, storage, health endpoints, build artifacts | 8 |
| `server/migrations/README.md` | **NEW (Phase 8):** Migration directory with versioned, reversible, logged migration format | 8 |
| `docs/IMPLEMENTATION_MASTER_PLAN.md` | **NEW (Phase 8.5):** Project-wide implementation roadmap covering all 8 phases, future phases, file impact summary | 8.5 |
| `PROJECT_STATUS.md` | **NEW (Phase 8.5):** Final status file with version, production readiness, completed modules, pending modules, commands | 8.5 |
| `CHATGPT_CONTEXT.md` | **NEW (Phase 8.5):** Comprehensive AI session context for future development sessions | 8.5 |

### 1.9 Entry Point (app.js)

**File:** `server/src/app.js`

**Purpose:** Express application setup and configuration

**Middleware order (top to bottom):**
1. Static `/hls` mount (dev only, direct HLS file access)
2. Request ID generation (UUID v4)
3. Helmet security headers (CSP, HSTS, frameguard, etc.)
4. CORS with origin validation + `maxAge: 86400`
5. Permissions-Policy header
6. IP Blocker check (`ipBlocker`)
7. Input sanitization (`sanitize`)
8. Content-Type enforcement (`contentType`)
9. Body parsers (JSON 10mb, URL-encoded extended)
10. Request logging (Pino + response time)
11. General rate limiter (`generalLimiter`)
12. API routes mounted at `/api` (via `routes/index.js`)
13. Static client dist serving (production, SPA fallback)
14. 404 handler for unmatched routes
15. Global error handler (last)

**Boot sequence:**
1. Connect to MongoDB (with retry)
2. Start sync scheduler (non-blocking)
3. Start HTTP listener
4. **NEW:** Pre-warm homepage cache after 3s delay (`ContentService.getHomepageSections()`)
   - Non-blocking, error-tolerant
   - Ensures first user doesn't hit a cold cache (~5s build time)

**Exports:** `app` (Express instance), not auto-started — expects PM2 or `npm start` to call `listen()`

---

## 2. Client Architecture

**Location:** `client/src/` — 40 source files across 7 subdirectories

```
client/src/
├── main.jsx                        # React root entry
├── App.jsx                         # Router + Providers
├── pages/                          # 16 page components
│   ├── LoginPage.jsx
│   ├── HomePage.jsx
│   ├── SearchPage.jsx
│   ├── CategoryPage.jsx
│   ├── DetailPage.jsx
│   ├── WatchPage.jsx
│   ├── HistoryPage.jsx             # Watch history timeline
│   ├── NotFoundPage.jsx
│   └── admin/
│       ├── AdminDashboard.jsx
│       ├── AdminUsers.jsx
│       ├── AdminSecurity.jsx
│       ├── AdminOverview.jsx
│       ├── AdminContent.jsx
│       ├── AdminLogs.jsx
│       ├── SuperAdminSubscriptions.jsx  # Full subscription management
│       ├── ManagerSubscriptions.jsx      # Scoped subscription management
│       └── PlanManager.jsx               # Plan CRUD
├── components/                     # 25 reusable components
│   ├── auth/
│   │   ├── LoginForm.jsx
│   │   └── ProtectedRoute.jsx
│   ├── admin/                      # Admin dashboard + subscription components
│   │   ├── DataTable.jsx
│   │   ├── StatCard.jsx
│   │   ├── AdminRoute.jsx
│   │   ├── StatusBadge.jsx
│   │   ├── ConfirmDialog.jsx
│   │   ├── SubscriptionBadge.jsx   # Color-coded sub status badges
│   │   ├── ExpiryCountdown.jsx     # Smart expiry display (days+date, status labels)
│   │   ├── SubscriptionCard.jsx    # Subscription detail panel
│   │   ├── SubscriptionHistoryTable.jsx  # Audit log timeline
│   │   ├── PlanSelector.jsx        # Plan dropdown with preview
│   │   ├── AssignDialog.jsx        # Plan assignment + upgrade dialog
│   │   ├── RenewalDialog.jsx       # Renew with plan selector
│   │   ├── OwnershipDialog.jsx     # Ownership transfer UI
│   │   ├── OwnershipLabel.jsx      # Creator relationship display
│   │   ├── QuotaCard.jsx           # Manager quota display
│   │   └── QuotaEditor.jsx         # Manager quota editing
│   ├── content/
│   │   ├── HeroCarousel.jsx
│   │   ├── ContentCard.jsx
│   │   ├── ContentRow.jsx
│   │   ├── VideoPlayer.jsx
│   │   └── EpisodeList.jsx
│   ├── layout/
│   │   └── Header.jsx
│   └── ui/
│       ├── LoadingSkeleton.jsx
│       ├── EmptyState.jsx
│       └── ErrorState.jsx
├── api/                            # 7 API client modules
│   ├── client.js                   # Axios instance
│   ├── auth.api.js
│   ├── content.api.js
│   ├── external-source.api.js      # NEW: external stream API
│   ├── favorites.api.js            # NEW: My List API
│   ├── history.api.js              # NEW: watch history API
│   └── admin.api.js                # NEW: admin dashboard API
├── context/                        # 1 context provider
│   └── AuthContext.jsx
├── hooks/                          # 2 custom hooks
│   ├── useAuth.js                  # Re-exports from AuthContext
│   └── useContent.js               # useContent + usePaginatedContent
├── utils/                          # 1 utility module
│   └── sanitize.js                 # DOMPurify wrapper
└── styles/
    └── globals.css                 # Tailwind + design system
```

**Changes since July 1:**
- +9 pages (HistoryPage + 9 admin pages including SuperAdminSubscriptions, ManagerSubscriptions, PlanManager)
- +16 admin components (DataTable, StatCard, AdminRoute, StatusBadge, ConfirmDialog, SubscriptionBadge, ExpiryCountdown, SubscriptionCard, SubscriptionHistoryTable, PlanSelector, AssignDialog, RenewalDialog, OwnershipDialog, OwnershipLabel, QuotaCard, QuotaEditor)
- +4 API modules (external-source, favorites, history, admin)
- VideoPlayer completely refactored (see 2.2)
- WatchPage now has seamless episode switching
- DetailPage now has inline EpisodeList with clickable episodes

### 2.1 Pages

| Page | Route(s) | File | Key Features | State Coverage | Phase |
|------|----------|------|-------------|----------------|-------|
| **LoginPage** | `/login` | `pages/LoginPage.jsx` | Dark gradient background, logo, footer disclaimer. Wraps `LoginForm` | loading, error | 2 |
| **HomePage** | `/` | `pages/HomePage.jsx` | Hero carousel + category rows + Continue Watching row + My List. Fetches all sections + continue-watching independently (decoupled). Dismiss handler for Continue Watching with optimistic removal + revert | loading, error, empty | 4 |
| **SearchPage** | `/search` | `pages/SearchPage.jsx` | Search bar with DOMPurify sanitization, type filter tabs (All/Movies/Series), grouped results, genre suggestion chips, pagination | loading, error, empty, no-results | 4 |
| **CategoryPage** | `/category/:category` | `pages/CategoryPage.jsx` | Content grid with pagination, meta info (category, count), loading skeleton | loading, error, empty | 4 |
| **DetailPage** | `/:contentType/:slug` | `pages/DetailPage.jsx` | Full-width backdrop hero, poster, metadata (year/runtime/genres/rating), cast grid, trailers (YouTube iframe), **NEW: inline EpisodeList with clickable episodes** (navigates to WatchPage with episode pre-selected), Play button syncs with season tabs via `onSeasonChange` callback, similar content row, back nav, My List toggle | loading, error, not-found | 4, 8 |
| **WatchPage** | `/watch/:contentType/:slug`, `/watch/:contentType/:slug/play` | `pages/WatchPage.jsx` | VideoPlayer + episode list (series) + continue watching progress. **Seamless episode switching** — stream URL not nulled during switches (player stays mounted). Loading spinner only on initial load. Handles fullscreen, PiP, mobile layout, `initialEpisode` from location state. Complex state: `isPortrait`, `isMobileFullscreen`, `isPiP`, `selectedEpisode`, `savedProgress`, `qualities`, `externalStream`, `streamUrl` | loading, error, stream-unavailable, episode-unavailable | 5, 8 |
| **HistoryPage** | `/history` | `pages/HistoryPage.jsx` | **NEW:** Paginated watch history timeline grouped by date. Each item shows poster, title, episode name, time watched, progress %. Clear all / single item removal with ConfirmDialog. Empty state with "Browse Content" CTA | loading, error, empty, paginated | 8 |
| **NotFoundPage** | `*` | `pages/NotFoundPage.jsx` | Animated 404 message with "Go Home" button, decorative background, path display | — | 4 |
| **AdminDashboard** | `/admin` | `pages/admin/AdminDashboard.jsx` | Server stats overview: active content, user count, failed logins, blocked IPs, recent logs | loading, error | 7 |
| **AdminUsers** | `/admin/users` | `pages/admin/AdminUsers.jsx` | User management: list, create, delete, password reset with DataTable | loading, error, empty | 7 |
| **AdminContent** | `/admin/content` | `pages/admin/AdminContent.jsx` | Content management: edit metadata, toggle featured/premium, delete | loading, error, empty | 7 |
| **AdminSecurity** | `/admin/security` | `pages/admin/AdminSecurity.jsx` | Security panel: blocked IPs, session management | loading, error, empty | 7 |
| **AdminOverview** | `/admin/overview` | `pages/admin/AdminOverview.jsx` | Server health, uptime, system info | loading, error | 7 |
| **AdminLogs** | `/admin/logs` | `pages/admin/AdminLogs.jsx` | Real-time log viewer with level filtering, auto-refresh | loading, error, empty | 7 |
| **SuperAdminSubscriptions** | `/admin/subscriptions` | `pages/admin/SuperAdminSubscriptions.jsx` | Full subscription management: stats cards, tab filters, user detail panel with renew/upgrade/suspend/expire, pending plan queue, audit log timeline, ownership transfer, double-click protection | loading, error, empty | 6.5 |
| **ManagerSubscriptions** | `/admin/subscriptions` | `pages/admin/ManagerSubscriptions.jsx` | Scoped to own members: renew, suspend/resume, assign, quota info, subscription detail card, audit history, retry-with-backoff auth | loading, error, empty | 6.5 |
| **PlanManager** | `/admin/plans` | `pages/admin/PlanManager.jsx` | Plan CRUD: create/edit/delete plans, enable/disable with confirmation, type/price/duration management | loading, error, empty | 6.5 |

### 2.2 Components

| Component | File | Props | Key Features | Phase |
|-----------|------|-------|-------------|-------|
| **LoginForm** | `components/auth/LoginForm.jsx` | `onLogin()` | Username/password inputs, validation, loading spinner, error display, honeypot hidden field, Framer Motion animations | 2 |
| **ProtectedRoute** | `components/auth/ProtectedRoute.jsx` | `children` | Redirects to `/login` if not authenticated, shows nothing while verifying | 4 |
| **AdminRoute** | `components/admin/AdminRoute.jsx` | `children` | **NEW:** Redirects if user role !== 'admin' | 7 |
| **Header** | `components/layout/Header.jsx` | — | Fixed top nav, logo, Browse dropdown, search nav link, user menu, mobile hamburger menu with **History** link | 4 |
| **HeroCarousel** | `components/content/HeroCarousel.jsx` | `items` | 6s auto-play, dot navigation, fade transitions, swipe support, pause-on-hover, responsive height, genre tags, rating badge, play/info buttons, bottom-overlaid progress bar for each item | 4 |
| **ContentCard** | `components/content/ContentCard.jsx` | `item`, `progressPercent`, `onDismiss`, `isFavorited`, `onToggleFavorite` | Hover scale effect (1.05x), gradient overlay, play button + match/mylist buttons, click-to-detail, keyboard Enter support, lazy image loading, optional progress bar (1-99%), optional dismiss X button (group-hover), ref forwarding for scroll measurement | 4 |
| **ContentRow** | `components/content/ContentRow.jsx` | `title`, `items`, `loading`, `onDismiss`, `onToggleFavorite` | Horizontal scroll with left/right arrow buttons, smooth scroll animation, snap scroll to nearest card, touch/swipe support, hidden arrows (Netflix pattern), gradient fade edges, optional onDismiss passthrough | 4 |
| **VideoPlayer** | `components/content/VideoPlayer.jsx` | `url`, `qualities`, `thumbnails`, `poster`, `title`, `initialSeek`, `onTimeUpdate`, `onPiPChange`, `onError`, `autoplay` | **REFACTORED (July 2):** Two-effect architecture:
- **Effect A** (mount/unmount): Creates ArtPlayer ONCE with `url: ''` placeholder. Manages all event listeners (PiP, visibility, fullscreen, timeupdate, volume change). Callbacks via refs to avoid stale closures. Cleanup destroys ArtPlayer + HLS on unmount only.
- **Effect B** (URL changes): Manages HLS.js lifecycle inline — destroys old HLS, creates new HLS on the SAME video element. **No ArtPlayer destroy/recreate = no black flash** on episode switch. NO cleanup return (React never runs stale cleanup).
- **Quality selector:** remove-then-rebuild pattern prevents duplicates across episode switches. No longer waits for `art.ready` (player created with `url: ''` never enters ready state).
- **Muted:** `muted: false` (was `muted: autoplay`) — user gesture from DetailPage navigation carries over, allowing unmuted autoplay.
- **Volume persistence:** `getSavedVolume()` reads/writes `novastream_player_volume` to localStorage.
- ArtPlayer options: Netflix theme (#e50914), playback speed, PiP, hotkeys, AirPlay, fullscreenWeb, orientation lock. Auto-PiP on tab switch. | 5, 8 |
| **EpisodeList** | `components/content/EpisodeList.jsx` | `seasons`, `slug`, `selectedEpisodeId`, `onSelectEpisode`, `onSeasonChange` | Horizontal season tabs, scrollable episode grid, episode stills/metadata/runtime/rating, playing indicator overlay (guarded against `undefined === undefined` false positives), season info banner. `onSeasonChange` callback for DetailPage Play button sync. | 5, 8 |
| **LoadingSkeleton** | `components/ui/LoadingSkeleton.jsx` | `type` (card\|row\|detail\|hero\|episode\|text), `count` | Shimmer animation placeholders for all content types | 4 |
| **EmptyState** | `components/ui/EmptyState.jsx` | `title`, `message`, `icon`, `action` | Centered empty state with icon, title, description, optional action button | 4 |
| **ErrorState** | `components/ui/ErrorState.jsx` | `message`, `onRetry` | Error display with retry button, styled error icon | 4 |
| **DataTable** | `components/admin/DataTable.jsx` | `columns`, `data`, `loading`, `onSort` | **NEW:** Sortable table with loading skeleton. Used by admin panels. | 7 |
| **StatCard** | `components/admin/StatCard.jsx` | `title`, `value`, `icon`, `trend` | **NEW:** Metric display card with icon and trend indicator. Used by admin dashboard. | 7 |
| **StatusBadge** | `components/admin/StatusBadge.jsx` | `status`, `size` | **NEW:** Color-coded status badge (active/inactive/blocked/pending). | 7 |
| **ConfirmDialog** | `components/admin/ConfirmDialog.jsx` | `open`, `title`, `message`, `confirmLabel`, `onConfirm`, `onCancel`, `loading` | **NEW:** Modal confirmation dialog with loading state. Used by HistoryPage and admin panels. | 7 |

### 2.3 API Client Modules

| Module | File | Methods | Purpose | Phase |
|--------|------|---------|---------|-------|
| **client** | `api/client.js` | Axios instance with `baseURL: '/api'`, interceptors: request (attaches Bearer token from localStorage), response (401 → logout + redirect) | Shared HTTP client | 4 |
| **auth.api** | `api/auth.api.js` | `login(username, password)`, `logout()`, `verify()`, `refresh()` | Auth endpoints | 4 |
| **content.api** | `api/content.api.js` | `getHomepageSections()`, `getMovies()`, `getMovieBySlug()`, `getSeries()`, `getSeriesBySlug()`, `getSeriesSeasons()`, `getEpisodeById()`, `getTrending()`, `getByCategory()`, `search()`, `getStreamToken()`, `getStreamInfo()`, `getMovieStreamUrl()`, `getEpisodeStreamUrl()`, `getThumbnailUrl()`, `saveProgress()`, `getProgress()`, `getContinueWatching()`, `removeFromContinueWatching()`, `getImageUrl()` | All content + stream + progress API methods | 3, 5 |
| **external-source.api** | `api/external-source.api.js` | **NEW:** `play({ slug, contentType, quality, season, episode })`, `refresh({ slug, contentType, quality, season, episode })` | External provider streaming (YupFlix CDN). Returns `{ url, expiresAt, qualities }`. | 8 |
| **favorites.api** | `api/favorites.api.js` | **NEW:** `getFavorites()`, `toggleFavorite(contentId)`, `checkFavorite(contentId)`, `removeFavorite(contentId)` | My List CRUD | 8 |
| **history.api** | `api/history.api.js` | **NEW:** `getHistory(page, limit)` — returns `{ data: [...], pagination: {...} }`, `getRecentHistory()`, `clearHistory(contentId?)` | Watch history | 8 |
| **admin.api** | `api/admin.api.js` | **EXPANDED:** Admin dashboard (getStats, getUsers, createUser, deleteUser, resetPassword, getContent, updateContent, deleteContent, getLogs, getSystemHealth, getProcessInfo, getSessions, deleteSession, getBlockedIPs, blockIP, unblockIP, getDatabaseStats, getConfig, validateConfig). **Subscription** (createSubscription, getSubscription, getSubscriptionHistory, renewSubscription, extendSubscription, upgradeSubscription, cancelUpgradeSubscription, suspendSubscription, resumeSubscription, activateSubscription, deactivateSubscription, expireSubscription, getSubscriptionStats, getExpiringSubscriptions, checkSubscriptionAccess, getPlans, getPlan). **Ownership** (transferOwnership, transferOwnershipBatch, transferAllOwnership, getManagerQuota, updateManagerQuota). **Plans** (listPlans, createPlan, updatePlan, deletePlan). **Settings** (getSettings, getSetting, updateSetting) | Admin dashboard + subscriptions | 6.5, 7 |

### 2.4 Context & Hooks

| File | Exports | Purpose | Phase |
|------|---------|---------|-------|
| `context/AuthContext.jsx` | `AuthProvider`, `useAuth` | Token management (localStorage), verify on mount, login/logout functions, provides `{ user, token, isAuthenticated, loading, login, logout }` | 4 |
| `hooks/useAuth.js` | `useAuth` | Re-export from AuthContext for clean imports | 4 |
| `hooks/useContent.js` | `useContent(fetchFn, deps)`, `usePaginatedContent(fetchFn, deps)` | Generic data fetching hooks. `useContent`: manual fetch callback, returns `{ data, loading, error, refetch }`. `usePaginatedContent`: page-based, returns `{ items, pagination, loading, error, setPage, refetch }` | 4 |

### 2.5 Styles

| File | Contents | Phase |
|------|----------|-------|
| `styles/globals.css` | Tailwind directives (`@tailwind base/components/utilities`), Netflix design system custom utilities, `@apply` classes for `.card-hover`, `.gradient-overlay`, `.text-shadow`, `.scrollbar-hide`, `.scrollbar-thin`, `.safe-area-top`, `.safe-area-bottom`, `.h-dvh`, `.min-h-dvh`, `.rotate-hint-banner`, `.mobile-player-full`, landscape orientation media queries, `touch-action: manipulation`, iOS callout prevention (`-webkit-touch-callout`, `user-select`), 100dvh utility classes, rotate device hint animation (`@keyframes slideUp`), backdrop blur utilities | 4, 5 |

### 2.6 Utils

| File | Exports | Purpose | Phase |
|------|---------|---------|-------|
| `utils/sanitize.js` | `sanitizeHtml(dirty)`, `sanitizeSearchInput(input)`, `sanitizeObject(obj)` | DOMPurify wrapper. `sanitizeHtml`: strips all HTML tags, returns plain text. `sanitizeSearchInput`: limits to 200 chars, strips HTML, trims. `sanitizeObject`: recursively sanitizes all string values in an object | 6 |

### 2.7 App Entry & Routing

| File | Details | Phase |
|------|---------|-------|
| `main.jsx` | `ReactDOM.createRoot`, renders `<App />` wrapped in `<BrowserRouter>`, `<AuthProvider>`, `<Toaster>` (react-hot-toast) | 4 |
| `App.jsx` | Routes: `/login` → LoginPage, `/` → HomePage (protected), `/search` → SearchPage (protected), `/category/:category` → CategoryPage (protected), `/:contentType/:slug` → DetailPage (protected), `/watch/:contentType/:slug` → WatchPage (protected), `/watch/:contentType/:slug/play` → WatchPage (protected), `/history` → HistoryPage (protected), `/admin*` → Admin pages (admin-protected), `*` → NotFoundPage. Protected routes wrapped in `<ProtectedRoute>` | 4, 7, 8 |

---

## 3. CLI Architecture (novactl)

**Location:** `cli/` — 10 source files

```
cli/
├── bin/novactl                     # Entry point (Commander.js program)
├── commands/                       # 6 command files
│   ├── server.commands.js          # start, stop, restart, status, health, logs
│   ├── user.commands.js            # add (interactive + random), list, delete, pass
│   ├── ip.commands.js              # block, unblock, list
│   ├── config.commands.js          # show, path
│   ├── telegram.commands.js        # setup, status, test (Phase 7 placeholders)
│   └── sync.command.js             # sync-check (governance validator)
├── services/                       # 2 service files
│   ├── mongo.service.js            # DB operations (createUser, listUsers, deleteUser, ping)
│   └── pm2.service.js              # PM2 wrapper (start, stop, restart, status, logs)
└── utils/                          # 3 utility files
    ├── logger.js                   # Formatted console output
    ├── helpers.js                  # Shared helpers
    └── server-detector.js          # Detect running server instances
```

**16 sub-commands across 5 command groups:** (unchanged since last audit)

---

## 4. Root Files & Config

| File | Purpose | Phase |
|------|---------|-------|
| `.env` | Environment variables (gitignored). Contains: TMDB keys, MongoDB URI, JWT secrets, STREAM_SECRET, PORT, NODE_ENV, CORS_ORIGIN, LOG_LEVEL | Pre |
| `.gitignore` | Ignores node_modules, .env, uploads/, logs/, dist/, build/ | Pre |
| `ecosystem.config.js` | PM2 process config: name `novastream`, fork mode, 1 instance, max memory 1G restart, JSON logging to `logs/`, max 10 restarts, 5s delay | 1 |
| `GOVERNANCE.md` | Project rules: sync matrix (cross-reference), BRIDGE workflow (Branch → Implement → Document → Integrate → Evaluate), pre-commit checklist, drift recovery procedures | Pre |
| `requirements.txt` | Full dependency manifest with versions, organized by category (server/CLI/frontend/system/services), FFmpeg + PM2 system requirements | Pre |
| `Dockerfile` | Multi-stage build: Stage 1 builds client (Vite), Stage 2 installs server deps, Stage 3 bundles Nginx + Node.js with PM2 | 7 |
| `.dockerignore` | Excludes node_modules, .env, build artifacts, logs, docs from Docker build context | 7 |
| `docker/nginx.conf` | Nginx production config: serves client SPA, proxies /api to Node.js, security headers, gzip, SPA fallback | 7 |
| `docker/start.sh` | Production startup: checks .env, starts Nginx (daemon off), starts PM2-runtime, health check | 7 |
| `docker-compose.yml` | Dev deployment: MongoDB 7 + Node.js server with persistent volumes | 7 |
| `docker-compose.prod.yml` | Production override: builds full Dockerfile (Nginx + Node), exposes port 80 | 7 |
| `install.sh` | Linux/Mac setup: installs server deps, CLI deps, client deps, copies .env.example, creates upload dirs | Pre |
| `install.ps1` | Windows setup: same as install.sh but PowerShell. Checks admin rights, uses `npm`, copies .env.example | Pre |
| `scripts/sync-check.js` | Governance validator: checks cross-references between docs, plan, and code. Reports drift | Pre |

---

## 5. Complete API Endpoint Map

**Base URL:** `/api` (dev proxy: `localhost:5173/api/*` → `localhost:5000/api/*`)

**Total: ~55 API endpoints** across 11 route modules

### 5.1 Public Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `GET` | `/api/health` | None | General | Server health, uptime, node version, environment |

### 5.2 Auth Endpoints

| Method | Path | Auth | Rate Limit | Validators | Description |
|--------|------|------|------------|------------|-------------|
| `POST` | `/api/auth/login` | None | Auth (5/min) + IP Blocker | `loginSchema` | Login, returns JWT + user info |
| `POST` | `/api/auth/logout` | JWT | General | — | Invalidate current session |
| `GET` | `/api/auth/verify` | JWT | General | — | Verify token is valid |
| `POST` | `/api/auth/refresh` | JWT | General | — | Refresh token (rotation) |

### 5.3 Content Endpoints

| Method | Path | Auth | Rate Limit | Validators | Description |
|--------|------|------|------------|------------|-------------|
| `GET` | `/api/homepage/sections` | JWT | General | — | All homepage sections (featured, trending, categories) **cached 5 min** |
| `GET` | `/api/movies` | JWT | General | Pagination | Browse movies with sort + genre filter |
| `GET` | `/api/movies/:slug` | JWT | General | `slugParamSchema` | Movie details **cached 5 min** |
| `GET` | `/api/series` | JWT | General | Pagination | Browse series with sort + genre filter |
| `GET` | `/api/series/:slug` | JWT | General | `slugParamSchema` | Series details with seasons + episodes. **External source fallback** for missing DB season/episode data. **cached 5 min** |
| `GET` | `/api/series/:slug/seasons` | JWT | General | `slugParamSchema` | Series seasons only |
| `GET` | `/api/episode/:id` | JWT | General | — | Episode details |
| `GET` | `/api/trending` | JWT | General | Pagination | Trending content |
| `GET` | `/api/categories/:category` | JWT | General | — | Content by category (Hollywood, Bollywood, Korean, South Indian) |
| `GET` | `/api/images/:type/:size/*` | None | General | Size validation | TMDB image proxy |

### 5.4 Search Endpoints

| Method | Path | Auth | Rate Limit | Validators | Description |
|--------|------|------|------------|------------|-------------|
| `GET` | `/api/search?q=&type=&page=` | JWT | General | `searchSchema` | Full-text search + TMDB fallback |

### 5.5 Stream Endpoints (HLS)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `POST` | `/api/stream/token` | JWT | Stream (30/min) | Generate signed stream token (24h expiry) |
| `GET` | `/api/stream/movie/:slug/index.m3u8` | Stream Token | Stream | Movie master playlist (all qualities) |
| `GET` | `/api/stream/movie/:slug/:quality/index.m3u8` | Stream Token | Stream | Movie quality variant playlist |
| `GET` | `/api/stream/movie/:slug/:quality/segments/:segment` | Stream Token | Stream | Movie TS segment (range 206 support) |
| `GET` | `/api/stream/episode/:id/index.m3u8` | Stream Token | Stream | Episode master playlist |
| `GET` | `/api/stream/episode/:id/:quality/index.m3u8` | Stream Token | Stream | Episode quality variant |
| `GET` | `/api/stream/episode/:id/:quality/segments/:segment` | Stream Token | Stream | Episode TS segment (range 206 support) |
| `GET` | `/api/stream/info/:type/:slug` | JWT | General | Stream metadata (available qualities) |

### 5.6 Progress Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `POST` | `/api/progress/save` | JWT | Stream (30/min) | Save/update playback progress (max 200 entries). Fire-and-forget from client. |
| `GET` | `/api/progress/:type/:id` | JWT | General | Get saved progress for content/episode |
| `GET` | `/api/progress/continue-watching` | JWT | General | Get all items with progress. **3 batch queries** (was N+1). `.lean()` everywhere. **30-second in-memory cache**. Filters out near-complete items (≤90s remaining). |
| `DELETE` | `/api/progress/continue-watching/:id` | JWT | General | Remove item from watch history |

### 5.7 Thumbnail Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `GET` | `/api/thumbnails/:type/:id` | JWT | Stream (30/min) | Get/generate seek preview sprite sheet |

### 5.8 History Endpoints (NEW)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `GET` | `/api/history?page=&limit=` | JWT | General | Paginated watch history. Populates content + episode data. Defensive trim at 210 entries. |
| `GET` | `/api/history/recent` | JWT | General | Lightweight: last 5 watched items (title + poster only) |
| `DELETE` | `/api/history` | JWT | General | Clear all watch history, or single item if `contentId` in body |

### 5.9 Favorites Endpoints (NEW)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `GET` | `/api/favorites` | JWT | General | List all favorites, populated with full content data. Sorted by addedAt desc. Defensive trim at 210 entries. |
| `POST` | `/api/favorites/:contentId` | JWT | Stream (30/min) | Toggle add/remove favorite. Caps at 200 items. Returns `{ isFavorited: bool }`. |
| `GET` | `/api/favorites/check/:contentId` | JWT | General | Check if specific content is favorited |
| `DELETE` | `/api/favorites/:contentId` | JWT | Stream (30/min) | Explicitly remove from favorites |

### 5.10 External Source Endpoints (NEW)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `POST` | `/api/external/play` | JWT | General | Get streaming URL from external provider. Accepts `{ slug, contentType, quality, season?, episode? }`. Returns `{ url, expiresAt, qualities }`. |
| `POST` | `/api/external/refresh` | JWT | General | Refresh an expiring stream token before it expires |

### 5.11 Admin Endpoints (NEW)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `GET` | `/api/admin/users` | JWT + Admin | Stream (30/min) | List all users |
| `POST` | `/api/admin/users` | JWT + Admin | Stream (30/min) | Create user |
| `DELETE` | `/api/admin/users/:id` | JWT + Admin | Stream (30/min) | Delete user |
| `POST` | `/api/admin/users/:id/reset` | JWT + Admin | Stream (30/min) | Reset password |
| `GET` | `/api/admin/content` | JWT + Admin | Stream (30/min) | Content management list |
| `PUT` | `/api/admin/content/:id` | JWT + Admin | Stream (30/min) | Update content metadata |
| `DELETE` | `/api/admin/content/:id` | JWT + Admin | Stream (30/min) | Delete content |
| `GET` | `/api/admin/stats` | JWT + Admin | Stream (30/min) | Dashboard stats |
| `GET` | `/api/admin/logs` | JWT + Admin | Stream (30/min) | Recent log entries |

---

## 6. Complete Database Schema Map

### 6.1 Content Collection
- **Storage:** `contents` collection in MongoDB
- **Total Fields:** 35+ (title, slug, contentType, genres, cast, streams, categories, sourceId, sourceSite, etc.)
- **Total Indexes:** 8 (unique on slug, text on title+overview, compound on type+active+featured, etc.)
- **Virtuals:** `type` (Movie/Series), `posterUrl` (full TMDB URL), `backdropUrl` (full TMDB URL)
- **Relations:** `similarContent[]` (self-ref to Content), Seasons/Episodes (via ref queries)
- **Searchable:** Text index on `title`, `overview`, `tagline`
- **External source:** `sourceId` + `sourceSite` fields for content from external providers (not synced via TMDB)

### 6.2 Season Collection
- **Storage:** `seasons` collection
- **Total Fields:** 10 (contentId, tmdbId, seasonNumber, name, overview, posterPath, airDate, episodeCount)
- **Indexes:** 1 unique compound on `{contentId, seasonNumber}`
- **Relations:** `contentId` → Content

### 6.3 Episode Collection
- **Storage:** `episodes` collection
- **Total Fields:** 15+ (seasonId, contentId, tmdbId, episodeNumber, name, overview, stillPath, airDate, runtime, voteAverage, streams[], downloadEnabled)
- **Indexes:** 1 unique compound on `{seasonId, episodeNumber}`
- **Relations:** `seasonId` → Season, `contentId` → Content
- **Note:** Externally-sourced series may have NO Episode documents in DB (data fetched live from external API)

### 6.4 User Collection
- **Storage:** `users` collection
- **Total Fields:** 12+ (username, passwordHash, displayName, role, isActive, loginHistory[], watchHistory[], watchlist[], lastLoginAt, lastLoginIp, createdAt, updatedAt)
- **Indexes:** 1 unique on `username`
- **Relations:** `createdBy` → User (self-ref)
- **Watch History:** Embedded array with `{contentId, episodeId, progress, duration, watchedAt}`, max 200 entries (auto-trimmed)
- **Favorites (watchlist):** Embedded array with `{contentId, addedAt}`, max 200 entries

### 6.5 Session Collection
- **Storage:** `sessions` collection
- **Total Fields:** 7 (userId, token hash, ip, userAgent, isActive, expiresAt)
- **Indexes:** 3 (`{userId}`, `{token}`, `{expiresAt}` TTL auto-expiry)
- **Relations:** `userId` → User

### 6.6 BlockedIP Collection
- **Storage:** `blockedips` collection
- **Total Fields:** 8 (ip, reason, blockedBy, blockedAt, expiresAt, attemptCount, isActive)
- **Indexes:** 1 compound on `{ip, isActive}`

---

## 7. Middleware Pipeline (Request Flow)

```
Incoming Request
    │
    ▼
┌─────────────────────────────┐
│ 1. Static /hls (dev only)    │  ← Direct HLS file access (no auth)
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 2. Request ID               │  ← UUID v4, attach to req.id
│    (app.js — global)        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 3. Helmet Security Headers  │  ← CSP, HSTS, frameguard, xssFilter, noSniff, hidePoweredBy
│    (app.js — global)        │     Cross-Origin-Resource-Policy, Permissions-Policy
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 4. CORS                     │  ← Validates origin, maxAge: 86400
│    (app.js — global)        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 5. Permissions-Policy       │  ← Blocks camera, microphone, geolocation, etc.
│    (app.js — global)        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 6. IP Blocker               │  ← Checks BlockedIP collection, returns 403 if blocked
│    (app.js — global)        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 7. Input Sanitization       │  ← Strips $ and . (NoSQL injection), HPP protection
│    (app.js — global)        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 8. Content-Type Enforcement │  ← Validates JSON content-type on mutating methods
│    (app.js — global)        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 9. Body Parsers             │  ← JSON (10mb), URL-encoded, JSON error handling
│    (app.js — global)        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 10. Request Logger          │  ← Pino, logs method/url/ip/status/duration
│    (app.js — global)        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 11. Rate Limiter (General)  │  ← 100 requests / 15 min; slow down after 50
│    (app.js — global)        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 12. Route Matcher           │  ← /api/* routes
│    (routes/index.js)        │     Exact ordering: health → auth → stream →
│                             │     thumbnails → images → search → content →
│                             │     progress → external → favorites → history → admin
└─────────────────────────────┘
    │
    ▼
┌───────────────────────────────┐
│ 13. Route-Specific Middleware │  ← authenticate, authLimiter, streamLimiter,
│    (per-route)                │     requireStreamToken, validate(ZodSchema), adminOnly
└───────────────────────────────┘
    │
    ▼
┌───────────────────────────────┐
│ 14. Controller / Handler      │  ← Processes request, calls service layer
│    (per-route)                │
└───────────────────────────────┘
    │
    ▼
┌───────────────────────────────┐
│ 15. Response (ApiResponse)    │  ← success/paginated/created with standardized JSON
│    (or Error)                 │
└───────────────────────────────┘
    │
    ▼
┌───────────────────────────────┐
│ 16. Global Error Handler      │  ← Catches all errors: Zod, Mongoose, Multer, JSON,
│    (last middleware)          │     ApiError. Stack traces in dev, generic in prod
└───────────────────────────────┘
```

---

## 8. Security Layers

| Layer | What | Where | Phase |
|-------|------|-------|-------|
| **L1: CSP** | Content Security Policy via Helmet — restricts script-src, style-src, img-src, media-src, connect-src, font-src. Blocks frames and objects | `app.js` | 6 |
| **L2: HSTS** | HTTP Strict Transport Security — 1 year, includeSubDomains | `app.js` | 6 |
| **L3: Permissions-Policy** | Blocks camera, microphone, geolocation, interest-cohort, payment, picture-in-picture | `app.js` | 6 |
| **L4: NoSQL Injection** | `express-mongo-sanitize` strips `$` and `.` operators from body/query/params | `middleware/sanitize.middleware.js` | 6 |
| **L5: HTTP Parameter Pollution** | `hpp` middleware rejects duplicate query parameters | `middleware/sanitize.middleware.js` | 6 |
| **L6: Content-Type Enforcement** | Validates `Content-Type: application/json` on POST/PUT/PATCH/DELETE | `middleware/contentType.middleware.js` | 6 |
| **L7: Rate Limiting** | General (100/15min), Auth (5/min), Stream (30/min) — per IP | `middleware/rateLimiter.middleware.js` | 2 |
| **L8: IP Blocking** | DB-backed IP blocklist with auto-block on abuse, temporary/permanent bans | `middleware/ipBlocker.middleware.js` | 2 |
| **L9: IP Reputation** | Tracks login attempts per IP, auto-blocks after threshold, honeypot detection | `middleware/ipBlocker.middleware.js` | 2 |
| **L10: Honeypot** | Hidden `website` field in login form — bots fill it, server auto-blocks IP | AuthController + LoginForm | 6 |
| **L11: JWT Auth** | `Authorization: Bearer` token required for all protected endpoints, verified with `jsonwebtoken` | `middleware/auth.middleware.js` | 2 |
| **L12: Session Mgmt** | Server-side session store, single session per user, TTL auto-expiry, verify checks session validity | `auth.service.js` + `Session.model.js` | 2 |
| **L13: Stream Token** | Separate JWT for HLS access (HS256, 24h expiry, optional IP binding) | `stream.service.js` + `middleware/streamAuth.middleware.js` | 5 |
| **L14: Path Traversal** | Sanitizes segment filenames, validates resolved path is within stream directory | `stream.service.js` — `serveSegment()` | 5 |
| **L15: XSS Prevention** | Client-side: DOMPurify for search input, search results, and form inputs | `client/src/utils/sanitize.js` | 6 |
| **L16: Auth Guard** | React ProtectedRoute redirects unauthenticated users to /login | `client/src/components/auth/ProtectedRoute.jsx` | 4 |
| **L17: Admin Guard** | React AdminRoute redirects non-admin users | `client/src/components/admin/AdminRoute.jsx` | 7 |
| **L18: CORS** | Allows only configured origin, with maxAge for preflight caching | `app.js` | 1 |
| **L19: Request Validation** | Zod schemas validate all inputs before controller — returns field-level 400 errors | `validators/*`, `middleware/validate.middleware.js` | 2 |
| **L20: Log Redaction** | Pino auto-redacts passwords, tokens, and cookies from logs | `config/logger.js` | 1 |

---

## 9. Phase-by-Phase Feature Map

### Pre-Phase: Infrastructure & Setup (10/10)
- Documentation files (6 docs)
- TMDB API setup (key, token, image config)
- MongoDB Atlas (cluster, user, connection)
- Environment config (Zod validation)
- `novactl` CLI framework (Commander.js)
- GOVERNANCE.md + sync-check.js
- install.sh + install.ps1 + requirements.txt

### Phase 1: Foundation (11/11)
- Express server with layered architecture
- 6 Mongoose models with indexes
- Zod-validated env config
- Pino structured logger
- MongoDB connection with retry
- ApiResponse + ApiError utilities
- Global error handler (Zod/Mongoose/Multer/ApiError)
- PM2 ecosystem config
- TMDB sync service (movies/series/seasons/episodes)
- Content seed script

### Phase 2: Security & Auth (10/10)
- JWT auth (login/logout/verify/refresh)
- User model + bcrypt hashing
- Session management (single session, TTL)
- Rate limiting (3 tiers + slow down)
- IP blocking (DB-backed, auto-block)
- Admin auth middleware
- Zod validation schemas
- `novactl` user/ip commands
- Login page UI (dark, no registration)

### Phase 3: Content API (7/7)
- Homepage sections (featured/trending/categories)
- Movies browse + detail
- Series browse + detail + seasons
- Search (DB text + TMDB fallback)
- Category filtering (4 regions)
- Image proxy + caching

### Phase 4: Frontend Core (12/12)
- Vite + React + Tailwind + Framer Motion
- Login page with validation + honeypot
- ProtectedRoute + AuthContext
- HeroCarousel (auto-play, dots, swipe)
- ContentCard (hover preview, lazy images)
- ContentRow (scroll, arrows, snap)
- CategoryPage (grid, pagination)
- SearchPage (tabs, chips, pagination)
- DetailPage (backdrop, cast, trailers)
- LoadingSkeleton/EmptyState/ErrorState
- Responsive design (mobile-first)
- Header (nav, search, user menu)

### Phase 5: Video Player (8/8) + Enhancements
- ArtPlayer + HLS.js integration (error recovery, Netflix theme)
- HLS streaming backend (8 endpoints, JWT tokens, range support)
- Episode selector UI (season tabs, episode grid)
- Multi-quality selector (480p/720p/1080p/4K)
- Thumbnail seek preview (FFmpeg + placeholder)
- Continue watching progress (throttled saves, race-free)
- Mobile/iOS optimizations (100dvh, AirPlay, orientation lock)
- Picture-in-picture (auto on tab switch)

### Phase 6: Security Hardening (9/9)
- NoSQL injection prevention
- Content-Type enforcement
- Enhanced CSP + security headers
- Client-side XSS prevention (DOMPurify)
- Security audit scripts
- Honeypot form fields
- Rate limiting + IP blocking
- `novactl` health/management commands

### Phase 6.5: Subscription System (14/14) — COMPLETED
- Subscription plan config + role/permission system
- SubscriptionPlan model + AuditLog model
- SubscriptionService (14 methods: CRUD, actions, upgrade/cancel, access checks)
- Subscription validators (15+ Zod schemas)
- Subscription routes (15 management endpoints) + plan routes (5 CRUD) + ownership routes (8)
- Frontend: SuperAdminSubscriptions, ManagerSubscriptions, PlanManager pages
- Frontend: AssignDialog, RenewalDialog, OwnershipDialog
- Frontend: ExpiryCountdown, SubscriptionBadge, SubscriptionCard, SubscriptionHistoryTable
- Frontend: PlanSelector, QuotaCard, QuotaEditor, OwnershipLabel
- adminLimiter (60 req/min) added to rate limiter
- Ownerhip transfer (single, batch, all) + manager quotas + system settings
- Pending plan upgrade system (queue, cancel, auto-activate)
- Lifetime subscription removed (July 4, 2026)
- All subscription mutations tracked via AuditLog

### Phase 7: Admin Dashboard (12/12) — COMPLETED
- Admin API routes (21 endpoints: users, content, stats, logs, health, sessions, config, security, activity)
- Admin frontend components (DataTable, StatCard, StatusBadge, ConfirmDialog, AdminRoute)
- Admin page components (Dashboard, Overview, Users, Content, Logs, Security)
- System service (getCpuUsage, getMemoryInfo, getDiskInfo, getProcessInfo, getDatabaseStats)
- Docker configuration (Dockerfile, docker-compose, Nginx)
- Error pages & 404 handling

### Phase 8: Polish & Optimization (10/10) — COMPLETED

### Phase 8: Production Audit — 🔒 FROZEN ✅ (14/14 findings certified)

| Batch | Items | Focus | Fixes |
|-------|-------|-------|-------|
| **A** | P8-RUNTIME-001 | Runtime stability | TMDB timeout (10s), IPv4 DNS, sanitized error logging |
| **B** | PPR-004 → PPR-008 | Operations & resilience | DB retry logic (5×5s), health DB status, migration runner |
| **C** | PPR-009 → PPR-014 | Security & deployment | Docker build fix, Nginx CSP + security headers, deploy config sync |

**Key changes:** 6 files modified (app.js, tmdb.service.js, database.js, health.routes.js, Dockerfile, docker/nginx.conf, deploy/nginx.conf.example) + 2 new files (migrate.js, phase-08-production/CERTIFICATION.md)
- **Continue Watching optimization:** 3 batch queries (was N+1 up to 30), `.lean()` everywhere, 30-second in-memory cache. Reduced from ~1.2s to ~50ms.
- **Homepage cache pre-warm:** Background async call 3s after startup — first user never hits cold cache (~5s build).
- **Search route re-ordering:** Moved before content routes — saves one redundant `Session.findOne()` per search request.
- **External source season/episode fallback:** Fetches series structure from external API when DB has no Season/Episode docs. Synthetic `_id` fallback (`s{season}e{episode}`).
- **"Playing" badge fix:** Guarded `selectedEpisodeId && episode._id &&` comparison to prevent `undefined === undefined` false positives.
- **DetailPage inline EpisodeList:** Clickable episodes navigate to WatchPage with `initialEpisode` via React Router state. Play button syncs with season tabs via `onSeasonChange`.
- **VideoPlayer refactoring:**
  - Two-effect architecture: ArtPlayer created once (mount), HLS swapped in-place (URL changes). No more black flash on episode switch.
  - Quality selector: remove-then-rebuild prevents duplicates across switches. No longer waits for `art.ready`.
  - `muted: false` — user gesture from DetailPage allows unmuted autoplay.
  - Volume persistence via localStorage (`novastream_player_volume`).
- **Watch History page:** Paginated timeline grouped by date. Full population of content + episode data. Clear all / single item removal.
- **Favorites (My List):** Toggle add/remove, check status, 200-item cap, populated listing.
- **HistoryPage API fix:** `r.data.data` → `r.data` — response unwrapping mismatch fixed (bug: history was always showing empty).

### Future Features (Unplanned)
| Feature | Status | Notes |
|---------|--------|-------|
| Telegram bot | 📋 Planned | CLI placeholders exist |
| Video upload endpoint | ⬜ Future | Upload + FFmpeg transcoding |
| Anti-debug scripts | ⬜ Future | Listed in §14 of SERVER_PLAN.md |
| Caching/CDN | ⬜ Future | Redis layer |
| Subtitle support | ⬜ Future | VTT/SRT serving |
| Download support | ⬜ Future | `downloadEnabled` field exists |
| Testing | ⬜ Future | No test files yet |
| Performance optimization | ⬜ Future | Further optimization after audit |
| Lifetime subscriptions | ❌ Removed July 4 | Plan config, model field, service methods, UI buttons — all removed |

---

## 10. Environment Variables

| Variable | Validated | Required | Description | Default |
|----------|-----------|----------|-------------|---------|
| `PORT` | Zod | Yes | Server port | `5000` |
| `NODE_ENV` | Zod | Yes | Environment | `development` |
| `MONGODB_URI` | Zod | Yes | MongoDB connection string | — |
| `JWT_SECRET` | Zod | Yes | JWT signing secret | — |
| `JWT_EXPIRES_IN` | Zod | No | Token expiry | `7d` |
| `STREAM_SECRET` | Zod | Yes | HLS stream token secret | — |
| `STREAM_TOKEN_EXPIRY_HOURS` | Zod | No | Stream token lifetime | `24` |
| `TMDB_API_KEY` | Zod | Yes | TMDB API v3 key | — |
| `TMDB_ACCESS_TOKEN` | Zod | Yes | TMDB API v4 token | — |
| `TMDB_IMAGE_BASE` | Zod | No | TMDB image CDN | `https://image.tmdb.org/t/p` |
| `CORS_ORIGIN` | Zod | No | Allowed CORS origin | `http://localhost:5173` |
| `LOG_LEVEL` | Zod | No | Pino log level | `info` |
| `TELEGRAM_BOT_TOKEN` | Zod | No | Telegram bot token | — |
| `TELEGRAM_CHAT_ID` | Zod | No | Admin chat ID | — |
| `IP_BLOCK_THRESHOLD` | Zod | No | Failed attempts before auto-block | `5` |

**Total: 15 env vars validated via Zod, 8 required (fail-fast on startup)**

---

## 11. Known Gaps & Technical Debt

### Active Issues
1. **Controllers/README.md** — Placeholder file that should be removed. Dead code.
2. **HistoryPage single-item delete** — `handleClearItem` passes `item.contentId || item._id`, but the server's DELETE `/api/history` endpoint filters by `entry.contentId` only. If the fallback `item._id` is used (which is the watchHistory entry `_id`), the delete won't match.
3. **Continue Watching pagination** — Sorts + limits in-memory after fetching all entries (200 max, works but doesn't scale).
4. **Cast images** — Cast profile images use direct TMDB URLs instead of the image proxy.
5. **Episode list for series** — No server-side pagination for large seasons (100+ episodes).
6. **Inconsistent error formatting** — Some routes return `res.status().json()` directly instead of using ApiResponse.
7. **Variable shadowing** — `content` variable reused across scopes in some route handlers.
8. **Magic numbers** — `90` second threshold for near-complete filter; `210` entry trim threshold.
9. **State type safety** — `episodeDocs` TDZ bug was fixed but the pattern of referencing destructured variables inside Promise.all callbacks could recur.
10. **VideoPlayer quality selector stale levels** — If episodes have different encoding profiles, the selector shows options from the first episode. Minor (unlikely in practice).

### Fixed Issues (July 2, 2026)
- ~~**Continue Watching performance** — N+1 queries (up to 30 individual lookups). Now 3 batch queries + `.lean()`.~~
- ~~**Homepage cold start** — First user triggered ~5s cache-miss build. Now pre-warmed on startup.~~
- ~~**Search double auth** — Search requests went through authenticate twice. Now mounted before content routes.~~
- ~~**"0 Seasons 0 Episodes"** — Externally-sourced series showed zero counts. Now fetches season/episode data from external source.~~
- ~~**"Playing" badge on all episodes** — `undefined === undefined` false positives. Now guarded.~~
- ~~**VideoPlayer black flash on episode switch** — ArtPlayer destroyed/recreated on every URL change. Now two-effect architecture.~~
- ~~**VideoPlayer always muted** — `muted: autoplay` forced mute. Now `muted: false`.~~
- ~~**Duplicate quality selectors** — `setting.add()` called on every MANIFEST_PARSED. Now remove-then-rebuild.~~
- ~~**Progress routes TDZ** — `ReferenceError: episodeDocs` in Batch 3. Now separated from Promise.all.~~
- ~~**HistoryPage empty state** — API response unwrapping mismatch (`r.data.data` vs `r.data`). Always showed empty.~~

### Related Research Documents

| Document | Location | Status |
|----------|----------|--------|
| **YupFlix Streaming API** | `docs/research/YUPFLIX_STREAMING_API.md` | ✅ Series verified, movies pending |
| **TMDB API Research** | `docs/research/TMDB_API_RESEARCH.md` | ✅ Complete |
| **API Findings (Wavestream)** | `docs/reference/API_FINDINGS.md` | ✅ Captured from scraping |

---

*End of Audit Index — Use this document to navigate the full project during refinement phases.*
