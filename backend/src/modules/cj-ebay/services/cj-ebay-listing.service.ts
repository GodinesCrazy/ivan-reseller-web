/**
 * CJ → eBay USA — listing engine (FASE 3D).
 * Sin createOrder CJ, sin tracking, sin MarketplaceService.publishToEbay, sin ebay-us-delivery-estimate.
 */

import { Prisma } from '@prisma/client';
import { AppError } from '../../../middleware/error.middleware';
import { env } from '../../../config/env';
import { prisma } from '../../../config/database';
import type { EbayProduct } from '../../../services/ebay.service';
import { cjEbayEbayFacadeService } from './cj-ebay-ebay-facade.service';
import { cjEbayTraceService } from './cj-ebay-trace.service';
import { CJ_EBAY_TRACE_STEP, CJ_EBAY_LISTING_STATUS } from '../cj-ebay.constants';
import {
  computeFullPricingPreview,
  prismaSettingsToFeeInput,
  pricingBreakdownForResponse,
} from './cj-ebay-pricing.service';
import {
  buildListingDescriptionHtml,
  CJ_LISTING_ORIGIN_COUNTRY,
  CJ_LISTING_ORIGIN_LABEL,
  computeHandlingTimeDays,
} from '../policies/cj-ebay-listing-shipping.policy';

export const CJ_EBAY_LISTING_EVAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CJ_EBAY_LISTING_QUOTE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export interface CjListingDraftBody {
  productId: string;
  variantId: string;
  quantity: number;
  destPostalCode?: string;
}

function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((x) => typeof x === 'string' && /^https?:\/\//i.test(x))
      .slice(0, 12);
  }
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) {
        return j
          .filter((x) => typeof x === 'string' && /^https?:\/\//i.test(x))
          .slice(0, 12);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

function buildInternalSku(userId: number, productRowId: number, variantRowId: number): string {
  return `CJE${userId}P${productRowId}V${variantRowId}`.slice(0, 50);
}

function isQuoteStale(quote: { createdAt: Date; validUntil: Date | null }): boolean {
  const age = Date.now() - quote.createdAt.getTime();
  if (age > CJ_EBAY_LISTING_QUOTE_MAX_AGE_MS) return true;
  if (quote.validUntil && new Date() > quote.validUntil) return true;
  return false;
}

function isEvalStale(evaluatedAt: Date): boolean {
  return Date.now() - evaluatedAt.getTime() > CJ_EBAY_LISTING_EVAL_MAX_AGE_MS;
}

export const cjEbayListingService = {
  async createOrUpdateDraft(input: {
    userId: number;
    body: CjListingDraftBody;
    correlationId?: string;
    route?: string;
  }) {
    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.LISTING_DRAFT_START,
      message: 'listing.draft.start',
      meta: { productId: input.body.productId, variantId: input.body.variantId },
    });

    await prisma.cjEbayAccountSettings.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId },
      update: {},
    });
    const settings = await prisma.cjEbayAccountSettings.findUniqueOrThrow({
      where: { userId: input.userId },
    });

    const product = await prisma.cjEbayProduct.findFirst({
      where: { userId: input.userId, cjProductId: String(input.body.productId).trim() },
      include: { variants: true },
    });
    if (!product) {
      throw new AppError('CJ product snapshot not found. Run evaluate first.', 404);
    }
    const vKey = String(input.body.variantId).trim();
    const variantRow = product.variants.find((v) => v.cjVid === vKey || v.cjSku === vKey);
    if (!variantRow) {
      throw new AppError('Variant not found on stored CJ product.', 400);
    }

    const evaluation = await prisma.cjEbayProductEvaluation.findFirst({
      where: {
        userId: input.userId,
        variantId: variantRow.id,
        decision: 'APPROVED',
      },
      orderBy: { evaluatedAt: 'desc' },
      include: { shippingQuote: true },
    });
    if (!evaluation) {
      throw new AppError('No APPROVED evaluation for this variant. Evaluate and approve first.', 400);
    }
    if (!evaluation.shippingQuoteId || !evaluation.shippingQuote) {
      throw new AppError('Approved evaluation is missing shipping quote linkage.', 400);
    }
    if (isEvalStale(evaluation.evaluatedAt)) {
      throw new AppError('Evaluation is stale (>24h). Re-run evaluate.', 400);
    }
    const quote = evaluation.shippingQuote;
    if (isQuoteStale(quote)) {
      throw new AppError('Shipping quote is stale or expired. Re-run evaluate with fresh freight.', 400);
    }

    const unit = variantRow.unitCostUsd != null ? Number(variantRow.unitCostUsd) : NaN;
    if (!Number.isFinite(unit) || unit <= 0) {
      throw new AppError('Variant unit cost missing — cannot build listing draft.', 400);
    }
    const lineQty = Math.max(1, Math.floor(input.body.quantity));
    const supplierLineCost = unit * lineQty;
    const shipCost = Number(quote.amountUsd);
    if (!Number.isFinite(shipCost)) {
      throw new AppError('Invalid shipping quote amount.', 400);
    }

    let breakdown;
    try {
      breakdown = computeFullPricingPreview({
        supplierCostUsd: supplierLineCost,
        shippingUsd: shipCost,
        feeRow: prismaSettingsToFeeInput(settings),
        minMarginPct: settings.minMarginPct != null ? Number(settings.minMarginPct) : null,
        minProfitUsd: settings.minProfitUsd != null ? Number(settings.minProfitUsd) : null,
      });
    } catch (e) {
      throw new AppError(`Pricing failed: ${e instanceof Error ? e.message : String(e)}`, 400);
    }
    const price = breakdown.suggestedPriceUsd;
    if (!Number.isFinite(price) || price <= 0) {
      throw new AppError('Suggested price invalid — draft blocked.', 400);
    }

    const images = parseImages(product.images);
    if (images.length === 0) {
      throw new AppError(
        'Product has no HTTPS image URLs in snapshot — add images before listing.',
        400
      );
    }

    const active = await prisma.cjEbayListing.findFirst({
      where: {
        userId: input.userId,
        variantId: variantRow.id,
        status: CJ_EBAY_LISTING_STATUS.ACTIVE,
      },
    });
    if (active) {
      throw new AppError('An ACTIVE listing already exists for this variant.', 409);
    }

    const internalSku = buildInternalSku(input.userId, product.id, variantRow.id);
    const handlingTimeDays = computeHandlingTimeDays(
      settings.handlingBufferDays,
      quote.confidence || 'unknown'
    );

    const descriptionHtml = buildListingDescriptionHtml({
      productDescriptionPlain: product.description,
      handlingTimeDays,
      shippingMinDays: quote.estimatedMinDays,
      shippingMaxDays: quote.estimatedMaxDays,
      quoteConfidence: quote.confidence || 'unknown',
      shippingCostUsd: shipCost,
      shippingMethod: quote.serviceName || quote.carrier || null,
    });

    const title = product.title.slice(0, 80);
    const stock = variantRow.stockLastKnown ?? 0;
    const listQty = Math.max(1, Math.min(stock > 0 ? stock : 1, lineQty, 999));

    const categoryId = await cjEbayEbayFacadeService.suggestCategory(input.userId, product.title);

    const draftPayload = {
      version: 1 as const,
      supplier: 'cj' as const,
      sourceMarketplace: 'cjdropshipping' as const,
      mappingSource: 'cj_evaluate_listing_draft' as const,
      mappingConfidence: 'high' as const,
      cjProductId: product.cjProductId,
      cjVariantKey: vKey,
      cjVid: variantRow.cjVid ?? null,
      cjSku: variantRow.cjSku,
      title,
      descriptionHtml,
      imageUrls: images,
      categoryId,
      listPriceUsd: price,
      quantity: listQty,
      handlingTimeDays,
      shipping: {
        originCountryCode: CJ_LISTING_ORIGIN_COUNTRY,
        originLabel: CJ_LISTING_ORIGIN_LABEL,
        minDays: quote.estimatedMinDays,
        maxDays: quote.estimatedMaxDays,
        confidence: quote.confidence,
        costUsd: shipCost,
        method: quote.serviceName || quote.carrier,
        policyNote:
          'International shipment from China. Handling time is business days before dispatch; transit is separate and depends on carrier and customs.',
      },
      internalSku,
      breakdownSnapshot: pricingBreakdownForResponse(breakdown),
      evaluationId: evaluation.id,
      evaluatedAt: evaluation.evaluatedAt.toISOString(),
      quoteId: quote.id,
      quoteCreatedAt: quote.createdAt.toISOString(),
    };

    const existing = await prisma.cjEbayListing.findFirst({
      where: {
        userId: input.userId,
        variantId: variantRow.id,
        status: { in: [CJ_EBAY_LISTING_STATUS.DRAFT, CJ_EBAY_LISTING_STATUS.FAILED] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const row = existing
      ? await prisma.cjEbayListing.update({
          where: { id: existing.id },
          data: {
            status: CJ_EBAY_LISTING_STATUS.DRAFT,
            draftPayload: draftPayload as unknown as Prisma.InputJsonValue,
            listedPriceUsd: new Prisma.Decimal(price),
            quantity: listQty,
            evaluationId: evaluation.id,
            shippingQuoteId: quote.id,
            handlingTimeDays,
            ebaySku: internalSku,
            lastError: null,
          },
        })
      : await prisma.cjEbayListing.create({
          data: {
            userId: input.userId,
            productId: product.id,
            variantId: variantRow.id,
            status: CJ_EBAY_LISTING_STATUS.DRAFT,
            draftPayload: draftPayload as unknown as Prisma.InputJsonValue,
            listedPriceUsd: new Prisma.Decimal(price),
            quantity: listQty,
            evaluationId: evaluation.id,
            shippingQuoteId: quote.id,
            handlingTimeDays,
            ebaySku: internalSku,
          },
        });

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.LISTING_DRAFT_CREATED,
      message: 'listing.draft.created',
      meta: { listingId: row.id, sku: internalSku },
    });

    return {
      listing: row,
      breakdown: pricingBreakdownForResponse(breakdown),
      draftPayload,
      policyNote: draftPayload.shipping.policyNote,
    };
  },

  async publish(input: {
    userId: number;
    listingDbId: number;
    correlationId?: string;
    route?: string;
  }) {
    if (env.BLOCK_NEW_PUBLICATIONS) {
      throw new AppError(
        'BLOCK_NEW_PUBLICATIONS=true: new eBay publications are disabled server-side.',
        423
      );
    }

    const listing = await prisma.cjEbayListing.findFirst({
      where: { id: input.listingDbId, userId: input.userId },
      include: { product: true, variant: true },
    });
    if (!listing) {
      throw new AppError('Listing not found.', 404);
    }
    if (listing.status === CJ_EBAY_LISTING_STATUS.PUBLISHING) {
      throw new AppError('Listing publish already in progress.', 409);
    }
    if (
      listing.status !== CJ_EBAY_LISTING_STATUS.DRAFT &&
      listing.status !== CJ_EBAY_LISTING_STATUS.FAILED
    ) {
      throw new AppError(`Listing status ${listing.status} cannot be published.`, 400);
    }
    if (!listing.variant || !listing.product) {
      throw new AppError('Listing missing product/variant.', 400);
    }
    if (!listing.ebaySku) {
      throw new AppError('Listing missing internal SKU.', 400);
    }
    const draft = listing.draftPayload as Record<string, unknown> | null;
    if (!draft || typeof draft !== 'object') {
      throw new AppError('Listing has no draft payload — recreate draft.', 400);
    }

    if (!listing.evaluationId) {
      throw new AppError('Listing missing evaluation link — recreate draft.', 400);
    }
    const evaluation = await prisma.cjEbayProductEvaluation.findFirst({
      where: {
        userId: input.userId,
        id: listing.evaluationId,
        decision: 'APPROVED',
      },
      include: { shippingQuote: true },
    });
    if (!evaluation?.shippingQuote) {
      throw new AppError('Linked evaluation or shipping quote missing.', 400);
    }
    if (isEvalStale(evaluation.evaluatedAt) || isQuoteStale(evaluation.shippingQuote)) {
      throw new AppError('Evaluation or quote became stale — recreate draft.', 400);
    }

    const title = String(draft.title || listing.product.title).slice(0, 80);
    const descriptionHtml = String(draft.descriptionHtml || '');
    const imageUrls = Array.isArray(draft.imageUrls) ? (draft.imageUrls as string[]) : [];
    if (imageUrls.length === 0) {
      throw new AppError('Draft missing images.', 400);
    }
    const categoryId = String(draft.categoryId || '20698');
    const listPrice = Number(draft.listPriceUsd ?? listing.listedPriceUsd);
    const listQty = Number(draft.quantity ?? listing.quantity ?? 1);
    if (!Number.isFinite(listPrice) || listPrice <= 0 || !Number.isFinite(listQty) || listQty < 1) {
      throw new AppError('Invalid price or quantity on draft.', 400);
    }

    const ebayProduct: EbayProduct = {
      title,
      description: descriptionHtml,
      categoryId,
      startPrice: listPrice,
      quantity: Math.floor(listQty),
      condition: 'NEW',
      images: imageUrls.slice(0, 12),
    };

    await prisma.cjEbayListing.update({
      where: { id: listing.id },
      data: { status: CJ_EBAY_LISTING_STATUS.PUBLISHING, lastError: null },
    });

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.LISTING_PUBLISH_START,
      message: 'listing.publish.start',
      meta: { listingId: listing.id, sku: listing.ebaySku },
    });

    try {
      const pub = await cjEbayEbayFacadeService.publishInventoryFixedPrice(
        input.userId,
        listing.ebaySku,
        ebayProduct
      );
      await prisma.cjEbayListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_EBAY_LISTING_STATUS.ACTIVE,
          ebayListingId: pub.listingId,
          ebayOfferId: pub.offerId,
          listedPriceUsd: new Prisma.Decimal(listPrice),
          quantity: Math.floor(listQty),
          lastSyncedAt: new Date(),
          publishedAt: new Date(),
          lastError: null,
        },
      });
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.LISTING_PUBLISH_SUCCESS,
        message: 'listing.publish.success',
        meta: { listingId: listing.id, ebayListingId: pub.listingId },
      });
      return { listingId: pub.listingId, listingUrl: pub.listingUrl, offerId: pub.offerId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.cjEbayListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_EBAY_LISTING_STATUS.FAILED,
          lastError: msg.slice(0, 8000),
        },
      });
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.LISTING_PUBLISH_ERROR,
        message: 'listing.publish.error',
        meta: { listingId: listing.id, error: msg.slice(0, 500) },
      });
      throw e;
    }
  },

  async pause(input: { userId: number; listingDbId: number; correlationId?: string; route?: string }) {
    const listing = await prisma.cjEbayListing.findFirst({
      where: { id: input.listingDbId, userId: input.userId },
    });
    if (!listing) {
      throw new AppError('Listing not found.', 404);
    }
    if (listing.status === CJ_EBAY_LISTING_STATUS.PAUSED) {
      return { ok: true as const, already: true as const };
    }
    if (listing.status !== CJ_EBAY_LISTING_STATUS.ACTIVE) {
      throw new AppError('Only ACTIVE listings can be paused.', 400);
    }
    if (!listing.ebaySku) {
      throw new AppError('Listing missing SKU.', 400);
    }

    await cjEbayEbayFacadeService.pauseListing(input.userId, listing.ebaySku, listing.ebayOfferId);

    await prisma.cjEbayListing.update({
      where: { id: listing.id },
      data: { status: CJ_EBAY_LISTING_STATUS.PAUSED, lastSyncedAt: new Date() },
    });

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.LISTING_PAUSE,
      message: 'listing.pause',
      meta: { listingId: listing.id, sku: listing.ebaySku },
    });

    return { ok: true as const };
  },

  async listForUser(userId: number) {
    const rows = await prisma.cjEbayListing.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { product: true, variant: true },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      listedPriceUsd: r.listedPriceUsd != null ? Number(r.listedPriceUsd) : null,
      quantity: r.quantity,
      ebayListingId: r.ebayListingId,
      ebayOfferId: r.ebayOfferId,
      ebaySku: r.ebaySku,
      lastError: r.lastError,
      handlingTimeDays: r.handlingTimeDays,
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
      productTitle: r.product.title,
      cjProductId: r.product.cjProductId,
      variantCjSku: r.variant?.cjSku ?? null,
      variantCjVid: r.variant?.cjVid ?? null,
    }));
  },

  async getById(userId: number, listingDbId: number) {
    const r = await prisma.cjEbayListing.findFirst({
      where: { id: listingDbId, userId },
      include: { product: true, variant: true, evaluation: true, shippingQuote: true },
    });
    if (!r) return null;
    return {
      id: r.id,
      status: r.status,
      listedPriceUsd: r.listedPriceUsd != null ? Number(r.listedPriceUsd) : null,
      quantity: r.quantity,
      ebayListingId: r.ebayListingId,
      ebayOfferId: r.ebayOfferId,
      ebaySku: r.ebaySku,
      lastError: r.lastError,
      handlingTimeDays: r.handlingTimeDays,
      draftPayload: r.draftPayload,
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
      evaluationId: r.evaluationId,
      shippingQuoteId: r.shippingQuoteId,
      product: { id: r.product.id, title: r.product.title, cjProductId: r.product.cjProductId },
      variant: r.variant
        ? { id: r.variant.id, cjSku: r.variant.cjSku, cjVid: r.variant.cjVid }
        : null,
    };
  },
};
