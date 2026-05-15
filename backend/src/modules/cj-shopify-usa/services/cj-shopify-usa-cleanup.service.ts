import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_ORDER_STATUS,
  CJ_SHOPIFY_USA_SOCIAL_POST_STATUS,
} from '../cj-shopify-usa.constants';
import { cjShopifyUsaPublishService } from './cj-shopify-usa-publish.service';
import { cjShopifyUsaSalesIntelligenceService } from './cj-shopify-usa-sales-intelligence.service';

export type CjShopifyUsaCleanupAction =
  | 'ARCHIVE_REJECTED'
  | 'ARCHIVE_FAILED_DRAFT'
  | 'PAUSE_NO_TRACTION'
  | 'OPTIMIZE_WEAK_SIGNAL'
  | 'KEEP_LEARNING';

export type CjShopifyUsaCommercialClass =
  | 'SCALE'
  | 'OPTIMIZE'
  | 'PROTECT'
  | 'ROTATE'
  | 'ARCHIVE_CANDIDATE'
  | 'LEARNING';

export type CjShopifyUsaCleanupCandidate = {
  listingId: number | null;
  productId: number | null;
  title: string;
  currentStatus: string | null;
  action: CjShopifyUsaCleanupAction;
  commercialClass: CjShopifyUsaCommercialClass;
  reason: string;
  ageDays: number | null;
  orders30: number;
      socialSuccess: number;
      socialFailed: number;
      views?: number;
      addToCarts?: number;
      hasShopifyId: boolean;
      safeToApply: boolean;
};

type CleanupOptions = {
  thresholdDays?: number;
  failedDraftGraceDays?: number;
  limit?: number;
  dryRun?: boolean;
};

const DEFAULT_THRESHOLD_DAYS = 14;
const DEFAULT_FAILED_DRAFT_GRACE_DAYS = 7;

const PAID_OR_FULFILLMENT_ORDER_STATUSES = new Set<string>([
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_CREATED,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_FULFILLING,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_SHIPPED,
  CJ_SHOPIFY_USA_ORDER_STATUS.TRACKING_ON_SHOPIFY,
  CJ_SHOPIFY_USA_ORDER_STATUS.COMPLETED,
]);

const ACTIVE_OR_DEPENDENT_STATUSES = new Set<string>([
  CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT,
  CJ_SHOPIFY_USA_LISTING_STATUS.PUBLISHING,
  CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
  CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING,
]);

function clampDays(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(90, Math.round(n)));
}

function daysSince(date: Date | string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((now.getTime() - ts) / 86_400_000));
}

function textFromDraft(draft: Prisma.JsonValue | null | undefined, fallback: string): string {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return fallback;
  const record = draft as Record<string, unknown>;
  return String(record.title || record.productTitle || fallback || 'Producto CJ');
}

function moneyNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function recordCleanupTrace(
  userId: number,
  message: string,
  meta: Record<string, unknown>,
) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      route: 'cleanup',
      step: 'cleanup.commercial_hygiene',
      message,
      meta: meta as Prisma.InputJsonValue,
    },
  });
}

function totalsFrom(candidates: CjShopifyUsaCleanupCandidate[]) {
  return {
    total: candidates.length,
    scale: candidates.filter((item) => item.commercialClass === 'SCALE').length,
    optimize: candidates.filter((item) => item.commercialClass === 'OPTIMIZE').length,
    protect: candidates.filter((item) => item.commercialClass === 'PROTECT').length,
    rotate: candidates.filter((item) => item.commercialClass === 'ROTATE').length,
    archiveCandidates: candidates.filter((item) => item.commercialClass === 'ARCHIVE_CANDIDATE').length,
    learning: candidates.filter((item) => item.commercialClass === 'LEARNING').length,
    actionable: candidates.filter((item) => item.safeToApply && item.action !== 'KEEP_LEARNING' && item.action !== 'OPTIMIZE_WEAK_SIGNAL').length,
  };
}

export const cjShopifyUsaCleanupService = {
  async preview(userId: number, options: CleanupOptions = {}) {
    const result = await this.buildPlan(userId, options);
    return {
      ok: true,
      dryRun: true,
      generatedAt: new Date().toISOString(),
      thresholdDays: result.thresholdDays,
      failedDraftGraceDays: result.failedDraftGraceDays,
      totals: totalsFrom(result.candidates),
      candidates: result.candidates.slice(0, options.limit ?? 250),
      classifications: result.candidates
        .filter((item) => item.listingId)
        .map((item) => ({
          listingId: item.listingId,
          productId: item.productId,
          commercialClass: item.commercialClass,
          action: item.action,
          reason: item.reason,
          ageDays: item.ageDays,
        })),
    };
  },

  async run(userId: number, options: CleanupOptions = {}) {
    if (options.dryRun) return this.preview(userId, options);

    const result = await this.buildPlan(userId, options);
    const candidates = result.candidates.filter((item) => item.safeToApply);
    const applied: Array<{ listingId: number | null; productId: number | null; action: CjShopifyUsaCleanupAction; ok: boolean; error?: string }> = [];
    const skipped: Array<{ listingId: number | null; productId: number | null; action: CjShopifyUsaCleanupAction; reason: string }> = [];

    for (const candidate of candidates) {
      try {
        if (candidate.action === 'PAUSE_NO_TRACTION' && candidate.listingId) {
          await cjShopifyUsaPublishService.pauseListing({ userId, listingId: candidate.listingId });
          applied.push({ listingId: candidate.listingId, productId: candidate.productId, action: candidate.action, ok: true });
          continue;
        }

        if (candidate.action === 'ARCHIVE_FAILED_DRAFT' && candidate.listingId) {
          await prisma.cjShopifyUsaListing.update({
            where: { id: candidate.listingId },
            data: {
              status: CJ_SHOPIFY_USA_LISTING_STATUS.ARCHIVED,
              lastError: `Archivado por higiene comercial: ${candidate.reason}`,
            },
          });
          applied.push({ listingId: candidate.listingId, productId: candidate.productId, action: candidate.action, ok: true });
          continue;
        }

        if (candidate.action === 'ARCHIVE_REJECTED' && candidate.productId) {
          await prisma.$transaction([
            prisma.cjShopifyUsaProduct.update({
              where: { id: candidate.productId },
              data: { snapshotStatus: 'ARCHIVED_REJECTED' },
            }),
            prisma.cjShopifyUsaListing.updateMany({
              where: {
                userId,
                productId: candidate.productId,
                shopifyProductId: null,
                status: { in: [CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT, CJ_SHOPIFY_USA_LISTING_STATUS.FAILED, CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_FAILED] },
              },
              data: {
                status: CJ_SHOPIFY_USA_LISTING_STATUS.ARCHIVED,
                lastError: `Archivado por higiene comercial: ${candidate.reason}`,
              },
            }),
          ]);
          applied.push({ listingId: candidate.listingId, productId: candidate.productId, action: candidate.action, ok: true });
          continue;
        }

        skipped.push({ listingId: candidate.listingId, productId: candidate.productId, action: candidate.action, reason: 'Accion informativa; no modifica datos.' });
      } catch (error) {
        applied.push({
          listingId: candidate.listingId,
          productId: candidate.productId,
          action: candidate.action,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totals = totalsFrom(result.candidates);
    await recordCleanupTrace(userId, 'Higiene comercial ejecutada', {
      dryRun: false,
      thresholdDays: result.thresholdDays,
      failedDraftGraceDays: result.failedDraftGraceDays,
      totals,
      applied,
      skipped,
      sampleCandidates: result.candidates.slice(0, 25),
    });

    return {
      ok: true,
      dryRun: false,
      generatedAt: new Date().toISOString(),
      thresholdDays: result.thresholdDays,
      failedDraftGraceDays: result.failedDraftGraceDays,
      totals,
      candidates: result.candidates.slice(0, options.limit ?? 250),
      applied,
      skipped,
    };
  },

  async history(userId: number, limit = 20) {
    const traces = await prisma.cjShopifyUsaExecutionTrace.findMany({
      where: { userId, step: 'cleanup.commercial_hygiene' },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(50, Number(limit) || 20)),
    });
    return { ok: true, traces };
  },

  async getConfig(userId: number) {
    const settings = await prisma.cjShopifyUsaAccountSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return {
      ok: true,
      config: {
        noTractionDays: settings.cleanupNoTractionDays,
        minViewsToDecide: settings.cleanupMinViewsToDecide,
        minAddToCart: settings.cleanupMinAddToCart,
        autoPauseEnabled: settings.cleanupAutoPauseEnabled,
        archiveEnabled: settings.cleanupArchiveEnabled,
      },
    };
  },

  async updateConfig(userId: number, input: Record<string, unknown>) {
    const clamp = (value: unknown, fallback: number, min: number, max: number) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
    };
    const current = await this.getConfig(userId);
    const config = current.config;
    const updated = await prisma.cjShopifyUsaAccountSettings.upsert({
      where: { userId },
      update: {
        cleanupNoTractionDays: clamp(input.noTractionDays, config.noTractionDays, 3, 90),
        cleanupMinViewsToDecide: clamp(input.minViewsToDecide, config.minViewsToDecide, 0, 10000),
        cleanupMinAddToCart: clamp(input.minAddToCart, config.minAddToCart, 0, 1000),
        cleanupAutoPauseEnabled: input.autoPauseEnabled === true,
        cleanupArchiveEnabled: input.archiveEnabled !== false,
      },
      create: {
        userId,
        cleanupNoTractionDays: clamp(input.noTractionDays, config.noTractionDays, 3, 90),
        cleanupMinViewsToDecide: clamp(input.minViewsToDecide, config.minViewsToDecide, 0, 10000),
        cleanupMinAddToCart: clamp(input.minAddToCart, config.minAddToCart, 0, 1000),
        cleanupAutoPauseEnabled: input.autoPauseEnabled === true,
        cleanupArchiveEnabled: input.archiveEnabled !== false,
      },
    });
    return {
      ok: true,
      config: {
        noTractionDays: updated.cleanupNoTractionDays,
        minViewsToDecide: updated.cleanupMinViewsToDecide,
        minAddToCart: updated.cleanupMinAddToCart,
        autoPauseEnabled: updated.cleanupAutoPauseEnabled,
        archiveEnabled: updated.cleanupArchiveEnabled,
      },
    };
  },

  async buildPlan(userId: number, options: CleanupOptions = {}) {
    const now = new Date();
    const settings = await prisma.cjShopifyUsaAccountSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const thresholdDays = clampDays(options.thresholdDays, settings.cleanupNoTractionDays || DEFAULT_THRESHOLD_DAYS);
    const failedDraftGraceDays = clampDays(options.failedDraftGraceDays, DEFAULT_FAILED_DRAFT_GRACE_DAYS);
    const minViewsToDecide = Math.max(0, Number(settings.cleanupMinViewsToDecide ?? 20));
    const minAddToCart = Math.max(0, Number(settings.cleanupMinAddToCart ?? 1));
    const thresholdDate = new Date(now.getTime() - thresholdDays * 86_400_000);
    const failedDraftDate = new Date(now.getTime() - failedDraftGraceDays * 86_400_000);
    const candidates: CjShopifyUsaCleanupCandidate[] = [];
    const signals = await cjShopifyUsaSalesIntelligenceService.productSignals(userId, { days: Math.max(30, thresholdDays), limit: 500 });
    const signalByListing = new Map(signals.filter((item) => item.listingId != null).map((item) => [Number(item.listingId), item]));

    const activeListings = await prisma.cjShopifyUsaListing.findMany({
      where: { userId, status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE },
      include: {
        product: true,
        evaluation: true,
        shippingQuote: true,
        orders: { select: { id: true, status: true, createdAt: true } },
        socialPosts: { select: { status: true, updatedAt: true } },
      },
      orderBy: [{ publishedAt: 'asc' }, { updatedAt: 'asc' }],
      take: 1000,
    });

    for (const listing of activeListings) {
      const ageDays = daysSince(listing.publishedAt ?? listing.updatedAt, now);
      const orders30 = listing.orders.filter((order) =>
        PAID_OR_FULFILLMENT_ORDER_STATUSES.has(order.status) &&
        order.createdAt.getTime() >= now.getTime() - 30 * 86_400_000,
      ).length;
      const totalOrders = listing.orders.length;
      const socialSuccess = listing.socialPosts.filter((post) => post.status === CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS).length;
      const socialFailed = listing.socialPosts.filter((post) => post.status === CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.FAILED).length;
      const signal = signalByListing.get(listing.id);
      const views = Number(signal?.views ?? 0);
      const addToCarts = Number(signal?.addToCarts ?? 0);
      const marginPct = moneyNumber(listing.evaluation?.estimatedMarginPct);
      const hasShopifyId = Boolean(listing.shopifyProductId);
      const title = textFromDraft(listing.draftPayload, listing.product.title);
      const hasProfitRisk = !listing.shippingQuote || !listing.evaluation || marginPct < 10;

      if (orders30 > 0 || totalOrders > 0) {
        candidates.push({
          listingId: listing.id,
          productId: listing.productId,
          title,
          currentStatus: listing.status,
          action: 'KEEP_LEARNING',
          commercialClass: 'SCALE',
          reason: 'Tiene ordenes o ventas recientes; conservar y escalar con aprendizaje.',
          ageDays,
          orders30,
          socialSuccess,
          socialFailed,
          views,
          addToCarts,
          hasShopifyId,
          safeToApply: false,
        });
        continue;
      }

      if (hasProfitRisk) {
        candidates.push({
          listingId: listing.id,
          productId: listing.productId,
          title,
          currentStatus: listing.status,
          action: 'KEEP_LEARNING',
          commercialClass: 'PROTECT',
          reason: 'Necesita proteccion de margen, shipping o evaluacion antes de rotar.',
          ageDays,
          orders30,
          socialSuccess,
          socialFailed,
          views,
          addToCarts,
          hasShopifyId,
          safeToApply: false,
        });
        continue;
      }

      if (socialSuccess > 0 || addToCarts >= minAddToCart || Number(signal?.checkoutStarted ?? 0) > 0 || Number(signal?.socialClicks ?? 0) > 0) {
        candidates.push({
          listingId: listing.id,
          productId: listing.productId,
          title,
          currentStatus: listing.status,
          action: 'OPTIMIZE_WEAK_SIGNAL',
          commercialClass: 'OPTIMIZE',
          reason: 'Tiene senal social, carrito o trafico, pero aun no convierte; optimizar ficha antes de pausar.',
          ageDays,
          orders30,
          socialSuccess,
          socialFailed,
          views,
          addToCarts,
          hasShopifyId,
          safeToApply: false,
        });
        continue;
      }

      if ((ageDays ?? 0) >= thresholdDays && views <= minViewsToDecide && addToCarts < minAddToCart) {
        candidates.push({
          listingId: listing.id,
          productId: listing.productId,
          title,
          currentStatus: listing.status,
          action: 'PAUSE_NO_TRACTION',
          commercialClass: 'ROTATE',
          reason: `${thresholdDays}+ dias publicado sin ventas ni senales positivas.`,
          ageDays,
          orders30,
          socialSuccess,
          socialFailed,
          views,
          addToCarts,
          hasShopifyId,
          safeToApply: hasShopifyId && settings.cleanupAutoPauseEnabled,
        });
        continue;
      }

      candidates.push({
        listingId: listing.id,
        productId: listing.productId,
        title,
        currentStatus: listing.status,
        action: 'KEEP_LEARNING',
        commercialClass: 'LEARNING',
        reason: 'Aun dentro de ventana de aprendizaje comercial.',
        ageDays,
        orders30,
        socialSuccess,
        socialFailed,
        views,
        addToCarts,
        hasShopifyId,
        safeToApply: false,
      });
    }

    const failedDrafts = await prisma.cjShopifyUsaListing.findMany({
      where: {
        userId,
        shopifyProductId: null,
        status: { in: [CJ_SHOPIFY_USA_LISTING_STATUS.FAILED, CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_FAILED] },
        updatedAt: { lte: failedDraftDate },
        orders: { none: {} },
      },
      include: { product: true },
      orderBy: { updatedAt: 'asc' },
      take: 250,
    });

    for (const listing of failedDrafts) {
      candidates.push({
        listingId: listing.id,
        productId: listing.productId,
        title: textFromDraft(listing.draftPayload, listing.product.title),
        currentStatus: listing.status,
        action: 'ARCHIVE_FAILED_DRAFT',
        commercialClass: 'ARCHIVE_CANDIDATE',
        reason: `${failedDraftGraceDays}+ dias fallido sin Shopify ID ni ordenes.`,
        ageDays: daysSince(listing.updatedAt, now),
        orders30: 0,
        socialSuccess: 0,
        socialFailed: 0,
        hasShopifyId: false,
        safeToApply: settings.cleanupArchiveEnabled,
      });
    }

    const rejectedEvaluations = await prisma.cjShopifyUsaProductEvaluation.findMany({
      where: {
        userId,
        decision: 'REJECTED',
        evaluatedAt: { lte: thresholdDate },
      },
      include: {
        product: {
          include: {
            listings: { select: { id: true, status: true, shopifyProductId: true } },
            orders: { select: { id: true } },
          },
        },
      },
      orderBy: { evaluatedAt: 'desc' },
      take: 500,
    });

    const seenRejectedProducts = new Set<number>();
    for (const evaluation of rejectedEvaluations) {
      if (seenRejectedProducts.has(evaluation.productId)) continue;
      seenRejectedProducts.add(evaluation.productId);
      const product = evaluation.product;
      const hasDependency = product.orders.length > 0 || product.listings.some((listing) =>
        listing.shopifyProductId || ACTIVE_OR_DEPENDENT_STATUSES.has(listing.status),
      );
      if (hasDependency) continue;
      candidates.push({
        listingId: null,
        productId: evaluation.productId,
        title: product.title,
        currentStatus: product.snapshotStatus,
        action: 'ARCHIVE_REJECTED',
        commercialClass: 'ARCHIVE_CANDIDATE',
        reason: `${thresholdDays}+ dias rechazado sin listing activo, Shopify ID ni ordenes.`,
        ageDays: daysSince(evaluation.evaluatedAt, now),
        orders30: 0,
        socialSuccess: 0,
        socialFailed: 0,
        hasShopifyId: false,
        safeToApply: settings.cleanupArchiveEnabled,
      });
    }

    return {
      thresholdDays,
      failedDraftGraceDays,
      candidates,
    };
  },
};
