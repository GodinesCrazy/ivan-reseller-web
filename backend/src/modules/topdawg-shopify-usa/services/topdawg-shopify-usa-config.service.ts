import { prisma } from '../../../config/database';
import { env } from '../../../config/env';

const TD_DEFAULTS = {
  minMarginPct:       18,
  minProfitUsd:       2.0,
  maxShippingUsd:     12,
  minCostUsd:         5.0,
  defaultShippingUsd: 6.99,
} as const;

function trimOrNull(value: unknown): string | null {
  const out = String(value ?? '').trim();
  return out.length > 0 ? out : null;
}

function normalizeShopInput(value: string | null): string | null {
  if (!value) return null;
  const input = value.toLowerCase();
  if (input.includes('://')) {
    try { return new URL(input).hostname.toLowerCase(); } catch { return input; }
  }
  return input.replace(/^https?:\/\//, '').split('/')[0] || input;
}

export class TopDawgShopifyUsaConfigService {
  async getOrCreateSettings(userId: number) {
    let settings = await prisma.topDawgShopifyUsaAccountSettings.findUnique({ where: { userId } });
    if (!settings) {
      settings = await prisma.topDawgShopifyUsaAccountSettings.create({
        data: {
          userId,
          minMarginPct:       TD_DEFAULTS.minMarginPct,
          minProfitUsd:       TD_DEFAULTS.minProfitUsd,
          maxShippingUsd:     TD_DEFAULTS.maxShippingUsd,
          minCostUsd:         TD_DEFAULTS.minCostUsd,
          defaultShippingUsd: TD_DEFAULTS.defaultShippingUsd,
          shopifyStoreUrl:    'shop.ivanreseller.com',
        },
      });
    }
    return settings;
  }

  sanitizeSettings<T extends { topDawgApiKey?: string | null }>(settings: T) {
    const { topDawgApiKey, ...safe } = settings;
    return { ...safe, hasTopDawgApiKey: !!topDawgApiKey };
  }

  async getConfigSnapshot(userId: number) {
    const settings = await this.getOrCreateSettings(userId);
    const envShop = trimOrNull(env.SHOPIFY_SHOP);
    const dbShop  = trimOrNull(settings.shopifyStoreUrl);
    const resolvedShop = normalizeShopInput(envShop || dbShop);

    return {
      settings: this.sanitizeSettings(settings),
      auth: {
        mode: 'client_credentials',
        hasClientId:       trimOrNull(env.SHOPIFY_CLIENT_ID) != null,
        hasClientSecret:   trimOrNull(env.SHOPIFY_CLIENT_SECRET) != null,
        hasTopDawgApiKey:  !!settings.topDawgApiKey,
        resolvedShopDomain: resolvedShop,
      },
    };
  }

  async updateSettings(userId: number, input: Record<string, unknown>) {
    const settings = await this.getOrCreateSettings(userId);
    const data: Record<string, unknown> = { ...input };
    if ('shopifyStoreUrl' in data) {
      data['shopifyStoreUrl'] = normalizeShopInput(trimOrNull(data['shopifyStoreUrl']));
    }
    const updated = await prisma.topDawgShopifyUsaAccountSettings.update({
      where: { id: settings.id },
      data: data as Parameters<typeof prisma.topDawgShopifyUsaAccountSettings.update>[0]['data'],
    });
    return this.sanitizeSettings(updated);
  }
}

export const topDawgShopifyUsaConfigService = new TopDawgShopifyUsaConfigService();
