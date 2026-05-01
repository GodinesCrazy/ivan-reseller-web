/**
 * CJ→Shopify USA Automation Service
 * Runs a configurable recurring cycle that:
 *   1. Discovers trending pet products from CJ catalog
 *   2. Evaluates each against pricing/margin rules
 *   3. Creates drafts for approved products
 *   4. Publishes them to the Shopify store
 *   5. Logs cycle results and updates state
 */

import { prisma } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service.js';
import { cjShopifyUsaPublishService } from './cj-shopify-usa-publish.service.js';
import { cjShopifyUsaQualificationService } from './cj-shopify-usa-qualification.service.js';
import { isCjShopifyUsaPetProduct, resolveMaxSellPriceUsd } from './cj-shopify-usa-policy.service.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type AutomationState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'ERROR';

export interface AutomationConfig {
  intervalHours: number;          // How often to run (default 3h)
  maxDailyPublish: number;        // Max articles published per day (default 200)
  maxPerCycle: number;            // Max per single cycle (default 40)
  minMarginPct: number;           // Min margin to auto-publish (default 15%)
  categories: string[];           // CJ category filters
  autoPublish: boolean;           // Auto-publish or just draft
  enabled: boolean;
}

export interface CycleEvent {
  ts: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface CycleResult {
  cycleId: string;
  startedAt: string;
  finishedAt?: string;
  duration?: number;              // ms
  productsScanned: number;
  productsApproved: number;
  draftsCreated: number;
  published: number;
  skipped: number;
  errors: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  events: CycleEvent[];
}

interface DiscoveryStats {
  searchedKeywords: number;
  itemsSeen: number;
  petMatches: number;
  productsUpserted: number;
  variantsUpserted: number;
  evaluationsCreated: number;
  approved: number;
  rejected: number;
  skippedExistingRecent: number;
  skippedNoStock: number;
  errors: number;
}

// ── Singleton state ────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AutomationConfig = {
  intervalHours: 2,
  maxDailyPublish: 500,
  maxPerCycle: 80,
  minMarginPct: 12,
  categories: [
    'pet supplies', 'dog accessories', 'cat accessories',
    'pet grooming', 'pet toys', 'pet beds', 'pet clothing',
    'pet carriers', 'pet bowls', 'pet collars', 'pet harness',
    'pet training', 'pet health', 'aquarium', 'bird supplies',
  ],
  autoPublish: true,
  enabled: false,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

const DISCOVERY_SEARCHES_PER_CYCLE = clampInt(
  process.env.CJ_SHOPIFY_USA_DISCOVERY_SEARCHES_PER_CYCLE,
  3,
  25,
  12,
);

const DISCOVERY_PAGE_SIZE = clampInt(
  process.env.CJ_SHOPIFY_USA_DISCOVERY_PAGE_SIZE,
  10,
  50,
  30,
);

const DISCOVERY_REEVALUATE_HOURS = clampInt(
  process.env.CJ_SHOPIFY_USA_DISCOVERY_REEVALUATE_HOURS,
  6,
  168,
  24,
);

const DISCOVERY_MAX_ENRICH_PER_CYCLE = clampInt(
  process.env.CJ_SHOPIFY_USA_DISCOVERY_MAX_ENRICH_PER_CYCLE,
  10,
  120,
  25,
);

const DISCOVERY_REQUEST_TIMEOUT_MS = clampInt(
  process.env.CJ_SHOPIFY_USA_DISCOVERY_REQUEST_TIMEOUT_MS,
  5_000,
  60_000,
  20_000,
);

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function cycleToResponse(row: {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  productsScanned: number;
  productsApproved: number;
  draftsCreated: number;
  published: number;
  skipped: number;
  errors: number;
  status: string;
  events: unknown;
}): CycleResult {
  return {
    cycleId: row.id,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString(),
    duration: row.durationMs ?? undefined,
    productsScanned: row.productsScanned,
    productsApproved: row.productsApproved,
    draftsCreated: row.draftsCreated,
    published: row.published,
    skipped: row.skipped,
    errors: row.errors,
    status: ['RUNNING', 'COMPLETED', 'FAILED', 'ABORTED'].includes(row.status)
      ? row.status as CycleResult['status']
      : 'FAILED',
    events: Array.isArray(row.events) ? row.events as CycleEvent[] : [],
  };
}

class CjShopifyUsaAutomationService {
  private state: AutomationState = 'IDLE';
  private config: AutomationConfig = { ...DEFAULT_CONFIG };
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentCycle: CycleResult | null = null;
  private cycleHistory: CycleResult[] = [];   // Keep last 20
  private dailyPublishCount = 0;
  private dailyCountDate = '';
  private lastRunAt: Date | null = null;
  private nextRunAt: Date | null = null;
  private abortSignal = false;

  // ── Public API ─────────────────────────────────────────────────────────

  private configFromSettings(settings: Awaited<ReturnType<typeof cjShopifyUsaConfigService.getOrCreateSettings>>): AutomationConfig {
    return {
      intervalHours: clampInt(settings.automationIntervalHours, 1, 24, DEFAULT_CONFIG.intervalHours),
      maxDailyPublish: clampInt(settings.automationMaxDailyPublish, 1, 500, DEFAULT_CONFIG.maxDailyPublish),
      maxPerCycle: clampInt(settings.automationMaxPerCycle, 1, 100, DEFAULT_CONFIG.maxPerCycle),
      minMarginPct: Math.max(0, Math.min(100, Number(settings.automationMinMarginPct ?? settings.minMarginPct ?? DEFAULT_CONFIG.minMarginPct))),
      categories: DEFAULT_CONFIG.categories,
      autoPublish: Boolean(settings.automationAutoPublish),
      enabled: Boolean(settings.automationEnabled),
    };
  }

  private async loadPersistedState(userId: number) {
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    this.config = this.configFromSettings(settings);
    this.dailyPublishCount = clampInt(settings.automationDailyPublishCount, 0, 10_000, 0);
    this.dailyCountDate = settings.automationDailyCountDate ?? '';
    this.lastRunAt = settings.automationLastRunAt ?? null;
    this.nextRunAt = this.timer ? this.nextRunAt : settings.automationNextRunAt ?? null;
    if (this.state !== 'RUNNING' && this.state !== 'PAUSED') {
      this.state = settings.automationState === 'PAUSED'
        ? 'PAUSED'
        : settings.automationEnabled
          ? 'RUNNING'
          : settings.automationState === 'ERROR'
            ? 'ERROR'
            : 'IDLE';
    }
  }

  private ensureScheduler(userId: number) {
    if (!this.config.enabled || this.state !== 'RUNNING' || this.timer) return;
    const shouldRunNow = !this.nextRunAt || this.nextRunAt.getTime() <= Date.now() + 5_000;
    this.schedule(userId);
    if (shouldRunNow) {
      void this.runCycle(userId);
    }
  }

  private async persistRuntime(userId: number, patch: Record<string, unknown> = {}) {
    await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    await prisma.cjShopifyUsaAccountSettings.update({
      where: { userId },
      data: {
        automationEnabled: this.config.enabled,
        automationState: this.state,
        automationIntervalHours: this.config.intervalHours,
        automationMaxDailyPublish: this.config.maxDailyPublish,
        automationMaxPerCycle: this.config.maxPerCycle,
        automationMinMarginPct: this.config.minMarginPct,
        automationAutoPublish: this.config.autoPublish,
        automationDailyPublishCount: this.dailyPublishCount,
        automationDailyCountDate: this.dailyCountDate || null,
        automationLastRunAt: this.lastRunAt,
        automationNextRunAt: this.nextRunAt,
        ...patch,
      },
    });
  }

  private async persistCycle(userId: number, cycle: CycleResult) {
    await prisma.cjShopifyUsaAutomationCycle.upsert({
      where: { id: cycle.cycleId },
      create: {
        id: cycle.cycleId,
        userId,
        status: cycle.status,
        startedAt: new Date(cycle.startedAt),
        finishedAt: cycle.finishedAt ? new Date(cycle.finishedAt) : null,
        durationMs: cycle.duration ?? null,
        productsScanned: cycle.productsScanned,
        productsApproved: cycle.productsApproved,
        draftsCreated: cycle.draftsCreated,
        published: cycle.published,
        skipped: cycle.skipped,
        errors: cycle.errors,
        events: cycle.events as any,
      },
      update: {
        status: cycle.status,
        finishedAt: cycle.finishedAt ? new Date(cycle.finishedAt) : null,
        durationMs: cycle.duration ?? null,
        productsScanned: cycle.productsScanned,
        productsApproved: cycle.productsApproved,
        draftsCreated: cycle.draftsCreated,
        published: cycle.published,
        skipped: cycle.skipped,
        errors: cycle.errors,
        events: cycle.events as any,
      },
    });
  }

  async getStatus(userId?: number) {
    let persistedHistory: CycleResult[] = [];
    if (userId) {
      await this.loadPersistedState(userId);
      this.ensureScheduler(userId);
      const rows = await prisma.cjShopifyUsaAutomationCycle.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: 10,
      });
      persistedHistory = rows.reverse().map(cycleToResponse);
    }
    return {
      state: this.state,
      config: this.config,
      currentCycle: this.currentCycle,
      lastRunAt: this.lastRunAt?.toISOString() ?? null,
      nextRunAt: this.nextRunAt?.toISOString() ?? null,
      dailyPublishCount: this.dailyPublishCount,
      cycleHistory: this.cycleHistory.length > 0 ? this.cycleHistory.slice(-10) : persistedHistory,
    };
  }

  async updateConfig(userId: number, patch: Partial<AutomationConfig>) {
    await this.loadPersistedState(userId);
    this.config = {
      ...this.config,
      ...patch,
      intervalHours: clampInt(patch.intervalHours ?? this.config.intervalHours, 1, 24, this.config.intervalHours),
      maxDailyPublish: clampInt(patch.maxDailyPublish ?? this.config.maxDailyPublish, 1, 500, this.config.maxDailyPublish),
      maxPerCycle: clampInt(patch.maxPerCycle ?? this.config.maxPerCycle, 1, 100, this.config.maxPerCycle),
      minMarginPct: Math.max(0, Math.min(100, Number(patch.minMarginPct ?? this.config.minMarginPct))),
      autoPublish: typeof patch.autoPublish === 'boolean' ? patch.autoPublish : this.config.autoPublish,
      enabled: this.config.enabled,
    };
    // If running, reschedule with new interval
    if (this.state === 'RUNNING' && 'intervalHours' in patch) {
      this.schedule(userId);
    }
    await this.persistRuntime(userId);
    return this.config;
  }

  async start(userId: number) {
    await this.loadPersistedState(userId);
    if (this.state === 'RUNNING') return this.getStatus(userId);
    this.config.enabled = true;
    this.abortSignal = false;
    this.state = 'RUNNING';
    this.schedule(userId);
    await this.persistRuntime(userId);
    // Fire first cycle immediately
    void this.runCycle(userId);
    return this.getStatus(userId);
  }

  async runNow(userId: number) {
    await this.loadPersistedState(userId);
    this.config.enabled = true;
    this.abortSignal = false;
    if (this.state !== 'RUNNING') {
      this.state = 'RUNNING';
      this.schedule(userId);
      await this.persistRuntime(userId);
    }
    void this.runCycle(userId);
    return this.getStatus(userId);
  }

  async pause(userId: number) {
    if (this.state !== 'RUNNING') return this.getStatus(userId);
    this.state = 'PAUSED';
    this.abortSignal = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.nextRunAt = null;
    this.config.enabled = true;
    await this.persistRuntime(userId);
    return this.getStatus(userId);
  }

  async stop(userId: number) {
    this.state = 'IDLE';
    this.config.enabled = false;
    this.abortSignal = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.nextRunAt = null;
    if (this.currentCycle && this.currentCycle.status === 'RUNNING') {
      this.currentCycle.status = 'ABORTED';
      this.currentCycle.finishedAt = new Date().toISOString();
      this.pushHistory(this.currentCycle);
      await this.persistCycle(userId, this.currentCycle);
      this.currentCycle = null;
    }
    await this.persistRuntime(userId);
    return this.getStatus(userId);
  }

  async resume(userId: number) {
    await this.loadPersistedState(userId);
    if (this.state !== 'PAUSED') return this.getStatus(userId);
    this.state = 'RUNNING';
    this.config.enabled = true;
    this.abortSignal = false;
    this.schedule(userId);
    await this.persistRuntime(userId);
    void this.runCycle(userId);
    return this.getStatus(userId);
  }

  async startIfEnabled(userId: number) {
    await this.loadPersistedState(userId);
    if (!this.config.enabled || this.state === 'PAUSED') return this.getStatus(userId);
    this.state = 'RUNNING';
    this.abortSignal = false;
    this.schedule(userId);
    await this.persistRuntime(userId);
    void this.runCycle(userId);
    return this.getStatus(userId);
  }

  // ── Scheduling ─────────────────────────────────────────────────────────

  private schedule(userId: number) {
    if (this.timer) clearInterval(this.timer);
    const ms = this.config.intervalHours * 60 * 60 * 1000;
    this.timer = setInterval(() => void this.runCycle(userId), ms);
    this.nextRunAt = new Date(Date.now() + ms);
  }

  private reschedule() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    // Will be re-scheduled at next opportunity
  }

  // ── Cycle runner ───────────────────────────────────────────────────────

  private async runCycle(userId: number) {
    if (this.currentCycle?.status === 'RUNNING') return; // Already running
    if (this.state !== 'RUNNING') return;

    const cycleId = `cycle-${Date.now()}`;
    const events: CycleEvent[] = [];

    const log = (level: CycleEvent['level'], message: string) => {
      events.push({ ts: new Date().toISOString(), level, message });
    };

    const cycle: CycleResult = {
      cycleId,
      startedAt: new Date().toISOString(),
      productsScanned: 0,
      productsApproved: 0,
      draftsCreated: 0,
      published: 0,
      skipped: 0,
      errors: 0,
      status: 'RUNNING',
      events,
    };
    this.currentCycle = cycle;
    this.abortSignal = false;
    await this.persistCycle(userId, cycle);

    try {
      log('info', `Cycle ${cycleId} started — checking daily limits`);

      // Reset daily counter if new day
      const today = new Date().toISOString().slice(0, 10);
      if (this.dailyCountDate !== today) {
        this.dailyPublishCount = 0;
        this.dailyCountDate = today;
        log('info', `Daily counter reset for ${today}`);
      }

      const remainingToday = this.config.maxDailyPublish - this.dailyPublishCount;
      if (remainingToday <= 0) {
        log('warn', `Daily limit reached (${this.config.maxDailyPublish}). Skipping cycle.`);
        cycle.status = 'COMPLETED';
        cycle.finishedAt = new Date().toISOString();
        this.lastRunAt = new Date();
        return;
      }

      const perCycleLimit = Math.min(this.config.maxPerCycle, remainingToday);
      log('info', `Will publish up to ${perCycleLimit} products this cycle (${remainingToday} remaining today)`);

      // ── Step 0: CJ Discovery — search for new pet products ──
      log('info', 'Step 0: Discovering new CJ pet products...');
      try {
        const discovery = await this.discoverNewPetProducts(userId, log);
        log(
          'info',
          `Discovery enriched ${discovery.productsUpserted} pet products / ${discovery.variantsUpserted} variants from ${discovery.itemsSeen} CJ results; ` +
            `${discovery.approved} approved, ${discovery.rejected} rejected, ${discovery.skippedNoStock} without stock.`,
        );
      } catch (err) {
        log('warn', `Discovery step failed (non-blocking): ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
      }

      // ── Step 0.5: Retry blocked orders (Insufficient Funds) ──
      log('info', 'Step 0.5: Checking for blocked orders (SUPPLIER_PAYMENT_BLOCKED)...');
      try {
        const blockedOrders = await prisma.cjShopifyUsaOrder.findMany({
          where: { userId, status: 'SUPPLIER_PAYMENT_BLOCKED' },
          orderBy: { createdAt: 'asc' },
          take: 10,
        });

        if (blockedOrders.length > 0) {
          log('info', `Found ${blockedOrders.length} blocked orders. Attempting to re-process...`);
          const { cjShopifyUsaOrderIngestService } = await import('./cj-shopify-usa-order-ingest.service');
          
          let retrySuccess = 0;
          for (const order of blockedOrders) {
            try {
              log('info', `Retrying order ${order.shopifyOrderId}...`);
              const res = await cjShopifyUsaOrderIngestService.processOrder({ userId, orderId: order.id });
              if (res.status === 'CJ_ORDER_PLACED') {
                retrySuccess++;
                log('success', `Successfully recovered order ${order.shopifyOrderId} -> CJ Order: ${res.cjOrderId}`);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              log('warn', `Retry failed for ${order.shopifyOrderId}: ${msg.slice(0, 80)}`);
              // If it's a balance issue, stop trying the rest in this cycle to avoid API spam
              if (msg.toLowerCase().includes('balance') || msg.toLowerCase().includes('payment')) {
                log('warn', 'Balance is still insufficient. Aborting retry queue for this cycle.');
                break;
              }
            }
            await new Promise((r) => setTimeout(r, 1000));
          }
          if (retrySuccess > 0) {
            log('success', `Recovered ${retrySuccess} blocked orders in this cycle.`);
          }
        }
      } catch (err) {
        log('warn', `Retry queue step failed: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
      }

      // ── Step 0.8: Sync active listing prices (Phase 4) ──
      log('info', 'Step 0.8: Syncing prices for active listings...');
      try {
        await this.syncActiveListingPrices(userId, log);
      } catch (err) {
        log('warn', `Price sync step failed: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
      }

      // ── Step 1: Find products with APPROVED evaluation and no active listing ──
      log('info', 'Scanning approved CJ products database...');

      const settings = await cjShopifyUsaConfigService.getConfigSnapshot(userId);
      const minMarginFromSettings = Number(settings.settings?.minMarginPct ?? this.config.minMarginPct);
      const maxSellPriceUsd = resolveMaxSellPriceUsd(settings.settings?.maxSellPriceUsd);

      // Products with at least one APPROVED evaluation
      const approvedEvaluations = await prisma.cjShopifyUsaProductEvaluation.findMany({
        where: {
          userId,
          decision: 'APPROVED',
          estimatedMarginPct: { gte: minMarginFromSettings },
        },
        include: {
          product: {
            include: {
              variants: {
                where: {
                  unitCostUsd: { gt: 0 },
                  stockLastKnown: { gt: 0 },
                },
                orderBy: [
                  { stockLastKnown: 'desc' },
                  { id: 'asc' },
                ],
                take: 10,
              },
              listings: {
                where: { userId },
                select: { id: true, status: true },
              },
            },
          },
        },
        orderBy: { estimatedMarginPct: 'desc' },
        take: 1000,
      });

      cycle.productsScanned = approvedEvaluations.length;
      log('info', `Found ${approvedEvaluations.length} approved evaluations ≥ ${minMarginFromSettings}% margin`);

      if (this.abortSignal) { cycle.status = 'ABORTED'; return; }

      // ── Step 2: Filter — pet products only + no active/duplicate listing ──
      const BUSY_STATUSES = ['ACTIVE', 'DRAFT', 'PUBLISHING', 'RECONCILE_PENDING'];

      const candidates = approvedEvaluations.filter((ev) => {
        // Must be a pet product
        if (!isCjShopifyUsaPetProduct({ title: ev.product.title })) return false;
        // Must not already have an active/draft listing (duplicate guard)
        const hasActiveListing = ev.product.listings.some((l) =>
          BUSY_STATUSES.includes(l.status),
        );
        return !hasActiveListing && ev.product.variants.some((variant) =>
          Number(variant.unitCostUsd ?? 0) > 0 &&
          Number(variant.stockLastKnown ?? 0) > 0,
        );
      });

      // De-duplicate by productId (keep highest margin evaluation per product)
      const seen = new Set<number>();
      const uniqueCandidates = candidates.filter((ev) => {
        if (seen.has(ev.product.id)) return false;
        seen.add(ev.product.id);
        return true;
      });
      if (approvedEvaluations.length > uniqueCandidates.length) {
        log('info', `Filtered: ${approvedEvaluations.length - uniqueCandidates.length} excluded (non-pet or already listed)`);
      }

      cycle.productsApproved = uniqueCandidates.length;
      log('info', `${uniqueCandidates.length} unique products ready to publish`);

      if (uniqueCandidates.length === 0) {
        log('warn', 'No new candidates. Run a discovery scan to find more products.');
        cycle.status = 'COMPLETED';
        cycle.finishedAt = new Date().toISOString();
        this.lastRunAt = new Date();
        return;
      }

      // ── Step 2.5: Publish existing DRAFT listings (backlog) ──
      log('info', 'Step 2.5: Publishing existing DRAFT listings backlog...');
      try {
        const draftBacklog = await prisma.cjShopifyUsaListing.findMany({
          where: { userId, status: 'DRAFT', draftPayload: { not: {} } },
          orderBy: { updatedAt: 'desc' },
          take: Math.min(perCycleLimit, 20),
          select: { id: true, draftPayload: true },
        });
        if (draftBacklog.length > 0) {
          log('info', `Found ${draftBacklog.length} DRAFT listings to publish from backlog`);
          let backlogPublished = 0;
          for (const draft of draftBacklog) {
            if (this.abortSignal) break;
            if (this.dailyPublishCount >= this.config.maxDailyPublish) break;
            try {
              await cjShopifyUsaPublishService.publishListing({ userId, listingId: draft.id });
              backlogPublished++;
              this.dailyPublishCount++;
              cycle.published++;
              log('success', `Backlog published listing ${draft.id}`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              log('warn', `Backlog listing ${draft.id} failed: ${msg.slice(0, 80)}`);
            }
            await new Promise((r) => setTimeout(r, 6000));
          }
          log('info', `Backlog step done: ${backlogPublished} published`);
        } else {
          log('info', 'No DRAFT backlog to process');
        }
      } catch (err) {
        log('warn', `Backlog publish step failed: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
      }

      // ── Step 3: Take top N by margin ──
      const remainingSlots = Math.min(this.config.maxPerCycle, this.config.maxDailyPublish - this.dailyPublishCount);
      const toProcess = uniqueCandidates.slice(0, remainingSlots);
      log('info', `Processing top ${toProcess.length} new products this cycle`);

      // ── Step 4: Create drafts + optionally publish ──
      for (const ev of toProcess) {
        if (this.abortSignal) { log('warn', 'Cycle aborted by user'); break; }

        const product = ev.product;
        const firstVariant = product.variants[0];
        if (!firstVariant) { cycle.skipped++; continue; }

        try {
          log('info', `Creating draft: ${product.title?.slice(0, 50) ?? product.cjProductId}`);

          const listing = await cjShopifyUsaPublishService.buildDraft({
            userId,
            productId: product.id,
            variantId: firstVariant.id,
            preferredShippingQuoteId: ev.shippingQuoteId ?? null,
          });

          // ── Step 4b: Auto-draft sibling variants for multi-variant publishing ──
          // Load ALL variants for this product and create sibling drafts
          const allVariants = await prisma.cjShopifyUsaProductVariant.findMany({
            where: { productId: product.id },
            orderBy: { id: 'asc' },
          });
          let siblingsDrafted = 0;
          for (const sibVar of allVariants) {
            if (sibVar.id === firstVariant.id) continue;
            if (Number(sibVar.unitCostUsd ?? 0) <= 0) continue;
            if (Number(sibVar.stockLastKnown ?? 0) < 1) continue;
            try {
              await cjShopifyUsaPublishService.buildDraft({
                userId,
                productId: product.id,
                variantId: sibVar.id,
                quantity: 1,
              });
              siblingsDrafted++;
            } catch {
              // Sibling draft failure is non-blocking
            }
          }
          if (siblingsDrafted > 0) {
            log('info', `Auto-drafted ${siblingsDrafted} sibling variants for multi-variant publishing`);
          }

          cycle.draftsCreated++;
          log('success', `Draft created: listing #${listing.id}`);

          // ── Step 5: Auto-publish if configured ──
          if (this.config.autoPublish) {
            const published = await cjShopifyUsaPublishService.publishListing({ userId, listingId: listing.id });
            cycle.published++;
            this.dailyPublishCount++;
            log('success', `Published: ${product.title?.slice(0, 40) ?? product.cjProductId} — daily total: ${this.dailyPublishCount}`);

            // ── Step 6: Assign to pet collections ──
            if (published.shopifyProductId) {
              await this.assignToCollections(userId, published.shopifyProductId, product.title ?? '');
            }

            // ── Step 7: Expand variants (safety net for products with unpublished variants) ──
            try {
              const expandResult = await cjShopifyUsaPublishService.expandProductVariants({ userId, listingId: listing.id });
              if (expandResult.expanded > 0) {
                log('success', `Expanded: +${expandResult.expanded} variants for ${product.title?.slice(0, 40)}`);
              }
            } catch {
              // Expand failure is non-blocking — product is already published
            }
          }

          // Small delay to avoid API rate limits
          await new Promise((r) => setTimeout(r, 800));

        } catch (err) {
          cycle.errors++;
          const msg = err instanceof Error ? err.message : String(err);
          log('error', `Failed for ${product.cjProductId}: ${msg.slice(0, 260)}`);
        }
      }

      cycle.status = 'COMPLETED';
      log('success', `Cycle complete — ${cycle.published} published, ${cycle.errors} errors, ${cycle.skipped} skipped`);

    } catch (err) {
      cycle.status = 'FAILED';
      const msg = err instanceof Error ? err.message : String(err);
      log('error', `Cycle failed: ${msg}`);
      this.state = 'ERROR';
    } finally {
      cycle.finishedAt = new Date().toISOString();
      cycle.duration = Date.now() - new Date(cycle.startedAt).getTime();
      this.lastRunAt = new Date();

      const nextMs = this.config.intervalHours * 60 * 60 * 1000;
      if (this.state === 'RUNNING') {
        this.nextRunAt = new Date(Date.now() + nextMs);
      }

      this.pushHistory(cycle);
      await this.persistCycle(userId, cycle);
      await this.persistRuntime(userId);
      this.currentCycle = null;
    }
  }

  private pushHistory(cycle: CycleResult) {
    this.cycleHistory.push(cycle);
    if (this.cycleHistory.length > 20) this.cycleHistory.shift();
  }

  // ── CJ Discovery — searches for new pet products and evaluates them ────

  private CJ_PET_SEARCHES = [
    'dog collar', 'cat toy', 'pet grooming', 'dog leash', 'cat bed',
    'pet carrier', 'dog treat', 'cat feeder', 'pet bowl', 'dog harness',
    'cat scratching post', 'dog clothes', 'pet cage', 'dog training',
    'cat litter box', 'pet brush', 'dog bag', 'cat tunnel',
    'dog boots', 'pet stroller', 'rabbit cage', 'bird cage',
    'dog nail trimmer', 'cat water fountain', 'pet seat belt',
    'dog puzzle toy', 'cat tree', 'dog orthopedic bed', 'pet camera',
    'dog shampoo', 'cat shampoo', 'dog clicker', 'pet first aid',
    'cat collar', 'dog life jacket', 'pet blanket', 'dog car seat',
    'cat harness', 'dog agility', 'pet dental', 'dog cooling mat',
    'cat window perch', 'dog slow feeder', 'pet gate', 'dog playpen',
    'aquarium fish', 'fish tank', 'hamster cage', 'bird toy',
    'reptile supplies', 'small animal bedding', 'pet deodorizer',
    'dog toy', 'dog bed', 'cat collar', 'cat brush', 'pet hair remover',
    'dog toothbrush', 'cat nail clipper', 'dog raincoat', 'dog sweater',
    'cat interactive toy', 'dog chew toy', 'pet water fountain',
    'dog poop bag', 'dog waste bag', 'pet travel bottle', 'dog car harness',
    'pet car seat cover', 'cat litter mat', 'dog training pad',
    'puppy training pads', 'dog muzzle', 'pet stairs', 'pet ramp',
    'dog backpack', 'cat backpack carrier', 'pet sling carrier',
    'dog grooming glove', 'cat grooming glove', 'pet massage brush',
    'dog toothbrush toy', 'pet nail grinder', 'dog paw cleaner',
    'dog booties', 'dog bandana', 'cat hammock', 'cat bed cave',
    'cat toy ball', 'cat teaser wand', 'cat laser toy', 'cat food mat',
    'dog placemat', 'pet food storage', 'dog treat pouch',
    'pet first aid kit', 'dog seat belt', 'dog life vest',
    'dog cooling vest', 'dog winter coat', 'dog hoodie', 'pet costume',
    'bird feeder', 'bird perch', 'bird swing', 'hamster wheel',
    'hamster water bottle', 'rabbit feeder', 'rabbit litter box',
    'guinea pig bed', 'small pet carrier', 'aquarium filter',
    'aquarium decoration', 'fish feeder', 'reptile heat lamp',
    'reptile hide', 'turtle basking platform',
  ];

  private CJ_PET_KW = [
    'pet','dog','cat','puppy','kitten','paw','leash','harness',
    'grooming','collar','treat','chew','bowl','feeder','litter','catnip',
    'hamster','bird','nail','brush','comb','scissors','coat','sweater',
    'toy','fur','kennel','carrier','crate','cage','rabbit','bunny',
    'aquarium','fish','reptile','turtle','guinea pig','ferret',
    'dental','shampoo','flea','tick','dewormer','vitamin',
    'training','clicker','agility','playpen','gate','fence',
    'cooling','heating','blanket','cushion','orthopedic',
    'fountain','dispenser','automatic','slow feeder',
    'scratch','tunnel','perch','tree','climbing',
  ];
  private isPetProduct(title: string) {
    const t = title.toLowerCase();
    return this.CJ_PET_KW.some(k => t.includes(k));
  }

  private async discoverNewPetProducts(
    userId: number,
    log?: (level: CycleEvent['level'], message: string) => void,
  ): Promise<DiscoveryStats> {
    const stats: DiscoveryStats = {
      searchedKeywords: 0,
      itemsSeen: 0,
      petMatches: 0,
      productsUpserted: 0,
      variantsUpserted: 0,
      evaluationsCreated: 0,
      approved: 0,
      rejected: 0,
      skippedExistingRecent: 0,
      skippedNoStock: 0,
      errors: 0,
    };
    if (!env.CJ_API_KEY) return stats;

    const { createCjSupplierAdapter } = await import('./../../cj-ebay/adapters/cj-supplier.adapter.js');
    const adapter = createCjSupplierAdapter(userId);
    const userSettings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const minStock = Math.max(1, Number(userSettings.minStock ?? 1));
    const fallbackShippingUsd = Number(userSettings.maxShippingUsd ?? 8.50);
    const reevalAfter = Date.now() - DISCOVERY_REEVALUATE_HOURS * 60 * 60 * 1000;

    const arr = [...this.CJ_PET_SEARCHES];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const shuffled = arr.slice(0, DISCOVERY_SEARCHES_PER_CYCLE);

    for (const query of shuffled) {
      if (stats.productsUpserted >= DISCOVERY_MAX_ENRICH_PER_CYCLE) {
        log?.('info', `Discovery enrichment cap reached (${DISCOVERY_MAX_ENRICH_PER_CYCLE}); moving to publishing scan.`);
        break;
      }
      try {
        const items = await withTimeout(
          adapter.searchProducts({ keyword: query, page: 1, pageSize: DISCOVERY_PAGE_SIZE }),
          DISCOVERY_REQUEST_TIMEOUT_MS,
          `CJ search "${query}"`,
        );
        stats.searchedKeywords++;
        stats.itemsSeen += items.length;

        for (const item of items) {
          if (stats.productsUpserted >= DISCOVERY_MAX_ENRICH_PER_CYCLE) break;
          if (!item.cjProductId || !isCjShopifyUsaPetProduct({ title: item.title })) continue;
          stats.petMatches++;

          try {
            const existing = await prisma.cjShopifyUsaProduct.findUnique({
              where: { userId_cjProductId: { userId, cjProductId: item.cjProductId } },
              select: {
                id: true,
                evaluations: {
                  orderBy: { evaluatedAt: 'desc' },
                  take: 1,
                  select: { evaluatedAt: true },
                },
              },
            });
            if (existing?.evaluations[0]?.evaluatedAt.getTime() >= reevalAfter) {
              stats.skippedExistingRecent++;
              continue;
            }

            const detail = await withTimeout(
              adapter.getProductById(item.cjProductId),
              DISCOVERY_REQUEST_TIMEOUT_MS,
              `CJ detail "${item.cjProductId}"`,
            );
            if (!isCjShopifyUsaPetProduct({ title: detail.title, description: detail.description })) continue;

            const probeKeys = detail.variants
              .map((variant) => String(variant.cjVid || '').trim())
              .filter(Boolean);
            const liveStock = probeKeys.length > 0
              ? await withTimeout(
                  adapter.getStockForSkus(probeKeys),
                  DISCOVERY_REQUEST_TIMEOUT_MS,
                  `CJ stock "${detail.cjProductId}"`,
                ).catch(() => new Map<string, number>())
              : new Map<string, number>();
            const variants = detail.variants.map((variant) => {
              const key = String(variant.cjVid || '').trim();
              const stock = key ? liveStock.get(key) : undefined;
              return stock === undefined ? variant : { ...variant, stock };
            });

            const dbProduct = await prisma.cjShopifyUsaProduct.upsert({
              where: { userId_cjProductId: { userId, cjProductId: detail.cjProductId } },
              create: {
                userId,
                cjProductId: detail.cjProductId,
                title: detail.title,
                description: detail.description ?? null,
                images: (detail.imageUrls ?? []) as any,
                snapshotStatus: 'SYNCED',
                lastSyncedAt: new Date(),
              },
              update: {
                title: detail.title,
                description: detail.description ?? null,
                images: (detail.imageUrls ?? []) as any,
                snapshotStatus: 'SYNCED',
                lastSyncedAt: new Date(),
              },
            });
            stats.productsUpserted++;
            if (stats.productsUpserted % 5 === 0) {
              log?.(
                'info',
                `Discovery progress: ${stats.productsUpserted}/${DISCOVERY_MAX_ENRICH_PER_CYCLE} products enriched, ` +
                  `${stats.variantsUpserted} variants synced, ${stats.approved} approved so far.`,
              );
            }

            const dbVariants = [];
            for (const variant of variants) {
              if (!variant.cjSku) continue;
              const dbVariant = await prisma.cjShopifyUsaProductVariant.upsert({
                where: { productId_cjSku: { productId: dbProduct.id, cjSku: variant.cjSku } },
                create: {
                  productId: dbProduct.id,
                  cjSku: variant.cjSku,
                  cjVid: variant.cjVid ?? null,
                  attributes: { ...(variant.attributes ?? {}), variantImage: variant.variantImage } as any,
                  unitCostUsd: variant.unitCostUsd > 0 ? variant.unitCostUsd : null,
                  stockLastKnown: Number.isFinite(variant.stock) ? variant.stock : null,
                  stockCheckedAt: new Date(),
                },
                update: {
                  cjVid: variant.cjVid ?? null,
                  attributes: { ...(variant.attributes ?? {}), variantImage: variant.variantImage } as any,
                  unitCostUsd: variant.unitCostUsd > 0 ? variant.unitCostUsd : null,
                  stockLastKnown: Number.isFinite(variant.stock) ? variant.stock : null,
                  stockCheckedAt: new Date(),
                },
              });
              dbVariants.push(dbVariant);
              stats.variantsUpserted++;
            }

            const eligible = dbVariants
              .filter((variant) => Number(variant.stockLastKnown ?? 0) >= minStock && Number(variant.unitCostUsd ?? 0) > 0)
              .sort((a, b) => Number(b.stockLastKnown ?? 0) - Number(a.stockLastKnown ?? 0));
            const selected = eligible[0];
            if (!selected) {
              stats.skippedNoStock++;
              continue;
            }

            const sourceVariant = variants.find((variant) => variant.cjSku === selected.cjSku) ?? variants[0];
            let shippingAmountUsd = fallbackShippingUsd;
            let shippingQuoteId: number | null = null;
            try {
              const waResult = await withTimeout(
                adapter.quoteShippingToUsWarehouseAware({
                  variantId: sourceVariant?.cjVid,
                  productId: detail.cjProductId,
                  quantity: 1,
                  destCountryCode: 'US',
                }),
                DISCOVERY_REQUEST_TIMEOUT_MS,
                `CJ freight "${detail.cjProductId}"`,
              );
              shippingAmountUsd = waResult.quote.cost;
              const quote = await prisma.cjShopifyUsaShippingQuote.create({
                data: {
                  userId,
                  productId: dbProduct.id,
                  variantId: selected.id,
                  quantity: 1,
                  amountUsd: shippingAmountUsd,
                  currency: 'USD',
                  serviceName: waResult.quote.method ?? null,
                  estimatedMaxDays: waResult.quote.estimatedDays ?? null,
                  confidence: waResult.quote.warehouseEvidence === 'assumed' ? 'unknown' : 'known',
                  originCountryCode: waResult.fulfillmentOrigin,
                },
              });
              shippingQuoteId = quote.id;
            } catch {
              shippingAmountUsd = fallbackShippingUsd;
            }

            const qualification = await cjShopifyUsaQualificationService.evaluate(
              userId,
              Number(selected.unitCostUsd),
              shippingAmountUsd,
            );
            await prisma.cjShopifyUsaProductEvaluation.create({
              data: {
                userId,
                productId: dbProduct.id,
                variantId: selected.id,
                shippingQuoteId,
                decision: qualification.decision,
                estimatedMarginPct: qualification.breakdown.netMarginPct,
                reasons: qualification.reasons,
              },
            });
            stats.evaluationsCreated++;
            if (qualification.decision === 'APPROVED') stats.approved++;
            else stats.rejected++;
          } catch (itemErr) {
            stats.errors++;
            console.error(
              `[Automation] Enrichment failed for "${item.cjProductId}":`,
              itemErr instanceof Error ? itemErr.message : String(itemErr),
            );
          }
        }
      } catch (searchErr) {
        // Log instead of silently swallowing — operator needs visibility into CJ API failures
        stats.errors++;
        console.error(`[Automation] Search failed for "${query}":`, searchErr instanceof Error ? searchErr.message : String(searchErr));
      }
      log?.(
        'info',
        `Discovery "${query}": ${stats.productsUpserted}/${DISCOVERY_MAX_ENRICH_PER_CYCLE} enriched total; ` +
          `${stats.approved} approved, ${stats.rejected} rejected, ${stats.skippedExistingRecent} recent skipped.`,
      );
      await new Promise(r => setTimeout(r, 400));
    }

    return stats;
  }

  // ── Shopify collection assignment ──────────────────────────────────────
  // Maps product title keywords → Shopify collection handles.
  // Runs best-effort (errors are swallowed — failing to categorise
  // should never block or error the publish cycle).

  private async assignToCollections(userId: number, shopifyProductId: string, title: string): Promise<void> {
    try {
      const settings = await cjShopifyUsaConfigService.getConfigSnapshot(userId);
      const shopDomain = settings.settings?.shopifyStoreUrl;
      if (!shopDomain) return;

      // Determine target collection handles from title
      const t = title.toLowerCase();
      const handles: string[] = ['new-arrivals', 'bestsellers'];

      if (t.match(/\bdog|puppy|canine|leash|harness|bark/)) handles.push('dogs');
      if (t.match(/\bcat|kitten|feline|catnip/))            handles.push('cats');
      if (t.match(/groom|brush|comb|scissors|shear|bath|lint/)) handles.push('grooming');
      if (t.match(/toy|puzzle|chew|squeak|interactive|play/))   handles.push('toys');
      if (t.match(/bowl|feed|treat|snack|food|water/))          handles.push('feeding');
      if (t.match(/bed|cushion|mat|blanket|sweater|coat|warm/)) handles.push('beds');

      const { cjShopifyUsaAdminService } = await import('./cj-shopify-usa-admin.service.js');
      const token = await cjShopifyUsaAdminService.getAccessToken(userId);
      const BASE = `https://${token.shopDomain}/admin/api/2026-04`;
      const H = { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' };

      // Fetch all custom collections once
      const colRes = await fetch(`${BASE}/custom_collections.json?limit=250&fields=id,handle`, { headers: H });
      if (!colRes.ok) return;
      const { custom_collections } = await colRes.json() as { custom_collections: { id: number; handle: string }[] };
      const colMap: Record<string, number> = {};
      custom_collections.forEach((c) => { colMap[c.handle] = c.id; });

      // Shopify product numeric ID
      const numericId = shopifyProductId.includes('gid://')
        ? Number(shopifyProductId.split('/').pop())
        : Number(shopifyProductId);

      // Assign to each matching collection
      for (const handle of handles) {
        const colId = colMap[handle];
        if (!colId) continue;
        await fetch(`${BASE}/collects.json`, {
          method: 'POST', headers: H,
          body: JSON.stringify({ collect: { product_id: numericId, collection_id: colId } }),
        }).catch(() => { /* already in collection — ignore duplicate errors */ });
      }
    } catch {
      // Non-blocking — collection assignment failure must not fail the cycle
    }
  }

  // ── Phase 4: Price Synchronization ─────────────────────────────────────
  // Protect margins by monitoring CJ supplier costs. If supplier raises price,
  // we proportionally raise Shopify price.

  private async syncActiveListingPrices(userId: number, log: (level: CycleEvent['level'], message: string) => void): Promise<void> {
    const { createCjSupplierAdapter } = await import('./../../cj-ebay/adapters/cj-supplier.adapter.js');
    const { cjShopifyUsaQualificationService } = await import('./cj-shopify-usa-qualification.service.js');
    const { cjShopifyUsaAdminService } = await import('./cj-shopify-usa-admin.service.js');

    const activeListings = await prisma.cjShopifyUsaListing.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        variant: { include: { product: true } },
        shippingQuote: true,
      },
    });

    if (activeListings.length === 0) return;

    // Group by CJ Product ID to minimize CJ API calls
    const listingsByProduct = new Map<number, typeof activeListings>();
    for (const listing of activeListings) {
      if (!listing.variant?.product) continue;
      const pid = listing.variant.productId;
      if (!listingsByProduct.has(pid)) listingsByProduct.set(pid, []);
      listingsByProduct.get(pid)!.push(listing);
    }

    log('info', `Checking CJ prices for ${listingsByProduct.size} active products...`);
    const adapter = createCjSupplierAdapter(userId);
    let priceChanges = 0;

    for (const [productId, productListings] of listingsByProduct.entries()) {
      const cjPid = productListings[0].variant!.product.cjProductId;
      let cjVariants: any[] = [];
      
      try {
        cjVariants = await adapter.getVariantsForProduct(cjPid);
      } catch (err) {
        // Skip on API failure
        continue;
      }

      for (const listing of productListings) {
        const matchingCjVariant = cjVariants.find((v) => v.cjVid === listing.variant!.cjVid || v.cjSku === listing.variant!.cjSku);
        if (!matchingCjVariant) continue;

        const currentCjCost = matchingCjVariant.unitCostUsd;
        if (currentCjCost <= 0) continue;

        const currentShippingUsd = listing.shippingQuote ? Number(listing.shippingQuote.amountUsd ?? 0) : 0;
        
        // Evaluate new pricing
        const evalResult = await cjShopifyUsaQualificationService.evaluate(userId, currentCjCost, currentShippingUsd);
        if (evalResult.decision !== 'APPROVED') continue;

        const newSuggestedPrice = evalResult.breakdown.suggestedSellPriceUsd;
        const currentListedPrice = Number(listing.listedPriceUsd ?? 0);

        // Update if price increased by at least $0.50 (to avoid micro-fluctuations)
        // Or if the margin is no longer valid
        if (newSuggestedPrice > currentListedPrice + 0.49) {
          log('info', `Price Sync: Increasing ${listing.shopifySku} from $${currentListedPrice.toFixed(2)} to $${newSuggestedPrice.toFixed(2)} (CJ Cost increased)`);
          
          if (listing.shopifyProductId && listing.shopifyVariantId) {
            try {
              await cjShopifyUsaAdminService.updateVariantPrice({
                userId,
                productId: listing.shopifyProductId,
                variantId: listing.shopifyVariantId,
                price: newSuggestedPrice,
              });

              await prisma.cjShopifyUsaListing.update({
                where: { id: listing.id },
                data: { listedPriceUsd: newSuggestedPrice },
              });

              await prisma.cjShopifyUsaProductVariant.update({
                where: { id: listing.variant!.id },
                data: { unitCostUsd: currentCjCost, stockLastKnown: matchingCjVariant.stock },
              });

              priceChanges++;
            } catch (err) {
              log('warn', `Failed to update Shopify price for ${listing.shopifySku}: ${err}`);
            }
          }
        }
      }

      // Respect CJ API rate limits
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (priceChanges > 0) {
      log('success', `Price Sync: Updated ${priceChanges} listing prices successfully.`);
    }
  }
}

export const automationService = new CjShopifyUsaAutomationService();
