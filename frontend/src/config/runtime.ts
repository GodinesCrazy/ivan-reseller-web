/**
 * ✅ GO-LIVE: Runtime Configuration Module
 * 
 * Centraliza la configuración de runtime del frontend.
 * Valida variables de entorno críticas y proporciona valores normalizados.
 */

export const isProduction = import.meta.env.PROD;
export const isDevelopment = import.meta.env.DEV;

/**
 * Obtiene y normaliza la URL base de la API
 * - En producción: SIEMPRE usa "/api" (proxy de Vercel) para evitar CORS
 * - En desarrollo: permite VITE_API_URL o fallback a localhost
 * - Elimina trailing slashes
 * 
 * ✅ FIX DEFINITIVO: En producción, IGNORA cualquier VITE_API_URL absoluta
 * y SIEMPRE usa "/api" para forzar el proxy de Vercel (same-origin).
 */
export function getApiBaseUrl(): string {
  // ✅ FIX DEFINITIVO: En producción, SIEMPRE usar /api (proxy de Vercel)
  // IGNORAR cualquier VITE_API_URL absoluta para evitar CORS
  if (isProduction) {
    const rawUrl = import.meta.env.VITE_API_URL?.trim();
    
    // Si VITE_API_URL está configurada y es una ruta relativa (ej: /api), usarla
    if (rawUrl && rawUrl.startsWith('/')) {
      return rawUrl.replace(/\/+$/, '');
    }
    
    // Si VITE_API_URL está configurada pero es absoluta (https://...), IGNORARLA
    // ✅ FIX: Eliminar warning en producción (ya está manejado correctamente)
    // No mostrar warning para evitar confusión - el sistema funciona correctamente con /api
    if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
      // Silenciosamente ignorar - no mostrar warning
    }
    
    // En producción, SIEMPRE usar /api (proxy de Vercel)
    return '/api';
  }
  
  // En desarrollo, permitir VITE_API_URL o fallback a localhost
  const rawUrl = import.meta.env.VITE_API_URL?.trim();
  
  if (!rawUrl && isDevelopment) {
    console.warn('⚠️  VITE_API_URL no configurada, usando fallback: http://localhost:4000');
    return 'http://localhost:4000';
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

