// client/src/api/external-source.api.js
// External Content Source API — frontend methods for external streaming
//
// Provides methods to play content from external streaming providers.
// New sources can be added server-side without changing this API.
// Expiry timer: Client should call refresh() ~10 min before token expiry
// to ensure uninterrupted playback.

import apiClient from './client';

export const externalSourceApi = {
  /**
   * Get a streaming URL for a content item.
   * Uses server-side cache if available.
   *
   * @param {Object} params
   * @param {string} params.slug - NovaStream content slug
   * @param {string} params.contentType - 'movie' or 'series'
   * @param {string} [params.quality] - '480p', '720p', '1080p' (default: '720p')
   * @param {number} [params.season] - Season number (series only)
   * @param {number} [params.episode] - Episode number (series only)
   * @returns {Promise<{url: string, expiresAt: number, qualities: Array|null}>}
   */
  play: async ({ slug, contentType, quality, season, episode }) => {
    const { data } = await apiClient.post('/external/play', {
      slug,
      contentType,
      quality,
      season,
      episode,
    });
    return data.data;
  },

  /**
   * Force refresh a streaming URL (bypass cache).
   * Call this ~10 min before the URL's expiresAt to avoid interruption.
   *
   * @param {Object} params - Same as play()
   * @returns {Promise<{url: string, expiresAt: number, qualities: Array|null}>}
   */
  refresh: async ({ slug, contentType, quality, season, episode }) => {
    const { data } = await apiClient.post('/external/refresh', {
      slug,
      contentType,
      quality,
      season,
      episode,
    });
    return data.data;
  },

  /**
   * Recover from a stream playback failure.
   * C5d: Two-phase recovery — refreshes same provider, then falls back to next.
   * Includes retry storm protection (max 3 per user+content+session).
   * Quality preference is preserved during recovery.
   *
   * @param {Object} params - Same as play()
   * @returns {Promise<{url: string, expiresAt: number, qualities: Array|null, provider: string|null, recovered: boolean}>}
   */
  recover: async ({ slug, contentType, quality, season, episode }) => {
    const { data } = await apiClient.post('/external/recover', {
      slug,
      contentType,
      quality,
      season,
      episode,
    });
    return data.data;
  },

  /**
   * Check what streams are available for content (without fetching a URL).
   *
   * @param {string} slug - NovaStream content slug
   * @param {Object} [params]
   * @param {string} [params.contentType] - 'movie' or 'series'
   * @param {number} [params.season] - Season number (series only)
   * @param {number} [params.episode] - Episode number (series only)
   * @returns {Promise<{hasStreams: boolean, qualities: Array, sourceSite: string|null}>}
   */
  getStreamInfo: async (slug, { contentType, season, episode } = {}) => {
    const params = { contentType, season, episode };
    // Remove undefined values
    Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);

    const { data } = await apiClient.get(`/external/stream-info/${slug}`, { params });
    return data.data;
  },
};
