import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { env } from '../../../config/env';
import logger from '../../../config/logger';
import { CJ_EBAY_ALERT_TYPE, CJ_EBAY_LISTING_STATUS, CJ_EBAY_ORDER_STATUS } from '../cj-ebay.constants';
import { cjEbayAlertsService } from './cj-ebay-alerts.service';
import { cjEbayCjCheckoutService } from './cj-ebay-cj-checkout.service';
import { cjEbayConfigService } from './cj-ebay-config.service';
import { cjEbayFulfillmentService } from './cj-ebay-fulfillment.service';
import { cjEbayListingService } from './cj-ebay-listing.service';
import { cjEbayOpportunityPipelineService } from './cj-ebay-opportunity-pipeline.service';
import { cjEbayOpportunityShortlistService } from './cj-ebay-opportunity-shortlist.service';
import { cjEbayOrderPollingService } from './cj-ebay-order-polling.service';
import { cjEbaySellingLimitsService } from './cj-ebay-selling-limits.service';
import { cjEbaySystemReadinessService } from './cj-ebay-system-readiness.service';
import { cjEbayTraceService } from './cj-ebay-trace.service';
import { cjEbayTrackingService } from './cj-ebay-tracking.service';

type AutomationMetrics = {
  discoveryRuns: number;
  candidatesChecked: number;
  draftsCreated: number;
  listingsPublished: number;
  listingsRejectedUs: number;
  ordersImported: number;
  ordersPlaced: number;
  ordersConfirmed: number;
  ordersPaid: number;
  trackingSynced: number;
  recoveriesRun: number;
  errorsCount: number;
  events: string[];
};

const locks = new Set<number>();
const timers = new Map<number, NodeJS.Timeout>();

function emptyMetrics(): AutomationMetrics {
  return {
    discoveryRuns: 0,
    candidatesChecked: 0,
    draftsCreated: 0,
    listingsPublished: 0,
    listingsRejectedUs: 0,
    ordersImported: 0,
    ordersPlaced: 0,
    ordersConfirmed: 0,
    ordersPaid: 0,
    trackingSynced: 0,
    recoveriesRun: 0,
    errorsCount: 0,
    events: [],
  };
}

function nextRunAt(intervalMinutes: number): Date {
  return new Date(Date.now() + Math.max(5, intervalMinutes) * 60 * 1000);
}

async function waitForDiscovery(runId: string, userId: number, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await cjEbayOpportunityShortlistService.getRunSummary(runId, userId);
    if (!run || run.status === 'COMPLETED' || run.status === 'FAILED') return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function getActiveUserIds(): Promise<number[]> {
  const settings = await prisma.cjEbayAccountSettings.findMany({
    where: { autopilotEnabled: true, autopilotState: 'RUNNING' },
    select: { userId: true },
  });
  return settings.map((s) => s.userId);
}

export const cjEbayAutopilotService = {
  async getStatus(userId: number) {
    const [settings, readiness, limits, lastRun, runningRun, traces] = await Promise.all([
      cjEbayConfigService.getOrCreateSettings(userId),
      cjEbaySystemReadinessService.evaluateForUser(userId),
      cjEbaySellingLimitsService.getMonthlySnapshot(userId),
      prisma.cjEbayAutomationRun.findFirst({ where: { userId }, orderBy: { startedAt: 'desc' } }),
      prisma.cjEbayAutomationRun.findFirst({ where: { userId, status: 'RUNNING' }, orderBy: { startedAt: 'desc' } }),
      prisma.cjEbayExecutionTrace.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return {
      status: runningRun ? 'RUNNING' : settings.autopilotState,
      running: Boolean(runningRun),
      paused: settings.autopilotState !== 'RUNNING',
      locked: locks.has(userId),
      readiness,
      sellingLimits: limits,
      config: {
        enabled: settings.autopilotEnabled,
        intervalMinutes: settings.autopilotIntervalMinutes,
        maxPublishPerRun: settings.maxPublishesPerRun,
        maxOrdersPerRun: settings.maxOrdersPerRun,
        requireQuota: true,
        requirePolicyClear: true,
        requireUsWarehouseOnly: settings.requireUsWarehouseOnly,
        autoPayCjOrders: settings.autoPayCjOrders,
        orderPollingLookbackHours: settings.orderPollingLookbackHours,
        minDataConfidenceScore: settings.minDataConfidenceScore,
        checkoutMode: settings.cjPostCreateCheckoutMode,
      },
      lastRun: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status,
            trigger: lastRun.trigger,
            startedAt: lastRun.startedAt.toISOString(),
            completedAt: lastRun.completedAt?.toISOString() ?? null,
            durationMs: lastRun.durationMs,
            metrics: {
              discoveryRuns: lastRun.discoveryRuns,
              candidatesChecked: lastRun.candidatesChecked,
              draftsCreated: lastRun.draftsCreated,
              listingsPublished: lastRun.listingsPublished,
              listingsRejectedUs: lastRun.listingsRejectedUs,
              ordersImported: lastRun.ordersImported,
              ordersPlaced: lastRun.ordersPlaced,
              ordersConfirmed: lastRun.ordersConfirmed,
              ordersPaid: lastRun.ordersPaid,
              trackingSynced: lastRun.trackingSynced,
              recoveriesRun: lastRun.recoveriesRun,
              errorsCount: lastRun.errorsCount,
            },
            lastError: lastRun.lastError,
            summary: lastRun.summary,
          }
        : null,
      nextRunAt: settings.autopilotNextRunAt,
      recentEvents: traces.map((t) => ({ id: t.id, step: t.step, message: t.message, createdAt: t.createdAt.toISOString() })),
    };
  },

  async configure(userId: number, body: Record<string, unknown>) {
    const settings = await cjEbayConfigService.updateSettings(userId, {
      autopilotEnabled: typeof body['enabled'] === 'boolean' ? body['enabled'] : undefined,
      autopilotIntervalMinutes: Number.isFinite(Number(body['intervalMinutes'])) ? Number(body['intervalMinutes']) : undefined,
      maxPublishesPerRun: Number.isFinite(Number(body['maxPublishPerRun'])) ? Number(body['maxPublishPerRun']) : undefined,
      maxOrdersPerRun: Number.isFinite(Number(body['maxOrdersPerRun'])) ? Number(body['maxOrdersPerRun']) : undefined,
      requireUsWarehouseOnly: typeof body['requireUsWarehouseOnly'] === 'boolean' ? body['requireUsWarehouseOnly'] : undefined,
      autoPayCjOrders: typeof body['autoPayCjOrders'] === 'boolean' ? body['autoPayCjOrders'] : undefined,
      orderPollingLookbackHours: Number.isFinite(Number(body['orderPollingLookbackHours'])) ? Number(body['orderPollingLookbackHours']) : undefined,
      minDataConfidenceScore: Number.isFinite(Number(body['minDataConfidenceScore'])) ? Number(body['minDataConfidenceScore']) : undefined,
    } as any);
    if (settings.autopilotEnabled && settings.autopilotState === 'RUNNING') this.schedule(userId, settings.autopilotIntervalMinutes);
    return settings;
  },

  async start(userId: number) {
    const settings = await cjEbayConfigService.updateSettings(userId, {
      autopilotEnabled: true,
      autopilotState: 'RUNNING',
      requireUsWarehouseOnly: true,
      cjPostCreateCheckoutMode: 'AUTO_CONFIRM_PAY',
      autoPayCjOrders: true,
    } as any);
    await prisma.cjEbayAccountSettings.update({
      where: { userId },
      data: { autopilotNextRunAt: nextRunAt(settings.autopilotIntervalMinutes) },
    });
    this.schedule(userId, settings.autopilotIntervalMinutes);
    return this.getStatus(userId);
  },

  async pause(userId: number) {
    this.unschedule(userId);
    await cjEbayConfigService.updateSettings(userId, { autopilotEnabled: false, autopilotState: 'PAUSED' } as any);
    return this.getStatus(userId);
  },

  async stop(userId: number) {
    this.unschedule(userId);
    await cjEbayConfigService.updateSettings(userId, { autopilotEnabled: false, autopilotState: 'STOPPED' } as any);
    return this.getStatus(userId);
  },

  async runNow(userId: number, trigger: 'MANUAL' | 'SCHEDULED' | 'SALES_AGENT' = 'MANUAL') {
    if (locks.has(userId)) {
      return { skipped: true, reason: 'LOCKED', ...(await this.getStatus(userId)) };
    }
    locks.add(userId);
    const startedAt = new Date();
    const metrics = emptyMetrics();
    await cjEbayConfigService.getOrCreateSettings(userId);
    const run = await prisma.cjEbayAutomationRun.create({
      data: { userId, trigger, status: 'RUNNING', lockKey: `cj-ebay-autopilot:${userId}` },
    });
    try {
      await cjEbayTraceService.record({
        userId,
        route: 'cj-ebay-autopilot',
        step: 'automation.run.start',
        message: 'automation.run.start',
        meta: { runId: run.id, trigger },
      });
      const settings = await cjEbayConfigService.getOrCreateSettings(userId);
      const readiness = await cjEbaySystemReadinessService.evaluateForUser(userId);
      if (!readiness.ready) {
        metrics.errorsCount++;
        metrics.events.push('Readiness incomplete; destructive steps skipped.');
      } else {
        await this.runDiscoveryAndPublish(userId, settings, metrics);
        await this.runOrderPolling(userId, settings, metrics);
        await this.runFulfillment(userId, settings, metrics);
        await this.runTracking(userId, settings, metrics);
        await this.runRecovery(userId, metrics);
      }

      const completedAt = new Date();
      await prisma.cjEbayAutomationRun.update({
        where: { id: run.id },
        data: {
          status: metrics.errorsCount > 0 ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED',
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          ...metricsToPrisma(metrics),
          summary: { events: metrics.events.slice(-50) } as Prisma.InputJsonValue,
        },
      });
      await prisma.cjEbayAccountSettings.update({
        where: { userId },
        data: { autopilotLastRunAt: completedAt, autopilotNextRunAt: nextRunAt(settings.autopilotIntervalMinutes) },
      });
      return { ok: true, runId: run.id, metrics };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      metrics.errorsCount++;
      await prisma.cjEbayAutomationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          ...metricsToPrisma(metrics),
          lastError: msg.slice(0, 2000),
          summary: { events: metrics.events.slice(-50) } as Prisma.InputJsonValue,
        },
      });
      await prisma.cjEbayAccountSettings.update({
        where: { userId },
        data: { autopilotState: 'ERROR', autopilotLastRunAt: new Date() },
      }).catch(() => {});
      throw e;
    } finally {
      locks.delete(userId);
    }
  },

  schedule(userId: number, intervalMinutes: number) {
    this.unschedule(userId);
    const ms = Math.max(5, intervalMinutes) * 60 * 1000;
    const timer = setInterval(() => {
      this.runNow(userId, 'SCHEDULED').catch((err) => {
        logger.warn('[cj-ebay-autopilot] scheduled run failed', { userId, error: err?.message });
      });
    }, ms);
    timer.unref?.();
    timers.set(userId, timer);
  },

  unschedule(userId: number) {
    const timer = timers.get(userId);
    if (timer) clearInterval(timer);
    timers.delete(userId);
  },

  async startIfEnabled(userId?: number) {
    const ids = userId != null ? [userId] : await getActiveUserIds();
    for (const id of ids) {
      const settings = await cjEbayConfigService.getOrCreateSettings(id);
      if (settings.autopilotEnabled && settings.autopilotState === 'RUNNING') {
        this.schedule(id, settings.autopilotIntervalMinutes);
      }
    }
    return { users: ids.length };
  },

  async runDiscoveryAndPublish(userId: number, settings: any, metrics: AutomationMetrics) {
    if (settings.maxPublishesPerRun <= 0 || env.BLOCK_NEW_PUBLICATIONS) {
      metrics.events.push(env.BLOCK_NEW_PUBLICATIONS ? 'Publish skipped by BLOCK_NEW_PUBLICATIONS.' : 'Publish skipped: maxPublishesPerRun=0.');
      return;
    }
    const limits = await cjEbaySellingLimitsService.getMonthlySnapshot(userId);
    if (limits.remainingListings !== null && limits.remainingListings <= 0) {
      metrics.events.push('Publish skipped: monthly listing quota exhausted.');
      return;
    }
    const discovery = await cjEbayOpportunityShortlistService.startDiscoveryRun(userId, { mode: 'STARTER' } as any);
    metrics.discoveryRuns++;
    await waitForDiscovery(discovery.runId, userId);
    const candidates = await cjEbayOpportunityShortlistService.getActiveRecommendations(userId);
    const eligible = candidates.filter((c) => {
      const confidence = Number(c.dataConfidenceScore ?? 0);
      return ['SHORTLISTED', 'APPROVED'].includes(c.status) && confidence >= settings.minDataConfidenceScore;
    });
    for (const candidate of eligible) {
      if (metrics.listingsPublished >= settings.maxPublishesPerRun) break;
      metrics.candidatesChecked++;
      try {
        const variantId = candidate.cjVariantSku;
        const out = await cjEbayOpportunityPipelineService.run({
          userId,
          body: { productId: candidate.cjProductId, variantId, quantity: 1, publish: true },
          route: 'cj-ebay-autopilot.publish',
        });
        if (out.listing) metrics.draftsCreated++;
        if (out.publish) {
          metrics.listingsPublished++;
          metrics.events.push(`Published ${candidate.cjProductTitle.slice(0, 80)}`);
        } else if (String(out.publishSkippedReason || '').includes('US_WAREHOUSE_REQUIRED')) {
          metrics.listingsRejectedUs++;
        } else if (out.publishSkippedReason) {
          metrics.events.push(`Publish skipped: ${out.publishSkippedReason}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/warehouse USA|US_WAREHOUSE_REQUIRED|origin=CN/i.test(msg)) metrics.listingsRejectedUs++;
        metrics.errorsCount++;
        metrics.events.push(`Publish candidate failed: ${msg.slice(0, 180)}`);
      }
    }
  },

  async runOrderPolling(userId: number, settings: any, metrics: AutomationMetrics) {
    const out = await cjEbayOrderPollingService.pollRecentOrders({
      userId,
      lookbackHours: settings.orderPollingLookbackHours,
      limit: settings.maxOrdersPerRun,
      route: 'cj-ebay-autopilot.order-poll',
    });
    metrics.ordersImported += out.imported;
    metrics.events.push(`Order poll checked=${out.checked}, imported=${out.imported}, mapped=${out.mapped}`);
  },

  async runFulfillment(userId: number, settings: any, metrics: AutomationMetrics) {
    if (!settings.autoPayCjOrders) {
      metrics.events.push('CJ auto-pay disabled; fulfillment payment skipped.');
      return;
    }
    const orders = await prisma.cjEbayOrder.findMany({
      where: {
        userId,
        status: { in: [CJ_EBAY_ORDER_STATUS.VALIDATED, CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED, CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMED, CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING] },
      },
      orderBy: { createdAt: 'asc' },
      take: settings.maxOrdersPerRun,
    });
    for (const order of orders) {
      try {
        if (order.status === CJ_EBAY_ORDER_STATUS.VALIDATED) {
          const placed = await cjEbayFulfillmentService.placeCjOrder({ userId, orderId: order.id, route: 'cj-ebay-autopilot.fulfillment' });
          if (placed.cjOrderId) metrics.ordersPlaced++;
        }
        const refreshed = await prisma.cjEbayOrder.findUnique({ where: { id: order.id } });
        if (!refreshed) continue;
        if (refreshed.status === CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED) {
          await cjEbayCjCheckoutService.confirmCjOrder({ userId, orderId: order.id, route: 'cj-ebay-autopilot.fulfillment' });
          metrics.ordersConfirmed++;
        }
        const afterConfirm = await prisma.cjEbayOrder.findUnique({ where: { id: order.id } });
        if (afterConfirm && [CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMED, CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING].includes(afterConfirm.status as any)) {
          await cjEbayCjCheckoutService.payCjOrder({ userId, orderId: order.id, route: 'cj-ebay-autopilot.fulfillment' });
          metrics.ordersPaid++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        metrics.errorsCount++;
        metrics.events.push(`Fulfillment failed for ${order.ebayOrderId}: ${msg.slice(0, 160)}`);
        await cjEbayAlertsService.create({
          userId,
          type: CJ_EBAY_ALERT_TYPE.ORDER_FAILED,
          severity: 'error',
          payload: { orderId: order.id, ebayOrderId: order.ebayOrderId, message: msg.slice(0, 500) },
        }).catch(() => {});
      }
    }
  },

  async runTracking(userId: number, settings: any, metrics: AutomationMetrics) {
    const orders = await prisma.cjEbayOrder.findMany({
      where: { userId, cjOrderId: { not: null }, status: { in: [CJ_EBAY_ORDER_STATUS.CJ_FULFILLING, CJ_EBAY_ORDER_STATUS.CJ_SHIPPED, CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_COMPLETED] } },
      orderBy: { updatedAt: 'asc' },
      take: settings.maxOrdersPerRun,
    });
    for (const order of orders) {
      try {
        const out = await cjEbayTrackingService.syncFromCj({ userId, orderId: order.id, route: 'cj-ebay-autopilot.tracking' });
        if (out.submittedToEbay) metrics.trackingSynced++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        metrics.errorsCount++;
        metrics.events.push(`Tracking sync failed for ${order.ebayOrderId}: ${msg.slice(0, 160)}`);
      }
    }
  },

  async runRecovery(userId: number, metrics: AutomationMetrics) {
    const pending = await prisma.cjEbayListing.findMany({
      where: {
        userId,
        status: { in: [CJ_EBAY_LISTING_STATUS.OFFER_ALREADY_EXISTS, CJ_EBAY_LISTING_STATUS.RECONCILE_PENDING] },
        OR: [{ reconcileRetryAfter: null }, { reconcileRetryAfter: { lte: new Date() } }],
      },
      take: 5,
    });
    for (const listing of pending) {
      try {
        await cjEbayListingService.reconcile({ userId, listingDbId: listing.id, route: 'cj-ebay-autopilot.recovery' });
        metrics.recoveriesRun++;
      } catch (e) {
        metrics.errorsCount++;
      }
    }
  },
};

function metricsToPrisma(metrics: AutomationMetrics) {
  return {
    discoveryRuns: metrics.discoveryRuns,
    candidatesChecked: metrics.candidatesChecked,
    draftsCreated: metrics.draftsCreated,
    listingsPublished: metrics.listingsPublished,
    listingsRejectedUs: metrics.listingsRejectedUs,
    ordersImported: metrics.ordersImported,
    ordersPlaced: metrics.ordersPlaced,
    ordersConfirmed: metrics.ordersConfirmed,
    ordersPaid: metrics.ordersPaid,
    trackingSynced: metrics.trackingSynced,
    recoveriesRun: metrics.recoveriesRun,
    errorsCount: metrics.errorsCount,
  };
}
