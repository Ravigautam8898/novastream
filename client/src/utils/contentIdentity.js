/**
 * contentIdentity.js — Content identity deduplication utilities.
 *
 * D-010: Prevents duplicate content items within generated lists/rails.
 * A content item may appear in multiple categories/sections (allowed),
 * but must appear only once within a single generated rail or list.
 *
 * Identity priority (highest to lowest):
 *   1. _id                    — MongoDB ObjectId (most reliable)
 *   2. slug                   — Nova permanent slug
 *   3. metadataSources.tmdb.id — TMDB ID from metadata sources array
 *   4. tmdbId                 — Top-level TMDB ID (backward compatible)
 *   5. imdbId                 — Top-level IMDb ID
 *   6. contentType + title normalized + year  — Fallback heuristic
 */

/**
 * Extract the best available identity key from a content item.
 * Returns a string key, or null if no identity can be determined.
 *
 * @param {Object} item - Content item object
 * @returns {string|null} Identity key
 */
export function getContentIdentity(item) {
  if (!item || typeof item !== 'object') return null;

  // 1. _id — MongoDB ObjectId
  if (item._id) return `_id:${item._id}`;

  // 2. slug — Nova permanent slug
  if (item.slug) return `slug:${item.slug}`;

  // 3. metadataSources.tmdb.id
  if (Array.isArray(item.metadataSources)) {
    const tmdbSource = item.metadataSources.find(
      (s) => s && s.provider === 'tmdb' && s.id != null
    );
    if (tmdbSource) return `tmdb:${tmdbSource.id}`;
  }

  // 4. tmdbId — top-level field
  if (item.tmdbId != null) return `tmdb:${item.tmdbId}`;

  // 5. imdbId — top-level field
  if (item.imdbId) return `imdb:${item.imdbId}`;

  // 6. Fallback: contentType + title + year
  const title = (item.title || '').trim().toLowerCase();
  if (title) {
    const year = item.releaseDate
      ? new Date(item.releaseDate).getFullYear()
      : item.firstAirDate
        ? new Date(item.firstAirDate).getFullYear()
        : null;
    const type = item.contentType || 'movie';
    return `fallback:${type}:${title}:${year || 'unknown'}`;
  }

  return null;
}

/**
 * Deduplicate a list of content items, preserving order and
 * keeping the first occurrence of each identity.
 *
 * Rules:
 *   - Preserves first/highest priority item per identity
 *   - Preserves original ordering
 *   - Does not mutate input objects
 *   - Returns a new array
 *
 * @param {Array<Object>} items - Array of content item objects
 * @returns {Array<Object>} Deduplicated array (new reference)
 */
export function dedupeContentList(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const seen = new Set();
  const result = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = getContentIdentity(item);

    if (key === null) {
      // Item with no identity — include it but warn
      console.warn('[contentIdentity] Item has no determinable identity:', item.title || 'unknown');
      result.push(item);
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

export default dedupeContentList;
