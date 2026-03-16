/**
 * ✅ GO-LIVE: Runtime Configuration Module
 * 
 * Centraliza la configuración de runtime del frontend.
 * Valida variables de entorno críticas y proporciona valores normalizados.
 */

export const isProduction = import.meta.env.PROD;
export const isDevelopment = import.meta.env.DEV;

/**
 * Obtiene y normaliza la URL base de la API (deployment automation).
 * - Producción en ivanreseller.com / www: SIEMPRE "/api" (proxy Vercel → Railway).
 * - Si no: VITE_API_URL si está definida (relativa o absoluta).
 * - Si no: vercel.app → "/api"; desarrollo → localhost; producción → "/api".
 */
export function getApiBaseUrl(): string {
  const hostname = typeof window !== 'undefined' ? window.location?.hostname : '';

  // Producción en dominio propio: forzar proxy (evita VITE_API_URL incorrecta en Vercel)
  if (hostname === 'ivanreseller.com' || hostname === 'www.ivanreseller.com') {
    return '/api';
  }

  const rawUrl = import.meta.env.VITE_API_URL?.trim();
  if (rawUrl) {
    const normalized = rawUrl.replace(/\/+$/, '');
    if (normalized.startsWith('/')) return normalized;
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
    console.warn('⚠️  VITE_API_URL formato inválido, usando default');
  }

  if (hostname.includes('vercel.app')) return '/api';
  if (isDevelopment) {
    console.warn('⚠️  VITE_API_URL no configurada, usando fallback: http://localhost:4000');
    return 'http://localhost:4000';
  }
  return '/api';
}

/**
 * URL base de la API (normalizada, sin trailing slash)
 */
export const API_BASE_URL = getApiBaseUrl();

/**
 * Obtiene la URL y opciones para Socket.IO.
 * Vercel no soporta WebSocket proxying; en producción con proxy /api usamos path
 * /api/socket.io para que el rewrite envíe al backend. Si VITE_SOCKET_URL está
 * definida, conectamos directamente al backend (evita proxy).
 */
export function getSocketOptions(): { url: string; path: string } {
  const socketUrl = import.meta.env.VITE_SOCKET_URL?.trim();
  if (socketUrl) {
    return { url: socketUrl.replace(/\/+$/, ''), path: '/socket.io' };
  }
  if (API_BASE_URL.startsWith('/')) {
    // Misma origin; path /api/socket.io para que el rewrite de Vercel lo envíe al backend
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return { url: origin, path: '/api/socket.io' };
  }
  return { url: API_BASE_URL, path: '/socket.io' };
}

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
  const socketOpts = getSocketOptions();
  return {
    apiBaseUrl: API_BASE_URL,
    apiBaseHasSuffix: API_BASE_HAS_SUFFIX,
    socketUrl: socketOpts.url || '(same-origin)',
    socketPath: socketOpts.path,
    logLevel: LOG_LEVEL,
    isProduction,
    isDevelopment,
    windowOrigin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
  };
}

