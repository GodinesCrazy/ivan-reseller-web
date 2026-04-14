import { z } from 'zod';

/** POST /api/cj-ebay/config — partial update; omitted fields stay unchanged */
export const cjEbayUpdateConfigSchema = z
  .object({
    minMarginPct: z.number().min(0).max(100).nullable().optional(),
    minProfitUsd: z.number().min(0).nullable().optional(),
    maxShippingUsd: z.number().min(0).nullable().optional(),
    handlingBufferDays: z.number().int().min(0).max(90).optional(),
    minStock: z.number().int().min(0).max(1_000_000).optional(),
    rejectOnUnknownShipping: z.boolean().optional(),
    maxRiskScore: z.number().int().min(0).max(100).nullable().optional(),
    priceChangePctReevaluate: z.number().min(0).max(100).nullable().optional(),
    incidentBufferPct: z.number().min(0).max(100).nullable().optional(),
    defaultEbayFeePct: z.number().min(0).max(100).nullable().optional(),
    defaultPaymentFeePct: z.number().min(0).max(100).nullable().optional(),
    defaultPaymentFixedFeeUsd: z.number().min(0).nullable().optional(),
    cjPostCreateCheckoutMode: z.enum(['MANUAL', 'AUTO_CONFIRM_PAY']).optional(),
  })
  .strict();

export type CjEbayUpdateConfigBody = z.infer<typeof cjEbayUpdateConfigSchema>;

/** POST /api/cj-ebay/cj/search */
export const cjSearchBodySchema = z
  .object({
    keyword: z.string().min(1).max(500).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
    productQueryBody: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine(
    (d) =>
      (d.productQueryBody != null && Object.keys(d.productQueryBody).length > 0) ||
      (d.keyword != null && d.keyword.trim().length > 0) ||
      d.page != null ||
      d.pageSize != null,
    {
      message:
        'Provide keyword, page/pageSize, and/or non-empty productQueryBody (CJ search uses GET product/listV2)',
    }
  );

export type CjSearchBody = z.infer<typeof cjSearchBodySchema>;

/**
 * POST /api/cj-ebay/cj/shipping-quote — FASE 3B.1: payload oficial `freightCalculate` generado en servidor.
 * Requiere `variantId` (CJ vid) o `productId` (CJ pid) si hay una sola variante con vid.
 */
export const cjShippingQuoteBodySchema = z
  .object({
    variantId: z.string().min(1).max(200).optional(),
    productId: z.string().min(1).max(200).optional(),
    quantity: z.coerce.number().int().min(1).max(9999),
    destPostalCode: z.string().max(32).optional(),
    startCountryCode: z.string().min(2).max(2).optional(),
  })
  .strict()
  .refine((d) => !!(d.variantId?.trim() || d.productId?.trim()), {
    message: 'Provide variantId (CJ vid) or productId (CJ pid)',
    path: ['variantId'],
  });

export type CjShippingQuoteBody = z.infer<typeof cjShippingQuoteBodySchema>;

/** POST /api/cj-ebay/evaluate y POST /api/cj-ebay/pricing/preview (FASE 3C) */
export const cjEbayEvaluateBodySchema = z
  .object({
    productId: z.string().min(1).max(200),
    variantId: z.string().min(1).max(200),
    quantity: z.coerce.number().int().min(1).max(9999),
    destPostalCode: z.string().max(32).optional(),
  })
  .strict();

export type CjEbayEvaluateBody = z.infer<typeof cjEbayEvaluateBodySchema>;

/**
 * POST /api/cj-ebay/opportunities/ebay-pipeline — evaluate → draft → optional publish (Opportunities / Research).
 * `variantId` opcional: si el producto CJ tiene una sola variante, el servidor elige vid/sku automáticamente.
 */
export const cjEbayOpportunityPipelineBodySchema = z
  .object({
    productId: z.string().min(1).max(200),
    variantId: z.string().min(1).max(200).optional(),
    quantity: z.coerce.number().int().min(1).max(9999),
    destPostalCode: z.string().max(32).optional(),
    draftOnly: z.boolean().optional(),
    publish: z.boolean().optional(),
  })
  .strict();

export type CjEbayOpportunityPipelineBody = z.infer<typeof cjEbayOpportunityPipelineBodySchema>;

/** POST /api/cj-ebay/listings/draft — mismo cuerpo que evaluate/preview */
export const cjEbayListingDraftBodySchema = cjEbayEvaluateBodySchema;

/** POST /api/cj-ebay/listings/publish — id fila local `cj_ebay_listings` */
export const cjEbayListingPublishBodySchema = z
  .object({
    listingId: z.union([
      z.number().int().positive(),
      z.string().regex(/^\d+$/).transform((s) => parseInt(s, 10)),
    ]),
  })
  .strict();

export type CjEbayListingPublishBody = z.infer<typeof cjEbayListingPublishBodySchema>;

/** POST /api/cj-ebay/orders/import */
export const cjEbayOrderImportBodySchema = z
  .object({
    ebayOrderId: z.string().min(1).max(200).trim(),
  })
  .strict();

export type CjEbayOrderImportBody = z.infer<typeof cjEbayOrderImportBodySchema>;
