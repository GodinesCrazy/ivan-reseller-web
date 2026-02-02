import axios from 'axios';
import { useAuthStore } from '@stores/authStore';
import { API_BASE_URL, API_BASE_HAS_SUFFIX } from '../config/runtime';

// ✅ GO-LIVE: Usar módulo centralizado para API_BASE_URL
const baseHasApiSuffix = API_BASE_HAS_SUFFIX;

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
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

// ✅ FIX DEFINITIVO: Flag global para evitar spam de toasts 502/network
let backendDownToastShown = false;
const BACKEND_DOWN_TOAST_ID = 'backend-down-toast';

api.interceptors.response.use(
  (response) => {
    // Si hay respuesta exitosa, resetear flag (backend está funcionando)
    if (backendDownToastShown) {
      backendDownToastShown = false;
    }
    return response;
  },
  async (error) => {
    console.log('[API]', error.config?.url, error.response?.status);
    // ✅ FIX DEFINITIVO: Distinguir entre errores CORS y errores HTTP reales
    // Si NO hay error.response, puede ser:
    // 1. Error de red (CORS, timeout, DNS, etc.)
    // 2. Error de conexión (backend caído)
    if (!error.response) {
      // Verificar si es un error CORS específico
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        // Puede ser CORS o error de red real (backend caído)
        // ✅ FIX DEFINITIVO: Mostrar UN solo toast informativo si backend está caído
        if (!backendDownToastShown && typeof window !== 'undefined') {
          backendDownToastShown = true;
          toast.error(
            'Backend no disponible. Verifica que Railway esté corriendo y que el proxy de Vercel esté configurado correctamente.',
            {
              id: BACKEND_DOWN_TOAST_ID,
              duration: 8000,
            }
          );
        }
        
        // Log para debugging
        console.error('❌ Network Error (posible CORS o backend caído):', {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          message: error.message,
          code: error.code
        });
        
        // No hacer logout automático por errores de red (puede ser temporal)
        return Promise.reject(error);
      }
      
      // Otros errores de red (timeout, DNS, etc.)
      console.error('❌ Network Error:', error);
      return Promise.reject(error);
    }
    
    // ✅ FIX DEFINITIVO: Manejo robusto de errores HTTP
    // Si llegamos aquí, significa que error.response existe (CORS funcionó)
    const status = error.response.status;
    const message = error.response.data?.error || error.response.data?.message || 'Error desconocido';
    
    // 401: No autorizado - clear local session only (do NOT call logout API to avoid 401→logout→401 loop)
    const requestUrl = String(error.config?.url || '');
    const isLoginRequest = requestUrl.includes('/api/auth/login') || requestUrl.includes('auth/login');
    const isAlreadyOnLogin = typeof window !== 'undefined' && window.location?.pathname === '/login';

    if (status === 401) {
      if (isLoginRequest) {
        return Promise.reject(error);
      }
      useAuthStore.getState().clearSession();
      if (isAlreadyOnLogin) {
        return Promise.reject(error);
      }
      toast.error('Session expired');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    
    // 403: Prohibido (también significa que CORS funcionó)
    if (status === 403) {
      toast.error('No tienes permisos para realizar esta acción.');
      return Promise.reject(error);
    }
    
    // 429: Rate limit
    if (status === 429) {
      toast.error('Demasiadas solicitudes. Por favor, espera un momento.');
      return Promise.reject(error);
    }
    
    // ✅ FIX: Detectar setup_required antes de mostrar error 502
    if (error.response?.data?.setupRequired === true || error.response?.data?.error === 'setup_required') {
      // No mostrar toast, el componente SetupRequired se encargará
      return Promise.reject(error);
    }

    // ✅ FIX DEFINITIVO: 502/503/504 - Backend caído o no disponible
    // Mostrar UN solo toast informativo
    if (status === 502 || status === 503 || status === 504) {
      if (!backendDownToastShown && typeof window !== 'undefined') {
        backendDownToastShown = true;
        toast.error(
          `Backend no disponible (${status}). Verifica que Railway esté corriendo.`,
          {
            id: BACKEND_DOWN_TOAST_ID,
            duration: 8000,
          }
        );
      }
      return Promise.reject(error);
    }
    
    // 5xx: Otros errores del servidor (no 502/503/504)
    if (status >= 500) {
      // Solo mostrar toast si no es 502/503/504 (ya manejados arriba)
      toast.error(`Error del servidor (${status}). Por favor, intenta nuevamente más tarde.`);
      return Promise.reject(error);
    }
    
    // 4xx: Errores del cliente (mostrar mensaje específico si está disponible)
    if (status >= 400 && status < 500) {
      // No mostrar toast aquí, dejar que cada componente maneje su error específico
      return Promise.reject(error);
    }
    
    // Error desconocido
    return Promise.reject(error);
  }
);

export default api;
