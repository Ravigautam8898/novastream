// server/src/providers/BaseProvider.js
// BaseProvider — Abstract interface for all streaming providers (Track C2)
//
// Every provider MUST extend this class and implement:
//   - initialize()        — Set up HTTP client, load secrets, validate config
//   - healthCheck()       — Return { ok, latency, error? }
//   - search(query)       — Search movies, series, anime, live TV
//   - getDetails(id)      — Full content metadata
//   - getStreams(id, opts) — Streaming URLs with qualities and headers
//
// Optional:
//   - getEpisodes(id)     — Episode list for series
//   - dispose()           — Cleanup on unload
//
// Provider metadata (static property) is validated at registration time.
// See PROVIDER_DEVELOPMENT.md for full interface contract.

const logger = require('../config/logger');

class BaseProvider {
  /**
   * Provider metadata contract.
   * Every subclass MUST override this with provider-specific values.
   *
   * @static
   * @type {Object}
   */
  static metadata = {
    id: 'base-provider',
    name: 'Base Provider',
    version: '0.0.0',
    author: 'NovaStream',
    providerType: 'API',       // 'API' | 'LIGHT_SCRAPER' | 'BROWSER_SCRAPER'
    priority: 100,
    enabled: true,
    execution: {
      mode: 'DIRECT',          // 'DIRECT' | 'QUEUE' | 'WORKER'
      maxConcurrent: null,
      timeout: 10000,
    },
    streamPolicy: {
      type: 'STATIC_URL',      // 'STATIC_URL' | 'SIGNED_URL' | 'DYNAMIC'
      ttl: '24h',
      refreshBefore: '0m',
    },
  };

  /**
   * Validate that a provider's metadata conforms to the contract.
   * Called by ProviderManager at registration time.
   *
   * @param {Object} providerClass - The provider class (constructor)
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
    const validTypes = ['API', 'LIGHT_SCRAPER', 'BROWSER_SCRAPER'];
    if (meta.providerType && !validTypes.includes(meta.providerType)) {
      errors.push(`Invalid providerType: "${meta.providerType}". Must be one of: ${validTypes.join(', ')}`);
    }

    // execution validation
    if (meta.execution) {
      const validModes = ['DIRECT', 'QUEUE', 'WORKER'];
      if (meta.execution.mode && !validModes.includes(meta.execution.mode)) {
        errors.push(`Invalid execution.mode: "${meta.execution.mode}". Must be one of: ${validModes.join(', ')}`);
      }
      if (meta.execution.timeout !== undefined && (typeof meta.execution.timeout !== 'number' || meta.execution.timeout <= 0)) {
        errors.push('execution.timeout must be a positive number');
      }
    }

    // streamPolicy validation
    if (meta.streamPolicy) {
      const validPolicies = ['STATIC_URL', 'SIGNED_URL', 'DYNAMIC'];
      if (meta.streamPolicy.type && !validPolicies.includes(meta.streamPolicy.type)) {
        errors.push(`Invalid streamPolicy.type: "${meta.streamPolicy.type}". Must be one of: ${validPolicies.join(', ')}`);
      }
    }

    // execution mode must match providerType
    if (meta.providerType && meta.execution?.mode) {
      const typeToMode = {
        'API': 'DIRECT',
        'LIGHT_SCRAPER': 'QUEUE',
        'BROWSER_SCRAPER': 'WORKER',
      };
      const expectedMode = typeToMode[meta.providerType];
      if (expectedMode && meta.execution.mode !== expectedMode) {
        errors.push(`execution.mode "${meta.execution.mode}" does not match providerType "${meta.providerType}". Expected "${expectedMode}"`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Initialize the provider — set up HTTP client, load secrets from registry.
   * MUST be called before any other method.
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error(`Provider "${this.constructor.metadata.id}" must implement initialize()`);
  }

  /**
   * Check if the provider is operational.
   *
   * @returns {Promise<{ok: boolean, latency: number, error?: string}>}
   */
  async healthCheck() {
    throw new Error(`Provider "${this.constructor.metadata.id}" must implement healthCheck()`);
  }

  /**
   * Search for content by query string.
   *
   * @param {string} query - Search term
   * @returns {Promise<Array<{id: string, title: string, year?: number, type: string, poster?: string}>>}
   */
  async search(query) {
    throw new Error(`Provider "${this.constructor.metadata.id}" must implement search()`);
  }

  /**
   * Get full metadata for a content item by its provider ID.
   *
   * @param {string} contentId - Provider's internal content ID
   * @returns {Promise<Object>} Content metadata
   */
  async getDetails(contentId) {
    throw new Error(`Provider "${this.constructor.metadata.id}" must implement getDetails()`);
  }

  /**
   * Get episode list for a series.
   * Optional — skip for movie-only providers.
   *
   * @param {string} contentId - Provider's series ID
   * @returns {Promise<Array<{seasonNumber: number, episodeNumber: number, name: string}>>}
   */
  async getEpisodes(contentId) {
    logger.debug({ provider: this.constructor.metadata.id, contentId }, 'getEpisodes not implemented (movie-only provider)');
    return [];
  }

  /**
   * Get playable streaming URLs for a content item.
   * This is the primary method — called when user presses PLAY.
   *
   * @param {string} contentId - Provider's internal content ID
   * @param {Object} [options]
   * @param {number} [options.season] - Season number (series only)
   * @param {number} [options.episode] - Episode number (series only)
   * @param {string} [options.quality] - Requested quality ('480p', '720p', '1080p')
   * @returns {Promise<Array<{url: string, quality: string, type: string, headers?: Object}>>}
   */
  async getStreams(contentId, options = {}) {
    throw new Error(`Provider "${this.constructor.metadata.id}" must implement getStreams()`);
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

module.exports = BaseProvider;
