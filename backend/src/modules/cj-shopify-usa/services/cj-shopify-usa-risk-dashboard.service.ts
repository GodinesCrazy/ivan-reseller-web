import { prisma } from '../../../config/database';
import { CJ_SHOPIFY_USA_ORDER_STATUS } from '../cj-shopify-usa.constants';
import { cjShopifyUsaProfitGuardService } from './cj-shopify-usa-profit-guard.service';

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export const cjShopifyUsaRiskDashboardService = {
  async postSaleRisk(userId: number) {
    const orders = await prisma.cjShopifyUsaOrder.findMany({
      where: { userId },
      include: { listing: { include: { product: true } }, tracking: true, refunds: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const now = Date.now();
    const rows = orders.map((order) => {
      const ageHours = Math.round((now - order.createdAt.getTime()) / 3_600_000);
      const hasTracking = Boolean(order.tracking?.trackingNumber || order.tracking?.submittedToShopifyAt);
      const riskReasons: string[] = [];
      if ([CJ_SHOPIFY_USA_ORDER_STATUS.CJ_PAYMENT_PENDING, CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_CONFIRMED, CJ_SHOPIFY_USA_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED].includes(order.status as any)) {
        riskReasons.push('Pago CJ pendiente o bloqueado.');
      }
      if (!hasTracking && ageHours >= 96 && ![CJ_SHOPIFY_USA_ORDER_STATUS.COMPLETED, CJ_SHOPIFY_USA_ORDER_STATUS.FAILED].includes(order.status as any)) {
        riskReasons.push('Tracking no sincronizado y SLA acercandose.');
      }
      if (order.refunds.some((refund) => !refund.resolvedAt)) {
        riskReasons.push('Refund/return pendiente.');
      }
      if (order.lastError) riskReasons.push(order.lastError.slice(0, 160));
      const severity = riskReasons.some((reason) => /bloqueado|refund|SLA/i.test(reason)) ? 'high' : riskReasons.length > 0 ? 'medium' : 'low';
      return {
        orderId: order.id,
        shopifyOrderId: order.shopifyOrderId,
        listingId: order.listingId,
        title: order.listing?.product.title ?? order.shopifySku ?? 'Orden Shopify',
        status: order.status,
        ageHours,
        hasTracking,
        totalUsd: num(order.totalUsd),
        severity,
        riskReasons,
      };
    });
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      totals: {
        orders: rows.length,
        high: rows.filter((row) => row.severity === 'high').length,
        medium: rows.filter((row) => row.severity === 'medium').length,
        trackingMissing: rows.filter((row) => !row.hasTracking && row.ageHours >= 96).length,
        paymentBlocked: rows.filter((row) => row.status === CJ_SHOPIFY_USA_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED).length,
      },
      risks: rows.filter((row) => row.riskReasons.length > 0).slice(0, 80),
    };
  },

  async priceRisk(userId: number) {
    const guard = await cjShopifyUsaProfitGuardService.run(userId, { dryRun: true, limit: 500 });
    const listings = await prisma.cjShopifyUsaListing.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { product: true, evaluation: true, shippingQuote: true, variant: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    const issueByListing = new Map(guard.issues.map((issue) => [issue.listingId, issue]));
    const risks = listings.map((listing) => {
      const draft = (listing.draftPayload ?? {}) as Record<string, any>;
      const pricing = (draft.pricingSnapshot ?? {}) as Record<string, any>;
      const marginAtPublish = num(pricing.netMarginPct ?? listing.evaluation?.estimatedMarginPct);
      const supplierCostAtPublish = num(pricing.supplierCostUsd);
      const supplierCostCurrent = num(listing.variant?.unitCostUsd ?? supplierCostAtPublish);
      const shippingAtPublish = num(pricing.shippingCostUsd ?? listing.shippingQuote?.amountUsd);
      const shippingCurrent = num(listing.shippingQuote?.amountUsd ?? shippingAtPublish);
      const issue = issueByListing.get(listing.id);
      const costDeltaUsd = (supplierCostCurrent + shippingCurrent) - (supplierCostAtPublish + shippingAtPublish);
      const action = issue?.action === 'PAUSE_UNSAFE'
        ? 'PAUSE'
        : issue
          ? 'REPRICE'
          : costDeltaUsd > 1
            ? 'REVIEW'
            : 'KEEP';
      return {
        listingId: listing.id,
        title: listing.product.title,
        status: listing.status,
        priceUsd: num(listing.listedPriceUsd),
        marginAtPublish,
        supplierCostAtPublish,
        supplierCostCurrent,
        shippingAtPublish,
        shippingCurrent,
        costDeltaUsd: Math.round(costDeltaUsd * 100) / 100,
        action,
        reason: issue?.reason ?? (costDeltaUsd > 1 ? 'Costo proveedor/envio subio respecto al snapshot.' : 'Sin riesgo mayor detectado.'),
      };
    });
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      totals: {
        scanned: risks.length,
        pause: risks.filter((risk) => risk.action === 'PAUSE').length,
        reprice: risks.filter((risk) => risk.action === 'REPRICE').length,
        review: risks.filter((risk) => risk.action === 'REVIEW').length,
        keep: risks.filter((risk) => risk.action === 'KEEP').length,
      },
      risks: risks.filter((risk) => risk.action !== 'KEEP').slice(0, 120),
    };
  },

  async refreshCosts(userId: number) {
    const shipping = await cjShopifyUsaProfitGuardService.enrichMissingShipping(userId, {
      dryRun: false,
      limit: 50,
    });
    const guard = await cjShopifyUsaProfitGuardService.run(userId, {
      dryRun: false,
      limit: 500,
      pauseUnsafe: true,
      minIncreaseUsd: 0.5,
    });
    return { ok: true, shipping, guard };
  },
};
