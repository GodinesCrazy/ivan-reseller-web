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

// ✅ FASE 6 & 7: Response interceptor - handle errors robustamente
import toast from 'react-hot-toast';

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // ✅ FASE 6: Manejo robusto de errores
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.response.data?.message || 'Error desconocido';
      
      // 401: No autorizado
      if (status === 401) {
        await useAuthStore.getState().logout();
        toast.error('Sesión expirada. Por favor, inicia sesión nuevamente.');
        window.location.href = '/login';
        return Promise.reject(error);
      }
      
      // 403: Prohibido
      if (status === 403) {
        toast.error('No tienes permisos para realizar esta acción.');
        return Promise.reject(error);
      }
      
      // 429: Rate limit
      if (status === 429) {
        toast.error('Demasiadas solicitudes. Por favor, espera un momento.');
        return Promise.reject(error);
      }
      
      // 5xx: Error del servidor
      if (status >= 500) {
        toast.error(`Error del servidor (${status}). Por favor, intenta nuevamente más tarde.`);
        return Promise.reject(error);
      }
      
      // 4xx: Errores del cliente (mostrar mensaje específico si está disponible)
      if (status >= 400 && status < 500) {
        // No mostrar toast aquí, dejar que cada componente maneje su error específico
        return Promise.reject(error);
      }
    }
    
    // ✅ FASE 6: Network errors (sin respuesta del servidor)
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
      toast.error('Error de conexión. Verifica tu conexión a internet.');
      return Promise.reject(error);
    }
    
    // Error desconocido
    return Promise.reject(error);
  }
);

export default api;
