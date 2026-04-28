import { Router, type Request, type Response } from 'express';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { topDawgShopifyUsaConfigService }      from './services/topdawg-shopify-usa-config.service';
import { topDawgShopifyUsaDiscoverService }     from './services/topdawg-shopify-usa-discover.service';
import { topDawgShopifyUsaPublishService }      from './services/topdawg-shopify-usa-publish.service';
import { topDawgShopifyUsaOrderIngestService }  from './services/topdawg-shopify-usa-order-ingest.service';
import { topDawgShopifyUsaAutomationService }   from './services/topdawg-shopify-usa-automation.service';
import { TopDawgApiClient }                     from './services/topdawg-api-client.service';
import {
  topDawgShopifyUsaUpdateConfigSchema,
  topDawgShopifyUsaDiscoverSearchSchema,
  topDawgShopifyUsaDiscoverEvaluateSchema,
  topDawgShopifyUsaDiscoverImportDraftSchema,
  topDawgShopifyUsaListingPublishSchema,
  topDawgShopifyUsaOrderSyncSchema,
  topDawgShopifyUsaAutomationConfigSchema,
} from './schemas/topdawg-shopify-usa.schemas';

const router = Router();
const USER_ID = 1; // Single-tenant — always user 1

function ok(res: Response, data: unknown)  { res.json({ ok: true,  ...flatten(data) }); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  res.status(status).json({ ok: false, error: msg });
}
function flatten(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  return { data };
}

// ── Health ─────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ ok: true, module: 'topdawg-shopify-usa' }));

// ── Config ─────────────────────────────────────────────────────────────────
router.get('/config', async (_req, res) => {
  try { ok(res, await topDawgShopifyUsaConfigService.getConfigSnapshot(USER_ID)); }
  catch (e) { err(res, e); }
});

router.post('/config', async (req, res) => {
  try {
    const parsed = topDawgShopifyUsaUpdateConfigSchema.parse(req.body);
    ok(res, { settings: await topDawgShopifyUsaConfigService.updateSettings(USER_ID, parsed as Record<string, unknown>) });
  } catch (e) { err(res, e, 400); }
});

// ── System readiness ───────────────────────────────────────────────────────
router.get('/system-readiness', async (_req, res) => {
  try {
    const settings = await topDawgShopifyUsaConfigService.getOrCreateSettings(USER_ID);
    const checks: Array<{ name: string; ok: boolean; hint?: string }> = [
      { name: 'Module enabled', ok: String(env.ENABLE_CJ_SHOPIFY_USA_MODULE) === 'true' || true },
      { name: 'TopDawg API key', ok: !!settings.topDawgApiKey, hint: 'Add TopDawg API key in Settings' },
      { name: 'Shopify credentials', ok: !!env.SHOPIFY_CLIENT_ID && !!env.SHOPIFY_CLIENT_SECRET },
    ];

    if (settings.topDawgApiKey) {
      const client = new TopDawgApiClient(settings.topDawgApiKey);
      const apiOk  = await client.testConnection();
      checks.push({ name: 'TopDawg API connection', ok: apiOk, hint: apiOk ? undefined : 'Check TopDawg API key validity' });
    }

    ok(res, { ready: checks.every(c => c.ok), checks });
  } catch (e) { err(res, e); }
});

// ── Overview ───────────────────────────────────────────────────────────────
router.get('/overview', async (_req, res) => {
  try {
    const [products, listings, orders, alerts] = await Promise.all([
      prisma.topDawgShopifyUsaProduct.count({ where: { userId: USER_ID } }),
      prisma.topDawgShopifyUsaListing.groupBy({ by: ['status'], where: { userId: USER_ID }, _count: true }),
      prisma.topDawgShopifyUsaOrder.groupBy({ by: ['status'], where: { userId: USER_ID }, _count: true }),
      prisma.topDawgShopifyUsaAlert.count({ where: { userId: USER_ID, status: 'OPEN' } }),
    ]);
    ok(res, { products, listings, orders, openAlerts: alerts });
  } catch (e) { err(res, e); }
});

// ── Discover ───────────────────────────────────────────────────────────────
router.get('/discover/search', async (req, res) => {
  try {
    const { keyword, page, pageSize } = topDawgShopifyUsaDiscoverSearchSchema.parse(req.query);
    ok(res, await topDawgShopifyUsaDiscoverService.search(USER_ID, keyword, page, pageSize));
  } catch (e) { err(res, e, 400); }
});

router.post('/discover/evaluate', async (req, res) => {
  try {
    const { tdSku, tdVariantSku } = topDawgShopifyUsaDiscoverEvaluateSchema.parse(req.body);
    ok(res, await topDawgShopifyUsaDiscoverService.evaluate(USER_ID, tdSku, tdVariantSku));
  } catch (e) { err(res, e, 400); }
});

router.post('/discover/import-draft', async (req, res) => {
  try {
    const { tdSku, tdVariantSku } = topDawgShopifyUsaDiscoverImportDraftSchema.parse(req.body);
    ok(res, await topDawgShopifyUsaDiscoverService.importAndDraft(USER_ID, tdSku, tdVariantSku));
  } catch (e) { err(res, e, 400); }
});

// ── Listings ───────────────────────────────────────────────────────────────
router.get('/listings', async (req, res) => {
  try {
    const status = req.query['status'] as string | undefined;
    const listings = await prisma.topDawgShopifyUsaListing.findMany({
      where: { userId: USER_ID, ...(status ? { status } : {}) },
      include: { product: { select: { title: true, tdSku: true, images: true } }, variant: { select: { tdVariantSku: true, title: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    ok(res, { listings });
  } catch (e) { err(res, e); }
});

router.post('/listings/publish', async (req, res) => {
  try {
    const { listingIds } = topDawgShopifyUsaListingPublishSchema.parse(req.body);
    const results = await topDawgShopifyUsaPublishService.bulkPublish(USER_ID, listingIds);
    ok(res, { results });
  } catch (e) { err(res, e, 400); }
});

router.post('/listings/:id/pause', async (req, res) => {
  try {
    ok(res, await topDawgShopifyUsaPublishService.pauseListing(USER_ID, Number(req.params['id'])));
  } catch (e) { err(res, e); }
});

router.post('/listings/:id/unpublish', async (req, res) => {
  try {
    ok(res, await topDawgShopifyUsaPublishService.unpublishListing(USER_ID, Number(req.params['id'])));
  } catch (e) { err(res, e); }
});

// ── Orders ─────────────────────────────────────────────────────────────────
router.get('/orders', async (_req, res) => {
  try {
    const orders = await prisma.topDawgShopifyUsaOrder.findMany({
      where: { userId: USER_ID },
      include: { tracking: { take: 1 } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    ok(res, { orders });
  } catch (e) { err(res, e); }
});

router.post('/orders/sync', async (req, res) => {
  try {
    const opts = topDawgShopifyUsaOrderSyncSchema.parse(req.body);
    ok(res, await topDawgShopifyUsaOrderIngestService.syncOrders(USER_ID, opts));
  } catch (e) { err(res, e, 400); }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.topDawgShopifyUsaOrder.findFirst({
      where: { id: Number(req.params['id']), userId: USER_ID },
      include: { events: { orderBy: { createdAt: 'asc' } }, tracking: true },
    });
    if (!order) return res.status(404).json({ ok: false, error: 'Not found' });
    ok(res, { order });
  } catch (e) { err(res, e); }
});

router.post('/orders/:id/process', async (req, res) => {
  try {
    ok(res, await topDawgShopifyUsaOrderIngestService.processOrder(USER_ID, Number(req.params['id'])));
  } catch (e) { err(res, e); }
});

router.post('/orders/:id/sync-tracking', async (req, res) => {
  try {
    ok(res, await topDawgShopifyUsaOrderIngestService.syncTracking(USER_ID, Number(req.params['id'])));
  } catch (e) { err(res, e); }
});

// ── Alerts ─────────────────────────────────────────────────────────────────
router.get('/alerts', async (_req, res) => {
  try {
    const alerts = await prisma.topDawgShopifyUsaAlert.findMany({
      where: { userId: USER_ID }, orderBy: { createdAt: 'desc' }, take: 100,
    });
    ok(res, { alerts });
  } catch (e) { err(res, e); }
});

router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const alert = await prisma.topDawgShopifyUsaAlert.update({
      where: { id: Number(req.params['id']) }, data: { status: 'ACKNOWLEDGED' },
    });
    ok(res, { alert });
  } catch (e) { err(res, e); }
});

router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const alert = await prisma.topDawgShopifyUsaAlert.update({
      where: { id: Number(req.params['id']) }, data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    ok(res, { alert });
  } catch (e) { err(res, e); }
});

// ── Automation ─────────────────────────────────────────────────────────────
router.get('/automation/status', (_req, res) => res.json({ ok: true, ...topDawgShopifyUsaAutomationService.getStatus() }));

router.post('/automation/start',  (_req, res) => { try { ok(res, topDawgShopifyUsaAutomationService.start(USER_ID)); } catch (e) { err(res, e); } });
router.post('/automation/pause',  (_req, res) => { try { ok(res, topDawgShopifyUsaAutomationService.pause()); }          catch (e) { err(res, e); } });
router.post('/automation/resume', (_req, res) => { try { ok(res, topDawgShopifyUsaAutomationService.resume(USER_ID)); }  catch (e) { err(res, e); } });
router.post('/automation/stop',   (_req, res) => { try { ok(res, topDawgShopifyUsaAutomationService.stop()); }           catch (e) { err(res, e); } });

router.post('/automation/config', (req, res) => {
  try {
    const patch = topDawgShopifyUsaAutomationConfigSchema.parse(req.body);
    ok(res, { config: topDawgShopifyUsaAutomationService.updateConfig(patch) });
  } catch (e) { err(res, e, 400); }
});

// ── Profit ─────────────────────────────────────────────────────────────────
router.get('/profit', async (_req, res) => {
  try {
    const snapshots = await prisma.topDawgShopifyUsaProfitSnapshot.findMany({
      where: { userId: USER_ID }, orderBy: { date: 'desc' }, take: 30,
    });
    ok(res, { snapshots });
  } catch (e) { err(res, e); }
});

// ── Logs ───────────────────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
    const step  = req.query['step'] as string | undefined;
    const logs  = await prisma.topDawgShopifyUsaExecutionTrace.findMany({
      where: { ...(step ? { step } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    ok(res, { logs });
  } catch (e) { err(res, e); }
});

export default router;
