// server/src/providers/ProviderManager.js
// ProviderManager — Core orchestrator for Track C2 Provider Framework
//
// Responsibilities:
//   - Register and discover providers (local files + future plugin loading)
//   - Order providers by health → type (API first) → success rate → priority → speed
//   - Resolve streams for content: cache check → provider chain → cache save
//   - Distributed lock for cache stampede protection (C-008)
//   - Compatibility layer with existing sourceId/sourceSite (legacy support)
//
// Resolution flow (C-010):
//   PLAY → Check _streamCache → MISS → Acquire DistributedLock →
//   Try API providers (DIRECT) → Try LIGHT_SCRAPER (QUEUE) →
//   Try BROWSER_SCRAPER (WORKER) → Cache result → Release lock
//
// Migration safety:
//   - Existing sourceId/sourceSite continues working (C3 migration)
//   - ProviderManager checks providers[] first, falls back to sourceId
//   - ContentSourceService unchanged until C3

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const DistributedLock = require('../utils/distributedLock');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const Content = require('../models/Content.model');
const ScraperQueue = require('./ScraperQueue');
const ProviderRegistry = require('./ProviderRegistry');
const BaseProvider = require('./BaseProvider');

// ── Constants ──

const PROVIDERS_DIR = path.resolve(__dirname, 'sources');
const LOCK_TTL_MS = 60 * 1000; // 1 minute lock TTL (covers single provider resolve)
const MAX_CACHED_KEYS = 100;   // Max entries in in-memory provider health cache

// ── Recovery Constants (C5d) ──

const MAX_RECOVERY_ATTEMPTS = 3;  // Max recovery attempts per user+content+session
const STORM_WINDOW_MS = 60000;    // 1-minute window for storm tracking
const recoveryStormCount = new Map(); // stormKey → attempt count

// ── State ──

const registeredProviders = [];  // Array of { provider, source (for discovery) }
const providerHealth = new Map(); // providerId → { successRate, avgLatency, lastCheck }
const lockCache = new Map();      // providerId → DistributedLock instance

// ── Stream Cache Access ──
// Reuses the _streamCache MongoDB collection from content-source.service.js

let _streamCacheCol = null;
function streamCacheCol() {
  if (!_streamCacheCol) {
    _streamCacheCol = mongoose.connection.db.collection('_streamCache');
    _streamCacheCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
  }
  return _streamCacheCol;
}

class ProviderManager {
  // ── Provider Discovery & Registration ──

  /**
   * Discover and register all providers from the sources directory.
   * Called once at server startup.
   *
   * @returns {Promise<number>} Number of providers registered
   */
  static async discoverProviders() {
    let count = 0;

    try {
      if (!fs.existsSync(PROVIDERS_DIR)) {
        logger.warn({ dir: PROVIDERS_DIR }, 'ProviderManager: sources directory not found');
        return 0;
      }

      const files = fs.readdirSync(PROVIDERS_DIR)
        .filter(f => f.endsWith('.provider.js'))
        .sort();

      for (const file of files) {
        try {
          const modulePath = path.join(PROVIDERS_DIR, file);
          const ProviderClass = require(modulePath);

          if (!BaseProvider.isPrototypeOf(ProviderClass) && ProviderClass.prototype instanceof BaseProvider === false) {
            logger.warn({ file }, 'ProviderManager: file does not export a BaseProvider subclass — skipping');
            continue;
          }

          const registered = await this.registerProvider(ProviderClass, file);
          if (registered) {
            count++;
          }
        } catch (err) {
          logger.error({ err, file }, 'ProviderManager: failed to load provider file');
        }
      }
    } catch (err) {
      logger.error({ err }, 'ProviderManager: failed to discover providers');
    }

    // Ensure ProviderRegistry indexes exist
    await ProviderRegistry.ensureIndexes();

    logger.info({ count, total: count }, 'ProviderManager: provider discovery complete');
    return count;
  }

  /**
   * Register a single provider class.
   *
   * @param {typeof BaseProvider} ProviderClass - Provider class (constructor)
   * @param {string} [source] - Source filename for discovery tracking
   * @returns {Promise<boolean>} Whether registration succeeded
   */
  static async registerProvider(ProviderClass, source = 'manual') {
    const meta = ProviderClass.metadata;

    // Skip template providers — they are for copying only, not runtime registration
    if (meta?.isTemplate === true) {
      logger.info({ providerId: meta.id, file: source }, 'ProviderManager: template provider skipped (isTemplate: true)');
      return false;
    }

    // Validate metadata
    const validation = BaseProvider.validateMetadata(ProviderClass);
    if (!validation.valid) {
      logger.error({
        provider: meta?.id || 'unknown',
        errors: validation.errors,
      }, 'ProviderManager: metadata validation failed — provider not registered');
      return false;
    }

    // Check for duplicate IDs
    if (registeredProviders.some(p => p.provider.constructor.metadata.id === meta.id)) {
      logger.warn({ providerId: meta.id }, 'ProviderManager: provider already registered — skipping duplicate');
      return false;
    }

    try {
      const instance = new ProviderClass();
      await instance.initialize();

      registeredProviders.push({ provider: instance, source });
      logger.info({
        providerId: meta.id,
        name: meta.name,
        type: meta.providerType,
        priority: meta.priority,
        source,
      }, 'ProviderManager: provider registered');

      return true;
    } catch (err) {
      logger.error({ err, providerId: meta.id }, 'ProviderManager: provider initialization failed');
      return false;
    }
  }

  /**
   * Unregister a provider by ID.
   *
   * @param {string} providerId - Provider identifier
   * @returns {Promise<boolean>} Whether unregistration succeeded
   */
  static async unregisterProvider(providerId) {
    const idx = registeredProviders.findIndex(p => p.provider.metadata.id === providerId);
    if (idx === -1) return false;

    const [entry] = registeredProviders.splice(idx, 1);
    try {
      await entry.provider.dispose();
    } catch (err) {
      logger.warn({ err, providerId }, 'ProviderManager: error during provider dispose');
    }

    providerHealth.delete(providerId);
    lockCache.delete(providerId);

    logger.info({ providerId }, 'ProviderManager: provider unregistered');
    return true;
  }

  // ── Provider Ordering ──

  /**
   * Get providers ordered by resolution priority:
   *   1. Health (online > degraded > offline)
   *   2. Provider type (API > LIGHT_SCRAPER > BROWSER_SCRAPER)
   *   3. Success rate (higher = better)
   *   4. Configured priority (lower = tried first)
   *   5. Average latency (lower = better)
   *
   * @param {string} [type] - Optional filter by provider type
   * @returns {Array} Ordered array of { provider, health }
   */
  static getOrderedProviders(type) {
    let providers = [...registeredProviders];

    // Load health data from cache
    const withHealth = providers.map(entry => ({
      provider: entry.provider,
      meta: entry.provider.constructor.metadata,
      health: providerHealth.get(entry.provider.constructor.metadata.id) || {
        successRate: 0.5,
        avgLatency: Infinity,
      },
    }));

    // Filter by type if specified
    if (type) {
      const filtered = withHealth.filter(p => p.meta.providerType === type);
      // If no providers of this type, return all (fallback)
      if (filtered.length > 0) return filtered;
    }

    // Sort by composite score
    return withHealth.sort((a, b) => {
      // 1. Provider type priority
      const typeOrder = { API: 0, LIGHT_SCRAPER: 1, BROWSER_SCRAPER: 2 };
      const aTypeOrder = typeOrder[a.meta.providerType] ?? 3;
      const bTypeOrder = typeOrder[b.meta.providerType] ?? 3;
      if (aTypeOrder !== bTypeOrder) return aTypeOrder - bTypeOrder;

      // 2. Health check passed? (recent health check ok)
      const aHealthy = a.health.lastCheckOk !== false;
      const bHealthy = b.health.lastCheckOk !== false;
      if (aHealthy !== bHealthy) return aHealthy ? -1 : 1;

      // 3. Success rate (higher = better)
      if (a.health.successRate !== b.health.successRate) {
        return (b.health.successRate || 0) - (a.health.successRate || 0);
      }

      // 4. Configured priority (lower = tried first)
      if (a.meta.priority !== b.meta.priority) {
        return (a.meta.priority || 100) - (b.meta.priority || 100);
      }

      // 5. Average latency (lower = better)
      return (a.health.avgLatency || Infinity) - (b.health.avgLatency || Infinity);
    });
  }

  // ── Health Checks ──

  /**
   * Run health check on all registered providers.
   * Updates ProviderRegistry with health status.
   *
   * @returns {Promise<Object>} Health results by provider ID
   */
  static async runHealthChecks() {
    const results = {};

    for (const entry of registeredProviders) {
      const provider = entry.provider;
      const id = provider.constructor.metadata.id;

      try {
        const health = await provider.healthCheck();
        results[id] = health;

        // Update in-memory health cache
        const existing = providerHealth.get(id) || { successRate: 0.5, avgLatency: 0, lastCheckOk: true };
        const alpha = 0.3; // Exponential moving average weight
        existing.successRate = existing.successRate * (1 - alpha) + (health.ok ? 1 : 0) * alpha;
        existing.avgLatency = existing.avgLatency * (1 - alpha) + (health.latency || 0) * alpha;
        existing.lastCheckOk = health.ok;
        existing.lastCheckAt = new Date();
        providerHealth.set(id, existing);

        // Update persistent health in registry
        await ProviderRegistry.recordHealth(id, health);
      } catch (err) {
        results[id] = { ok: false, latency: -1, error: err.message };
        providerHealth.set(id, { successRate: 0, avgLatency: Infinity, lastCheckOk: false, lastCheckAt: new Date() });
        await ProviderRegistry.recordHealth(id, { ok: false, latency: -1, error: err.message });
      }
    }

    return results;
  }

  // ── Stream Resolution ──

  /**
   * Resolve a streaming URL for a content item.
   * This is the main entry point — called when user presses PLAY.
   *
   * Flow:
   *   1. Lookup content by slug
   *   2. Get provider mapping (providers[] first → legacy sourceId fallback)
   *   3. Check _streamCache (existing TTL-based cache)
   *   4. If cache HIT with buffer → return cached URL
   *   5. If cache MISS or EXPIRED → acquire distributed lock
   *   6. Find matching provider (match by id OR legacyIds)
   *   7. Try providers in priority order: API → LIGHT_SCRAPER → BROWSER_SCRAPER
   *   8. Cache result → release lock → return
   *
   * @param {Object} params
   * @param {string} params.slug - NovaStream content slug
   * @param {string} params.contentType - 'movie' or 'series'
   * @param {string} [params.quality] - Requested quality
   * @param {number} [params.season] - Season number (series only)
   * @param {number} [params.episode] - Episode number (series only)
   * @param {string} [params.providerName] - Preferred provider (user selection, C5e)
   * @returns {Promise<{url: string, expiresAt: number, provider: string, cached: boolean, allQualities?: Array}>}
   */
  static async resolve({ slug, contentType, quality, season, episode, providerName }) {
    // 1. Lookup content
    const content = await Content.findOne({ slug, isActive: true }).lean();
    if (!content) {
      throw ApiError.notFound(`Content '${slug}' not found`);
    }

    // 2. Get ALL provider mappings (multi-provider fallback — C4b)
    let mappings = this._getProviderMappings(content);

    if (!mappings || mappings.length === 0) {
      throw ApiError.notFound(`Content '${slug}' has no provider mapping. Run content sync first.`);
    }

    // C5e: If user selected a specific provider, promote it to the front of the queue
    if (providerName) {
      const preferredIdx = mappings.findIndex(m =>
        m.providerName === providerName || m.legacySourceSite === providerName
      );
      if (preferredIdx > 0) {
        const [preferred] = mappings.splice(preferredIdx, 1);
        mappings.unshift(preferred);
        logger.info({ slug, preferredProvider: providerName }, 'ProviderManager: user-preferred provider promoted to front');
      }
    }

    // 3. Try each provider mapping in priority order
    //    One provider failure does NOT stop playback — continue until providers exhausted
    const errors = [];
    for (const mapping of mappings) {
      try {
        const result = await this._resolveWithMapping({
          content,
          mapping,
          slug,
          contentType,
          quality,
          season,
          episode,
        });

        // Success — resolved with this provider
        if (mappings.length > 1) {
          logger.info({
            slug,
            provider: result.provider,
            attempted: mappings.length,
            remaining: mappings.length - 1 - mappings.indexOf(mapping),
          }, 'ProviderManager: multi-provider fallback resolved');
        }

        return result;
      } catch (err) {
        errors.push({ providerName: mapping.providerName, error: err.message });
        logger.warn({
          slug,
          providerName: mapping.providerName,
          err: err.message,
          remaining: mappings.length - errors.length,
        }, 'ProviderManager: provider mapping failed — trying next');
      }
    }

    // All providers exhausted
    logger.warn({
      slug,
      attempted: mappings.length,
      errors,
    }, 'ProviderManager: all provider mappings exhausted');

    throw ApiError.notFound('No stream sources available for this content');
  }

  /**
   * Resolve a stream URL for a SINGLE provider mapping.
   * Extracted from resolve() for multi-provider support (C4b).
   *
   * Flow:
   *   1. Build cache key from provider mapping
   *   2. Check _streamCache → return if HIT
   *   3. Acquire distributed lock
   *   4. Try API providers matching this mapping
   *   5. Try LIGHT_SCRAPER providers matching this mapping
   *   6. Try BROWSER_SCRAPER providers matching this mapping
   *   7. Cache result → return
   */
  static async _resolveWithMapping({ content, mapping, slug, contentType, quality, season, episode }) {
    const { providerName, providerContentId } = mapping;

    // Build cache key (still uses providerContentId for backward-compatible cache format)
    let cacheKey;
    if (contentType === 'movie') {
      cacheKey = `${providerName}:movie:${providerContentId}:${quality || '720p'}`;
    } else {
      const s = season || 1;
      const e = episode || 1;
      cacheKey = `${providerName}:series:${providerContentId}:s${s}:e${e}:${quality || '720p'}`;
    }

    // Check _streamCache
    const cached = await this._checkCache(cacheKey);
    if (cached) {
      logger.debug({ cacheKey, slug, providerName }, 'ProviderManager: cache HIT');
      const expiresAt = cached.expiresAt?.getTime
        ? Math.floor(cached.expiresAt.getTime() / 1000)
        : cached.expiresAt;
      return {
        url: cached.url,
        expiresAt,
        allQualities: [{ quality: cached.quality || quality || '720p', url: cached.url }],
        provider: 'cache',
        cached: true,
      };
    }

    // Acquire distributed lock (cache stampede protection — C-008)
    const lock = new DistributedLock(`stream:resolve:${cacheKey}`, { ttlMs: LOCK_TTL_MS });
    let acquired = false;

    try {
      acquired = await lock.acquire();

      // Double-check cache after acquiring lock
      if (acquired) {
        const doubleCheck = await this._checkCache(cacheKey);
        if (doubleCheck) {
          await lock.release();
          const expiresAt = doubleCheck.expiresAt?.getTime
            ? Math.floor(doubleCheck.expiresAt.getTime() / 1000)
            : doubleCheck.expiresAt;
          return {
            url: doubleCheck.url,
            expiresAt,
            allQualities: [{ quality: doubleCheck.quality || quality || '720p', url: doubleCheck.url }],
            provider: 'cache',
            cached: true,
          };
        }
      }

      // Resolve with this mapping
      const startTime = Date.now();
      let streamResult = null;
      let resolvedProvider = null;
      let allQualities = null;

      // Try API providers first (DIRECT)
      const apiProviders = this.getOrderedProviders('API');
      for (const { provider, meta } of apiProviders) {
        if (!this._matchesProvider(meta, providerName)) continue;

        try {
          // C4c: pass full mapping object so providers can use providerData
          const streams = await provider.getStreams(mapping, {
            season,
            episode,
            quality,
            contentType,
            slug,
          });
          if (streams && streams.length > 0) {
            streamResult = this._pickBestStream(streams, quality);
            allQualities = streams.map(s => ({ quality: s.quality, url: s.url }));
            resolvedProvider = meta.id;
            await ProviderRegistry.recordSuccess(meta.id, Date.now() - startTime);
            break;
          }
        } catch (err) {
          logger.warn({ err, providerId: meta.id, slug, providerName }, 'ProviderManager: API provider failed');
          await ProviderRegistry.recordFailure(meta.id);
        }
      }

      // If no API provider succeeded, try LIGHT_SCRAPER providers (QUEUE)
      if (!streamResult) {
        const scraperProviders = this.getOrderedProviders('LIGHT_SCRAPER');
        for (const { provider, meta } of scraperProviders) {
          if (!this._matchesProvider(meta, providerName)) continue;

          try {
            // C4c: pass full mapping object so scraper providers can use providerData
          const streams = await ScraperQueue.submit(provider, 'getStreams', [mapping, { season, episode, quality, contentType, slug }]);
            if (streams && streams.length > 0) {
              streamResult = this._pickBestStream(streams, quality);
              allQualities = streams.map(s => ({ quality: s.quality, url: s.url }));
              resolvedProvider = meta.id;
              await ProviderRegistry.recordSuccess(meta.id, Date.now() - startTime);
              break;
            }
          } catch (err) {
            logger.warn({ err, providerId: meta.id, slug, providerName }, 'ProviderManager: LIGHT_SCRAPER provider failed');
            await ProviderRegistry.recordFailure(meta.id);
          }
        }
      }

      // Last resort — try BROWSER_SCRAPER providers (WORKER)
      if (!streamResult) {
        const browserProviders = this.getOrderedProviders('BROWSER_SCRAPER');
        for (const { provider, meta } of browserProviders) {
          if (!this._matchesProvider(meta, providerName)) continue;

          try {
            // C4c: pass full mapping object so browser scraper providers can use providerData
            const streams = await ScraperQueue.submit(provider, 'getStreams', [mapping, { season, episode, quality, contentType, slug }]);
            if (streams && streams.length > 0) {
              streamResult = this._pickBestStream(streams, quality);
              allQualities = streams.map(s => ({ quality: s.quality, url: s.url }));
              resolvedProvider = meta.id;
              await ProviderRegistry.recordSuccess(meta.id, Date.now() - startTime);
              break;
            }
          } catch (err) {
            logger.warn({ err, providerId: meta.id, slug, providerName }, 'ProviderManager: BROWSER_SCRAPER provider failed');
            await ProviderRegistry.recordFailure(meta.id);
          }
        }
      }

      if (!streamResult) {
        throw ApiError.notFound(`No stream sources available for mapping '${providerName}'`);
      }

      // Cache the result
      const expiresAt = this._getExpiresAt(streamResult.url);
      await this._saveCache(cacheKey, streamResult.url, quality || '720p', expiresAt);

      logger.info({
        slug,
        provider: resolvedProvider,
        providerName,
        quality: streamResult.quality,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      }, 'ProviderManager: stream resolved and cached');

      return {
        url: streamResult.url,
        expiresAt,
        allQualities,
        provider: resolvedProvider,
        cached: false,
      };

    } finally {
      if (acquired) {
        await lock.release().catch(() => {});
      }
    }
  }

  /**
   * Refresh a stream URL by invalidating the cache and re-resolving.
   *
   * @param {Object} params - Same as resolve(), plus optional providerName
   * @returns {Promise<Object>} Stream result
   */
  static async refresh({ slug, contentType, quality, season, episode, providerName }) {
    const content = await Content.findOne({ slug, isActive: true }).lean();
    if (!content) {
      throw ApiError.notFound(`Content '${slug}' not found`);
    }

    const providerMapping = this._getProviderMapping(content);
    if (!providerMapping) {
      throw ApiError.notFound(`Content '${slug}' has no provider mapping`);
    }

    const { providerName: primaryName, providerContentId } = providerMapping;
    const actualProviderName = providerName || primaryName;
    let cacheKey;
    if (contentType === 'movie') {
      cacheKey = `${actualProviderName}:movie:${providerContentId}:${quality || '720p'}`;
    } else {
      const s = season || 1;
      const e = episode || 1;
      cacheKey = `${actualProviderName}:series:${providerContentId}:s${s}:e${e}:${quality || '720p'}`;
    }

    // Delete existing cache entry
    try {
      await streamCacheCol().deleteOne({ _id: cacheKey });
    } catch {}

    // Re-resolve with provider preference
    return this.resolve({ slug, contentType, quality, season, episode, providerName });
  }

  // ── Cache Helpers ──

  /**
   * Check the _streamCache for a valid cached stream URL.
   * Applies a 10-minute safety buffer before expiry (same as ContentSourceService).
   */
  static async _checkCache(key) {
    try {
      const doc = await streamCacheCol().findOne({ _id: key });
      if (!doc) return null;

      const now = Math.floor(Date.now() / 1000);
      const expiresSec = doc.expiresAt
        ? Math.floor(new Date(doc.expiresAt).getTime() / 1000)
        : 0;

      // 10-minute safety buffer
      if (now >= expiresSec - 600) {
        await streamCacheCol().deleteOne({ _id: key }).catch(() => {});
        return null;
      }

      // Increment hit count
      streamCacheCol().updateOne({ _id: key }, { $inc: { hitCount: 1 } }).catch(() => {});
      return doc;
    } catch {
      return null;
    }
  }

  /**
   * Save a stream URL to the _streamCache.
   */
  static async _saveCache(key, url, quality, expiresAt) {
    try {
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
    } catch (err) {
      logger.warn({ err, cacheKey: key }, 'ProviderManager: failed to save stream cache');
    }
  }

  // ── Provider Mapping & Matching Helpers ──

  /**
   * Get ALL provider mappings for a content item, ordered by resolution priority.
   * Returns providers[] entries sorted by: confidenceScore (desc) → status (verified=first).
   * Falls back to legacy sourceId/sourceSite as a single-element array.
   *
   * C4b: Enables multi-provider fallback — if one provider fails, the next is tried.
   *
   * @param {Object} content - Content document (lean)
   * @returns {Array<{ providerName: string, providerContentId: string, providerData: Object, confidenceScore?: number }>}
   */
  static _getProviderMappings(content) {
    const mappings = [];

    // Priority 1: providers[] array (Track C2)
    if (content.providers && content.providers.length > 0) {
      const valid = content.providers.filter(p => p.providerName && p.providerContentId);
      if (valid.length > 0) {
        // Sort: higher confidence first, verified/active before others
        valid.sort((a, b) => {
          const aScore = a.confidenceScore || 0;
          const bScore = b.confidenceScore || 0;
          if (aScore !== bScore) return bScore - aScore;

          // Prefer verified/active status
          const aStatus = a.status === 'verified' || a.status === 'active' ? 1 : 0;
          const bStatus = b.status === 'verified' || b.status === 'active' ? 1 : 0;
          if (aStatus !== bStatus) return bStatus - aStatus;

          return 0;
        });

        for (const p of valid) {
          mappings.push({
            providerName: p.providerName,
            providerContentId: p.providerContentId,
            providerData: p.providerData || {},
            confidenceScore: p.confidenceScore,
          });
        }
      }
    }

    // Priority 2: Legacy sourceId/sourceSite (backward compatibility)
    // Only add if not already covered by providers[] with matching providerName or legacySourceSite
    if (content.sourceId) {
      const legacyName = content.sourceSite || 'primary';
      const alreadyCovered = mappings.some(
        m => m.providerName === legacyName || m.legacySourceSite === legacyName
      );
      if (!alreadyCovered) {
        logger.debug({
          slug: content.slug,
          title: content.title,
          sourceId: content.sourceId,
          sourceSite: content.sourceSite || 'primary',
        }, 'ProviderManager: legacy sourceId/sourceSite added as additional fallback');
        mappings.push({
          providerName: legacyName,
          providerContentId: content.sourceId,
          providerData: {},
          confidenceScore: 0, // Lowest — legacy data
        });
      }
    }

    return mappings;
  }

  /**
   * Get the SINGLE best provider mapping for a content item.
   * Legacy compatibility — prefer _getProviderMappings() for multi-provider support.
   *
   * @param {Object} content - Content document (lean)
   * @returns {{ providerName: string, providerContentId: string } | null}
   */
  static _getProviderMapping(content) {
    const mappings = this._getProviderMappings(content);
    return mappings.length > 0 ? mappings[0] : null;
  }

  /**
   * Check if a provider's metadata matches a requested provider name.
   * Checks both the provider's id AND any legacy aliases (legacyIds).
   *
   * C3a: This enables legacy sourceSite='primary' to resolve to the 'yupflix'
   * provider without database migration. The provider declares legacyIds: ['primary']
   * in its static metadata, and we match against it here.
   *
   * @param {Object} meta - Provider's static metadata
   * @param {string} providerName - The name to match (from content mapping)
   * @returns {boolean}
   */
  static _matchesProvider(meta, providerName) {
    if (meta.id === providerName) return true;
    if (meta.legacyIds && Array.isArray(meta.legacyIds) && meta.legacyIds.includes(providerName)) return true;
    return false;
  }

  // ── Stream Result Helpers ──

  /**
   * Pick the best stream from a list, preferring the requested quality.
   */
  static _pickBestStream(streams, preferredQuality) {
    if (!streams || streams.length === 0) return null;

    const preferred = preferredQuality || '720p';
    return streams.find(s => s.quality === preferred)
      || streams.find(s => s.quality === '1080p')
      || streams.find(s => s.quality === '720p')
      || streams[0];
  }

  /**
   * Extract expires timestamp from a URL, or use 24h fallback.
   */
  static _getExpiresAt(url) {
    try {
      const urlObj = new URL(url);
      const expires = parseInt(urlObj.searchParams.get('expires'), 10);
      if (expires) return expires;
    } catch {}
    return Math.floor(Date.now() / 1000) + 86400;
  }

  // ── Provider Info ──

  /**
   * List all registered providers with their metadata and health.
   *
   * @returns {Promise<Array>}
   */
  static async listProviders() {
    const providers = registeredProviders.map(entry => {
      const meta = entry.provider.constructor.metadata;
      const health = providerHealth.get(meta.id) || {};
      return {
        id: meta.id,
        name: meta.name,
        version: meta.version,
        type: meta.providerType,
        priority: meta.priority,
        enabled: meta.enabled !== false,
        streamPolicy: meta.streamPolicy,
        execution: meta.execution,
        health: {
          ok: health.lastCheckOk,
          successRate: health.successRate,
          avgLatency: health.avgLatency,
          lastCheckAt: health.lastCheckAt,
        },
        source: entry.source,
      };
    });

    // Merge with database config
    for (const p of providers) {
      try {
        const config = await ProviderRegistry.getConfig(p.id);
        if (config && Object.keys(config).length > 0) {
          p.config = config;
        }
      } catch {}
    }

    return providers;
  }

  // ── Expired Stream Recovery (C-010) ──
  //
  // Hooks for future frontend integration. When the player receives
  // a 401/403/410 (expired or invalid URL during playback):
  //   1. Call attemptRecovery() to invalidate cache and re-resolve
  //   2. Retry playback with the fresh URL
  //   3. If all retries fail, fall through to next provider
  //
  // Implementation status: READY
  // Frontend integration: C3 (YupFlix migration)

  /**
   * Attempt to recover from an expired/invalid stream URL.
   * Invalidates the cache entry and re-resolves from the same provider.
   *
   * @param {Object} params - Same as resolve()
   * @param {number} [params.retries=2] - Number of recovery attempts
   * @returns {Promise<Object>} Fresh stream result
   */
  static async attemptRecovery({ slug, contentType, quality, season, episode, retries = 2 }) {
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Invalidate cache and re-resolve
        const result = await this.refresh({ slug, contentType, quality, season, episode });
        logger.info({
          slug,
          attempt,
          provider: result.provider,
        }, 'ProviderManager: stream recovery succeeded');
        return result;
      } catch (err) {
        lastError = err;
        logger.warn({
          slug,
          attempt,
          err: err.message,
        }, 'ProviderManager: stream recovery attempt failed');

        if (attempt < retries) {
          // Wait before retrying (exponential backoff: 1s, 2s)
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
    }

    throw lastError || ApiError.internal('Stream recovery failed after all attempts');
  }

  /**
   * Recovery hook for the player when it receives a 401/403/410.
   * To be called from the stream routes when the player signals an expired URL.
   *
   * @param {Object} params
   * @param {string} params.slug - Content slug
   * @param {string} params.contentType - 'movie' or 'series'
   * @param {string} [params.quality] - Current quality being played
   * @param {number} [params.season] - Current season (series)
   * @param {number} [params.episode] - Current episode (series)
   * @param {string} [params.expiredUrl] - The URL that failed (for logging)
   * @returns {Promise<Object>} Fresh stream result
   */
  static async handleExpiredStream({ slug, contentType, quality, season, episode, expiredUrl }) {
    logger.warn({
      slug,
      expiredUrl: expiredUrl ? expiredUrl.slice(0, 80) + '...' : undefined,
    }, 'ProviderManager: expired stream reported, attempting recovery');

    return this.attemptRecovery({
      slug,
      contentType,
      quality,
      season,
      episode,
      retries: 2,
    });
  }

  // ── C5d: Stream Recovery (Playback Lifecycle UX) ──
  //
  // Orchestrated recovery flow when the player detects a stream failure:
  //   Phase 1 — Refresh same provider (clear cache, re-resolve)
  //   Phase 2 — Fallback to next provider (full resolve with multi-provider chain)
  //   Phase 3 — All exhausted, report unavailable
  //
  // Retry storm protection prevents infinite recovery loops:
  //   - Max 3 recovery attempts per user+content+session
  //   - Storm window resets after 60 seconds of no recovery activity

  /**
   * Recover from a stream playback failure.
   *
   * Two-phase recovery:
   *   1. Refresh the current provider (clear cache, re-resolve same provider)
   *   2. Fallback to next provider (resolve() tries all provider mappings)
   *
   * Retry storm protection: max 3 attempts per user+content+session.
   * Quality preference is preserved throughout both phases.
   *
   * @param {Object} params
   * @param {string} params.slug - Content slug
   * @param {string} params.contentType - 'movie' or 'series'
   * @param {string} [params.quality] - Preferred quality (preserved during recovery)
   * @param {number} [params.season] - Season number (series)
   * @param {number} [params.episode] - Episode number (series)
   * @param {string} [params.userId] - User ID for storm protection
   * @param {string} [params.providerName] - Preferred provider (user selection, C5e)
   * @returns {Promise<{url: string, expiresAt: number, provider: string, allQualities?: Array}>}
   */
  static async recoverStream({ slug, contentType, quality, season, episode, userId, providerName }) {
    const stormKey = `${userId || 'anonymous'}:${slug}:${contentType}:${season || 1}:${episode || 1}`;
    const currentAttempts = recoveryStormCount.get(stormKey) || 0;

    // ── Retry Storm Protection ──
    if (currentAttempts >= MAX_RECOVERY_ATTEMPTS) {
      logger.warn({ slug, userId, attempts: currentAttempts }, 'ProviderManager: recovery storm limit reached');
      throw ApiError.internal('Stream temporarily unavailable');
    }

    // Increment attempt counter (auto-expires after STORM_WINDOW_MS)
    recoveryStormCount.set(stormKey, currentAttempts + 1);
    if (currentAttempts === 0) {
      // Set cleanup timeout only on first attempt
      setTimeout(() => {
        recoveryStormCount.delete(stormKey);
      }, STORM_WINDOW_MS);
    }

    // ── Phase 1: Refresh same provider (clear cache, re-resolve) ──
    logger.info({ slug, attempt: currentAttempts + 1 }, 'ProviderManager: recovery phase 1 — refresh same provider');
    try {
      // C5e: If user selected a provider, pass it to refresh
      const result = await this.refresh({ slug, contentType, quality, season, episode, providerName });
      // Success — reset storm counter
      recoveryStormCount.delete(stormKey);
      logger.info({ slug, provider: result.provider }, 'ProviderManager: recovery phase 1 succeeded');
      return result;
    } catch (err) {
      logger.warn({ slug, err: err.message }, 'ProviderManager: recovery phase 1 failed — same provider refresh unsuccessful');
    }

    // ── Phase 2: Fallback to next provider (full resolve chain) ──
    logger.info({ slug, attempt: currentAttempts + 1 }, 'ProviderManager: recovery phase 2 — fallback provider chain');
    try {
      // Full resolve() tries all provider mappings in order (multi-provider fallback)
      // C5e: If user selected a provider, pass it; the preferred provider is tried first
      const result = await this.resolve({ slug, contentType, quality, season, episode, providerName });
      // Success — reset storm counter
      recoveryStormCount.delete(stormKey);
      logger.info({ slug, provider: result.provider }, 'ProviderManager: recovery phase 2 succeeded — fallback provider resolved');
      return result;
    } catch (err) {
      logger.warn({ slug, err: err.message }, 'ProviderManager: recovery phase 2 failed — all providers exhausted');
    }

    // ── Phase 3: All recovery paths exhausted ──
    throw ApiError.internal('Stream temporarily unavailable');
  }

  /**
   * Get the current state of the provider system.
   *
   * @returns {Object} System state
   */
  static async getSystemState() {
    return {
      providerCount: registeredProviders.length,
      providers: registeredProviders.map(e => e.provider.constructor.metadata.id),
      health: Object.fromEntries(providerHealth),
      scraperQueue: ScraperQueue.getStats(),
      registryStatus: 'operational',
    };
  }
}

module.exports = ProviderManager;
