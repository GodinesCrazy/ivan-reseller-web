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
 * - En producción: SIEMPRE usa "/api" (proxy de Vercel) para evitar CORS
 * - En desarrollo: permite VITE_API_URL o fallback a localhost
 * - Elimina trailing slashes
 */
export function getApiBaseUrl(): string {
  // ✅ PRODUCTION FIX: En producción, SIEMPRE usar /api (proxy de Vercel)
  // Esto evita problemas de CORS y asegura que todas las requests pasen por el proxy
  if (isProduction) {
    // Si VITE_API_URL está configurada pero no es una ruta relativa, ignorarla y usar /api
    const rawUrl = import.meta.env.VITE_API_URL?.trim();
    if (rawUrl && rawUrl.startsWith('/')) {
      // Si es una ruta relativa, usarla (ej: /api)
      return rawUrl.replace(/\/+$/, '');
    }
    // En producción, forzar uso de /api (proxy de Vercel)
    console.info('ℹ️  Producción: usando /api (proxy de Vercel) para evitar CORS');
    return '/api';
  }
  
  // En desarrollo, permitir VITE_API_URL o fallback a localhost
  const rawUrl = import.meta.env.VITE_API_URL?.trim();
  
  if (!rawUrl && isDevelopment) {
    console.warn('⚠️  VITE_API_URL no configurada, usando fallback: http://localhost:3000');
    return 'http://localhost:3000';
  }
  
  // Normalizar: eliminar trailing slashes
  const normalized = rawUrl!.replace(/\/+$/, '');
  
  // Si es una ruta relativa (empieza con /), usarla directamente (proxy)
  if (normalized.startsWith('/')) {
    return normalized;
  }
  
  // Validar formato básico para URLs absolutas (solo en desarrollo)
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

