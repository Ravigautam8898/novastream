// client/src/config/images.js
// Shared image configuration for TMDB image URLs.
// Centralizes TMDB_IMAGE_BASE so it's defined in one place instead of 7+ files.

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * Build a fully-qualified TMDB image URL.
 * @param {string} path - The relative image path (e.g. /abc123.jpg)
 * @param {string} size - TMDB size qualifier (e.g. w92, w185, w300, w342, w780, w1280)
 * @returns {string|null} Full URL or null if path is missing
 */
export function tmdbImageUrl(path, size) {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
