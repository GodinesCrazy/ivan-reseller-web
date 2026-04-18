import { z } from 'zod';

export const cjMlChileUpdateConfigSchema = z.object({
  minMarginPct: z.number().min(0).max(100).nullable().optional(),
  minProfitUsd: z.number().min(0).nullable().optional(),
  minStock: z.number().int().min(0).optional(),
  maxShippingUsd: z.number().min(0).nullable().optional(),
  mlcFeePct: z.number().min(0).max(100).optional(),
  mpPaymentFeePct: z.number().min(0).max(100).optional(),
  incidentBufferPct: z.number().min(0).max(100).optional(),
  requireChileWarehouse: z.boolean().optional(),
  rejectOnUnknownShipping: z.boolean().optional(),
});

export const cjMlChileSearchBodySchema = z.object({
  query: z.string().min(1).max(200),
  page: z.number().int().min(1).max(100).optional().default(1),
  pageSize: z.number().int().min(1).max(50).optional().default(20),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
});

export const cjMlChileShippingQuoteBodySchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
});

export const cjMlChileEvaluateBodySchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
});

export const cjMlChileListingDraftBodySchema = z.object({
  evaluationId: z.number().int().positive(),
  listPriceCLP: z.number().int().positive().optional(),
  title: z.string().min(1).max(60).optional(),
  categoryId: z.string().optional(),
  quantity: z.number().int().min(1).optional().default(10),
  handlingTimeDays: z.number().int().min(1).max(30).optional().default(5),
});

export const cjMlChileListingPublishBodySchema = z.object({
  listingId: z.number().int().positive(),
});

export const cjMlChileOrderImportBodySchema = z.object({
  mlOrderId: z.string().min(1),
});

export type CjMlChileUpdateConfigBody = z.infer<typeof cjMlChileUpdateConfigSchema>;
export type CjMlChileSearchBody = z.infer<typeof cjMlChileSearchBodySchema>;
export type CjMlChileShippingQuoteBody = z.infer<typeof cjMlChileShippingQuoteBodySchema>;
export type CjMlChileEvaluateBody = z.infer<typeof cjMlChileEvaluateBodySchema>;
export type CjMlChileListingDraftBody = z.infer<typeof cjMlChileListingDraftBodySchema>;
export type CjMlChileListingPublishBody = z.infer<typeof cjMlChileListingPublishBodySchema>;
export type CjMlChileOrderImportBody = z.infer<typeof cjMlChileOrderImportBodySchema>;
