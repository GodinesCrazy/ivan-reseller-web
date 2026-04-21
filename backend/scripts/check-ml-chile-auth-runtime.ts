import axios from 'axios';
import { prisma } from '../src/config/database';
import { clearCredentialsCache, CredentialsManager } from '../src/services/credentials-manager.service';
import MarketplaceService from '../src/services/marketplace.service';
import {
  classifyMlChileAuthState,
  requiresMlChileOauthReauth,
} from '../src/utils/ml-chile-auth-truth';


function pickString(source: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function callUsersMe(accessToken: string) {
  return axios.get('https://api.mercadolibre.com/users/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    timeout: 20_000,
  });
}

async function attemptRefresh(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
  });

  return axios.post('https://api.mercadolibre.com/oauth/token', body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 20_000,
  });
}

async function main() {
  const userId = Number(process.argv[2] || 1);
  const marketplaceService = new MarketplaceService();
  // Sequential DB reads — fewer simultaneous connections (shared Postgres headroom)
  const credentialRow = await prisma.apiCredential.findFirst({
    where: {
      userId,
      apiName: 'mercadolibre',
      environment: 'production',
      isActive: true,
    },
    select: {
      id: true,
      updatedAt: true,
    },
  });
  const marketplaceAuthStatus = await prisma.marketplaceAuthStatus.findFirst({
    where: {
      userId,
      marketplace: 'mercadolibre',
    },
    select: {
      status: true,
      message: true,
      updatedAt: true,
    },
  });
  const apiSnapshot = await prisma.aPIStatusSnapshot.findFirst({
    where: {
      userId,
      apiName: 'mercadolibre',
      environment: 'production',
    },
    select: {
      status: true,
      error: true,
      message: true,
      isAvailable: true,
      lastChecked: true,
    },
  });

  const creds = (await CredentialsManager.getCredentials(
    userId,
    'mercadolibre',
    'production',
  )) as Record<string, unknown> | null;

  const methods = Object.getOwnPropertyNames(CredentialsManager).filter(
    (name) => typeof (CredentialsManager as Record<string, unknown>)[name] === 'function',
  );

  const accessToken = pickString(creds, ['accessToken', 'access_token']);
  const refreshToken = pickString(creds, ['refreshToken', 'refresh_token']);
  const siteId = pickString(creds, ['siteId', 'site_id']) || 'MLC';
  const clientId =
    pickString(creds, ['clientId', 'client_id', 'appId', 'app_id']) ||
    process.env.MERCADOLIBRE_CLIENT_ID ||
    null;
  const clientSecret =
    pickString(creds, ['clientSecret', 'client_secret', 'appSecret', 'app_secret']) ||
    process.env.MERCADOLIBRE_CLIENT_SECRET ||
    null;

  const summary: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    userId,
    credentialRow,
    marketplaceAuthStatus,
    apiSnapshot,
    siteId,
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    tokenShapeValid: Boolean(accessToken || refreshToken),
    runtimeUsable: false,
    credentialsManagerMethods: methods,
  };
  try {
    summary.oauthStartUrl = await marketplaceService.getMercadoLibreOAuthStartUrl(userId, 'production', {
      frontendBaseUrl:
        process.env.FRONTEND_URL || process.env.WEB_BASE_URL || 'https://www.ivanreseller.com',
      requestBaseUrl:
        process.env.BACKEND_URL || process.env.RAILWAY_STATIC_URL || process.env.API_URL || '',
    });
  } catch (error: any) {
    summary.oauthStartUrl = null;
    summary.oauthStartUrlError = error?.message || String(error);
  }

  if (!accessToken) {
    const authState = classifyMlChileAuthState({
      credentialCount: credentialRow ? 1 : 0,
      hasAccessToken: false,
      hasRefreshToken: Boolean(refreshToken),
    });
    summary.authState = authState;
    summary.oauthReauthRequired = requiresMlChileOauthReauth(authState);
    summary.lastAuthFailureReason =
      marketplaceAuthStatus?.message ||
      apiSnapshot?.error ||
      apiSnapshot?.message ||
      'missing_access_token';
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  try {
    const me = await callUsersMe(accessToken);
    const authState = classifyMlChileAuthState({
      credentialCount: credentialRow ? 1 : 0,
      hasAccessToken: true,
      hasRefreshToken: Boolean(refreshToken),
    });
    summary.authState = authState;
    summary.oauthReauthRequired = requiresMlChileOauthReauth(authState);
    summary.runtimeUsable = true;
    summary.lastAuthFailureReason = null;
    summary.usersMe = {
      status: me.status,
      id: me.data?.id ?? null,
      nickname: me.data?.nickname ?? null,
      country_id: me.data?.country_id ?? null,
    };
    console.log(JSON.stringify(summary, null, 2));
    return;
  } catch (error: any) {
    summary.usersMe = {
      status: error?.response?.status ?? null,
      error: error?.response?.data ?? error?.message ?? String(error),
    };
  }

  if (!refreshToken || !clientId || !clientSecret) {
    const authState = classifyMlChileAuthState({
      credentialCount: credentialRow ? 1 : 0,
      hasAccessToken: false,
      hasRefreshToken: false,
    });
    summary.authState = authState;
    summary.oauthReauthRequired = requiresMlChileOauthReauth(authState);
    summary.lastAuthFailureReason =
      marketplaceAuthStatus?.message ||
      apiSnapshot?.error ||
      apiSnapshot?.message ||
      'invalid_access_token_and_refresh_unavailable';
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  try {
    const refreshed = await attemptRefresh({
      refreshToken,
      clientId,
      clientSecret,
    });
    const refreshedAccessToken = String(refreshed.data?.access_token || '').trim();
    const refreshedRefreshToken = String(refreshed.data?.refresh_token || refreshToken || '').trim();
    summary.authState = 'access_token_invalid_refresh_succeeds';
    summary.oauthReauthRequired = false;
    summary.lastAuthFailureReason = null;
    summary.refreshResult = {
      status: refreshed.status,
      accessTokenReturned: Boolean(refreshedAccessToken),
      refreshTokenReturned: Boolean(refreshed.data?.refresh_token),
      expiresIn: refreshed.data?.expires_in ?? null,
    };

    if (refreshedAccessToken) {
      const updatedCreds = {
        ...(creds || {}),
        clientId,
        clientSecret,
        siteId,
        accessToken: refreshedAccessToken,
        refreshToken: refreshedRefreshToken || undefined,
      };
      await CredentialsManager.saveCredentials(userId, 'mercadolibre', updatedCreds, 'production');
      clearCredentialsCache(userId, 'mercadolibre', 'production');
      const persisted = (await CredentialsManager.getCredentials(
        userId,
        'mercadolibre',
        'production',
      )) as Record<string, unknown> | null;
      const persistedAccessToken = pickString(persisted, ['accessToken', 'access_token']);
      const persistedRefreshToken = pickString(persisted, ['refreshToken', 'refresh_token']);
      summary.refreshResult = {
        ...summary.refreshResult,
        persistedAccessToken: Boolean(persistedAccessToken),
        persistedRefreshToken: Boolean(persistedRefreshToken),
      };

      try {
        const me = await callUsersMe(refreshedAccessToken);
        summary.runtimeUsable = Boolean(persistedAccessToken);
        summary.authState = persistedAccessToken
          ? 'access_token_invalid_refresh_persisted_and_verified'
          : 'access_token_invalid_refresh_verified_but_persistence_failed';
        if (!persistedAccessToken) {
          summary.lastAuthFailureReason = 'refresh_verified_but_db_readback_missing_tokens';
        }
        summary.usersMe = {
          status: me.status,
          id: me.data?.id ?? null,
          nickname: me.data?.nickname ?? null,
          country_id: me.data?.country_id ?? null,
        };
      } catch (verifyError: any) {
        summary.authState = 'access_token_invalid_refresh_persisted_but_still_unusable';
        summary.lastAuthFailureReason =
          verifyError?.response?.data?.message ||
          verifyError?.response?.data?.error ||
          verifyError?.message ||
          String(verifyError);
        summary.usersMe = {
          status: verifyError?.response?.status ?? null,
          error: verifyError?.response?.data ?? verifyError?.message ?? String(verifyError),
        };
      }
    }
  } catch (error: any) {
    summary.authState = 'access_token_invalid_refresh_failed';
    summary.oauthReauthRequired = false;
    summary.lastAuthFailureReason =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      String(error);
    summary.refreshResult = {
      status: error?.response?.status ?? null,
      error: error?.response?.data ?? error?.message ?? String(error),
    };
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('[check-ml-chile-auth-runtime] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
