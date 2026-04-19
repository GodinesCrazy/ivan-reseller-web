/**
 * CJ → eBay UK vertical — HTTP routes.
 *
 * Architecture mirrors cj-ebay.routes.ts (USA) exactly.
 * All routes prefixed /api/cj-ebay-uk/.
 * Gated by ENABLE_CJ_EBAY_UK_MODULE env flag (returns 404 CJ_EBAY_UK_MODULE_DISABLED if off).
 *
 * UK-specific adaptations:
 * - destCountry = GB in all CJ freight calls
 * - startCountryCode = GB for warehouse probing (CJ_EBAY_UK_WAREHOUSE_AWARE)
 * - Pricing in GBP with VAT deduction (marketplace facilitator)
 * - eBay UK siteId=3 / EBAY_GB
 * - Currency: GBP
 */

import { Router, type Request, type Response } from 'express';
import { authenticate as requireAuth } from '../../middleware/auth.middleware';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { createCjSupplierAdapter } from '../cj-ebay/adapters/cj-supplier.adapter';
import { cjEbayUkConfigService } from './services/cj-ebay-uk-config.service';
import { cjEbayUkSystemReadinessService } from './services/cj-ebay-uk-system-readiness.service';
import { cjEbayUkTraceService } from './services/cj-ebay-uk-trace.service';
import { cjEbayUkTrendDiscoveryService } from './services/cj-ebay-uk-trend-discovery.service';
import { computeUkPricingPreview, resolveUkFeeSettings } from './services/cj-ebay-uk-pricing.service';
import {
  CJ_EBAY_UK_TRACE_STEP,
  CJ_EBAY_UK_ORDER_STATUS,
  CJ_EBAY_UK_LISTING_STATUS,
  CJ_EBAY_UK_ALERT_TYPE,
  CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE,
  CJ_EBAY_UK_REFUND_STATUS,
  CJ_EBAY_UK_DEST_COUNTRY,
  EBAY_UK_CURRENCY,
} from './cj-ebay-uk.constants';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(requireAuth);

function moduleDisabled(res: Response) {
  return res.status(404).json({ error: 'CJ_EBAY_UK_MODULE_DISABLED', detail: 'Set ENABLE_CJ_EBAY_UK_MODULE=true' });
}

function correlationId() {
  return uuidv4().split('-')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

router.get('/system-readiness', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number;
    const result = await cjEbayUkSystemReadinessService.evaluateForUser(userId);
    return res.json({ ok: result.ready, ...result });
  } catch (err) {
    logger.error(`[CjEbayUk] system-readiness error: ${(err as Error).message}`);
    return res.status(500).json({ error: 'SYSTEM_READINESS_ERROR', detail: (err as Error).message });
  }
});

router.get('/health', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  return res.json({ ok: true, module: 'cj-ebay-uk', destination: 'GB', currency: EBAY_UK_CURRENCY });
});

router.get('/overview', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [
      products, variants, evaluations, shippingQuotes,
      listings, listingsActive, orders, ordersOpen,
      ordersWithTracking, alertsOpen, profitSnapshots, tracesLast24h,
    ] = await Promise.all([
      prisma.cjEbayUkProduct.count({ where: { userId } }),
      prisma.cjEbayUkProductVariant.count({ where: { product: { userId } } }),
      prisma.cjEbayUkProductEvaluation.count({ where: { userId } }),
      prisma.cjEbayUkShippingQuote.count({ where: { userId } }),
      prisma.cjEbayUkListing.count({ where: { userId } }),
      prisma.cjEbayUkListing.count({ where: { userId, status: CJ_EBAY_UK_LISTING_STATUS.ACTIVE } }),
      prisma.cjEbayUkOrder.count({ where: { userId } }),
      prisma.cjEbayUkOrder.count({
        where: {
          userId,
          status: { notIn: [CJ_EBAY_UK_ORDER_STATUS.COMPLETED, CJ_EBAY_UK_ORDER_STATUS.FAILED] },
        },
      }),
      prisma.cjEbayUkTracking.count({ where: { order: { userId }, trackingNumber: { not: null } } }),
      prisma.cjEbayUkAlert.count({ where: { userId, status: 'OPEN' } }),
      prisma.cjEbayUkProfitSnapshot.count({ where: { userId } }),
      prisma.cjEbayUkExecutionTrace.count({ where: { userId, createdAt: { gte: since24h } } }),
    ]);
    const [evalApproved, evalRejected, evalPending] = await Promise.all([
      prisma.cjEbayUkProductEvaluation.count({ where: { userId, decision: 'APPROVED' } }),
      prisma.cjEbayUkProductEvaluation.count({ where: { userId, decision: 'REJECTED' } }),
      prisma.cjEbayUkProductEvaluation.count({ where: { userId, decision: 'PENDING' } }),
    ]);
    return res.json({
      ok: true,
      counts: {
        products, variants,
        evaluations, evaluationsApproved: evalApproved, evaluationsRejected: evalRejected, evaluationsPending: evalPending,
        shippingQuotes, listings, listingsActive,
        orders, ordersOpen, ordersWithTracking,
        alertsOpen, profitSnapshots, tracesLast24h,
      },
      destination: 'GB',
      currency: EBAY_UK_CURRENCY,
    });
  } catch (err) {
    logger.error(`[CjEbayUk] overview error: ${(err as Error).message}`);
    return res.status(500).json({ error: 'OVERVIEW_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

router.get('/config', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const settings = await cjEbayUkConfigService.getOrCreateSettings(userId);
    return res.json({ ok: true, settings });
  } catch (err) {
    return res.status(500).json({ error: 'CONFIG_ERROR', detail: (err as Error).message });
  }
});

router.post('/config', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const settings = await cjEbayUkConfigService.updateSettings(userId, req.body);
    return res.json({ ok: true, settings });
  } catch (err) {
    return res.status(500).json({ error: 'CONFIG_UPDATE_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CJ SUPPLIER API (GB destination)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/cj/test-connection', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const adapter = await createCjSupplierAdapter(userId);
    const result = await adapter.verifyAuth();
    if (result.ok) return res.json({ ok: true, message: 'CJ API connection verified (shared credential)' });
    const e = result as { ok: false; error: { code: string; message: string } };
    return res.status(400).json({ ok: false, error: e.error.code, detail: e.error.message });
  } catch (err) {
    return res.status(500).json({ error: 'CJ_CONNECTION_ERROR', detail: (err as Error).message });
  }
});

router.post('/cj/search', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  const cid = correlationId();
  await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /cj/search', step: CJ_EBAY_UK_TRACE_STEP.REQUEST_START });
  try {
    const { keyword, page = 1, pageSize = 20 } = req.body as Record<string, unknown>;
    const adapter = await createCjSupplierAdapter(userId);
    const items = await adapter.searchProducts({
      keyword: String(keyword || ''),
      page: Number(page),
      pageSize: Number(pageSize),
    });

    // Apply warehouse-aware probing for UK if enabled
    const warehouseAware = env.CJ_EBAY_UK_WAREHOUSE_AWARE;
    const probeLimit = env.CJ_EBAY_UK_WAREHOUSE_PROBE_LIMIT;

    if (warehouseAware && probeLimit > 0) {
      let probeCount = 0;
      for (const item of items) {
        if (probeCount >= probeLimit) break;
        if (!item.inventoryTotal || item.inventoryTotal === 0) continue;
        try {
          const result = await adapter.quoteShippingToUsWarehouseAware({
            productId: item.cjProductId,
            quantity: 1,
            destCountryCode: CJ_EBAY_UK_DEST_COUNTRY,
            startCountryCode: 'GB',
          });
          item.fulfillmentOrigin = result.fulfillmentOrigin;
        } catch {
          item.fulfillmentOrigin = 'CN';
        }
        probeCount++;
      }
    }

    await cjEbayUkTraceService.log({
      userId, correlationId: cid, route: 'POST /cj/search',
      step: CJ_EBAY_UK_TRACE_STEP.REQUEST_COMPLETE,
      meta: { count: items.length, keyword, destination: 'GB', warehouseAware },
    });
    return res.json({ ok: true, items, destination: 'GB', warehouseAwareEnabled: warehouseAware });
  } catch (err) {
    await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /cj/search', step: CJ_EBAY_UK_TRACE_STEP.REQUEST_ERROR, message: (err as Error).message });
    return res.status(500).json({ error: 'CJ_SEARCH_ERROR', detail: (err as Error).message });
  }
});

router.get('/cj/product/:cjProductId', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const adapter = await createCjSupplierAdapter(userId);
    const product = await adapter.getProductById(req.params.cjProductId);
    return res.json({ ok: true, product, destination: 'GB' });
  } catch (err) {
    return res.status(500).json({ error: 'CJ_PRODUCT_ERROR', detail: (err as Error).message });
  }
});

router.post('/cj/shipping-quote', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  const cid = correlationId();
  await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /cj/shipping-quote', step: CJ_EBAY_UK_TRACE_STEP.CJ_FREIGHT_REQUEST });
  try {
    const { variantId, productId, quantity = 1 } = req.body as Record<string, unknown>;
    const adapter = await createCjSupplierAdapter(userId);

    // Get user settings for FX rate
    const settings = await cjEbayUkConfigService.getOrCreateSettings(userId);
    const fx = settings.fxRateUsdToGbp;

    const result = await adapter.quoteShippingToUsReal({
      variantId: variantId ? String(variantId) : undefined,
      productId: productId ? String(productId) : undefined,
      quantity: Number(quantity),
      destCountryCode: CJ_EBAY_UK_DEST_COUNTRY,
      startCountryCode: 'CN',
    });

    const amountGbp = result.quote.cost * fx;
    await cjEbayUkTraceService.log({
      userId, correlationId: cid, route: 'POST /cj/shipping-quote', step: CJ_EBAY_UK_TRACE_STEP.CJ_FREIGHT_RESPONSE,
      meta: { amountUsd: result.quote.cost, amountGbp: Math.round(amountGbp * 100) / 100, fxRate: fx },
    });
    return res.json({
      ok: true,
      quote: { ...result.quote, amountGbp: Math.round(amountGbp * 100) / 100, fxRateUsed: fx, currency: 'GBP' },
      destination: 'GB',
    });
  } catch (err) {
    await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /cj/shipping-quote', step: CJ_EBAY_UK_TRACE_STEP.CJ_FREIGHT_ERROR, message: (err as Error).message });
    return res.status(500).json({ error: 'SHIPPING_QUOTE_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PRICING PREVIEW
// ─────────────────────────────────────────────────────────────────────────────

router.post('/pricing/preview', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const { supplierCostUsd, shippingUsd, listPriceGbp } = req.body as {
      supplierCostUsd: number;
      shippingUsd: number;
      listPriceGbp?: number;
    };
    const settings = await cjEbayUkConfigService.getOrCreateSettings(userId);
    const breakdown = computeUkPricingPreview({
      supplierCostUsd: Number(supplierCostUsd),
      shippingUsd: Number(shippingUsd),
      listPriceGbp: listPriceGbp != null ? Number(listPriceGbp) : null,
      settings: {
        fxRateUsdToGbp: settings.fxRateUsdToGbp,
        ukVatPct: settings.ukVatPct,
        vatMarketplaceFacilitated: settings.vatMarketplaceFacilitated,
        incidentBufferPct: settings.incidentBufferPct,
        defaultEbayFeePct: settings.defaultEbayFeePct,
        defaultPaymentFeePct: settings.defaultPaymentFeePct,
        defaultPaymentFixedFeeGbp: settings.defaultPaymentFixedFeeGbp,
        minMarginPct: settings.minMarginPct,
        minProfitGbp: settings.minProfitGbp,
      },
    });
    return res.json({ ok: true, breakdown, currency: 'GBP', destination: 'GB' });
  } catch (err) {
    return res.status(500).json({ error: 'PRICING_PREVIEW_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EVALUATE (qualification)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/evaluate', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  const cid = correlationId();
  await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /evaluate', step: CJ_EBAY_UK_TRACE_STEP.QUALIFICATION_START });
  try {
    const { productId: cjProductId, variantId, quantity = 1 } = req.body as Record<string, unknown>;
    if (!cjProductId || !variantId) {
      return res.status(400).json({ error: 'MISSING_FIELDS', detail: 'productId and variantId required' });
    }

    const adapter = await createCjSupplierAdapter(userId);
    const settings = await cjEbayUkConfigService.getOrCreateSettings(userId);
    const product = await adapter.getProductById(String(cjProductId));
    const variant = product.variants.find(
      (v) => v.cjVid === String(variantId) || v.cjSku === String(variantId)
    );
    if (!variant) return res.status(404).json({ error: 'VARIANT_NOT_FOUND' });

    // Get UK shipping quote
    const shippingResult = await adapter.quoteShippingToUsReal({
      variantId: variant.cjVid || undefined,
      productId: cjProductId ? String(cjProductId) : undefined,
      quantity: Number(quantity),
      destCountryCode: CJ_EBAY_UK_DEST_COUNTRY,
      startCountryCode: 'CN',
    });
    const shippingUsd = shippingResult.quote.cost;
    const fx = settings.fxRateUsdToGbp;
    const shippingGbp = shippingUsd * fx;

    const breakdown = computeUkPricingPreview({
      supplierCostUsd: variant.unitCostUsd,
      shippingUsd,
      listPriceGbp: null,
      settings: {
        fxRateUsdToGbp: fx,
        ukVatPct: settings.ukVatPct,
        vatMarketplaceFacilitated: settings.vatMarketplaceFacilitated,
        incidentBufferPct: settings.incidentBufferPct,
        defaultEbayFeePct: settings.defaultEbayFeePct,
        defaultPaymentFeePct: settings.defaultPaymentFeePct,
        defaultPaymentFixedFeeGbp: settings.defaultPaymentFixedFeeGbp,
        minMarginPct: settings.minMarginPct,
        minProfitGbp: settings.minProfitGbp,
      },
    });

    // Qualification decision
    const reasons: Array<{ rule: string; code: string; message: string; severity: string }> = [];
    let decision: 'APPROVED' | 'REJECTED' | 'PENDING' = 'APPROVED';

    if (variant.stock === 0) {
      reasons.push({ rule: 'stock', code: 'ZERO_STOCK', message: 'Variant has zero stock', severity: 'block' });
      decision = 'REJECTED';
    }
    if (settings.maxShippingUsd != null && shippingUsd > settings.maxShippingUsd) {
      reasons.push({ rule: 'shipping', code: 'SHIPPING_EXCEEDS_MAX', message: `Shipping £${breakdown.shippingGbp} exceeds max`, severity: 'block' });
      decision = 'REJECTED';
    }
    if (settings.minMarginPct != null && breakdown.netMarginPct != null && breakdown.netMarginPct < settings.minMarginPct) {
      reasons.push({ rule: 'margin', code: 'MARGIN_BELOW_MIN', message: `Margin ${breakdown.netMarginPct?.toFixed(1)}% below min ${settings.minMarginPct}%`, severity: 'block' });
      decision = 'REJECTED';
    }
    if (settings.minProfitGbp != null && breakdown.netProfitGbp != null && breakdown.netProfitGbp < settings.minProfitGbp) {
      reasons.push({ rule: 'profit', code: 'PROFIT_BELOW_MIN', message: `Profit £${breakdown.netProfitGbp?.toFixed(2)} below min £${settings.minProfitGbp}`, severity: 'block' });
      decision = 'REJECTED';
    }

    // Persist product + variant + evaluation
    let productRow = await prisma.cjEbayUkProduct.findUnique({ where: { userId_cjProductId: { userId, cjProductId: String(cjProductId) } } });
    if (!productRow) {
      productRow = await prisma.cjEbayUkProduct.create({
        data: { userId, cjProductId: String(cjProductId), title: product.title, description: product.description, images: product.imageUrls as string[] },
      });
    }
    let variantRow = await prisma.cjEbayUkProductVariant.findFirst({
      where: { productId: productRow.id, cjSku: variant.cjSku },
    });
    if (!variantRow) {
      variantRow = await prisma.cjEbayUkProductVariant.create({
        data: {
          productId: productRow.id,
          cjSku: variant.cjSku,
          cjVid: variant.cjVid,
          attributes: variant.attributes as object,
          unitCostUsd: new Prisma.Decimal(variant.unitCostUsd),
          stockLastKnown: variant.stock,
          stockCheckedAt: new Date(),
        },
      });
    }

    const evalRow = await prisma.cjEbayUkProductEvaluation.create({
      data: {
        userId,
        productId: productRow.id,
        variantId: variantRow.id,
        decision,
        reasons: reasons as object[],
        supplierCostUsd: new Prisma.Decimal(variant.unitCostUsd),
        shippingUsd: new Prisma.Decimal(shippingUsd),
        shippingGbp: new Prisma.Decimal(Math.round(shippingGbp * 100) / 100),
        fxRateUsed: new Prisma.Decimal(fx),
        estimatedListPriceGbp: new Prisma.Decimal(breakdown.suggestedPriceGbp),
        estimatedMarginPct: breakdown.netMarginPct != null ? new Prisma.Decimal(Math.round(breakdown.netMarginPct * 100) / 100) : null,
        estimatedProfitGbp: breakdown.netProfitGbp != null ? new Prisma.Decimal(Math.round(breakdown.netProfitGbp * 100) / 100) : null,
        vatDeductedGbp: new Prisma.Decimal(breakdown.vatDeductedGbp),
        rawBreakdown: breakdown as object,
      },
    });

    await cjEbayUkTraceService.log({
      userId, correlationId: cid, route: 'POST /evaluate', step: CJ_EBAY_UK_TRACE_STEP.QUALIFICATION_RESULT,
      meta: { decision, evalId: evalRow.id, margin: breakdown.netMarginPct, profitGbp: breakdown.netProfitGbp },
    });

    return res.json({
      ok: true,
      decision,
      reasons,
      breakdown,
      ids: { productDbId: productRow.id, variantDbId: variantRow.id, evaluationId: evalRow.id },
      currency: 'GBP',
      destination: 'GB',
      vatNote: 'UK VAT (20%) deducted from seller payout by eBay UK marketplace facilitator for orders ≤ £135.',
    });
  } catch (err) {
    await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /evaluate', step: CJ_EBAY_UK_TRACE_STEP.REQUEST_ERROR, message: (err as Error).message });
    return res.status(500).json({ error: 'EVALUATE_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LISTINGS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/listings', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const listings = await prisma.cjEbayUkListing.findMany({
      where: { userId },
      include: { product: true, variant: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return res.json({ ok: true, listings });
  } catch (err) {
    return res.status(500).json({ error: 'LISTINGS_ERROR', detail: (err as Error).message });
  }
});

router.post('/listings/draft', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  const cid = correlationId();
  await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /listings/draft', step: CJ_EBAY_UK_TRACE_STEP.LISTING_DRAFT_START });
  try {
    const { cjProductId, cjVariantId, listedPriceGbp } = req.body as {
      cjProductId: string;
      cjVariantId: string;
      listedPriceGbp: number;
    };
    if (!cjProductId || !cjVariantId || !listedPriceGbp) {
      return res.status(400).json({ error: 'MISSING_FIELDS', detail: 'cjProductId, cjVariantId, listedPriceGbp required' });
    }

    const productRow = await prisma.cjEbayUkProduct.findUnique({
      where: { userId_cjProductId: { userId, cjProductId } },
      include: { variants: true },
    });
    if (!productRow) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND', detail: 'Run evaluate first' });
    const variantRow = productRow.variants.find((v) => v.cjVid === cjVariantId || v.cjSku === cjVariantId);
    if (!variantRow) return res.status(404).json({ error: 'VARIANT_NOT_FOUND' });

    // Build draft payload for eBay UK
    const ebaySku = `cj-uk-${cjProductId}-${variantRow.cjSku}`.slice(0, 50);
    const draftPayload = {
      title: `${productRow.title}`.slice(0, 80),
      currency: 'GBP',
      listedPriceGbp,
      marketplaceId: 'EBAY_GB',
      siteId: 3,
      ebaySku,
      images: Array.isArray(productRow.images) ? (productRow.images as string[]).slice(0, 8) : [],
      vatNote: 'UK VAT handled by eBay marketplace facilitator',
      condition: 'NEW',
    };

    let listing = await prisma.cjEbayUkListing.findFirst({
      where: { userId, productId: productRow.id, variantId: variantRow.id },
    });
    if (listing) {
      listing = await prisma.cjEbayUkListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_EBAY_UK_LISTING_STATUS.DRAFT,
          listedPriceGbp: new Prisma.Decimal(listedPriceGbp),
          draftPayload: draftPayload as object,
          ebaySku,
          publishError: null,
        },
      });
    } else {
      listing = await prisma.cjEbayUkListing.create({
        data: {
          userId,
          productId: productRow.id,
          variantId: variantRow.id,
          status: CJ_EBAY_UK_LISTING_STATUS.DRAFT,
          listedPriceGbp: new Prisma.Decimal(listedPriceGbp),
          draftPayload: draftPayload as object,
          ebaySku,
        },
      });
    }

    await cjEbayUkTraceService.log({
      userId, correlationId: cid, route: 'POST /listings/draft', step: CJ_EBAY_UK_TRACE_STEP.LISTING_DRAFT_CREATED,
      meta: { listingId: listing.id, ebaySku, listedPriceGbp },
    });
    return res.json({ ok: true, listing });
  } catch (err) {
    return res.status(500).json({ error: 'DRAFT_ERROR', detail: (err as Error).message });
  }
});

router.post('/listings/publish', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  const cid = correlationId();
  await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /listings/publish', step: CJ_EBAY_UK_TRACE_STEP.LISTING_PUBLISH_START });
  try {
    const { listingId } = req.body as { listingId: number };
    const listing = await prisma.cjEbayUkListing.findFirst({ where: { id: Number(listingId), userId } });
    if (!listing) return res.status(404).json({ error: 'LISTING_NOT_FOUND' });
    if (listing.status !== CJ_EBAY_UK_LISTING_STATUS.DRAFT) {
      return res.status(400).json({ error: 'LISTING_NOT_DRAFT', detail: `Status is ${listing.status}` });
    }

    // SCAFFOLDED: eBay UK Inventory API publish not yet wired (requires EBAY_GB OAuth).
    // Transition to ACCOUNT_POLICY_BLOCK to indicate authorization pending.
    await prisma.cjEbayUkListing.update({
      where: { id: listing.id },
      data: {
        status: CJ_EBAY_UK_LISTING_STATUS.ACCOUNT_POLICY_BLOCK,
        publishError: 'eBay UK seller account authorization pending. Ensure your eBay account is set up for ebay.co.uk and has overseas shipping approved.',
      },
    });
    await cjEbayUkTraceService.log({
      userId, correlationId: cid, route: 'POST /listings/publish', step: CJ_EBAY_UK_TRACE_STEP.LISTING_PUBLISH_ACCOUNT_POLICY_BLOCK,
      meta: { listingId: listing.id, note: 'EBAY_GB OAuth required — authorization pending' },
    });
    return res.status(202).json({
      ok: false,
      status: CJ_EBAY_UK_LISTING_STATUS.ACCOUNT_POLICY_BLOCK,
      message: 'eBay UK publish requires EBAY_GB seller authorization. Draft preserved. Connect eBay UK account in API Settings.',
      listingId: listing.id,
    });
  } catch (err) {
    return res.status(500).json({ error: 'PUBLISH_ERROR', detail: (err as Error).message });
  }
});

router.get('/listings/:listingId', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const listing = await prisma.cjEbayUkListing.findFirst({
      where: { id: Number(req.params.listingId), userId },
      include: { product: true, variant: true },
    });
    if (!listing) return res.status(404).json({ error: 'LISTING_NOT_FOUND' });
    return res.json({ ok: true, listing });
  } catch (err) {
    return res.status(500).json({ error: 'LISTING_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/orders', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const orders = await prisma.cjEbayUkOrder.findMany({
      where: { userId },
      include: { product: true, listing: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return res.json({ ok: true, orders });
  } catch (err) {
    return res.status(500).json({ error: 'ORDERS_ERROR', detail: (err as Error).message });
  }
});

router.post('/orders/import', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  const cid = correlationId();
  await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /orders/import', step: CJ_EBAY_UK_TRACE_STEP.ORDER_IMPORT_START });
  try {
    const { ebayOrderId } = req.body as { ebayOrderId: string };
    if (!ebayOrderId) return res.status(400).json({ error: 'MISSING_EBAY_ORDER_ID' });

    const existing = await prisma.cjEbayUkOrder.findUnique({ where: { userId_ebayOrderId: { userId, ebayOrderId } } });
    if (existing) return res.json({ ok: true, order: existing, note: 'Order already imported' });

    // Scaffolded: eBay UK Browse API import not yet wired (same as USA but for EBAY_GB orders)
    const order = await prisma.cjEbayUkOrder.create({
      data: {
        userId,
        ebayOrderId,
        status: CJ_EBAY_UK_ORDER_STATUS.DETECTED,
        cjPostCreateCheckoutMode: CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE.MANUAL,
        rawEbaySummary: { ebayOrderId, importedAt: new Date().toISOString(), note: 'SCAFFOLD: eBay UK order import — manual data pending' } as object,
      },
    });

    await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /orders/import', step: CJ_EBAY_UK_TRACE_STEP.ORDER_IMPORT_SUCCESS, meta: { orderId: order.id } });
    return res.json({ ok: true, order, note: 'Order created in DETECTED status. Wire eBay UK Browse API to auto-populate buyer details.' });
  } catch (err) {
    await cjEbayUkTraceService.log({ userId, correlationId: cid, route: 'POST /orders/import', step: CJ_EBAY_UK_TRACE_STEP.ORDER_IMPORT_ERROR, message: (err as Error).message });
    return res.status(500).json({ error: 'ORDER_IMPORT_ERROR', detail: (err as Error).message });
  }
});

router.get('/orders/:orderId', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const order = await prisma.cjEbayUkOrder.findFirst({
      where: { id: Number(req.params.orderId), userId },
      include: { product: true, listing: true, refunds: true, tracking: true },
    });
    if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    return res.json({ ok: true, order });
  } catch (err) {
    return res.status(500).json({ error: 'ORDER_ERROR', detail: (err as Error).message });
  }
});

router.post('/orders/:orderId/place', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  const cid = correlationId();
  await cjEbayUkTraceService.log({ userId, correlationId: cid, route: `POST /orders/${req.params.orderId}/place`, step: CJ_EBAY_UK_TRACE_STEP.ORDER_PLACE_START });
  try {
    const order = await prisma.cjEbayUkOrder.findFirst({ where: { id: Number(req.params.orderId), userId } });
    if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });

    const variant = order.variantId
      ? await prisma.cjEbayUkProductVariant.findFirst({ where: { id: order.variantId } })
      : null;
    if (!variant?.cjVid) {
      return res.status(400).json({ error: 'VARIANT_NOT_RESOLVED', detail: 'Link order to a variant with cjVid before placing' });
    }

    const adapter = await createCjSupplierAdapter(userId);
    const buyerPayload = order.buyerPayload as Record<string, string> | null;
    if (!buyerPayload) return res.status(400).json({ error: 'NO_BUYER_ADDRESS', detail: 'Import order buyer address first' });

    const result = await adapter.createOrder({
      idempotencyKey: `cj-uk-${order.id}`,
      lines: [{ cjVid: variant.cjVid, cjSku: variant.cjSku, quantity: 1 }],
      shipTo: buyerPayload,
      logisticName: 'CJPacket',
      fromCountryCode: 'CN',
      payType: 3,
    });

    const updated = await prisma.cjEbayUkOrder.update({
      where: { id: order.id },
      data: {
        cjOrderId: result.cjOrderId,
        status: CJ_EBAY_UK_ORDER_STATUS.CJ_ORDER_CREATED,
        events: [...((order.events as object[]) || []), { at: new Date().toISOString(), step: 'CJ_ORDER_PLACED', cjOrderId: result.cjOrderId }] as object[],
      },
    });

    await cjEbayUkTraceService.log({ userId, correlationId: cid, route: `POST /orders/${order.id}/place`, step: CJ_EBAY_UK_TRACE_STEP.ORDER_PLACE_SUCCESS, meta: { cjOrderId: result.cjOrderId } });
    return res.json({ ok: true, order: updated });
  } catch (err) {
    await cjEbayUkTraceService.log({ userId, correlationId: cid, route: `POST /orders/${req.params.orderId}/place`, step: CJ_EBAY_UK_TRACE_STEP.ORDER_PLACE_ERROR, message: (err as Error).message });
    return res.status(500).json({ error: 'ORDER_PLACE_ERROR', detail: (err as Error).message });
  }
});

router.post('/orders/:orderId/confirm', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const order = await prisma.cjEbayUkOrder.findFirst({ where: { id: Number(req.params.orderId), userId } });
    if (!order?.cjOrderId) return res.status(400).json({ error: 'NO_CJ_ORDER_ID', detail: 'Place order first' });
    const adapter = await createCjSupplierAdapter(userId);
    await adapter.confirmOrder(order.cjOrderId);
    const updated = await prisma.cjEbayUkOrder.update({
      where: { id: order.id },
      data: {
        status: CJ_EBAY_UK_ORDER_STATUS.CJ_ORDER_CONFIRMED,
        events: [...((order.events as object[]) || []), { at: new Date().toISOString(), step: 'CJ_ORDER_CONFIRMED' }] as object[],
      },
    });
    return res.json({ ok: true, order: updated });
  } catch (err) {
    return res.status(500).json({ error: 'ORDER_CONFIRM_ERROR', detail: (err as Error).message });
  }
});

router.post('/orders/:orderId/pay', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  const cid = correlationId();
  try {
    const order = await prisma.cjEbayUkOrder.findFirst({ where: { id: Number(req.params.orderId), userId } });
    if (!order?.cjOrderId) return res.status(400).json({ error: 'NO_CJ_ORDER_ID', detail: 'Confirm order first' });
    const adapter = await createCjSupplierAdapter(userId);
    try {
      await adapter.payBalance(order.cjOrderId);
      const updated = await prisma.cjEbayUkOrder.update({
        where: { id: order.id },
        data: {
          status: CJ_EBAY_UK_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
          events: [...((order.events as object[]) || []), { at: new Date().toISOString(), step: 'CJ_PAYMENT_COMPLETED' }] as object[],
        },
      });
      await cjEbayUkTraceService.log({ userId, correlationId: cid, route: `POST /orders/${order.id}/pay`, step: CJ_EBAY_UK_TRACE_STEP.CJ_ORDER_PAY_SUCCESS });
      return res.json({ ok: true, order: updated });
    } catch (payErr) {
      const msg = (payErr as Error).message || '';
      if (msg.toLowerCase().includes('balance') || msg.toLowerCase().includes('insufficient')) {
        await prisma.cjEbayUkOrder.update({
          where: { id: order.id },
          data: {
            status: CJ_EBAY_UK_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
            paymentBlockReason: 'CJ_BALANCE_INSUFFICIENT',
          },
        });
        await prisma.cjEbayUkAlert.create({
          data: { userId, orderId: order.id, type: CJ_EBAY_UK_ALERT_TYPE.SUPPLIER_PAYMENT_BLOCKED, severity: 'HIGH', message: `CJ balance insufficient for order ${order.ebayOrderId}` },
        });
        await cjEbayUkTraceService.log({ userId, correlationId: cid, route: `POST /orders/${order.id}/pay`, step: CJ_EBAY_UK_TRACE_STEP.CJ_ORDER_PAY_BALANCE_BLOCKED });
        return res.status(402).json({ error: 'SUPPLIER_PAYMENT_BLOCKED', detail: 'CJ balance insufficient. Top up CJ account.' });
      }
      throw payErr;
    }
  } catch (err) {
    return res.status(500).json({ error: 'ORDER_PAY_ERROR', detail: (err as Error).message });
  }
});

router.post('/orders/:orderId/sync-tracking', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  const cid = correlationId();
  await cjEbayUkTraceService.log({ userId, correlationId: cid, route: `POST /orders/${req.params.orderId}/sync-tracking`, step: CJ_EBAY_UK_TRACE_STEP.TRACKING_SYNC_START });
  try {
    const order = await prisma.cjEbayUkOrder.findFirst({ where: { id: Number(req.params.orderId), userId } });
    if (!order?.cjOrderId) return res.status(400).json({ error: 'NO_CJ_ORDER_ID' });
    const adapter = await createCjSupplierAdapter(userId);
    const tracking = await adapter.getTracking(order.cjOrderId);
    if (!tracking?.trackingNumber) {
      return res.json({ ok: false, note: 'No tracking number available yet from CJ' });
    }
    await prisma.cjEbayUkTracking.upsert({
      where: { id: (await prisma.cjEbayUkTracking.findFirst({ where: { orderId: order.id } }))?.id ?? 0 },
      create: { orderId: order.id, carrierCode: tracking.carrierCode, trackingNumber: tracking.trackingNumber, trackingUrl: tracking.trackingUrl, cjOrderStatus: tracking.cjOrderStatus },
      update: { carrierCode: tracking.carrierCode, trackingNumber: tracking.trackingNumber, trackingUrl: tracking.trackingUrl, cjOrderStatus: tracking.cjOrderStatus },
    });
    await cjEbayUkTraceService.log({ userId, correlationId: cid, route: `POST /orders/${order.id}/sync-tracking`, step: CJ_EBAY_UK_TRACE_STEP.TRACKING_SYNC_SUCCESS, meta: { trackingNumber: tracking.trackingNumber } });
    return res.json({ ok: true, tracking });
  } catch (err) {
    await cjEbayUkTraceService.log({ userId, correlationId: cid, route: `POST /orders/${req.params.orderId}/sync-tracking`, step: CJ_EBAY_UK_TRACE_STEP.TRACKING_SYNC_ERROR, message: (err as Error).message });
    return res.status(500).json({ error: 'TRACKING_SYNC_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REFUNDS
// ─────────────────────────────────────────────────────────────────────────────

router.post('/orders/:orderId/refunds', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const order = await prisma.cjEbayUkOrder.findFirst({ where: { id: Number(req.params.orderId), userId } });
    if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    const { reason, type = 'FULL', amountGbp } = req.body as { reason?: string; type?: string; amountGbp?: number };
    const refund = await prisma.cjEbayUkOrderRefund.create({
      data: {
        orderId: order.id,
        status: CJ_EBAY_UK_REFUND_STATUS.RETURN_REQUESTED,
        type,
        reason,
        amountGbp: amountGbp != null ? new Prisma.Decimal(amountGbp) : null,
        events: [{ at: new Date().toISOString(), step: CJ_EBAY_UK_REFUND_STATUS.RETURN_REQUESTED }] as object[],
      },
    });
    return res.json({ ok: true, refund });
  } catch (err) {
    return res.status(500).json({ error: 'REFUND_ERROR', detail: (err as Error).message });
  }
});

router.get('/orders/:orderId/refunds', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const order = await prisma.cjEbayUkOrder.findFirst({ where: { id: Number(req.params.orderId), userId } });
    if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    const refunds = await prisma.cjEbayUkOrderRefund.findMany({ where: { orderId: order.id } });
    return res.json({ ok: true, refunds });
  } catch (err) {
    return res.status(500).json({ error: 'REFUNDS_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/alerts', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const { status } = req.query as { status?: string };
    const alerts = await prisma.cjEbayUkAlert.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json({ ok: true, alerts });
  } catch (err) {
    return res.status(500).json({ error: 'ALERTS_ERROR', detail: (err as Error).message });
  }
});

router.post('/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const alert = await prisma.cjEbayUkAlert.findFirst({ where: { id: Number(req.params.alertId), userId } });
    if (!alert) return res.status(404).json({ error: 'ALERT_NOT_FOUND' });
    const updated = await prisma.cjEbayUkAlert.update({ where: { id: alert.id }, data: { status: 'ACKNOWLEDGED' } });
    return res.json({ ok: true, alert: updated });
  } catch (err) {
    return res.status(500).json({ error: 'ALERT_ERROR', detail: (err as Error).message });
  }
});

router.post('/alerts/:alertId/resolve', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const alert = await prisma.cjEbayUkAlert.findFirst({ where: { id: Number(req.params.alertId), userId } });
    if (!alert) return res.status(404).json({ error: 'ALERT_NOT_FOUND' });
    const updated = await prisma.cjEbayUkAlert.update({ where: { id: alert.id }, data: { status: 'RESOLVED' } });
    return res.json({ ok: true, alert: updated });
  } catch (err) {
    return res.status(500).json({ error: 'ALERT_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROFIT
// ─────────────────────────────────────────────────────────────────────────────

router.get('/profit', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const dateFilter = from && to
      ? { snapshotDate: { gte: new Date(from), lte: new Date(to) } }
      : {};
    const snapshots = await prisma.cjEbayUkProfitSnapshot.findMany({
      where: { userId, ...dateFilter },
      orderBy: { snapshotDate: 'desc' },
      take: 90,
    });

    // Aggregates
    const totalRevenueGbp = snapshots.reduce((s, r) => s + Number(r.estimatedRevenueGbp), 0);
    const totalProfitGbp = snapshots.reduce((s, r) => s + Number(r.estimatedProfitGbp), 0);
    const totalOrders = snapshots.reduce((s, r) => s + r.completedOrders, 0);

    const activeOrders = await prisma.cjEbayUkOrder.count({
      where: { userId, status: { notIn: [CJ_EBAY_UK_ORDER_STATUS.COMPLETED, CJ_EBAY_UK_ORDER_STATUS.FAILED] } },
    });
    const blockedOrders = await prisma.cjEbayUkOrder.count({
      where: { userId, status: CJ_EBAY_UK_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED },
    });

    return res.json({
      ok: true,
      currency: 'GBP',
      destination: 'GB',
      summary: {
        totalRevenueGbp: Math.round(totalRevenueGbp * 100) / 100,
        totalProfitGbp: Math.round(totalProfitGbp * 100) / 100,
        totalCompletedOrders: totalOrders,
        activeOrders,
        blockedOrders,
        marginNote: 'Profit is ESTIMATED based on evaluation-time pricing. UK VAT (20%) marketplace facilitation deducted.',
      },
      snapshots,
    });
  } catch (err) {
    return res.status(500).json({ error: 'PROFIT_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGS (execution traces)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/logs', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const traces = await prisma.cjEbayUkExecutionTrace.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return res.json({ ok: true, traces });
  } catch (err) {
    return res.status(500).json({ error: 'LOGS_ERROR', detail: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OPPORTUNITIES (trend discovery for UK)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/opportunities/discover', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const { mode = 'STARTER', maxSeeds = 8 } = req.body as { mode?: string; maxSeeds?: number };
    const run = await prisma.cjEbayUkOpportunityRun.create({
      data: { id: uuidv4(), userId, status: 'RUNNING', mode },
    });

    const { seeds, providerUsed, providerNote } = await cjEbayUkTrendDiscoveryService.discoverSeeds(Number(maxSeeds));
    const adapter = await createCjSupplierAdapter(userId);
    const settings = await cjEbayUkConfigService.getOrCreateSettings(userId);
    const candidates: Array<Record<string, unknown>> = [];

    for (const seed of seeds) {
      try {
        const results = await adapter.searchProducts({ keyword: seed.keyword, pageSize: 3 });
        for (const item of results.slice(0, 2)) {
          if (!item.inventoryTotal || item.inventoryTotal === 0) continue;
          let shippingUsd = 5.0;
          let shippingConfidence = 'ESTIMATED';
          try {
            const sq = await adapter.quoteShippingToUsReal({
              productId: item.cjProductId,
              quantity: 1,
              destCountryCode: CJ_EBAY_UK_DEST_COUNTRY,
              startCountryCode: 'CN',
            });
            shippingUsd = sq.quote.cost;
            shippingConfidence = 'KNOWN';
          } catch { /* use estimated */ }

          const detail = await adapter.getProductById(item.cjProductId).catch(() => null);
          const variant = detail?.variants[0];
          if (!variant) continue;

          const breakdown = computeUkPricingPreview({
            supplierCostUsd: variant.unitCostUsd,
            shippingUsd,
            listPriceGbp: null,
            settings: {
              fxRateUsdToGbp: settings.fxRateUsdToGbp,
              ukVatPct: settings.ukVatPct,
              vatMarketplaceFacilitated: settings.vatMarketplaceFacilitated,
              incidentBufferPct: settings.incidentBufferPct,
              defaultEbayFeePct: settings.defaultEbayFeePct,
              defaultPaymentFeePct: settings.defaultPaymentFeePct,
              defaultPaymentFixedFeeGbp: settings.defaultPaymentFixedFeeGbp,
              minMarginPct: settings.minMarginPct,
              minProfitGbp: settings.minProfitGbp,
            },
          });

          candidates.push({
            id: uuidv4(),
            runId: run.id,
            userId,
            seedKeyword: seed.keyword,
            seedSource: seed.source,
            seedCategory: seed.category,
            seedConfidence: seed.trendConfidence ? new Prisma.Decimal(seed.trendConfidence) : undefined,
            cjProductId: item.cjProductId,
            cjProductTitle: item.title,
            cjVariantSku: variant.cjSku,
            cjVariantVid: variant.cjVid,
            images: (item.mainImageUrl ? [item.mainImageUrl] : []) as string[],
            supplierCostUsd: new Prisma.Decimal(variant.unitCostUsd),
            shippingUsd: new Prisma.Decimal(shippingUsd),
            shippingGbp: new Prisma.Decimal(breakdown.shippingGbp),
            shippingConfidence,
            stockCount: item.inventoryTotal,
            pricingSnapshot: breakdown as object,
            recommendationReason: seed.evidenceSummary || `UK heuristic trend seed: ${seed.keyword}`,
            status: 'SHORTLISTED',
            trendSourceType: 'HEURISTIC',
            marketPriceSourceType: 'MOCK',
            dataConfidenceScore: Math.round(seed.trendConfidence * 60),
            totalScore: new Prisma.Decimal(Math.round(seed.trendConfidence * 65)),
          } as Parameters<typeof prisma.cjEbayUkOpportunityCandidate.create>[0]['data']);
        }
      } catch (seedErr) {
        logger.warn(`[CjEbayUk] Seed "${seed.keyword}" error: ${(seedErr as Error).message}`);
      }
    }

    if (candidates.length > 0) {
      await prisma.cjEbayUkOpportunityCandidate.createMany({ data: candidates as Parameters<typeof prisma.cjEbayUkOpportunityCandidate.createMany>[0]['data'] });
    }

    await prisma.cjEbayUkOpportunityRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        providerUsed,
        providerNote,
        seedCount: seeds.length,
        candidateCount: candidates.length,
        shortlistedCount: candidates.length,
        completedAt: new Date(),
      },
    });

    return res.status(202).json({
      ok: true,
      runId: run.id,
      seedCount: seeds.length,
      candidateCount: candidates.length,
      providerUsed,
      note: 'UK opportunity discovery complete. Data classification: HEURISTIC seeds, ESTIMATED market pricing.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'DISCOVER_ERROR', detail: (err as Error).message });
  }
});

router.get('/opportunities/runs', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const runs = await prisma.cjEbayUkOpportunityRun.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json({ ok: true, runs });
  } catch (err) {
    return res.status(500).json({ error: 'RUNS_ERROR', detail: (err as Error).message });
  }
});

router.get('/opportunities/recommendations', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const candidates = await prisma.cjEbayUkOpportunityCandidate.findMany({
      where: { userId, status: 'SHORTLISTED' },
      orderBy: { totalScore: 'desc' },
      take: 10,
    });
    const latestRun = await prisma.cjEbayUkOpportunityRun.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, candidates, latestRun, destination: 'GB', currency: 'GBP' });
  } catch (err) {
    return res.status(500).json({ error: 'RECOMMENDATIONS_ERROR', detail: (err as Error).message });
  }
});

router.get('/opportunities/candidates/:id', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const candidate = await prisma.cjEbayUkOpportunityCandidate.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!candidate) return res.status(404).json({ error: 'CANDIDATE_NOT_FOUND' });
    return res.json({ ok: true, candidate });
  } catch (err) {
    return res.status(500).json({ error: 'CANDIDATE_ERROR', detail: (err as Error).message });
  }
});

router.post('/opportunities/candidates/:id/approve', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const candidate = await prisma.cjEbayUkOpportunityCandidate.findFirst({ where: { id: req.params.id, userId } });
    if (!candidate) return res.status(404).json({ error: 'CANDIDATE_NOT_FOUND' });
    const updated = await prisma.cjEbayUkOpportunityCandidate.update({
      where: { id: candidate.id },
      data: { status: 'APPROVED', reviewedAt: new Date() },
    });
    return res.json({ ok: true, candidate: updated });
  } catch (err) {
    return res.status(500).json({ error: 'APPROVE_ERROR', detail: (err as Error).message });
  }
});

router.post('/opportunities/candidates/:id/reject', async (req: Request, res: Response) => {
  if (!env.ENABLE_CJ_EBAY_UK_MODULE) return moduleDisabled(res);
  const userId = (req as any).user?.id as number;
  try {
    const candidate = await prisma.cjEbayUkOpportunityCandidate.findFirst({ where: { id: req.params.id, userId } });
    if (!candidate) return res.status(404).json({ error: 'CANDIDATE_NOT_FOUND' });
    const updated = await prisma.cjEbayUkOpportunityCandidate.update({
      where: { id: candidate.id },
      data: { status: 'REJECTED', reviewedAt: new Date(), reviewNotes: String(req.body?.notes || '') },
    });
    return res.json({ ok: true, candidate: updated });
  } catch (err) {
    return res.status(500).json({ error: 'REJECT_ERROR', detail: (err as Error).message });
  }
});

export default router;
