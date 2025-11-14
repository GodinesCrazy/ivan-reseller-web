import axios from 'axios';
import { useAuthStore } from '@stores/authStore';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const baseHasApiSuffix = /\/api$/i.test(API_URL);

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enviar cookies automáticamente (necesario para httpOnly cookies)
});

// Request interceptor - cookies se envían automáticamente con withCredentials
// Si las cookies no funcionan (Safari iOS), usamos el token de localStorage
api.interceptors.request.use(
  (config) => {
    // Intentar obtener token de localStorage primero (fallback para Safari iOS)
    let token = localStorage.getItem('auth_token');
    
    // Si no hay token en localStorage, intentar del store (compatibilidad)
    if (!token) {
      token = useAuthStore.getState().token;
    }
    
    // Si hay token, agregarlo al header Authorization (fallback cuando cookies no funcionan)
    if (token && token !== 'cookie') {
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
  async (error) => {
    if (error.response?.status === 401) {
      // Logout asíncrono para limpiar la cookie
      await useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
