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
    const { slug, contentType, quality, season, episode, providerName } = req.body;

    if (!slug || !contentType) {
      throw ApiError.badRequest('slug and contentType are required');
    }

    const result = await ContentSourceService.refreshStreamUrl({
      slug,
      contentType,
      quality,
      season: season ? parseInt(season, 10) : undefined,
      episode: episode ? parseInt(episode, 10) : undefined,
      providerName, // C5e: User-selected preferred provider
    });

    ApiResponse.success(res, result, 'Stream URL refreshed');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/external/recover
 * Recover from a stream playback failure with two-phase recovery.
 * C5d: Orchestrated recovery — Phase 1 refresh, Phase 2 fallback.
 * Includes retry storm protection (max 3 per user+content+session).
 *
 * Body: Same as /play, plus:
 *   providerName  (string, optional) — C5e: User-selected preferred provider
 * Response: Same as /play (on success) or 503 "Stream temporarily unavailable"
 */
router.post('/recover', async (req, res, next) => {
  try {
    const { slug, contentType, quality, season, episode } = req.body;

    if (!slug || !contentType) {
      throw ApiError.badRequest('slug and contentType are required');
    }

    if (!['movie', 'series'].includes(contentType)) {
      throw ApiError.badRequest('contentType must be "movie" or "series"');
    }

    const userId = req.user?._id?.toString();

    const ProviderManager = require('../providers/ProviderManager');
    const result = await ProviderManager.recoverStream({
      slug,
      contentType,
      quality,
      season: season ? parseInt(season, 10) : undefined,
      episode: episode ? parseInt(episode, 10) : undefined,
      userId,
      providerName: req.body.providerName, // C5e: User-selected provider
    });

    const response = {
      url: result.url,
      expiresAt: result.expiresAt,
      qualities: result.allQualities || null,
      provider: result.provider || null,
      recovered: true,
    };

    ApiResponse.success(res, response, 'Stream recovered');
  } catch (err) {
    if (err.message === 'Stream temporarily unavailable') {
      // Clean error — no technical details exposed
      return res.status(503).json({
        success: false,
        message: 'Stream temporarily unavailable',
        timestamp: new Date().toISOString(),
      });
    }
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
 * GET /api/external/sources/:slug
 * Get available source providers for a content item.
 * C5e: Returns safe provider info (no internal IDs for normal users).
 * Admin/debug users see real provider names.
 *
 * Query params:
 *   contentType   (string, required) — 'movie' or 'series'
 *   season        (number, optional) — Season number (series only)
 *   episode       (number, optional) — Episode number (series only)
 *
 * Response:
 *   mode              (string) — 'auto' (always auto unless user manually selects)
 *   currentProvider   (object) — Currently used provider info
 *   availableSources  (array) — Available sources with labels and status
 *   debug             (object|null) — Internal details (admin/debug only)
 */
router.get('/sources/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { contentType, season, episode } = req.query;

    if (!contentType) {
      throw ApiError.badRequest('contentType query param is required');
    }

    const isAdmin = req.user?.role === 'admin';

    const Content = require('../models/Content.model');
    const ProviderManager = require('../providers/ProviderManager');
    const content = await Content.findOne({ slug, isActive: true }).lean();
    if (!content) {
      throw ApiError.notFound(`Content '${slug}' not found`);
    }

    // Get all provider mappings for this content
    const mappings = ProviderManager._getProviderMappings(content);

    // Get all registered providers with health info
    const allProviders = await ProviderManager.listProviders();

    // Build available sources with safe labels
    const availableSources = [];
    let currentProviderInfo = null;

    for (const mapping of mappings) {
      const regProvider = allProviders.find(p =>
        p.id === mapping.providerName ||
        (p.config?.legacyIds || []).includes(mapping.providerName)
      );

      const providerType = regProvider?.type || 'API';
      const isHealthy = regProvider?.health?.ok !== false;

      // Determine safe label based on type
      const typeLabel = providerType === 'API' ? 'Fast Source' : 'Backup Source';
      const label = isAdmin
        ? regProvider?.name || mapping.providerName
        : typeLabel;

      const source = {
        id: isAdmin ? mapping.providerName : `source-${availableSources.length + 1}`,
        label,
        type: providerType,
        status: isHealthy ? 'healthy' : 'degraded',
        confidence: mapping.confidenceScore || 0,
      };

      availableSources.push(source);

      // First mapping is the current/primary provider
      if (!currentProviderInfo) {
        currentProviderInfo = {
          type: providerType,
          qualities: ['480p', '720p', '1080p'],
          label,
          status: isHealthy ? 'healthy' : 'degraded',
        };
      }
    }

    // Separate by type for the UI
    const fastSources = availableSources.filter(s => s.type === 'API');
    const backupSources = availableSources.filter(s => s.type !== 'API');

    const response = {
      mode: 'auto',
      currentProvider: currentProviderInfo || { type: 'API', qualities: ['480p', '720p', '1080p'], label: 'Fast Source', status: 'unknown' },
      availableSources: {
        fast: fastSources,
        backup: backupSources,
      },
    };

    // Debug info for admin users
    if (isAdmin) {
      response.debug = {
        totalProviders: allProviders.length,
        totalMappings: mappings.length,
        resolvedProvider: currentProviderInfo?.label || null,
      };
    }

    ApiResponse.success(res, response, 'Content sources retrieved');
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
