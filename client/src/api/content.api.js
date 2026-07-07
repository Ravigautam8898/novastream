import apiClient from './client';

export const contentApi = {
  getHomepageSections: async () => {
    const { data } = await apiClient.get('/homepage/sections');
    return data.data;
  },

  getMovies: async ({ page = 1, limit = 20, genre, sort } = {}) => {
    const params = { page, limit };
    if (genre) params.genre = genre;
    if (sort) params.sort = sort;
    const { data } = await apiClient.get('/movies', { params });
    return { items: data.data, pagination: data.pagination };
  },

  getMovieBySlug: async (slug) => {
    const { data } = await apiClient.get(`/movies/${slug}`);
    return data.data;
  },

  /**
   * Get movie details by TMDB ID.
   * Checks MongoDB first, falls back to live TMDB API.
   * For TMDB-only items that haven't been seeded into the database yet.
   * @param {number} tmdbId - TMDB content ID
   * @returns {Object} Normalized movie detail object
   */
  getMovieByTmdbId: async (tmdbId) => {
    const { data } = await apiClient.get(`/movies/tmdb/${tmdbId}`);
    return data.data;
  },

  /**
   * Get series details by TMDB ID.
   * Checks MongoDB first, falls back to live TMDB API.
   */
  getSeriesByTmdbId: async (tmdbId) => {
    const { data } = await apiClient.get(`/series/tmdb/${tmdbId}`);
    return data.data;
  },

  getSeries: async ({ page = 1, limit = 20, genre, sort } = {}) => {
    const params = { page, limit };
    if (genre) params.genre = genre;
    if (sort) params.sort = sort;
    const { data } = await apiClient.get('/series', { params });
    return { items: data.data, pagination: data.pagination };
  },

  getSeriesBySlug: async (slug) => {
    const { data } = await apiClient.get(`/series/${slug}`);
    return data.data;
  },

  getSeriesSeasons: async (slug) => {
    const { data } = await apiClient.get(`/series/${slug}/seasons`);
    return data.data;
  },

  getEpisodeById: async (id) => {
    const { data } = await apiClient.get(`/episode/${id}`);
    return data.data;
  },

  getTrending: async ({ page = 1, limit = 20 } = {}) => {
    const { data } = await apiClient.get('/trending', { params: { page, limit } });
    return { items: data.data, pagination: data.pagination };
  },

  getByCategory: async (category, { page = 1, limit = 20 } = {}) => {
    const { data } = await apiClient.get(`/categories/${category}`, { params: { page, limit } });
    return { items: data.data, pagination: data.pagination };
  },

  search: async ({ q, type = 'all', page = 1, limit = 20 }) => {
    const { data } = await apiClient.get('/search', { params: { q, type, page, limit } });
    return { items: data.data, pagination: data.pagination };
  },

  // ── Stream / Playback ──

  /**
   * Generate a signed stream token for protected HLS playback.
   * @param {string} contentId - MongoDB _id of the content or episode
   * @param {string} contentType - 'movie', 'series', or 'episode'
   * @returns {Object} { token, expiresIn, streamUrl }
   */
  getStreamToken: async (contentId, contentType) => {
    const { data } = await apiClient.post('/stream/token', { contentId, contentType });
    return data.data;
  },

  /**
   * Get stream info (available qualities, etc.) for a piece of content
   * @param {string} type - 'movie' or 'series'
   * @param {string} slug - Content slug
   * @returns {Object} Stream info
   */
  getStreamInfo: async (type, slug) => {
    const { data } = await apiClient.get(`/stream/info/${type}/${slug}`);
    return data.data;
  },

  /**
   * Build an HLS stream URL for a movie content item.
   * No token in URL — httpOnly cookie handles auth (ST-001).
   * @param {string} slug - Content slug
   * @returns {string} Full stream URL
   */
  getMovieStreamUrl: (slug) => {
    return `/api/stream/movie/${slug}/index.m3u8`;
  },

  /**
   * Build an HLS stream URL for an episode.
   * No token in URL — httpOnly cookie handles auth (ST-001).
   * @param {string} episodeId - Episode MongoDB _id
   * @returns {string} Full stream URL
   */
  getEpisodeStreamUrl: (episodeId) => {
    return `/api/stream/episode/${episodeId}/index.m3u8`;
  },

  /**
   * Build a thumbnail sprite URL for seek preview.
   * @param {string} contentType - 'movie' or 'episode'
   * @param {string} id - MongoDB _id
   * @returns {string} Full thumbnail URL
   */
  getThumbnailUrl: (contentType, id) => {
    return `/api/thumbnails/${contentType}/${id}`;
  },

  // ── Playback Progress (Continue Watching) ──

  /**
   * Save playback progress for a content item.
   * @param {string} contentId - MongoDB _id of Content or Episode
   * @param {string} contentType - 'movie' or 'episode'
   * @param {number} progress - Current playback position in seconds
   * @param {number} duration - Total duration in seconds
   */
  saveProgress: async (contentId, contentType, progress, duration) => {
    const { data } = await apiClient.post('/progress/save', {
      contentId,
      contentType,
      progress,
      duration,
    });
    return data.data;
  },

  /**
   * Get saved playback progress for a content item.
   * @param {string} type - 'movie' or 'episode'
   * @param {string} id - MongoDB _id
   * @returns {Object} { hasProgress, progress, duration, watchedAt }
   */
  getProgress: async (type, id) => {
    const { data } = await apiClient.get(`/progress/${type}/${id}`);
    return data.data;
  },

  /**
   * Get continue watching items for the current user.
   * Returns items with progress metadata and populated content data.
   * @returns {Object} { items: Array<{ ..., progress, duration, progressPercent, watchedAt }> }
   */
  getContinueWatching: async () => {
    const { data } = await apiClient.get('/progress/continue-watching');
    return data.data;
  },

  /**
   * Remove an item from the continue watching list.
   * @param {string} id - MongoDB _id of the Content or Episode
   * @param {string} contentType - 'movie' or 'episode'
   */
  removeFromContinueWatching: async (id, contentType) => {
    const { data } = await apiClient.delete(`/progress/continue-watching/${id}`, {
      params: { contentType },
    });
    return data.data;
  },

  getImageUrl: (type, size, path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `/api/images/${type}/${size}${path}`;
  },
};
