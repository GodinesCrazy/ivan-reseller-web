/**
 * CJ → ML Chile — calificación + evaluate (MVP).
 *
 * REGLA DE ORO: solo productos con warehouse Chile confirmado por freightCalculate CL -> CL.
 * Probing: se llama a CJ freightCalculate con startCountryCode=CL y endCountryCode=CL.
 * Si CJ no devuelve quote CL → NOT_VIABLE (no REJECTED, es out-of-scope MVP).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { createCjMlChileSupplierAdapter } from '../adapters/cj-ml-chile-supplier.adapter';
import { cjMlChileTraceService } from './cj-ml-chile-trace.service';
import { cjMlChileConfigService } from './cj-ml-chile-config.service';
import { computeMlChilePricing, pricingBreakdownForResponse } from './cj-ml-chile-pricing.service';
import { CJ_ML_CHILE_TRACE_STEP, CJ_ML_CHILE_EVAL_DECISION } from '../cj-ml-chile.constants';
import type { CjProductDetail, CjVariantDetail } from '../../cj-ebay/adapters/cj-supplier.adapter.interface';
import { CjSupplierError } from '../../cj-ebay/adapters/cj-supplier.errors';
import { quoteShippingToChileLocalWarehouse } from './cj-ml-chile-local-stock.service';

export interface CjMlChileEvaluateInput {
  userId: number;
  productId: string;
  variantId: string;
  quantity: number;
  correlationId?: string;
  route?: string;
}

export type MlChileQualificationReason = {
  rule: string;
  code: string;
  message: string;
  severity: 'info' | 'warn' | 'block';
};

function pickVariant(detail: CjProductDetail, variantId: string): CjVariantDetail | null {
  const v = String(variantId || '').trim();
  return (
    detail.variants.find((x) => String(x.cjVid || '').trim() === v) ||
    detail.variants.find((x) => x.cjSku === v) ||
    null
  );
}

async function persistProductSnapshot(userId: number, detail: CjProductDetail) {
  const p = await prisma.cjMlChileProduct.upsert({
    where: { userId_cjProductId: { userId, cjProductId: detail.cjProductId } },
    create: {
      userId,
      cjProductId: detail.cjProductId,
      title: detail.title.slice(0, 2000),
      description: detail.description ?? null,
      images: detail.imageUrls?.length ? (detail.imageUrls as unknown as Prisma.InputJsonValue) : undefined,
      lastSyncedAt: new Date(),
    },
    update: {
      title: detail.title.slice(0, 2000),
      description: detail.description ?? null,
      images: detail.imageUrls?.length ? (detail.imageUrls as unknown as Prisma.InputJsonValue) : undefined,
      lastSyncedAt: new Date(),
    },
  });

  for (const v of detail.variants) {
    const sku = v.cjSku.slice(0, 500);
    await prisma.cjMlChileProductVariant.upsert({
      where: { productId_cjSku: { productId: p.id, cjSku: sku } },
      create: {
        productId: p.id,
        cjSku: sku,
        cjVid: v.cjVid ? v.cjVid.slice(0, 200) : null,
        unitCostUsd: v.unitCostUsd != null && Number.isFinite(v.unitCostUsd) ? new Prisma.Decimal(v.unitCostUsd) : null,
        stockLastKnown: Number.isFinite(v.stock) ? Math.floor(v.stock) : 0,
        stockCheckedAt: new Date(),
        attributes: v.attributes as Prisma.InputJsonValue,
      },
      update: {
        cjVid: v.cjVid ? v.cjVid.slice(0, 200) : null,
        unitCostUsd: v.unitCostUsd != null && Number.isFinite(v.unitCostUsd) ? new Prisma.Decimal(v.unitCostUsd) : null,
        stockLastKnown: Number.isFinite(v.stock) ? Math.floor(v.stock) : 0,
        stockCheckedAt: new Date(),
        attributes: v.attributes as Prisma.InputJsonValue,
      },
    });
  }

  return prisma.cjMlChileProduct.findUniqueOrThrow({
    where: { id: p.id },
    include: { variants: true },
  });
}

function decideQualification(params: {
  settings: {
    minStock: number;
    minMarginPct: number | null;
    minProfitUsd: number | null;
    maxShippingUsd: number | null;
    rejectOnUnknownShipping: boolean;
    requireChileWarehouse: boolean;
  };
  unitCostUsd: number | null;
  stockLive: number;
  shippingCost: number;
  shippingEstimatedDays: number | null;
  warehouseChileConfirmed: boolean;
  netProfitUsd: number;
  netMarginPct: number | null;
}): { decision: typeof CJ_ML_CHILE_EVAL_DECISION[keyof typeof CJ_ML_CHILE_EVAL_DECISION]; reasons: MlChileQualificationReason[] } {
  const reasons: MlChileQualificationReason[] = [];

  // REGLA DE ORO MVP: warehouse Chile
  if (params.settings.requireChileWarehouse && !params.warehouseChileConfirmed) {
    reasons.push({
      rule: 'MVP-CL',
      code: 'WAREHOUSE_CHILE_NOT_CONFIRMED',
      message: 'CJ no devolvió freight quote con startCountryCode=CL. Producto fuera del alcance MVP (solo warehouse Chile).',
      severity: 'block',
    });
    return { decision: CJ_ML_CHILE_EVAL_DECISION.NOT_VIABLE, reasons };
  }

  if (params.stockLive < params.settings.minStock) {
    reasons.push({ rule: 'P2', code: 'STOCK_BELOW_MIN', message: `Stock ${params.stockLive} < minStock ${params.settings.minStock}`, severity: 'block' });
  }
  if (params.unitCostUsd == null || params.unitCostUsd <= 0 || !Number.isFinite(params.unitCostUsd)) {
    reasons.push({ rule: 'P2', code: 'SUPPLIER_COST_UNKNOWN', message: 'Costo unitario CJ no disponible.', severity: 'block' });
  }
  if (params.settings.maxShippingUsd != null && Number.isFinite(params.settings.maxShippingUsd) && params.shippingCost > params.settings.maxShippingUsd) {
    reasons.push({ rule: 'P2', code: 'SHIPPING_EXCEEDS_CAP', message: `Shipping ${params.shippingCost} > maxShippingUsd ${params.settings.maxShippingUsd}`, severity: 'block' });
  }
  if (params.shippingEstimatedDays == null && params.settings.rejectOnUnknownShipping) {
    reasons.push({ rule: 'P2', code: 'SHIPPING_TIME_UNKNOWN', message: 'Sin ETA de envío y rejectOnUnknownShipping=true.', severity: 'block' });
  }

  const blocks = reasons.filter((r) => r.severity === 'block');
  if (blocks.length > 0) return { decision: CJ_ML_CHILE_EVAL_DECISION.REJECTED, reasons };

  const minM = params.settings.minMarginPct;
  const minP = params.settings.minProfitUsd;
  if (minM == null || minP == null) {
    reasons.push({ rule: 'P3', code: 'THRESHOLDS_INCOMPLETE', message: 'minMarginPct y/o minProfitUsd no configurados.', severity: 'info' });
    return { decision: CJ_ML_CHILE_EVAL_DECISION.PENDING, reasons };
  }

  if (params.netMarginPct == null || !Number.isFinite(params.netMarginPct) || params.netMarginPct < minM) {
    reasons.push({ rule: 'P3', code: 'NET_MARGIN_BELOW_MIN', message: `netMarginPct ${params.netMarginPct ?? 'n/a'} < minMarginPct ${minM}`, severity: 'block' });
  }
  if (!Number.isFinite(params.netProfitUsd) || params.netProfitUsd < minP) {
    reasons.push({ rule: 'P3', code: 'NET_PROFIT_BELOW_MIN', message: `netProfitUsd ${params.netProfitUsd} < minProfitUsd ${minP}`, severity: 'block' });
  }

  const hard = reasons.filter((r) => r.severity === 'block');
  if (hard.length > 0) return { decision: CJ_ML_CHILE_EVAL_DECISION.REJECTED, reasons };

  reasons.push({ rule: 'P1', code: 'ALL_CHECKS_PASSED', message: 'Stock, warehouse Chile, costo, envío y margen OK.', severity: 'info' });
  return { decision: CJ_ML_CHILE_EVAL_DECISION.APPROVED, reasons };
}

export const cjMlChileQualificationService = {
  async preview(input: CjMlChileEvaluateInput) {
    const adapter = createCjMlChileSupplierAdapter(input.userId);
    const settings = await cjMlChileConfigService.getOrCreate(input.userId);

    await cjMlChileTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_ML_CHILE_TRACE_STEP.PRICING_PREVIEW,
      message: 'pricing.preview start',
      meta: { productId: input.productId, variantId: input.variantId },
    });

    const detail = await adapter.getProductById(input.productId);
    const variant = pickVariant(detail, input.variantId);
    if (!variant) throw new Error(`Variant not found: ${input.variantId}`);

    const stockMap = await adapter.getStockForSkus([input.variantId]);
    const fromApi = stockMap.get(input.variantId);
    const stockLive = fromApi !== undefined && Number.isFinite(fromApi) ? fromApi : Math.floor(variant.stock);

    // Probe Chile-local stock with CL -> CL freightCalculate.
    let chileFreight: Awaited<ReturnType<typeof quoteShippingToChileLocalWarehouse>> | null = null;
    let warehouseChileConfirmed = false;

    try {
      await cjMlChileTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_ML_CHILE_TRACE_STEP.CJ_FREIGHT_REQUEST,
        message: 'Probing CJ freight for Chile with startCountryCode=CL and endCountryCode=CL',
        meta: { productId: input.productId, variantId: input.variantId },
      });

      chileFreight = await quoteShippingToChileLocalWarehouse(adapter, {
        variantId: input.variantId,
        productId: input.productId,
        quantity: input.quantity,
      });
      warehouseChileConfirmed = true;

      await cjMlChileTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_ML_CHILE_TRACE_STEP.WAREHOUSE_CHILE_CONFIRMED,
        message: 'Warehouse Chile confirmado por freightCalculate CL->CL',
        meta: { startCountryCode: chileFreight.quote.startCountryCode, cost: chileFreight.quote.cost },
      });
    } catch (e) {
      await cjMlChileTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_ML_CHILE_TRACE_STEP.CJ_FREIGHT_ERROR,
        message: e instanceof Error ? e.message : String(e),
        meta: {
          stage: 'chile-freight-probe',
          errorCode: e instanceof CjSupplierError ? e.code : 'UNKNOWN',
        },
      });
      warehouseChileConfirmed = false;
    }

    const shippingCost = chileFreight?.quote.cost ?? 0;

    const unitCost = variant.unitCostUsd;
    const supplierLineCost = unitCost != null && Number.isFinite(unitCost) ? unitCost * input.quantity : NaN;

    const pricingResult = Number.isFinite(supplierLineCost)
      ? await computeMlChilePricing({
          supplierCostUsd: supplierLineCost,
          shippingUsd: shippingCost,
          feesInput: {
            mlcFeePct: Number(settings.mlcFeePct),
            mpPaymentFeePct: Number(settings.mpPaymentFeePct),
            incidentBufferPct: Number(settings.incidentBufferPct),
          },
          minMarginPct: settings.minMarginPct != null ? Number(settings.minMarginPct) : null,
          minProfitUsd: settings.minProfitUsd != null ? Number(settings.minProfitUsd) : null,
        })
      : { ok: false as const, error: 'NO_UNIT_COST' };

    await cjMlChileTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_ML_CHILE_TRACE_STEP.PRICING_PREVIEW,
      message: 'pricing.preview complete',
      meta: {
        ok: pricingResult.ok,
        warehouseChileConfirmed,
        suggestedPriceCLP: pricingResult.ok ? pricingResult.breakdown?.suggestedPriceCLP : null,
        netMarginPct: pricingResult.ok ? pricingResult.breakdown?.netMarginPct : null,
      },
    });

    return {
      product: { cjProductId: detail.cjProductId, title: detail.title },
      variant: { cjSku: variant.cjSku, cjVid: variant.cjVid, stockLive, unitCostUsd: unitCost ?? null },
      shipping: chileFreight
        ? { cost: chileFreight.quote.cost, method: chileFreight.quote.method, estimatedDays: chileFreight.quote.estimatedDays, startCountryCode: chileFreight.quote.startCountryCode }
        : null,
      warehouseChileConfirmed,
      pricing: pricingResult.ok && pricingResult.breakdown ? pricingBreakdownForResponse(pricingResult.breakdown) : null,
      pricingError: pricingResult.ok ? null : pricingResult.error,
      mvpViable: warehouseChileConfirmed && pricingResult.ok,
    };
  },

  async evaluate(input: CjMlChileEvaluateInput) {
    const adapter = createCjMlChileSupplierAdapter(input.userId);
    const settings = await cjMlChileConfigService.getOrCreate(input.userId);

    await cjMlChileTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_ML_CHILE_TRACE_STEP.QUALIFICATION_START,
      message: 'qualification.start',
      meta: { productId: input.productId, variantId: input.variantId, quantity: input.quantity },
    });

    const detail = await adapter.getProductById(input.productId);
    const variant = pickVariant(detail, input.variantId);
    if (!variant) throw new Error(`Variant not found: ${input.variantId}`);

    const stockMap = await adapter.getStockForSkus([input.variantId]);
    const fromApi = stockMap.get(input.variantId);
    const stockLive = fromApi !== undefined && Number.isFinite(fromApi) ? fromApi : Math.floor(variant.stock);

    // Probe warehouse Chile with CL -> CL freightCalculate.
    let chileFreight: Awaited<ReturnType<typeof quoteShippingToChileLocalWarehouse>> | null = null;
    let warehouseChileConfirmed = false;

    try {
      chileFreight = await quoteShippingToChileLocalWarehouse(adapter, {
        variantId: input.variantId,
        productId: input.productId,
        quantity: input.quantity,
      });
      warehouseChileConfirmed = true;
    } catch {
      warehouseChileConfirmed = false;
    }

    const shippingCost = chileFreight?.quote.cost ?? 0;
    const unitCost = variant.unitCostUsd;
    const supplierLineCost = unitCost != null && Number.isFinite(unitCost) ? unitCost * input.quantity : NaN;

    const pricingResult = Number.isFinite(supplierLineCost)
      ? await computeMlChilePricing({
          supplierCostUsd: supplierLineCost,
          shippingUsd: shippingCost,
          feesInput: {
            mlcFeePct: Number(settings.mlcFeePct),
            mpPaymentFeePct: Number(settings.mpPaymentFeePct),
            incidentBufferPct: Number(settings.incidentBufferPct),
          },
          minMarginPct: settings.minMarginPct != null ? Number(settings.minMarginPct) : null,
          minProfitUsd: settings.minProfitUsd != null ? Number(settings.minProfitUsd) : null,
        })
      : { ok: false as const, error: 'NO_UNIT_COST', breakdown: undefined };

    const { decision, reasons } = decideQualification({
      settings: {
        minStock: settings.minStock,
        minMarginPct: settings.minMarginPct != null ? Number(settings.minMarginPct) : null,
        minProfitUsd: settings.minProfitUsd != null ? Number(settings.minProfitUsd) : null,
        maxShippingUsd: settings.maxShippingUsd != null ? Number(settings.maxShippingUsd) : null,
        rejectOnUnknownShipping: settings.rejectOnUnknownShipping,
        requireChileWarehouse: settings.requireChileWarehouse,
      },
      unitCostUsd: unitCost ?? null,
      stockLive,
      shippingCost,
      shippingEstimatedDays: chileFreight?.quote.estimatedDays ?? null,
      warehouseChileConfirmed,
      netProfitUsd: pricingResult.ok && pricingResult.breakdown ? pricingResult.breakdown.netProfitUsd : NaN,
      netMarginPct: pricingResult.ok && pricingResult.breakdown ? pricingResult.breakdown.netMarginPct : null,
    });

    // Persist snapshot
    const persisted = await persistProductSnapshot(input.userId, detail);
    const vRow = persisted.variants.find(
      (x) => x.cjVid === String(input.variantId).trim() || x.cjSku === variant.cjSku
    );
    if (!vRow) throw new Error('Persisted variant row not found after upsert');

    const quoteRow = await prisma.cjMlChileShippingQuote.create({
      data: {
        userId: input.userId,
        productId: persisted.id,
        variantId: vRow.id,
        quantity: input.quantity,
        amountUsd: new Prisma.Decimal(shippingCost),
        currency: 'USD',
        serviceName: chileFreight?.quote.method ?? null,
        carrier: chileFreight?.quote.method ?? null,
        estimatedMinDays: chileFreight?.quote.estimatedDays ?? null,
        estimatedMaxDays: chileFreight?.quote.estimatedDays ?? null,
        confidence: warehouseChileConfirmed ? 'CONFIRMED' : 'UNKNOWN',
        originCountryCode: chileFreight?.quote.startCountryCode ?? 'CN',
      },
    });

    await prisma.cjMlChileProductVariant.update({
      where: { id: vRow.id },
      data: { stockLastKnown: stockLive, stockCheckedAt: new Date() },
    });

    const evalRow = await prisma.cjMlChileProductEvaluation.create({
      data: {
        userId: input.userId,
        productId: persisted.id,
        variantId: vRow.id,
        shippingQuoteId: quoteRow.id,
        decision,
        reasons: reasons as unknown as Prisma.InputJsonValue,
        estimatedMarginPct: pricingResult.ok && pricingResult.breakdown?.netMarginPct != null && Number.isFinite(pricingResult.breakdown.netMarginPct)
          ? new Prisma.Decimal(pricingResult.breakdown.netMarginPct) : null,
        landedCostUsd: pricingResult.ok && pricingResult.breakdown ? new Prisma.Decimal(pricingResult.breakdown.landedCostUsd) : null,
        suggestedPriceCLP: pricingResult.ok && pricingResult.breakdown ? new Prisma.Decimal(pricingResult.breakdown.suggestedPriceCLP) : null,
        fxRateUsed: pricingResult.ok && pricingResult.breakdown ? new Prisma.Decimal(pricingResult.breakdown.fxRateCLPperUSD) : null,
        fxRateAt: pricingResult.ok && pricingResult.breakdown ? pricingResult.breakdown.fxRateAt : null,
      },
    });

    await cjMlChileTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_ML_CHILE_TRACE_STEP.QUALIFICATION_RESULT,
      message: `qualification.result ${decision}`,
      meta: {
        decision,
        evaluationId: evalRow.id,
        warehouseChileConfirmed,
        reasonCodes: reasons.map((r) => r.code),
        suggestedPriceCLP: pricingResult.ok ? pricingResult.breakdown?.suggestedPriceCLP : null,
      },
    });

    return {
      decision,
      reasons,
      warehouseChileConfirmed,
      pricing: pricingResult.ok && pricingResult.breakdown ? pricingBreakdownForResponse(pricingResult.breakdown) : null,
      pricingError: pricingResult.ok ? null : pricingResult.error,
      shipping: chileFreight
        ? { cost: chileFreight.quote.cost, method: chileFreight.quote.method, estimatedDays: chileFreight.quote.estimatedDays, startCountryCode: chileFreight.quote.startCountryCode, confidence: warehouseChileConfirmed ? 'CONFIRMED' : 'UNKNOWN' }
        : null,
      product: { cjProductId: detail.cjProductId, title: detail.title },
      variant: { cjSku: variant.cjSku, cjVid: variant.cjVid, stockLive, unitCostUsd: unitCost ?? null },
      ids: {
        productDbId: persisted.id,
        variantDbId: vRow.id,
        shippingQuoteId: quoteRow.id,
        evaluationId: evalRow.id,
      },
    };
  },
};
