import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';

interface ShopifyAuthTestResult {
  ok: boolean;
  shopData?: {
    name: string;
    currency: string;
    country: string;
    primaryDomainUrl: string;
  };
  grantedScopes?: string[];
  missingScopes?: string[];
  locations?: Array<{
    id: string;
    name: string;
    isActive?: boolean | null;
    fulfillsOnlineOrders?: boolean | null;
  }>;
  publications?: Array<{
    id: string;
    name: string;
    autoPublish?: boolean | null;
    supportsFuturePublishing?: boolean | null;
  }>;
  webhookSubscriptions?: Array<{
    id: string;
    topic: string;
    uri: string;
  }>;
  authMode?: 'client_credentials';
  shopDomain?: string;
  accessTokenExpiresAt?: string;
  error?: string;
}

export class CjShopifyUsaAuthService {
  async testConnection(userId: number): Promise<ShopifyAuthTestResult> {
    try {
      const probe = await cjShopifyUsaAdminService.probeConnection(userId);
      return {
        ok: probe.missingScopes.length === 0,
        authMode: 'client_credentials',
        shopDomain: probe.shopDomain,
        accessTokenExpiresAt: probe.accessTokenExpiresAt,
        grantedScopes: probe.grantedScopes,
        missingScopes: probe.missingScopes,
        locations: probe.locations,
        publications: probe.publications,
        webhookSubscriptions: probe.webhookSubscriptions,
        shopData: {
          name: probe.shop.name,
          currency: probe.shop.currencyCode,
          country: probe.shop.countryCode,
          primaryDomainUrl: probe.shop.primaryDomainUrl,
        },
        error:
          probe.missingScopes.length > 0
            ? `Missing Shopify scopes: ${probe.missingScopes.join(', ')}`
            : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const cjShopifyUsaAuthService = new CjShopifyUsaAuthService();
