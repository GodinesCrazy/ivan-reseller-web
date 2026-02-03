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
  const last4 = APP_KEY.length >= 4 ? APP_KEY.slice(-4) : '****';
  console.log('[ALIEXPRESS-OAUTH] Using client_id: ****' + last4);
  logger.info('[ALIEXPRESS-OAUTH] Authorization URL generated', { oauthBase: OAUTH_BASE, clientIdLast4: last4 });
  const url = `${OAUTH_BASE}/authorize?response_type=code&client_id=${APP_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
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
  const params = new URLSearchParams({
    method: 'auth.token.create',
    app_key: APP_KEY,
    app_secret: APP_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });
  logger.info('[ALIEXPRESS-OAUTH] Exchanging code for token', { tokenUrl: TOKEN_URL });
  const response = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  const body = response.data;
  const data = body?.data ?? body;
  const access_token = data?.access_token;
  const refresh_token = data?.refresh_token ?? '';
  const expires_in = Number(data?.expires_in ?? data?.expire_time ?? 0) || 86400 * 7; // default 7 days
  if (!access_token) {
    logger.error('[ALIEXPRESS-OAUTH] Token response missing access_token', { body });
    throw new Error('INVALID_RESPONSE');
  }
  const expiresAt = Date.now() + expires_in * 1000;
  const tokenData: TokenData = { accessToken: access_token, refreshToken: refresh_token, expiresAt };
  setToken(tokenData);
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
    method: 'auth.token.refresh',
    app_key: APP_KEY,
    app_secret: APP_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
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
