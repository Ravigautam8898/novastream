// server/src/routes/stream.routes.js
// Stream API Routes — HLS content streaming with signed token auth
//
// Endpoints:
//   POST /api/stream/token       — Generate signed stream token (authenticated)
//   GET  /api/stream/:type/:slug/index.m3u8 — Master playlist for movie/series
//   GET  /api/stream/:type/:slug/:quality/segments/:segment — TS segment
//   GET  /api/stream/episode/:id/index.m3u8 — Episode playlist
//   GET  /api/stream/episode/:id/:quality/index.m3u8 — Episode quality variant
//   GET  /api/stream/episode/:id/:quality/segments/:segment — Episode TS segment
//
// Security (Batch A):
//   - ST-001: Stream token transported via httpOnly cookie in addition to query param.
//             Referrer-Policy: no-referrer prevents URL leakage in Referer headers.
//             Cache-Control: no-store prevents URL caching in browser history.
//   - ST-002: Stream token's `sub` (contentId) is validated against the requested
//             content in every route handler. Token for content A cannot access content B.
//   - ST-006: Tokens include a `tkv` (tokenVersion) claim that is checked against
//             the user's streamTokenVersion. Version is incremented on logout/password reset.

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { streamLimiter } = require('../middleware/rateLimiter.middleware');
const { requireStreamToken } = require('../middleware/streamAuth.middleware');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const User = require('../models/User.model');
const logger = require('../config/logger');
const Content = require('../models/Content.model');
const path = require('path');

const {
  generateStreamToken,
  resolveMovieContent,
  resolveEpisodeContent,
  servePlaylist,
  serveSegment,
  getStreamInfo,
  generateEpisodeMasterPlaylist,
} = require('../services/stream.service');

const router = Router();

// ── Token Expiry Constants ──
const STREAM_TOKEN_EXPIRY_SECONDS = 24 * 3600; // 24 hours

// ── CDN / Proxy Acceleration Helper (ST-004) ──
// When STREAM_CDN_MODE is enabled, stream responses include an X-Accel-Redirect
// header instead of sending the file content through Node.js. This allows Nginx
// to serve the file directly from disk, freeing the Node.js event loop.
//
// CDN mode also adds:
//   - ETag header for conditional requests (304 Not Modified support)
//   - Surrogate-Control for upstream CDN caching
//   - Cache-Control: public for cacheable content (playlists, segments)
//
// In non-CDN mode, only security headers are applied (same as before).

const config = require('../config/env');

const UPLOADS_BASE = path.resolve(__dirname, '..', '..', 'uploads');

/**
 * Set security headers on all stream responses (always applied).
 */
function setStreamSecurityHeaders(res) {
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

/**
 * Apply CDN-friendly headers to a stream response.
 * In CDN mode, sets X-Accel-Redirect so Nginx serves the file directly.
 * Returns true if a CDN redirect was applied (caller should skip sending body).
 *
 * @param {Object} res - Express response object
 * @param {string} filePath - Absolute path to the file on disk
 * @param {string} mimeType - Content-Type for the file
 * @param {number} [contentLength] - Optional file size for Content-Length
 * @returns {boolean} true if CDN redirect was set
 */
function applyCdnHeaders(res, filePath, mimeType, contentLength) {
  // Always set cache-friendly headers for CDN/proxy
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Surrogate-Control', 'max-age=3600');

  if (config.stream.cdnMode && config.stream.cdnBaseUrl) {
    // CDN mode: set X-Accel-Redirect so Nginx serves the file.
    // The path must be relative to the Nginx internal redirect location.
    const relativePath = path.relative(UPLOADS_BASE, filePath);
    const cdnPath = `/${relativePath}`;
    res.set('X-Accel-Redirect', cdnPath);
    res.set('X-Accel-Buffering', 'yes');
    res.set('Content-Type', mimeType);
    if (contentLength) {
      res.set('Content-Length', String(contentLength));
    }
    return true;
  }

  // Non-CDN mode: still set standard caching headers for upstream proxies
  res.set('Content-Type', mimeType);
  if (contentLength) {
    res.set('Content-Length', String(contentLength));
  }
  return false;
}

// ── Token-Content Binding Helper ──
// Verifies the stream token's `sub` claim matches the content being requested.
// ST-002: Prevents a token issued for content A from accessing content B.
function verifyContentBinding(token, contentId) {
  if (token.sub && contentId && token.sub !== contentId) {
    logger.warn({
      tokenSub: token.sub,
      requestedContentId: contentId,
    }, 'Stream token content mismatch');
    throw ApiError.forbidden('Stream token does not match requested content');
  }
}

// ── POST /api/stream/token ──
// Generate a signed stream token for accessing protected HLS content.
// Also sets an httpOnly cookie for same-origin segment requests (ST-001).
router.post('/token', authenticate, streamLimiter, async (req, res, next) => {
  try {
    const { contentId, contentType } = req.body;

    if (!contentId || !contentType) {
      throw ApiError.badRequest('contentId and contentType are required');
    }

    if (!['movie', 'series', 'episode'].includes(contentType)) {
      throw ApiError.badRequest('contentType must be movie, series, or episode');
    }

    const clientIp = req.ip || req.connection.remoteAddress;

    // Include user ID and token version for revocation support (ST-006)
    // req.user is built from JWT (not a DB fetch), so we need to get
    // streamTokenVersion explicitly if the user has one
    const userId = req.user?._id?.toString();
    let tokenVersion;
    if (userId) {
      const user = await User.findById(userId).select('streamTokenVersion').lean();
      tokenVersion = user?.streamTokenVersion;
    }

    const token = generateStreamToken({
      contentId,
      contentType,
      ip: clientIp,
      uid: userId,
      tokenVersion,
    });

    // Build the stream URL for the frontend
    let streamUrl;
    if (contentType === 'episode') {
      streamUrl = `/api/stream/episode/${contentId}/index.m3u8`;
    } else {
      const resolvedContent = await Content.findById(contentId).select('slug').lean();
      if (!resolvedContent) {
        throw ApiError.notFound('Content not found for stream URL generation');
      }
      streamUrl = `/api/stream/${contentType}/${resolvedContent.slug}/index.m3u8`;
    }

    // Set httpOnly cookie for same-origin segment requests (ST-001)
    // The cookie is scoped to /api/stream so it's only sent on stream requests
    res.cookie('stream_token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      maxAge: STREAM_TOKEN_EXPIRY_SECONDS * 1000,
      path: '/api/stream',
    });

    // Return stream URL WITHOUT token in query string — the cookie handles auth
    ApiResponse.success(res, {
      token,
      expiresIn: STREAM_TOKEN_EXPIRY_SECONDS,
      streamUrl,
    }, 'Stream token generated');
  } catch (err) {
    next(err);
  }
});

// ── MOVIE STREAMING ──

/**
 * GET /api/stream/movie/:slug/index.m3u8
 * Serve the master HLS playlist for a movie.
 */
router.get('/movie/:slug/index.m3u8', requireStreamToken, async (req, res, next) => {
  try {
    const { slug } = req.params;

    logger.debug({ slug }, 'Stream: requesting movie master playlist');

    const resolved = await resolveMovieContent(slug);

    // ST-002: Verify token was issued for this content
    const contentId = resolved.content._id.toString();
    verifyContentBinding(req.streamToken, contentId);

    const result = await servePlaylist(resolved, null);

    if (result.statusCode === 404) {
      const info = await getStreamInfo(resolved);
      const err = ApiError.notFound('This movie does not have an HLS stream available yet.');
      err.data = info;
      throw err;
    }

    setStreamSecurityHeaders(res);
    res.set('Content-Type', result.mimeType);
    res.status(result.statusCode).send(result.content);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stream/movie/:slug/:quality/segments/:segment
 * Serve a .ts segment file for a movie's HLS stream.
 */
router.get('/movie/:slug/:quality/segments/:segment', requireStreamToken, async (req, res, next) => {
  try {
    const { slug, quality, segment } = req.params;
    const range = req.headers.range;

    const resolved = await resolveMovieContent(slug);

    // ST-002: Verify token was issued for this content
    const contentId = resolved.content._id.toString();
    verifyContentBinding(req.streamToken, contentId);

    const result = await serveSegment(resolved, quality, segment, range);

    if (result.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: `Segment '${segment}' not found.`,
        timestamp: new Date().toISOString(),
      });
    }

    if (result.statusCode === 403) {
      throw ApiError.forbidden('Invalid segment path');
    }

    if (result.statusCode === 400) {
      throw ApiError.badRequest('Invalid segment filename');
    }

    setStreamSecurityHeaders(res);
    if (applyCdnHeaders(res, result.filePath || '', result.mimeType, result.headers?.['Content-Length'])) {
      return res.status(206).end();
    }
    res.set('Content-Type', result.mimeType);
    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        if (!['Referrer-Policy', 'Access-Control-Allow-Origin', 'Cache-Control', 'Pragma', 'Expires'].includes(key)) {
          res.set(key, value);
        }
      });
    }
    res.status(result.statusCode).send(result.content);
  } catch (err) {
    next(err);
  }
});

// ── EPISODE STREAMING ──

/**
 * GET /api/stream/episode/:id/index.m3u8
 * Serve the master HLS playlist for an episode.
 */
router.get('/episode/:id/index.m3u8', requireStreamToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.debug({ episodeId: id }, 'Stream: requesting episode master playlist');

    const resolved = await resolveEpisodeContent(id);

    // ST-002: Verify token was issued for this content
    const episodeId = resolved.episode._id.toString();
    verifyContentBinding(req.streamToken, episodeId);

    // Generate a combined multi-quality master playlist
    const masterContent = await generateEpisodeMasterPlaylist(resolved);

    if (!masterContent) {
      const info = await getStreamInfo(resolved);
      const err = ApiError.notFound('This episode does not have an HLS stream available yet.');
      err.data = info;
      throw err;
    }

    setStreamSecurityHeaders(res);
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(masterContent);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stream/episode/:id/:quality/index.m3u8
 * Serve a specific quality variant playlist for an episode.
 */
router.get('/episode/:id/:quality/index.m3u8', requireStreamToken, async (req, res, next) => {
  try {
    const { id, quality } = req.params;

    const validQualities = ['480p', '720p', '1080p', '4K'];
    if (!validQualities.includes(quality)) {
      throw ApiError.badRequest(`Invalid quality '${quality}'. Must be one of: ${validQualities.join(', ')}`);
    }

    const resolved = await resolveEpisodeContent(id);

    // ST-002: Verify token was issued for this content
    const episodeId = resolved.episode._id.toString();
    verifyContentBinding(req.streamToken, episodeId);

    const result = await servePlaylist(resolved, quality);

    if (result.statusCode === 404) {
      throw ApiError.notFound(`No ${quality} stream available for this episode.`);
    }

    setStreamSecurityHeaders(res);
    res.set('Content-Type', result.mimeType);
    res.status(result.statusCode).send(result.content);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stream/episode/:id/:quality/segments/:segment
 * Serve a .ts segment file for an episode's HLS stream.
 */
router.get('/episode/:id/:quality/segments/:segment', requireStreamToken, async (req, res, next) => {
  try {
    const { id, quality, segment } = req.params;
    const range = req.headers.range;

    const resolved = await resolveEpisodeContent(id);

    // ST-002: Verify token was issued for this content
    const episodeId = resolved.episode._id.toString();
    verifyContentBinding(req.streamToken, episodeId);

    const result = await serveSegment(resolved, quality, segment, range);

    if (result.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: `Segment '${segment}' not found.`,
        timestamp: new Date().toISOString(),
      });
    }

    if (result.statusCode === 403) {
      throw ApiError.forbidden('Invalid segment path');
    }

    if (result.statusCode === 400) {
      throw ApiError.badRequest('Invalid segment filename');
    }

    setStreamSecurityHeaders(res);
    if (applyCdnHeaders(res, result.filePath || '', result.mimeType, result.headers?.['Content-Length'])) {
      return res.status(206).end();
    }
    res.set('Content-Type', result.mimeType);
    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        if (!['Referrer-Policy', 'Access-Control-Allow-Origin', 'Cache-Control', 'Pragma', 'Expires'].includes(key)) {
          res.set(key, value);
        }
      });
    }
    res.status(result.statusCode).send(result.content);
  } catch (err) {
    next(err);
  }
});

// ── STREAM INFO ──

/**
 * GET /api/stream/info/:type/:slug
 * Get stream metadata for a piece of content (qualities available, etc.)
 */
router.get('/info/:type/:slug', authenticate, async (req, res, next) => {
  try {
    const { type, slug } = req.params;

    if (!['movie', 'series'].includes(type)) {
      throw ApiError.badRequest('Type must be movie or series');
    }

    let resolved;
    if (type === 'movie') {
      resolved = await resolveMovieContent(slug);
    } else {
      const Content = require('../models/Content.model');
      const series = await Content.findOne({ slug, contentType: 'series', isActive: true }).lean();
      if (!series) {
        throw ApiError.notFound(`Series '${slug}' not found`);
      }
      resolved = { content: series, streamDir: null, streams: series.streams || [] };
    }

    const info = await getStreamInfo(resolved);
    ApiResponse.success(res, info, 'Stream info retrieved');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
