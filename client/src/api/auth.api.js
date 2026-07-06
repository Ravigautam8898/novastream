import apiClient from './client';

export const authApi = {
  login: async (username, password) => {
    const { data } = await apiClient.post('/auth/login', { username, password });
    return data.data;
  },

  logout: async () => {
    const { data } = await apiClient.post('/auth/logout');
    return data;
  },

  verify: async () => {
    const { data } = await apiClient.get('/auth/verify');
    return data.data;
  },

  refresh: async () => {
    const { data } = await apiClient.post('/auth/refresh');
    return data.data;
  },
};
