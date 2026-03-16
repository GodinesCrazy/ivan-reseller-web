/**
 * Inventory Sync Service — Phase 1
 * Runs every 6 hours via BullMQ worker "inventory-sync".
 * Steps: check supplier stock (via SupplierAdapter), update local stock, pause listing if stock = 0, resume if restored.
 * Phase 2: Uses AliExpressSupplierAdapter for products with aliexpressUrl; additional suppliers can be registered later.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { aliExpressSupplierAdapter } from './adapters/aliexpress-supplier.adapter';
import type { SupplierAdapter } from './supplier-adapter.types';

export interface InventorySyncResult {
  processed: number;
  updated: number;
  paused: number;
  resumed: number;
  errors: string[];
}

/** Resolve supplier adapter for a product URL (currently only AliExpress). */
function getAdapterForUrl(url: string): SupplierAdapter | null {
  if (aliExpressSupplierAdapter.getProductIdFromUrl(url)) return aliExpressSupplierAdapter;
  return null;
}

/**
 * Extract AliExpress product ID from item URL (e.g. https://www.aliexpress.com/item/1234567890.html)
 * @deprecated Prefer using aliExpressSupplierAdapter.getProductIdFromUrl for new code.
 */
export function extractAliExpressProductId(aliexpressUrl: string): string | null {
  return aliExpressSupplierAdapter.getProductIdFromUrl(aliexpressUrl);
}

/**
 * Run one pass of inventory sync for all products that have marketplace listings and an AliExpress URL.
 * For each product: get stock from AliExpress, update Product.supplierStock and supplierStockCheckedAt,
 * then sync quantity to marketplaces (0 = pause, >0 = resume).
 */
export async function runInventorySync(): Promise<InventorySyncResult> {
  const result: InventorySyncResult = { processed: 0, updated: 0, paused: 0, resumed: 0, errors: [] };

  const listings = await prisma.marketplaceListing.findMany({
    where: { publishedAt: { not: null } },
    include: {
      product: {
        select: {
          id: true,
          userId: true,
          aliexpressUrl: true,
          supplierStock: true,
          supplierStockCheckedAt: true,
        },
      },
    },
  });

  const productIds = new Set<number>();
  for (const l of listings) {
    const p = (l as any).product;
    if (p?.id && p.aliexpressUrl) productIds.add(p.id);
  }

  for (const productId of productIds) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        userId: true,
        aliexpressUrl: true,
        supplierStock: true,
        supplierStockCheckedAt: true,
      },
    });
    if (!product?.aliexpressUrl) continue;

    const adapter = getAdapterForUrl(product.aliexpressUrl);
    const supplierProductId = adapter?.getProductIdFromUrl(product.aliexpressUrl) ?? null;
    if (!adapter || !supplierProductId) {
      logger.debug('[INVENTORY-SYNC] Skip product, no supported supplier ID in URL', {
        productId: product.id,
        url: product.aliexpressUrl?.slice(0, 60),
      });
      continue;
    }

    result.processed++;

    const userId = product.userId;
    const environment = 'production' as const;
    let supplierStock: number;
    try {
      supplierStock = await adapter.getStock(supplierProductId, { userId });
    } catch (e: any) {
      const msg = e?.message || String(e);
      logger.warn('[INVENTORY-SYNC] Supplier getStock failed', {
        productId,
        supplierId: adapter.supplierId,
        supplierProductId,
        error: msg,
      });
      result.errors.push(`product ${productId}: ${msg}`);
      continue;
    }

    const now = new Date();
    const previousStock = product.supplierStock ?? null;

    await prisma.product.update({
      where: { id: productId },
      data: {
        supplierStock,
        supplierStockCheckedAt: now,
      },
    });
    result.updated++;

    const quantityToSync = supplierStock <= 0 ? 0 : supplierStock;

    try {
      const MarketplaceService = (await import('./marketplace.service')).default;
      const marketplaceService = new MarketplaceService();
      await marketplaceService.syncInventory(userId, productId, quantityToSync, environment);
    } catch (e: any) {
      const msg = e?.message || String(e);
      logger.warn('[INVENTORY-SYNC] syncInventory to marketplaces failed', {
        productId,
        quantityToSync,
        error: msg,
      });
      result.errors.push(`product ${productId} sync: ${msg}`);
      continue;
    }

    if (previousStock !== null && previousStock > 0 && quantityToSync === 0) {
      result.paused++;
      logger.info('[INVENTORY-SYNC] Listing paused (out of stock)', { productId, userId });
    } else if (previousStock === 0 && quantityToSync > 0) {
      result.resumed++;
      logger.info('[INVENTORY-SYNC] Listing resumed (stock restored)', { productId, userId, quantityToSync });
    }
  }

  logger.info('[INVENTORY-SYNC] Run complete', result);
  return result;
}
