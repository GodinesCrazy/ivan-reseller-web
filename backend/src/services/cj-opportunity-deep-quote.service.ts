/**
 * Phase C — selective CJ freight quotes for opportunity discovery rows.
 * Sequential calls + spacing + in-process TTL cache; does not run full-list freight.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { createCjSupplierAdapter } from '../modules/cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierError } from '../modules/cj-ebay/adapters/cj-supplier.errors';
import { mergeCjSupplyMetaForDeepQuote } from './cj-deep-quote-meta';
import type {
  CjDeepQuotePipelineDiagnostics,
  SupplyDiscoveryRow,
  SupplyRowMeta,
} from './supply-quote.types';

export type CjDiscoveryProductRow = SupplyDiscoveryRow & { supplierSource?: 'cj' };

interface CacheEntry {
  shippingUsd: number;
  method: string;
  estimatedDaysMax: number | null;
  cachedAtMs: number;
}

const freightCache = new Map<string, CacheEntry>();

function cacheKey(productId: string, quantity: number, zip: string | undefined): string {
  return `cjfq:${productId}:${quantity}:${zip || '_'}`;
}

function defaultCjMeta(): SupplyRowMeta {
  return {
    supplier: 'cj',
    unitCostTruth: 'listing',
    shippingTruth: 'estimated',
    landedCostTruth: 'estimated_partial',
    preferredSupplierSatisfied: false,
    fallbackUsed: false,
    quoteConfidence: 'low',
    providersAttempted: ['cj_open_api_listv2'],
    shippingEstimateStatus: 'estimated',
    shippingSource: 'default_commerce_settings',
    costSemantics: {
      unitCostKind: 'listing_price',
      shippingKind: 'estimated_default',
      landedKind: 'landed_estimate',
    },
  };
}

function isMultiVariantFreightError(e: unknown): boolean {
  if (!(e instanceof CjSupplierError)) return false;
  if (e.code !== 'CJ_INVALID_SKU') return false;
  const m = e.message.toLowerCase();
  return m.includes('variant');
}

function applyQuoteToRow(
  row: CjDiscoveryProductRow,
  shippingUsd: number,
  opts: {
    fromCache: boolean;
    method: string;
    estimatedDaysMax: number | null;
    quotedAtIso: string;
  }
): void {
  const base = row.supplyMeta ?? defaultCjMeta();
  row.shippingCost = shippingUsd;
  if (opts.estimatedDaysMax != null) {
    row.shippingDaysMax = opts.estimatedDaysMax;
    row.estimatedDeliveryDays = opts.estimatedDaysMax;
  }
  row.supplyMeta = mergeCjSupplyMetaForDeepQuote(base, {
    fromCache: opts.fromCache,
    method: opts.method,
    quotedAtIso: opts.quotedAtIso,
  });
}

/**
 * Deep-quote up to `OPPORTUNITY_CJ_DEEP_QUOTE_MAX` CJ rows (in array order — already ranked in Phase B).
 * Mutates `rows` in place: `shippingCost`, optional delivery fields, `supplyMeta`.
 */
export async function applySelectiveCjDeepFreightQuotes(params: {
  userId: number;
  rows: CjDiscoveryProductRow[];
  /** Reserved: restore default listing shipping if deep quote fails (future). */
  defaultShippingUsd: number;
}): Promise<CjDeepQuotePipelineDiagnostics> {
  void params.defaultShippingUsd;
  const diag: CjDeepQuotePipelineDiagnostics = {
    enabled: false,
    maxCandidates: 0,
    minSpacingMs: 0,
    quantity: 1,
    attempted: 0,
    succeeded: 0,
    servedFromCache: 0,
    skippedMultiVariant: 0,
    skippedNoProductId: 0,
    failed: 0,
    rateLimited: false,
    degraded: false,
    notes: [],
  };

  if (!env.OPPORTUNITY_CJ_DEEP_QUOTE_ENABLED) {
    diag.notes.push('deep_quote_disabled');
    return diag;
  }
  if (env.OPPORTUNITY_CJ_SUPPLY_MODE === 'off') {
    diag.notes.push('deep_quote_skipped_cj_mode_off');
    return diag;
  }

  const maxCandidates = env.OPPORTUNITY_CJ_DEEP_QUOTE_MAX;
  const minSpacingMs = env.OPPORTUNITY_CJ_DEEP_QUOTE_MIN_SPACING_MS;
  const ttlMs = env.OPPORTUNITY_CJ_FREIGHT_CACHE_TTL_MS;
  const quantity = 1;
  const zip = env.OPPORTUNITY_CJ_DEEP_QUOTE_DEST_ZIP;

  diag.enabled = true;
  diag.maxCandidates = maxCandidates;
  diag.minSpacingMs = minSpacingMs;
  diag.quantity = quantity;

  if (maxCandidates === 0) {
    diag.notes.push('deep_quote_max_zero');
    return diag;
  }

  const hasCj = params.rows.some((r) => r.supplierSource === 'cj' && r.supplyMeta?.supplier === 'cj');
  if (!hasCj) {
    diag.notes.push('no_cj_rows');
    return diag;
  }

  const adapter = createCjSupplierAdapter(params.userId);

  let lastCallAt = 0;
  const cjIndices: number[] = [];
  for (let i = 0; i < params.rows.length; i++) {
    const r = params.rows[i];
    if (r?.supplierSource === 'cj' && r.supplyMeta?.supplier === 'cj' && r.productId) {
      cjIndices.push(i);
    }
  }
  const selected = cjIndices.slice(0, maxCandidates);

  for (const i of selected) {
    const row = params.rows[i]!;
    const pid = String(row.productId || '').trim();
    if (!pid) {
      diag.skippedNoProductId++;
      continue;
    }

    const key = cacheKey(pid, quantity, zip);
    const cached = freightCache.get(key);
    const nowMs = Date.now();
    if (cached && nowMs - cached.cachedAtMs < ttlMs) {
      const quotedAtIso = new Date(cached.cachedAtMs).toISOString();
      applyQuoteToRow(row, cached.shippingUsd, {
        fromCache: true,
        method: cached.method,
        estimatedDaysMax: cached.estimatedDaysMax,
        quotedAtIso,
      });
      diag.servedFromCache++;
      diag.succeeded++;
      continue;
    }

    if (minSpacingMs > 0 && lastCallAt > 0) {
      const wait = minSpacingMs - (nowMs - lastCallAt);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    diag.attempted++;
    try {
      const { quote } = await adapter.quoteShippingToUsReal({
        productId: pid,
        quantity,
        destPostalCode: zip,
      });
      lastCallAt = Date.now();
      const shippingUsd = quote.cost;
      const method = quote.method || 'cj_option';
      const estimatedDaysMax = quote.estimatedDays;
      freightCache.set(key, {
        shippingUsd,
        method,
        estimatedDaysMax,
        cachedAtMs: lastCallAt,
      });
      const quotedAtIso = new Date(lastCallAt).toISOString();
      applyQuoteToRow(row, shippingUsd, {
        fromCache: false,
        method,
        estimatedDaysMax,
        quotedAtIso,
      });
      diag.succeeded++;
      logger.info('[cj-deep-quote] freight ok', {
        userId: params.userId,
        productIdLen: pid.length,
        shippingUsd,
        cached: false,
      });
    } catch (e) {
      lastCallAt = Date.now();
      if (e instanceof CjSupplierError && e.code === 'CJ_RATE_LIMIT') {
        diag.rateLimited = true;
        diag.degraded = true;
        diag.failed++;
        diag.notes.push('cj_rate_limit_during_deep_quote');
        logger.warn('[cj-deep-quote] rate limited', { userId: params.userId });
      } else if (isMultiVariantFreightError(e)) {
        diag.skippedMultiVariant++;
        const base = row.supplyMeta ?? defaultCjMeta();
        row.supplyMeta = {
          ...base,
          deepQuoteFailureReason: 'multi_variant_requires_explicit_vid',
          providersAttempted: Array.from(
            new Set([...(base.providersAttempted || []), 'cj_freight_skipped_multi_variant'])
          ),
        };
        logger.info('[cj-deep-quote] skip multi-variant product', {
          userId: params.userId,
          productIdLen: pid.length,
        });
      } else {
        diag.failed++;
        diag.degraded = true;
        const err = e instanceof CjSupplierError ? e : null;
        const base = row.supplyMeta ?? defaultCjMeta();
        row.supplyMeta = {
          ...base,
          deepQuoteFailureReason: err?.code ?? 'freight_error',
        };
        logger.warn('[cj-deep-quote] freight failed', {
          userId: params.userId,
          productIdLen: pid.length,
          code: err?.code,
          message: err ? err.message : String(e),
        });
      }
    }
  }

  return diag;
}

/** Test-only: clear in-process freight cache. */
export function __resetCjFreightQuoteCacheForTests(): void {
  freightCache.clear();
}
