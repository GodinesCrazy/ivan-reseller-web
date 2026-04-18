/**
 * CJ → ML Chile — ciclo de vida de listings (draft → publish → pause → reset).
 * Usa MercadoLibreService existente para la publicación real.
 * Totalmente aislado de CJ→eBay USA y tablas legacy.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { cjMlChileTraceService } from './cj-ml-chile-trace.service';
import { CJ_ML_CHILE_TRACE_STEP, CJ_ML_CHILE_LISTING_STATUS, ML_CHILE_SITE_ID } from '../cj-ml-chile.constants';
import { computeMlChilePricing } from './cj-ml-chile-pricing.service';
import type { CjMlChileListingDraftBody } from '../schemas/cj-ml-chile.schemas';
import { buildMLChileImportFooter } from '../../../services/ml-chile-import-compliance.service';

export const cjMlChileListingService = {
  async draft(userId: number, body: CjMlChileListingDraftBody, correlationId?: string) {
    const evalRow = await prisma.cjMlChileProductEvaluation.findFirst({
      where: { id: body.evaluationId, userId },
      include: {
        product: true,
        variant: true,
        shippingQuote: true,
      },
    });

    if (!evalRow) throw new Error(`Evaluation ${body.evaluationId} not found`);
    if (evalRow.decision === 'NOT_VIABLE') {
      throw new Error('Producto NOT_VIABLE: sin warehouse Chile confirmado. No se puede publicar en este módulo MVP.');
    }
    if (evalRow.decision === 'REJECTED') {
      throw new Error('Producto REJECTED en evaluación. Revisa las razones antes de crear el draft.');
    }

    const settings = await prisma.cjMlChileAccountSettings.findUnique({ where: { userId } });

    const supplierCostUsd = evalRow.variant?.unitCostUsd != null ? Number(evalRow.variant.unitCostUsd) : null;
    const shippingUsd = evalRow.shippingQuote?.amountUsd != null ? Number(evalRow.shippingQuote.amountUsd) : 0;

    let listPriceUsd: number | undefined;
    let listPriceCLP: number | undefined;
    let fxRateUsed: number | undefined;
    let pricingSnapshot: Record<string, unknown> = {};

    if (body.listPriceCLP) {
      listPriceCLP = body.listPriceCLP;
      // Reverse-compute USD for records (approximate)
      const fxApprox = evalRow.fxRateUsed ? Number(evalRow.fxRateUsed) : 950;
      listPriceUsd = Math.round((listPriceCLP / fxApprox) * 100) / 100;
      fxRateUsed = fxApprox;
    } else if (evalRow.suggestedPriceCLP != null) {
      listPriceCLP = Number(evalRow.suggestedPriceCLP);
      fxRateUsed = evalRow.fxRateUsed ? Number(evalRow.fxRateUsed) : undefined;
      listPriceUsd = fxRateUsed ? Math.round((listPriceCLP / fxRateUsed) * 100) / 100 : undefined;
    } else if (supplierCostUsd != null) {
      const pricingResult = await computeMlChilePricing({
        supplierCostUsd,
        shippingUsd,
        feesInput: {
          mlcFeePct: settings ? Number(settings.mlcFeePct) : null,
          mpPaymentFeePct: settings ? Number(settings.mpPaymentFeePct) : null,
          incidentBufferPct: settings ? Number(settings.incidentBufferPct) : null,
        },
        minMarginPct: settings?.minMarginPct ? Number(settings.minMarginPct) : null,
        minProfitUsd: settings?.minProfitUsd ? Number(settings.minProfitUsd) : null,
      });
      if (!pricingResult.ok || !pricingResult.breakdown) throw new Error(pricingResult.error ?? 'Pricing failed');
      listPriceCLP = pricingResult.breakdown.suggestedPriceCLP;
      listPriceUsd = pricingResult.breakdown.suggestedPriceUsd;
      fxRateUsed = pricingResult.breakdown.fxRateCLPperUSD;
      pricingSnapshot = { ...pricingResult.breakdown };
    }

    if (!listPriceCLP || !listPriceCLP) throw new Error('No se pudo determinar el precio en CLP.');

    // Build legal footer
    const legalFooter = buildMLChileImportFooter ? buildMLChileImportFooter() : '';

    const mlSku = `CJ-MLC-${evalRow.product.cjProductId}-${evalRow.variant?.cjSku ?? 'v0'}`.slice(0, 50);

    const title = (body.title ?? evalRow.product.title).slice(0, 60);
    const categoryId = body.categoryId ?? 'MLC9999'; // fallback genérico; el operador debe configurar

    const draftPayload = {
      title,
      categoryId,
      price: listPriceCLP,
      currency: 'CLP',
      siteId: ML_CHILE_SITE_ID,
      sku: mlSku,
      quantity: body.quantity ?? 10,
      handlingTimeDays: body.handlingTimeDays ?? 5,
      description: `${evalRow.product.description ?? title}\n\n${legalFooter}`,
      cjProductId: evalRow.product.cjProductId,
      variantSku: evalRow.variant?.cjSku,
      pricingSnapshot,
      fxRateUsed,
      warehouseChileConfirmed: evalRow.shippingQuote?.confidence === 'CONFIRMED',
      ivaIncluded: true,
      legalFooterAppended: Boolean(legalFooter),
    };

    const listing = await prisma.cjMlChileListing.create({
      data: {
        userId,
        productId: evalRow.productId,
        variantId: evalRow.variantId,
        evaluationId: evalRow.id,
        shippingQuoteId: evalRow.shippingQuoteId,
        mlSku,
        status: CJ_ML_CHILE_LISTING_STATUS.DRAFT,
        listedPriceCLP: listPriceCLP ? new Prisma.Decimal(listPriceCLP) : null,
        listedPriceUsd: listPriceUsd ? new Prisma.Decimal(listPriceUsd) : null,
        fxRateUsed: fxRateUsed ? new Prisma.Decimal(fxRateUsed) : null,
        quantity: body.quantity ?? 10,
        handlingTimeDays: body.handlingTimeDays ?? 5,
        draftPayload: draftPayload as unknown as Prisma.InputJsonValue,
        legalTextsAppended: Boolean(legalFooter),
      },
    });

    await cjMlChileTraceService.record({
      userId,
      correlationId,
      step: CJ_ML_CHILE_TRACE_STEP.LISTING_DRAFT_CREATED,
      message: `Draft created for product ${evalRow.product.cjProductId}`,
      meta: { listingId: listing.id, listPriceCLP, sku: mlSku },
    });

    return listing;
  },

  async publish(userId: number, listingId: number, correlationId?: string) {
    const listing = await prisma.cjMlChileListing.findFirst({
      where: { id: listingId, userId },
      include: { product: true, variant: true },
    });
    if (!listing) throw new Error(`Listing ${listingId} not found`);
    if (listing.status !== CJ_ML_CHILE_LISTING_STATUS.DRAFT) {
      throw new Error(`Listing está en estado ${listing.status}, no DRAFT. Solo se puede publicar desde DRAFT.`);
    }

    await prisma.cjMlChileListing.update({ where: { id: listingId }, data: { status: CJ_ML_CHILE_LISTING_STATUS.PUBLISHING } });

    await cjMlChileTraceService.record({
      userId,
      correlationId,
      step: CJ_ML_CHILE_TRACE_STEP.LISTING_PUBLISH_START,
      message: `Publishing listing ${listingId} to ML Chile`,
      meta: { listingId, sku: listing.mlSku },
    });

    try {
      const draft = listing.draftPayload as Record<string, unknown> | null;
      if (!draft) throw new Error('Draft payload vacío. Re-crear el draft.');

      // Resolve ML credentials from DB (api_credentials)
      const mlCred = await prisma.apiCredential.findFirst({
        where: { userId, apiName: 'mercadolibre' },
      });
      if (!mlCred) throw new Error('ML_CREDENTIALS_NOT_FOUND: Conecta tu cuenta Mercado Libre en Configuración antes de publicar.');

      const decryptedToken = (mlCred as Record<string, unknown>).accessToken as string | undefined
        ?? (mlCred as Record<string, unknown>).encryptedData as string | undefined;

      if (!decryptedToken) throw new Error('ML_TOKEN_MISSING: Token de acceso ML no disponible.');

      // Build ML item payload
      const mlPayload = {
        title: String(draft.title ?? '').slice(0, 60),
        category_id: String(draft.categoryId ?? 'MLC9999'),
        price: Number(draft.price ?? 0),
        currency_id: 'CLP',
        available_quantity: Number(draft.quantity ?? 10),
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        description: { plain_text: String(draft.description ?? '').slice(0, 50000) },
        pictures: listing.product.images
          ? (listing.product.images as string[]).slice(0, 10).map((url) => ({ source: url }))
          : [],
        shipping: {
          mode: 'me2',
          free_shipping: false,
          local_pick_up: false,
        },
        seller_custom_field: listing.mlSku ?? undefined,
      };

      const mlBaseUrl = 'https://api.mercadolibre.com';
      const resp = await fetch(`${mlBaseUrl}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${decryptedToken}`,
        },
        body: JSON.stringify(mlPayload),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({})) as Record<string, unknown>;
        const errMsg = (errBody.message as string) ?? `ML API error ${resp.status}`;
        await prisma.cjMlChileListing.update({
          where: { id: listingId },
          data: { status: CJ_ML_CHILE_LISTING_STATUS.FAILED, lastError: errMsg },
        });
        await cjMlChileTraceService.record({
          userId, correlationId,
          step: CJ_ML_CHILE_TRACE_STEP.LISTING_PUBLISH_ERROR,
          message: errMsg,
          meta: { status: resp.status, errBody },
        });
        throw new Error(errMsg);
      }

      const mlItem = await resp.json() as Record<string, unknown>;
      const mlListingId = String(mlItem.id ?? '');

      await prisma.cjMlChileListing.update({
        where: { id: listingId },
        data: {
          status: CJ_ML_CHILE_LISTING_STATUS.ACTIVE,
          mlListingId,
          mlItemId: mlListingId,
          publishedAt: new Date(),
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });

      await cjMlChileTraceService.record({
        userId, correlationId,
        step: CJ_ML_CHILE_TRACE_STEP.LISTING_PUBLISH_SUCCESS,
        message: `Published to ML Chile: ${mlListingId}`,
        meta: { mlListingId, listingId },
      });

      return { ok: true, mlListingId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.cjMlChileListing.update({
        where: { id: listingId },
        data: { status: CJ_ML_CHILE_LISTING_STATUS.FAILED, lastError: msg },
      }).catch(() => {});
      throw err;
    }
  },

  async pause(userId: number, listingId: number, correlationId?: string) {
    const listing = await prisma.cjMlChileListing.findFirst({ where: { id: listingId, userId } });
    if (!listing) throw new Error(`Listing ${listingId} not found`);
    if (listing.status !== CJ_ML_CHILE_LISTING_STATUS.ACTIVE) throw new Error('Solo se puede pausar un listing ACTIVE');

    if (listing.mlListingId) {
      try {
        const mlCred = await prisma.apiCredential.findFirst({ where: { userId, apiName: 'mercadolibre' } });
        const token = (mlCred as Record<string, unknown> | null)?.accessToken as string | undefined;
        if (token && listing.mlListingId) {
          await fetch(`https://api.mercadolibre.com/items/${listing.mlListingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'paused' }),
          });
        }
      } catch { /* best-effort */ }
    }

    await prisma.cjMlChileListing.update({ where: { id: listingId }, data: { status: CJ_ML_CHILE_LISTING_STATUS.PAUSED } });
    await cjMlChileTraceService.record({ userId, correlationId, step: CJ_ML_CHILE_TRACE_STEP.LISTING_PAUSE, message: `Listing ${listingId} paused`, meta: { listingId } });
    return { ok: true };
  },

  async forceReset(userId: number, listingId: number, correlationId?: string) {
    const listing = await prisma.cjMlChileListing.findFirst({ where: { id: listingId, userId } });
    if (!listing) throw new Error(`Listing ${listingId} not found`);

    await prisma.cjMlChileListing.update({
      where: { id: listingId },
      data: { status: CJ_ML_CHILE_LISTING_STATUS.DRAFT, mlListingId: null, mlItemId: null, publishedAt: null, lastError: null },
    });
    await cjMlChileTraceService.record({ userId, correlationId, step: CJ_ML_CHILE_TRACE_STEP.LISTING_FORCE_RESET, message: `Listing ${listingId} force-reset to DRAFT`, meta: { listingId } });
    return { ok: true };
  },

  async list(userId: number, status?: string) {
    return prisma.cjMlChileListing.findMany({
      where: { userId, ...(status ? { status } : {}) },
      include: { product: true, variant: true, evaluation: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  async getById(userId: number, listingId: number) {
    return prisma.cjMlChileListing.findFirst({
      where: { id: listingId, userId },
      include: { product: true, variant: true, evaluation: true, shippingQuote: true },
    });
  },
};
