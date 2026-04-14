import { normalizeAliExpressFreightQuoteResult } from './aliexpress-freight-normalizer';

function parsePositiveInt(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
  if (typeof v === 'string') {
    const m = v.match(/\d+/);
    if (m) {
      const n = parseInt(m[0], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseProductDataRecord(product: unknown): Record<string, unknown> {
  const raw = (product as { productData?: unknown })?.productData;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Best-effort supplier-side delivery hint (calendar days) from persisted product metadata.
 * Used to build a buyer-facing business-day range on eBay US listings.
 */
export function extractSupplierDeliveryDaysHint(product: unknown): number | undefined {
  const meta = parseProductDataRecord(product);
  const sourceData = asRecord(meta.sourceData);
  const shippingFromSource = sourceData ? asRecord(sourceData.shipping_info) : null;
  const logisticsFromSource = sourceData ? asRecord(sourceData.logistics_info_dto) : null;

  const candidates: unknown[] = [
    meta.estimatedDeliveryDays,
    meta.shippingDaysMax,
    meta.deliveryDays,
    asRecord(meta.shipping)?.estimatedDays,
    asRecord(meta.mlChileFreight)?.selectedEstimatedDeliveryTime,
    shippingFromSource?.estimated_days,
    logisticsFromSource?.delivery_time,
    asRecord(meta.preventivePublish)?.estimatedDeliveryDays,
  ];

  for (const c of candidates) {
    const n = parsePositiveInt(c);
    if (n != null && n <= 120) return n;
  }

  for (const key of ['ebayUsFreightQuote', 'aliexpressFreightQuote', 'freightQuote', 'buyerFreightRaw']) {
    const raw = meta[key];
    const rec = asRecord(raw);
    if (!rec) continue;
    const norm = normalizeAliExpressFreightQuoteResult(rec);
    for (const opt of norm.options) {
      if (opt.estimatedDeliveryTime != null && Number.isFinite(Number(opt.estimatedDeliveryTime))) {
        const n = Math.floor(Number(opt.estimatedDeliveryTime));
        if (n > 0 && n <= 120) return n;
      }
    }
  }

  return undefined;
}

export type EbayUsDeliveryRangeSource = 'supplier_hint' | 'fallback';

export interface EbayUsDeliveryRange {
  minDays: number;
  maxDays: number;
  source: EbayUsDeliveryRangeSource;
}

export interface BuildEbayUsDropshipDeliveryRangeOpts {
  fallbackMin: number;
  fallbackMax: number;
  processingMin: number;
  processingMax: number;
  /**
   * Added to min/max after all other math (automated purchase at varied Chinese suppliers,
   * different ship-from cities). Defaults 0 if omitted.
   */
  automatedDropshipPadMin?: number;
  automatedDropshipPadMax?: number;
}

export function buildEbayUsDropshipDeliveryRange(
  product: unknown,
  opts: BuildEbayUsDropshipDeliveryRangeOpts,
): EbayUsDeliveryRange {
  let fbMin = Math.max(1, Math.floor(opts.fallbackMin));
  let fbMax = Math.max(fbMin, Math.floor(opts.fallbackMax));
  const procMin = Math.max(0, Math.floor(opts.processingMin));
  const procMax = Math.max(procMin, Math.floor(opts.processingMax));
  const padMin = Math.max(0, Math.floor(opts.automatedDropshipPadMin ?? 0));
  const padMax = Math.max(padMin, Math.floor(opts.automatedDropshipPadMax ?? padMin));

  const hint = extractSupplierDeliveryDaysHint(product);
  if (hint != null) {
    // Slightly wider transit band than single-origin: suppliers may ship from different regions of China.
    const transitMin = Math.max(5, Math.floor(hint * 0.8));
    const transitMax = Math.max(transitMin, Math.ceil(hint * 1.35));
    let minDays = Math.min(90, transitMin + procMin + padMin);
    let maxDays = Math.min(120, transitMax + procMax + padMax);
    if (maxDays < minDays) {
      maxDays = minDays + 3;
    }
    return { minDays, maxDays, source: 'supplier_hint' };
  }

  let minDays = fbMin + padMin;
  let maxDays = fbMax + padMax;
  if (maxDays < minDays) {
    maxDays = minDays + 3;
  }
  return { minDays, maxDays, source: 'fallback' };
}

const ESTIMATED_DELIVERY_SENTINEL = /\bestimated delivery\b/i;

/**
 * Appends a concise, policy-safe English shipping ETA block for China→US dropship.
 * Skips if the description already mentions estimated delivery (e.g. manual copy).
 */
export function appendEbayUsDropshipShippingNotice(description: string, range: Pick<EbayUsDeliveryRange, 'minDays' | 'maxDays'>): string {
  const base = String(description || '').trim();
  if (ESTIMATED_DELIVERY_SENTINEL.test(base)) {
    return base;
  }
  const min = Math.max(1, Math.floor(range.minDays));
  const max = Math.max(min, Math.floor(range.maxDays));
  const block = `Shipping. Estimated delivery to the United States is usually ${min} to ${max} business days after the order ships. International shipment from China, fulfilled through partner suppliers. Delays may occur in customs or during peak seasons.`;
  if (!base) return block;
  return `${base} ${block}`;
}
