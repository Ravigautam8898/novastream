// server/src/routes/index.js
// Route aggregator — mounts all route modules under /api
//
// ── API Namespace Conventions ──
//
//   /api/auth/*              → Authentication (login, logout, verify, refresh)
//   /api/health/*            → System health checks (public)
//   /api/stream/*            → HLS streaming (signed token auth via ?token=)
//   /api/thumbnails/*        → Seek preview sprite sheets (public)
//   /api/images/*            → Image proxy (TMDB, external)
//   /api/search/*            → Content search
//   /api/movies/*, /series/* → Content browsing (no prefix — top-level for cleaner URLs)
//   /api/homepage/*          → Homepage sections
//   /api/episode/*           → Episode details
//   /api/trending/*          → Trending content
//   /api/categories/*        → Category browsing
//   /api/progress/*          → Watch progress, continue-watching
//   /api/external/*          → External content source streaming proxy
//   /api/favorites/*         → User watchlist (My List)
//   /api/history/*           → Watch history
//   /api/admin/*             → Admin management (adminOnly: super_admin + manager)
//   /api/admin/subscriptions/*  → Subscription CRUD (adminOnly)
//   /api/admin/ownership/*      → Ownership transfer (requireSuperAdmin)
//   /api/admin/subscription/plans/* → Plan CRUD (requireSuperAdmin)
//
// ── Mounting Order Rules ──
//
//   1. Public routes (health, thumbnails, images) are mounted first — no auth dependency.
//   2. Stream routes use ?token= query-param auth (not Authorization header) and are
//      mounted before search/content to avoid Bearer token middleware intercepting them.
//   3. Search routes have global `router.use(authenticate)` and are mounted before
//      content routes to avoid running through content's per-route authenticate twice.
//   4. Content routes are mounted without a prefix, making them top-level (/api/movies,
//      /api/series, etc.) for cleaner public-facing URLs. Each handler applies its own
//      per-route `authenticate` + `requireActiveSubscription` middleware.
//   5. User-facing data routes (progress, external, favorites, history) are mounted
//      after content — order doesn't matter here since they use their own prefixes.
//   6. Admin routes are mounted last — authenticate + adminOnly are applied at the mount
//      point (not per-route) via router.use() middleware chaining.
//
//   When adding a NEW route module:
//     - Public routes → mount before search/content (before line 80)
//     - Protected routes → mount after content (after line 88)
//     - Admin routes → mount at /admin/* prefix with authenticate + adminOnly
//     - If your route needs to bypass Bearer token auth (e.g., ?token=), mount before
//       search to avoid the search router's global authenticate middleware.

const { Router } = require('express');

const router = Router();

// ═══════════════════════════════════════════════════════════
//  Tier 1: Public & Mixed-Access Routes
//  Health/thumbnails/images are fully public. Auth routes are
//  mixed — login/verify-without-token are public, logout/refresh
//  require authentication. Mounted first to enable auth flow.
// ═══════════════════════════════════════════════════════════

// ── Health Routes (public) ──
router.use('/health', require('./health.routes'));

// ── Auth Routes (unauthenticated + authenticated endpoints) ──
router.use('/auth', require('./auth.routes'));

// ── Image Proxy (public TMDB image proxy) ──
const imageProxy = require('../middleware/imageProxy.middleware');
router.get('/images/:type/:size/*', imageProxy);

// ── Thumbnail Routes (public seek preview sprites) ──
// No authentication required — fetched natively by browser <img> tags
// (ArtPlayer's seek preview cannot send JWT Authorization headers).
router.use('/thumbnails', require('./thumbnail.routes'));

// ═══════════════════════════════════════════════════════════
//  Tier 2: ?token= Auth Routes (non-Bearer auth)
//  Must come before search/content to avoid Bearer token middleware.
// ═══════════════════════════════════════════════════════════

// ── Stream Routes (HLS streaming with signed ?token= auth) ──
router.use('/stream', require('./stream.routes'));

// ═══════════════════════════════════════════════════════════
//  Tier 3: Authenticated Content Routes
//  Search has global router.use(authenticate).
//  Content routes use per-route authenticate (no global auth).
//  Search must come before content to avoid double authenticate.
// ═══════════════════════════════════════════════════════════

// ── Search Routes (global authenticate, mounted before content) ──
router.use('/search', require('./search.routes'));

// ── Content Routes (no prefix — top-level /api/movies, /api/series, etc.) ──
// Each handler applies its own per-route authenticate + requireActiveSubscription.
router.use(require('./content.routes'));

// ═══════════════════════════════════════════════════════════
//  Tier 4: Authenticated User Data Routes
//  Per-user data (progress, favorites, history, external sources).
//  Order among these doesn't matter — distinct prefixes.
// ═══════════════════════════════════════════════════════════

// ── Progress Routes (continue watching, playback position) ──
router.use('/progress', require('./progress.routes'));

// ── External Content Source Routes (streaming proxy for external providers) ──
router.use('/external', require('./external-source.routes'));

// ── Favorites Routes (My List / watchlist) ──
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/adminAuth.middleware');
router.use('/favorites', authenticate, require('./favorites.routes'));

// ── History Routes (watch history) ──
router.use('/history', authenticate, require('./history.routes'));

// ═══════════════════════════════════════════════════════════
//  Tier 5: Admin Routes (authenticate + adminOnly)
//  Mounted last. Both auth middleware are applied at mount point.
//  adminOnly accepts super_admin and manager roles.
// ═══════════════════════════════════════════════════════════

// ── Admin Dashboard Routes ──
// Manager is scoped to own Members via ownership checks in handlers.
router.use('/admin', authenticate, adminOnly, require('./admin.routes'));

// ── Subscription Routes (CRUD + lifecycle management) ──
// Ownership validated per-route. SA-only operations use requireSuperAdmin.
router.use('/admin/subscriptions', authenticate, adminOnly, require('./subscription.routes'));

// ── Ownership & Settings Routes (Super Admin only) ──
// All endpoints enforce requireSuperAdmin internally.
router.use('/admin/ownership', authenticate, adminOnly, require('./ownership.routes'));

// ── Plan Management Routes (Super Admin only) ──
// Seeded defaults: Trial (7d), Monthly (30d), Quarterly (90d), Yearly (365d).
// Separate from the read-only /admin/subscriptions/plans endpoint.
router.use('/admin/subscription/plans', authenticate, adminOnly, require('./plan.routes'));

module.exports = router;
