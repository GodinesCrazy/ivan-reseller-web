import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { CJ_SHOPIFY_USA_LISTING_STATUS } from '../cj-shopify-usa.constants';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';
import type { PricingBreakdown, QualificationResult } from './cj-shopify-usa-qualification.service';
import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';
import {
  CJ_SHOPIFY_USA_DEFAULT_MAX_SELL_PRICE_USD,
  resolveMaxSellPriceUsd,
} from './cj-shopify-usa-policy.service';

type GuardAction = 'OK' | 'PRICE_INCREASE' | 'PAUSE_UNSAFE' | 'REVIEW_REQUIRED';

export interface ProfitGuardIssue {
  listingId: number;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  handle: string | null;
  sku: string | null;
  title: string;
  action: GuardAction;
  reason: string;
  currentPriceUsd: number | null;
  recommendedPriceUsd: number | null;
  supplierCostUsd: number | null;
  shippingCostUsd: number | null;
  projectedNetProfitUsd: number | null;
  projectedNetMarginPct: number | null;
  applied: boolean;
}

export interface ProfitGuardResult {
  ok: true;
  dryRun: boolean;
  scanned: number;
  okCount: number;
  priceIncreases: number;
  pausedUnsafe: number;
  reviewRequired: number;
  settings: {
    minMarginPct: number;
    minProfitUsd: number;
    maxShippingUsd: number;
    maxSellPriceUsd: number;
  };
  issues: ProfitGuardIssue[];
}

export interface ProfitGuardShippingEnrichmentResult {
  ok: true;
  dryRun: boolean;
  scanned: number;
  enriched: number;
  skipped: number;
  failed: number;
  rateLimited: boolean;
  errors: Array<{
    listingId: number;
    title: string;
    reason: string;
  }>;
}

type ListingWithProfitGuardRelations = Prisma.CjShopifyUsaListingGetPayload<{
  include: {
    product: true;
    variant: true;
    shippingQuote: true;
  };
}>;

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

const PRICING_DEFAULTS = {
  paymentFeePct: 5.4,
  paymentFixedFeeUsd: 0.30,
  incidentBufferPct: 3.0,
  minMarginPct: 12,
  minProfitUsd: 1.50,
  maxShippingUsd: 15.00,
  minCostUsd: 2.00,
  minSellPriceUsd: 9.99,
  maxSellPriceUsd: CJ_SHOPIFY_USA_DEFAULT_MAX_SELL_PRICE_USD,
} as const;

function safeNum(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applyPsychologicalRounding(price: number): number {
  if (price <= 0) return 0.99;
  const floor = Math.floor(price);
  let rounded = floor + 0.99;
  if (rounded < price) rounded = floor + 1.99;
  return roundMoney(rounded);
}

function buildBreakdown(
  supplierCostUsd: number,
  shippingCostUsd: number,
  incidentBufferUsd: number,
  suggestedSellPriceUsd: number,
  providerFeePct: number,
  providerFeeFixed: number,
  targetMarginPct: number,
  netProfitUsd?: number,
  netMarginPct?: number,
): PricingBreakdown {
  const paymentProcessingFeeUsd = roundMoney((suggestedSellPriceUsd * (providerFeePct / 100)) + providerFeeFixed);
  const totalCostUsd = roundMoney(supplierCostUsd + shippingCostUsd + incidentBufferUsd);
  const calculatedNetProfit = netProfitUsd ?? roundMoney(suggestedSellPriceUsd - totalCostUsd - paymentProcessingFeeUsd);
  const calculatedNetMargin = netMarginPct ?? (suggestedSellPriceUsd > 0 ? roundMoney((calculatedNetProfit / suggestedSellPriceUsd) * 100) : 0);
  const targetProfitUsd = roundMoney(suggestedSellPriceUsd * (targetMarginPct / 100));

  return {
    supplierCostUsd: roundMoney(supplierCostUsd),
    shippingCostUsd: roundMoney(shippingCostUsd),
    incidentBufferUsd,
    totalCostUsd,
    paymentProcessingFeeUsd,
    targetProfitUsd,
    netProfitUsd: calculatedNetProfit,
    netMarginPct: calculatedNetMargin,
    suggestedSellPriceUsd,
  };
}

function evaluatePricing(
  settings: Record<string, unknown>,
  supplierCostUsd: number,
  shippingCostUsd: number,
): QualificationResult {
  const reasons: string[] = [];
  const providerFeePct = safeNum(settings.defaultPaymentFeePct, PRICING_DEFAULTS.paymentFeePct);
  const providerFeeFixed = safeNum(settings.defaultPaymentFixedFeeUsd, PRICING_DEFAULTS.paymentFixedFeeUsd);
  const incidentBufferPct = safeNum(settings.incidentBufferPct, PRICING_DEFAULTS.incidentBufferPct);
  const marginPct = safeNum(settings.minMarginPct, PRICING_DEFAULTS.minMarginPct);
  const maxShippingUsd = safeNum(settings.maxShippingUsd, PRICING_DEFAULTS.maxShippingUsd);
  const maxSellPriceUsd = resolveMaxSellPriceUsd(settings.maxSellPriceUsd);
  const minProfitUsd = safeNum(settings.minProfitUsd, PRICING_DEFAULTS.minProfitUsd);
  const minCostUsd = safeNum(settings.minCostUsd, PRICING_DEFAULTS.minCostUsd);

  const baseCostUsd = supplierCostUsd + shippingCostUsd;
  const incidentBufferUsd = roundMoney(baseCostUsd * (incidentBufferPct / 100));
  const totalCostWithBufferUsd = roundMoney(baseCostUsd + incidentBufferUsd);

  if (shippingCostUsd > maxShippingUsd) {
    reasons.push(`Shipping too expensive: $${shippingCostUsd.toFixed(2)} > max $${maxShippingUsd.toFixed(2)}`);
    return {
      decision: 'REJECTED',
      reasons,
      breakdown: buildBreakdown(supplierCostUsd, shippingCostUsd, incidentBufferUsd, 0, providerFeePct, providerFeeFixed, marginPct),
    };
  }

  if (supplierCostUsd < minCostUsd) {
    reasons.push(`Product cost too low: $${supplierCostUsd.toFixed(2)} < $${minCostUsd.toFixed(2)} minimum`);
    return {
      decision: 'REJECTED',
      reasons,
      breakdown: buildBreakdown(supplierCostUsd, shippingCostUsd, incidentBufferUsd, 0, providerFeePct, providerFeeFixed, marginPct),
    };
  }

  const combinedPctDivisor = 1 - (providerFeePct / 100) - (marginPct / 100);
  if (combinedPctDivisor <= 0.001) {
    reasons.push('Fee and margin percentages exceed 100% - invalid configuration');
    return {
      decision: 'REJECTED',
      reasons,
      breakdown: buildBreakdown(supplierCostUsd, shippingCostUsd, incidentBufferUsd, 0, providerFeePct, providerFeeFixed, marginPct),
    };
  }

  const rawSuggestedPrice = (totalCostWithBufferUsd + providerFeeFixed) / combinedPctDivisor;
  const suggestedSellPriceUsd = applyPsychologicalRounding(rawSuggestedPrice);

  if (suggestedSellPriceUsd < PRICING_DEFAULTS.minSellPriceUsd) {
    reasons.push(
      `Rejected by minimum sell price rule: suggested Shopify price $${suggestedSellPriceUsd.toFixed(2)} is below the $${PRICING_DEFAULTS.minSellPriceUsd.toFixed(2)} minimum.`,
    );
    return {
      decision: 'REJECTED',
      reasons,
      breakdown: buildBreakdown(supplierCostUsd, shippingCostUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct),
    };
  }

  if (suggestedSellPriceUsd > maxSellPriceUsd) {
    reasons.push(
      `Rejected by maximum sell price rule: suggested Shopify price $${suggestedSellPriceUsd.toFixed(2)} exceeds the configured $${maxSellPriceUsd.toFixed(2)} maximum.`,
    );
    return {
      decision: 'REJECTED',
      reasons,
      breakdown: buildBreakdown(supplierCostUsd, shippingCostUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct),
    };
  }

  const paymentProcessingFeeUsd = roundMoney((suggestedSellPriceUsd * (providerFeePct / 100)) + providerFeeFixed);
  const totalAllCostsUsd = roundMoney(totalCostWithBufferUsd + paymentProcessingFeeUsd);
  const netProfitUsd = roundMoney(suggestedSellPriceUsd - totalAllCostsUsd);
  const netMarginPct = suggestedSellPriceUsd > 0 ? roundMoney((netProfitUsd / suggestedSellPriceUsd) * 100) : 0;

  if (netMarginPct < marginPct) {
    reasons.push(`Net margin too low: ${netMarginPct.toFixed(1)}% < ${marginPct.toFixed(1)}% minimum`);
    return {
      decision: 'REJECTED',
      reasons,
      breakdown: buildBreakdown(supplierCostUsd, shippingCostUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct, netProfitUsd, netMarginPct),
    };
  }

  if (netProfitUsd < minProfitUsd) {
    reasons.push(`Net profit too low: $${netProfitUsd.toFixed(2)} < $${minProfitUsd.toFixed(2)} minimum`);
    return {
      decision: 'REJECTED',
      reasons,
      breakdown: buildBreakdown(supplierCostUsd, shippingCostUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct, netProfitUsd, netMarginPct),
    };
  }

  return {
    decision: 'APPROVED',
    reasons: ['Product meets all pricing criteria for Shopify USA'],
    breakdown: buildBreakdown(supplierCostUsd, shippingCostUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct, netProfitUsd, netMarginPct),
  };
}

function withPricingSnapshot(payload: unknown, breakdown: PricingBreakdown): Prisma.InputJsonValue {
  const draft = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? { ...(payload as Record<string, unknown>) }
    : {};

  draft.pricingSnapshot = {
    ...(draft.pricingSnapshot && typeof draft.pricingSnapshot === 'object' && !Array.isArray(draft.pricingSnapshot)
      ? draft.pricingSnapshot as Record<string, unknown>
      : {}),
    ...breakdown,
    lastProfitGuardAt: new Date().toISOString(),
  };

  return draft as Prisma.InputJsonValue;
}

function withShippingSnapshot(payload: unknown, input: {
  amountUsd: number;
  serviceName?: string | null;
  carrier?: string | null;
  estimatedMaxDays?: number | null;
  originCountryCode?: string | null;
  confidence?: string | null;
}): Prisma.InputJsonValue {
  const draft = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? { ...(payload as Record<string, unknown>) }
    : {};

  draft.shippingSnapshot = {
    ...(draft.shippingSnapshot && typeof draft.shippingSnapshot === 'object' && !Array.isArray(draft.shippingSnapshot)
      ? draft.shippingSnapshot as Record<string, unknown>
      : {}),
    amountUsd: roundMoney(input.amountUsd),
    serviceName: input.serviceName ?? null,
    carrier: input.carrier ?? null,
    estimatedMaxDays: input.estimatedMaxDays ?? null,
    originCountryCode: input.originCountryCode ?? null,
    confidence: input.confidence ?? 'known',
    lastProfitGuardFreightAt: new Date().toISOString(),
  };

  return draft as Prisma.InputJsonValue;
}

export class CjShopifyUsaProfitGuardService {
  async enrichMissingShipping(userId: number, options?: {
    dryRun?: boolean;
    limit?: number;
  }): Promise<ProfitGuardShippingEnrichmentResult> {
    const dryRun = options?.dryRun !== false;
    const limit = Math.max(1, Math.min(100, Number(options?.limit ?? 25)));
    const missing: ListingWithProfitGuardRelations[] = [];
    const pageSize = 200;
    const maxInspected = 5000;
    let inspected = 0;

    while (missing.length < limit && inspected < maxInspected) {
      const page = await prisma.cjShopifyUsaListing.findMany({
        where: {
          userId,
          status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
        },
        include: {
          product: true,
          variant: true,
          shippingQuote: true,
        },
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
        skip: inspected,
        take: Math.min(pageSize, maxInspected - inspected),
      });

      if (page.length === 0) break;
      inspected += page.length;

      for (const listing of page) {
        const draft = (listing.draftPayload || {}) as Record<string, any>;
        const pricing = (draft.pricingSnapshot || {}) as Record<string, any>;
        const shippingSnapshot = (draft.shippingSnapshot || {}) as Record<string, any>;
        if (num(listing.shippingQuote?.amountUsd ?? pricing.shippingCostUsd ?? shippingSnapshot.amountUsd) === null) {
          missing.push(listing);
          if (missing.length >= limit) break;
        }
      }
    }

    const errors: ProfitGuardShippingEnrichmentResult['errors'] = [];
    let enriched = 0;
    let skipped = 0;
    let failed = 0;
    let rateLimited = false;

    const { createCjSupplierAdapter } = await import('./../../cj-ebay/adapters/cj-supplier.adapter.js');
    const { CjSupplierError } = await import('./../../cj-ebay/adapters/cj-supplier.errors.js');
    const adapter = createCjSupplierAdapter(userId);

    for (const listing of missing) {
      const title = String(((listing.draftPayload || {}) as Record<string, any>).title || listing.product.title || listing.shopifySku || `Listing ${listing.id}`);
      if (!listing.variant?.cjVid && !listing.product.cjProductId) {
        skipped++;
        errors.push({ listingId: listing.id, title, reason: 'Missing CJ product/variant id for freight quote.' });
        continue;
      }

      try {
        const waResult = await adapter.quoteShippingToUsWarehouseAware({
          variantId: listing.variant?.cjVid ?? undefined,
          productId: listing.product.cjProductId,
          quantity: 1,
          destCountryCode: 'US',
        });

        if (!dryRun) {
          const quote = await prisma.cjShopifyUsaShippingQuote.create({
            data: {
              userId,
              productId: listing.productId,
              variantId: listing.variantId,
              quantity: 1,
              amountUsd: waResult.quote.cost,
              currency: 'USD',
              serviceName: waResult.quote.method ?? null,
              estimatedMaxDays: waResult.quote.estimatedDays ?? null,
              confidence: waResult.quote.warehouseEvidence === 'assumed' ? 'unknown' : 'known',
              originCountryCode: waResult.fulfillmentOrigin,
            },
          });
          await prisma.cjShopifyUsaListing.update({
            where: { id: listing.id },
            data: {
              shippingQuoteId: quote.id,
              draftPayload: withShippingSnapshot(listing.draftPayload, {
                amountUsd: waResult.quote.cost,
                serviceName: waResult.quote.method ?? null,
                estimatedMaxDays: waResult.quote.estimatedDays ?? null,
                originCountryCode: waResult.fulfillmentOrigin,
                confidence: waResult.quote.warehouseEvidence === 'assumed' ? 'unknown' : 'known',
              }),
            },
          });
        }
        enriched++;
      } catch (err) {
        failed++;
        const reason = err instanceof Error ? err.message : String(err);
        errors.push({ listingId: listing.id, title, reason: reason.slice(0, 180) });
        if (err instanceof CjSupplierError && err.code === 'CJ_RATE_LIMIT') {
          rateLimited = true;
          break;
        }
      }
    }

    await prisma.cjShopifyUsaExecutionTrace.create({
      data: {
        userId,
        step: 'pricing.profit_guard.shipping_enrichment',
        message: dryRun ? 'pricing.profit_guard.shipping_enrichment.preview' : 'pricing.profit_guard.shipping_enrichment.applied',
        meta: ({
          dryRun,
          scanned: missing.length,
          inspected,
          enriched,
          skipped,
          failed,
          rateLimited,
          sampleErrors: errors.slice(0, 20),
        } as unknown) as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      dryRun,
      scanned: missing.length,
      enriched,
      skipped,
      failed,
      rateLimited,
      errors: errors.slice(0, 50),
    };
  }

  async run(userId: number, options?: {
    dryRun?: boolean;
    limit?: number;
    pauseUnsafe?: boolean;
    minIncreaseUsd?: number;
  }): Promise<ProfitGuardResult> {
    const dryRun = options?.dryRun !== false;
    const pauseUnsafe = options?.pauseUnsafe === true;
    const minIncreaseUsd = Math.max(0.01, Number(options?.minIncreaseUsd ?? 0.5));
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const limit = Math.max(1, Math.min(2000, Number(options?.limit ?? 500)));

    const listings = await prisma.cjShopifyUsaListing.findMany({
      where: { userId, status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE },
      include: {
        product: true,
        variant: true,
        shippingQuote: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    const probe = !dryRun && pauseUnsafe ? await cjShopifyUsaAdminService.probeConnection(userId).catch(() => null) : null;
    const onlineStorePublicationId = probe?.publications?.find((p) => p.name === 'Online Store')?.id
      ?? probe?.publications?.[0]?.id
      ?? null;
    const unpublishedProducts = new Set<string>();

    const issues: ProfitGuardIssue[] = [];
    let okCount = 0;
    let priceIncreases = 0;
    let pausedUnsafe = 0;
    let reviewRequired = 0;

    for (const listing of listings) {
      const draft = (listing.draftPayload || {}) as Record<string, any>;
      const pricing = (draft.pricingSnapshot || {}) as Record<string, any>;
      const shippingSnapshot = (draft.shippingSnapshot || {}) as Record<string, any>;
      const currentPriceUsd = num(listing.listedPriceUsd ?? pricing.suggestedSellPriceUsd);
      const supplierCostUsd = num(listing.variant?.unitCostUsd ?? pricing.supplierCostUsd);
      const shippingCostUsd = num(listing.shippingQuote?.amountUsd ?? pricing.shippingCostUsd ?? shippingSnapshot.amountUsd);
      const title = String(draft.title || listing.product.title || listing.shopifySku || `Listing ${listing.id}`);

      const baseIssue = {
        listingId: listing.id,
        shopifyProductId: listing.shopifyProductId,
        shopifyVariantId: listing.shopifyVariantId,
        handle: listing.shopifyHandle,
        sku: listing.shopifySku,
        title,
        currentPriceUsd,
        supplierCostUsd,
        shippingCostUsd,
        applied: false,
      };

      if (!listing.shopifyProductId || !listing.shopifyVariantId || !supplierCostUsd || shippingCostUsd === null || !currentPriceUsd) {
        reviewRequired++;
        issues.push({
          ...baseIssue,
          action: 'REVIEW_REQUIRED',
          reason: 'Missing Shopify variant, supplier cost, shipping cost, or current price; cannot prove profit.',
          recommendedPriceUsd: null,
          projectedNetProfitUsd: null,
          projectedNetMarginPct: null,
        });
        continue;
      }

      const qualification = evaluatePricing(settings as unknown as Record<string, unknown>, supplierCostUsd, shippingCostUsd);
      const recommendedPriceUsd = roundMoney(qualification.breakdown.suggestedSellPriceUsd);
      const projectedNetProfitUsd = qualification.breakdown.netProfitUsd;
      const projectedNetMarginPct = qualification.breakdown.netMarginPct;

      if (qualification.decision !== 'APPROVED') {
        const action: GuardAction = pauseUnsafe ? 'PAUSE_UNSAFE' : 'REVIEW_REQUIRED';
        const issue: ProfitGuardIssue = {
          ...baseIssue,
          action,
          reason: qualification.reasons.join('; ') || 'Pricing no longer meets profit policy.',
          recommendedPriceUsd,
          projectedNetProfitUsd,
          projectedNetMarginPct,
          applied: false,
        };

        if (!dryRun && pauseUnsafe) {
          if (onlineStorePublicationId && listing.shopifyProductId && !unpublishedProducts.has(listing.shopifyProductId)) {
            await cjShopifyUsaAdminService.unpublishProductFromPublication({
              userId,
              productId: listing.shopifyProductId,
              publicationId: onlineStorePublicationId,
            }).catch(() => undefined);
            await cjShopifyUsaAdminService.updateProductStatus({
              userId,
              productId: listing.shopifyProductId,
              status: 'DRAFT',
            }).catch(() => undefined);
            unpublishedProducts.add(listing.shopifyProductId);
          }
          await prisma.cjShopifyUsaListing.update({
            where: { id: listing.id },
            data: {
              status: CJ_SHOPIFY_USA_LISTING_STATUS.PAUSED,
              lastError: `Profit guard paused: ${issue.reason}`,
              draftPayload: withPricingSnapshot(listing.draftPayload, qualification.breakdown),
            },
          });
          issue.applied = true;
        }

        if (action === 'PAUSE_UNSAFE') pausedUnsafe++;
        else reviewRequired++;
        issues.push(issue);
        continue;
      }

      if (currentPriceUsd + minIncreaseUsd <= recommendedPriceUsd) {
        const issue: ProfitGuardIssue = {
          ...baseIssue,
          action: 'PRICE_INCREASE',
          reason: `Current price $${currentPriceUsd.toFixed(2)} is below required safe price $${recommendedPriceUsd.toFixed(2)}.`,
          recommendedPriceUsd,
          projectedNetProfitUsd,
          projectedNetMarginPct,
          applied: false,
        };

        if (!dryRun) {
          await cjShopifyUsaAdminService.updateVariantPrice({
            userId,
            productId: listing.shopifyProductId,
            variantId: listing.shopifyVariantId,
            price: recommendedPriceUsd,
          });
          await prisma.cjShopifyUsaListing.update({
            where: { id: listing.id },
            data: {
              listedPriceUsd: recommendedPriceUsd,
              draftPayload: withPricingSnapshot(listing.draftPayload, qualification.breakdown),
              lastError: null,
            },
          });
          issue.applied = true;
        }

        priceIncreases++;
        issues.push(issue);
        continue;
      }

      okCount++;
      if (!dryRun && (!Number.isFinite(Number(pricing.netProfitUsd)) || !Number.isFinite(Number(pricing.netMarginPct)))) {
        await prisma.cjShopifyUsaListing.update({
          where: { id: listing.id },
          data: { draftPayload: withPricingSnapshot(listing.draftPayload, qualification.breakdown) },
        });
      }
    }

    await prisma.cjShopifyUsaExecutionTrace.create({
      data: {
        userId,
        step: 'pricing.profit_guard',
        message: dryRun ? 'pricing.profit_guard.preview' : 'pricing.profit_guard.applied',
        meta: ({
          dryRun,
          scanned: listings.length,
          okCount,
          priceIncreases,
          pausedUnsafe,
          reviewRequired,
          sample: issues.slice(0, 20),
        } as unknown) as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      dryRun,
      scanned: listings.length,
      okCount,
      priceIncreases,
      pausedUnsafe,
      reviewRequired,
      settings: {
        minMarginPct: Number(settings.minMarginPct ?? 12),
        minProfitUsd: Number(settings.minProfitUsd ?? 1.5),
        maxShippingUsd: Number(settings.maxShippingUsd ?? 15),
        maxSellPriceUsd: resolveMaxSellPriceUsd(settings.maxSellPriceUsd),
      },
      issues: issues.slice(0, 100),
    };
  }
}

export const cjShopifyUsaProfitGuardService = new CjShopifyUsaProfitGuardService();
