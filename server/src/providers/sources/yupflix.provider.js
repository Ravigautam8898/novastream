// server/src/providers/sources/yupflix.provider.js
// YupFlix Provider — External streaming source (migrated from ContentSourceService)
//
// C3 migration: Moves YupFlix API logic from ContentSourceService (legacy) into the
// Provider Framework. The provider is registered at startup and discovered via
// ProviderManager. Legacy sourceSite="primary" is mapped via legacyIds: ["primary"]
// so existing content with sourceId/sourceSite continues to work without migration.
//
// Cache compatibility:
//   - Same _streamCache collection and key format (primary:type:id:quality)
//   - Existing cached URLs remain valid during and after migration
//   - ContentSourceService delegates to ProviderManager.resolve() via compatibility layer

const config = require('../../config/env');
const logger = require('../../config/logger');
const BaseProvider = require('../BaseProvider');
const ApiError = require('../../utils/ApiError');

class YupFlixProvider extends BaseProvider {
  /** @type {Object} */
  static metadata = {
    id: 'yupflix',
    legacyIds: ['primary'],          // Maps legacy sourceSite="primary" to this provider
    name: 'YupFlix',
    version: '1.0.0',
    author: 'NovaStream',
    providerType: 'API',
    priority: 10,                    // High priority — primary streaming source
    enabled: true,
    execution: {
      mode: 'DIRECT',
      maxConcurrent: null,
      timeout: config.externalSource?.timeout || 15000,
    },
    streamPolicy: {
      type: 'SIGNED_URL',            // URLs contain signed expiry tokens
      ttl: '24h',
      refreshBefore: '10m',          // Refresh 10 min before expiry
    },
  };

  constructor() {
    super();
    this.baseUrl = null;
    this.headers = {};
    this.timeout = 15000;
  }

  /**
   * Initialize provider — load config from environment.
   */
  async initialize() {
    this.baseUrl = config.externalSource?.baseUrl;
    this.headers = {
      'User-Agent': config.externalSource?.userAgent || 'NovaStream/1.0',
      'Referer': config.externalSource?.referer || 'https://novastream.app/',
    };
    this.timeout = config.externalSource?.timeout || 15000;

    if (!this.baseUrl) {
      logger.warn('YupFlix provider: baseUrl not configured. Provider will fail health checks until configured.');
    }

    logger.info({
      baseUrl: this.baseUrl ? this.baseUrl.replace(/\/+$/, '') + '/...' : 'NOT SET',
      timeout: this.timeout,
    }, 'YupFlix provider initialized');
  }

  /**
   * Check if YupFlix is reachable.
   * @returns {Promise<{ok: boolean, latency: number, error?: string}>}
   */
  async healthCheck() {
    if (!this.baseUrl) {
      return { ok: false, latency: -1, error: 'YupFlix baseUrl not configured' };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(this.baseUrl.replace(/\/+$/, '') + '/api/health', {
          method: 'HEAD',
          headers: this.headers,
          signal: controller.signal,
        });

        return {
          ok: response.ok || response.status < 500,
          latency: Date.now() - start,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      return { ok: false, latency: Date.now() - start, error: err.message };
    }
  }

  // ── Stream Resolution (Primary Method) ──

  /**
   * Get playable streaming URLs for YupFlix content.
   *
   * @param {string} contentId - YupFlix's internal content ID (stored in sourceId or providers[].providerContentId)
   * @param {Object} [options]
   * @param {number} [options.season] - Season number (series only)
   * @param {number} [options.episode] - Episode number (series only)
   * @param {string} [options.quality] - Requested quality ('480p', '720p', '1080p')
   * @returns {Promise<Array<{url: string, quality: string, type: string}>>}
   */
  async getStreams(contentId, options = {}) {
    if (!contentId) {
      throw ApiError.badRequest('YupFlix provider: contentId is required');
    }

    const { season, episode, quality } = options;
    const isSeries = season !== undefined || episode !== undefined;

    if (isSeries) {
      return this._getSeriesStreams(contentId, { season, episode, quality });
    }
    return this._getMovieStreams(contentId, quality);
  }

  /**
   * Get movie streaming URLs.
   */
  async _getMovieStreams(contentId, preferredQuality) {
    const data = await this._fetch(`/api/movies/public/${contentId}`);
    if (!data) {
      throw ApiError.notFound('Content not available on YupFlix');
    }

    const links = this._parseMovieLinks(data);
    if (links.length === 0) {
      throw ApiError.notFound('No streaming links available for this content on YupFlix');
    }

    return links;
  }

  /**
   * Get series episode streaming URLs.
   */
  async _getSeriesStreams(contentId, { season, episode, quality }) {
    const data = await this._fetch(`/api/series/public/${contentId}`);
    if (!data) {
      throw ApiError.notFound('Content not available on YupFlix');
    }

    const episodes = this._parseSeriesLinks(data);
    const sNum = season || 1;
    const eNum = episode || 1;

    const matchedEpisode = episodes.find(ep =>
      ep.seasonNumber === sNum && ep.episodeNumber === eNum
    );

    if (!matchedEpisode || !matchedEpisode.streamingLinks || matchedEpisode.streamingLinks.length === 0) {
      throw ApiError.notFound(`Episode S${sNum}E${eNum} not found on YupFlix`);
    }

    return matchedEpisode.streamingLinks;
  }

  // ── Stream Info (Availability Check) ──

  /**
   * Check available streams without fetching a full URL.
   *
   * @param {string} contentId - YupFlix content ID
   * @param {Object} [options]
   * @returns {Promise<{hasStreams: boolean, qualities: Array<{quality: string}>}>}
   */
  async getStreamInfo(contentId, options = {}) {
    const { season, episode } = options;
    const isSeries = season !== undefined || episode !== undefined;

    try {
      if (isSeries) {
        return await this._getSeriesStreamInfo(contentId, { season, episode });
      }
      return await this._getMovieStreamInfo(contentId);
    } catch (err) {
      logger.warn({ err, contentId }, 'YupFlix provider: getStreamInfo failed');
      return { hasStreams: false, qualities: [] };
    }
  }

  async _getMovieStreamInfo(contentId) {
    const data = await this._fetch(`/api/movies/public/${contentId}`);
    if (!data) return { hasStreams: false, qualities: [] };

    const links = this._parseMovieLinks(data);
    return {
      hasStreams: links.length > 0,
      qualities: links.map(l => ({ quality: l.quality })),
    };
  }

  async _getSeriesStreamInfo(contentId, { season, episode }) {
    const data = await this._fetch(`/api/series/public/${contentId}`);
    if (!data) return { hasStreams: false, qualities: [] };

    const episodes = this._parseSeriesLinks(data);
    const sNum = season || 1;
    const eNum = episode || 1;
    const matched = episodes.find(ep => ep.seasonNumber === sNum && ep.episodeNumber === eNum);

    if (!matched || !matched.streamingLinks || matched.streamingLinks.length === 0) {
      return { hasStreams: false, qualities: [] };
    }

    return {
      hasStreams: true,
      qualities: matched.streamingLinks.map(l => ({ quality: l.quality })),
    };
  }

  // ── HTTP Helper with Retry (moved from ContentSourceService.fetchFromSource) ──

  /**
   * Fetch from YupFlix API with retry and timeout.
   * @param {string} path - API path (e.g., '/api/movies/public/123')
   * @returns {Promise<Object|null>} Parsed JSON response or null on 404
   */
  async _fetch(path) {
    const url = `${this.baseUrl.replace(/\/+$/, '')}${path}`;

    return await this._withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          headers: this.headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 429) {
            logger.warn({ url }, 'YupFlix provider: rate limited');
            throw ApiError.tooMany('YupFlix rate limit exceeded. Retry later.');
          }
          if (response.status === 404) {
            return null;
          }
          if (this._isTransientStatus(response.status)) {
            const err = ApiError.internal(`YupFlix returned ${response.status}`);
            err.statusCode = response.status;
            throw err;
          }
          throw ApiError.internal(`YupFlix returned ${response.status}`);
        }

        return await response.json();
      } catch (err) {
        if (err instanceof ApiError) throw err;
        if (err.name === 'AbortError') {
          logger.warn({ url }, 'YupFlix provider: request timed out');
          throw ApiError.internal('YupFlix request timed out');
        }
        logger.warn({ err, url }, 'YupFlix provider: request failed');
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  /**
   * Retry wrapper with exponential backoff.
   * @param {Function} fn - Async fetch function
   * @param {number} [maxRetries=2]
   * @param {number} [baseDelay=200]
   */
  async _withRetry(fn, maxRetries = 2, baseDelay = 200) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        const isRetryable =
          err.name === 'AbortError' ||
          err.name === 'FetchError' ||
          err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'ECONNREFUSED' ||
          (err instanceof ApiError && err.statusCode && this._isTransientStatus(err.statusCode));

        if (!isRetryable || attempt >= maxRetries) {
          throw err;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn({ attempt: attempt + 1, maxRetries, delay }, 'YupFlix provider: retrying request');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check if HTTP status is a transient server error.
   */
  _isTransientStatus(status) {
    return status === 502 || status === 503 || status >= 520;
  }

  // ── Response Parsers (moved from SOURCES.primary.parsers) ──

  /**
   * Parse movie API response → streaming links array.
   */
  _parseMovieLinks(data) {
    if (!data || !data.streamingLinks) return [];
    return data.streamingLinks
      .map(link => this._validateLink(link))
      .filter(Boolean);
  }

  /**
   * Parse series API response → episodes with streaming links.
   */
  _parseSeriesLinks(data) {
    if (!data || !data.seasons) return [];
    const episodes = [];
    for (const season of data.seasons) {
      if (!season.episodes) continue;
      for (const ep of season.episodes) {
        const links = (ep.streamingLinks || [])
          .map(l => this._validateLink(l))
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
  }

  /**
   * Validate and sanitize a streaming link from YupFlix.
   */
  _validateLink(link) {
    if (!link || !link.url) return null;
    if (!this._isValidUrl(link.url)) {
      logger.warn({ url: link.url }, 'YupFlix provider: invalid stream URL rejected');
      return null;
    }
    return {
      url: link.url,
      quality: link.quality || '720p',
      type: link.type || 'hls',
    };
  }

  /**
   * Validate stream URL is safe.
   */
  _isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }
}

module.exports = YupFlixProvider;
