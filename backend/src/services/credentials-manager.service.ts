/**
 * Credentials Manager Service
 * Centralizes credential loading from DB (api_credentials) and process.env fallback.
 * AliExpress isolation:
 * - Affiliate namespace: aliexpress-affiliate
 * - Dropshipping namespace: aliexpress-dropshipping
 * - Legacy namespace: aliexpress (manual browser/cookies only)
 */

import { trace } from '../utils/boot-trace';
trace('loading credentials-manager.service');

import { prisma } from '../config/database';
import { decrypt, encrypt } from '../utils/encryption';
import { logger } from '../config/logger';
import type { ApiName } from '../types/api-credentials.types';

export interface CredentialEntry {
  id?: number;
  credentials: Record<string, any> | null;
  isActive: boolean;
  scope: 'user' | 'global';
  ownerUserId: number;
  sharedByUserId?: number | null;
}

const credentialsCache = new Map<string, CredentialEntry | null>();

function cacheKey(userId: number, apiName: string, environment: string): string {
  return `${userId}:${apiName}:${environment}`;
}

function normalizeApiName(apiName: string): string {
  const n = String(apiName || '').toLowerCase().trim();
  if (n === 'aliexpress_affiliate') return 'aliexpress-affiliate';
  if (n === 'aliexpress_dropshipping') return 'aliexpress-dropshipping';
  return n;
}

/**
 * Clear credentials cache (optionally scoped)
 */
export function clearCredentialsCache(
  userId?: number,
  apiName?: string,
  environment?: string
): void {
  if (!userId && !apiName && !environment) {
    credentialsCache.clear();
    return;
  }
  for (const key of credentialsCache.keys()) {
    const [u, a, e] = key.split(':');
    const matchUser = !userId || u === String(userId);
    const matchApi = !apiName || a === apiName;
    const matchEnv = !environment || e === environment;
    if (matchUser && matchApi && matchEnv) {
      credentialsCache.delete(key);
    }
  }
}

/**
 * Load credentials from env for APIs that support it
 */
function loadFromEnv(
  apiName: string,
  environment: 'sandbox' | 'production'
): Record<string, any> | null {
  const n = normalizeApiName(apiName);

  // AliExpress Affiliate (strict namespace: ALIEXPRESS_AFFILIATE_*)
  if (n === 'aliexpress-affiliate') {
    const appKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || '').trim();
    const appSecret = (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || '').trim();
    // Legacy fallback only when dropshipping vars are absent (avoid cross contamination).
    const legacyKey = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const legacySecret = (process.env.ALIEXPRESS_APP_SECRET || '').trim();
    const dsKey = (process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim();
    const dsSecret = (process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || '').trim();
    const finalKey = appKey || (!dsKey ? legacyKey : '');
    const finalSecret = appSecret || (!dsSecret ? legacySecret : '');
    if (!finalKey || !finalSecret) return null;
    if (!appKey || !appSecret) {
      logger.warn('[CredentialsManager] Using legacy ALIEXPRESS_APP_* for affiliate. Configure ALIEXPRESS_AFFILIATE_APP_* to enforce full isolation.');
    }
    return {
      appKey: finalKey,
      appSecret: finalSecret,
      trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
      sandbox: environment === 'sandbox',
    };
  }

  // AliExpress Dropshipping (strict namespace: ALIEXPRESS_DROPSHIPPING_*)
  if (n === 'aliexpress-dropshipping') {
    const appKey = (process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim();
    const appSecret = (process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || '').trim();
    if (!appKey || !appSecret) return null;
    return {
      appKey,
      appSecret,
      accessToken: (process.env.ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN || '').trim() || undefined,
      refreshToken: (process.env.ALIEXPRESS_DROPSHIPPING_REFRESH_TOKEN || '').trim() || undefined,
      sandbox: environment === 'sandbox',
    };
  }

  // eBay
  if (n === 'ebay') {
    const clientId = (
      process.env.EBAY_CLIENT_ID ||
      process.env.EBAY_APP_ID ||
      (environment === 'sandbox' ? process.env.EBAY_SANDBOX_APP_ID : process.env.EBAY_PRODUCTION_APP_ID) ||
      ''
    ).trim();
    const clientSecret = (
      process.env.EBAY_CLIENT_SECRET ||
      process.env.EBAY_CERT_ID ||
      (environment === 'sandbox'
        ? process.env.EBAY_SANDBOX_CERT_ID
        : process.env.EBAY_PRODUCTION_CERT_ID) ||
      ''
    ).trim();
    if (!clientId || !clientSecret) return null;
    const rawRedirect = (process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || '').trim();
    const ruNameOnly = (process.env.EBAY_RUNAME || '').trim();
    const redirectUri = ruNameOnly || (rawRedirect && !/^https?:\/\//i.test(rawRedirect) ? rawRedirect : undefined);
    return {
      appId: clientId,
      devId: (process.env.EBAY_DEV_ID || '').trim() || undefined,
      certId: clientSecret,
      redirectUri: redirectUri || undefined,
      token: (process.env.EBAY_OAUTH_TOKEN || process.env.EBAY_TOKEN || '').trim() || undefined,
      refreshToken: (process.env.EBAY_REFRESH_TOKEN || '').trim() || undefined,
      sandbox: environment === 'sandbox',
    };
  }

  // PayPal
  if (n === 'paypal') {
    const clientId =
      (environment === 'sandbox'
        ? process.env.PAYPAL_SANDBOX_CLIENT_ID
        : process.env.PAYPAL_PRODUCTION_CLIENT_ID) ||
      process.env.PAYPAL_CLIENT_ID ||
      '';
    const clientSecret =
      (environment === 'sandbox'
        ? process.env.PAYPAL_SANDBOX_CLIENT_SECRET
        : process.env.PAYPAL_PRODUCTION_CLIENT_SECRET) ||
      process.env.PAYPAL_CLIENT_SECRET ||
      '';
    if (!clientId || !clientSecret) return null;
    return {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      environment: environment === 'sandbox' ? 'sandbox' : 'live',
    };
  }

  // ScraperAPI
  if (n === 'scraperapi' || n === 'scraper_api') {
    const apiKey =
      (process.env.SCRAPERAPI_KEY || process.env.SCRAPER_API_KEY || '').trim();
    if (!apiKey) return null;
    return { apiKey };
  }

  // ZenRows
  if (n === 'zenrows' || n === 'zen_rows') {
    const apiKey = (process.env.ZENROWS_API_KEY || '').trim();
    if (!apiKey) return null;
    return { apiKey };
  }

  // GROQ
  if (n === 'groq') {
    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) return null;
    return { apiKey };
  }

  return null;
}

/**
 * Try to decrypt stored credentials
 */
function tryDecrypt(raw: string): Record<string, any> | null {
  try {
    const decrypted = decrypt(raw);
    return JSON.parse(decrypted) as Record<string, any>;
  } catch {
    return null;
  }
}

/** AliExpress OAuth token cache (global, not per-user) */
let aliexpressTokenCache: { token: string; expiresAt: number } | null = null;

export function clearAliExpressTokenCache(): void {
  aliexpressTokenCache = null;
}

export const CredentialsManager = {
  /**
   * Get valid AliExpress OAuth access_token. Reads from DB, refreshes if expired.
   * AliExpress uses app-level OAuth (global token). userId kept for future per-user support.
   */
  async getAliExpressAccessToken(_userId?: number): Promise<string | null> {
    if (aliexpressTokenCache && aliexpressTokenCache.expiresAt > Date.now() + 60000) {
      return aliexpressTokenCache.token;
    }
    try {
      const tokenRecord = await prisma.aliExpressToken.findUnique({
        where: { id: 'global' },
      });
      if (!tokenRecord?.accessToken) return null;
      const expiresAt = tokenRecord.expiresAt.getTime();
      if (expiresAt <= Date.now() + 60000 && tokenRecord.refreshToken) {
        const { refreshAccessToken } = await import('./aliexpress-oauth.service');
        const refreshed = await refreshAccessToken(tokenRecord.refreshToken);
        aliexpressTokenCache = { token: refreshed.accessToken, expiresAt: refreshed.expiresAt };
        return refreshed.accessToken;
      }
      aliexpressTokenCache = { token: tokenRecord.accessToken, expiresAt };
      return tokenRecord.accessToken;
    } catch (err: any) {
      logger.warn('[CredentialsManager] getAliExpressAccessToken failed', { error: err?.message });
      return null;
    }
  },

  async getCredentials(
    userId: number,
    apiName: ApiName | string,
    environment: 'sandbox' | 'production'
  ): Promise<Record<string, any> | null> {
    const entry = await this.getCredentialEntry(userId, apiName, environment);
    return entry?.credentials ?? null;
  },

  async getCredentialEntry(
    userId: number,
    apiName: ApiName | string,
    environment: 'sandbox' | 'production',
    options?: { includeGlobal?: boolean }
  ): Promise<CredentialEntry | null> {
    const name = normalizeApiName(String(apiName));
    const key = cacheKey(userId, name, environment);
    const cached = credentialsCache.get(key);
    if (cached !== undefined) return cached;

    const includeGlobal = options?.includeGlobal !== false;

    // 1) User credentials
    const userEntry = await prisma.apiCredential.findFirst({
      where: {
        userId,
        apiName: name,
        environment,
        scope: 'user',
        isActive: true,
      },
    });

    if (userEntry?.credentials) {
      const creds = tryDecrypt(userEntry.credentials);
      if (creds) {
        const entry: CredentialEntry = {
          id: userEntry.id,
          credentials: creds,
          isActive: userEntry.isActive,
          scope: 'user',
          ownerUserId: userEntry.userId,
          sharedByUserId: userEntry.sharedById,
        };
        credentialsCache.set(key, entry);
        return entry;
      }
    }

    // 2) Global credentials (if includeGlobal)
    if (includeGlobal) {
      const globalEntry = await prisma.apiCredential.findFirst({
        where: {
          apiName: name,
          environment,
          scope: 'global',
          isActive: true,
        },
      });

      if (globalEntry?.credentials) {
        const creds = tryDecrypt(globalEntry.credentials);
        if (creds) {
          const entry: CredentialEntry = {
            id: globalEntry.id,
            credentials: creds,
            isActive: globalEntry.isActive,
            scope: 'global',
            ownerUserId: globalEntry.userId,
            sharedByUserId: globalEntry.sharedById,
          };
          credentialsCache.set(key, entry);
          return entry;
        }
      }
    }

    // 3) Env fallback
    const envCreds = loadFromEnv(name, environment);
    if (envCreds) {
      const entry: CredentialEntry = {
        credentials: envCreds,
        isActive: true,
        scope: 'user',
        ownerUserId: userId,
      };
      credentialsCache.set(key, entry);
      return entry;
    }

    credentialsCache.set(key, null);
    return null;
  },

  async saveCredentials(
    userId: number,
    apiName: ApiName | string,
    credentials: Record<string, any>,
    environment: 'sandbox' | 'production',
    options?: { scope?: 'user' | 'global'; sharedByUserId?: number | null }
  ): Promise<void> {
    const name = normalizeApiName(String(apiName));
    const scope = options?.scope ?? 'user';
    const ownerUserId = scope === 'global' ? userId : userId;

    const encrypted = encrypt(JSON.stringify(credentials));

    await prisma.apiCredential.upsert({
      where: {
        userId_apiName_environment_scope: {
          userId: ownerUserId,
          apiName: name,
          environment,
          scope,
        },
      },
      create: {
        userId: ownerUserId,
        apiName: name,
        environment,
        credentials: encrypted,
        scope,
        sharedById: options?.sharedByUserId ?? null,
      },
      update: {
        credentials: encrypted,
        sharedById: options?.sharedByUserId ?? null,
      },
    });

    clearCredentialsCache(userId, name, environment);
  },

  async toggleCredentials(
    userId: number,
    apiName: ApiName | string,
    environment: 'sandbox' | 'production',
    scope: 'user' | 'global',
    isActive: boolean
  ): Promise<void> {
    const name = normalizeApiName(String(apiName));
    const ownerUserId = scope === 'global' ? userId : userId;

    await prisma.apiCredential.updateMany({
      where: {
        userId: ownerUserId,
        apiName: name,
        environment,
        scope,
      },
      data: { isActive },
    });

    clearCredentialsCache(userId, name, environment);
  },

  async deleteCredentials(
    userId: number,
    apiName: ApiName | string,
    environment: 'sandbox' | 'production',
    scope: 'user' | 'global'
  ): Promise<void> {
    const name = normalizeApiName(String(apiName));

    await prisma.apiCredential.deleteMany({
      where: {
        userId: scope === 'global' ? userId : userId,
        apiName: name,
        environment,
        scope,
      },
    });

    clearCredentialsCache(userId, name, environment);
  },

  async listConfiguredApis(userId: number): Promise<Array<{ apiName: string; environment: string; isActive: boolean; updatedAt: Date; scope: string; ownerUserId: number; sharedByUserId: number | null }>> {
    const rows = await prisma.apiCredential.findMany({
      where: {
        OR: [{ userId, scope: 'user' }, { scope: 'global' }],
      },
      select: { apiName: true, environment: true, isActive: true, updatedAt: true, scope: true, userId: true, sharedById: true },
    });

    const byKey = new Map<string, { apiName: string; environment: string; isActive: boolean; updatedAt: Date; scope: string; ownerUserId: number; sharedByUserId: number | null }>();
    for (const r of rows) {
      const k = `${r.apiName}:${r.environment}`;
      const existing = byKey.get(k);
      if (!existing || (r.scope === 'user' && existing.apiName === r.apiName)) {
        byKey.set(k, {
          apiName: r.apiName,
          environment: r.environment,
          isActive: r.isActive,
          updatedAt: r.updatedAt,
          scope: r.scope,
          ownerUserId: r.userId,
          sharedByUserId: r.sharedById,
        });
      }
    }

    return Array.from(byKey.values());
  },

  normalizeCredential(
    apiName: string,
    credentials: Record<string, any>,
    environment: 'sandbox' | 'production'
  ): Record<string, any> {
    const n = normalizeApiName(apiName);
    const out = { ...credentials };

    if (n === 'ebay') {
      out.appId = out.appId || out.clientId || out.EBAY_APP_ID;
      out.certId = out.certId || out.clientSecret || out.EBAY_CERT_ID;
      out.devId = out.devId || out.EBAY_DEV_ID;
      // ✅ Aceptar tanto RuName como URL completa - eBay soporta ambos
      const ru = out.redirectUri || out.EBAY_RUNAME || out.ruName || out.RuName || process.env.EBAY_RUNAME || process.env.EBAY_REDIRECT_URI;
      out.redirectUri = ru ? String(ru).trim() || undefined : undefined;
      // Token/refreshToken: DB first (token|authToken|accessToken), then env fallback (Railway)
      const envToken = (process.env.EBAY_OAUTH_TOKEN || process.env.EBAY_TOKEN || '').trim() || undefined;
      const envRefresh = (process.env.EBAY_REFRESH_TOKEN || '').trim() || undefined;
      out.token = out.token || out.authToken || out.accessToken || out.EBAY_OAUTH_TOKEN || envToken;
      // If a concrete access token exists in stored credentials, do not inject refresh token from env.
      // This allows controlled bypass when refresh token is stale/revoked.
      if (!out.refreshToken && !out.EBAY_REFRESH_TOKEN && !out.token) {
        out.refreshToken = envRefresh;
      } else {
        out.refreshToken = out.refreshToken || out.EBAY_REFRESH_TOKEN;
      }
      out.sandbox = environment === 'sandbox';
    }

    if (n === 'paypal') {
      out.clientId = out.clientId || out.PAYPAL_CLIENT_ID;
      out.clientSecret = out.clientSecret || out.PAYPAL_CLIENT_SECRET;
    }

    return out;
  },

  validateCredentials(
    apiName: ApiName | string,
    credentials: Record<string, any>
  ): { valid: boolean; errors?: string[] } {
    const n = normalizeApiName(String(apiName));
    const err: string[] = [];

    if (n === 'ebay') {
      const appId = credentials?.appId || credentials?.clientId;
      const devId = credentials?.devId;
      const certId = credentials?.certId || credentials?.clientSecret;
      if (!appId || String(appId).trim() === '') err.push('appId (EBAY_APP_ID) is required');
      if (!devId || String(devId).trim() === '') err.push('devId (EBAY_DEV_ID) is required');
      if (!certId || String(certId).trim() === '') err.push('certId (EBAY_CERT_ID) is required');
    } else if (n === 'amazon') {
      const required = [
        'sellerId',
        'clientId',
        'clientSecret',
        'refreshToken',
        'awsAccessKeyId',
        'awsSecretAccessKey',
      ];
      for (const k of required) {
        if (!credentials?.[k] || String(credentials[k]).trim() === '') {
          err.push(`${k} is required`);
        }
      }
    } else if (n === 'mercadolibre') {
      if (!credentials?.clientId || String(credentials.clientId).trim() === '')
        err.push('clientId is required');
      if (!credentials?.clientSecret || String(credentials.clientSecret).trim() === '')
        err.push('clientSecret is required');
    } else if (n === 'groq') {
      if (!credentials?.apiKey || String(credentials.apiKey).trim() === '')
        err.push('apiKey is required');
    } else if (n === 'scraperapi') {
      if (!credentials?.apiKey || String(credentials.apiKey).trim() === '')
        err.push('apiKey is required');
    } else if (n === 'zenrows') {
      if (!credentials?.apiKey || String(credentials.apiKey).trim() === '')
        err.push('apiKey is required');
    } else if (n === '2captcha') {
      if (!credentials?.apiKey || String(credentials.apiKey).trim() === '')
        err.push('apiKey is required');
    } else if (n === 'paypal') {
      if (!credentials?.clientId || String(credentials.clientId).trim() === '')
        err.push('clientId is required');
      if (!credentials?.clientSecret || String(credentials.clientSecret).trim() === '')
        err.push('clientSecret is required');
    } else if (n === 'aliexpress-affiliate') {
      if (!credentials?.appKey || String(credentials.appKey).trim() === '')
        err.push('appKey is required');
      if (!credentials?.appSecret || String(credentials.appSecret).trim() === '')
        err.push('appSecret is required');
    } else if (n === 'aliexpress-dropshipping') {
      if (!credentials?.appKey || String(credentials.appKey).trim() === '')
        err.push('appKey is required');
      if (!credentials?.appSecret || String(credentials.appSecret).trim() === '')
        err.push('appSecret is required');
      if (credentials?.accessToken && credentials?.refreshToken && String(credentials.accessToken) === String(credentials.refreshToken)) {
        err.push('accessToken and refreshToken must be different');
      }
    }

    return {
      valid: err.length === 0,
      errors: err.length > 0 ? err : undefined,
    };
  },

  async detectAndCleanCorruptedCredentials(options?: {
    dryRun?: boolean;
    autoDeactivate?: boolean;
  }): Promise<{ total: number; corrupted: number; cleaned: number }> {
    const dryRun = options?.dryRun ?? false;
    const autoDeactivate = options?.autoDeactivate ?? true;

    const all = await prisma.apiCredential.findMany();
    let corrupted = 0;
    let cleaned = 0;

    for (const row of all) {
      let valid = false;
      try {
        const dec = decrypt(row.credentials);
        JSON.parse(dec);
        valid = true;
      } catch {
        corrupted++;
        if (!dryRun && autoDeactivate) {
          await prisma.apiCredential.update({
            where: { id: row.id },
            data: { isActive: false },
          });
          cleaned++;
        }
      }
    }

    return { total: all.length, corrupted, cleaned };
  },
};
