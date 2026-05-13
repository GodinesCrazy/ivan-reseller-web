import 'dotenv/config';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import { cjEbayAutopilotService } from '../src/modules/cj-ebay/services/cj-ebay-autopilot.service';
import { cjEbayConfigService } from '../src/modules/cj-ebay/services/cj-ebay-config.service';
import { cjEbayOpportunityPipelineService } from '../src/modules/cj-ebay/services/cj-ebay-opportunity-pipeline.service';
import { cjEbayOpportunityShortlistService } from '../src/modules/cj-ebay/services/cj-ebay-opportunity-shortlist.service';
import { cjEbaySystemReadinessService } from '../src/modules/cj-ebay/services/cj-ebay-system-readiness.service';

const userId = Number(process.env.REAL_CYCLE_USER_ID || process.env.CJ_EBAY_SMOKE_USER_ID || 1);
const publish = process.env.CJ_EBAY_SMOKE_PUBLISH === 'true';
const autopilotDryRun = process.env.CJ_EBAY_SMOKE_AUTOPILOT_DRY_RUN !== 'false';

async function waitForRun(runId: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await cjEbayOpportunityShortlistService.getRunSummary(runId, userId);
    if (!run) return null;
    if (run.status === 'COMPLETED' || run.status === 'FAILED') return run;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return cjEbayOpportunityShortlistService.getRunSummary(runId, userId);
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, isActive: true },
  });
  if (!user?.isActive) throw new Error(`User ${userId} not found or inactive`);

  const settings = await cjEbayConfigService.getOrCreateSettings(userId);
  const readiness = await cjEbaySystemReadinessService.evaluateForUser(userId);
  const autopilot = await cjEbayAutopilotService.getStatus(userId);
  console.log('[cj-ebay-smoke] user', { id: user.id, username: user.username, email: user.email });
  console.log('[cj-ebay-smoke] mode', { publish, blockNewPublications: env.BLOCK_NEW_PUBLICATIONS });
  console.log('[cj-ebay-smoke] settings', {
    marketNiche: settings.marketNiche,
    requirePetCategory: settings.requirePetCategory,
    requireUsWarehouseOnly: settings.requireUsWarehouseOnly,
    minMarginPct: settings.minMarginPct,
    minProfitUsd: settings.minProfitUsd,
    defaultEbayFeePct: settings.defaultEbayFeePct,
    defaultPaymentFeePct: settings.defaultPaymentFeePct,
    monthlyListingLimit: settings.monthlyListingLimit,
    monthlyAmountLimitUsd: settings.monthlyAmountLimitUsd,
  });
  console.log('[cj-ebay-smoke] readiness', {
    ready: readiness.ready,
    checks: readiness.checks?.map((check) => ({
      id: check.id,
      ok: check.ok,
      detail: check.detail,
    })),
  });
  console.log('[cj-ebay-smoke] autopilot', {
    status: autopilot.status,
    pricingGuardrailsComplete: autopilot.config.pricingGuardrailsComplete,
    sellingLimits: autopilot.sellingLimits,
  });

  if (autopilotDryRun && !publish) {
    const dryRun = await cjEbayAutopilotService.runNow(userId, 'DRY_RUN', { dryRun: true });
    console.log('[cj-ebay-smoke] autopilot dry-run result', dryRun);
    await prisma.$disconnect();
    return;
  }

  const discovery = await cjEbayOpportunityShortlistService.startDiscoveryRun(userId, {
    mode: 'STARTER',
    settings: {
      maxSeedsPerRun: 1,
      shortlistSize: 1,
      minScoreForShortlist: 35,
      marketNiche: 'PET_SUPPLIES',
      requirePetCategory: true,
    },
  });
  console.log('[cj-ebay-smoke] discovery started', discovery);

  const run = await waitForRun(discovery.runId, 180_000);
  console.log('[cj-ebay-smoke] discovery completed', run);
  if (!run || run.status !== 'COMPLETED') throw new Error(`Discovery did not complete: ${run?.status ?? 'null'}`);

  const candidates = await cjEbayOpportunityShortlistService.getActiveRecommendations(userId);
  console.log('[cj-ebay-smoke] candidates', candidates.map((c) => ({
    id: c.id,
    status: c.status,
    score: c.score?.totalScore,
    dataConfidenceScore: c.dataConfidenceScore,
    title: c.cjProductTitle.slice(0, 90),
    seedKeyword: c.seedKeyword,
    supplierCostUsd: c.supplierCostUsd,
    shippingUsd: c.shippingUsd,
    stockCount: c.stockCount,
  })));
  const candidate = candidates.find((c) => ['SHORTLISTED', 'APPROVED'].includes(c.status));
  if (!candidate) throw new Error('No SHORTLISTED/APPROVED CJ-eBay candidate found');

  const result = await cjEbayOpportunityPipelineService.run({
    userId,
    route: 'cj-ebay-cycle-smoke',
    body: {
      productId: candidate.cjProductId,
      variantId: candidate.cjVariantSku,
      quantity: 1,
      draftOnly: !publish,
      publish,
    },
  });
  console.log('[cj-ebay-smoke] pipeline result', {
    evaluateDecision: result.evaluate.decision,
    listing: result.listing,
    publish: result.publish,
    publishSkippedReason: result.publishSkippedReason,
  });

  const listingId = result.listing?.id;
  if (listingId) {
    const listing = await prisma.cjEbayListing.findUnique({
      where: { id: listingId },
      include: {
        product: { select: { title: true, cjProductId: true } },
        variant: { select: { cjSku: true, cjVid: true, stockLastKnown: true } },
        evaluation: { select: { decision: true, estimatedMarginPct: true, evaluatedAt: true } },
        shippingQuote: { select: { amountUsd: true, originCountryCode: true, confidence: true, createdAt: true } },
      },
    });
    console.log('[cj-ebay-smoke] reflected listing state', listing);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('[cj-ebay-smoke] FAILED', error instanceof Error ? error.message : String(error));
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
