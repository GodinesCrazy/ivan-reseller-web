/**
 * AliExpress OAuth2: authorization URL, code exchange, token refresh.
 * Uses ALIEXPRESS_REDIRECT_URI when set; otherwise derives from BACKEND_URL + /api/aliexpress/callback.
 */

import axios from 'axios';
import logger from '../config/logger';
import { getToken, setToken, type TokenData } from './aliexpress-token.store';

const GLOBAL_TOKEN_ID = 'global';

function normalizeBaseUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, '');
}

function getBackendBaseUrl(): string {
  const explicitBackend = normalizeBaseUrl(process.env.BACKEND_URL || process.env.RAILWAY_STATIC_URL || '');
  if (explicitBackend) return explicitBackend;
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:4000';
  throw new Error('BACKEND_URL is required in production for AliExpress Affiliate OAuth callback.');
}

/** Canonical redirect URI for Affiliate (must match app config in AliExpress console). */
export function getAliExpressAffiliateRedirectUri(): string {
  const explicit = (process.env.ALIEXPRESS_REDIRECT_URI || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const base = getBackendBaseUrl();
  return `${base}/api/aliexpress/callback`;
}

async function persistTokenToDatabase(tokenData: TokenData): Promise<void> {
  try {
    const { prisma } = await import('../config/database');
    await prisma.aliExpressToken.upsert({
      where: { id: GLOBAL_TOKEN_ID },
      create: {
        id: GLOBAL_TOKEN_ID,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken || null,
        expiresAt: new Date(tokenData.expiresAt),
      },
      update: {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken || null,
        expiresAt: new Date(tokenData.expiresAt),
      },
    });
  } catch (err: any) {
    logger.error('[ALIEXPRESS-OAUTH] Failed to persist token to DB', { error: err?.message });
  }
}
import {
  generateAliExpressSignatureMD5,
  generateAliExpressSignatureNoSecret,
  generateTokenCreateSignatureHmacSystemInterface,
} from './aliexpress-signature.service';
import { getAliExpressTimestamp } from './aliexpress-time.service';

const PLACEHOLDERS = ['PUT_YOUR_APP_KEY_HERE', 'PUT_YOUR_APP_SECRET_HERE'];
function fromEnv(key: string): string {
  const v = (process.env[key] || '').trim();
  return v && !PLACEHOLDERS.includes(v) ? v : '';
}
const APP_KEY = fromEnv('ALIEXPRESS_AFFILIATE_APP_KEY') || fromEnv('ALIEXPRESS_APP_KEY');
const APP_SECRET = fromEnv('ALIEXPRESS_AFFILIATE_APP_SECRET') || fromEnv('ALIEXPRESS_APP_SECRET');
// OAUTH_BASE: solo la base del path OAuth, sin /authorize (evita duplicado oauth/authorize/authorize)
const _rawOAuthBase = (process.env.ALIEXPRESS_OAUTH_BASE || 'https://api-sg.aliexpress.com/oauth').replace(/\/$/, '');
const OAUTH_BASE = _rawOAuthBase.replace(/\/authorize\/?$/i, '') || 'https://api-sg.aliexpress.com/oauth';
const API_BASE = (process.env.ALIEXPRESS_API_BASE || process.env.ALIEXPRESS_API_BASE_URL || 'https://api-sg.aliexpress.com/sync').replace(/\/$/, '');
const TOKEN_URL = 'https://api-sg.aliexpress.com/rest/auth/token/create';
/** Full REST path (Case-2 plain SHA256 docs, MD5+path reports). */
const TOKEN_SIGN_PATH = '/rest/auth/token/create';
/**
 * HMAC-SHA256 "system interface" path used successfully by Dropshipping OAuth in this codebase.
 * AliExpress verifies against this shorter path, not always the full `/rest/...` URL prefix.
 */
const TOKEN_SIGN_PATH_HMAC = '/auth/token/create';

/**
 * Get authorization URL to start OAuth flow.
 */
export function getAuthorizationUrl(): string {
  if (!APP_KEY) {
    logger.error('[ALIEXPRESS-OAUTH] Missing ALIEXPRESS_AFFILIATE_APP_KEY');
    throw new Error('ALIEXPRESS_AFFILIATE_APP_KEY not configured');
  }
  const redirectUri = getAliExpressAffiliateRedirectUri();
  if (!redirectUri) {
    logger.error('[ALIEXPRESS-OAUTH] Missing ALIEXPRESS_REDIRECT_URI and BACKEND_URL');
    throw new Error('Redirect URI not configured (set ALIEXPRESS_REDIRECT_URI or BACKEND_URL)');
  }
  const url = `${OAUTH_BASE}/authorize?response_type=code&client_id=${APP_KEY}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  console.log('[ALIEXPRESS-OAUTH] Authorization URL:', url);
  logger.info('[ALIEXPRESS-OAUTH] Authorization URL generated', { oauthBase: OAUTH_BASE });
  return url;
}

export function getOAuthStatus(): { hasToken: boolean; expiresAt: string | null; expired: boolean } {
  const tokenData = getToken();
  const hasToken = !!tokenData?.accessToken;
  const expiresAt = tokenData?.expiresAt ? new Date(tokenData.expiresAt).toISOString() : null;
  const expired = tokenData ? tokenData.expiresAt <= Date.now() : true;
  return { hasToken, expiresAt, expired };
}

function redactTokenUrl(url: string): string {
  return url
    .replace(/code=[^&]+/i, 'code=***')
    .replace(/sign=[^&]+/i, 'sign=***');
}

function getAliExpressTopError(body: unknown): { code?: string; msg?: string } | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const er = o.error_response ?? o.errorResponse;
  if (er && typeof er === 'object') {
    const e = er as Record<string, unknown>;
    const code = e.code != null ? String(e.code) : undefined;
    const msg = e.msg != null ? String(e.msg) : e.message != null ? String(e.message) : undefined;
    if (code || msg) return { code, msg };
  }
  if (typeof o.code === 'string' && (o.msg != null || o.message != null)) {
    return { code: o.code, msg: String(o.msg ?? o.message ?? '') };
  }
  return null;
}

function isIncompleteSignatureError(body: unknown): boolean {
  const e = getAliExpressTopError(body);
  if (!e?.code && !e?.msg) return false;
  const c = (e.code || '').toLowerCase();
  const m = (e.msg || '').toLowerCase();
  return c === 'incompletesignature' || c === '15' || m.includes('signature') || m.includes('incompletesignature');
}

/** Flatten TOP-style token responses (token_result, data, etc.). */
function extractTokenPayload(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (typeof o.access_token === 'string' || typeof o.accessToken === 'string') return o;
  const inner = (o.token_result ?? o.data ?? o.token_create_response) as unknown;
  if (inner && typeof inner === 'object') {
    const nested = extractTokenPayload(inner);
    if (nested) return nested;
  }
  return o;
}

/**
 * Exchange authorization code for access_token and refresh_token.
 * Tries AliExpress-compatible signature strategies in order (Dropshipping-parity HMAC first).
 */
export async function exchangeCodeForToken(code: string): Promise<TokenData> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('ALIEXPRESS_AFFILIATE_APP_KEY / ALIEXPRESS_AFFILIATE_APP_SECRET not configured');
  }
  const redirectUri = getAliExpressAffiliateRedirectUri();
  if (!redirectUri) {
    throw new Error('Redirect URI not configured (set ALIEXPRESS_REDIRECT_URI or BACKEND_URL)');
  }
  const redirectUriExact = redirectUri.replace(/\/$/, '');
  try {
    const canonicalRedirectUri = `${getBackendBaseUrl()}/api/aliexpress/callback`;
    if (redirectUriExact !== canonicalRedirectUri && process.env.ALIEXPRESS_REDIRECT_URI) {
      logger.warn('[ALIEXPRESS-OAUTH] Redirect URI mismatch with canonical', {
        configured: redirectUriExact,
        expected: canonicalRedirectUri,
      });
    }
  } catch {
    // BACKEND_URL may be unset when ALIEXPRESS_REDIRECT_URI is used; skip warning
  }

  const trimmedCode = code.trim();
  console.log('[ALIEXPRESS-OAUTH] Exchanging code for token (multi-strategy)');
  logger.info('[ALIEXPRESS-OAUTH] Token exchange starting', { strategies: 'hmac_auth_path_post,hmac_rest_path_post,case2_plain_sha256_get,md5_gmt8_redirect_get' });

  type AttemptResult = { fullUrl: string; response: import('axios').AxiosResponse };
  const attempts: Array<{ name: string; run: () => Promise<AttemptResult> }> = [
    {
      name: 'hmac_sha256_POST_signPath_/auth/token/create',
      run: async () => {
        const params: Record<string, string> = {
          app_key: APP_KEY,
          code: trimmedCode,
          sign_method: 'sha256',
          timestamp: Date.now().toString(),
        };
        const sign = generateTokenCreateSignatureHmacSystemInterface(TOKEN_SIGN_PATH_HMAC, params, APP_SECRET);
        params.sign = sign;
        const qs = new URLSearchParams(params).toString();
        const fullUrl = `${TOKEN_URL}?${qs}`;
        const response = await axios.post(fullUrl, null, {
          timeout: 15000,
          validateStatus: () => true,
          headers: { 'User-Agent': 'Ivan-Reseller/1.0' },
        });
        return { fullUrl, response };
      },
    },
    {
      name: 'hmac_sha256_POST_signPath_/rest/auth/token/create',
      run: async () => {
        const params: Record<string, string> = {
          app_key: APP_KEY,
          code: trimmedCode,
          sign_method: 'sha256',
          timestamp: Date.now().toString(),
        };
        const sign = generateTokenCreateSignatureHmacSystemInterface(TOKEN_SIGN_PATH, params, APP_SECRET);
        params.sign = sign;
        const qs = new URLSearchParams(params).toString();
        const fullUrl = `${TOKEN_URL}?${qs}`;
        const response = await axios.post(fullUrl, null, {
          timeout: 15000,
          validateStatus: () => true,
          headers: { 'User-Agent': 'Ivan-Reseller/1.0' },
        });
        return { fullUrl, response };
      },
    },
    {
      name: 'case2_plain_sha256_GET',
      run: async () => {
        const params: Record<string, string> = {
          app_key: APP_KEY,
          code: trimmedCode,
          sign_method: 'sha256',
          timestamp: Date.now().toString(),
        };
        const signature = generateAliExpressSignatureNoSecret(TOKEN_SIGN_PATH, params);
        const fullUrl =
          TOKEN_URL + '?' + new URLSearchParams({ ...params, sign: signature }).toString();
        const response = await axios.get(fullUrl, { timeout: 15000, validateStatus: () => true });
        return { fullUrl, response };
      },
    },
    {
      name: 'md5_gmt8_GET_with_redirect_uri',
      run: async () => {
        const ts = await getAliExpressTimestamp();
        const paramsSigned: Record<string, string> = {
          app_key: APP_KEY,
          code: trimmedCode,
          sign_method: 'md5',
          timestamp: ts,
        };
        const sign = generateAliExpressSignatureMD5(TOKEN_SIGN_PATH, paramsSigned, APP_SECRET);
        const fullUrl =
          TOKEN_URL +
          '?' +
          new URLSearchParams({
            ...paramsSigned,
            redirect_uri: redirectUriExact,
            sign: sign,
          }).toString();
        const response = await axios.get(fullUrl, { timeout: 15000, validateStatus: () => true });
        return { fullUrl, response };
      },
    },
  ];

  let lastFullUrl = '';
  let lastBody: unknown = null;
  let lastStatus = 0;

  for (const attempt of attempts) {
    let fullUrl = '';
    try {
      const { fullUrl: u, response } = await attempt.run();
      fullUrl = u;
      lastFullUrl = u;
      lastStatus = response.status;
      const body2 = response.data;
      lastBody = body2;

      const rawStr =
        typeof body2 === 'string' ? body2 : JSON.stringify(body2, null, 2);
      console.log(`[ALIEXPRESS-OAUTH] attempt=${attempt.name} status=${response.status} url=${redactTokenUrl(fullUrl)}`);
      logger.info('[ALIEXPRESS-OAUTH] Token attempt', {
        attempt: attempt.name,
        httpStatus: response.status,
        urlRedacted: redactTokenUrl(fullUrl),
      });
      console.log('[ALIEXPRESS] TOKEN RESPONSE RAW (truncated):', rawStr.substring(0, 800));

      const isHtmlMaintenance =
        typeof body2 === 'string' &&
        (body2.includes('Maintaining') || body2.includes('maintenance'));
      if (isHtmlMaintenance) {
        logger.error('[ALIEXPRESS-OAUTH] Token API returned maintenance page', {
          tokenUrl: TOKEN_URL,
          status: response.status,
        });
        throw new Error('ALIEXPRESS_TOKEN_API_MAINTENANCE');
      }

      if (isIncompleteSignatureError(body2)) {
        logger.warn('[ALIEXPRESS-OAUTH] IncompleteSignature, trying next strategy', {
          attempt: attempt.name,
          aliError: getAliExpressTopError(body2),
        });
        continue;
      }

      const tokenPayload = extractTokenPayload(body2);
      const hasAccessToken = Boolean(
        tokenPayload &&
          (typeof tokenPayload.access_token === 'string' || typeof tokenPayload.accessToken === 'string')
      );

      const topErr = getAliExpressTopError(body2);
      if (topErr && !hasAccessToken) {
        const errMsg = topErr.msg || topErr.code || 'AliExpress error';
        logger.error('[ALIEXPRESS-OAUTH] Token API top-level error', {
          attempt: attempt.name,
          errMsg,
          body: body2,
          status: response.status,
        });
        const err = new Error(String(errMsg)) as Error & {
          aliExpressResponse?: unknown;
          tokenRequestUrl?: string;
        };
        err.aliExpressResponse = body2;
        err.tokenRequestUrl = fullUrl;
        throw err;
      }

      const payload = tokenPayload ?? {};
      const access_token =
        (typeof payload.access_token === 'string' ? payload.access_token : null) ||
        (typeof payload.accessToken === 'string' ? payload.accessToken : null) ||
        (typeof (payload as any).token === 'string' ? (payload as any).token : null) ||
        (payload as any).access_token_info?.access_token;

      if (!access_token) {
        logger.warn('[ALIEXPRESS-OAUTH] No access_token in this attempt', { attempt: attempt.name });
        continue;
      }

      const fullResponse =
        typeof response.data === 'object' && response.data !== null ? response.data : {};
      const p = payload;
      const refresh_token =
        p.refresh_token ??
        p.refreshToken ??
        (fullResponse as any).refresh_token ??
        (fullResponse as any).refreshToken ??
        '';
      const expires_in =
        Number(
          p.expires_in ??
            p.expire_time ??
            p.expiresIn ??
            (fullResponse as any).expires_in ??
            (fullResponse as any).expire_time ??
            0
        ) || 86400 * 7;

      const expiresAt = Date.now() + expires_in * 1000;
      const tokenData: TokenData = {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
      };

      logger.info('[ALIEXPRESS-OAUTH] Token exchange succeeded', {
        attempt: attempt.name,
        expires_in,
        hasRefreshToken: !!refresh_token,
      });

      setToken(tokenData);
      await persistTokenToDatabase(tokenData);
      try {
        const { clearAliExpressTokenCache } = await import('./credentials-manager.service');
        clearAliExpressTokenCache();
      } catch {
        // ignore
      }
      console.log('[ALIEXPRESS-OAUTH] TOKEN STORED OK (memory + DB)', { strategy: attempt.name });
      console.log(
        '[ALIEXPRESS-OAUTH] Access token (masked):',
        access_token.substring(0, 10) + '...' + access_token.slice(-6)
      );
      return tokenData;
    } catch (e: any) {
      if (e?.message === 'ALIEXPRESS_TOKEN_API_MAINTENANCE') throw e;
      logger.warn('[ALIEXPRESS-OAUTH] Attempt threw', {
        attempt: attempt.name,
        error: e?.message || String(e),
      });
      if (fullUrl) lastFullUrl = fullUrl;
    }
  }

  logger.error('[ALIEXPRESS-OAUTH] All token exchange strategies failed', {
    lastStatus,
    lastBody: typeof lastBody === 'string' ? lastBody.substring(0, 500) : lastBody,
  });
  const err = new Error('ALIEXPRESS_TOKEN_EMPTY_RESPONSE') as Error & {
    aliExpressResponse?: unknown;
    tokenRequestUrl?: string;
  };
  err.aliExpressResponse = lastBody;
  err.tokenRequestUrl = lastFullUrl;
  throw err;
}

/** Alias for exchangeCodeForToken. */
export const exchangeAuthorizationCode = exchangeCodeForToken;

/**
 * Refresh access token using refresh_token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('ALIEXPRESS_AFFILIATE_APP_KEY / ALIEXPRESS_AFFILIATE_APP_SECRET not configured');
  }
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: APP_KEY,
    client_secret: APP_SECRET,
  });
  logger.info('[ALIEXPRESS-OAUTH] Refreshing token', { tokenUrl: TOKEN_URL });
  const response = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  const body = response.data;
  const data = body?.data ?? body;
  const access_token = data?.access_token;
  const new_refresh = data?.refresh_token ?? refreshToken;
  const expires_in = Number(data?.expires_in ?? data?.expire_time ?? 0) || 86400 * 7;
  if (!access_token) {
    logger.error('[ALIEXPRESS-OAUTH] Refresh response missing access_token', { body });
    throw new Error('REFRESH_FAILED');
  }
  const expiresAt = Date.now() + expires_in * 1000;
  const tokenData: TokenData = { accessToken: access_token, refreshToken: new_refresh, expiresAt };
  setToken(tokenData);
  await persistTokenToDatabase(tokenData);
  try {
    const { clearAliExpressTokenCache } = await import('./credentials-manager.service');
    clearAliExpressTokenCache();
  } catch {
    // ignore
  }
  logger.info('[ALIEXPRESS-OAUTH] Token refreshed and persisted to DB', { expiresAt: new Date(expiresAt).toISOString() });
  return tokenData;
}
