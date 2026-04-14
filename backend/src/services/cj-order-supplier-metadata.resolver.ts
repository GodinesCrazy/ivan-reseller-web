/**
 * Resolves CJ create-order fields (cjVid, logisticName) from persisted sources
 * before falling back to explicit supplierMetadata only.
 *
 * Priority:
 * 1) supplierMetadata.cj (caller-supplied) — confidence high
 * 2) Nested supply / opportunity blobs on the order (non-eBay pipelines) — medium
 * 3) Product.productData JSON (cj / supplierCj keys) — medium-low
 * 4) Linked cj_ebay_orders row via paypalOrderId — confidence medium
 */
import { prisma } from '../config/database';
import logger from '../config/logger';

export type CjMappingConfidence = 'high' | 'medium' | 'low';

export type CjMetadataSource =
  | 'supplier_metadata'
  | 'order_metadata_supply'
  | 'product_data'
  | 'cj_ebay_order';

export interface ResolvedCjSupplierMetadata {
  cjVid: string;
  logisticName: string;
  quantity: number;
  confidence: CjMappingConfidence;
  source: CjMetadataSource;
}

function asObj(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, unknown>) : {};
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function parseQty(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : Math.max(1, fallback);
}

/**
 * Walks merged supplier metadata + recommendedSupplierMeta for CJ fields written by
 * opportunity / supply-quote / deep-quote flows (not eBay-vertical exclusive).
 */
function extractCjFromMetadataBlobs(
  merged: Record<string, unknown>,
  recommendedSupplierMeta: unknown,
  fallbackQty: number
): { cjVid: string; logisticName: string; quantity: number } | null {
  const blobs: Record<string, unknown>[] = [
    merged,
    asObj(merged.cj),
    asObj(merged.supplyRowMeta),
    asObj(merged.supplyMeta),
    asObj(merged.supply),
    asObj(merged.opportunity),
    asObj(merged.pipeline),
    asObj(merged.diagnostics),
    asObj(merged.opportunitySupply),
    asObj(merged.economicQuote),
    asObj(recommendedSupplierMeta),
  ];
  for (const b of blobs) {
    const cjVid = pickStr(b, ['cjVid', 'selectedCjVid', 'variantVid', 'cjVariantId', 'vid']);
    const logisticName = pickStr(b, [
      'logisticName',
      'cjFreightMethod',
      'serviceName',
      'freightMethod',
      'shippingMethod',
    ]);
    if (cjVid && logisticName) {
      const quantity = parseQty(b.quantity ?? merged.quantity, fallbackQty);
      return { cjVid, logisticName, quantity };
    }
  }
  return null;
}

function tryParseProductDataJson(productData: string | null | undefined): Record<string, unknown> | null {
  if (!productData || !String(productData).trim()) return null;
  try {
    const o = JSON.parse(String(productData)) as unknown;
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Extract CJ variant + logistics from Product.productData (global catalog path). */
function extractCjFromProductDataRoot(pd: Record<string, unknown>): { cjVid: string; logisticName: string; quantity: number } | null {
  const nested = [pd, asObj(pd.cj), asObj(pd.supplierCj), asObj(pd.cjSupply)];
  for (const b of nested) {
    const cjVid = pickStr(b, ['cjVid', 'selectedCjVid', 'variantVid']);
    const logisticName = pickStr(b, ['logisticName', 'cjFreightMethod', 'defaultLogisticName']);
    if (cjVid && logisticName) {
      return { cjVid, logisticName, quantity: parseQty(b.quantity, 1) };
    }
  }
  return null;
}

/** Extract eBay order id from internal paypalOrderId conventions. */
export function extractEbayOrderIdFromPaypalRef(paypalOrderId: string | null | undefined): string | null {
  const s = String(paypalOrderId || '').trim();
  if (!s) return null;
  if (s.startsWith('ebay:')) {
    const rest = s.slice(5).split(':')[0]?.trim();
    return rest || null;
  }
  if (s.startsWith('phase-d-cj:')) {
    const parts = s.split(':');
    if (parts.length >= 3 && parts[1] !== 'fallback') {
      return parts[1]?.trim() || null;
    }
  }
  return null;
}

export async function resolveCjSupplierMetadataForCreate(input: {
  userId: number | null;
  quantity: number;
  paypalOrderId: string | null;
  productId: number | null;
  productUrl: string | null;
  recommendedSupplierMeta: unknown;
  supplierMetadata: unknown;
  incomingMetadata?: Record<string, unknown>;
}): Promise<ResolvedCjSupplierMetadata | null> {
  const merged = { ...asObj(input.supplierMetadata), ...asObj(input.incomingMetadata) };
  const cj = asObj(merged.cj);
  const directVid = String(cj.cjVid || '').trim();
  const directLog = String(cj.logisticName || '').trim();
  if (directVid && directLog) {
    const qRaw = Number(cj.quantity ?? input.quantity ?? 1);
    const quantity = Number.isFinite(qRaw) && qRaw > 0 ? Math.floor(qRaw) : Math.max(1, input.quantity);
    return {
      cjVid: directVid,
      logisticName: directLog,
      quantity,
      confidence: 'high',
      source: 'supplier_metadata',
    };
  }

  const fromBlobs = extractCjFromMetadataBlobs(merged, input.recommendedSupplierMeta, input.quantity);
  if (fromBlobs) {
    return {
      ...fromBlobs,
      confidence: 'medium',
      source: 'order_metadata_supply',
    };
  }

  if (input.productId != null && input.userId != null) {
    try {
      const p = await prisma.product.findFirst({
        where: { id: input.productId, userId: input.userId },
        select: { productData: true },
      });
      const pd = tryParseProductDataJson(p?.productData ?? null);
      if (pd) {
        const fromPd = extractCjFromProductDataRoot(pd);
        if (fromPd) {
          return {
            cjVid: fromPd.cjVid,
            logisticName: fromPd.logisticName,
            quantity: fromPd.quantity,
            confidence: 'low',
            source: 'product_data',
          };
        }
      }
    } catch (e) {
      logger.warn('[CJ-META-RESOLVER] product.productData lookup failed', {
        productId: input.productId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const ebayOrderId = extractEbayOrderIdFromPaypalRef(input.paypalOrderId);
  if (!ebayOrderId || input.userId == null) {
    return null;
  }

  try {
    const row = await prisma.cjEbayOrder.findUnique({
      where: {
        userId_ebayOrderId: { userId: input.userId, ebayOrderId },
      },
      include: {
        variant: { select: { cjVid: true } },
        listing: {
          include: {
            shippingQuote: { select: { serviceName: true } },
          },
        },
      },
    });
    if (!row?.variant?.cjVid) {
      logger.info('[CJ-META-RESOLVER] cj_ebay_order found but no variant.cjVid', {
        ebayOrderId,
        userId: input.userId,
      });
      return null;
    }
    const logisticName = String(row.listing?.shippingQuote?.serviceName || '').trim();
    if (!logisticName) {
      logger.info('[CJ-META-RESOLVER] cj_ebay_order missing listing.shippingQuote.serviceName', {
        ebayOrderId,
        userId: input.userId,
      });
      return null;
    }
    const qty = Math.max(1, row.lineQuantity || input.quantity || 1);
    return {
      cjVid: String(row.variant.cjVid).trim(),
      logisticName,
      quantity: qty,
      confidence: 'medium',
      source: 'cj_ebay_order',
    };
  } catch (e) {
    logger.warn('[CJ-META-RESOLVER] cj_ebay_order lookup failed', {
      ebayOrderId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
