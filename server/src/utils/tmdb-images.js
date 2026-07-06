// server/src/utils/tmdb-images.js
// TMDB Image URL Utility — single source of truth for URL construction
//
// Consumers:
//   - Content.model.js (virtuals: posterUrl, backdropUrl)
//   - TMDbService (getImageUrl, getBackdropUrl, getProfileUrl)
//   - imageProxy.middleware.js (TMDB_IMAGE_BASE constant)
//
// Why shared:
//   - If TMDB's image CDN changes, update one file
//   - Consistent sizing logic across all consumers
//   - No more inline URL construction with slight variations

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * Build a full TMDB image URL from a path and size.
 * Returns null if path is falsy.
 * Passes through full URLs unchanged (e.g., already-absolute paths).
 *
 * @param {string|null} path - TMDB image path (e.g., '/abc123.jpg')
 * @param {string} size - Image size (e.g., 'w500', 'w1280', 'original')
 * @returns {string|null}
 */
function getImageUrl(path, size = 'w500') {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

/**
 * Get backdrop URL (w1280 — for hero banners).
 * @param {string|null} path
 * @returns {string|null}
 */
function getBackdropUrl(path) {
  return getImageUrl(path, 'w1280');
}

/**
 * Get cast profile URL (w185).
 * @param {string|null} path
 * @returns {string|null}
 */
function getProfileUrl(path) {
  return getImageUrl(path, 'w185');
}

/**
 * Get poster URL (w500).
 * @param {string|null} path
 * @returns {string|null}
 */
function getPosterUrl(path) {
  return getImageUrl(path, 'w500');
}

module.exports = {
  TMDB_IMAGE_BASE,
  getImageUrl,
  getBackdropUrl,
  getProfileUrl,
  getPosterUrl,
};
