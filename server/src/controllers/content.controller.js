// server/src/controllers/content.controller.js
// Content HTTP handlers — thin layer over ContentService

const ContentService = require('../services/content.service');
const ApiResponse = require('../utils/ApiResponse');

/**
 * GET /api/homepage/sections
 * Get all homepage sections (featured, trending, categories)
 */
async function getHomepageSections(req, res, next) {
  try {
    const sections = await ContentService.getHomepageSections();
    ApiResponse.success(res, sections, 'Homepage sections retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/movies
 * Browse movies with pagination and filters
 */
async function getMovies(req, res, next) {
  try {
    const query = req.validatedQuery || req.query;
    const result = await ContentService.getMovies({
      page: query.page,
      limit: query.limit,
      genre: query.genre,
      sort: query.sort,
    });
    ApiResponse.paginated(res, result.items, result.pagination);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/movies/:slug
 * Get movie details
 */
async function getMovieBySlug(req, res, next) {
  try {
    const { slug } = req.validatedParams || req.params;
    const movie = await ContentService.getMovieBySlug(slug);
    ApiResponse.success(res, movie, 'Movie retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/series
 * Browse series with pagination and filters
 */
async function getSeries(req, res, next) {
  try {
    const query = req.validatedQuery || req.query;
    const result = await ContentService.getSeries({
      page: query.page,
      limit: query.limit,
      genre: query.genre,
      sort: query.sort,
    });
    ApiResponse.paginated(res, result.items, result.pagination);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/series/:slug
 * Get series details with seasons and episodes
 */
async function getSeriesBySlug(req, res, next) {
  try {
    const { slug } = req.validatedParams || req.params;
    const series = await ContentService.getSeriesBySlug(slug);
    ApiResponse.success(res, series, 'Series retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/series/:slug/seasons
 * Get seasons for a series
 */
async function getSeriesSeasons(req, res, next) {
  try {
    const { slug } = req.validatedParams || req.params;
    const result = await ContentService.getSeriesSeasons(slug);
    ApiResponse.success(res, result, 'Seasons retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/episode/:id
 * Get episode details
 */
async function getEpisodeById(req, res, next) {
  try {
    const { id } = req.validatedParams || req.params;
    const episode = await ContentService.getEpisodeById(id);
    ApiResponse.success(res, episode, 'Episode retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/trending
 * Get trending content
 */
async function getTrending(req, res, next) {
  try {
    const query = req.validatedQuery || req.query;
    const result = await ContentService.getTrending(query.page, query.limit);
    ApiResponse.paginated(res, result.items, result.pagination);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/categories/:category
 * Get content by category
 */
async function getByCategory(req, res, next) {
  try {
    const { category } = req.validatedParams || req.params;
    const query = req.validatedQuery || req.query;
    const result = await ContentService.getByCategory(category, query.page, query.limit);
    ApiResponse.paginated(res, result.items, result.pagination);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/search
 * Search content
 */
async function search(req, res, next) {
  try {
    const query = req.validatedQuery || req.query;
    const result = await ContentService.search({
      q: query.q,
      type: query.type,
      page: query.page,
      limit: query.limit,
    });
    ApiResponse.paginated(res, result.items, result.pagination);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/movies/tmdb/:id
 * Get movie details by TMDB ID (DB-first, TMDB fallback)
 */
async function getMovieByTmdbId(req, res, next) {
  try {
    const { id } = req.validatedParams || req.params;
    const movie = await ContentService.getByTmdbId(parseInt(id), 'movie');
    ApiResponse.success(res, movie, 'Movie retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/series/tmdb/:id
 * Get series details by TMDB ID (DB-first, TMDB fallback)
 */
async function getSeriesByTmdbId(req, res, next) {
  try {
    const { id } = req.validatedParams || req.params;
    const series = await ContentService.getByTmdbId(parseInt(id), 'series');
    ApiResponse.success(res, series, 'Series retrieved');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHomepageSections,
  getMovies,
  getMovieBySlug,
  getSeries,
  getSeriesBySlug,
  getSeriesSeasons,
  getEpisodeById,
  getTrending,
  getByCategory,
  search,
  getMovieByTmdbId,
  getSeriesByTmdbId,
};
