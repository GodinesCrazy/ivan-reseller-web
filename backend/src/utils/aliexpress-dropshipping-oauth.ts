/**
 * Canonical OAuth helpers for AliExpress Dropshipping.
 * Keep one single redirect_uri for auth URL and token exchange.
 */

export function getAliExpressDropshippingRedirectUri(): string {
  const envRedirect = (process.env.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI || '').trim();
  if (envRedirect) return envRedirect.replace(/\/$/, '');

  const webBaseUrl = (
    process.env.WEB_BASE_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://www.ivanreseller.com' : 'http://localhost:5173')
  ).replace(/\/$/, '');

  return `${webBaseUrl}/api/marketplace-oauth/callback`;
}

