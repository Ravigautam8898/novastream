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
   * Priority order (C5):
   *   1. metadataSources.{providerName}.id exact match (multi-provider identity — C5)
   *   2. tmdbId exact match (legacy — backward compatible)
   *   3. imdbId exact match (legacy — backward compatible)
   *   4. title + year + contentType (high confidence fuzzy)
   *
   * @param {Object} identifiers
   * @param {number} [identifiers.tmdbId] - TMDB content ID
   * @param {string} [identifiers.imdbId] - IMDb content ID
   * @param {string} [identifiers.title] - Content title (for title+year+type match)
   * @param {number} [identifiers.year] - Release year
   * @param {string} [identifiers.contentType] - 'movie' or 'series'
   * @param {Object} [identifiers.metadataSource] - Multi-provider identity source
   * @param {string} [identifiers.metadataSource.name] - Source name (e.g. 'tmdb', 'imdb', 'trakt')
   * @param {string} [identifiers.metadataSource.id] - Source content ID
   * @returns {Promise<Object|null>} Content document or null
   */
  static async lookup(identifiers) {
    const { tmdbId, imdbId, title, year, contentType, metadataSource } = identifiers;

    // Priority 1: metadataSources.{name}.id exact match (C5 multi-provider identity)
    if (metadataSource && metadataSource.name && metadataSource.id) {
      const query = {
        [`metadataSources.${metadataSource.name}.id`]: String(metadataSource.id),
        ...(contentType ? { contentType } : {}),
      };
      const byMetadataSource = await Content.findOne(query).lean();
      if (byMetadataSource) {
        logger.debug({ sourceName: metadataSource.name, sourceId: metadataSource.id, found: byMetadataSource.slug },
          'ContentRegistry: matched by metadataSources');
        return byMetadataSource;
      }
    }

    // Priority 2: tmdbId exact match (legacy — backward compatible)
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

    // Priority 3: imdbId exact match
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
   * @param {Object} [params.identity.metadataSource] - Multi-source identity (C5)
   * @param {string} params.identity.metadataSource.name - Source name
   * @param {string} params.identity.metadataSource.id - Source content ID
   * @param {string} params.title - Content title
   * @param {string} params.contentType - 'movie' or 'series'
   * @param {Object} [params.metadata] - Additional metadata (overview, posterPath, etc.)
   * @returns {Promise<Object>} The created Content document
   */
  static async register({ identity, title, contentType, metadata = {} }) {
    // Check if already registered (check metadataSources first for C5 multi-source identity)
    const existing = await this.lookup({
      metadataSource: identity.metadataSource,
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

    // Build metadataSources from identity
    const metadataSources = {};
    if (identity.metadataSource && identity.metadataSource.name) {
      metadataSources[identity.metadataSource.name] = {
        id: String(identity.metadataSource.id),
        lastSync: new Date(),
      };
    }

    // Build the content document
    const contentData = {
      slug: finalSlug,
      title,
      contentType,
      tmdbId: identity.tmdbId || null,
      imdbId: identity.imdbId || null,
      metadataSources: Object.keys(metadataSources).length > 0 ? metadataSources : undefined,
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
      metadataSource: identity.metadataSource,
    }, 'ContentRegistry: new content registered');

    return content.toObject();
  }

  /**
   * Register or update content. If content already exists by identity,
   * this will merge new metadata sources and safely update metadata fields.
   * If it doesn't exist, creates a new entry.
   *
   * C5b: Safe merge rules:
   *   - Rating, popularity → always updated (keep fresh)
   *   - Images (posterPath, backdropPath) → only if existing is missing
   *   - Descriptions (overview, tagline) → only if existing is missing
   *   - Cast, videos → only if existing is empty
   *   - metadataSources → merged (never duplicate)
   *
   * NEVER overwritten:
   *   - title (without identity validation)
   *   - contentType
   *   - provider mappings (providers[])
   *   - sourceId / sourceSite (legacy)
   *   - isActive, isFeatured, isPremium
   *   - engagement data (viewCount, likeCount)
   *   - categories, tags, languages (manual curation)
   *
   * @param {Object} params - Same as register()
   * @returns {Promise<Object>} The existing or created Content document
   */
  static async registerOrUpdate({ identity, title, contentType, metadata = {} }) {
    // Try to find existing content
    const existing = await this.lookup({
      metadataSource: identity.metadataSource,
      tmdbId: identity.tmdbId,
      imdbId: identity.imdbId,
      title,
      contentType,
    });

    if (existing) {
      // ── Content exists — merge safe metadata ──

      // 1a. Merge new metadata source
      if (identity.metadataSource && identity.metadataSource.name) {
        const sourceName = identity.metadataSource.name;
        const existingSources = existing.metadataSources || {};

        if (!existingSources[sourceName] || existingSources[sourceName].id !== String(identity.metadataSource.id)) {
          await Content.findByIdAndUpdate(existing._id, {
            $set: {
              [`metadataSources.${sourceName}`]: {
                id: String(identity.metadataSource.id),
                lastSync: new Date(),
              },
            },
          });
          logger.debug({ slug: existing.slug, sourceName, sourceId: identity.metadataSource.id },
            'ContentRegistry: metadata source merged into existing content');
        }

        // Sync top-level tmdbId if metadata source is tmdb and content doesn't have it
        if (sourceName === 'tmdb' && !existing.tmdbId) {
          await Content.findByIdAndUpdate(existing._id, {
            $set: { tmdbId: parseInt(identity.metadataSource.id) || identity.metadataSource.id },
          });
        }
      }

      // 1b. Build updates object with safe merge rules
      const updates = {};

      // Always update: popularity + ratings (keep content fresh in browse results)
      if (metadata.voteAverage !== undefined && metadata.voteAverage !== existing.voteAverage) {
        updates.voteAverage = metadata.voteAverage;
      }
      if (metadata.voteCount !== undefined && metadata.voteCount !== existing.voteCount) {
        updates.voteCount = metadata.voteCount;
      }
      if (metadata.popularity && metadata.popularity !== existing.popularity) {
        updates.popularity = metadata.popularity;
      }

      // Update only if missing: images
      if (metadata.posterPath && !existing.posterPath) {
        updates.posterPath = metadata.posterPath;
      }
      if (metadata.backdropPath && !existing.backdropPath) {
        updates.backdropPath = metadata.backdropPath;
      }

      // Update only if missing: descriptions
      if (metadata.overview && !existing.overview) {
        updates.overview = metadata.overview;
      }
      if (metadata.tagline && !existing.tagline) {
        updates.tagline = metadata.tagline;
      }

      // Update only if missing: original title
      if (metadata.originalTitle && !existing.originalTitle) {
        updates.originalTitle = metadata.originalTitle;
      }

      // Update only if missing: runtime, content rating
      if (metadata.runtime && !existing.runtime) {
        updates.runtime = metadata.runtime;
      }
      if (metadata.contentRating && !existing.contentRating) {
        updates.contentRating = metadata.contentRating;
      }

      // Update only if empty: cast, videos, production companies
      if (metadata.cast && Array.isArray(metadata.cast) && metadata.cast.length > 0 &&
          (!existing.cast || existing.cast.length === 0)) {
        updates.cast = metadata.cast;
      }
      if (metadata.videos && Array.isArray(metadata.videos) && metadata.videos.length > 0 &&
          (!existing.videos || existing.videos.length === 0)) {
        updates.videos = metadata.videos;
      }
      if (metadata.productionCompanies && Array.isArray(metadata.productionCompanies) &&
          metadata.productionCompanies.length > 0 &&
          (!existing.productionCompanies || existing.productionCompanies.length === 0)) {
        updates.productionCompanies = metadata.productionCompanies;
      }

      // Apply updates if any
      const updateKeys = Object.keys(updates);
      if (updateKeys.length > 0) {
        await Content.findByIdAndUpdate(existing._id, { $set: updates });
        logger.debug({ slug: existing.slug, updatedFields: updateKeys.join(', ') },
          'ContentRegistry: metadata merged into existing content');
      }

      // Re-fetch to return fresh document
      const refreshed = await Content.findById(existing._id).lean();
      return refreshed || existing;
    }

    // Not found — register new
    return this.register({ identity, title, contentType, metadata });
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
