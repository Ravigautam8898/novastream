// server/src/providers/sources/example.provider.js
// Example Provider Template — reference for implementing new streaming providers
//
// Copy this file, rename to myprovider.provider.js, and implement the methods.
// ProviderManager auto-discovers all *.provider.js files at server startup.
//
// See README.md in this directory for the full integration guide.

const BaseProvider = require('../BaseProvider');

class ExampleProvider extends BaseProvider {
  // ── Metadata ──
  // Update these values for your provider.
  // Metadata is read at registration time — no database needed.
  static metadata = {
    id: 'example',           // Unique provider identifier
    legacyIds: [],           // Optional: legacy sourceSite aliases (e.g., ['primary'])
    name: 'Example Provider',
    version: '1.0.0',
    author: 'Your Name',
    providerType: 'API',     // 'API' | 'LIGHT_SCRAPER' | 'BROWSER_SCRAPER'
    priority: 50,            // Lower = tried first (API providers: 10-50, Scrapers: 60-100)
    enabled: true,
    execution: {
      // Mode must match providerType:
      //   API            → 'DIRECT'
      //   LIGHT_SCRAPER  → 'QUEUE'
      //   BROWSER_SCRAPER → 'WORKER'
      mode: 'DIRECT',
      maxConcurrent: null,   // Optional: per-provider concurrency limit
      timeout: 10000,        // Request timeout in milliseconds
    },
    streamPolicy: {
      // 'STATIC_URL'  — URL does not expire (e.g., direct CDN link)
      // 'SIGNED_URL'  — URL has signed expiry token (e.g., CloudFront signed URL)
      // 'DYNAMIC'     — URL is generated per-request and expires quickly
      type: 'STATIC_URL',
      ttl: '24h',            // How long the URL is valid
      refreshBefore: '10m',  // When to refresh before expiry
    },
  };

  // ── Lifecycle Methods ──

  /**
   * Initialize provider — load API keys, set up HTTP client.
   * Called once at server startup during ProviderManager discovery.
   */
  async initialize() {
    // Load config from environment variables or ProviderRegistry
    // this.apiKey = config.providers?.example?.apiKey;
    // this.baseUrl = config.providers?.example?.baseUrl;
    // this.headers = { 'Authorization': `Bearer ${this.apiKey}` };
  }

  /**
   * Check if the provider is operational.
   * @returns {Promise<{ok: boolean, latency: number, error?: string}>}
   */
  async healthCheck() {
    // Try a lightweight endpoint (HEAD request, health check, or ping)
    // Return { ok: true, latency: 123 } on success
    // Return { ok: false, latency: -1, error: 'message' } on failure
    return { ok: true, latency: 0 };
  }

  /**
   * Clean up resources when provider is unregistered.
   * Optional — only needed if provider has timers, connections, or listeners.
   */
  async dispose() {
    // Close HTTP connections, clear timers, etc.
  }

  // ── Content Methods ──

  /**
   * Search for content by query string.
   * @param {string} query - Search term
   * @returns {Promise<Array<{id: string, title: string, year?: number, type: string, poster?: string}>>}
   */
  async search(query) {
    // GET /api/search?q=${query}
    // Return array of results
    return [];
  }

  /**
   * Get full metadata for a content item.
   * @param {string} contentId - Provider's internal content ID
   * @returns {Promise<Object>} Content metadata (title, overview, poster, etc.)
   */
  async getDetails(contentId) {
    // GET /api/content/${contentId}
    // Return content detail object
    return {};
  }

  /**
   * Get episode list for a series.
   * Optional — return empty array for movie-only providers.
   * @param {string} contentId - Provider's series ID
   * @returns {Promise<Array<{seasonNumber: number, episodeNumber: number, name: string}>>}
   */
  async getEpisodes(contentId) {
    // GET /api/series/${contentId}/episodes
    // Return array of episodes
    return [];
  }

  /**
   * Get playable streaming URLs — PRIMARY METHOD.
   * Called when user presses PLAY.
   *
   * @param {string} contentId - Provider's internal content ID
   * @param {Object} [options]
   * @param {number} [options.season] - Season number (series only)
   * @param {number} [options.episode] - Episode number (series only)
   * @param {string} [options.quality] - Requested quality ('480p', '720p', '1080p')
   * @returns {Promise<Array<{url: string, quality: string, type: string, headers?: Object}>>}
   */
  async getStreams(contentId, options = {}) {
    // For movies:
    //   GET /api/movies/${contentId}/streams
    //   Return available quality variants as array of { url, quality, type }

    // For series:
    //   GET /api/series/${contentId}/episodes/${season}/${episode}/streams
    //   Return available quality variants for that episode

    // Each entry in the returned array represents one quality variant:
    // [
    //   { url: 'https://cdn.example.com/stream_1080p.m3u8', quality: '1080p', type: 'hls' },
    //   { url: 'https://cdn.example.com/stream_720p.m3u8',  quality: '720p',  type: 'hls' },
    //   { url: 'https://cdn.example.com/stream_480p.m3u8',  quality: '480p',  type: 'hls' },
    // ]

    throw new Error(`Provider "${this.constructor.metadata.id}" must implement getStreams()`);
  }
}

module.exports = ExampleProvider;
