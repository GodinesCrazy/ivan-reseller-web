import { z } from 'zod';

export const cjShopifyUsaUpdateConfigSchema = z.object({
  minMarginPct: z.number().min(0).max(100).optional(),
  minProfitUsd: z.number().min(0).optional(),
  maxShippingUsd: z.number().min(0).optional(),
  handlingBufferDays: z.number().min(0).max(30).optional(),
  minStock: z.number().min(0).optional(),
  rejectOnUnknownShipping: z.boolean().optional(),
  maxRiskScore: z.number().min(0).max(100).optional(),
  priceChangePctReevaluate: z.number().min(0).max(100).optional(),
  incidentBufferPct: z.number().min(0).max(100).optional(),
  defaultPaymentFeePct: z.number().min(0).max(100).optional(),
  defaultPaymentFixedFeeUsd: z.number().min(0).optional(),
  cjPostCreateCheckoutMode: z.enum(['MANUAL', 'AUTO_CONFIRM_PAY']).optional(),
  // Safe metadata only. Accepts handle, myshopify domain, or full URL.
  shopifyStoreUrl: z.string().min(1).optional().nullable(),
  shopifyLocationId: z.string().optional().nullable(),
});

export const cjShopifyUsaEvaluateBodySchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  destPostalCode: z.string().optional(),
});

export const cjShopifyUsaListingDraftBodySchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  destPostalCode: z.string().optional(),
});

export const cjShopifyUsaListingPublishBodySchema = z.object({
  listingId: z.number().int().positive(),
  revertToDraft: z.boolean().optional(),
});

export const cjShopifyUsaOrderImportBodySchema = z.object({
  shopifyOrderId: z.string().min(1).optional(),
  sinceHours: z.number().int().min(1).max(720).optional(),
  first: z.number().int().min(1).max(50).optional(),
});

export const cjShopifyUsaTrackingSyncBodySchema = z.object({
  carrierCode: z.string().min(1).optional(),
  trackingNumber: z.string().min(1).optional(),
  trackingUrl: z.string().url().optional(),
  notifyCustomer: z.boolean().optional(),
});

export const cjShopifyUsaOpportunityPipelineBodySchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  destPostalCode: z.string().optional(),
  draftOnly: z.boolean().default(false),
  publish: z.boolean().default(false),
});

export const cjShopifyUsaDiscoverSearchSchema = z.object({
  keyword: z.string().min(1).max(200),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const cjShopifyUsaDiscoverEvaluateBodySchema = z.object({
  cjProductId: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  destPostalCode: z.string().optional(),
});

export const cjShopifyUsaDiscoverImportDraftBodySchema = z.object({
  cjProductId: z.string().min(1),
  variantCjVid: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  destPostalCode: z.string().optional(),
});

export const cjShopifyUsaDiscoverAiSuggestionsBodySchema = z.object({
  count: z.number().int().min(3).max(12).optional(),
  destPostalCode: z.string().optional(),
  keywords: z.array(z.string().min(2).max(80)).max(10).optional(),
});
