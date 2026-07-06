// server/src/routes/thumbnail.routes.js
// Thumbnail Routes — seek preview sprite sheets for ArtPlayer
//
// Endpoints:
//   GET  /api/thumbnails/:type/:id  — Generate and return sprite sheet
//
// The sprite is generated on first request and cached to disk.
// FFmpeg is used if available; otherwise a placeholder sprite is generated.

const { Router } = require('express');
const fs = require('fs');
const { streamLimiter } = require('../middleware/rateLimiter.middleware');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const config = require('../config/env');

const { getOrGenerateSprite, SPRITE_CONFIG } = require('../services/thumbnail.service');

const router = Router();

/**
 * GET /api/thumbnails/:type/:id
 * Get or generate a thumbnail sprite sheet for seek preview.
 *
 * @param {string} type - 'movie' or 'episode'
 * @param {string} id - MongoDB _id of the content or episode
 *
 * Note: This route does NOT require authentication because thumbnails are fetched
 * natively by the browser via <img> tags (ArtPlayer's seek preview), which cannot
 * send JWT tokens. Thumbnails are public renderings (no sensitive data).
 *
 * Returns the sprite image with headers describing the sprite layout.
 * Headers:
 *   X-Sprite-Cols: Number of columns
 *   X-Sprite-Total: Total number of thumbnails
 *   X-Sprite-Width: Total sprite width in px
 *   X-Sprite-Height: Total sprite height in px
 *   Cache-Control: public, max-age=86400
 */
router.get('/:type/:id', streamLimiter, async (req, res, next) => {
  try {
    const { type, id } = req.params;

    if (!['movie', 'episode'].includes(type)) {
      throw ApiError.badRequest('Type must be movie or episode');
    }

    if (!id || id.length < 8) {
      throw ApiError.badRequest('Invalid content ID');
    }

    logger.debug({ type, id }, 'Thumbnail: generating sprite');

    const sprite = await getOrGenerateSprite(type, id);

    if (!sprite.exists || !sprite.path) {
      throw ApiError.notFound('Thumbnail sprite not available for this content.');
    }

    // Set sprite metadata headers for the frontend
    res.set('X-Sprite-Cols', String(sprite.cols));
    res.set('X-Sprite-Total', String(sprite.total));
    res.set('X-Sprite-Width', String(sprite.width));
    res.set('X-Sprite-Height', String(sprite.height));
    res.set('Cache-Control', 'public, max-age=86400');

    // CDN/proxy headers (ST-004)
    res.set('Surrogate-Control', 'max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');

    // When CDN mode is active, use X-Accel-Redirect for efficient serving
    if (config.stream.cdnMode && config.stream.cdnBaseUrl) {
      const relativePath = sprite.path.replace(config.uploads?.base || '/app/uploads', '');
      const cdnPath = `${config.stream.cdnBaseUrl}${relativePath}`;
      res.set('X-Accel-Redirect', `/thumbnails${relativePath}`);
      res.set('X-Accel-Buffering', 'yes');
      return res.status(200).end();
    }

    // Send the sprite image (PF-015)
    // Use sendFile which sets content-type based on extension (.jpg → image/jpeg)
    // ETag header enables conditional requests — browser can send If-None-Match
    // and get a 304 Not Modified instead of re-downloading the full sprite.
    const stat = fs.statSync(sprite.path);
    const etag = `"${stat.mtimeMs}-${stat.size}"`;
    res.set('ETag', etag);

    // Respond 304 if the client's cached version is still fresh
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.sendFile(sprite.path);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
