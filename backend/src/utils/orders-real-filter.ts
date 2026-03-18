/**
 * Phase 44: Real-orders-only filter for GET /api/orders.
 * Only eBay, Mercado Libre, Amazon; exclude test/demo/mock and checkout.
 */

export const REAL_ORDERS_EXCLUDE_PAYPAL_PREFIXES = [
  'TEST',
  'test',
  'DEMO',
  'demo',
  'MOCK',
  'mock',
  'SIM_',
  'ORD-TEST',
];

export const REAL_ORDERS_MARKETPLACE_PREFIXES = ['ebay:', 'mercadolibre:', 'amazon:'];

/** Returns true if paypalOrderId belongs to a real marketplace order (eBay, ML, Amazon) and is not test/demo/mock. */
export function isRealMarketplaceOrderPaypalId(paypalOrderId: string | null): boolean {
  if (!paypalOrderId || !paypalOrderId.trim()) return false;
  const p = paypalOrderId.trim();
  if (!REAL_ORDERS_MARKETPLACE_PREFIXES.some((prefix) => p.startsWith(prefix))) return false;
  return !REAL_ORDERS_EXCLUDE_PAYPAL_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/** Builds Prisma where clause for list: only real marketplace orders. */
export function buildRealOrdersWhere(baseWhere: Record<string, unknown>) {
  return {
    ...baseWhere,
    OR: REAL_ORDERS_MARKETPLACE_PREFIXES.map((prefix) => ({
      paypalOrderId: { startsWith: prefix },
    })),
    AND: REAL_ORDERS_EXCLUDE_PAYPAL_PREFIXES.map((prefix) => ({
      paypalOrderId: { not: { startsWith: prefix } },
    })),
  } as const;
}
