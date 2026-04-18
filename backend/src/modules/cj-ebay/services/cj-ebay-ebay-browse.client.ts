/**
 * CJ → eBay USA — eBay Browse API client (FASE 3G.1).
 *
 * Uses the eBay Application OAuth (Client Credentials) flow to obtain an
 * app-level access token, then calls the Browse API's item_summary/search
 * endpoint.  No user-level token is required — just appId + certId.
 *
 * The token is cached in-process with 5-minute early-expiry so successive
 * calls within a run share the same token.
 */

import axios from 'axios';
import { logger } from '../../../config/logger';
import { CredentialsManager } from '../../../services/credentials-manager.service';

// ====================================
// PUBLIC TYPES
// ====================================

export interface EbayBrowseItem {
  itemId: string;
  title: string;
  price: { value: number; currency: string };
  condition: string;
  image?: { imageUrl: string };
  itemWebUrl?: string;
}

export interface EbayBrowseSearchResult {
  total: number;
  items: EbayBrowseItem[];
  searchQuery: string;
}

// ====================================
// TOKEN CACHE (process-level)
// ====================================

interface CachedToken {
  token: string;
  expiresAt: Date;
}

const _tokenCache = new Map<string, CachedToken>();

// ====================================
// CLIENT
// ====================================

export class CjEbayEbayBrowseClient {
  private readonly cacheKey: string;

  constructor(
    private readonly appId: string,
    private readonly certId: string,
    private readonly sandbox: boolean,
  ) {
    this.cacheKey = `${appId}:${sandbox ? 'sb' : 'prod'}`;
  }

  private get tokenUrl(): string {
    return this.sandbox
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
      : 'https://api.ebay.com/identity/v1/oauth2/token';
  }

  private get browseBase(): string {
    return this.sandbox
      ? 'https://api.sandbox.ebay.com/buy/browse/v1'
      : 'https://api.ebay.com/buy/browse/v1';
  }

  private async getAppToken(): Promise<string> {
    const cached = _tokenCache.get(this.cacheKey);
    if (cached && cached.expiresAt > new Date()) return cached.token;

    const basic = Buffer.from(`${this.appId}:${this.certId}`).toString('base64');
    const res = await axios.post<{ access_token: string; expires_in: number }>(
      this.tokenUrl,
      'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
      {
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 12_000,
      },
    );

    const token = res.data.access_token;
    // Cache with 5-minute early expiry
    const ttl = Math.max((res.data.expires_in ?? 7200) - 300, 60);
    _tokenCache.set(this.cacheKey, { token, expiresAt: new Date(Date.now() + ttl * 1000) });
    logger.info(`[EbayBrowseClient] App token refreshed (ttl=${ttl}s, sandbox=${this.sandbox})`);
    return token;
  }

  /**
   * Search eBay active fixed-price new-condition listings for the given keyword.
   * Returns up to `limit` items (max 200).
   */
  async searchItems(keyword: string, limit = 50): Promise<EbayBrowseSearchResult> {
    const token = await this.getAppToken();
    const params = new URLSearchParams({
      q: keyword,
      limit: String(Math.min(limit, 200)),
      filter: 'buyingOptions:{FIXED_PRICE},conditions:{NEW}',
      sort: 'bestMatch',
    });

    const res = await axios.get<{
      total?: number;
      itemSummaries?: Array<{
        itemId: string;
        title: string;
        price?: { value: string; currency: string };
        condition?: string;
        image?: { imageUrl: string };
        itemWebUrl?: string;
      }>;
    }>(`${this.browseBase}/item_summary/search?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
      timeout: 15_000,
    });

    const items: EbayBrowseItem[] = (res.data.itemSummaries ?? [])
      .filter((i) => i.price?.value != null)
      .map((i) => ({
        itemId: i.itemId,
        title: i.title,
        price: {
          value: parseFloat(i.price!.value),
          currency: i.price!.currency ?? 'USD',
        },
        condition: i.condition ?? 'UNKNOWN',
        image: i.image,
        itemWebUrl: i.itemWebUrl,
      }));

    return { total: res.data.total ?? 0, items, searchQuery: keyword };
  }
}

// ====================================
// FACTORY
// ====================================

/**
 * Creates a Browse client for the given user, using their stored eBay
 * credentials.  Returns null if no usable credentials are found.
 */
export async function createEbayBrowseClient(
  userId: number,
): Promise<CjEbayEbayBrowseClient | null> {
  for (const env of ['production', 'sandbox'] as const) {
    const entry = await CredentialsManager.getCredentialEntry(userId, 'ebay', env);
    if (!entry?.credentials) continue;
    const appId = String(entry.credentials.appId ?? '').trim();
    const certId = String(entry.credentials.certId ?? '').trim();
    if (!appId || !certId) continue;
    return new CjEbayEbayBrowseClient(appId, certId, env === 'sandbox');
  }
  return null;
}
