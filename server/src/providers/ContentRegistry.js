// server/src/providers/ContentRegistry.js
// Content Registry — Nova-owned identity management for Track C2
//
// Responsibilities:
//   - Generate and manage permanent Nova-owned slugs
//   - Match content across identity sources (tmdbId, imdbId, title+year+type)
//   - Register new content with Nova identity
//   - Remove tmdb-* navigation dependency by ensuring every content item
//     that enters homepage/search gets a ContentRegistry entry
//
// Design rules (C-013):
//   1. Metadata providers (TMDB) create content identity
//   2. Streaming providers only attach availability
//   3. URL slug is Nova owned — never depends on provider IDs
//   4. Provider failure never changes content identity
//   5. Provider-only titles go through ContentRegistry for identity matching

const Content = require('../models/Content.model');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

class ContentRegistry {
  /**
   * Lookup content by one or more identity identifiers.
   * Returns the first match found, searching in priority order.
   *
   * @param {Object} identifiers
   * @param {number} [identifiers.tmdbId] - TMDB content ID
   * @param {string} [identifiers.imdbId] - IMDb content ID
   * @param {string} [identifiers.title] - Content title (for title+year+type match)
   * @param {number} [identifiers.year] - Release year
   * @param {string} [identifiers.contentType] - 'movie' or 'series'
   * @returns {Promise<Object|null>} Content document or null
   */
  static async lookup(identifiers) {
    const { tmdbId, imdbId, title, year, contentType } = identifiers;

    // Priority 1: tmdbId exact match (strongest identity signal)
    if (tmdbId) {
      const byTmdb = await Content.findOne({
        tmdbId,
        ...(contentType ? { contentType } : {}),
      }).lean();
      if (byTmdb) {
        logger.debug({ tmdbId, found: byTmdb.slug }, 'ContentRegistry: matched by tmdbId');
        return byTmdb;
      }
    }

    // Priority 2: imdbId exact match
    if (imdbId) {
      const byImdb = await Content.findOne({ imdbId }).lean();
      if (byImdb) {
        logger.debug({ imdbId, found: byImdb.slug }, 'ContentRegistry: matched by imdbId');
        return byImdb;
      }
    }

    // Priority 3: title + year + contentType (high confidence)
    if (title && contentType) {
      const query = { contentType, isActive: true };

      // Try exact title first
      query.title = title;
      const byExactTitle = await Content.findOne(query).lean();
      if (byExactTitle) {
        // If we have a year, verify it
        if (year) {
          const contentYear = byExactTitle.releaseDate
            ? new Date(byExactTitle.releaseDate).getFullYear()
            : byExactTitle.firstAirDate
              ? new Date(byExactTitle.firstAirDate).getFullYear()
              : null;
          if (contentYear && Math.abs(contentYear - year) <= 2) {
            logger.debug({ title, year, found: byExactTitle.slug }, 'ContentRegistry: matched by exact title + year');
            return byExactTitle;
          }
          // Year mismatch — don't return, fall through
        } else {
          // No year to verify — allow match
          logger.debug({ title, found: byExactTitle.slug }, 'ContentRegistry: matched by exact title (no year)');
          return byExactTitle;
        }
      }
    }

    // Priority 4: title + type fuzzy (low confidence — log for awareness)
    if (title && contentType) {
      const fuzzyQuery = {
        title: { $regex: this._escapeRegex(title), $options: 'i' },
        contentType,
        isActive: true,
      };
      const byFuzzy = await Content.findOne(fuzzyQuery).lean();
      if (byFuzzy) {
        logger.warn({
          title,
          contentType,
          matched: byFuzzy.title,
          slug: byFuzzy.slug,
        }, 'ContentRegistry: low-confidence fuzzy title match — review recommended');
        return byFuzzy;
      }
    }

    return null;
  }

  /**
   * Register a new content entry with a Nova-owned slug.
   * Creates the Content document with identity fields from TMDB or
   * from the provided metadata. The slug is always Nova-generated.
   *
   * @param {Object} params
   * @param {Object} params.identity - Identity identifiers (tmdbId, imdbId)
   * @param {string} params.title - Content title
   * @param {string} params.contentType - 'movie' or 'series'
   * @param {Object} [params.metadata] - Additional metadata (overview, posterPath, etc.)
   * @returns {Promise<Object>} The created Content document
   */
  static async register({ identity, title, contentType, metadata = {} }) {
    // Check if already registered
    const existing = await this.lookup({
      tmdbId: identity.tmdbId,
      imdbId: identity.imdbId,
      title,
      contentType,
    });

    if (existing) {
      logger.debug({ slug: existing.slug, title }, 'ContentRegistry: content already registered');
      return existing;
    }

    // Generate Nova-owned slug
    const slug = Content.generateSlug(title);

    // Validate slug uniqueness (generateSlug already appends random suffix,
    // but we double-check to be safe)
    const slugExists = await Content.findOne({ slug });
    const finalSlug = slugExists ? Content.generateSlug(title) : slug;

    // Build the content document
    const contentData = {
      slug: finalSlug,
      title,
      contentType,
      tmdbId: identity.tmdbId || null,
      imdbId: identity.imdbId || null,
      originalTitle: metadata.originalTitle || title,
      overview: metadata.overview || '',
      posterPath: metadata.posterPath || null,
      backdropPath: metadata.backdropPath || null,
      releaseDate: metadata.releaseDate ? new Date(metadata.releaseDate) : null,
      firstAirDate: metadata.firstAirDate ? new Date(metadata.firstAirDate) : null,
      genres: metadata.genres || [],
      voteAverage: metadata.voteAverage || 0,
      voteCount: metadata.voteCount || 0,
      popularity: metadata.popularity || 0,
      isActive: true,
      isFeatured: false,
      cast: metadata.cast || [],
      videos: metadata.videos || [],
      productionCompanies: metadata.productionCompanies || [],
      homepage: metadata.homepage || null,
    };

    const content = await Content.create(contentData);
    logger.info({
      slug: finalSlug,
      title,
      contentType,
      tmdbId: identity.tmdbId,
    }, 'ContentRegistry: new content registered');

    return content.toObject();
  }

  /**
   * Identify a provider content item against the ContentRegistry.
   * Uses the strongest available identity signal from the provider item.
   *
   * @param {Object} providerItem - Content item from a streaming provider
   * @param {string} providerItem.title - Content title
   * @param {string} [providerItem.tmdbId] - TMDB ID (if provider exposes it)
   * @param {string} [providerItem.imdbId] - IMDb ID
   * @param {number} [providerItem.year] - Release year
   * @param {string} providerItem.contentType - 'movie' or 'series'
   * @returns {Promise<{content: Object|null, confidence: number, method: string}>}
   */
  static async identify(providerItem) {
    const { title, tmdbId, imdbId, year, contentType } = providerItem;

    // Try tmdbId first (strongest)
    if (tmdbId) {
      const byTmdb = await Content.findOne({ tmdbId }).lean();
      if (byTmdb) {
        return { content: byTmdb, confidence: 1.0, method: 'tmdbId' };
      }
    }

    // Try imdbId second
    if (imdbId) {
      const byImdb = await Content.findOne({ imdbId }).lean();
      if (byImdb) {
        return { content: byImdb, confidence: 0.95, method: 'imdbId' };
      }
    }

    // Try title + year + type
    if (title && contentType) {
      const query = { title, contentType, isActive: true };
      const byTitle = await Content.findOne(query).lean();
      if (byTitle) {
        if (year) {
          const contentYear = byTitle.releaseDate
            ? new Date(byTitle.releaseDate).getFullYear()
            : byTitle.firstAirDate
              ? new Date(byTitle.firstAirDate).getFullYear()
              : null;
          if (contentYear && Math.abs(contentYear - year) <= 2) {
            return { content: byTitle, confidence: 0.85, method: 'titleYearType' };
          }
          // Year mismatch — low confidence
          return {
            content: null,
            confidence: 0.3,
            method: 'titleYearMismatch',
          };
        }
        // No year to verify — medium confidence
        return { content: byTitle, confidence: 0.7, method: 'titleTypeOnly' };
      }
    }

    return { content: null, confidence: 0, method: 'noMatch' };
  }

  /**
   * Escape special regex characters in a string.
   */
  static _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Attach a provider mapping to existing content.
   * This is the C-012 replacement for setting sourceId/sourceSite directly.
   *
   * @param {string} contentId - MongoDB _id of the content
   * @param {Object} mapping
   * @param {string} mapping.providerName - Provider identifier (e.g. 'yupflix')
   * @param {string} mapping.providerContentId - Provider's internal content ID
   * @param {number} [mapping.confidence] - Match confidence (0.0 - 1.0)
   * @param {string} [mapping.status] - 'active', 'stale', 'failed'
   * @returns {Promise<boolean>} Whether the mapping was added/updated
   */
  static async attachProvider(contentId, mapping) {
    const { providerName, providerContentId, confidence = 1.0, status = 'active' } = mapping;

    // C-012: Use $addToSet to prevent duplicate entries for the same provider.
    // If a provider mapping already exists for this providerName, it is NOT
    // duplicated — only the new entry is added if it's truly unique.
    // To UPDATE an existing mapping, use updateProviderMapping() instead.
    const result = await Content.findByIdAndUpdate(contentId, {
      $addToSet: {
        providers: {
          providerName,
          providerContentId,
          confidenceScore: confidence,
          lastVerified: new Date(),
          status,
        },
      },
    });

    if (!result) {
      logger.warn({ contentId, providerName }, 'ContentRegistry: failed to attach provider — content not found');
      return false;
    }

    logger.debug({
      contentId,
      providerName,
      providerContentId,
      confidence,
    }, 'ContentRegistry: provider mapping attached');

    return true;
  }
}

module.exports = ContentRegistry;
