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
const TOKEN_URL = (process.env.ALIEXPRESS_TOKEN_URL || 'https://api.aliexpress.com/rest/auth/token/security/create').replace(/\/$/, '');

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
    throw err;
  }
  const body = response.data;
  console.log('[ALIEXPRESS-OAUTH] RAW TOKEN RESPONSE:', JSON.stringify(body));
  const errMsg = body?.error_msg ?? body?.error_description ?? body?.error ?? body?.msg;
  if (errMsg) {
    logger.error('[ALIEXPRESS-OAUTH] Token API error', { errMsg, body, status: response.status });
    throw new Error(String(errMsg));
  }
  const data = body?.data ?? body?.token_result ?? body;
  const access_token = data?.access_token ?? data?.accessToken ?? body?.access_token ?? body?.accessToken;
  const refresh_token = data?.refresh_token ?? data?.refreshToken ?? body?.refresh_token ?? '';
  const expires_in = Number(data?.expires_in ?? data?.expire_time ?? data?.expiresIn ?? body?.expires_in ?? 0) || 86400 * 7;
  if (!access_token) {
    logger.error('[ALIEXPRESS-OAUTH] Token response missing access_token', { body, status: response.status });
    throw new Error('INVALID_RESPONSE');
  }
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
