import { z } from 'zod';

export const topDawgShopifyUsaUpdateConfigSchema = z.object({
  shopifyStoreUrl:    z.string().min(1).optional().nullable(),
  topDawgApiKey:      z.string().min(1).optional().nullable(),
  minMarginPct:       z.number().min(0).max(100).optional(),
  minProfitUsd:       z.number().min(0).optional(),
  maxShippingUsd:     z.number().min(0).optional(),
  minCostUsd:         z.number().min(0).optional(),
  defaultShippingUsd: z.number().min(0).optional(),
});

export const topDawgShopifyUsaDiscoverSearchSchema = z.object({
  keyword:  z.string().min(1),
  page:     z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export const topDawgShopifyUsaDiscoverEvaluateSchema = z.object({
  tdSku:        z.string().min(1),
  tdVariantSku: z.string().min(1).optional(),
});

export const topDawgShopifyUsaDiscoverImportDraftSchema = z.object({
  tdSku:        z.string().min(1),
  tdVariantSku: z.string().min(1).optional(),
});

export const topDawgShopifyUsaListingDraftSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().optional(),
});

export const topDawgShopifyUsaListingPublishSchema = z.object({
  listingIds: z.array(z.number().int().positive()).min(1).max(100),
});

export const topDawgShopifyUsaOrderSyncSchema = z.object({
  sinceHours:     z.number().int().min(1).max(720).default(24),
  first:          z.number().int().min(1).max(250).default(50),
  shopifyOrderId: z.string().optional(),
});

export const topDawgShopifyUsaAutomationConfigSchema = z.object({
  intervalHours:   z.number().min(0.5).max(24).optional(),
  maxDailyPublish: z.number().int().min(1).max(1000).optional(),
  maxPerCycle:     z.number().int().min(1).max(200).optional(),
  minMarginPct:    z.number().min(0).max(100).optional(),
  autoPublish:     z.boolean().optional(),
  categories:      z.array(z.string()).optional(),
});
