import apiClient from './client';

export const historyApi = {
  /** Get paginated watch history */
  getHistory: (page = 1, limit = 20) =>
    apiClient.get('/history', { params: { page, limit } }).then(r => r.data),

  /** Get last 5 watched items (lightweight) */
  getRecentHistory: () =>
    apiClient.get('/history/recent').then(r => r.data.data),

  /** Clear all watch history, or a single item if contentId provided */
  clearHistory: (contentId) =>
    apiClient.delete('/history', { data: { contentId } }).then(r => r.data.data),
};

export default historyApi;
