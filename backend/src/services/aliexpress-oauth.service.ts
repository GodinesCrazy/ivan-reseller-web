/**
 * AliExpress OAuth2: authorization URL, code exchange, token refresh.
 * Uses ALIEXPRESS_REDIRECT_URI only. No placeholders. No localhost fallback.
 * Canonical redirect: https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback
 */

import axios from 'axios';
import logger from '../config/logger';
import { getToken, setToken, type TokenData } from './aliexpress-token.store';
import { generateAliExpressSignatureWithSecret } from './aliexpress-signature.service';

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
const TOKEN_URL = 'https://api-sg.aliexpress.com/rest/auth/token/create';
/** api_path for signature must match endpoint path exactly (including /rest). */
const TOKEN_SIGN_PATH = '/rest/auth/token/create';

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
 * Uses GET request with signature according to Case 2: System Interfaces.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenData> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET not configured');
  }
  if (!REDIRECT_URI) {
    throw new Error('ALIEXPRESS_REDIRECT_URI not configured');
  }
  
  // STRICT: Verify redirect URI matches exactly (no trailing slash, exact match)
  const canonicalRedirectUri = 'https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback';
  const redirectUriExact = REDIRECT_URI.replace(/\/$/, '');
  
  if (redirectUriExact !== canonicalRedirectUri) {
    console.warn('[ALIEXPRESS-OAUTH] Redirect URI mismatch:', {
      configured: redirectUriExact,
      expected: canonicalRedirectUri,
    });
    // Use configured URI but log warning
  }
  
  console.log('[ALIEXPRESS-OAUTH] Exchanging code for token');
  const params: Record<string, string> = {
    app_key: APP_KEY,
    code: code,
    sign_method: 'sha256',
    timestamp: Date.now().toString(),
    redirect_uri: redirectUriExact,
  };
  const signature = generateAliExpressSignatureWithSecret(TOKEN_SIGN_PATH, params, APP_SECRET);
  const fullUrl =
    TOKEN_URL +
    '?' +
    new URLSearchParams({
      ...params,
      sign: signature,
    }).toString();
  console.log('TOKEN REQUEST URL:', fullUrl);

  const response = await axios.get(fullUrl, { timeout: 15000, validateStatus: () => true });
  const body2 = response.data;

  const rawStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
  console.log('[ALIEXPRESS] TOKEN RESPONSE RAW:', rawStr);
  console.log('[ALIEXPRESS] TOKEN HTTP STATUS:', response.status);

  const hasAccessToken = body2?.access_token ?? body2?.accessToken ?? body2?.data?.access_token;
  if (!hasAccessToken) {
    console.error('TOKEN FAILED — EXACT VALUES FOR DEBUG:');
    console.error('TOKEN REQUEST URL (full):', fullUrl);
    console.error('API RESPONSE:', rawStr);
  }
  const isHtmlMaintenance = typeof body2 === 'string' && (body2.includes('Maintaining') || body2.includes('maintenance'));
  if (isHtmlMaintenance) {
    logger.error('[ALIEXPRESS-OAUTH] Token API returned maintenance page', { tokenUrl: TOKEN_URL, status: response.status });
    throw new Error('ALIEXPRESS_TOKEN_API_MAINTENANCE');
  }

  const errMsg = body2?.error_msg ?? body2?.error_description ?? body2?.error ?? body2?.msg;
  if (errMsg && !(body2?.access_token || body2?.accessToken)) {
    logger.error('[ALIEXPRESS-OAUTH] Token API error', { errMsg, body: body2, status: response.status });
    throw new Error(String(errMsg));
  }

  const payload = response.data?.data ?? response.data ?? {};
  if (typeof payload === 'object' && !(payload.access_token || payload.accessToken || payload.token || payload.access_token_info?.access_token)) {
    console.log('[ALIEXPRESS-OAUTH] DIAG object has no access_token - full object:', JSON.stringify(payload, null, 2));
  }

  // Extract access_token from response
  // Response format: { access_token, refresh_token, expires_in } or nested in data
  const access_token =
    payload.access_token ||
    payload.accessToken ||
    payload.token ||
    payload.access_token_info?.access_token ||
    response.data?.access_token ||
    response.data?.accessToken;

  if (!access_token) {
    logger.error('[ALIEXPRESS-OAUTH] Token response missing access_token', {
      body: body2,
      status: response.status,
      responseData: JSON.stringify(response.data).substring(0, 500),
    });
    const err = new Error('ALIEXPRESS_TOKEN_EMPTY_RESPONSE') as Error & { aliExpressResponse?: unknown; tokenRequestUrl?: string };
    err.aliExpressResponse = body2;
    err.tokenRequestUrl = fullUrl;
    throw err;
  }
  
  const p = typeof payload === 'object' && payload !== null ? payload : {};
  const fullResponse = typeof response.data === 'object' && response.data !== null ? response.data : {};
  
  const refresh_token = 
    p.refresh_token ?? 
    p.refreshToken ?? 
    fullResponse.refresh_token ?? 
    fullResponse.refreshToken ?? 
    '';
  
  const expires_in = Number(
    p.expires_in ?? 
    p.expire_time ?? 
    p.expiresIn ?? 
    fullResponse.expires_in ?? 
    fullResponse.expire_time ?? 
    0
  ) || 86400 * 7; // Default 7 days
  
  const expiresAt = Date.now() + expires_in * 1000;
  const tokenData: TokenData = { 
    accessToken: access_token, 
    refreshToken: refresh_token, 
    expiresAt 
  };
  
  setToken(tokenData);
  console.log('[ALIEXPRESS-OAUTH] TOKEN STORED OK');
  console.log('[ALIEXPRESS-OAUTH] Access token (masked):', access_token.substring(0, 10) + '...' + access_token.slice(-6));
  logger.info('[ALIEXPRESS-OAUTH] Tokens stored', { 
    expires_in, 
    expiresAt: new Date(expiresAt).toISOString(),
    hasRefreshToken: !!refresh_token,
  });
  return tokenData;
}

/** Alias for exchangeCodeForToken. */
export const exchangeAuthorizationCode = exchangeCodeForToken;

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
