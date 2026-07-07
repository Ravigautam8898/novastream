// server/src/metadata/BaseMetadataProvider.js
// BaseMetadataProvider — Abstract interface for metadata providers (Track C5)
//
// Metadata providers are responsible for content discovery:
//   - trending/popular feeds
//   - search across movies and series
//   - full detail pages (synopsis, cast, artwork, seasons/episodes)
//   - category/discovery browsing
//
// Metadata providers NEVER return stream URLs. Streaming is handled
// exclusively by stream providers (BaseProvider subclasses in providers/sources/).
//
// Design rules:
//   1. Metadata providers discover and describe content
//   2. Stream providers only resolve playback
//   3. ProviderManager and MetadataManager are independent systems
//   4. Metadata registration through ContentRegistry happens on detail/playback,
//      not on browse (to avoid filling MongoDB with unused items)
//
// See PROVIDER_DEVELOPMENT.md for full contract documentation.

const logger = require('../config/logger');

class BaseMetadataProvider {
  /**
   * Metadata provider contract.
   * Every subclass MUST override this with provider-specific values.
   *
   * @static
   * @type {Object}
   */
  static metadata = {
    id: 'base-metadata-provider',
    name: 'Base Metadata Provider',
    version: '0.0.0',
    providerType: 'API',              // 'API' | 'SCRAPER'
    priority: 100,                     // Lower = tried first
    enabled: true,
    capabilities: {
      trending: true,                   // Supports getTrending()
      search: true,                     // Supports search()
      details: true,                    // Supports getDetails()
      discover: false,                  // Supports discoverByLanguage/Genre
      episodes: false,                  // Supports getSeasonEpisodes()
    },
  };

  /**
   * Validate that a metadata provider's metadata conforms to the contract.
   * Called by MetadataManager at registration time.
   *
   * @param {Function} providerClass - The provider class (constructor)
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateMetadata(providerClass) {
    const errors = [];
    const meta = providerClass.metadata;

    if (!meta) {
      return { valid: false, errors: ['Missing static metadata property'] };
    }

    // Required fields
    const requiredFields = ['id', 'name', 'version', 'providerType', 'priority'];
    for (const field of requiredFields) {
      if (meta[field] === undefined || meta[field] === null) {
        errors.push(`Missing required metadata field: ${field}`);
      }
    }

    // providerType validation
    const validTypes = ['API', 'SCRAPER'];
    if (meta.providerType && !validTypes.includes(meta.providerType)) {
      errors.push(`Invalid providerType: "${meta.providerType}". Must be one of: ${validTypes.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Initialize the metadata provider — set up HTTP client, load API keys.
   * MUST be called before any other method.
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error(`Metadata provider "${this.constructor.metadata.id}" must implement initialize()`);
  }

  /**
   * Check if the metadata provider is operational.
   *
   * @returns {Promise<{ok: boolean, latency: number, error?: string}>}
   */
  async healthCheck() {
    throw new Error(`Metadata provider "${this.constructor.metadata.id}" must implement healthCheck()`);
  }

  /**
   * Get trending/popular content.
   *
   * @param {Object} [options]
   * @param {number} [options.page=1] - Page number
   * @param {string} [options.timeWindow='week'] - 'day' | 'week'
   * @returns {Promise<Array<Object>>} Normalized content items with source metadata
   */
  async getTrending(options = {}) {
    throw new Error(`Metadata provider "${this.constructor.metadata.id}" must implement getTrending()`);
  }

  /**
   * Search for movies and series by query string.
   *
   * @param {string} query - Search term
   * @param {Object} [options]
   * @param {number} [options.page=1] - Page number
   * @returns {Promise<{movies: Array, series: Array, total: number, totalPages: number}>}
   */
  async search(query, options = {}) {
    throw new Error(`Metadata provider "${this.constructor.metadata.id}" must implement search()`);
  }

  /**
   * Get full metadata for a content item by its provider ID.
   * Includes synopsis, artwork, cast, videos, and (for series) seasons/episodes.
   *
   * @param {string} id - Provider's internal content ID
   * @param {string} contentType - 'movie' or 'series'
   * @returns {Promise<Object>} Normalized content detail object
   */
  async getDetails(id, contentType) {
    throw new Error(`Metadata provider "${this.constructor.metadata.id}" must implement getDetails()`);
  }

  /**
   * Get episodes for a specific season of a series.
   *
   * @param {string} seriesId - Provider's series ID
   * @param {number} seasonNumber - Season number
   * @returns {Promise<Object>} Season data with episodes array
   */
  async getSeasonEpisodes(seriesId, seasonNumber) {
    logger.debug({ provider: this.constructor.metadata.id, seriesId, seasonNumber }, 'getSeasonEpisodes not implemented');
    throw new Error(`Metadata provider "${this.constructor.metadata.id}" does not support getSeasonEpisodes()`);
  }

  /**
   * Normalize a content item from this provider into a standard format.
   * Called by MetadataManager to ensure consistent output across providers.
   *
   * @param {Object} raw - Raw item from the provider's API
   * @param {string} contentType - 'movie' or 'series'
   * @returns {Object} Normalized content item
   */
  normalizeItem(raw, contentType) {
    // Default normalization — override for provider-specific transformations
    return {
      ...raw,
      source: this.constructor.metadata.id,
    };
  }

  /**
   * Cleanup resources on provider unload.
   * Optional — override if provider has connections, timers, or event listeners.
   *
   * @returns {Promise<void>}
   */
  async dispose() {
    // No-op by default
  }
}

module.exports = BaseMetadataProvider;
