/**
 * AliExpress OAuth2: authorization URL, code exchange, token refresh.
 */

import axios from 'axios';
import logger from '../config/logger';
import { getToken, setToken, type TokenData } from './aliexpress-token.store';

const APP_KEY = (process.env.ALIEXPRESS_APP_KEY || '').trim();
const APP_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();
const REDIRECT_URI =
  (process.env.ALIEXPRESS_REDIRECT_URI ||
    process.env.ALIEXPRESS_CALLBACK_URL ||
    process.env.ALIEXPRESS_OAUTH_REDIRECT_URL ||
    '').trim();
const OAUTH_BASE = (process.env.ALIEXPRESS_OAUTH_BASE || 'https://api-sg.aliexpress.com/oauth').replace(/\/$/, '');
const API_BASE = (process.env.ALIEXPRESS_API_BASE || process.env.ALIEXPRESS_API_BASE_URL || 'https://api-sg.aliexpress.com/sync').replace(/\/$/, '');

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
  logger.info('[ALIEXPRESS-OAUTH] Authorization URL generated', { oauthBase: OAUTH_BASE });
  return url;
}

/**
 * Exchange authorization code for access_token and refresh_token.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenData> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET not configured');
  }
  const params = new URLSearchParams({
    method: 'auth.token.create',
    app_key: APP_KEY,
    app_secret: APP_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });
  logger.info('[ALIEXPRESS-OAUTH] Exchanging code for token', { apiBase: API_BASE });
  const response = await axios.post(API_BASE, params.toString(), {
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
  logger.info('[ALIEXPRESS-OAUTH] Refreshing token', { apiBase: API_BASE });
  const response = await axios.post(API_BASE, params.toString(), {
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
