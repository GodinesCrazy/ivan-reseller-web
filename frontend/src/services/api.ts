import axios from 'axios';
import { useAuthStore } from '@stores/authStore';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const baseHasApiSuffix = /\/api$/i.test(API_URL);

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.url) {
      if (baseHasApiSuffix && config.url.startsWith('/api/')) {
        config.url = config.url.replace(/^\/api\//, '/');
      } else if (baseHasApiSuffix && config.url === '/api') {
        config.url = '/';
      }

      if (!config.url.startsWith('/') && !/^https?:\/\//i.test(config.url)) {
        config.url = `/${config.url}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
