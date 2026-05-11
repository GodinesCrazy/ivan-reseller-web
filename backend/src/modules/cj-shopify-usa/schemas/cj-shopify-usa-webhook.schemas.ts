import { z } from 'zod';
import logger from '../../../config/logger';

/**
 * Minimal Shopify Admin webhook bodies (REST-style JSON).
 * Extra fields are allowed (passthrough) for forward compatibility.
 */
export const shopifyOrderWebhookBodySchema = z
  .object({
    id: z.union([z.number(), z.string(), z.bigint()]).optional(),
    admin_graphql_api_id: z.string().min(1).optional().nullable(),
  })
  .passthrough();

export type ShopifyOrderWebhookBody = z.infer<typeof shopifyOrderWebhookBodySchema>;

export const shopifyRefundCreateWebhookBodySchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    order_id: z.union([z.number(), z.string()]).optional(),
    admin_graphql_api_id: z.string().min(1).optional().nullable(),
    note: z.string().optional().nullable(),
    created_at: z.string().optional().nullable(),
    /** Present on some payloads */
    order: z
      .object({
        id: z.union([z.number(), z.string()]).optional(),
        admin_graphql_api_id: z.string().optional().nullable(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ShopifyRefundCreateWebhookBody = z.infer<typeof shopifyRefundCreateWebhookBodySchema>;

export function parseShopifyOrderWebhookBody(body: unknown): ShopifyOrderWebhookBody {
  const r = shopifyOrderWebhookBodySchema.safeParse(body);
  if (!r.success) {
    logger.warn('[cj-shopify-usa] Invalid Shopify order webhook payload', {
      issues: r.error.flatten(),
    });
    throw new Error('SHOPIFY_ORDER_WEBHOOK_PAYLOAD_INVALID');
  }
  return r.data;
}

export function safeParseShopifyOrderWebhookBody(
  body: unknown,
): { ok: true; data: ShopifyOrderWebhookBody } | { ok: false; error: z.ZodError } {
  const r = shopifyOrderWebhookBodySchema.safeParse(body);
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true, data: r.data };
}

export function parseShopifyRefundCreateWebhookBody(body: unknown): ShopifyRefundCreateWebhookBody {
  const r = shopifyRefundCreateWebhookBodySchema.safeParse(body);
  if (!r.success) {
    logger.warn('[cj-shopify-usa] Invalid Shopify refund webhook payload', {
      issues: r.error.flatten(),
    });
    throw new Error('SHOPIFY_REFUND_WEBHOOK_PAYLOAD_INVALID');
  }
  return r.data;
}

export function safeParseShopifyRefundCreateWebhookBody(
  body: unknown,
): { ok: true; data: ShopifyRefundCreateWebhookBody } | { ok: false; error: z.ZodError } {
  const r = shopifyRefundCreateWebhookBodySchema.safeParse(body);
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true, data: r.data };
}

/** Normalize order id to GraphQL gid used across the CJ Shopify USA module. */
export function normalizeShopifyWebhookOrderIdFromParsed(body: ShopifyOrderWebhookBody): string | null {
  const adminGid = String(body.admin_graphql_api_id || '').trim();
  if (adminGid) return adminGid;

  const raw = body.id;
  const numeric =
    raw === undefined || raw === null
      ? ''
      : typeof raw === 'bigint'
        ? raw.toString()
        : String(raw).trim();
  return numeric ? `gid://shopify/Order/${numeric}` : null;
}

export function normalizeShopifyOrderGidFromRefundPayload(body: ShopifyRefundCreateWebhookBody): string | null {
  const nested = body.order?.admin_graphql_api_id
    ? String(body.order.admin_graphql_api_id).trim()
    : '';
  if (nested) return nested;
  const topGid = String(body.admin_graphql_api_id || '').trim();
  if (topGid) return topGid;
  const oid = body.order_id ?? body.order?.id;
  if (oid === undefined || oid === null) return null;
  const numeric = String(oid).trim();
  return numeric ? `gid://shopify/Order/${numeric}` : null;
}
