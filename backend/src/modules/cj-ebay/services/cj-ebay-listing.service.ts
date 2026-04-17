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
  resolveListingOrigin,
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
  let urls: string[] = [];
  if (Array.isArray(raw)) {
    urls = raw.filter((x) => typeof x === 'string' && /^https?:\/\//i.test(x));
  } else if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) {
        urls = j.filter((x) => typeof x === 'string' && /^https?:\/\//i.test(x));
      }
    } catch {
      /* ignore */
    }
  }
  // Deduplicate (CJ sometimes returns the same URL multiple times)
  return [...new Set(urls)].slice(0, 12);
}

/**
 * Clean a raw CJ product title for eBay:
 * - Collapse whitespace / tabs / newlines
 * - Replace pipe/slash/backslash characters with a space (common CJ catalog noise)
 * - Strip leading/trailing punctuation noise
 * - Truncate to eBay 80-char title limit
 */
function sanitizeCjTitle(raw: string): string {
  return raw
    .replace(/[\t\r\n]+/g, ' ')   // newlines → space
    .replace(/[|\\]+/g, ' ')       // pipes/backslashes → space
    .replace(/ {2,}/g, ' ')        // collapse multiple spaces
    .replace(/^[\s\-–—,;:.]+/, '') // strip leading noise chars
    .replace(/[\s\-–—,;:.]+$/, '') // strip trailing noise chars
    .trim()
    .slice(0, 80);
}

/**
 * Build eBay item aspects (item specifics) from CJ variant attributes.
 * Always includes Brand=Generic.
 * If variant attributes are available, maps them directly (e.g. Color, Size, Material).
 * Limits each aspect value to 65 chars (eBay limit).
 */
function buildAspectsFromVariant(variantAttributes: unknown): Record<string, string[]> {
  const base: Record<string, string[]> = { Brand: ['Generic'] };
  if (!variantAttributes || typeof variantAttributes !== 'object') {
    return { ...base, Type: ['Product'] };
  }
  const attrs = variantAttributes as Record<string, unknown>;
  for (const [k, v] of Object.entries(attrs)) {
    const key = String(k || '').trim();
    const val = String(v ?? '').trim().slice(0, 65);
    if (key && val) {
      base[key] = [val];
    }
  }
  return base;
}

/**
 * Non-blocking quality warnings for the draft listing.
 * Returns an array of actionable messages the operator should review.
 * None of these block draft creation.
 */
export interface DraftQualityWarning {
  code: string;
  message: string;
}

function buildDraftQualityWarnings(params: {
  rawTitle: string;
  cleanTitle: string;
  imageCount: number;
  hasVariantAttributes: boolean;
  descriptionBodyLength: number;
}): DraftQualityWarning[] {
  const warnings: DraftQualityWarning[] = [];

  if (params.cleanTitle.length < 20) {
    warnings.push({
      code: 'TITLE_TOO_SHORT',
      message: `Title is very short (${params.cleanTitle.length} chars). eBay best practice is 30+ characters for better search visibility.`,
    });
  }
  if (params.rawTitle !== params.cleanTitle) {
    warnings.push({
      code: 'TITLE_SANITIZED',
      message: 'Title was cleaned (pipes/extra spaces removed). Review the cleaned title in the draft payload.',
    });
  }
  if (params.imageCount === 1) {
    warnings.push({
      code: 'SINGLE_IMAGE',
      message: 'Only 1 image available. eBay listings with 3+ images convert significantly better.',
    });
  }
  if (!params.hasVariantAttributes) {
    warnings.push({
      code: 'NO_VARIANT_ATTRIBUTES',
      message: 'No variant attributes available for item specifics. eBay will receive Brand=Generic/Type=Product only. Add item specifics in Seller Hub after publish if possible.',
    });
  }
  if (params.descriptionBodyLength < 20) {
    warnings.push({
      code: 'DESCRIPTION_BODY_EMPTY',
      message: 'Product description from CJ is empty or very short. Listing will use a placeholder body. Consider enriching the description after publish.',
    });
  }

  return warnings;
}

function buildInternalSku(userId: number, productRowId: number, variantRowId: number): string {
  return `CJE${userId}P${productRowId}V${variantRowId}`.slice(0, 50);
}

/**
 * Detecta si un error de eBay corresponde a un bloqueo de cuenta/política (no a contenido del listing).
 * Señales: error 25019, Overseas Warehouse Block Policy, Location_Mismatch_Inventory_Block,
 * forward-deployed item, ship-from China not authorized.
 * Cuando esto ocurre el publish no se puede resolver corrigiendo título/descripción.
 * Requiere aprobación eBay Global Seller / overseas warehouse para la cuenta.
 */
function isEbayOverseasWarehouseBlock(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as Record<string, unknown>;
  const ebayErrors: unknown[] = Array.isArray((err as any)?.response?.data?.errors)
    ? (err as any).response.data.errors
    : [];

  // Error 25019 es el código canónico para Overseas Warehouse Block Policy
  if (ebayErrors.some((x: any) => x?.errorId === 25019 || String(x?.errorId ?? '') === '25019')) {
    return true;
  }

  // Construir texto completo para buscar patrones
  const allText = [
    String((err as any)?.message ?? ''),
    ...ebayErrors.map((x: any) =>
      [x?.message, x?.longMessage, x?.domain, x?.category, x?.subdomain]
        .map((v) => String(v ?? ''))
        .join(' ')
    ),
    // Incluir el JSON crudo del cuerpo de error (truncado) para capturar parámetros en el payload
    JSON.stringify((err as any)?.response?.data ?? {}).slice(0, 3000),
  ].join(' ');

  const OVERSEAS_SIGNALS = [
    '25019',
    'Overseas Warehouse Block',
    'Location_Mismatch_Inventory_Block',
    'forward-deployed item',
    'overseas.*warehouse',
    'ship.from.china.not.authorized',
    'overseas.*block.*polic',
  ];

  return OVERSEAS_SIGNALS.some((sig) => {
    try {
      return new RegExp(sig, 'i').test(allText);
    } catch {
      return allText.toLowerCase().includes(sig.toLowerCase());
    }
  });
}

/**
 * Mensaje canónico para el operador cuando el publish falla por policy de cuenta eBay.
 * El draft se conserva. No reintentar hasta aprobación eBay.
 */
const ACCOUNT_POLICY_BLOCK_MESSAGE =
  'ACCOUNT_POLICY_BLOCK — eBay bloqueó este publish con error 25019 ' +
  '(Overseas Warehouse Block Policy / Location_Mismatch_Inventory_Block). ' +
  'La cuenta eBay no está autorizada para publicar con ship-from China ' +
  '(almacén en el extranjero / forward-deployed / CJ Dropshipping). ' +
  'Este NO es un error de título, descripción ni precio. ' +
  'El draft se conserva íntegro. ' +
  'No reintentar hasta que eBay aprueba el perfil de Global Seller / overseas warehouse para esta cuenta.';

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

    // WAREHOUSE-AWARE: use the origin stored in the shipping quote (populated by evaluation).
    // Falls back to CN for pre-feature quotes (originCountryCode = null).
    const quoteOrigin = (quote as Record<string, unknown>).originCountryCode as string | null | undefined;
    const resolvedOrigin = resolveListingOrigin(quoteOrigin);

    const descriptionHtml = buildListingDescriptionHtml({
      productDescriptionPlain: product.description,
      handlingTimeDays,
      shippingMinDays: quote.estimatedMinDays,
      shippingMaxDays: quote.estimatedMaxDays,
      quoteConfidence: quote.confidence || 'unknown',
      shippingMethod: quote.serviceName || quote.carrier || null,
      originCountryCode: quoteOrigin,
    });

    const rawTitle = product.title;
    const title = sanitizeCjTitle(rawTitle);
    const stock = variantRow.stockLastKnown ?? 0;
    const listQty = Math.max(1, Math.min(stock > 0 ? stock : 1, lineQty, 999));

    const aspects = buildAspectsFromVariant(variantRow.attributes);
    const hasVariantAttributes = Object.keys(aspects).length > 1; // beyond Brand alone

    const categoryId = await cjEbayEbayFacadeService.suggestCategory(input.userId, title);

    const qualityWarnings = buildDraftQualityWarnings({
      rawTitle,
      cleanTitle: title,
      imageCount: images.length,
      hasVariantAttributes,
      descriptionBodyLength: (product.description || '').trim().length,
    });

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
      aspects,
      categoryId,
      listPriceUsd: price,
      quantity: listQty,
      handlingTimeDays,
      shipping: {
        originCountryCode: resolvedOrigin.country,
        originLabel: resolvedOrigin.label,
        minDays: quote.estimatedMinDays,
        maxDays: quote.estimatedMaxDays,
        confidence: quote.confidence,
        method: quote.serviceName || quote.carrier,
        policyNote:
          resolvedOrigin.country === 'US'
            ? 'Ships from CJ US Warehouse (confirmed by freight API). Handling time is business days before dispatch; transit is domestic USA.'
            : 'International shipment from China. Handling time is business days before dispatch; transit is separate and depends on carrier and customs.',
      },
      internalSku,
      breakdownSnapshot: pricingBreakdownForResponse(breakdown),
      evaluationId: evaluation.id,
      evaluatedAt: evaluation.evaluatedAt.toISOString(),
      quoteId: quote.id,
      quoteCreatedAt: quote.createdAt.toISOString(),
      qualityWarnings,
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
      qualityWarnings,
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
    // Guardrail: bloqueo de cuenta/política eBay persistente. No reintentar hasta intervención manual.
    if (listing.status === CJ_EBAY_LISTING_STATUS.ACCOUNT_POLICY_BLOCK) {
      throw new AppError(
        'Publish bloqueado: la cuenta eBay no está autorizada para overseas warehouse / ship-from China (ACCOUNT_POLICY_BLOCK). ' +
          'El draft se conserva. No reintentar hasta que eBay apruebe el perfil de Global Seller / overseas warehouse. ' +
          'Para desbloquear manualmente, contactar soporte eBay y luego cambiar el estado del listing desde la interfaz de administración.',
        423
      );
    }
    // OFFER_ALREADY_EXISTS: operator must use Reconcile, not Publish again.
    if (listing.status === CJ_EBAY_LISTING_STATUS.OFFER_ALREADY_EXISTS) {
      throw new AppError(
        'OFFER_ALREADY_EXISTS — la oferta ya existe en eBay. ' +
          'Usa el botón Reconciliar para recuperar el listingId real. ' +
          'No reintentar Publicar — crearía un duplicado.',
        409
      );
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

    // Recover aspects saved in draft payload (built from variant attributes at draft creation time)
    const draftAspects =
      draft.aspects &&
      typeof draft.aspects === 'object' &&
      !Array.isArray(draft.aspects)
        ? (draft.aspects as Record<string, string[]>)
        : undefined;

    const ebayProduct: EbayProduct = {
      title,
      description: descriptionHtml,
      categoryId,
      startPrice: listPrice,
      quantity: Math.floor(listQty),
      condition: 'NEW',
      images: imageUrls.slice(0, 12),
      ...(draftAspects ? { aspects: draftAspects } : {}),
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
      // Clasificar el error: policy/cuenta vs. offer-already-exists vs. error genérico
      if (isEbayOverseasWarehouseBlock(e)) {
        await prisma.cjEbayListing.update({
          where: { id: listing.id },
          data: {
            status: CJ_EBAY_LISTING_STATUS.ACCOUNT_POLICY_BLOCK,
            lastError: ACCOUNT_POLICY_BLOCK_MESSAGE,
          },
        });
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.LISTING_PUBLISH_ACCOUNT_POLICY_BLOCK,
          message: 'listing.publish.account_policy_block',
          meta: {
            listingId: listing.id,
            sku: listing.ebaySku,
            rawError: (e instanceof Error ? e.message : String(e)).slice(0, 500),
          },
        });
        throw new AppError(ACCOUNT_POLICY_BLOCK_MESSAGE, 423);
      }

      // eBay 25002: offer ya existe pero listingId no pudo recuperarse en el momento.
      // El offer SÍ existe en eBay. Guardar offerId y estado OFFER_ALREADY_EXISTS para reconcile.
      if ((e as any)?.ebayOfferAlreadyExists === true) {
        const resolvedOfferId = String((e as any).resolvedOfferId || '').trim() || null;
        const offerMsg =
          'OFFER_ALREADY_EXISTS — eBay error 25002: la oferta ya existe en eBay pero el listingId ' +
          'no pudo recuperarse de inmediato. El offer SÍ existe. ' +
          `offerId: ${resolvedOfferId ?? 'desconocido'}. ` +
          'Usa el botón Reconciliar en unos minutos para que el sistema recupere el listingId real.';
        await prisma.cjEbayListing.update({
          where: { id: listing.id },
          data: {
            status: CJ_EBAY_LISTING_STATUS.OFFER_ALREADY_EXISTS,
            ebayOfferId: resolvedOfferId ?? listing.ebayOfferId,
            lastError: offerMsg,
          },
        });
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.LISTING_PUBLISH_OFFER_ALREADY_EXISTS,
          message: 'listing.publish.offer_already_exists',
          meta: { listingId: listing.id, sku: listing.ebaySku, offerId: resolvedOfferId },
        });
        throw new AppError(offerMsg, 409);
      }

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

  /**
   * Reconcile a listing in OFFER_ALREADY_EXISTS state.
   * Queries eBay getOffers by SKU to recover the real listingId.
   * If found → status ACTIVE. If not found yet → status RECONCILE_PENDING with retryAfter.
   * Strategy: 1) GET by offerId (direct), 2) POST publish offer, 3) GET by SKU, 4) RECONCILE_PENDING.
   */
  async reconcile(input: { userId: number; listingDbId: number; correlationId?: string; route?: string }) {
    const listing = await prisma.cjEbayListing.findFirst({
      where: { id: input.listingDbId, userId: input.userId },
    });
    if (!listing) throw new AppError('Listing not found.', 404);

    const reconcilableStatuses = [
      CJ_EBAY_LISTING_STATUS.OFFER_ALREADY_EXISTS,
      CJ_EBAY_LISTING_STATUS.RECONCILE_PENDING,
    ] as string[];
    if (!reconcilableStatuses.includes(listing.status)) {
      throw new AppError(
        `Reconcile only applies to OFFER_ALREADY_EXISTS / RECONCILE_PENDING listings (current: ${listing.status}).`,
        400
      );
    }

    const newAttempts = (listing.reconcileAttempts ?? 0) + 1;

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.LISTING_RECONCILE_START,
      message: 'listing.reconcile.start',
      meta: {
        listingId: listing.id,
        sku: listing.ebaySku,
        offerId: listing.ebayOfferId,
        attempt: newAttempts,
      },
    });

    const markActive = async (resolvedListingId: string, resolvedOfferId: string | null, via: string) => {
      await prisma.cjEbayListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_EBAY_LISTING_STATUS.ACTIVE,
          ebayListingId: resolvedListingId,
          ebayOfferId: resolvedOfferId ?? listing.ebayOfferId,
          lastSyncedAt: new Date(),
          publishedAt: listing.publishedAt ?? new Date(),
          lastError: null,
          reconcileAttempts: newAttempts,
          reconcileRetryAfter: null,
        },
      });
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.LISTING_RECONCILE_SUCCESS,
        message: 'listing.reconcile.success',
        meta: { listingId: listing.id, ebayListingId: resolvedListingId, offerId: resolvedOfferId, via },
      });
      return {
        reconciled: true as const,
        ebayListingId: resolvedListingId,
        listingUrl: `https://www.ebay.com/itm/${resolvedListingId}`,
        offerId: resolvedOfferId,
        via,
      };
    };

    // ── STEP 1: Direct lookup by offerId (most reliable) ────────────────────
    if (listing.ebayOfferId) {
      try {
        const snap = await cjEbayEbayFacadeService.getOfferSnapshotByOfferId(
          input.userId,
          listing.ebayOfferId
        );
        if (snap.listingId) {
          return await markActive(snap.listingId, snap.offerId, 'GET_BY_OFFER_ID');
        }

        // ── STEP 2: Offer exists but no listingId → try to publish it ────────
        try {
          const pub = await cjEbayEbayFacadeService.publishExistingOffer(
            input.userId,
            listing.ebayOfferId
          );
          if (pub.listingId) {
            return await markActive(pub.listingId, listing.ebayOfferId, 'PUBLISH_EXISTING_OFFER');
          }
        } catch (publishErr: unknown) {
          // ── ACCOUNT_POLICY_BLOCK: eBay 25019 / Overseas Warehouse Block — no retry ──
          if (isEbayOverseasWarehouseBlock(publishErr)) {
            await prisma.cjEbayListing.update({
              where: { id: listing.id },
              data: {
                status: CJ_EBAY_LISTING_STATUS.ACCOUNT_POLICY_BLOCK,
                reconcileAttempts: newAttempts,
                reconcileRetryAfter: null,
                lastError: ACCOUNT_POLICY_BLOCK_MESSAGE,
              },
            });
            await cjEbayTraceService.record({
              userId: input.userId,
              correlationId: input.correlationId,
              route: input.route,
              step: CJ_EBAY_TRACE_STEP.LISTING_PUBLISH_ACCOUNT_POLICY_BLOCK,
              message: 'listing.reconcile.account_policy_block',
              meta: { listingId: listing.id, offerId: listing.ebayOfferId, attempt: newAttempts },
            });
            return {
              reconciled: false as const,
              status: CJ_EBAY_LISTING_STATUS.ACCOUNT_POLICY_BLOCK,
              reason: ACCOUNT_POLICY_BLOCK_MESSAGE,
              offerId: listing.ebayOfferId,
            } as any;
          }

          const publishMsg = publishErr instanceof Error ? publishErr.message : String(publishErr);
          const isAlreadyPublished = /already published|already exist|25002/i.test(publishMsg);
          if (isAlreadyPublished) {
            // Offer is published but listingId still not visible — retry GET
            try {
              const retry = await cjEbayEbayFacadeService.getOfferSnapshotByOfferId(
                input.userId,
                listing.ebayOfferId
              );
              if (retry.listingId) {
                return await markActive(retry.listingId, retry.offerId, 'GET_AFTER_PUBLISH_CONFLICT');
              }
            } catch {
              /* fall through */
            }
          }
        }
      } catch {
        /* offerId lookup failed — fall through to SKU */
      }
    }

    // ── STEP 3: Fallback — lookup by SKU ────────────────────────────────────
    if (listing.ebaySku) {
      try {
        const skuSnap = await cjEbayEbayFacadeService.getOfferSnapshotBySku(
          input.userId,
          listing.ebaySku
        );
        if (skuSnap.listingId) {
          return await markActive(skuSnap.listingId, skuSnap.offerId, 'GET_BY_SKU');
        }
      } catch {
        /* fall through to RECONCILE_PENDING */
      }
    }

    // ── STEP 4: All strategies exhausted → RECONCILE_PENDING ────────────────
    const retryAfter = new Date(Date.now() + 5 * 60 * 1000); // retry in 5 minutes
    await prisma.cjEbayListing.update({
      where: { id: listing.id },
      data: {
        status: CJ_EBAY_LISTING_STATUS.RECONCILE_PENDING,
        reconcileAttempts: newAttempts,
        reconcileRetryAfter: retryAfter,
        lastError:
          `Reconcile intento #${newAttempts}: eBay confirmó offer (offerId: ${listing.ebayOfferId ?? 'N/A'}) ` +
          `pero listingId aún no disponible. Próximo intento sugerido: ${retryAfter.toISOString()}.`,
      },
    });
    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.LISTING_RECONCILE_PENDING,
      message: 'listing.reconcile.pending',
      meta: {
        listingId: listing.id,
        sku: listing.ebaySku,
        offerId: listing.ebayOfferId,
        attempt: newAttempts,
        retryAfter: retryAfter.toISOString(),
      },
    });
    return {
      reconciled: false as const,
      status: CJ_EBAY_LISTING_STATUS.RECONCILE_PENDING,
      reason:
        `eBay confirmó la oferta (offerId: ${listing.ebayOfferId ?? listing.ebaySku}) pero el listingId ` +
        `aún no está disponible (intento #${newAttempts}). ` +
        `Intenta nuevamente después de las ${retryAfter.toLocaleTimeString('es-CL')}.`,
      retryAfter: retryAfter.toISOString(),
      attempts: newAttempts,
      offerId: listing.ebayOfferId,
    };
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
      reconcileAttempts: r.reconcileAttempts,
      reconcileRetryAfter: r.reconcileRetryAfter,
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
      reconcileAttempts: r.reconcileAttempts,
      reconcileRetryAfter: r.reconcileRetryAfter,
      evaluationId: r.evaluationId,
      shippingQuoteId: r.shippingQuoteId,
      product: { id: r.product.id, title: r.product.title, cjProductId: r.product.cjProductId },
      variant: r.variant
        ? { id: r.variant.id, cjSku: r.variant.cjSku, cjVid: r.variant.cjVid }
        : null,
    };
  },
};
