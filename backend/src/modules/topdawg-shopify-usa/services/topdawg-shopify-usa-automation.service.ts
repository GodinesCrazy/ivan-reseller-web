import { prisma } from '../../../config/database';
import { topDawgShopifyUsaConfigService } from './topdawg-shopify-usa-config.service';
import { topDawgShopifyUsaDiscoverService } from './topdawg-shopify-usa-discover.service';
import { topDawgShopifyUsaPublishService } from './topdawg-shopify-usa-publish.service';
import { env } from '../../../config/env';

type AutomationState  = 'IDLE' | 'RUNNING' | 'PAUSED' | 'ERROR';
type AutomationConfig = {
  intervalHours:   number;
  maxDailyPublish: number;
  maxPerCycle:     number;
  minMarginPct:    number;
  autoPublish:     boolean;
  categories:      string[];
  enabled:         boolean;
};

type CycleResult = {
  startedAt:   string;
  completedAt: string | null;
  discovered:  number;
  approved:    number;
  published:   number;
  failed:      number;
  events:      string[];
};

const DEFAULT_CONFIG: AutomationConfig = {
  intervalHours:   2,
  maxDailyPublish: 200,
  maxPerCycle:     50,
  minMarginPct:    18,
  autoPublish:     true,
  enabled:         false,
  categories: [
    'dog accessories', 'cat accessories', 'pet grooming',
    'pet toys', 'pet beds', 'dog clothing', 'cat furniture',
    'pet bowls', 'dog harness', 'cat toys', 'dog leash',
    'pet carriers', 'dog training', 'cat litter',
  ],
};

const TD_SEARCHES = [
  'dog collar', 'cat toy', 'pet grooming', 'dog leash', 'cat bed',
  'dog harness', 'cat scratching post', 'dog clothes', 'dog training',
  'cat litter box', 'pet brush', 'cat tunnel', 'dog nail trimmer',
  'cat water fountain', 'dog puzzle toy', 'cat tree', 'dog shampoo',
  'pet dental', 'dog cooling mat', 'cat window perch', 'dog slow feeder',
  'pet blanket', 'dog orthopedic bed', 'cat harness', 'dog agility',
];

const PET_KW = [
  'pet','dog','cat','puppy','kitten','paw','leash','harness',
  'grooming','collar','treat','chew','bowl','feeder','litter','catnip',
  'nail','brush','comb','scissors','coat','sweater','toy','fur',
  'kennel','carrier','crate','cage','rabbit','bunny','dental',
  'shampoo','fountain','dispenser','automatic','scratch','tunnel',
  'perch','tree','climbing','cooling','heating','blanket','cushion',
];

class TopDawgShopifyUsaAutomationService {
  private state: AutomationState = 'IDLE';
  private config: AutomationConfig = { ...DEFAULT_CONFIG };
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentCycle: CycleResult | null = null;
  private cycleHistory: CycleResult[] = [];
  private dailyPublishCount = 0;
  private lastDailyReset    = new Date().toDateString();

  getStatus() {
    return {
      state:        this.state,
      config:       this.config,
      currentCycle: this.currentCycle,
      cycleHistory: this.cycleHistory.slice(-10),
      dailyPublishCount: this.dailyPublishCount,
    };
  }

  updateConfig(patch: Partial<AutomationConfig>) {
    this.config = { ...this.config, ...patch };
    return this.config;
  }

  start(userId: number) {
    if (this.state === 'RUNNING') throw new Error('Already running');
    this.state = 'RUNNING';
    this.scheduleCycle(userId);
    return this.getStatus();
  }

  pause() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.state = 'PAUSED';
    return this.getStatus();
  }

  resume(userId: number) {
    if (this.state !== 'PAUSED') throw new Error('Not paused');
    this.state = 'RUNNING';
    this.scheduleCycle(userId);
    return this.getStatus();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.state = 'IDLE';
    return this.getStatus();
  }

  private scheduleCycle(userId: number) {
    if (this.timer) clearInterval(this.timer);
    void this.runCycle(userId);
    this.timer = setInterval(() => { void this.runCycle(userId); }, this.config.intervalHours * 3600 * 1000);
  }

  private resetDailyIfNeeded() {
    const today = new Date().toDateString();
    if (today !== this.lastDailyReset) { this.dailyPublishCount = 0; this.lastDailyReset = today; }
  }

  private isPetProduct(title: string) {
    const t = title.toLowerCase();
    return PET_KW.some(k => t.includes(k));
  }

  private async runCycle(userId: number) {
    if (this.state !== 'RUNNING') return;
    this.resetDailyIfNeeded();

    const remaining = this.config.maxDailyPublish - this.dailyPublishCount;
    if (remaining <= 0) return;

    const limit = Math.min(this.config.maxPerCycle, remaining);
    const cycle: CycleResult = {
      startedAt: new Date().toISOString(), completedAt: null,
      discovered: 0, approved: 0, published: 0, failed: 0, events: [],
    };
    this.currentCycle = cycle;

    const log = (msg: string) => { cycle.events.push(`[${new Date().toISOString()}] ${msg}`); };

    try {
      // Pick 3 random search terms
      const shuffled = [...TD_SEARCHES].sort(() => Math.random() - 0.5).slice(0, 3);
      const settings = await topDawgShopifyUsaConfigService.getOrCreateSettings(userId);

      for (const kw of shuffled) {
        if (this.state !== 'RUNNING' || cycle.published >= limit) break;
        log(`Searching TopDawg: "${kw}"`);

        try {
          const res = await topDawgShopifyUsaDiscoverService.search(userId, kw, 1, 20);
          const products = (res.results ?? []) as Array<{ sku: string; title: string }>;
          cycle.discovered += products.length;

          for (const p of products) {
            if (cycle.published >= limit) break;
            if (!this.isPetProduct(p.title)) continue;

            try {
              const result = await topDawgShopifyUsaDiscoverService.importAndDraft(userId, p.sku);
              if (!result.imported || result.alreadyExists) continue;

              cycle.approved++;

              if (this.config.autoPublish && result.listing) {
                await topDawgShopifyUsaPublishService.publishListing(userId, result.listing.id);
                cycle.published++;
                this.dailyPublishCount++;
                log(`Published: "${p.title.slice(0, 50)}"`);
              }
            } catch {
              cycle.failed++;
            }

            await new Promise(r => setTimeout(r, 500));
          }
        } catch (e) {
          log(`Search error for "${kw}": ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e) {
      log(`Cycle error: ${e instanceof Error ? e.message : String(e)}`);
      this.state = 'ERROR';
    }

    cycle.completedAt = new Date().toISOString();
    this.cycleHistory.unshift(cycle);
    if (this.cycleHistory.length > 20) this.cycleHistory.pop();
    this.currentCycle = null;
  }
}

export const topDawgShopifyUsaAutomationService = new TopDawgShopifyUsaAutomationService();
