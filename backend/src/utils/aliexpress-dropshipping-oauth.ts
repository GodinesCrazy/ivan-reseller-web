/**
 * Canonical OAuth helpers for AliExpress Dropshipping.
 * Keep one single redirect_uri for auth URL and token exchange.
 * Per plan: strict normalization (https, no trailing slash, canonical domain without www).
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

/**
 * Normalize redirect_uri for AliExpress:
 * - Force https (never http in production)
 * - Remove trailing slash
 * - Use canonical domain (remove www. for ivanreseller.com)
 */
function normalizeRedirectUri(value: string): string {
  let out = normalizeUrl(value);
  if (!out) return '';
  try {
    const u = new URL(out);
    u.protocol = 'https:';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    out = u.toString().replace(/\/$/, '');
    if (u.hostname.toLowerCase() === 'www.ivanreseller.com') {
      out = out.replace(/^https:\/\/www\.ivanreseller\.com/i, 'https://ivanreseller.com');
    }
  } catch {
    // fallback: basic trim
  }
  return out;
}

function getBackendBaseUrl(): string {
  // 1) Explicit backend URL configured by ops (preferred)
  const explicitBackend = normalizeBaseUrl(process.env.BACKEND_URL || '');
  if (explicitBackend) return explicitBackend;

  // 2) Dev fallback only
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:4000';

  throw new Error('BACKEND_URL is required in production for AliExpress Dropshipping OAuth callback.');
}

/** Production fallback canonical redirect URI for ivanreseller.com */
const PRODUCTION_FALLBACK_REDIRECT_URI = 'https://ivanreseller.com/api/marketplace-oauth/callback';

export function getAliExpressDropshippingRedirectUri(): string {
  const envUri = (
    process.env.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI ||
    process.env.ALIEXPRESS_DROPSHIPPING_REDIRECT_URT ||
    ''
  ).trim();
  if (envUri) {
    return normalizeRedirectUri(envUri);
  }

  if (process.env.NODE_ENV === 'production') {
    return PRODUCTION_FALLBACK_REDIRECT_URI;
  }

  const backendBaseUrl = getBackendBaseUrl();
  return normalizeRedirectUri(`${backendBaseUrl}/api/marketplace-oauth/callback`);
}

/**
 * Instructions for AliExpress Developer Console configuration.
 * Shown when token exchange fails with IncompleteSignature.
 */
export function getAliExpressRedirectUriInstructions(): string {
  const canonical = getAliExpressDropshippingRedirectUri();
  return `Para resolver IncompleteSignature:
1. Entra en AliExpress Open Platform → My Apps → Tu app Dropshipping.
2. En "OAuth Redirect URL" / "Redirect URI", configura EXACTAMENTE:
   ${canonical}
3. Copia la URL exacta que aparece arriba. Pégala en AliExpress sin modificar. No uses www, ni barra final.
4. Sin espacios, con https, sin barra final.
5. Si usas otro dominio (ej. www.ivanreseller.com), la URL debe coincidir con la que ve el usuario al autorizar.`;
}

