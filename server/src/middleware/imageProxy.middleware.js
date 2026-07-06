// server/src/middleware/imageProxy.middleware.js
// TMDB Image Proxy — proxies images through our server
// Benefits:
//   - Hides TMDB image URLs from the client
//   - Sets aggressive caching headers
//   - Provides fallback images on error
//   - Reduces client-side URL construction logic

const https = require('https');
const http = require('http');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { TMDB_IMAGE_BASE } = require('../utils/tmdb-images');

// Valid sizes per image type
const VALID_SIZES = {
  poster: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'],
  backdrop: ['w300', 'w780', 'w1280', 'original'],
  profile: ['w45', 'w185', 'h632', 'original'],
  still: ['w92', 'w185', 'w300', 'original'],
  logo: ['w45', 'w92', 'w154', 'w185', 'w300', 'w500', 'original'],
};

// Fallback images (1x1 transparent SVG for when image is missing)
const FALLBACK_IMAGES = {
  poster: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect fill="%231f1f1f" width="300" height="450"/><text fill="%23555" font-family="sans-serif" font-size="14" text-anchor="middle" x="150" y="225">No Poster</text></svg>',
  backdrop: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect fill="%231f1f1f" width="1280" height="720"/><text fill="%23555" font-family="sans-serif" font-size="18" text-anchor="middle" x="640" y="360">No Image</text></svg>',
};

/**
 * Image Proxy Middleware
 * Usage: GET /api/images/:type/:size/:path
 * Example: GET /api/images/poster/w500/abc123def.jpg
 * Maps to: https://image.tmdb.org/t/p/w500/abc123def.jpg
 */
function imageProxy(req, res, next) {
  const { type, size, ...pathParts } = req.params;

  // Validate type
  const validTypes = Object.keys(VALID_SIZES);
  if (!validTypes.includes(type)) {
    return next(ApiError.badRequest(`Invalid image type. Must be one of: ${validTypes.join(', ')}`));
  }

  // Validate size
  const validSizes = VALID_SIZES[type];
  if (!validSizes.includes(size)) {
    return next(ApiError.badRequest(`Invalid size '${size}' for type '${type}'. Valid sizes: ${validSizes.join(', ')}`));
  }

  // Reconstruct the image path
  const imagePath = Object.values(pathParts).join('/');
  if (!imagePath) {
    return next(ApiError.badRequest('Image path is required'));
  }

  const tmdbUrl = `${TMDB_IMAGE_BASE}/${size}/${imagePath}`;

  logger.debug({ type, size, imagePath }, 'Proxying TMDB image');

  // Set aggressive caching headers (24 hours browser cache, 7 days CDN)
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  res.setHeader('X-Image-Source', 'tmdb-proxy');

  // Fetch the image from TMDB
  const client = tmdbUrl.startsWith('https') ? https : http;

  client.get(tmdbUrl, { timeout: 10000 }, (tmdbRes) => {
    // Forward content type
    const contentType = tmdbRes.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);

    // Forward content length if present
    if (tmdbRes.headers['content-length']) {
      res.setHeader('Content-Length', tmdbRes.headers['content-length']);
    }

    // Pipe the image data
    tmdbRes.pipe(res);

    tmdbRes.on('error', (err) => {
      logger.warn({ err, tmdbUrl }, 'Error streaming TMDB image');
      // Don't send fallback here since headers might already be sent
      if (!res.headersSent) {
        res.redirect(302, FALLBACK_IMAGES[type] || FALLBACK_IMAGES.poster);
      }
    });
  }).on('error', (err) => {
    logger.warn({ err, tmdbUrl }, 'Failed to fetch TMDB image');
    if (!res.headersSent) {
      // Redirect to fallback
      const fallbackUrl = FALLBACK_IMAGES[type] || FALLBACK_IMAGES.poster;
      // Send a 1x1 transparent pixel as last resort
      res.status(200)
        .setHeader('Content-Type', 'image/svg+xml')
        .send(
          type === 'backdrop' ? FALLBACK_IMAGES.backdrop : FALLBACK_IMAGES.poster
        );
    }
  });
}

module.exports = imageProxy;
