// server/src/services/content.service.js
// Content Service — TMDB-powered content fetching, pagination, and DB sync
// Operates in two modes:
//   1. DB-first: Queries MongoDB when content has been seeded
//   2. TMDB-fallback: Fetches live from TMDB when DB is empty

const mongoose = require('mongoose');
const Content = require('../models/Content.model');
const Season = require('../models/Season.model');
const Episode = require('../models/Episode.model');
const MetadataManager = require('../metadata/MetadataManager');
const ContentRegistry = require('../providers/ContentRegistry');
const TMDbService = require('./tmdb.service');
const ContentSourceService = require('./content-source.service');

// C5: MetadataManager replaces direct TMDbService calls in homepage, trending,
//     search, and detail fetches. TMDbService is still imported for backward
//     compatibility with seed scripts and the TMDB metadata adapter.
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const MemoryCache = require('../utils/cache');

// PF-006: Maximum page number for skip-based pagination to prevent
// expensive large-offset queries. Pages beyond this return the last page.
const MAX_PAGINATION_PAGE = 100;

class ContentService {
  /** In-memory caches for frequently-hit endpoints (PF-002: max sizes prevent unbounded growth) */
  static #detailCache = new MemoryCache(5 * 60 * 1000, 200);    // 5 min, max 200 entries for detail pages
  static #listCache = new MemoryCache(2 * 60 * 1000, 100);      // 2 min, max 100 entries for list queries
  static #categoryCache = new MemoryCache(5 * 60 * 1000, 50);    // 5 min, max 50 entries for category queries

  // PF-006: Lightweight cross-process cache invalidation.
  // Stores the timestamp of the last content mutation (create/update/delete).
  // Each process reads this from DB to detect stale caches in cluster mode.
  // Without a shared Redis store, this provides weak consistency without
  // requiring external infrastructure.
  static #contentVersion = null;
  static #contentVersionTime = 0;
  static #VERSION_CHECK_TTL = 30 * 1000; // Re-check every 30s

  /**
   * Get the current content version from a lightweight DB query.
   * Used by PF-006 to detect cross-process cache staleness.
   */
  static async #getContentVersion() {
    if (this.#contentVersion && Date.now() - this.#contentVersionTime < this.#VERSION_CHECK_TTL) {
      return this.#contentVersion;
    }
    try {
      // Use a lightweight query: find the most recently updated content item
      const latest = await Content.findOne({ isActive: true })
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .maxTimeMS(2000);
      this.#contentVersion = latest?.updatedAt?.getTime() || 0;
      this.#contentVersionTime = Date.now();
    } catch {
      // If query fails, allow cache to be fresh (no invalidation)
      this.#contentVersion = Date.now();
      this.#contentVersionTime = Date.now();
    }
    return this.#contentVersion;
  }

  /**
   * Check if the in-memory cache is still fresh compared to the DB version.
   * Returns true if the cache can be used. This provides a lightweight
   * cross-process cache invalidation signal without needing Redis (PF-006).
   */
  static async #isCacheFresh(cacheTimestamp) {
    if (!cacheTimestamp) return false;
    const dbVersion = await this.#getContentVersion();
    return cacheTimestamp >= dbVersion;
  }

  // ── Homepage Sections Cache ──

  /** In-memory cache for homepage sections (5-minute TTL) */
  static #homepageCache = null;
  static #homepageCacheTime = 0;
  static #HOMEPAGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all homepage sections (featured, trending, categories)
   * Each section contains a title, type, and array of content items
   * Results are cached in-memory for 5 minutes to avoid repeated slow queries.
   *
   * D-012: Failure resilience — if a rebuild fails or returns zero sections
   * and we have existing cached data, the old cache is preserved so the
   * homepage never goes blank due to a transient TMDB outage.
   */
  static async getHomepageSections() {
    // Return cached result if still fresh (PF-006: also check DB version)
    if (this.#homepageCache && Date.now() - this.#homepageCacheTime < this.#HOMEPAGE_CACHE_TTL) {
      const fresh = await this.#isCacheFresh(this.#homepageCacheTime);
      if (fresh) {
        logger.debug('Returning cached homepage sections');
        return this.#homepageCache;
      }
      logger.debug('Homepage cache stale (content updated in another process)');
    }

    logger.debug('Building homepage sections');

    let sections = [];

    try {
      // Try DB first — if we have featured content, use it
      const dbFeatured = await Content.find({ isFeatured: true, isActive: true })
        .sort({ popularity: -1 })
        .limit(10)
        .lean();

      // Track whether we've already added trending (to avoid duplicates)
      let trendingAdded = false;

      // Section 1: Featured / Hero Carousel
      if (dbFeatured.length >= 5) {
        sections.push({
          id: 'featured',
          title: 'Featured',
          type: 'featured',
          items: dbFeatured,
          layout: 'hero',
        });
      } else {
        // MetadataManager fallback — get trending from best metadata provider
        try {
          const trendingItems = await MetadataManager.getTrending({ page: 1 });
          sections.push({
            id: 'trending',
            title: 'Trending Now',
            type: 'trending',
            items: trendingItems.slice(0, 10),
            layout: 'hero',
          });
          trendingAdded = true;
        } catch (err) {
          logger.warn({ err }, 'Failed to fetch trending for hero section');
        }
      }

      // Section 2: Trending Now (skip if already added as hero)
      if (!trendingAdded) {
        try {
          const trending = await MetadataManager.getTrending({ page: 1 });
          sections.push({
            id: 'trending',
            title: 'Trending Now',
            type: 'trending',
            items: trending.slice(0, 20),
            layout: 'row',
          });
        } catch (err) {
          logger.warn({ err }, 'Failed to fetch trending from metadata providers');
        }
      }

      // Section 3: Categories (DB-first with TMDB fallback)
      // Run all 4 category fetches in PARALLEL — they're completely independent.
      const categories = ['Hollywood', 'Bollywood', 'Korean', 'South Indian'];
      const categoryResults = await Promise.allSettled(
        categories.map(category =>
          this.getByCategory(category, 1, 20).then(items => ({ category, items }))
        )
      );

      for (const result of categoryResults) {
        if (result.status === 'rejected') {
          logger.warn({ category: result.reason?.category, err: result.reason }, 'Failed to fetch category');
          continue;
        }
        const { category, items: categoryItems } = result.value;
        if (categoryItems.items.length > 0) {
          sections.push({
            id: `category-${category.toLowerCase().replace(/\s+/g, '-')}`,
            title: category,
            type: 'category',
            category,
            items: categoryItems.items,
            layout: 'row',
          });
        }
      }

      // D-012: Validate rebuild result — never replace a good cache with a bad one
      if (sections.length === 0 && this.#homepageCache !== null) {
        // Rebuild produced zero sections but we have cached data — preserve old cache
        logger.warn('Homepage rebuild produced zero sections — preserving existing cache');
        return this.#homepageCache;
      }

      // D-012: If cache exists, the new result has sections, but the original
      // cache had hero + trending + categories, warn but still update if reasonable
      if (sections.length < 2 && this.#homepageCache !== null && this.#homepageCache.length >= 3) {
        logger.warn({
          existingSections: this.#homepageCache.length,
          newSections: sections.length,
        }, 'Homepage rebuild produced fewer sections than cached — preserving existing cache');
        return this.#homepageCache;
      }
    } catch (err) {
      // D-012: Catastrophic rebuild failure — preserve existing cache
      logger.error({ err }, 'Homepage rebuild failed catastrophically — preserving existing cache');
      if (this.#homepageCache !== null) {
        return this.#homepageCache;
      }
      // No cache to fall back to — re-throw so caller knows it failed
      throw err;
    }

    // Cache the result
    this.#homepageCache = sections;
    this.#homepageCacheTime = Date.now();

    return sections;
  }

  // ── Movies ──

  /**
   * Browse movies with pagination and filters
   */
  static async getMovies({ page = 1, limit = 20, genre, sort = 'popularity' } = {}) {
    logger.debug({ page, limit, genre, sort }, 'Fetching movies');
    page = Math.min(page, MAX_PAGINATION_PAGE); // PF-005: cap page number

    // Check cache
    const cacheKey = `movies:${page}:${limit}:${genre || ''}:${sort}`;
    const cached = this.#listCache.get(cacheKey);
    if (cached) {
      logger.debug('Returning cached movies list');
      return cached;
    }

    // Try DB first
    const query = { contentType: 'movie', isActive: true };
    if (genre) query.genres = { $elemMatch: { name: { $regex: genre, $options: 'i' } } };

    const sortOption = {};
    if (sort === 'popularity') sortOption.popularity = -1;
    else if (sort === 'rating') sortOption.voteAverage = -1;
    else if (sort === 'latest') sortOption.releaseDate = -1;
    else if (sort === 'title') sortOption.title = 1;
    else sortOption.popularity = -1;

    // PF-005: Use estimatedDocumentCount for total when no filters are applied
    // (faster on large collections), fall back to countDocuments with filters.
    const [items, total] = await Promise.all([
      Content.find(query)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      genre
        ? Content.countDocuments(query)
        : Content.estimatedDocumentCount(),
    ]);

    let result;

    // If DB is empty, fall back to TMDB
    if (total === 0) {
      logger.info('DB empty for movies — fetching from metadata providers');
      const trendingItems = await MetadataManager.getTrending({ page: 1 });
      result = {
        items: trendingItems.filter(m => m.contentType === 'movie').slice(0, limit),
        pagination: { page, limit, total: 0, totalPages: 1 },
        source: 'tmdb',
      };
    } else {
      result = {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        source: 'database',
      };
    }

    // Cache the result
    this.#listCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get movie details by slug
   */
  static async getMovieBySlug(slug) {
    logger.debug({ slug }, 'Fetching movie by slug');

    // Check cache
    const cacheKey = `movie:${slug}`;
    const cached = this.#detailCache.get(cacheKey);
    if (cached) {
      logger.debug({ slug }, 'Returning cached movie detail');
      return cached;
    }

    const movie = await Content.findOne({ slug, contentType: 'movie', isActive: true })
      .lean();

    if (!movie) {
      throw ApiError.notFound(`Movie '${slug}' not found`);
    }

    this.#detailCache.set(cacheKey, movie);
    return movie;
  }

  // ── Series ──

  /**
   * Browse series with pagination and filters
   */
  static async getSeries({ page = 1, limit = 20, genre, sort = 'popularity' } = {}) {
    logger.debug({ page, limit, genre, sort }, 'Fetching series');
    page = Math.min(page, MAX_PAGINATION_PAGE); // PF-005: cap page number

    // Check cache
    const cacheKey = `series:${page}:${limit}:${genre || ''}:${sort}`;
    const cached = this.#listCache.get(cacheKey);
    if (cached) {
      logger.debug('Returning cached series list');
      return cached;
    }

    const query = { contentType: 'series', isActive: true };
    if (genre) query.genres = { $elemMatch: { name: { $regex: genre, $options: 'i' } } };

    const sortOption = {};
    if (sort === 'popularity') sortOption.popularity = -1;
    else if (sort === 'rating') sortOption.voteAverage = -1;
    else if (sort === 'latest') sortOption.firstAirDate = -1;
    else if (sort === 'title') sortOption.title = 1;
    else sortOption.popularity = -1;

    // PF-005: estimatedDocumentCount when no filters
    const [items, total] = await Promise.all([
      Content.find(query)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      genre
        ? Content.countDocuments(query)
        : Content.estimatedDocumentCount(),
    ]);

    let result;

    if (total === 0) {
      logger.info('DB empty for series — fetching from metadata providers');
      const trendingItems = await MetadataManager.getTrending({ page: 1 });
      result = {
        items: trendingItems.filter(m => m.contentType === 'series').slice(0, limit),
        pagination: { page, limit, total: 0, totalPages: 1 },
        source: 'tmdb',
      };
    } else {
      result = {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        source: 'database',
      };
    }

    this.#listCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get series details by slug — includes seasons and episodes
   */
  static async getSeriesBySlug(slug) {
    logger.debug({ slug }, 'Fetching series by slug');

    // Check cache
    const cacheKey = `series:${slug}`;
    const cached = this.#detailCache.get(cacheKey);
    if (cached) {
      logger.debug({ slug }, 'Returning cached series detail');
      return cached;
    }

    // Single aggregate pipeline: Content + nested Season + nested Episode
    const results = await Content.aggregate([
      { $match: { slug, contentType: 'series', isActive: true } },
      {
        $lookup: {
          from: 'seasons',
          localField: '_id',
          foreignField: 'contentId',
          as: 'seasons',
          pipeline: [
            { $match: { isActive: true } },
            { $sort: { seasonNumber: 1 } },
            {
              $lookup: {
                from: 'episodes',
                localField: '_id',
                foreignField: 'seasonId',
                as: 'episodes',
                pipeline: [
                  { $match: { isActive: true } },
                  { $sort: { episodeNumber: 1 } },
                ],
              },
            },
          ],
        },
      },
    ]);

    if (results.length === 0) {
      throw ApiError.notFound(`Series '${slug}' not found`);
    }

    const series = results[0];
    let seasonsWithEpisodes;
    let numberOfSeasons;
    let numberOfEpisodes;

    // C-012: TMDB/Content identity is authoritative for metadata (Track C design).
    // DB seasons from TMDB-synced content are the primary source for episode metadata.
    // Provider (sourceId) is queried only as a fallback when DB has no seasons,
    // to help seed the metadata — never as the authoritative source.
    //
    // Priority: DB-synced seasons > external source data (temporary fill) > empty
    if (series.seasons && series.seasons.length > 0) {
      // DB seasons from TMDB sync — authoritative metadata (C-012 rule 1)
      seasonsWithEpisodes = series.seasons.map(season => ({
        ...season,
        episodes: (season.episodes || []).map(ep => ({
          ...ep,
          seasonNumber: season.seasonNumber,
        })),
      }));
      numberOfSeasons = seasonsWithEpisodes.length;
      numberOfEpisodes = seasonsWithEpisodes.reduce((sum, s) => sum + s.episodes.length, 0);
    } else if (series.sourceId) {
      // No DB seasons — fetch from external source as fill, not authority (C-012 rule 3)
      logger.debug({ slug, sourceId: series.sourceId }, 'No DB seasons — fetching from external source as temporary fill');
      const externalSeasons = await ContentSourceService.fetchSeriesSeasonData(series);

      if (externalSeasons.length > 0) {
        seasonsWithEpisodes = externalSeasons;
        numberOfSeasons = externalSeasons.length;
        numberOfEpisodes = externalSeasons.reduce((sum, s) => sum + s.episodes.length, 0);
      } else {
        seasonsWithEpisodes = [];
        numberOfSeasons = 0;
        numberOfEpisodes = 0;
      }
    } else {
      seasonsWithEpisodes = [];
      numberOfSeasons = 0;
      numberOfEpisodes = 0;
    }

    const result = {
      ...series,
      numberOfSeasons,
      numberOfEpisodes,
      seasons: seasonsWithEpisodes,
    };

    this.#detailCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get seasons for a series
   */
  static async getSeriesSeasons(slug) {
    logger.debug({ slug }, 'Fetching seasons for series');

    const series = await Content.findOne({ slug, contentType: 'series', isActive: true })
      .select('_id title slug')
      .lean();

    if (!series) {
      throw ApiError.notFound(`Series '${slug}' not found`);
    }

    const seasons = await Season.find({ contentId: series._id, isActive: true })
      .sort({ seasonNumber: 1 })
      .lean();

    return { series, seasons };
  }

  // ── Episodes ──

  /**
   * Get episode details by ID
   */
  static async getEpisodeById(episodeId) {
    logger.debug({ episodeId }, 'Fetching episode by ID');

    const results = await Episode.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(episodeId) } },
      {
        $lookup: {
          from: 'seasons',
          localField: 'seasonId',
          foreignField: '_id',
          as: 'seasonId',
          pipeline: [
            { $project: { seasonNumber: 1, name: 1 } },
          ],
        },
      },
      {
        $lookup: {
          from: 'contents',
          localField: 'contentId',
          foreignField: '_id',
          as: 'contentId',
          pipeline: [
            { $project: { title: 1, slug: 1, contentType: 1 } },
          ],
        },
      },
      {
        $addFields: {
          seasonId: { $arrayElemAt: ['$seasonId', 0] },
          contentId: { $arrayElemAt: ['$contentId', 0] },
        },
      },
    ]);

    if (results.length === 0) {
      throw ApiError.notFound('Episode not found');
    }

    return results[0];
  }

  // ── Trending ──

  /**
   * Get trending content (all types)
   */
  static async getTrending(page = 1, limit = 20) {
    logger.debug({ page }, 'Fetching trending content');

    try {
      const trending = await MetadataManager.getTrending({ page });
      return {
        items: trending.slice(0, limit),
        pagination: { page, limit, total: 0, totalPages: 1 },
        source: 'tmdb',
      };
    } catch (err) {
      // Metadata provider fallback: return most popular from DB
      logger.warn({ err }, 'Metadata providers trending failed, using DB fallback');
      const items = await Content.find({ isActive: true })
        .sort({ popularity: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      // PF-005: estimatedDocumentCount does not accept filters — use countDocuments for filtered queries
      const total = await Content.countDocuments({ isActive: true });

      return {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        source: 'database',
      };
    }
  }

  // ── Categories ──

  /**
   * Get content by category (e.g., Hollywood, Bollywood, Korean)
   * PF-004: Uses exact match on categories array instead of $regex,
   * allowing MongoDB to use an index on the categories field.
   * Category values are normalized during seed for exact matching.
   */
  static async getByCategory(category, page = 1, limit = 20) {
    logger.debug({ category, page }, 'Fetching content by category');
    page = Math.min(page, MAX_PAGINATION_PAGE); // PF-005: cap page number

    // Check cache
    const cacheKey = `category:${category.toLowerCase()}:${page}:${limit}`;
    const cached = this.#categoryCache.get(cacheKey);
    if (cached) {
      logger.debug({ category }, 'Returning cached category results');
      return cached;
    }

    // PF-004: Exact match instead of $regex — enables index usage.
    // Category values are normalized in seed scripts (title-case, no extra whitespace).
    const query = {
      categories: category,
      isActive: true,
    };

    const [items, total] = await Promise.all([
      Content.find(query)
        .sort({ popularity: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Content.countDocuments(query),
    ]);

    const result = {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    this.#categoryCache.set(cacheKey, result);
    return result;
  }

  // ── TMDB Detail Lookup (Navigation Bridge — C5b) ──

  /**
   * Get content details by TMDB ID.
   * First checks MongoDB (by tmdbId field), then fetches live from MetadataManager
   * and registers the content in ContentRegistry to create a permanent Nova slug.
   *
   * C5b: Every detail page fetch creates a Nova Content document if one doesn't
   * exist. This removes the dependency on synthetic `_id: tmdb-{id}` — every
   * returned item has a real Mongo _id and Nova slug.
   *
   * Does NOT require: sourceId, sourceSite, or stream availability.
   * Metadata-only — playback resolving happens separately at PLAY click.
   *
   * @param {number} tmdbId - TMDB content ID
   * @param {string} contentType - 'movie' or 'series'
   * @returns {Promise<Object>} Content document (real MongoDB document, not synthetic)
   */
  static async getByTmdbId(tmdbId, contentType) {
    // 1. Try MongoDB first (content may have been seeded or registered by C5b)
    const existing = await Content.findOne({ tmdbId, contentType, isActive: true }).lean();
    if (existing) {
      logger.debug({ tmdbId, contentType, slug: existing.slug }, 'TMDB detail — found in DB');
      return existing;
    }

    // 2. Fetch from MetadataManager (uses TMDB provider by default)
    logger.debug({ tmdbId, contentType }, 'TMDB detail — fetching live via MetadataManager');

    try {
      const data = await MetadataManager.getDetails(String(tmdbId), contentType);

      // 3. Register in ContentRegistry — creates Nova slug + permanent document
      //    This is the OTT detail lifecycle: browse = no registration,
      //    detail open = register.
      const identity = {
        tmdbId,
        metadataSource: { name: 'tmdb', id: String(tmdbId) },
      };

      const content = await ContentRegistry.registerOrUpdate({
        identity,
        title: data.title,
        contentType,
        metadata: {
          originalTitle: data.originalTitle,
          overview: data.overview,
          tagline: data.tagline,
          posterPath: data.posterPath,
          backdropPath: data.backdropPath,
          releaseDate: data.releaseDate,
          firstAirDate: data.firstAirDate,
          genres: data.genres,
          voteAverage: data.voteAverage,
          voteCount: data.voteCount,
          popularity: data.popularity,
          runtime: data.runtime,
          contentRating: data.contentRating,
          cast: data.cast,
          videos: data.videos,
          productionCompanies: data.productionCompanies,
          homepage: data.homepage,
        },
      });

      logger.info({ tmdbId, contentType, slug: content.slug },
        'C5b: Content registered via detail page — Nova slug created');

      // 4. Return the real Content document with season/episode data preserved
      //    ContentRegistry.registerOrUpdate() stores identity + basic metadata
      //    but doesn't create Season/Episode documents yet.
      //    For series, preserve the TMDB season data from the detail fetch
      //    so the frontend detail page still shows episodes.
      const result = {
        ...content,
        seasons: content.seasons || data.seasons || [],
        numberOfSeasons: content.numberOfSeasons
          || data.numberOfSeasons
          || (data.seasons ? data.seasons.length : 0)
          || 0,
        numberOfEpisodes: content.numberOfEpisodes
          || data.numberOfEpisodes
          || (data.seasons
            ? data.seasons.reduce((sum, s) => sum + (s.episodes?.length || s.episodeCount || 0), 0)
            : 0)
          || 0,
      };

      return result;
    } catch (err) {
      logger.error({ tmdbErr: err?.message || err, tmdbId, contentType }, 'Metadata detail fetch failed');
      throw ApiError.notFound(`Content with TMDB ID ${tmdbId} not found. It may not be available.`);
    }
  }

  // ── Search ──

  /**
   * Search content by query
   */
  static async search({ q, type = 'all', page = 1, limit = 20 }) {
    logger.debug({ q, type, page }, 'Searching content');
    page = Math.min(page, MAX_PAGINATION_PAGE); // PF-005: cap page number

    // Try DB full-text search first
    const dbQuery = { isActive: true };
    if (q) {
      dbQuery.$text = { $search: q };
    }
    if (type && type !== 'all') {
      dbQuery.contentType = type;
    }

    const dbResults = await Content.find(dbQuery)
      .sort({ popularity: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    if (dbResults.length > 0) {
      const total = await Content.countDocuments(dbQuery);
      return {
        items: dbResults,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        source: 'database',
      };
    }

    // Metadata provider fallback
    try {
      const results = await MetadataManager.search(q, { page });
      const items = [
        ...(results.movies || []),
        ...(results.series || []),
      ];

      return {
        items,
        pagination: {
          page,
          limit,
          total: results.total || 0,
          totalPages: results.totalPages || 1,
        },
        source: 'tmdb',
      };
    } catch (err) {
      logger.error({ err, q }, 'Search failed');
      throw ApiError.internal('Search failed. Please try again.');
    }
  }
}

module.exports = ContentService;
