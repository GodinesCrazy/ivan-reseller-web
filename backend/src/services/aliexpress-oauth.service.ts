/**
 * AliExpress OAuth2: authorization URL, code exchange, token refresh.
 * Uses ALIEXPRESS_REDIRECT_URI only. No placeholders. No localhost fallback.
 * Canonical redirect: https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback
 */

import axios from 'axios';
import logger from '../config/logger';
import { getToken, setToken, type TokenData } from './aliexpress-token.store';

const PLACEHOLDERS = ['PUT_YOUR_APP_KEY_HERE', 'PUT_YOUR_APP_SECRET_HERE'];
function fromEnv(key: string): string {
  const v = (process.env[key] || '').trim();
  return v && !PLACEHOLDERS.includes(v) ? v : '';
}
const APP_KEY = fromEnv('ALIEXPRESS_APP_KEY');
const APP_SECRET = fromEnv('ALIEXPRESS_APP_SECRET');
const REDIRECT_URI = (process.env.ALIEXPRESS_REDIRECT_URI || '').trim();
const OAUTH_BASE = (process.env.ALIEXPRESS_OAUTH_BASE || 'https://api-sg.aliexpress.com/oauth').replace(/\/$/, '');
const API_BASE = (process.env.ALIEXPRESS_API_BASE || process.env.ALIEXPRESS_API_BASE_URL || 'https://api-sg.aliexpress.com/sync').replace(/\/$/, '');
const TOKEN_URL = 'https://api-sg.aliexpress.com/rest/auth/token/security/create';

/**
 * Get authorization URL to start OAuth flow.
 */
export function getAuthorizationUrl(): string {
  if (!APP_KEY) {
    logger.error('[ALIEXPRESS-OAUTH] Missing ALIEXPRESS_APP_KEY');
    throw new Error('ALIEXPRESS_APP_KEY not configured');
  }
  if (!REDIRECT_URI) {
    logger.error('[ALIEXPRESS-OAUTH] Missing ALIEXPRESS_REDIRECT_URI / ALIEXPRESS_CALLBACK_URL');
    throw new Error('Redirect URI not configured');
  }
  const url = `${OAUTH_BASE}/authorize?response_type=code&client_id=${APP_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
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

/**
 * Exchange authorization code for access_token and refresh_token.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenData> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET not configured');
  }
  if (!REDIRECT_URI) {
    throw new Error('ALIEXPRESS_REDIRECT_URI not configured');
  }
  console.log('[ALIEXPRESS-OAUTH] Exchanging code for token');
  const redirectUriExact = REDIRECT_URI.replace(/\/$/, '');
  const bodyParams: Record<string, string> = {
    method: 'auth.token.create',
    grant_type: 'authorization_code',
    code,
    app_key: APP_KEY,
    app_secret: APP_SECRET,
    redirect_uri: redirectUriExact,
  };
  let response;
  try {
    response = await axios.post(TOKEN_URL, new URLSearchParams(bodyParams).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      validateStatus: () => true,
    });
  } catch (err: any) {
    console.log('[ALIEXPRESS-OAUTH] Request failed:', err?.message, err?.response?.data);
    logger.error('[ALIEXPRESS-OAUTH] Network/request error', { message: err?.message, code: err?.code });
    throw err;
  }

  // Deep logging for diagnosis
  const contentType = response.headers?.['content-type'] ?? response.headers?.['Content-Type'] ?? 'unknown';
  const dataType = typeof response.data;
  const rawStr = typeof response.data === 'string'
    ? response.data
    : JSON.stringify(response.data);
  const truncated = rawStr.length > 5000 ? rawStr.substring(0, 5000) + '...[truncated]' : rawStr;

  console.log('[ALIEXPRESS-OAUTH] DIAG response.status:', response.status);
  console.log('[ALIEXPRESS-OAUTH] DIAG response.headers["content-type"]:', contentType);
  console.log('[ALIEXPRESS-OAUTH] DIAG typeof response.data:', dataType);
  console.log('[ALIEXPRESS-OAUTH] RAW TOKEN RESPONSE (max 5000 chars):', truncated);

  if (typeof response.data === 'string') {
    const first2000 = response.data.substring(0, 2000);
    console.log('[ALIEXPRESS-OAUTH] DIAG response.data (first 2000 chars):', first2000);
  }

  const body = response.data;
  const isHtmlMaintenance = typeof body === 'string' && (body.includes('Maintaining') || body.includes('maintenance'));
  if (isHtmlMaintenance) {
    logger.error('[ALIEXPRESS-OAUTH] Token API returned maintenance page', { tokenUrl: TOKEN_URL, status: response.status });
    throw new Error('ALIEXPRESS_TOKEN_API_MAINTENANCE');
  }

  const errMsg = body?.error_msg ?? body?.error_description ?? body?.error ?? body?.msg;
  if (errMsg) {
    logger.error('[ALIEXPRESS-OAUTH] Token API error', { errMsg, body, status: response.status });
    throw new Error(String(errMsg));
  }

  const payload = response.data?.data ?? response.data ?? {};
  if (typeof payload === 'object' && !(payload.access_token || payload.accessToken || payload.token || payload.access_token_info?.access_token)) {
    console.log('[ALIEXPRESS-OAUTH] DIAG object has no access_token - full object:', JSON.stringify(payload, null, 2));
  }

  const access_token =
    payload.access_token ||
    payload.accessToken ||
    payload.token ||
    payload.access_token_info?.access_token;

  if (!access_token) {
    logger.error('[ALIEXPRESS-OAUTH] Token response missing access_token', { body, status: response.status });
    throw new Error('ALIEXPRESS_TOKEN_EXCHANGE_RESPONSE_INVALID');
  }
  const p = typeof payload === 'object' && payload !== null ? payload : {};
  const refresh_token = p.refresh_token ?? p.refreshToken ?? '';
  const expires_in = Number(p.expires_in ?? p.expire_time ?? p.expiresIn ?? 0) || 86400 * 7;
  const expiresAt = Date.now() + expires_in * 1000;
  const tokenData: TokenData = { accessToken: access_token, refreshToken: refresh_token, expiresAt };
  setToken(tokenData);
  console.log('[ALIEXPRESS-OAUTH] TOKEN STORED OK');
  logger.info('[ALIEXPRESS-OAUTH] Tokens stored', { expires_in, expiresAt: new Date(expiresAt).toISOString() });
  return tokenData;
}

/**
 * Refresh access token using refresh_token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET not configured');
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
  logger.info('[ALIEXPRESS-OAUTH] Token refreshed', { expiresAt: new Date(expiresAt).toISOString() });
  return tokenData;
}
