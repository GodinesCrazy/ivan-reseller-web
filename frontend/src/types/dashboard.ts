/**
 * Shared dashboard/inventory types. Used by Dashboard, Products, InventorySummaryCard.
 */

export const DEFAULT_ORDERS_BY_STATUS = {
  CREATED: 0,
  PAID: 0,
  PURCHASING: 0,
  PURCHASED: 0,
  FAILED: 0,
} as const;

export interface InventorySummary {
  products: {
    total: number;
    pending: number;
    approved: number;
    published: number;
    validatedReady?: number;
    legacyUnverified?: number;
  };
  listingsByMarketplace: { ebay: number; mercadolibre: number; amazon: number };
  ordersByStatus?: { CREATED: number; PAID: number; PURCHASING: number; PURCHASED: number; FAILED: number };
  pendingPurchasesCount?: number;
  listingsTotal?: number;
  listingsSource?: 'api' | 'database';
  lastSyncAt?: string;
  mercadolibreActiveCount?: number;
}

/** Full shape with required ordersByStatus and pendingPurchasesCount (after normalization). */
export interface NormalizedInventorySummary extends InventorySummary {
  ordersByStatus: { CREATED: number; PAID: number; PURCHASING: number; PURCHASED: number; FAILED: number };
  pendingPurchasesCount: number;
}

/** Normalize API response to full shape (for Card and other consumers that expect required fields). */
export function normalizeInventorySummary(raw: InventorySummary | null | undefined): NormalizedInventorySummary | null {
  if (!raw) return null;
  return {
    ...raw,
    ordersByStatus: raw.ordersByStatus ?? { ...DEFAULT_ORDERS_BY_STATUS },
    pendingPurchasesCount: raw.pendingPurchasesCount ?? 0,
  };
}
