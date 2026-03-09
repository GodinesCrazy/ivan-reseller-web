/**
 * Canonical OAuth redirect URIs for marketplace callbacks.
 * Derives from BACKEND_URL/API_URL when available to ensure consistency.
 */

function getFrontendReturnBaseUrl(): string {
  return (
    process.env.FRONTEND_URL ||
    process.env.WEB_BASE_URL ||
    'https://www.ivanreseller.com'
  ).replace(/\/$/, '');
}

/**
 * Canonical MercadoLibre OAuth redirect URI.
 * Must match exactly what is configured in MercadoLibre Developer Portal.
 * Prefer BACKEND_URL/RAILWAY_STATIC_URL/API_URL when set; else MERCADOLIBRE_REDIRECT_URI; else frontend base.
 */
export function getMercadoLibreRedirectUri(): string {
  const backendUrl = (
    process.env.BACKEND_URL ||
    process.env.RAILWAY_STATIC_URL ||
    process.env.API_URL ||
    ''
  ).replace(/\/$/, '');
  if (backendUrl) {
    return `${backendUrl}/api/marketplace-oauth/oauth/callback/mercadolibre`;
  }
  const explicit = (process.env.MERCADOLIBRE_REDIRECT_URI || process.env.MERCADOLIBRE_REDIRECT_URL || '').trim();
  if (explicit) return explicit;
  return `${getFrontendReturnBaseUrl()}/api/marketplace-oauth/oauth/callback/mercadolibre`;
}
