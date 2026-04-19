import { prisma } from '../../../config/database';
import { env } from '../../../config/env';

type ShopifySettingsUpdateInput = Partial<
  Parameters<typeof prisma.cjShopifyUsaAccountSettings.update>[0]['data']
>;

function trimOrNull(value: unknown): string | null {
  const out = String(value ?? '').trim();
  return out.length > 0 ? out : null;
}

function normalizeShopInput(value: string | null): string | null {
  if (!value) return null;
  const input = value.toLowerCase();
  if (input.includes('://')) {
    try {
      return new URL(input).hostname.toLowerCase();
    } catch {
      return input;
    }
  }
  return input.replace(/^https?:\/\//, '').split('/')[0] || input;
}

export class CjShopifyUsaConfigService {
  async getOrCreateSettings(userId: number) {
    let settings = await prisma.cjShopifyUsaAccountSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await prisma.cjShopifyUsaAccountSettings.create({
        data: {
          userId,
          minMarginPct: 15,
          minStock: 1,
          handlingBufferDays: 3,
        },
      });
    }

    return settings;
  }

  sanitizeSettings<T extends { shopifyAccessToken?: string | null }>(settings: T) {
    const { shopifyAccessToken: _legacyToken, ...safeSettings } = settings;
    return safeSettings;
  }

  async getConfigSnapshot(userId: number) {
    const settings = await this.getOrCreateSettings(userId);
    const envShop = trimOrNull(env.SHOPIFY_SHOP);
    const dbShop = trimOrNull(settings.shopifyStoreUrl);
    const resolvedShop = normalizeShopInput(envShop || dbShop);

    return {
      settings: this.sanitizeSettings(settings),
      auth: {
        mode: 'client_credentials',
        tokenStorage: 'env_only_short_lived',
        hasClientId: trimOrNull(env.SHOPIFY_CLIENT_ID) != null,
        hasClientSecret: trimOrNull(env.SHOPIFY_CLIENT_SECRET) != null,
        resolvedShopDomain: resolvedShop,
        resolvedShopSource: envShop ? 'env' : dbShop ? 'db' : null,
      },
    };
  }

  async updateSettings(userId: number, input: ShopifySettingsUpdateInput) {
    const settings = await this.getOrCreateSettings(userId);
    const nextInput = { ...input } as ShopifySettingsUpdateInput & { shopifyAccessToken?: unknown };

    // Legacy field retained in schema for backwards compatibility, but not accepted anymore.
    delete nextInput.shopifyAccessToken;

    if ('shopifyStoreUrl' in nextInput) {
      nextInput.shopifyStoreUrl = normalizeShopInput(trimOrNull(nextInput.shopifyStoreUrl));
    }

    const updated = await prisma.cjShopifyUsaAccountSettings.update({
      where: { id: settings.id },
      data: nextInput,
    });

    return this.sanitizeSettings(updated);
  }

  async validateSettingsReady(userId: number) {
    const settings = await this.getOrCreateSettings(userId);
    if (!trimOrNull(env.SHOPIFY_CLIENT_ID) || !trimOrNull(env.SHOPIFY_CLIENT_SECRET)) {
      return {
        ready: false,
        reason: 'Missing Shopify client credentials in env',
      };
    }

    const resolvedShop = normalizeShopInput(trimOrNull(env.SHOPIFY_SHOP) || trimOrNull(settings.shopifyStoreUrl));
    if (!resolvedShop) {
      return {
        ready: false,
        reason: 'Missing Shopify shop domain',
      };
    }

    if (!resolvedShop.endsWith('.myshopify.com')) {
      return {
        ready: false,
        reason: 'Shopify shop domain must use the myshopify domain',
      };
    }

    return { ready: true };
  }
}

export const cjShopifyUsaConfigService = new CjShopifyUsaConfigService();
