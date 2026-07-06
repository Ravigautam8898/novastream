import axios from 'axios';
import toast from 'react-hot-toast';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

// ── Request Interceptor: Attach JWT token ──
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('novastream_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // FE-004: Only add cache-busting _t param to mutation-sensitive GETs.
    // These are GET requests that must always fetch fresh data because they
    // could be affected by a previous mutation (e.g., user deleted, content updated).
    // Immutable data (images, static config) and read-only endpoints don't need this.
    // Without this filter, EVERY GET is cache-busted, preventing browser caching entirely.
    // config.url in an Axios interceptor is relative to baseURL (/api).
    // So paths like '/favorites' match against config.url = '/favorites',
    // NOT '/api/favorites'. The /api prefix is already in baseURL.
    const cacheBustPaths = [
      '/admin/users',
      '/admin/content',
      '/admin/stats',
      '/homepage/sections',
      '/movies',
      '/series',
      '/trending',
      '/search',
      '/categories/',
      '/progress/',
      '/favorites',
      '/history',
      '/admin/sessions',
      '/admin/security/blocked-ips',
      '/admin/subscriptions/',
    ];
    if (config.method === 'get' && cacheBustPaths.some(p => config.url?.startsWith(p))) {
      config.params = { ...config.params, _t: Date.now() };
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor: Handle errors globally ──
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    if (status === 401) {
      // Token expired or invalid — clear localStorage and emit event
      // for React Router to handle navigation gracefully (no full page reload)
      localStorage.removeItem('novastream_token');
      localStorage.removeItem('novastream_user');

      // Dispatch custom event so React components can navigate without reload
      window.dispatchEvent(new CustomEvent('auth:expired'));
    } else if (status === 403) {
      toast.error('Access denied');
    } else if (status === 429) {
      toast.error('Too many requests. Please slow down.');
    } else if (status >= 500) {
      toast.error('Server error. Please try again later.');
    }

    return Promise.reject(error);
  }
);

export default apiClient;
