/**
 * ✅ GO-LIVE: Runtime Configuration Module
 * 
 * Centraliza la configuración de runtime del frontend.
 * Valida variables de entorno críticas y proporciona valores normalizados.
 */

const isProduction = import.meta.env.PROD;
const isDevelopment = import.meta.env.DEV;

/**
 * Obtiene y normaliza la URL base de la API
 * - Elimina trailing slashes
 * - En producción sin VITE_API_URL: usa "/api" (proxy de Vercel)
 * - Proporciona fallback seguro en desarrollo
 */
export function getApiBaseUrl(): string {
  const rawUrl = import.meta.env.VITE_API_URL?.trim();
  
  // En desarrollo, permitir fallback a localhost
  if (!rawUrl && isDevelopment) {
    console.warn('⚠️  VITE_API_URL no configurada, usando fallback: http://localhost:3000');
    return 'http://localhost:3000';
  }
  
  // En producción sin VITE_API_URL: usar "/api" (proxy de Vercel)
  if (!rawUrl && isProduction) {
    console.warn('⚠️  VITE_API_URL no configurada, usando fallback: /api (proxy de Vercel)');
    // Mostrar warning informativo (no error crítico)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('api-config-warning', { 
        detail: { 
          message: 'VITE_API_URL no configurada',
          usingFallback: true,
          fallbackUrl: '/api'
        } 
      }));
    }
    return '/api';
  }
  
  // Normalizar: eliminar trailing slashes
  const normalized = rawUrl!.replace(/\/+$/, '');
  
  // Si es una ruta relativa (empieza con /), usarla directamente (proxy)
  if (normalized.startsWith('/')) {
    return normalized;
  }
  
  // Validar formato básico para URLs absolutas
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    const error = `❌ CRITICAL: VITE_API_URL tiene formato inválido: ${normalized}`;
    console.error(error);
    throw new Error(error);
  }
  
  return normalized;
}

/**
 * URL base de la API (normalizada, sin trailing slash)
 */
export const API_BASE_URL = getApiBaseUrl();

/**
 * Verifica si la URL base tiene el sufijo /api
 * Útil para normalizar rutas que ya incluyen /api
 */
export const API_BASE_HAS_SUFFIX = /\/api$/i.test(API_BASE_URL);

/**
 * Nivel de logging del frontend
 */
export const LOG_LEVEL = (import.meta.env.VITE_LOG_LEVEL || 'warn').toLowerCase();

/**
 * Información de diagnóstico (para página de diagnostics)
 */
export function getDiagnosticsInfo() {
  return {
    apiBaseUrl: API_BASE_URL,
    apiBaseHasSuffix: API_BASE_HAS_SUFFIX,
    logLevel: LOG_LEVEL,
    isProduction,
    isDevelopment,
    windowOrigin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
  };
}

