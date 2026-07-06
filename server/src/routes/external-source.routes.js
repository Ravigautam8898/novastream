// server/src/routes/external-source.routes.js
// External Content Source Routes — streaming proxy endpoints
//
// Provides an extensible bridge between NovaStream and external content providers.
// New sources can be added via content-source.service.js without changing these routes.
//
// Endpoints:
//   POST /api/external/play         — Get streaming URL for content (with cache)
//   POST /api/external/refresh      — Force refresh streaming URL (bypass cache)
//   GET  /api/external/stream-info/:slug — Check available streams for content
//   GET  /api/external/cache        — Get in-memory cache stats (admin)
//   POST /api/external/cache/clear  — Clear entire stream cache (admin)
//
// Usage:
//   Frontend calls /api/external/play when user clicks "Play"
//   Frontend calls /api/external/refresh when token is near expiry (10 min before)
//   Content ID is resolved from slug using the Content model

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/adminAuth.middleware');
const { generalLimiter } = require('../middleware/rateLimiter.middleware');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const ContentSourceService = require('../services/content-source.service');

const router = Router();

// All external source routes require authentication
router.use(authenticate);
router.use(generalLimiter);

/**
 * POST /api/external/play
 * Get a streaming URL for a content item.
 * Uses cached URL if available, otherwise fetches from external source.
 *
 * Body:
 *   slug          (string, required) — NovaStream content slug
 *   contentType   (string, required) — 'movie' or 'series'
 *   quality       (string, optional) — '480p', '720p', '1080p' (default: '720p')
 *   season        (number, optional) — Season number (series only)
 *   episode       (number, optional) — Episode number (series only)
 *
 * Response:
 *   url           (string) — CDN streaming URL (playable by HLS.js)
 *   expiresAt     (number) — Unix timestamp when URL expires
 *   qualities     (array|null) — Available quality options
 *   source        (string) — 'cache' or 'external'
 */
router.post('/play', async (req, res, next) => {
  try {
    const { slug, contentType, quality, season, episode } = req.body;

    if (!slug || !contentType) {
      throw ApiError.badRequest('slug and contentType are required');
    }

    if (!['movie', 'series'].includes(contentType)) {
      throw ApiError.badRequest('contentType must be "movie" or "series"');
    }

    const result = await ContentSourceService.getStreamUrl({
      slug,
      contentType,
      quality,
      season: season ? parseInt(season, 10) : undefined,
      episode: episode ? parseInt(episode, 10) : undefined,
    });

    ApiResponse.success(res, result, 'Stream URL retrieved');
  } catch (err) {
    if (err.message && err.message.includes('no external source mapping')) {
      // Soft error — no external source for this content
      return ApiResponse.success(res, {
        url: null,
        expiresAt: null,
        qualities: null,
        source: 'none',
        message: 'No external source mapped for this content',
      }, 'No external source');
    }
    next(err);
  }
});

/**
 * POST /api/external/refresh
 * Force refresh a streaming URL (bypass cache).
 * Used by the frontend expiry timer during active playback (~10 min before expiry).
 *
 * Body: Same as /play
 * Response: Same as /play
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { slug, contentType, quality, season, episode } = req.body;

    if (!slug || !contentType) {
      throw ApiError.badRequest('slug and contentType are required');
    }

    const result = await ContentSourceService.refreshStreamUrl({
      slug,
      contentType,
      quality,
      season: season ? parseInt(season, 10) : undefined,
      episode: episode ? parseInt(episode, 10) : undefined,
    });

    ApiResponse.success(res, result, 'Stream URL refreshed');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/external/stream-info/:slug
 * Check what streams are available for a content item.
 * Does NOT fetch a stream URL — just checks availability and qualities.
 *
 * Query params:
 *   contentType   (string, required) — 'movie' or 'series'
 *   season        (number, optional) — Season number (series only)
 *   episode       (number, optional) — Episode number (series only)
 */
router.get('/stream-info/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { contentType, season, episode } = req.query;

    if (!contentType) {
      throw ApiError.badRequest('contentType query param is required');
    }

    const result = await ContentSourceService.getStreamInfo({
      slug,
      contentType,
      season: season ? parseInt(season, 10) : undefined,
      episode: episode ? parseInt(episode, 10) : undefined,
    });

    ApiResponse.success(res, result, 'Stream info retrieved');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/external/cache
 * Get in-memory stream cache statistics (admin only).
 */
router.get('/cache', adminOnly, async (req, res, next) => {
  try {
    const stats = await ContentSourceService.getCacheStats();
    ApiResponse.success(res, stats, 'Cache stats');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/external/cache/clear
 * Clear entire stream cache (admin only).
 */
router.post('/cache/clear', adminOnly, async (req, res, next) => {
  try {
    await ContentSourceService.clearCache();
    ApiResponse.success(res, { cleared: true }, 'Cache cleared');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
