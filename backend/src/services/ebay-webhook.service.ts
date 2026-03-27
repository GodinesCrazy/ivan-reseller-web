import axios from 'axios';
import crypto from 'crypto';
import logger from '../config/logger';
import EbayService, { EbayCredentials } from './ebay.service';

const APP_TOKEN_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const PUBLIC_KEY_CACHE_TTL_MS = 60 * 60 * 1000;

type CachedPublicKey = {
  publicKey: string;
  digestAlgorithm: string;
  signingAlgorithm: string;
  expiresAt: number;
};

const appTokenCache = new Map<string, { token: string; expiresAt: number }>();
const publicKeyCache = new Map<string, CachedPublicKey>();

export interface DecodedEbaySignature {
  alg?: string;
  kid?: string;
  digest?: string;
  signature?: string;
}

export interface EbayWebhookReadinessReport {
  endpoint: string | null;
  verificationTokenConfigured: boolean;
  alertEmailConfigured: boolean;
  alertEmail: string | null;
  appCredentialsPresent: boolean;
  appTopicsReadable: boolean;
  destinationsReadable: boolean;
  subscriptionsReadable: boolean;
  matchedDestinationId: string | null;
  matchedSubscriptionIds: string[];
  matchedSubscriptionTopics: string[];
  blockers: string[];
  topicError?: string | null;
  destinationError?: string | null;
  subscriptionError?: string | null;
  configError?: string | null;
}

function getEbayApiBaseUrl(sandbox: boolean): string {
  return sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

function wrapPemIfNeeded(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('BEGIN PUBLIC KEY')) return trimmed;
  const lines = trimmed.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

function getVerifyAlgorithm(digestAlgorithm?: string): string {
  const digest = String(digestAlgorithm || 'SHA1').toUpperCase();
  if (digest === 'SHA256') return 'sha256';
  if (digest === 'SHA384') return 'sha384';
  if (digest === 'SHA512') return 'sha512';
  return 'sha1';
}

function tokenCacheKey(credentials: EbayCredentials): string {
  return `${credentials.appId}:${credentials.sandbox ? 'sandbox' : 'production'}`;
}

export function resolveEbayWebhookEndpoint(requestBaseUrl?: string): string | null {
  const explicit = (process.env.EBAY_WEBHOOK_ENDPOINT || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const backendBase = (
    process.env.BACKEND_URL ||
    process.env.RAILWAY_STATIC_URL ||
    requestBaseUrl ||
    ''
  ).replace(/\/$/, '');

  if (!backendBase) return null;
  return `${backendBase}/api/webhooks/ebay`;
}

export function resolveEbayWebhookVerificationToken(): string | null {
  const token = (
    process.env.EBAY_WEBHOOK_VERIFICATION_TOKEN ||
    process.env.WEBHOOK_SECRET_EBAY ||
    ''
  ).trim();
  return token || null;
}

export function buildEbayChallengeResponse(params: {
  challengeCode: string;
  verificationToken: string;
  endpoint: string;
}): string {
  return crypto
    .createHash('sha256')
    .update(`${params.challengeCode}${params.verificationToken}${params.endpoint}`)
    .digest('hex');
}

export function decodeEbaySignatureHeader(signatureHeader: string): DecodedEbaySignature {
  const raw = String(signatureHeader || '').trim();
  if (!raw) {
    throw new Error('missing_signature_header');
  }

  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(decoded) as DecodedEbaySignature;
  if (!parsed?.kid || !parsed?.signature) {
    throw new Error('invalid_signature_header_payload');
  }

  return parsed;
}

export function verifyEbayNotificationSignatureWithKey(params: {
  payload: string | Buffer;
  decodedSignature: DecodedEbaySignature;
  publicKey: string;
  digestAlgorithm?: string;
}): boolean {
  const verifier = crypto.createVerify(
    getVerifyAlgorithm(params.digestAlgorithm || params.decodedSignature.digest)
  );
  verifier.update(
    typeof params.payload === 'string' ? Buffer.from(params.payload) : params.payload
  );
  verifier.end();

  return verifier.verify(
    wrapPemIfNeeded(params.publicKey),
    Buffer.from(String(params.decodedSignature.signature || ''), 'base64')
  );
}

export class EbayWebhookService {
  constructor(
    private readonly credentials: EbayCredentials,
    private readonly options?: {
      onCredentialsUpdate?: (creds: EbayCredentials & { sandbox: boolean }) => Promise<void>;
    }
  ) {}

  private get baseUrl(): string {
    return getEbayApiBaseUrl(!!this.credentials.sandbox);
  }

  private get notificationBaseUrl(): string {
    return `${this.baseUrl}/commerce/notification/v1`;
  }

  private get hasAppCredentials(): boolean {
    return !!String(this.credentials.appId || '').trim() && !!String(this.credentials.certId || '').trim();
  }

  private async getAppAccessToken(): Promise<string> {
    if (!this.hasAppCredentials) {
      throw new Error('missing_app_credentials');
    }

    const cacheEntry = appTokenCache.get(tokenCacheKey(this.credentials));
    if (cacheEntry && cacheEntry.expiresAt > Date.now() + 60_000) {
      return cacheEntry.token;
    }

    const response = await axios.post(
      `${this.baseUrl}/identity/v1/oauth2/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        scope: APP_TOKEN_SCOPE,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${this.credentials.appId}:${this.credentials.certId}`
          ).toString('base64')}`,
        },
        timeout: 30_000,
      }
    );

    const token = String(response.data?.access_token || '').trim();
    const expiresIn = Number(response.data?.expires_in || 7200);
    if (!token) {
      throw new Error('missing_app_access_token');
    }

    appTokenCache.set(tokenCacheKey(this.credentials), {
      token,
      expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
    });

    return token;
  }

  private async persistUserCredentials(): Promise<void> {
    if (!this.options?.onCredentialsUpdate) return;
    await this.options.onCredentialsUpdate({
      ...this.credentials,
      sandbox: !!this.credentials.sandbox,
    });
  }

  private async getUserAccessToken(forceRefresh = false): Promise<string> {
    const expiresAt = this.credentials.expiresAt
      ? new Date(this.credentials.expiresAt).getTime()
      : Number.NaN;
    const needsRefresh =
      forceRefresh ||
      (!Number.isNaN(expiresAt) && expiresAt <= Date.now() + 60_000);

    if (this.credentials.token && !needsRefresh) {
      return this.credentials.token;
    }

    if (!this.credentials.refreshToken) {
      if (this.credentials.token) {
        return this.credentials.token;
      }
      throw new Error('missing_user_access_token');
    }

    const ebayService = new EbayService(this.credentials);
    const refreshed = await ebayService.refreshAccessToken();
    this.credentials.token = refreshed.token;
    this.credentials.expiresAt = new Date(
      Date.now() + Math.max(refreshed.expiresIn - 60, 60) * 1000
    ).toISOString();
    await this.persistUserCredentials();
    return this.credentials.token;
  }

  async getPublicKey(publicKeyId: string): Promise<CachedPublicKey> {
    const cacheKey = `${tokenCacheKey(this.credentials)}:${publicKeyId}`;
    const cached = publicKeyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    const appToken = await this.getAppAccessToken();
    const response = await axios.get(
      `${this.notificationBaseUrl}/public_key/${encodeURIComponent(publicKeyId)}`,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          Accept: 'application/json',
        },
        timeout: 30_000,
      }
    );

    const next: CachedPublicKey = {
      publicKey: String(response.data?.publicKey || ''),
      digestAlgorithm: String(response.data?.digestAlgorithm || 'SHA1'),
      signingAlgorithm: String(response.data?.signingAlgorithm || 'ECDSA'),
      expiresAt: Date.now() + PUBLIC_KEY_CACHE_TTL_MS,
    };

    publicKeyCache.set(cacheKey, next);
    return next;
  }

  async validateNotificationSignature(
    payload: string | Buffer,
    signatureHeader: string
  ): Promise<{ valid: boolean; error?: string; publicKeyId?: string }> {
    try {
      const decoded = decodeEbaySignatureHeader(signatureHeader);
      const publicKey = await this.getPublicKey(String(decoded.kid));
      const valid = verifyEbayNotificationSignatureWithKey({
        payload,
        decodedSignature: decoded,
        publicKey: publicKey.publicKey,
        digestAlgorithm: publicKey.digestAlgorithm,
      });
      return {
        valid,
        error: valid ? undefined : 'Invalid eBay notification signature',
        publicKeyId: decoded.kid,
      };
    } catch (error: any) {
      logger.warn('[EbayWebhookService] Signature validation failed', {
        error: error?.message || String(error),
      });
      return {
        valid: false,
        error: error?.message || 'Unable to validate eBay notification signature',
      };
    }
  }

  async getTopics(): Promise<any> {
    const appToken = await this.getAppAccessToken();
    const response = await axios.get(`${this.notificationBaseUrl}/topic`, {
      headers: {
        Authorization: `Bearer ${appToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    });
    return response.data;
  }

  async getConfig(): Promise<any> {
    const appToken = await this.getAppAccessToken();
    const response = await axios.get(`${this.notificationBaseUrl}/config`, {
      headers: {
        Authorization: `Bearer ${appToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    });
    return response.data;
  }

  async updateConfig(alertEmail: string): Promise<void> {
    const appToken = await this.getAppAccessToken();
    await axios.put(
      `${this.notificationBaseUrl}/config`,
      { alertEmail },
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
  }

  async getDestinations(): Promise<any> {
    const appToken = await this.getAppAccessToken();
    const response = await axios.get(`${this.notificationBaseUrl}/destination`, {
      headers: {
        Authorization: `Bearer ${appToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    });
    return response.data;
  }

  async getSubscriptions(): Promise<any> {
    let userToken = await this.getUserAccessToken();
    try {
      const response = await axios.get(`${this.notificationBaseUrl}/subscription`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: 'application/json',
        },
        timeout: 30_000,
      });
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 401 && this.credentials.refreshToken) {
        userToken = await this.getUserAccessToken(true);
        const response = await axios.get(`${this.notificationBaseUrl}/subscription`, {
          headers: {
            Authorization: `Bearer ${userToken}`,
            Accept: 'application/json',
          },
          timeout: 30_000,
        });
        return response.data;
      }
      throw error;
    }
  }

  async createDestination(params: {
    endpoint: string;
    verificationToken: string;
    name?: string;
    status?: 'ENABLED' | 'DISABLED';
  }): Promise<void> {
    const appToken = await this.getAppAccessToken();
    await axios.post(
      `${this.notificationBaseUrl}/destination`,
      {
        name: params.name || 'ivan_reseller_ebay_destination',
        status: params.status || 'ENABLED',
        deliveryConfig: {
          endpoint: params.endpoint,
          verificationToken: params.verificationToken,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
  }

  async createSubscription(params: {
    topicId: string;
    destinationId: string;
    schemaVersion: string;
    status?: 'ENABLED' | 'DISABLED';
  }): Promise<void> {
    const userToken = await this.getUserAccessToken();
    await axios.post(
      `${this.notificationBaseUrl}/subscription`,
      {
        topicId: params.topicId,
        status: params.status || 'ENABLED',
        destinationId: params.destinationId,
        payload: {
          deliveryProtocol: 'HTTPS',
          format: 'JSON',
          schemaVersion: params.schemaVersion,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
  }

  async enableSubscription(subscriptionId: string): Promise<void> {
    const userToken = await this.getUserAccessToken();
    await axios.post(
      `${this.notificationBaseUrl}/subscription/${encodeURIComponent(subscriptionId)}/enable`,
      {},
      {
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
  }

  async resolveTopicPayload(topicId: string): Promise<{
    schemaVersion: string;
    topicId: string;
  } | null> {
    const topics = await this.getTopics();
    const topic = (topics?.topics || []).find(
      (item: any) => String(item?.topicId || '').trim() === topicId
    );
    const payload = topic?.supportedPayloads?.[0];
    const schemaVersion = String(payload?.schemaVersion || '').trim();
    if (!schemaVersion) return null;
    return {
      topicId,
      schemaVersion,
    };
  }

  async checkReadiness(): Promise<EbayWebhookReadinessReport> {
    const endpoint = resolveEbayWebhookEndpoint();
    const verificationTokenConfigured = !!resolveEbayWebhookVerificationToken();
    const blockers: string[] = [];
    let alertEmailConfigured = false;
    let alertEmail: string | null = null;

    let appTopicsReadable = false;
    let destinationsReadable = false;
    let subscriptionsReadable = false;
    let matchedDestinationId: string | null = null;
    const matchedSubscriptionIds: string[] = [];
    const matchedSubscriptionTopics: string[] = [];
    let topicError: string | null = null;
    let destinationError: string | null = null;
    let subscriptionError: string | null = null;
    let configError: string | null = null;

    if (!endpoint) blockers.push('public_webhook_endpoint_missing');
    if (!verificationTokenConfigured) blockers.push('verification_token_missing');
    if (!this.hasAppCredentials) blockers.push('app_credentials_missing');

    if (this.hasAppCredentials) {
      try {
        const config = await this.getConfig();
        alertEmail = String(config?.alertEmail || '').trim() || null;
        alertEmailConfigured = !!alertEmail;
        if (!alertEmailConfigured) blockers.push('notification_config_missing');
      } catch (error: any) {
        configError = error?.response?.data?.errors?.[0]?.message || error?.message || 'config_read_failed';
        blockers.push('notification_config_missing');
      }

      try {
        await this.getTopics();
        appTopicsReadable = true;
      } catch (error: any) {
        topicError = error?.response?.data?.errors?.[0]?.message || error?.message || 'topic_read_failed';
        blockers.push('notification_topics_unreachable');
      }

      try {
        const destinations = await this.getDestinations();
        destinationsReadable = true;
        const matched = (destinations?.destinations || []).find((destination: any) => {
          const candidateEndpoint =
            destination?.deliveryConfig?.endpoint ||
            destination?.deliveryConfig?.webhookEndpoint ||
            destination?.endpoint ||
            '';
          return endpoint && String(candidateEndpoint).replace(/\/$/, '') === endpoint.replace(/\/$/, '');
        });
        matchedDestinationId = matched?.destinationId || null;
        if (!matchedDestinationId) blockers.push('destination_not_registered');
      } catch (error: any) {
        destinationError =
          error?.response?.data?.errors?.[0]?.message || error?.message || 'destination_read_failed';
        blockers.push('destination_registry_unreachable');
      }
    }

    try {
      const subscriptions = await this.getSubscriptions();
      subscriptionsReadable = true;
      for (const subscription of subscriptions?.subscriptions || []) {
        if (
          matchedDestinationId &&
          String(subscription?.destinationId || '').trim() === matchedDestinationId
        ) {
          matchedSubscriptionIds.push(String(subscription.subscriptionId || subscription.topicId || ''));
          const topicId = String(subscription?.topicId || '').trim();
          if (topicId) matchedSubscriptionTopics.push(topicId);
        }
      }
      if (matchedDestinationId && matchedSubscriptionIds.length === 0) {
        blockers.push('destination_has_no_matching_subscription');
      }
    } catch (error: any) {
      const errorCode = error?.response?.data?.errors?.[0]?.errorId;
      const errorMessage =
        error?.response?.data?.errors?.[0]?.message || error?.message || 'subscription_read_failed';
      subscriptionError = errorMessage;
      if (errorCode === 195011 || /scope|permission/i.test(errorMessage)) {
        blockers.push('notification_scope_missing');
      } else if (/token|unauthor/i.test(errorMessage)) {
        blockers.push('user_notification_token_unusable');
      } else {
        blockers.push('subscription_registry_unreachable');
      }
    }

    return {
      endpoint,
      verificationTokenConfigured,
      alertEmailConfigured,
      alertEmail,
      appCredentialsPresent: this.hasAppCredentials,
      appTopicsReadable,
      destinationsReadable,
      subscriptionsReadable,
      matchedDestinationId,
      matchedSubscriptionIds,
      matchedSubscriptionTopics,
      blockers,
      topicError,
      destinationError,
      subscriptionError,
      configError,
    };
  }
}
