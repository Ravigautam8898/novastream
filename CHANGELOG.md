# NovaStream — Changelog

> **Format:** [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> **Versioning:** [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
> **File:** `VERSION` at project root

---

## [1.0.0-RC] — 2026-07-04

### 🚀 Release Candidate — All 8 Phases Complete + Certified

This is the initial **Release Candidate** for NovaStream. All core systems are complete and production-ready.

#### Pre-Phase: Infrastructure & Setup
- ✅ Documentation (6 docs), TMDB API, MongoDB Atlas, Zod env validation
- ✅ `novactl` CLI framework (Commander.js, 16 sub-commands)
- ✅ Project governance (GOVERNANCE.md, sync-check.js)
- ✅ Install scripts (Linux/Mac/Windows), requirements.txt

#### Phase 1: Foundation
- ✅ Express server with layered architecture
- ✅ 6 Mongoose models with indexes, Pino structured logger
- ✅ API response utilities, global error handler
- ✅ TMDB sync service, content seed script

#### Phase 2: Security & Auth
- ✅ JWT auth (login/logout/verify/refresh), bcrypt hashing
- ✅ Session management (single session, TTL)
- ✅ Rate limiting (3 tiers + slow down), IP blocking
- ✅ Admin middleware, Zod validation schemas
- ✅ Login page UI (dark, no registration)

#### Phase 3: Content API
- ✅ Homepage sections, movies/series browse + detail
- ✅ Search (DB text + TMDB fallback)
- ✅ Category filtering (4 regions), image proxy

#### Phase 4: Frontend Core
- ✅ Vite + React + Tailwind + Framer Motion
- ✅ HeroCarousel, ContentCard, ContentRow
- ✅ Category, Search, Detail pages with full state coverage
- ✅ Loading skeletons, empty/error states, responsive design

#### Phase 5: Video Player
- ✅ ArtPlayer + HLS.js integration (Netflix theme)
- ✅ HLS streaming backend (8 endpoints, JWT tokens)
- ✅ Episode selector, multi-quality selector
- ✅ Thumbnail seek preview, continue watching
- ✅ Mobile/iOS optimizations, Picture-in-picture

#### Phase 6: Security Hardening
- ✅ NoSQL injection prevention, Content-Type enforcement
- ✅ CSP + security headers, XSS prevention (DOMPurify)
- ✅ Honeypot form fields, log redaction

#### Phase 6.5: Subscription System 🏆 CERTIFIED 🔒
- ✅ Full subscription lifecycle (14 service methods)
- ✅ Plan management, upgrade queue, auto-activation
- ✅ Admin UI (SuperAdmin/Manager pages)
- ✅ Audit logging, ownership transfer, quota management

#### Phase 6.6: Manager Ownership Control 🏆 CERTIFIED 🔒
- ✅ Ownership-based access control
- ✅ Manager scoping (create/view/manage own members only)

#### Phase 7: Production Operations 🏆 CERTIFIED 🔒
- ✅ Interactive Admin CLI (`npm run admin`) — 6 sections
- ✅ Backup/restore (mongodump-based with double confirmation)
- ✅ Health endpoints (`/api/health/simple` + `/api/health/full`)
- ✅ Security audit script (`npm run security:check`)
- ✅ Log management (view tail, clear with SA confirmation)

#### Phase 8: Deployment Pipeline 🏆 CERTIFIED 🔒
- ✅ Docker (multi-stage build, compose with MongoDB)
- ✅ PM2 ecosystem with auto-restart
- ✅ Nginx template (HTTPS-ready, TLS, HSTS, gzip)
- ✅ Deploy script (automated with rollback support)
- ✅ Release script (version bump + changelog + git tag)
- ✅ Production check (12-point pre-flight)
- ✅ `.env.example` with dev/staging/production sections
- ✅ `DEPLOYMENT.md`, migration framework

### Known Issues
- `mongodump` required for backup feature (install MongoDB Database Tools)
- Controllers/README.md placeholder file (dead code)
- HistoryPage single-item delete edge case

### Future Roadmap
- **Phase 9:** Monitoring & Observability — metrics, alerts, dashboards
- **Phase 10:** Mobile & Client Improvements — PWA, push notifications, offline playback
- **Deferred:** Manager Reseller System (full reseller dashboard)
- **Future:** Telegram bot, video upload, Redis caching, testing
