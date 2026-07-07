// server/src/metadata/sources/tmdb.metadata.js
// TMDB Metadata Provider — Adapter for The Movie Database (Track C5)
//
// Wraps the existing TMDbService behind the BaseMetadataProvider interface.
// This enables MetadataManager to dispatch to TMDB alongside future metadata
// providers (Trakt, IMDb, AniList, etc.) through a uniform interface.
//
// This provider:
//   - IS a metadata provider (discovers content, returns metadata)
//   - is NOT a stream provider (never returns stream URLs)
//   - Delegates to the existing TMDbService for actual API calls
//   - Normalizes TMDB output to standard Content model format

const BaseMetadataProvider = require('../BaseMetadataProvider');
const TMDbService = require('../../services/tmdb.service');
const logger = require('../../config/logger');

class TMDBMetadataProvider extends BaseMetadataProvider {
  static metadata = {
    id: 'tmdb',
    name: 'The Movie Database',
    version: '4.0.0',
    providerType: 'API',
    priority: 10,           // Primary metadata provider — tried first
    enabled: true,
    capabilities: {
      trending: true,
      search: true,
      details: true,
      discover: true,
      episodes: true,
    },
  };

  async initialize() {
    // TMDbService is already initialized via module imports
    // Verify connectivity with a lightweight check
    try {
      const trending = await TMDbService.getTrending(1);
      if (!Array.isArray(trending)) {
        throw new Error('TMDB trending did not return expected array');
      }
      logger.info({ itemCount: trending.length }, 'TMDBMetadataProvider: initialized successfully');
    } catch (err) {
      logger.warn({ err: TMDbService.sanitizeError(err) }, 'TMDBMetadataProvider: initialization warning — API may be unreachable');
      // Don't throw — allow registration to proceed; healthCheck will catch issues
    }
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const trending = await TMDbService.getTrending(1);
      return {
        ok: Array.isArray(trending),
        latency: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        latency: Date.now() - start,
        error: err.message,
      };
    }
  }

  async getTrending(options = {}) {
    const { page = 1 } = options;
    const items = await TMDbService.getTrending(page);
    return (items || []).map(item => this.normalizeItem(item));
  }

  async search(query, options = {}) {
    const { page = 1 } = options;
    return TMDbService.search(query, page);
  }

  async getDetails(id, contentType) {
    if (contentType === 'movie') {
      return TMDbService.syncMovie(parseInt(id));
    }
    return TMDbService.syncSeries(parseInt(id));
  }

  async getSeasonEpisodes(seriesId, seasonNumber) {
    return TMDbService.syncSeason(parseInt(seriesId), seasonNumber);
  }

  /**
   * Normalize a TMDB item into the standard format.
   * Adds provider source metadata.
   */
  normalizeItem(raw, contentType) {
    const providerId = this.constructor.metadata.id;

    // Trending items from TMDB already have standard fields
    if (raw.tmdbId) {
      return {
        ...raw,
        _source: providerId,
        _sourceId: raw.tmdbId,
      };
    }

    // Search result items may need restructuring
    return {
      ...raw,
      _source: providerId,
    };
  }
}

module.exports = TMDBMetadataProvider;
