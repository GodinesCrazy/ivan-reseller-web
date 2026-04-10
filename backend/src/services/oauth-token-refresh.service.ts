/**
 * OAuth Token Refresh Service — proactive, centralized
 *
 * Refresca silenciosamente los tokens de ML, eBay y AliExpress antes de que
 * expiren. Se invoca:
 *   1. Al arrancar el servidor (app.ts) — una sola vez
 *   2. Por el BullMQ job 'oauth-token-refresh' cada 30 minutos
 *   3. Vía POST /api/auth/refresh-all desde el frontend al cargar la app
 *
 * Reglas por plataforma:
 *   - ML:   access_token dura 6h. Refrescar si faltan < 90min. Persistir en DB.
 *   - eBay: access_token dura 2h. Refrescar si faltan < 30min. Persistir en DB.
 *   - AliExpress: manejado por aliexpress-token.store + aliexpress-oauth.service (propio job).
 *   - PayPal: client_credentials, sin refresh_token — auto-renovado on-demand.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { decrypt, encrypt } from '../utils/encryption';

export interface TokenRefreshResult {
  platform: string;
  refreshed: boolean;
  reason: string;
  expiresAt?: string;
  error?: string;
}

export interface OAuthRefreshSummary {
  at: string;
  results: TokenRefreshResult[];
  refreshedCount: number;
  skippedCount: number;
  errorCount: number;
}

// ─── Mercado Libre ────────────────────────────────────────────────────────────

const ML_REFRESH_THRESHOLD_MS = 90 * 60 * 1000; // 90 minutos antes de expirar

async function refreshMercadoLibreTokens(): Promise<TokenRefreshResult[]> {
  const results: TokenRefreshResult[] = [];

  const rows = await prisma.apiCredential.findMany({
    where: { apiName: 'mercadolibre', isActive: true },
  });

  for (const row of rows) {
    const tag = `ML userId=${row.userId} env=${row.environment}`;
    try {
      const raw = decrypt(row.credentials);
      const creds = JSON.parse(raw) as Record<string, any>;

      if (!creds?.accessToken || !creds?.refreshToken) {
        results.push({ platform: tag, refreshed: false, reason: 'missing_tokens' });
        continue;
      }

      // Check expiry
      const expiresAt = creds.expiresAt ? new Date(creds.expiresAt).getTime() : null;
      const timeLeft = expiresAt ? expiresAt - Date.now() : null;

      if (timeLeft !== null && timeLeft > ML_REFRESH_THRESHOLD_MS) {
        results.push({
          platform: tag,
          refreshed: false,
          reason: 'token_still_valid',
          expiresAt: new Date(expiresAt!).toISOString(),
        });
        continue;
      }

      logger.info('[OAUTH-REFRESH] ML token expiring or unknown expiry — refreshing', {
        tag,
        timeLeftMin: timeLeft ? Math.round(timeLeft / 60000) : 'unknown',
      });

      // Call ML OAuth refresh
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', creds.clientId || creds.client_id || '');
      params.append('client_secret', creds.clientSecret || creds.client_secret || '');
      params.append('refresh_token', creds.refreshToken);

      const baseUrl =
        row.environment === 'sandbox'
          ? 'https://api.mercadolibre.com'
          : 'https://api.mercadolibre.com';

      const { default: axios } = await import('axios');
      const resp = await axios.post(`${baseUrl}/oauth/token`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      const newAccessToken: string = resp.data.access_token;
      const expiresIn: number = resp.data.expires_in || 21600; // ML default 6h
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

      // Persist refreshed token
      const updated = {
        ...creds,
        accessToken: newAccessToken,
        access_token: newAccessToken,
        expiresAt: newExpiresAt.toISOString(),
        // ML may issue a new refresh_token — keep it if returned
        refreshToken: resp.data.refresh_token || creds.refreshToken,
      };

      await prisma.apiCredential.update({
        where: { id: row.id },
        data: { credentials: encrypt(JSON.stringify(updated)), updatedAt: new Date() },
      });

      // Clear in-memory cache so next call uses fresh token
      const { clearCredentialsCache } = await import('./credentials-manager.service');
      clearCredentialsCache(row.userId, 'mercadolibre', row.environment);

      logger.info('[OAUTH-REFRESH] ML token refreshed successfully', {
        tag,
        expiresAt: newExpiresAt.toISOString(),
      });

      results.push({
        platform: tag,
        refreshed: true,
        reason: 'refreshed',
        expiresAt: newExpiresAt.toISOString(),
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || String(err);
      logger.warn('[OAUTH-REFRESH] ML token refresh failed', { tag, error: msg });
      results.push({ platform: tag, refreshed: false, reason: 'error', error: msg });
    }
  }

  return results;
}

// ─── eBay ─────────────────────────────────────────────────────────────────────

const EBAY_REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutos antes de expirar

async function refreshEbayTokens(): Promise<TokenRefreshResult[]> {
  const results: TokenRefreshResult[] = [];

  const rows = await prisma.apiCredential.findMany({
    where: { apiName: 'ebay', isActive: true },
  });

  for (const row of rows) {
    const tag = `eBay userId=${row.userId} env=${row.environment}`;
    try {
      const raw = decrypt(row.credentials);
      const creds = JSON.parse(raw) as Record<string, any>;

      const refreshToken = creds.refreshToken || creds.EBAY_REFRESH_TOKEN;
      const appId = creds.appId || creds.clientId || creds.EBAY_APP_ID;
      const certId = creds.certId || creds.clientSecret || creds.EBAY_CERT_ID;

      if (!refreshToken || !appId || !certId) {
        results.push({ platform: tag, refreshed: false, reason: 'missing_credentials' });
        continue;
      }

      // Check expiry — eBay stores tokenExpiry as ISO or undefined
      const expiresAt = creds.tokenExpiry || creds.expiresAt || creds.accessTokenExpiresAt;
      const expiresMs = expiresAt ? new Date(String(expiresAt)).getTime() : null;
      const timeLeft = expiresMs ? expiresMs - Date.now() : null;

      if (timeLeft !== null && timeLeft > EBAY_REFRESH_THRESHOLD_MS) {
        results.push({
          platform: tag,
          refreshed: false,
          reason: 'token_still_valid',
          expiresAt: new Date(expiresMs!).toISOString(),
        });
        continue;
      }

      logger.info('[OAUTH-REFRESH] eBay token expiring or unknown expiry — refreshing', {
        tag,
        timeLeftMin: timeLeft ? Math.round(timeLeft / 60000) : 'unknown',
      });

      const isSandbox = row.environment === 'sandbox';
      const tokenUrl = isSandbox
        ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
        : 'https://api.ebay.com/identity/v1/oauth2/token';

      const basicAuth = Buffer.from(`${appId}:${certId}`).toString('base64');
      const { default: axios } = await import('axios');
      const resp = await axios.post(
        tokenUrl,
        `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        }
      );

      const newToken: string = resp.data.access_token;
      const expiresIn: number = resp.data.expires_in || 7200; // eBay default 2h
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

      const updated = {
        ...creds,
        token: newToken,
        authToken: newToken,
        accessToken: newToken,
        tokenExpiry: newExpiresAt.toISOString(),
        expiresAt: newExpiresAt.toISOString(),
        sandbox: isSandbox,
      };

      await prisma.apiCredential.update({
        where: { id: row.id },
        data: { credentials: encrypt(JSON.stringify(updated)), updatedAt: new Date() },
      });

      const { clearCredentialsCache } = await import('./credentials-manager.service');
      clearCredentialsCache(row.userId, 'ebay', row.environment);

      logger.info('[OAUTH-REFRESH] eBay token refreshed successfully', {
        tag,
        expiresAt: newExpiresAt.toISOString(),
      });

      results.push({
        platform: tag,
        refreshed: true,
        reason: 'refreshed',
        expiresAt: newExpiresAt.toISOString(),
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error_description || err?.response?.data?.message || err?.message || String(err);
      logger.warn('[OAUTH-REFRESH] eBay token refresh failed', { tag, error: msg });
      results.push({ platform: tag, refreshed: false, reason: 'error', error: msg });
    }
  }

  return results;
}

// ─── AliExpress status (no refresh — solo estado) ─────────────────────────────

const ALIEXPRESS_WARN_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 días antes de expirar

async function getAliExpressStatus(): Promise<TokenRefreshResult> {
  try {
    const { getToken } = await import('./aliexpress-token.store');
    const token = getToken();

    if (!token) {
      return {
        platform: 'AliExpress Dropshipping',
        refreshed: false,
        reason: 'no_token_in_store',
      };
    }

    const timeLeft = token.expiresAt - Date.now();
    const expiresAt = new Date(token.expiresAt).toISOString();

    if (timeLeft <= 0) {
      return {
        platform: 'AliExpress Dropshipping',
        refreshed: false,
        reason: 'token_expired',
        expiresAt,
        error: 'Token expired — manual re-login required in API settings',
      };
    }

    if (timeLeft < ALIEXPRESS_WARN_THRESHOLD_MS) {
      logger.warn('[OAUTH-REFRESH] AliExpress token expiring soon', {
        expiresAt,
        daysLeft: (timeLeft / 86400000).toFixed(1),
      });
      return {
        platform: 'AliExpress Dropshipping',
        refreshed: false,
        reason: 'expiring_soon',
        expiresAt,
      };
    }

    return {
      platform: 'AliExpress Dropshipping',
      refreshed: false,
      reason: 'token_valid',
      expiresAt,
    };
  } catch (err: any) {
    return {
      platform: 'AliExpress Dropshipping',
      refreshed: false,
      reason: 'error',
      error: err?.message || String(err),
    };
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run all OAuth proactive refreshes. Safe to call at startup and every 30min.
 * Errors per platform are isolated — one failure doesn't block the others.
 */
export async function runOAuthProactiveRefresh(): Promise<OAuthRefreshSummary> {
  const [mlResults, ebayResults, aliStatus] = await Promise.allSettled([
    refreshMercadoLibreTokens(),
    refreshEbayTokens(),
    getAliExpressStatus(),
  ]);

  const results: TokenRefreshResult[] = [
    ...(mlResults.status === 'fulfilled'
      ? mlResults.value
      : [{ platform: 'MercadoLibre', refreshed: false, reason: 'error', error: String((mlResults as any).reason) }]),
    ...(ebayResults.status === 'fulfilled'
      ? ebayResults.value
      : [{ platform: 'eBay', refreshed: false, reason: 'error', error: String((ebayResults as any).reason) }]),
    aliStatus.status === 'fulfilled'
      ? aliStatus.value
      : { platform: 'AliExpress Dropshipping', refreshed: false, reason: 'error', error: String((aliStatus as any).reason) },
  ];

  const summary: OAuthRefreshSummary = {
    at: new Date().toISOString(),
    results,
    refreshedCount: results.filter((r) => r.refreshed).length,
    skippedCount: results.filter((r) => !r.refreshed && r.reason !== 'error').length,
    errorCount: results.filter((r) => r.reason === 'error').length,
  };

  if (summary.refreshedCount > 0) {
    logger.info('[OAUTH-REFRESH] Proactive refresh completed', {
      refreshed: summary.refreshedCount,
      skipped: summary.skippedCount,
      errors: summary.errorCount,
    });
  }

  return summary;
}
