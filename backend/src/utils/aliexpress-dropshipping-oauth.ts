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

  // 2) Railway static public domain (host only in many deployments)
  const railwayStatic = normalizeBaseUrl(process.env.RAILWAY_STATIC_URL || '');
  if (railwayStatic) return railwayStatic;

  // 3) API_URL when configured with public host (not localhost)
  const apiUrl = normalizeBaseUrl(process.env.API_URL || '');
  if (apiUrl && !/localhost|127\.0\.0\.1/i.test(apiUrl)) return apiUrl;

  // 4) Dev fallback only
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:4000';

  throw new Error(
    'BACKEND_URL (or RAILWAY_STATIC_URL) is required in production for AliExpress Dropshipping OAuth callback.'
  );
}

export function getAliExpressDropshippingRedirectUri(): string {
  const backendBaseUrl = getBackendBaseUrl();
  const canonicalRedirect = `${backendBaseUrl}/api/marketplace-oauth/callback`;

  const envRedirect = normalizeUrl(process.env.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI || '');
  if (envRedirect && envRedirect !== canonicalRedirect) {
    console.warn(
      '[AliExpress OAuth] Ignoring ALIEXPRESS_DROPSHIPPING_REDIRECT_URI because it does not match canonical backend callback.',
      {
        configured: envRedirect,
        expected: canonicalRedirect,
      }
    );
  }

  return canonicalRedirect;
}

