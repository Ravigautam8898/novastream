import apiClient from './client';

export const favoritesApi = {
  /** List all favorites for current user (populated with content data) */
  getFavorites: () => apiClient.get('/favorites').then(r => r.data.data),

  /** Toggle add/remove favorite. Returns { isFavorited: boolean } */
  toggleFavorite: (contentId) => apiClient.post(`/favorites/${contentId}`).then(r => r.data.data),

  /** Check if specific content is favorited. Returns { isFavorited: boolean } */
  checkFavorite: (contentId) => apiClient.get(`/favorites/check/${contentId}`).then(r => r.data.data),

  /** Explicitly remove from favorites. Returns { removed: true } */
  removeFavorite: (contentId) => apiClient.delete(`/favorites/${contentId}`).then(r => r.data.data),
};

export default favoritesApi;
