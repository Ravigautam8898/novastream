// server/src/services/tmdb.service.js
// TMDB Metadata Integration Service
// Handles fetching and transforming TMDB data for our database models

const { MovieDb } = require('moviedb-promise');
const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');
const tmdbImages = require('../utils/tmdb-images');

// ── TMDB API Client (P8-RUNTIME-001) ──
// Timeout configured to prevent hanging requests on slow IPv6 paths.
// The 10s timeout covers typical TMDB API response times (~200-800ms)
// while preventing resource exhaustion from hanging connections.
//
// IMPORTANT: MovieDb v4 constructor is (apiKey, baseUrl, rateLimit) —
// NOT (apiKey, options). We set axios defaults globally for timeout.
axios.defaults.timeout = 10000;
const tmdb = new MovieDb(config.tmdb.apiKey);

class TMDbService {
  /**
   * Sanitize a TMDB API error for logging (P8-RUNTIME-001).
   * Axios errors contain full request/response objects with headers, config,
   * and internal state — these are both massive and potentially sensitive.
   * Extract only the actionable fields for log output.
   *
   * @param {Error} err - Original error from moviedb-promise/axios
   * @returns {Object} Sanitized error object safe for logging
   */
  static sanitizeError(err) {
    if (err && err.response) {
      // Axios response error: has status, data, headers
      return {
        status: err.response.status,
        statusText: err.response.statusText,
        message: err.message,
        // Include first 500 chars of response body for debugging,
        // truncated to avoid logging large TMDB error pages
        data: typeof err.response.data === 'string'
          ? err.response.data.slice(0, 500)
          : err.response.data,
      };
    }
    if (err && err.code === 'ECONNABORTED') {
      return { message: 'TMDB request timed out', code: 'ECONNABORTED' };
    }
    if (err && err.code) {
      return { message: err.message, code: err.code };
    }
    return { message: err?.message || 'Unknown TMDB error' };
  }

  /**
   * Transform a TMDB image path to a full URL
   */
  static getImageUrl(path, size = 'w500') {
    return tmdbImages.getImageUrl(path, size);
  }

  /**
   * Get backdrop URL (larger size for hero banners)
   */
  static getBackdropUrl(path) {
    return tmdbImages.getBackdropUrl(path);
  }

  /**
   * Get profile URL for cast
   */
  static getProfileUrl(path) {
    return tmdbImages.getProfileUrl(path);
  }

  // ── Movie Syncing ──

  /**
   * Fetch US movie certification from TMDB release_dates endpoint.
   * Priority: US certification → original country → first available → adult flag fallback.
   * @param {number} tmdbId - TMDB movie ID
   * @param {boolean} adult - TMDB adult flag (fallback)
   * @returns {Promise<string|null>} Certification string (e.g. "R", "PG-13") or null
   */
  static async fetchMovieCertification(tmdbId, adult) {
    try {
      const releaseDates = await tmdb.movieReleaseDates({ id: tmdbId });
      const results = releaseDates.results || [];

      // Priority 1: US certification
      const usRelease = results.find(r => r.iso_3166_1 === 'US');
      if (usRelease?.release_dates?.length > 0) {
        const cert = usRelease.release_dates.find(rd => rd.certification && rd.certification.trim());
        if (cert) return cert.certification;
      }

      // Priority 2: First available certification from any country
      for (const release of results) {
        if (release.release_dates?.length > 0) {
          const cert = release.release_dates.find(rd => rd.certification && rd.certification.trim());
          if (cert) return cert.certification;
        }
      }
    } catch (err) {
      logger.warn({ tmdbId, err: TMDbService.sanitizeError(err) }, 'Failed to fetch certification — using adult flag fallback');
    }

    // Priority 4: Adult flag fallback
    return adult ? 'R' : null;
  }

  /**
   * Sync a movie by TMDB ID — returns normalized data for our Content model
   */
  static async syncMovie(tmdbId) {
    logger.info({ tmdbId }, 'Syncing movie from TMDB');

    try {
      const [movie, credits, videos] = await Promise.all([
        tmdb.movieInfo({ id: tmdbId }),
        tmdb.movieCredits({ id: tmdbId }),
        tmdb.movieVideos({ id: tmdbId }).catch(() => ({ results: [] })),
      ]);

      // D-013: Fetch actual certification from release_dates (not just adult flag)
      const contentRating = await TMDbService.fetchMovieCertification(tmdbId, movie.adult);

      return {
        tmdbId: movie.id,
        title: movie.title,
        originalTitle: movie.original_title,
        originalLanguage: movie.original_language,
        tagline: movie.tagline,
        overview: movie.overview,
        contentType: 'movie',
        posterPath: movie.poster_path,
        backdropPath: movie.backdrop_path,
        releaseDate: movie.release_date,
        runtime: movie.runtime,
        genres: movie.genres,
        voteAverage: movie.vote_average,
        voteCount: movie.vote_count,
        popularity: movie.popularity,
        homepage: movie.homepage,
        imdbId: movie.imdb_id,
        contentRating,
        productionCompanies: movie.production_companies?.map(c => c.name) || [],
        videos: videos.results?.slice(0, 5).map(v => ({
          key: v.key,
          name: v.name,
          site: v.site,
          type: v.type,
        })) || [],
        cast: credits.cast?.slice(0, 20).map(p => ({
          tmdbId: p.id,
          name: p.name,
          character: p.character,
          profilePath: p.profile_path,
          order: p.order,
        })) || [],
        director: credits.crew?.find(c => c.job === 'Director')?.name || null,
      };
    } catch (err) {
      logger.error({ tmdbErr: TMDbService.sanitizeError(err), tmdbId }, 'TMDB syncMovie failed');
      throw err;
    }
  }

  // ── Series Syncing ──

  /**
   * Fetch US TV content rating from TMDB content_ratings endpoint.
   * Priority: US rating → original country → first available → adult flag fallback.
   * @param {number} tmdbId - TMDB series ID
   * @param {boolean} adult - TMDB adult flag (fallback)
   * @returns {Promise<string|null>} Rating string (e.g. "TV-MA", "TV-14") or null
   */
  static async fetchSeriesCertification(tmdbId, adult) {
    try {
      const contentRatings = await tmdb.tvContentRatings({ id: tmdbId });
      const results = contentRatings.results || [];

      // Priority 1: US rating
      const usRating = results.find(r => r.iso_3166_1 === 'US');
      if (usRating?.rating) return usRating.rating;

      // Priority 2: First available rating from any country
      for (const entry of results) {
        if (entry.rating) return entry.rating;
      }
    } catch (err) {
      logger.warn({ tmdbId, err: TMDbService.sanitizeError(err) }, 'Failed to fetch series certification — using adult flag fallback');
    }

    // Priority 4: Adult flag fallback
    return adult ? 'TV-MA' : null;
  }

  /**
   * Sync a TV series by TMDB ID — includes all seasons and episodes
   */
  static async syncSeries(tmdbId) {
    logger.info({ tmdbId }, 'Syncing series from TMDB');

    try {
      const [series, credits, videos] = await Promise.all([
        tmdb.tvInfo({ id: tmdbId }),
        tmdb.tvCredits({ id: tmdbId }),
        tmdb.tvVideos({ id: tmdbId }).catch(() => ({ results: [] })),
      ]);

      // D-013: Fetch actual certification from content_ratings (not just adult flag)
      const contentRating = await TMDbService.fetchSeriesCertification(tmdbId, series.adult);

      const seasonNumbers = series.seasons
        ?.filter(s => s.season_number > 0)
        ?.map(s => s.season_number) || [];

      // Sync all seasons in parallel
      const seasons = await Promise.all(
        seasonNumbers.map(sn => this.syncSeason(tmdbId, sn))
      );

      return {
        tmdbId: series.id,
        title: series.name,
        originalTitle: series.original_name,
        originalLanguage: series.original_language,
        tagline: series.tagline,
        overview: series.overview,
        contentType: 'series',
        posterPath: series.poster_path,
        backdropPath: series.backdrop_path,
        firstAirDate: series.first_air_date,
        lastAirDate: series.last_air_date,
        numberOfSeasons: series.number_of_seasons,
        numberOfEpisodes: series.number_of_episodes,
        genres: series.genres,
        voteAverage: series.vote_average,
        voteCount: series.vote_count,
        popularity: series.popularity,
        homepage: series.homepage,
        contentRating,
        productionCompanies: series.production_companies?.map(c => c.name) || [],
        videos: videos.results?.slice(0, 5).map(v => ({
          key: v.key,
          name: v.name,
          site: v.site,
          type: v.type,
        })) || [],
        cast: credits.cast?.slice(0, 20).map(p => ({
          tmdbId: p.id,
          name: p.name,
          character: p.character,
          profilePath: p.profile_path,
          order: p.order,
        })) || [],
        seasons,
      };
    } catch (err) {
      logger.error({ tmdbErr: TMDbService.sanitizeError(err), tmdbId }, 'TMDB syncSeries failed');
      throw err;
    }
  }

  /**
   * Sync a single season with its episodes
   */
  static async syncSeason(seriesId, seasonNumber) {
    logger.debug({ seriesId, seasonNumber }, 'Syncing season from TMDB');

    try {
      const season = await tmdb.seasonInfo({
        id: seriesId,
        season_number: seasonNumber,
      });

      return {
        tmdbId: season.id,
        seasonNumber: season.season_number,
        name: season.name,
        overview: season.overview,
        posterPath: season.poster_path,
        airDate: season.air_date,
        episodeCount: season.episodes?.length || 0,
        episodes: season.episodes?.map(ep => ({
          tmdbId: ep.id,
          episodeNumber: ep.episode_number,
          name: ep.name,
          overview: ep.overview,
          stillPath: ep.still_path,
          airDate: ep.air_date,
          runtime: ep.runtime,
          voteAverage: ep.vote_average,
          voteCount: ep.vote_count,
        })) || [],
      };
    } catch (err) {
      logger.error({ tmdbErr: TMDbService.sanitizeError(err), seriesId, seasonNumber }, 'TMDB syncSeason failed');
      throw err;
    }
  }

  // ── Search ──

  /**
   * Search movies and series by query
   */
  static async search(query, page = 1) {
    logger.debug({ query, page }, 'Searching TMDB');

    try {
      const [movies, tv] = await Promise.all([
        tmdb.searchMovie({ query, page }),
        tmdb.searchTv({ query, page }),
      ]);

      return {
        movies: movies.results?.map(m => ({
          tmdbId: m.id,
          title: m.title,
          overview: m.overview,
          posterPath: m.poster_path,
          backdropPath: m.backdrop_path,
          releaseDate: m.release_date,
          voteAverage: m.vote_average,
          contentType: 'movie',
        })) || [],
        series: tv.results?.map(s => ({
          tmdbId: s.id,
          title: s.name,
          overview: s.overview,
          posterPath: s.poster_path,
          backdropPath: s.backdrop_path,
          firstAirDate: s.first_air_date,
          voteAverage: s.vote_average,
          contentType: 'series',
        })) || [],
        total: (movies.total_results || 0) + (tv.total_results || 0),
        page,
        totalPages: Math.max(movies.total_pages || 0, tv.total_pages || 0),
      };
    } catch (err) {
      logger.error({ tmdbErr: TMDbService.sanitizeError(err), query, page }, 'TMDB search failed');
      throw err;
    }
  }

  // ── Trending ──

  /**
   * Get trending content for the homepage
   */
  static async getTrending(page = 1) {
    logger.debug({ page }, 'Fetching trending from TMDB');

    try {
      const trending = await tmdb.trending({ media_type: 'all', time_window: 'week', page });

      return trending.results?.map(item => ({
        tmdbId: item.id,
        title: item.title || item.name,
        overview: item.overview,
        posterPath: item.poster_path,
        backdropPath: item.backdrop_path,
        voteAverage: item.vote_average,
        contentType: item.media_type === 'tv' ? 'series' : 'movie',
      })) || [];
    } catch (err) {
      logger.error({ tmdbErr: TMDbService.sanitizeError(err), page }, 'TMDB getTrending failed');
      throw err;
    }
  }

  // ── Language-based Discovery ──

  /**
   * Fetch popular content by original language
   * Used by seed script to populate category-specific content
   */
  static async getByLanguage(language, page = 1) {
    logger.debug({ language, page }, 'Fetching content by language from TMDB');

    try {
      const [movies, tv] = await Promise.all([
        tmdb.discoverMovie({
          with_original_language: language,
          sort_by: 'popularity.desc',
          page,
        }),
        tmdb.discoverTv({
          with_original_language: language,
          sort_by: 'popularity.desc',
          page,
        }),
      ]);

      return {
        movies: movies.results?.map(m => ({
          tmdbId: m.id,
          title: m.title,
          overview: m.overview,
          posterPath: m.poster_path,
          backdropPath: m.backdrop_path,
          releaseDate: m.release_date,
          voteAverage: m.vote_average,
          contentType: 'movie',
        })) || [],
        series: tv.results?.map(s => ({
          tmdbId: s.id,
          title: s.name,
          overview: s.overview,
          posterPath: s.poster_path,
          backdropPath: s.backdrop_path,
          firstAirDate: s.first_air_date,
          voteAverage: s.vote_average,
          contentType: 'series',
        })) || [],
      };
    } catch (err) {
      logger.error({ tmdbErr: TMDbService.sanitizeError(err), language, page }, 'TMDB getByLanguage failed');
      throw err;
    }
  }

  // ── Configuration ──

  /**
   * Get TMDB API configuration (image sizes, etc.)
   */
  static async getConfig() {
    return tmdb.configuration();
  }
}

module.exports = TMDbService;
