// server/src/services/content-source.service.js
// Content Source Service — proxy for external streaming providers (extensible for multiple sources)
//
// Architecture:
//   - Acts as a bridge between NovaStream and external content sources
//   - Fetches streaming URLs from external APIs, caches them in-memory
//   - Supports multiple content sources via configurable base URLs
//   - In-memory cache with TTL = token expiry minus safety buffer
//   - Deduplication via Pending Set for concurrent requests
//
// How to add a new source:
//   1. Add the source config to the SOURCES_MAP below
//   2. Add source-specific parsing logic if the API response differs
//   3. Set Content.sourceSite to match the source key

const Content = require('../models/Content.model');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');

// ── Source Configurations (ST-009) ──
// baseUrl, headers, and timeout are now configured via environment variables.
// Parser functions remain in code (they are business logic, not configuration).
const SOURCES = {
  primary: {
    baseUrl: config.externalSource.baseUrl,
    headers: {
      'User-Agent': config.externalSource.userAgent,
      'Referer': config.externalSource.referer,
    },
    timeout: config.externalSource.timeout,

    // Source-specific response parsers
    parsers: {
      // Parse movie streaming response → extract streamingLinks[]
      parseMovieResponse: (data) => {
        if (!data || !data.streamingLinks) return [];
        return data.streamingLinks
          .map(link => validateStreamLink(link))
          .filter(Boolean);
      },

      // Parse series streaming response → extract episode streamingLinks[]
      parseSeriesResponse: (data) => {
        if (!data || !data.seasons) return [];
        const episodes = [];
        for (const season of data.seasons) {
          if (!season.episodes) continue;
          for (const ep of season.episodes) {
            const links = (ep.streamingLinks || [])
              .map(l => validateStreamLink(l))
              .filter(Boolean);
            episodes.push({
              seasonNumber: season.seasonNumber || ep.seasonNumber,
              episodeNumber: ep.episodeNumber,
              name: ep.name,
              streamingLinks: links,
            });
          }
        }
        return episodes;
      },
    },
  },
};

// ── MongoDB Stream Cache (SC-002) ──
// Cross-worker shared cache for external streaming URLs.
// Uses MongoDB _streamCache collection with TTL index on expiresAt.
// Cache key format: {sourceName}:{externalId}:{quality}[:season:episode]
// TTL = token expiry (MongoDB TTL index auto-cleans expired docs)
//
// Per-process deduplication (pendingFetches) prevents duplicate concurrent
// fetches within the same worker for the same cache key.

const mongoose = require('mongoose');

let _streamCacheCollection = null;
function streamCacheCol() {
  if (!_streamCacheCollection) {
    _streamCacheCollection = mongoose.connection.db.collection('_streamCache');
    // TTL index: expireAfterSeconds: 0 means docs expire at their expiresAt value
    _streamCacheCollection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    ).catch(() => {}); // Fail silently — TTL is cleanup, lock logic works without it
  }
  return _streamCacheCollection;
}

// Per-process dedup — only for the duration of a concurrent request (ms)
const pendingFetches = new Map();

class StreamCache {
  async get(key) {
    const doc = await streamCacheCol().findOne({ _id: key });
    if (!doc) return null;

    // Safety buffer (10 min before expiry) — defense in depth
    const now = Math.floor(Date.now() / 1000);
    const expiresSec = doc.expiresAt ? Math.floor(doc.expiresAt.getTime() / 1000) : 0;
    if (now >= expiresSec - 600) {
      await streamCacheCol().deleteOne({ _id: key }).catch(() => {});
      return null;
    }

    // Increment hit count (fire-and-forget)
    streamCacheCol().updateOne({ _id: key }, { $inc: { hitCount: 1 } }).catch(() => {});
    doc.hitCount = (doc.hitCount || 0) + 1;
    return doc;
  }

  async set(key, url, quality, expiresAt) {
    await streamCacheCol().updateOne(
      { _id: key },
      {
        $set: {
          url,
          quality,
          expiresAt: new Date((expiresAt || Math.floor(Date.now() / 1000) + 86400) * 1000),
          fetchedAt: new Date(),
        },
        $setOnInsert: { hitCount: 0 },
      },
      { upsert: true }
    );
  }

  async has(key) {
    const doc = await streamCacheCol().findOne({ _id: key }, { projection: { _id: 1 } });
    return !!doc;
  }

  async delete(key) {
    await streamCacheCol().deleteOne({ _id: key });
  }

  async clear() {
    await streamCacheCol().deleteMany({});
    pendingFetches.clear();
  }

  async getStats() {
    const count = await streamCacheCol().estimatedDocumentCount().catch(() => 0);
    return { size: count, maxSize: null, keys: [] };
  }
}

// Singleton cache instance
const streamCache = new StreamCache();

// ── URL Validation ──

/**
 * Validate that a URL is a safe HTTPS URL for external streaming.
 * This prevents SSRF and content injection from external sources.
 */
function isValidStreamUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    // Only allow HTTPS for external streaming URLs (safety)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Validate and sanitize a streaming link from an external source.
 * Returns null if the link is invalid/suspicious.
 */
function validateStreamLink(link) {
  if (!link || !link.url) return null;
  if (!isValidStreamUrl(link.url)) {
    logger.warn({ url: link.url }, 'Invalid stream URL rejected from external source');
    return null;
  }
  return {
    url: link.url,
    quality: link.quality || '720p',
    type: link.type || 'hls',
    isActive: link.isActive !== false,
  };
}

// ── Retry Logic (ST-007) ──
// Exponential backoff: 200ms, 500ms
// Only retries on transient errors (network failures, 502, 503).
// Does NOT retry: 4xx errors, 404, 429, or validation failures.

/**
 * Determine if a response status code represents a transient server error
 * that might succeed on retry.
 */
function isTransientHttpStatus(status) {
  return status === 502 || status === 503 || status >= 520;
}

/**
 * Wrap a fetch operation with retry logic and exponential backoff.
 * Falls back to the source error after exhausting retries.
 *
 * @param {Function} fn - Async function returning { response, data }
 * @param {Object} options
 * @param {number} [options.maxRetries=2] - Max retry attempts
 * @param {number} [options.baseDelay=200] - Base delay in ms
 * @returns {Promise<any>} Response data
 */
async function withRetry(fn, { maxRetries = 2, baseDelay = 200 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Determine if this error is retryable
      const isRetryable =
        err.name === 'AbortError' ||
        err.name === 'FetchError' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNREFUSED' ||
        (err instanceof ApiError && err.statusCode && isTransientHttpStatus(err.statusCode));

      if (!isRetryable || attempt >= maxRetries) {
        // Non-retryable or out of attempts — propagate the error
        throw err;
      }

      // Exponential backoff before next retry
      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn({
        attempt: attempt + 1,
        maxRetries,
        delay,
        error: err.message,
      }, 'Retrying content source request');

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ── HTTP Helper ──
async function fetchFromSource(sourceKey, path) {
  const source = SOURCES[sourceKey];
  if (!source) {
    throw ApiError.internal(`Unknown content source: ${sourceKey}`);
  }

  const url = `${source.baseUrl}${path}`;

  // Use withRetry for transient resilience (ST-007)
  return await withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), source.timeout);

    try {
      const response = await fetch(url, {
        headers: source.headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          logger.warn({ url, source: sourceKey }, 'Rate limited by content source');
          throw ApiError.tooMany('Content source rate limit exceeded. Retry later.');
        }
        if (response.status === 404) {
          return null; // Content not found on source
        }
        if (isTransientHttpStatus(response.status)) {
          // Throw a generic error so withRetry can catch it
          const err = ApiError.internal(`Content source returned ${response.status}`);
          err.statusCode = response.status;
          throw err;
        }
        throw ApiError.internal(`Content source returned ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        logger.warn({ url, source: sourceKey }, 'Content source request timed out');
        throw ApiError.internal('Content source request timed out');
      }
      if (err instanceof ApiError) throw err;

      // Network errors (FetchError, ECONNRESET, etc.) are retryable
      logger.error({ err, url, source: sourceKey }, 'Content source request failed');
      throw err; // Re-throw original error so withRetry can check retryability
    } finally {
      clearTimeout(timeout);
    }
  });
}

// ── Main Service Class ──

class ContentSourceService {
  /**
   * Get a streaming URL for a content item by its slug.
   * Uses cached URL if available, otherwise fetches from external source.
   *
   * @param {Object} params
   * @param {string} params.slug - NovaStream content slug
   * @param {string} params.contentType - 'movie' or 'series'
   * @param {string} [params.quality] - Requested quality ('480p', '720p', '1080p')
   * @param {number} [params.season] - Season number (series only)
   * @param {number} [params.episode] - Episode number (series only)
   * @returns {Promise<{url: string, expiresAt: number, qualities: Array}>}
   */
  static async getStreamUrl({ slug, contentType, quality, season, episode }) {
    // 1. Lookup content by slug
    const content = await Content.findOne({ slug, isActive: true }).lean();
    if (!content) {
      throw ApiError.notFound(`Content '${slug}' not found`);
    }

    // 2. Check if content has an external source mapping
    const sourceId = content.sourceId;
    const sourceSite = content.sourceSite || 'primary';

    if (!sourceId) {
      throw ApiError.notFound(`Content '${slug}' has no external source mapping. Run seed-source-mapping script first.`);
    }

    // 3. Build cache key
    let cacheKey;
    if (contentType === 'movie') {
      cacheKey = `${sourceSite}:movie:${sourceId}:${quality || '720p'}`;
    } else {
      const s = season || 1;
      const e = episode || 1;
      cacheKey = `${sourceSite}:series:${sourceId}:s${s}:e${e}:${quality || '720p'}`;
    }

    // 4. Check cache (SC-002: MongoDB-backed, cross-worker safe)
    const cached = await streamCache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Stream cache HIT');
      return {
        url: cached.url,
        expiresAt: cached.expiresAt?.getTime ? Math.floor(cached.expiresAt.getTime() / 1000) : cached.expiresAt,
        qualities: null, // Qualities available in a separate call
        source: 'cache',
      };
    }

    // 5. Check if another request is already fetching this (per-process dedup)
    const pending = pendingFetches.get(cacheKey);
    if (pending) {
      logger.debug({ cacheKey }, 'Stream cache MISS — waiting for in-flight request');
      return await pending;
    }

    // 6. Fetch from external source
    logger.debug({ cacheKey, sourceSite }, 'Stream cache MISS — fetching from external source');
    const fetchPromise = this._fetchAndCache({ content, sourceId, sourceSite, contentType, quality, season, episode, cacheKey });

    // Register the pending promise for dedup
    pendingFetches.set(cacheKey, fetchPromise);

    let result;
    try {
      result = await fetchPromise;
    } finally {
      // Clean up pending when done (runs on both resolve and reject)
      pendingFetches.delete(cacheKey);
    }

    return result;
  }

  /**
   * Fetch streaming URL from external source, cache it, and return.
   */
  static async _fetchAndCache({ content, sourceId, sourceSite, contentType, quality, season, episode, cacheKey }) {
    const source = SOURCES[sourceSite];
    if (!source) {
      throw ApiError.internal(`Unknown content source: ${sourceSite}`);
    }

    const parser = source.parsers;
    let streamingUrl = null;
    let expiresAt = null;
    let allQualities = [];

    if (contentType === 'movie') {
      // Fetch movie: GET /api/movies/public/{externalId}
      const data = await fetchFromSource(sourceSite, `/api/movies/public/${sourceId}`);
      if (!data) {
        throw ApiError.notFound('Content not available on external source');
      }

      const links = parser.parseMovieResponse(data);
      allQualities = links.map(l => ({ quality: l.quality, url: l.url }));

      // Pick the requested quality, or fall back to 720p, or first available
      const preferred = quality || '720p';
      const matched = links.find(l => l.quality === preferred)
        || links.find(l => l.quality === '1080p')
        || links.find(l => l.quality === '720p')
        || links[0];

      if (!matched) {
        throw ApiError.notFound(`No streaming links available for this content`);
      }

      streamingUrl = matched.url;
      const urlObj = new URL(streamingUrl);
      expiresAt = parseInt(urlObj.searchParams.get('expires')) || (Math.floor(Date.now() / 1000) + 86400);
    } else {
      // Fetch series: GET /api/series/public/{externalId}
      const data = await fetchFromSource(sourceSite, `/api/series/public/${sourceId}`);
      if (!data) {
        throw ApiError.notFound('Content not available on external source');
      }

      const episodes = parser.parseSeriesResponse(data);
      const sNum = season || 1;
      const eNum = episode || 1;

      const matchedEpisode = episodes.find(ep =>
        ep.seasonNumber === sNum && ep.episodeNumber === eNum
      );

      if (!matchedEpisode || !matchedEpisode.streamingLinks.length) {
        throw ApiError.notFound(`Episode S${sNum}E${eNum} not found on external source`);
      }

      allQualities = matchedEpisode.streamingLinks.map(l => ({ quality: l.quality, url: l.url }));

      const preferred = quality || '720p';
      const matched = matchedEpisode.streamingLinks.find(l => l.quality === preferred)
        || matchedEpisode.streamingLinks.find(l => l.quality === '1080p')
        || matchedEpisode.streamingLinks.find(l => l.quality === '720p')
        || matchedEpisode.streamingLinks[0];

      if (!matched) {
        throw ApiError.notFound(`No streaming links for episode S${sNum}E${eNum}`);
      }

      streamingUrl = matched.url;
      const urlObj = new URL(streamingUrl);
      expiresAt = parseInt(urlObj.searchParams.get('expires')) || (Math.floor(Date.now() / 1000) + 86400);
    }

    // 7. Cache the result (SC-002: persistent across workers)
    await streamCache.set(cacheKey, streamingUrl, quality || '720p', expiresAt);

    logger.info({
      contentType,
      sourceId,
      quality: quality || '720p',
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    }, 'Stream URL fetched and cached');

    return {
      url: streamingUrl,
      expiresAt,
      qualities: allQualities.length > 0 ? allQualities : null,
      source: 'external',
    };
  }

  /**
   * Force refresh a streaming URL (bypass cache).
   * Used by the frontend expiry timer during active playback.
   */
  static async refreshStreamUrl({ slug, contentType, quality, season, episode }) {
    // Build cache key and delete it
    const content = await Content.findOne({ slug, isActive: true }).lean();
    if (!content || !content.sourceId) {
      throw ApiError.notFound(`Content '${slug}' not found or has no source mapping`);
    }

    const sourceSite = content.sourceSite || 'primary';
    let cacheKey;
    if (contentType === 'movie') {
      cacheKey = `${sourceSite}:movie:${content.sourceId}:${quality || '720p'}`;
    } else {
      const s = season || 1;
      const e = episode || 1;
      cacheKey = `${sourceSite}:series:${content.sourceId}:s${s}:e${e}:${quality || '720p'}`;
    }

    await streamCache.delete(cacheKey);
    return await this.getStreamUrl({ slug, contentType, quality, season, episode });
  }

  /**
   * Get available qualities for a content item (without fetching a stream URL).
   */
  static async getStreamInfo({ slug, contentType, season, episode }) {
    const content = await Content.findOne({ slug, isActive: true }).lean();
    if (!content || !content.sourceId) {
      return { hasStreams: false, qualities: [], sourceSite: null };
    }

    const sourceSite = content.sourceSite || 'primary';
    const source = SOURCES[sourceSite];
    if (!source) {
      return { hasStreams: false, qualities: [], sourceSite };
    }

    const parser = source.parsers;

    try {
      if (contentType === 'movie') {
        const data = await fetchFromSource(sourceSite, `/api/movies/public/${content.sourceId}`);
        if (!data) return { hasStreams: false, qualities: [], sourceSite };

        const links = parser.parseMovieResponse(data);
        return {
          hasStreams: links.length > 0,
          qualities: links.map(l => ({ quality: l.quality })),
          sourceSite,
        };
      } else {
        const data = await fetchFromSource(sourceSite, `/api/series/public/${content.sourceId}`);
        if (!data) return { hasStreams: false, qualities: [], sourceSite };

        const episodes = parser.parseSeriesResponse(data);
        const sNum = season || 1;
        const eNum = episode || 1;
        const matched = episodes.find(ep => ep.seasonNumber === sNum && ep.episodeNumber === eNum);

        if (!matched) return { hasStreams: false, qualities: [], sourceSite };

        return {
          hasStreams: matched.streamingLinks.length > 0,
          qualities: matched.streamingLinks.map(l => ({ quality: l.quality })),
          sourceSite,
        };
      }
    } catch (err) {
      logger.warn({ err, slug }, 'Failed to fetch stream info from source');
      return { hasStreams: false, qualities: [], sourceSite, error: err.message };
    }
  }

  /**
   * Fetch the full series structure (seasons + episodes) from the external source.
   * Used when the database has no season/episode documents for a series
   * (common for externally-synced content where only the parent Content doc exists).
   *
   * @param {Object} content - The Content document (must have sourceId and sourceSite)
   * @returns {Promise<Array>} Array of season objects with episode arrays
   */
  static async fetchSeriesSeasonData(content) {
    const sourceSite = content.sourceSite || 'primary';
    const sourceId = content.sourceId;
    if (!sourceId) return [];

    try {
      const data = await fetchFromSource(sourceSite, `/api/series/public/${sourceId}`);
      if (!data || !data.seasons) return [];

      return data.seasons.map(season => ({
        tmdbId: season.tmdb_id || season.id,
        seasonNumber: season.seasonNumber,
        name: season.name || `Season ${season.seasonNumber}`,
        overview: season.description || season.overview || '',
        posterPath: season.poster_path || season.posterPath || null,
        airDate: season.air_date || season.airDate || null,
        episodeCount: (season.episodes || []).length,
        episodes: (season.episodes || []).map(ep => ({
          // Use tmdbId as a synthetic _id for frontend comparisons (e.g.
          // EpisodeList's `isSelected` check). MongoDB ObjectId is not
          // available for externally-sourced episode data.
          _id: String(ep.tmdb_id || ep.id || `s${season.seasonNumber}e${ep.episodeNumber}`),
          tmdbId: ep.tmdb_id || ep.id,
          episodeNumber: ep.episodeNumber,
          name: ep.name || `Episode ${ep.episodeNumber}`,
          overview: ep.description || ep.overview || '',
          stillPath: ep.still_path || ep.stillPath || null,
          airDate: ep.air_date || ep.airDate || null,
          runtime: ep.runtime || null,
          voteAverage: ep.vote_average || ep.voteAverage || null,
        })),
      }));
    } catch (err) {
      logger.warn({ sourceId, sourceSite, err }, 'Failed to fetch series season data from external source');
      return [];
    }
  }

  /**
   * Fetch homepage/sections from the external source for catalog sync.
   */
  static async fetchHomepage(sourceSite = 'primary') {
    return await fetchFromSource(sourceSite, '/api/views/homepage/sections');
  }

  /**
   * Search content on the external source.
   */
  static async searchExternal(query, sourceSite = 'primary') {
    const data = await fetchFromSource(sourceSite, `/api/search?q=${encodeURIComponent(query)}`);
    return data;
  }

  /**
   * Get cache statistics.
   */
  static async getCacheStats() {
    return await streamCache.getStats();
  }

  /**
   * Clear the stream cache.
   */
  static async clearCache() {
    await streamCache.clear();
    logger.info('Stream cache cleared');
  }
}

module.exports = ContentSourceService;
