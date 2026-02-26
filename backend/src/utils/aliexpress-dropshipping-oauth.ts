/**
 * Canonical OAuth helpers for AliExpress Dropshipping.
 * Keep one single redirect_uri for auth URL and token exchange.
 */

function normalizeBaseUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, '');
}

function normalizeUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, '');
}

function getBackendBaseUrl(): string {
  // 1) Explicit backend URL configured by ops (preferred)
  const explicitBackend = normalizeBaseUrl(process.env.BACKEND_URL || '');
  if (explicitBackend) return explicitBackend;

  // 2) Dev fallback only
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:4000';

  throw new Error('BACKEND_URL is required in production for AliExpress Dropshipping OAuth callback.');
}

export function getAliExpressDropshippingRedirectUri(): string {
  let resolvedRedirectUri = normalizeUrl(process.env.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI || '');
  if (resolvedRedirectUri) return resolvedRedirectUri;

  const backendBaseUrl = getBackendBaseUrl();
  resolvedRedirectUri = `${backendBaseUrl}/api/marketplace-oauth/callback`;

  if (process.env.NODE_ENV === 'production' && !resolvedRedirectUri) {
    throw new Error('Missing canonical redirect URI in production');
  }

  return resolvedRedirectUri;
}

