/**
 * Pure helpers for CJ eBay → legacy Order supplierMetadata (unit-testable).
 */

import type { Prisma } from '@prisma/client';

type CjListingRow = {
  id: number;
  ebaySku: string | null;
  evaluationId: number | null;
  shippingQuoteId: number | null;
  product: { cjProductId: string; title: string };
  variant: { cjVid: string | null; cjSku: string } | null;
};

export function buildCjEbayBridgeSupplierMetadata(cjRow: CjListingRow): Record<string, unknown> {
  const pid = String(cjRow.product.cjProductId || '').trim();
  return {
    mappingSource: 'ebay_line_sku_cj_ebay_listing',
    mappingConfidence: 'high',
    sourceMarketplace: 'cjdropshipping',
    supplier: 'cj',
    cjEbayListingId: cjRow.id,
    cjProductId: pid,
    cjVid: cjRow.variant?.cjVid ?? null,
    cjSku: cjRow.variant?.cjSku ?? null,
    ebaySku: cjRow.ebaySku,
    evaluationId: cjRow.evaluationId,
    shippingQuoteId: cjRow.shippingQuoteId,
  };
}

export function cjEbayBridgeMetadataAsJson(
  cjRow: CjListingRow
): Prisma.InputJsonValue {
  return buildCjEbayBridgeSupplierMetadata(cjRow) as Prisma.InputJsonValue;
}
