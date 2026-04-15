/**
 * CJ → eBay USA — calificación + orquestación evaluate/preview (FASE 3C).
 * Sin publicación eBay, sin órdenes CJ, sin tablas legacy Product/Order/Sale.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { cjEbayTraceService } from './cj-ebay-trace.service';
import { CJ_EBAY_TRACE_STEP } from '../cj-ebay.constants';
import type { ICjSupplierAdapter } from '../adapters/cj-supplier.adapter.interface';
import type { CjProductDetail, CjVariantDetail } from '../adapters/cj-supplier.adapter.interface';
import {
  buildPricingContext,
  computeFullPricingPreview,
  prismaSettingsToFeeInput,
  resolveFeeSettings,
  type CjPricingBreakdown,
} from './cj-ebay-pricing.service';
import { createCjSupplierAdapter } from '../adapters/cj-supplier.adapter';

export interface CjEvaluateRequestBody {
  productId: string;
  variantId: string;
  quantity: number;
  destPostalCode?: string;
}

export type QualificationReason = {
  rule: string;
  code: string;
  message: string;
  severity: 'info' | 'warn' | 'block';
};

function invalidCostBreakdown(
  shippingUsd: number,
  settingsRow: Parameters<typeof prismaSettingsToFeeInput>[0] & {
    minMarginPct: Prisma.Decimal | null;
    minProfitUsd: Prisma.Decimal | null;
  }
): CjPricingBreakdown {
  const feeRow = prismaSettingsToFeeInput(settingsRow);
  const fees = resolveFeeSettings(feeRow);
  const sh = Math.round(shippingUsd * 100) / 100;
  return {
    supplierCostUsd: NaN,
    shippingUsd: sh,
    ebayFeeUsd: NaN,
    paymentFeeUsd: NaN,
    incidentBufferUsd: NaN,
    totalCostUsd: NaN,
    listPriceUsd: NaN,
    netProfitUsd: NaN,
    netMarginPct: null,
    suggestedPriceUsd: NaN,
    minimumAllowedPriceUsd: NaN,
    feeDefaultsApplied: fees.defaultsApplied,
    pricingContext: buildPricingContext({
      feeRow,
      fees,
      minMarginPct: settingsRow.minMarginPct != null ? Number(settingsRow.minMarginPct) : null,
      minProfitUsd: settingsRow.minProfitUsd != null ? Number(settingsRow.minProfitUsd) : null,
    }),
  };
}

function pickVariant(detail: CjProductDetail, variantId: string): CjVariantDetail | null {
  const v = String(variantId || '').trim();
  return (
    detail.variants.find((x) => String(x.cjVid || '').trim() === v) ||
    detail.variants.find((x) => x.cjSku === v) ||
    null
  );
}

/** P7 básico: palabras clave de riesgo hasta exponer peso/categoría en el snapshot. */
export function computeBasicRiskScore(detail: CjProductDetail, variant: CjVariantDetail): number {
  const blob = `${detail.title} ${variant.attributes?.label || ''} ${detail.description || ''}`.toLowerCase();
  let s = 0;
  if (/(lithium|li-ion|battery|batería)/.test(blob)) s += 40;
  if (/(weapon|knife|gun|taser)/.test(blob)) s += 50;
  return Math.min(100, s);
}

async function persistProductSnapshot(userId: number, detail: CjProductDetail) {
  const p = await prisma.cjEbayProduct.upsert({
    where: {
      userId_cjProductId: { userId, cjProductId: detail.cjProductId },
    },
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
    await prisma.cjEbayProductVariant.upsert({
      where: { productId_cjSku: { productId: p.id, cjSku: sku } },
      create: {
        productId: p.id,
        cjSku: sku,
        cjVid: v.cjVid ? v.cjVid.slice(0, 200) : null,
        unitCostUsd:
          v.unitCostUsd != null && Number.isFinite(v.unitCostUsd)
            ? new Prisma.Decimal(v.unitCostUsd)
            : null,
        stockLastKnown: Number.isFinite(v.stock) ? Math.floor(v.stock) : 0,
        stockCheckedAt: new Date(),
        attributes: v.attributes as Prisma.InputJsonValue,
      },
      update: {
        cjVid: v.cjVid ? v.cjVid.slice(0, 200) : null,
        unitCostUsd:
          v.unitCostUsd != null && Number.isFinite(v.unitCostUsd)
            ? new Prisma.Decimal(v.unitCostUsd)
            : null,
        stockLastKnown: Number.isFinite(v.stock) ? Math.floor(v.stock) : 0,
        stockCheckedAt: new Date(),
        attributes: v.attributes as Prisma.InputJsonValue,
      },
    });
  }

  return prisma.cjEbayProduct.findUniqueOrThrow({
    where: { id: p.id },
    include: { variants: true },
  });
}

async function runCjDataAndShipping(
  userId: number,
  body: CjEvaluateRequestBody,
  adapter: ICjSupplierAdapter
): Promise<{
  detail: CjProductDetail;
  variant: CjVariantDetail;
  stockLive: number;
  freight: Awaited<ReturnType<ICjSupplierAdapter['quoteShippingToUsReal']>>;
}> {
  const detail = await adapter.getProductById(String(body.productId).trim());
  const variant = pickVariant(detail, body.variantId);
  if (!variant) {
    throw new Error(`Variant not found for vid/sku: ${body.variantId}`);
  }

  const stockMap = await adapter.getStockForSkus([String(body.variantId).trim()]);
  const fromApi = stockMap.get(String(body.variantId).trim());
  const stockLive =
    fromApi !== undefined && Number.isFinite(fromApi) ? fromApi : Math.floor(variant.stock);

  const freight = await adapter.quoteShippingToUsReal({
    variantId: String(body.variantId).trim(),
    productId: String(body.productId).trim(),
    quantity: body.quantity,
    destPostalCode: body.destPostalCode,
  });

  return { detail, variant, stockLive, freight };
}

function decideQualification(params: {
  settings: {
    minStock: number;
    minMarginPct: number | null;
    minProfitUsd: number | null;
    maxShippingUsd: number | null;
    rejectOnUnknownShipping: boolean;
    maxRiskScore: number | null;
  };
  unitCostUsd: number | null;
  stockLive: number;
  shippingCost: number;
  shippingEstimatedDays: number | null;
  breakdown: CjPricingBreakdown;
  riskScore: number;
}): { decision: 'APPROVED' | 'REJECTED' | 'PENDING'; reasons: QualificationReason[] } {
  const reasons: QualificationReason[] = [];

  if (params.stockLive < params.settings.minStock) {
    reasons.push({
      rule: 'P2',
      code: 'STOCK_BELOW_MIN',
      message: `Stock ${params.stockLive} < minStock ${params.settings.minStock}`,
      severity: 'block',
    });
  }

  if (params.unitCostUsd == null || params.unitCostUsd <= 0 || !Number.isFinite(params.unitCostUsd)) {
    reasons.push({
      rule: 'P2',
      code: 'SUPPLIER_COST_UNKNOWN',
      message: 'CJ unit cost missing or not positive (cannot price safely).',
      severity: 'block',
    });
  }

  if (
    params.settings.maxShippingUsd != null &&
    Number.isFinite(params.settings.maxShippingUsd) &&
    params.shippingCost > params.settings.maxShippingUsd
  ) {
    reasons.push({
      rule: 'P2',
      code: 'SHIPPING_EXCEEDS_CAP',
      message: `Shipping ${params.shippingCost} > maxShippingUsd ${params.settings.maxShippingUsd}`,
      severity: 'block',
    });
  }

  if (params.shippingEstimatedDays == null && params.settings.rejectOnUnknownShipping) {
    reasons.push({
      rule: 'P2',
      code: 'SHIPPING_TIME_UNKNOWN',
      message: 'CJ did not return parseable transit window; rejectOnUnknownShipping is true.',
      severity: 'block',
    });
  }

  if (
    params.settings.maxRiskScore != null &&
    Number.isFinite(params.settings.maxRiskScore) &&
    params.riskScore > params.settings.maxRiskScore
  ) {
    reasons.push({
      rule: 'P7',
      code: 'RISK_ABOVE_MAX',
      message: `riskScore ${params.riskScore} > maxRiskScore ${params.settings.maxRiskScore}`,
      severity: 'block',
    });
  }

  const blocks = reasons.filter((r) => r.severity === 'block');
  if (blocks.length > 0) {
    return { decision: 'REJECTED', reasons };
  }

  const minM = params.settings.minMarginPct;
  const minP = params.settings.minProfitUsd;
  if (minM == null || minP == null) {
    reasons.push({
      rule: 'P3',
      code: 'THRESHOLDS_INCOMPLETE',
      message:
        'minMarginPct and/or minProfitUsd not set in account settings — cannot mark APPROVED until both are configured.',
      severity: 'info',
    });
    return { decision: 'PENDING', reasons };
  }

  const netM = params.breakdown.netMarginPct;
  const netProfit = params.breakdown.netProfitUsd;
  if (netM == null || !Number.isFinite(netM) || netM < minM) {
    reasons.push({
      rule: 'P3',
      code: 'NET_MARGIN_BELOW_MIN',
      message: `netMarginPct ${netM ?? 'n/a'} < minMarginPct ${minM}`,
      severity: 'block',
    });
  }
  if (!Number.isFinite(netProfit) || netProfit < minP) {
    reasons.push({
      rule: 'P3',
      code: 'NET_PROFIT_BELOW_MIN',
      message: `netProfitUsd ${netProfit} < minProfitUsd ${minP}`,
      severity: 'block',
    });
  }

  const hard = reasons.filter((r) => r.severity === 'block');
  if (hard.length > 0) {
    return { decision: 'REJECTED', reasons };
  }

  reasons.push({
    rule: 'P1',
    code: 'ALL_CHECKS_PASSED',
    message: 'Stock, shipping, cost, risk and margin/profit thresholds satisfied.',
    severity: 'info',
  });
  return { decision: 'APPROVED', reasons };
}

export const cjEbayQualificationService = {
  async preview(input: {
    userId: number;
    body: CjEvaluateRequestBody;
    correlationId?: string;
    route?: string;
  }): Promise<{
    breakdown: CjPricingBreakdown;
    shipping: { cost: number; method: string; estimatedDays: number | null; raw: unknown };
    product: { cjProductId: string; title: string };
    variant: { cjSku: string; cjVid?: string; stockLive: number; unitCostUsd: number | null };
    riskScore: number;
  }> {
    const adapter = createCjSupplierAdapter(input.userId);
    const settingsRow = await prisma.cjEbayAccountSettings.findUnique({
      where: { userId: input.userId },
    });
    if (!settingsRow) {
      await prisma.cjEbayAccountSettings.create({ data: { userId: input.userId } });
    }
    const row = await prisma.cjEbayAccountSettings.findUniqueOrThrow({
      where: { userId: input.userId },
    });

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.PRICING_PREVIEW,
      message: 'pricing.preview start',
      meta: { productId: input.body.productId, variantId: input.body.variantId },
    });

    try {
      const { detail, variant, stockLive, freight } = await runCjDataAndShipping(
        input.userId,
        input.body,
        adapter
      );
      const unitCost = variant.unitCostUsd;
      const supplierLineCost =
        unitCost != null && Number.isFinite(unitCost) ? unitCost * input.body.quantity : NaN;
      if (!Number.isFinite(supplierLineCost) || supplierLineCost <= 0) {
        throw new Error('NO_UNIT_COST');
      }

      let breakdown: CjPricingBreakdown;
      try {
        breakdown = computeFullPricingPreview({
          supplierCostUsd: supplierLineCost,
          shippingUsd: freight.quote.cost,
          feeRow: prismaSettingsToFeeInput(row),
          minMarginPct: row.minMarginPct != null ? Number(row.minMarginPct) : null,
          minProfitUsd: row.minProfitUsd != null ? Number(row.minProfitUsd) : null,
        });
      } catch (e) {
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.PRICING_ERROR,
          message: e instanceof Error ? e.message : String(e),
          meta: { productId: input.body.productId },
        });
        throw e;
      }

      const riskScore = computeBasicRiskScore(detail, variant);

      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.PRICING_PREVIEW,
        message: 'pricing.preview complete',
        meta: {
          suggestedPriceUsd: breakdown.suggestedPriceUsd,
          netMarginPct: breakdown.netMarginPct,
          netProfitUsd: breakdown.netProfitUsd,
        },
      });

      return {
        breakdown,
        shipping: freight.quote,
        product: { cjProductId: detail.cjProductId, title: detail.title },
        variant: {
          cjSku: variant.cjSku,
          cjVid: variant.cjVid,
          stockLive,
          unitCostUsd: unitCost ?? null,
        },
        riskScore,
      };
    } catch (e) {
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.PRICING_ERROR,
        message: e instanceof Error ? e.message : String(e),
        meta: { stage: 'preview' },
      });
      throw e;
    }
  },

  async evaluate(input: {
    userId: number;
    body: CjEvaluateRequestBody;
    correlationId?: string;
    route?: string;
  }): Promise<{
    breakdown: CjPricingBreakdown;
    shipping: { cost: number; method: string; estimatedDays: number | null; raw: unknown };
    decision: 'APPROVED' | 'REJECTED' | 'PENDING';
    reasons: QualificationReason[];
    riskScore: number;
    ids: {
      productDbId: number;
      variantDbId: number;
      shippingQuoteId: number;
      evaluationId: number;
    };
  }> {
    const adapter = createCjSupplierAdapter(input.userId);
    await prisma.cjEbayAccountSettings.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId },
      update: {},
    });
    const settingsRow = await prisma.cjEbayAccountSettings.findUniqueOrThrow({
      where: { userId: input.userId },
    });

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.QUALIFICATION_START,
      message: 'qualification.start',
      meta: {
        productId: input.body.productId,
        variantId: input.body.variantId,
        quantity: input.body.quantity,
      },
    });

    try {
      const { detail, variant, stockLive, freight } = await runCjDataAndShipping(
        input.userId,
        input.body,
        adapter
      );

      const persisted = await persistProductSnapshot(input.userId, detail);
      const vRow = persisted.variants.find(
        (x) => x.cjVid === String(input.body.variantId).trim() || x.cjSku === variant.cjSku
      );
      if (!vRow) {
        throw new Error('Persisted variant row not found after upsert');
      }

      const quoteRow = await prisma.cjEbayShippingQuote.create({
        data: {
          userId: input.userId,
          productId: persisted.id,
          variantId: vRow.id,
          quantity: input.body.quantity,
          amountUsd: new Prisma.Decimal(freight.quote.cost),
          currency: 'USD',
          serviceName: freight.quote.method,
          carrier: freight.quote.method,
          estimatedMinDays: freight.quote.estimatedDays ?? null,
          estimatedMaxDays: freight.quote.estimatedDays ?? null,
          confidence: freight.quote.estimatedDays != null ? 'known' : 'unknown',
        },
      });

      const unitCost = variant.unitCostUsd;
      const supplierLineCost =
        unitCost != null && Number.isFinite(unitCost) ? unitCost * input.body.quantity : NaN;

      let breakdown: CjPricingBreakdown;
      if (!Number.isFinite(supplierLineCost)) {
        breakdown = invalidCostBreakdown(freight.quote.cost, settingsRow);
      } else {
        try {
          breakdown = computeFullPricingPreview({
            supplierCostUsd: supplierLineCost,
            shippingUsd: freight.quote.cost,
            feeRow: prismaSettingsToFeeInput(settingsRow),
            minMarginPct:
              settingsRow.minMarginPct != null ? Number(settingsRow.minMarginPct) : null,
            minProfitUsd:
              settingsRow.minProfitUsd != null ? Number(settingsRow.minProfitUsd) : null,
          });
        } catch (e) {
          await cjEbayTraceService.record({
            userId: input.userId,
            correlationId: input.correlationId,
            route: input.route,
            step: CJ_EBAY_TRACE_STEP.PRICING_ERROR,
            message: e instanceof Error ? e.message : String(e),
            meta: { stage: 'evaluate' },
          });
          throw e;
        }
      }

      await prisma.cjEbayProductVariant.update({
        where: { id: vRow.id },
        data: { stockLastKnown: stockLive, stockCheckedAt: new Date() },
      });

      const riskScore = computeBasicRiskScore(detail, variant);

      const { decision, reasons } = decideQualification({
        settings: {
          minStock: settingsRow.minStock,
          minMarginPct: settingsRow.minMarginPct != null ? Number(settingsRow.minMarginPct) : null,
          minProfitUsd: settingsRow.minProfitUsd != null ? Number(settingsRow.minProfitUsd) : null,
          maxShippingUsd:
            settingsRow.maxShippingUsd != null ? Number(settingsRow.maxShippingUsd) : null,
          rejectOnUnknownShipping: settingsRow.rejectOnUnknownShipping,
          maxRiskScore: settingsRow.maxRiskScore,
        },
        unitCostUsd: unitCost ?? null,
        stockLive,
        shippingCost: freight.quote.cost,
        shippingEstimatedDays: freight.quote.estimatedDays,
        breakdown,
        riskScore,
      });

      const evalRow = await prisma.cjEbayProductEvaluation.create({
        data: {
          userId: input.userId,
          productId: persisted.id,
          variantId: vRow.id,
          shippingQuoteId: quoteRow.id,
          decision,
          reasons: reasons as unknown as Prisma.InputJsonValue,
          estimatedMarginPct:
            breakdown.netMarginPct != null && Number.isFinite(breakdown.netMarginPct)
              ? new Prisma.Decimal(breakdown.netMarginPct)
              : null,
        },
      });

      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.QUALIFICATION_RESULT,
        message: `qualification.result ${decision}`,
        meta: {
          decision,
          evaluationId: evalRow.id,
          shippingQuoteId: quoteRow.id,
          reasonCodes: reasons.map((r) => r.code),
        },
      });

      return {
        breakdown,
        shipping: freight.quote,
        decision,
        reasons,
        riskScore,
        ids: {
          productDbId: persisted.id,
          variantDbId: vRow.id,
          shippingQuoteId: quoteRow.id,
          evaluationId: evalRow.id,
        },
      };
    } catch (e) {
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.QUALIFICATION_RESULT,
        message: `qualification.error ${e instanceof Error ? e.message : String(e)}`,
        meta: { ok: false },
      });
      throw e;
    }
  },
};
