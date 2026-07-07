// server/src/metadata/MetadataManager.js
// MetadataManager — Core orchestrator for Track C5 Metadata Provider System
//
// Responsibilities:
//   - Discover and register metadata providers from metadata/sources/
//   - Order providers by priority → health → latency
//   - Dispatch metadata requests to the appropriate provider(s)
//   - Normalize provider output into a standard format
//   - Separate from ProviderManager (stream providers are completely independent)
//
// Architecture:
//   MetadataManager is to metadata providers what ProviderManager is to stream providers.
//   The two systems are independent — metadata providers never return streams,
//   and stream providers never create catalog entries.
//
//   Browse flow:
//     Frontend → ContentService → MetadataManager → TMDB / Trakt / etc.
//                                                      ↓
//     No Content document created (OTT-style, no DB fill on browse)
//
//   Detail flow:
//     User opens detail → ContentRegistry.registerOrUpdate() → Nova slug created
//
// Resolution flow:
//   getTrending()  → Try primary metadata provider first → fallback to next
//   search()       → Try DB first → try metadata providers
//   getDetails()   → Try ContentRegistry first → try metadata providers
//
// Provider ordering:
//   1. Capability match (provider supports the requested method)
//   2. Priority (lower = tried first)
//   3. Health (online > degraded > offline)
//   4. Average latency (lower = better)

const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');
const BaseMetadataProvider = require('./BaseMetadataProvider');

// ── Constants ──

const METADATA_DIR = path.resolve(__dirname, 'sources');
const providerHealth = new Map(); // providerId → { successRate, avgLatency, lastCheck }

class MetadataManager {
  /** @type {Array<{ provider: BaseMetadataProvider, source: string }>} */
  static registeredProviders = [];

  // ── Provider Discovery & Registration ──

  /**
   * Discover and register all metadata providers from the metadata/sources directory.
   * Called once at server startup, after database connection is established.
   *
   * @returns {Promise<number>} Number of metadata providers registered
   */
  static async discoverProviders() {
    let count = 0;

    try {
      if (!fs.existsSync(METADATA_DIR)) {
        logger.warn({ dir: METADATA_DIR }, 'MetadataManager: sources directory not found');
        return 0;
      }

      const files = fs.readdirSync(METADATA_DIR)
        .filter(f => f.endsWith('.metadata.js'))
        .sort();

      for (const file of files) {
        try {
          const modulePath = path.join(METADATA_DIR, file);
          const ProviderClass = require(modulePath);

          if (!BaseMetadataProvider.isPrototypeOf(ProviderClass) &&
              ProviderClass.prototype instanceof BaseMetadataProvider === false) {
            logger.warn({ file }, 'MetadataManager: file does not extend BaseMetadataProvider — skipping');
            continue;
          }

          const registered = await this._registerProvider(ProviderClass, file);
          if (registered) {
            count++;
          }
        } catch (err) {
          logger.error({ err, file }, 'MetadataManager: failed to load metadata provider file');
        }
      }
    } catch (err) {
      logger.error({ err }, 'MetadataManager: failed to discover metadata providers');
    }

    logger.info({ count, total: count }, 'MetadataManager: provider discovery complete');
    return count;
  }

  /**
   * Register a single metadata provider class.
   *
   * @param {typeof BaseMetadataProvider} ProviderClass - Provider class (constructor)
   * @param {string} [source] - Source filename for discovery tracking
   * @returns {Promise<boolean>} Whether registration succeeded
   */
  static async _registerProvider(ProviderClass, source = 'manual') {
    const meta = ProviderClass.metadata;

    // Validate metadata
    const validation = BaseMetadataProvider.validateMetadata(ProviderClass);
    if (!validation.valid) {
      logger.error({
        provider: meta?.id || 'unknown',
        errors: validation.errors,
      }, 'MetadataManager: metadata validation failed — provider not registered');
      return false;
    }

    // Check for duplicate IDs
    if (this.registeredProviders.some(p => p.provider.constructor.metadata.id === meta.id)) {
      logger.warn({ providerId: meta.id }, 'MetadataManager: provider already registered — skipping duplicate');
      return false;
    }

    try {
      const instance = new ProviderClass();
      await instance.initialize();

      this.registeredProviders.push({ provider: instance, source });
      logger.info({
        providerId: meta.id,
        name: meta.name,
        providerType: meta.providerType,
        priority: meta.priority,
        capabilities: Object.entries(meta.capabilities)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(', '),
        source,
      }, 'MetadataManager: metadata provider registered');

      return true;
    } catch (err) {
      logger.error({ err, providerId: meta.id }, 'MetadataManager: provider initialization failed');
      return false;
    }
  }

  /**
   * Get a specific metadata provider by ID.
   *
   * @param {string} providerId - Provider identifier
   * @returns {BaseMetadataProvider|null}
   */
  static getProvider(providerId) {
    const entry = this.registeredProviders.find(p => p.provider.constructor.metadata.id === providerId);
    return entry ? entry.provider : null;
  }

  /**
   * Get ordered providers, sorted by: priority → health → latency.
   * Optionally filter by capability.
   *
   * @param {string} [capability] - Optional capability filter (e.g. 'trending', 'search')
   * @returns {Array<{ provider: BaseMetadataProvider, meta: Object, health: Object }>}
   */
  static getOrderedProviders(capability) {
    let providers = this.registeredProviders.map(entry => ({
      provider: entry.provider,
      meta: entry.provider.constructor.metadata,
      health: providerHealth.get(entry.provider.constructor.metadata.id) || {
        successRate: 0.5,
        avgLatency: Infinity,
        lastCheckOk: true,
      },
    }));

    // Filter by capability if specified
    if (capability) {
      providers = providers.filter(p => {
        const caps = p.meta.capabilities || {};
        return caps[capability] === true;
      });
    }

    // Sort: priority → health → latency
    return providers.sort((a, b) => {
      // 1. Priority (lower = first)
      if (a.meta.priority !== b.meta.priority) {
        return (a.meta.priority || 100) - (b.meta.priority || 100);
      }
      // 2. Health check
      const aHealthy = a.health.lastCheckOk !== false;
      const bHealthy = b.health.lastCheckOk !== false;
      if (aHealthy !== bHealthy) return aHealthy ? -1 : 1;
      // 3. Success rate
      if (a.health.successRate !== b.health.successRate) {
        return (b.health.successRate || 0) - (a.health.successRate || 0);
      }
      // 4. Latency
      return (a.health.avgLatency || Infinity) - (b.health.avgLatency || Infinity);
    });
  }

  // ── Health Checks ──

  /**
   * Run health check on all registered metadata providers.
   *
   * @returns {Promise<Object>} Health results by provider ID
   */
  static async runHealthChecks() {
    const results = {};

    for (const entry of this.registeredProviders) {
      const provider = entry.provider;
      const id = provider.constructor.metadata.id;

      try {
        const health = await provider.healthCheck();
        results[id] = health;

        const existing = providerHealth.get(id) || { successRate: 0.5, avgLatency: 0, lastCheckOk: true };
        const alpha = 0.3;
        existing.successRate = existing.successRate * (1 - alpha) + (health.ok ? 1 : 0) * alpha;
        existing.avgLatency = existing.avgLatency * (1 - alpha) + (health.latency || 0) * alpha;
        existing.lastCheckOk = health.ok;
        existing.lastCheckAt = new Date();
        providerHealth.set(id, existing);
      } catch (err) {
        results[id] = { ok: false, latency: -1, error: err.message };
        providerHealth.set(id, { successRate: 0, avgLatency: Infinity, lastCheckOk: false, lastCheckAt: new Date() });
      }
    }

    return results;
  }

  // ── Dispatch Methods ──

  /**
   * Get trending content from the best available metadata provider.
   * Tries providers in priority order — falls through on failure.
   *
   * @param {Object} [options]
   * @param {number} [options.page=1] - Page number
   * @returns {Promise<Array<Object>>} Normalized trending items
   */
  static async getTrending(options = {}) {
    const { page = 1 } = options;
    const providers = this.getOrderedProviders('trending');

    if (providers.length === 0) {
      logger.warn('MetadataManager: no metadata providers support getTrending');
      return [];
    }

    const errors = [];
    for (const { provider, meta } of providers) {
      try {
        const items = await provider.getTrending({ page });
        const normalized = (items || []).map(item => provider.normalizeItem(item));
        logger.debug({ provider: meta.id, count: normalized.length }, 'MetadataManager: trending fetched');
        return normalized;
      } catch (err) {
        errors.push({ provider: meta.id, error: err.message });
        logger.warn({ provider: meta.id, err: err.message }, 'MetadataManager: trending failed, trying next provider');
      }
    }

    logger.warn({ errors }, 'MetadataManager: all metadata providers failed for getTrending');
    return [];
  }

  /**
   * Search for content across metadata providers.
   * Tries providers in priority order.
   *
   * @param {string} query - Search term
   * @param {Object} [options]
   * @param {number} [options.page=1] - Page number
   * @returns {Promise<{movies: Array, series: Array, total: number, totalPages: number}>}
   */
  static async search(query, options = {}) {
    const { page = 1 } = options;
    const providers = this.getOrderedProviders('search');

    if (providers.length === 0) {
      logger.warn('MetadataManager: no metadata providers support search');
      return { movies: [], series: [], total: 0, totalPages: 0 };
    }

    const errors = [];
    for (const { provider, meta } of providers) {
      try {
        const results = await provider.search(query, { page });
        // Normalize items
        const movies = (results.movies || []).map(item => provider.normalizeItem(item, 'movie'));
        const series = (results.series || []).map(item => provider.normalizeItem(item, 'series'));
        logger.debug({ provider: meta.id, query, movieCount: movies.length, seriesCount: series.length }, 'MetadataManager: search completed');
        return { movies, series, total: results.total || 0, totalPages: results.totalPages || 0 };
      } catch (err) {
        errors.push({ provider: meta.id, error: err.message });
        logger.warn({ provider: meta.id, err: err.message }, 'MetadataManager: search failed, trying next provider');
      }
    }

    logger.warn({ errors, query }, 'MetadataManager: all metadata providers failed for search');
    return { movies: [], series: [], total: 0, totalPages: 0 };
  }

  /**
   * Get full details for a content item from the best metadata provider.
   *
   * @param {string} id - Provider's content ID
   * @param {string} contentType - 'movie' or 'series'
   * @param {Object} [options]
   * @param {string} [options.providerId] - Specific provider to use (optional)
   * @returns {Promise<Object>} Normalized content detail
   */
  static async getDetails(id, contentType, options = {}) {
    const { providerId } = options || {};
    let providers;

    if (providerId) {
      // Use a specific provider
      const provider = this.getProvider(providerId);
      if (!provider) {
        throw new Error(`Metadata provider "${providerId}" not found or not registered`);
      }
      providers = [{ provider, meta: provider.constructor.metadata }];
    } else {
      providers = this.getOrderedProviders('details');
    }

    if (providers.length === 0) {
      throw new Error('No metadata providers available for getDetails');
    }

    const errors = [];
    for (const { provider, meta } of providers) {
      try {
        const data = await provider.getDetails(id, contentType);
        const normalized = provider.normalizeItem(data, contentType);
        logger.debug({ provider: meta.id, id, contentType }, 'MetadataManager: details fetched');
        return normalized;
      } catch (err) {
        errors.push({ provider: meta.id, error: err.message });
        logger.warn({ provider: meta.id, err: err.message }, 'MetadataManager: getDetails failed, trying next provider');
      }
    }

    logger.error({ errors, id, contentType }, 'MetadataManager: all metadata providers failed for getDetails');
    throw new Error(`Content details not found (ID: ${id}, type: ${contentType})`);
  }

  /**
   * Get season episodes for a series.
   *
   * @param {string} seriesId - Provider's series ID
   * @param {number} seasonNumber - Season number
   * @returns {Promise<Object>} Season data with episodes
   */
  static async getSeasonEpisodes(seriesId, seasonNumber) {
    const providers = this.getOrderedProviders('episodes');

    if (providers.length === 0) {
      throw new Error('No metadata providers available for getSeasonEpisodes');
    }

    const errors = [];
    for (const { provider, meta } of providers) {
      try {
        const data = await provider.getSeasonEpisodes(seriesId, seasonNumber);
        logger.debug({ provider: meta.id, seriesId, seasonNumber }, 'MetadataManager: season episodes fetched');
        return data;
      } catch (err) {
        errors.push({ provider: meta.id, error: err.message });
      }
    }

    logger.error({ errors, seriesId, seasonNumber }, 'MetadataManager: all metadata providers failed for getSeasonEpisodes');
    throw new Error(`Season episodes not found (series: ${seriesId}, season: ${seasonNumber})`);
  }

  // ── Provider Info ──

  /**
   * List all registered metadata providers with their metadata and health.
   *
   * @returns {Promise<Array>}
   */
  static async listProviders() {
    return this.registeredProviders.map(entry => {
      const meta = entry.provider.constructor.metadata;
      const health = providerHealth.get(meta.id) || {};
      return {
        id: meta.id,
        name: meta.name,
        version: meta.version,
        type: meta.providerType,
        priority: meta.priority,
        enabled: meta.enabled !== false,
        capabilities: meta.capabilities || {},
        health: {
          ok: health.lastCheckOk,
          successRate: health.successRate,
          avgLatency: health.avgLatency,
          lastCheckAt: health.lastCheckAt,
        },
        source: entry.source,
      };
    });
  }

  /**
   * Get the current state of the metadata provider system.
   *
   * @returns {Object} System state
   */
  static async getSystemState() {
    return {
      providerCount: this.registeredProviders.length,
      providers: this.registeredProviders.map(e => e.provider.constructor.metadata.id),
      health: Object.fromEntries(providerHealth),
    };
  }
}

module.exports = MetadataManager;
