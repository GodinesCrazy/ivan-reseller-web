import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { CJ_SHOPIFY_USA_LISTING_STATUS, CJ_SHOPIFY_USA_ORDER_STATUS, CJ_SHOPIFY_USA_SOCIAL_POST_STATUS } from '../cj-shopify-usa.constants';
import { cjShopifyUsaProfitGuardService } from './cj-shopify-usa-profit-guard.service';

type TrackEventType = 'product_view' | 'add_to_cart' | 'checkout_started' | 'purchase' | 'social_click';

const EVENT_COLUMNS: Record<TrackEventType, keyof Prisma.CjShopifyUsaProductMetricDailyUncheckedUpdateInput> = {
  product_view: 'productViews',
  add_to_cart: 'addToCarts',
  checkout_started: 'checkoutStarted',
  purchase: 'purchases',
  social_click: 'socialClicks',
};

const PAID_ORDER_STATUSES = new Set<string>([
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_CREATED,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_FULFILLING,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_SHIPPED,
  CJ_SHOPIFY_USA_ORDER_STATUS.TRACKING_ON_SHOPIFY,
  CJ_SHOPIFY_USA_ORDER_STATUS.COMPLETED,
]);

function dateOnly(input?: string | Date | null): Date {
  const d = input ? new Date(input) : new Date();
  if (!Number.isFinite(d.getTime())) return dateOnly();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 10_000) / 100;
}

async function trace(userId: number, message: string, meta: Record<string, unknown>) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      route: 'sales-intelligence',
      step: 'analytics.sales_intelligence',
      message,
      meta: meta as Prisma.InputJsonValue,
    },
  });
}

export const cjShopifyUsaSalesIntelligenceService = {
  async track(userId: number, input: {
    eventType: string;
    listingId?: number | null;
    productId?: number | null;
    shopifyProductId?: string | null;
    shopifyHandle?: string | null;
    source?: string | null;
    occurredAt?: string | Date | null;
    revenueUsd?: number | string | null;
    quantity?: number | string | null;
    meta?: Record<string, unknown> | null;
  }) {
    const eventType = String(input.eventType || '').trim() as TrackEventType;
    if (!Object.prototype.hasOwnProperty.call(EVENT_COLUMNS, eventType)) {
      throw new Error(`Unsupported analytics event: ${input.eventType}`);
    }

    let listing = input.listingId
      ? await prisma.cjShopifyUsaListing.findFirst({ where: { userId, id: Number(input.listingId) } })
      : null;
    if (!listing && input.shopifyProductId) {
      listing = await prisma.cjShopifyUsaListing.findFirst({ where: { userId, shopifyProductId: String(input.shopifyProductId) } });
    }
    if (!listing && input.shopifyHandle) {
      listing = await prisma.cjShopifyUsaListing.findFirst({ where: { userId, shopifyHandle: String(input.shopifyHandle) } });
    }

    const listingId = listing?.id ?? (input.listingId ? Number(input.listingId) : null);
    const productId = listing?.productId ?? (input.productId ? Number(input.productId) : null);
    const metricDate = dateOnly(input.occurredAt);
    const source = String(input.source || 'collector').slice(0, 60);
    const quantity = Math.max(1, Math.min(100, Math.round(num(input.quantity) || 1)));
    const revenueUsd = Math.max(0, num(input.revenueUsd));
    const column = EVENT_COLUMNS[eventType];

    const existing = await prisma.cjShopifyUsaProductMetricDaily.findFirst({
      where: { userId, listingId, productId, metricDate, source },
    });
    const incrementData: Prisma.CjShopifyUsaProductMetricDailyUncheckedUpdateInput = {
      [column]: { increment: quantity },
      revenueUsd: eventType === 'purchase' ? { increment: revenueUsd } : undefined,
      meta: {
        ...(input.meta ?? {}),
        lastEventType: eventType,
        lastTrackedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    };

    const metric = existing
      ? await prisma.cjShopifyUsaProductMetricDaily.update({ where: { id: existing.id }, data: incrementData })
      : await prisma.cjShopifyUsaProductMetricDaily.create({
          data: {
            userId,
            listingId,
            productId,
            metricDate,
            source,
            productViews: eventType === 'product_view' ? quantity : 0,
            addToCarts: eventType === 'add_to_cart' ? quantity : 0,
            checkoutStarted: eventType === 'checkout_started' ? quantity : 0,
            purchases: eventType === 'purchase' ? quantity : 0,
            socialClicks: eventType === 'social_click' ? quantity : 0,
            revenueUsd: eventType === 'purchase' ? revenueUsd : 0,
            meta: incrementData.meta as Prisma.InputJsonValue,
          },
        });

    if (eventType === 'purchase') {
      await trace(userId, 'sales_intelligence.purchase_tracked', { listingId, productId, revenueUsd, source });
    }

    return { ok: true, metric };
  },

  async importSnapshot(userId: number, input: { rows?: unknown[]; source?: string }) {
    const rows = Array.isArray(input.rows) ? input.rows : [];
    const results: Array<{ ok: boolean; listingId?: number | null; error?: string }> = [];
    for (const raw of rows.slice(0, 500)) {
      const row = (raw ?? {}) as Record<string, unknown>;
      try {
        const listingId = row.listingId == null ? null : Number(row.listingId);
        const listing = listingId
          ? await prisma.cjShopifyUsaListing.findFirst({ where: { userId, id: listingId } })
          : null;
        await this.upsertSnapshotMetric(userId, {
          listingId: listing?.id ?? listingId,
          productId: listing?.productId ?? (row.productId == null ? null : Number(row.productId)),
          metricDate: dateOnly(String(row.date || row.metricDate || new Date().toISOString())),
          source: String(input.source || row.source || 'manual_import').slice(0, 60),
          productViews: Math.max(0, Math.round(num(row.productViews ?? row.views))),
          addToCarts: Math.max(0, Math.round(num(row.addToCarts ?? row.addToCart))),
          checkoutStarted: Math.max(0, Math.round(num(row.checkoutStarted ?? row.checkouts))),
          purchases: Math.max(0, Math.round(num(row.purchases ?? row.orders))),
          socialClicks: Math.max(0, Math.round(num(row.socialClicks))),
          revenueUsd: Math.max(0, num(row.revenueUsd ?? row.revenue)),
        });
        results.push({ ok: true, listingId: listing?.id ?? listingId });
      } catch (error) {
        results.push({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    await trace(userId, 'sales_intelligence.snapshot_imported', {
      requested: rows.length,
      imported: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    });
    return { ok: true, imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  },

  async upsertSnapshotMetric(userId: number, input: {
    listingId: number | null;
    productId: number | null;
    metricDate: Date;
    source: string;
    productViews: number;
    addToCarts: number;
    checkoutStarted: number;
    purchases: number;
    socialClicks: number;
    revenueUsd: number;
  }) {
    const existing = await prisma.cjShopifyUsaProductMetricDaily.findFirst({
      where: {
        userId,
        listingId: input.listingId,
        productId: input.productId,
        metricDate: input.metricDate,
        source: input.source,
      },
    });
    const data = {
      productViews: input.productViews,
      addToCarts: input.addToCarts,
      checkoutStarted: input.checkoutStarted,
      purchases: input.purchases,
      socialClicks: input.socialClicks,
      revenueUsd: input.revenueUsd,
      meta: { importedAt: new Date().toISOString() } as Prisma.InputJsonValue,
    };
    return existing
      ? prisma.cjShopifyUsaProductMetricDaily.update({ where: { id: existing.id }, data })
      : prisma.cjShopifyUsaProductMetricDaily.create({ data: { userId, ...input, ...data } });
  },

  async productSignals(userId: number, options: { days?: number; limit?: number } = {}) {
    const days = Math.max(1, Math.min(180, Number(options.days ?? 30)));
    const since = dateOnly(new Date(Date.now() - (days - 1) * 86_400_000));
    const metrics = await prisma.cjShopifyUsaProductMetricDaily.groupBy({
      by: ['listingId', 'productId'],
      where: { userId, metricDate: { gte: since } },
      _sum: {
        productViews: true,
        addToCarts: true,
        checkoutStarted: true,
        purchases: true,
        socialClicks: true,
        revenueUsd: true,
      },
      orderBy: { _sum: { productViews: 'desc' } },
      take: Math.max(1, Math.min(500, Number(options.limit ?? 120))),
    });
    return metrics.map((row) => ({
      listingId: row.listingId,
      productId: row.productId,
      views: row._sum.productViews ?? 0,
      addToCarts: row._sum.addToCarts ?? 0,
      checkoutStarted: row._sum.checkoutStarted ?? 0,
      purchases: row._sum.purchases ?? 0,
      socialClicks: row._sum.socialClicks ?? 0,
      revenueUsd: Number(row._sum.revenueUsd ?? 0),
      addToCartRatePct: pct(row._sum.addToCarts ?? 0, row._sum.productViews ?? 0),
      checkoutRatePct: pct(row._sum.checkoutStarted ?? 0, row._sum.productViews ?? 0),
      purchaseRatePct: pct(row._sum.purchases ?? 0, row._sum.productViews ?? 0),
    }));
  },

  async salesIntelligence(userId: number, options: { days?: number; limit?: number } = {}) {
    const days = Math.max(1, Math.min(180, Number(options.days ?? 30)));
    const signals = await this.productSignals(userId, { days, limit: options.limit ?? 160 });
    type ProductSignal = Awaited<ReturnType<typeof this.productSignals>>[number];
    const byListing = new Map<number, ProductSignal>(signals.filter((s) => s.listingId != null).map((s) => [Number(s.listingId), s]));
    const listings = await prisma.cjShopifyUsaListing.findMany({
      where: { userId, status: { in: [CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE, CJ_SHOPIFY_USA_LISTING_STATUS.PAUSED, CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING] } },
      include: {
        product: true,
        evaluation: true,
        shippingQuote: true,
        socialPosts: true,
        orders: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(1, Math.min(500, Number(options.limit ?? 160))),
    });
    const profitGuard = await cjShopifyUsaProfitGuardService.run(userId, { dryRun: true, limit: 500 });
    const issueByListing = new Map(profitGuard.issues.map((issue) => [issue.listingId, issue]));

    const products = listings.map((listing) => {
      const signal: ProductSignal = byListing.get(listing.id) ?? {
        listingId: listing.id,
        productId: listing.productId,
        views: 0,
        addToCarts: 0,
        checkoutStarted: 0,
        purchases: 0,
        socialClicks: 0,
        revenueUsd: 0,
        addToCartRatePct: 0,
        checkoutRatePct: 0,
        purchaseRatePct: 0,
      };
      const orders30 = listing.orders.filter((order) =>
        PAID_ORDER_STATUSES.has(order.status) &&
        order.createdAt.getTime() >= Date.now() - days * 86_400_000,
      ).length;
      const socialSuccess = listing.socialPosts.filter((post) => post.status === CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS).length;
      const marginPct = num(listing.evaluation?.estimatedMarginPct);
      const priceUsd = num(listing.listedPriceUsd);
      const profitIssue = issueByListing.get(listing.id);
      const ageDays = listing.publishedAt ? Math.floor((Date.now() - listing.publishedAt.getTime()) / 86_400_000) : null;
      let decision: 'SCALE' | 'OPTIMIZE' | 'PROTECT' | 'ROTATE' | 'LEARNING' = 'LEARNING';
      const reasons: string[] = [];
      if (profitIssue || !listing.shippingQuote || marginPct < 10) {
        decision = 'PROTECT';
        reasons.push(profitIssue?.reason || 'Margen, costo o shipping requiere proteccion.');
      } else if (orders30 > 0 || signal.purchases > 0) {
        decision = 'SCALE';
        reasons.push('Tiene ventas/compras registradas.');
      } else if (signal.views >= 20 && signal.addToCarts === 0) {
        decision = 'OPTIMIZE';
        reasons.push('Tiene visitas pero no agrega al carrito.');
      } else if (signal.addToCarts > 0 || signal.checkoutStarted > 0 || socialSuccess > 0 || signal.socialClicks > 0) {
        decision = 'OPTIMIZE';
        reasons.push('Tiene senales debiles; mejorar ficha/precio antes de pausar.');
      } else if ((ageDays ?? 0) >= 14 && signal.views === 0 && orders30 === 0) {
        decision = 'ROTATE';
        reasons.push('Publicado 14+ dias sin ventas ni senales.');
      }

      const score = Math.max(0, Math.min(100, Math.round(
        35 +
        Math.min(20, marginPct) +
        Math.min(15, signal.addToCartRatePct * 2) +
        Math.min(15, orders30 * 5 + signal.purchases * 5) +
        Math.min(8, socialSuccess * 2 + signal.socialClicks / 5) -
        (decision === 'PROTECT' ? 25 : 0) -
        (decision === 'ROTATE' ? 15 : 0),
      )));

      return {
        listingId: listing.id,
        productId: listing.productId,
        title: listing.product.title,
        status: listing.status,
        handle: listing.shopifyHandle,
        priceUsd,
        marginPct,
        ageDays,
        socialSuccess,
        orders30,
        signal,
        decision,
        score,
        reasons,
      };
    }).sort((a, b) => b.score - a.score);

    return {
      ok: true,
      days,
      generatedAt: new Date().toISOString(),
      totals: {
        products: products.length,
        scale: products.filter((p) => p.decision === 'SCALE').length,
        optimize: products.filter((p) => p.decision === 'OPTIMIZE').length,
        protect: products.filter((p) => p.decision === 'PROTECT').length,
        rotate: products.filter((p) => p.decision === 'ROTATE').length,
        learning: products.filter((p) => p.decision === 'LEARNING').length,
      },
      products,
    };
  },
};
