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
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service.js';
import { cjShopifyUsaPublishService } from './cj-shopify-usa-publish.service.js';

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

// ── Singleton state ────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AutomationConfig = {
  intervalHours: 3,
  maxDailyPublish: 200,
  maxPerCycle: 40,
  minMarginPct: 15,
  categories: ['pet supplies', 'dog accessories', 'cat accessories', 'pet grooming', 'pet toys'],
  autoPublish: true,
  enabled: false,
};

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

  getStatus() {
    return {
      state: this.state,
      config: this.config,
      currentCycle: this.currentCycle,
      lastRunAt: this.lastRunAt?.toISOString() ?? null,
      nextRunAt: this.nextRunAt?.toISOString() ?? null,
      dailyPublishCount: this.dailyPublishCount,
      cycleHistory: this.cycleHistory.slice(-10),
    };
  }

  updateConfig(patch: Partial<AutomationConfig>) {
    this.config = { ...this.config, ...patch };
    // If running, reschedule with new interval
    if (this.state === 'RUNNING' && 'intervalHours' in patch) {
      this.reschedule();
    }
    return this.config;
  }

  async start(userId: number) {
    if (this.state === 'RUNNING') return this.getStatus();
    this.config.enabled = true;
    this.abortSignal = false;
    this.state = 'RUNNING';
    this.schedule(userId);
    // Fire first cycle immediately
    void this.runCycle(userId);
    return this.getStatus();
  }

  pause() {
    if (this.state !== 'RUNNING') return this.getStatus();
    this.state = 'PAUSED';
    this.abortSignal = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.nextRunAt = null;
    return this.getStatus();
  }

  stop() {
    this.state = 'IDLE';
    this.config.enabled = false;
    this.abortSignal = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.nextRunAt = null;
    if (this.currentCycle && this.currentCycle.status === 'RUNNING') {
      this.currentCycle.status = 'ABORTED';
      this.currentCycle.finishedAt = new Date().toISOString();
      this.pushHistory(this.currentCycle);
      this.currentCycle = null;
    }
    return this.getStatus();
  }

  resume(userId: number) {
    if (this.state !== 'PAUSED') return this.getStatus();
    this.state = 'RUNNING';
    this.abortSignal = false;
    this.schedule(userId);
    void this.runCycle(userId);
    return this.getStatus();
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
        this.pushHistory(cycle);
        this.currentCycle = null;
        return;
      }

      const perCycleLimit = Math.min(this.config.maxPerCycle, remainingToday);
      log('info', `Will publish up to ${perCycleLimit} products this cycle (${remainingToday} remaining today)`);

      // ── Step 1: Find products with APPROVED evaluation and no active listing ──
      log('info', 'Scanning approved CJ products database...');

      const settings = await cjShopifyUsaConfigService.getConfigSnapshot(userId);
      const minMarginFromSettings = Number(settings.settings?.minMarginPct ?? this.config.minMarginPct);

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
              variants: { orderBy: { id: 'asc' }, take: 1 },
              listings: {
                where: { userId },
                select: { id: true, status: true },
              },
            },
          },
        },
        orderBy: { estimatedMarginPct: 'desc' },
        take: 200,
      });

      cycle.productsScanned = approvedEvaluations.length;
      log('info', `Found ${approvedEvaluations.length} approved evaluations ≥ ${minMarginFromSettings}% margin`);

      if (this.abortSignal) { cycle.status = 'ABORTED'; return; }

      // ── Step 2: Filter — pet products only + no active/duplicate listing ──
      const BUSY_STATUSES = ['ACTIVE', 'DRAFT', 'PUBLISHING', 'RECONCILE_PENDING'];

      // Keywords that identify a pet product by title
      const PET_KEYWORDS = [
        'pet', 'dog', 'cat', 'puppy', 'kitten', 'paw', 'leash', 'harness',
        'grooming', 'collar', 'crate', 'litter', 'feeder', 'bowl', 'treat',
        'chew', 'squeaky', 'catnip', 'hamster', 'bird', 'aquarium', 'reptile',
      ];
      const isPetProduct = (title: string): boolean => {
        const t = title.toLowerCase();
        return PET_KEYWORDS.some((kw) => t.includes(kw));
      };

      const candidates = approvedEvaluations.filter((ev) => {
        // Must be a pet product
        if (!isPetProduct(ev.product.title ?? '')) return false;
        // Must not already have an active/draft listing (duplicate guard)
        const hasActiveListing = ev.product.listings.some((l) =>
          BUSY_STATUSES.includes(l.status),
        );
        return !hasActiveListing && ev.product.variants.length > 0;
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
        this.pushHistory(cycle);
        this.currentCycle = null;
        return;
      }

      // ── Step 3: Take top N by margin ──
      const toProcess = uniqueCandidates.slice(0, perCycleLimit);
      log('info', `Processing top ${toProcess.length} products this cycle`);

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
          }

          // Small delay to avoid API rate limits
          await new Promise((r) => setTimeout(r, 800));

        } catch (err) {
          cycle.errors++;
          const msg = err instanceof Error ? err.message : String(err);
          log('error', `Failed for ${product.cjProductId}: ${msg.slice(0, 120)}`);
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
      this.currentCycle = null;
    }
  }

  private pushHistory(cycle: CycleResult) {
    this.cycleHistory.push(cycle);
    if (this.cycleHistory.length > 20) this.cycleHistory.shift();
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
}

export const automationService = new CjShopifyUsaAutomationService();
