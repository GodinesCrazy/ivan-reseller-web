/**
 * CJ → eBay USA — Opportunity Shortlist & Orchestration Service (FASE 3G / 3G.1).
 *
 * Orchestrates the full discovery pipeline:
 *   1. Trend discovery (seeds) — real eBay Browse or mock fallback
 *   2. CJ candidate matching
 *   3. Market price lookup (real eBay Browse per keyword, cached per run)
 *   4. Pricing computation
 *   5. Scoring (with data quality penalty)
 *   6. Data quality + starter suitability computation
 *   7. Shortlist construction (top N by score)
 *   8. Persistence in cj_ebay_opportunity_runs + cj_ebay_opportunity_candidates
 *
 * Also handles human review actions (approve / reject / defer)
 * and handoff of approved candidates to the evaluation pipeline.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { createCjSupplierAdapter } from '../adapters/cj-supplier.adapter';
import { cjEbayConfigService } from './cj-ebay-config.service';
import { cjEbayTrendDiscoveryService } from './cj-ebay-trend-discovery.service';
import { cjEbayCandidateMatchingService } from './cj-ebay-candidate-matching.service';
import { cjEbayOpportunityPricingService } from './cj-ebay-opportunity-pricing.service';
import { cjEbayOpportunityScoringService } from './cj-ebay-opportunity-scoring.service';
import { cjEbayMarketObservedPriceService } from './cj-ebay-market-observed-price.service';
import {
  DEFAULT_RUN_SETTINGS,
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_STARTER_CONFIG,
  type OpportunityRunSettings,
  type DiscoverOpportunitiesRequest,
  type CjCandidateMatch,
  type CjOpportunityPricingResult,
  type OpportunityScoreBreakdown,
  type OpportunityRunSummary,
  type CandidateListItem,
  type MarketObservedPriceResult,
  type DataSourceType,
  type RecommendationConfidence,
  type StarterSuitability,
  type CandidateDataQuality,
} from './cj-ebay-opportunity.types';
import type { OpportunitySettingsRow } from './cj-ebay-opportunity-pricing.service';

// ====================================
// HELPERS
// ====================================

function buildRunSettings(req: DiscoverOpportunitiesRequest): OpportunityRunSettings {
  const mode = req.mode ?? 'STARTER';
  const overrides = req.settings ?? {};
  return {
    ...DEFAULT_RUN_SETTINGS,
    ...overrides,
    mode,
    scoringWeights: {
      ...DEFAULT_SCORING_WEIGHTS,
      ...(overrides.scoringWeights ?? {}),
    },
    starterModeConfig:
      mode === 'STARTER'
        ? { ...DEFAULT_STARTER_CONFIG, ...(overrides.starterModeConfig ?? {}) }
        : undefined,
  };
}

function mapRunToSummary(run: {
  id: string;
  status: string;
  mode: string;
  seedCount: number;
  candidateCount: number;
  shortlistedCount: number;
  approvedCount: number;
  rejectedCount: number;
  deferredCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}): OpportunityRunSummary {
  return {
    runId: run.id,
    status: run.status,
    mode: run.mode,
    seedCount: run.seedCount,
    candidateCount: run.candidateCount,
    shortlistedCount: run.shortlistedCount,
    approvedCount: run.approvedCount,
    rejectedCount: run.rejectedCount,
    deferredCount: run.deferredCount,
    startedAt: run.startedAt?.toISOString(),
    completedAt: run.completedAt?.toISOString(),
    errorMessage: run.errorMessage ?? undefined,
    createdAt: run.createdAt.toISOString(),
  };
}

// ====================================
// DATA QUALITY HELPER (3G.1)
// ====================================

function computeCandidateDataQuality(
  trendSourceType: DataSourceType,
  pricing: CjOpportunityPricingResult,
  score: OpportunityScoreBreakdown,
  shippingConfidence: string,
  evidenceSummaryFromPriceResult?: string,
): CandidateDataQuality {
  const marketPriceSourceType = pricing.marketPriceSourceType ?? 'ESTIMATED';
  const shippingSourceType: DataSourceType =
    shippingConfidence === 'KNOWN' ? 'REAL' :
    shippingConfidence === 'ESTIMATED' ? 'ESTIMATED' : 'MOCK';

  const dataConfidenceScore = score.dataQualityScore ?? 30;

  let recommendationConfidence: RecommendationConfidence;
  if (dataConfidenceScore >= 70 && score.totalScore >= 65) {
    recommendationConfidence = 'HIGH';
  } else if (dataConfidenceScore >= 45 && score.totalScore >= 45) {
    recommendationConfidence = 'MEDIUM';
  } else {
    recommendationConfidence = 'LOW';
  }

  let starterSuitability: StarterSuitability;
  if (
    score.totalScore >= 60 &&
    score.simplicityScore >= 60 &&
    score.accountRiskScore >= 70 &&
    (pricing.netMarginPct ?? 0) >= 20 &&
    shippingConfidence !== 'UNKNOWN' &&
    dataConfidenceScore >= 50 &&
    score.starterFlags.length === 0
  ) {
    starterSuitability = 'GOOD_FOR_STARTER';
  } else if (score.totalScore >= 40 && score.accountRiskScore >= 50) {
    starterSuitability = 'CAUTION_FOR_STARTER';
  } else {
    starterSuitability = 'NOT_RECOMMENDED_FOR_STARTER';
  }

  const summaryParts: string[] = [];
  if (evidenceSummaryFromPriceResult) summaryParts.push(evidenceSummaryFromPriceResult);
  summaryParts.push(
    trendSourceType === 'REAL'
      ? 'Tendencia verificada con datos reales de eBay Browse.'
      : trendSourceType === 'HYBRID'
      ? 'Tendencia de origen manual.'
      : 'Tendencia basada en seeds mock (datos de referencia internos).',
  );
  summaryParts.push(
    shippingConfidence === 'KNOWN'
      ? 'Costo de envío confirmado por API CJ Freight.'
      : 'Costo de envío estimado.',
  );

  return {
    trendSourceType,
    marketPriceSourceType,
    shippingSourceType,
    dataConfidenceScore,
    recommendationConfidence,
    evidenceSummary: summaryParts.join(' '),
    starterSuitability,
  };
}

function mapCandidateToListItem(c: {
  id: string;
  runId: string;
  seedKeyword: string;
  seedSource: string;
  cjProductId: string;
  cjProductTitle: string;
  cjVariantSku: string;
  images: unknown;
  supplierCostUsd: Decimal;
  shippingUsd: Decimal;
  shippingConfidence: string;
  shippingDaysMin: number | null;
  shippingDaysMax: number | null;
  stockCount: number | null;
  marketObservedPriceUsd: Decimal | null;
  pricingBreakdown: unknown;
  scoreBreakdown: unknown;
  totalScore: Decimal;
  recommendationReason: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedAt: Date | null;
  handedOffAt: Date | null;
  createdAt: Date;
  // 3G.1 columns (may be absent in older rows)
  trendSourceType?: string | null;
  marketPriceSourceType?: string | null;
  dataConfidenceScore?: Decimal | null;
  recommendationConfidence?: string | null;
  starterSuitability?: string | null;
  evidenceSummary?: string | null;
  marketPriceDetail?: unknown;
}): CandidateListItem {
  const pricing = c.pricingBreakdown as CjOpportunityPricingResult;
  const score = c.scoreBreakdown as OpportunityScoreBreakdown;

  const trendSrc = (c.trendSourceType ?? (c.seedSource === 'EBAY_RESEARCH' ? 'REAL' : c.seedSource === 'MANUAL' ? 'HYBRID' : 'MOCK')) as DataSourceType;
  const mptSrc = (c.marketPriceSourceType ?? pricing?.marketPriceSourceType ?? 'ESTIMATED') as DataSourceType;
  const dataConf = c.dataConfidenceScore != null ? Number(c.dataConfidenceScore) : (score?.dataQualityScore ?? 30);
  const recConf = (c.recommendationConfidence ?? 'LOW') as RecommendationConfidence;
  const starterS = (c.starterSuitability ?? 'CAUTION_FOR_STARTER') as StarterSuitability;

  return {
    id: c.id,
    runId: c.runId,
    seedKeyword: c.seedKeyword,
    seedSource: c.seedSource,
    cjProductId: c.cjProductId,
    cjProductTitle: c.cjProductTitle,
    cjVariantSku: c.cjVariantSku,
    images: Array.isArray(c.images) ? (c.images as string[]) : [],
    supplierCostUsd: Number(c.supplierCostUsd),
    shippingUsd: Number(c.shippingUsd),
    shippingConfidence: c.shippingConfidence,
    shippingDaysMin: c.shippingDaysMin ?? undefined,
    shippingDaysMax: c.shippingDaysMax ?? undefined,
    stockCount: c.stockCount ?? undefined,
    marketObservedPriceUsd: c.marketObservedPriceUsd != null ? Number(c.marketObservedPriceUsd) : undefined,
    marketPriceIsEstimated: mptSrc !== 'REAL',
    pricing,
    score,
    recommendationReason: c.recommendationReason ?? '',
    status: c.status,
    reviewNotes: c.reviewNotes ?? undefined,
    reviewedAt: c.reviewedAt?.toISOString(),
    handedOffAt: c.handedOffAt?.toISOString(),
    createdAt: c.createdAt.toISOString(),
    // 3G.1
    trendSourceType: trendSrc,
    marketPriceSourceType: mptSrc,
    dataConfidenceScore: dataConf,
    recommendationConfidence: recConf,
    starterSuitability: starterS,
    evidenceSummary: c.evidenceSummary ?? undefined,
    marketPriceDetail: c.marketPriceDetail != null ? (c.marketPriceDetail as MarketObservedPriceResult) : undefined,
  };
}

// ====================================
// SHORTLIST SERVICE
// ====================================

class CjEbayOpportunityShortlistService {

  // ---- DISCOVER (orchestration) ------------------------------------------------

  /**
   * Starts a discovery run. Creates the run record, then executes the pipeline
   * asynchronously. Returns the runId immediately so the caller can poll.
   */
  async startDiscoveryRun(
    userId: number,
    req: DiscoverOpportunitiesRequest
  ): Promise<{ runId: string; status: string }> {
    const settings = buildRunSettings(req);

    const run = await prisma.cjEbayOpportunityRun.create({
      data: {
        userId,
        status: 'PENDING',
        mode: settings.mode,
        settings: settings as object,
      },
    });

    // Execute async — don't await. Caller polls via GET /runs/:runId.
    this.executePipeline(run.id, userId, settings).catch((err) => {
      logger.error(`[OpportunityShortlist] Pipeline error for run ${run.id}: ${err.message}`);
    });

    return { runId: run.id, status: 'PENDING' };
  }

  private async executePipeline(
    runId: string,
    userId: number,
    settings: OpportunityRunSettings
  ): Promise<void> {
    try {
      await prisma.cjEbayOpportunityRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      // Step 1: Trend discovery (real eBay Browse or mock fallback).
      const { seeds, providerUsed, providerNote } = await cjEbayTrendDiscoveryService.discoverSeeds(
        settings,
        undefined,
        userId,
      );
      logger.info(`[OpportunityShortlist] Run ${runId}: ${seeds.length} seeds via ${providerUsed} — ${providerNote}`);

      await prisma.cjEbayOpportunityRun.update({
        where: { id: runId },
        data: { seedCount: seeds.length },
      });

      // Step 2: CJ candidate matching.
      const adapter = createCjSupplierAdapter(userId);
      const matches = await cjEbayCandidateMatchingService.matchSeeds(seeds, settings, adapter);

      logger.info(`[OpportunityShortlist] Run ${runId}: ${matches.length} CJ matches found`);

      await prisma.cjEbayOpportunityRun.update({
        where: { id: runId },
        data: { candidateCount: matches.length },
      });

      if (matches.length === 0) {
        await prisma.cjEbayOpportunityRun.update({
          where: { id: runId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            shortlistedCount: 0,
          },
        });
        return;
      }

      // Step 3 + 4: Pricing + Scoring for each match (with real market prices).
      const settingsRow = await cjEbayConfigService.getOrCreateSettings(userId);
      const scored = await this.scoreCandidates(matches, settings, settingsRow, userId);

      // Step 5: Build shortlist (top N by score, above minimum threshold).
      const shortlist = scored
        .filter((c) => c.score.totalScore >= settings.minScoreForShortlist)
        .sort((a, b) => b.score.totalScore - a.score.totalScore)
        .slice(0, settings.shortlistSize);

      logger.info(
        `[OpportunityShortlist] Run ${runId}: ${shortlist.length} candidates shortlisted (min score: ${settings.minScoreForShortlist})`
      );

      // Step 6: Persist candidates (including 3G.1 data quality fields).
      for (const candidate of shortlist) {
        const dq = candidate.dataQuality;
        await prisma.cjEbayOpportunityCandidate.create({
          data: {
            runId,
            userId,
            seedKeyword: candidate.match.seed.keyword,
            seedCategory: candidate.match.seed.category ?? null,
            seedTrendConfidence: new Decimal(candidate.match.seed.trendConfidence),
            seedSource: candidate.match.seed.source,
            cjProductId: candidate.match.cjProductId,
            cjProductTitle: candidate.match.cjProductTitle,
            cjVariantSku: candidate.match.selectedVariant.cjSku,
            cjVariantVid: candidate.match.selectedVariant.cjVid ?? null,
            images: candidate.match.images,
            supplierCostUsd: new Decimal(candidate.match.selectedVariant.unitCostUsd),
            shippingUsd: new Decimal(candidate.match.shipping?.amountUsd ?? 0),
            shippingConfidence: candidate.match.shipping?.confidence ?? 'UNKNOWN',
            shippingDaysMin: candidate.match.shipping?.daysMin ?? null,
            shippingDaysMax: candidate.match.shipping?.daysMax ?? null,
            stockCount: candidate.match.selectedVariant.stock > 0 ? candidate.match.selectedVariant.stock : null,
            marketObservedPriceUsd:
              candidate.pricing.marketObservedPriceUsd != null
                ? new Decimal(candidate.pricing.marketObservedPriceUsd)
                : null,
            pricingBreakdown: candidate.pricing as object,
            scoreBreakdown: candidate.score as object,
            totalScore: new Decimal(candidate.score.totalScore),
            recommendationReason: candidate.reason,
            status: 'SHORTLISTED',
            // 3G.1 data quality
            trendSourceType: dq.trendSourceType,
            marketPriceSourceType: dq.marketPriceSourceType,
            dataConfidenceScore: new Decimal(dq.dataConfidenceScore),
            recommendationConfidence: dq.recommendationConfidence,
            starterSuitability: dq.starterSuitability,
            evidenceSummary: dq.evidenceSummary,
            marketPriceDetail: candidate.marketPriceResult as object,
          },
        });
      }

      await prisma.cjEbayOpportunityRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          shortlistedCount: shortlist.length,
        },
      });
    } catch (err) {
      const msg = (err as Error).message;
      logger.error(`[OpportunityShortlist] Run ${runId} FAILED: ${msg}`);
      await prisma.cjEbayOpportunityRun.update({
        where: { id: runId },
        data: { status: 'FAILED', errorMessage: msg, completedAt: new Date() },
      }).catch(() => {});
    }
  }

  private async scoreCandidates(
    matches: CjCandidateMatch[],
    settings: OpportunityRunSettings,
    settingsRow: OpportunitySettingsRow,
    userId: number,
  ): Promise<Array<{
    match: CjCandidateMatch;
    pricing: CjOpportunityPricingResult;
    score: OpportunityScoreBreakdown;
    reason: string;
    dataQuality: CandidateDataQuality;
    marketPriceResult: MarketObservedPriceResult;
  }>> {
    // Cache market price results per keyword to avoid duplicate Browse calls
    const marketPriceCache = new Map<string, MarketObservedPriceResult>();

    const results = [];
    for (const match of matches) {
      // Fetch or reuse real market price for this keyword
      let marketPriceResult = marketPriceCache.get(match.seed.keyword);
      if (!marketPriceResult) {
        marketPriceResult = await cjEbayMarketObservedPriceService.fetchMarketPrice(
          match.seed.keyword,
          userId,
        );
        marketPriceCache.set(match.seed.keyword, marketPriceResult);
      }

      const pricing = cjEbayOpportunityPricingService.computePricing(
        match,
        settingsRow,
        marketPriceResult,
      );

      const score = cjEbayOpportunityScoringService.score(match, pricing, settings);
      const reason = cjEbayOpportunityScoringService.buildRecommendationReason(score, pricing);

      const trendSourceType: DataSourceType =
        match.seed.source === 'EBAY_RESEARCH' ? 'REAL' :
        match.seed.source === 'MANUAL' ? 'HYBRID' : 'MOCK';

      const dataQuality = computeCandidateDataQuality(
        trendSourceType,
        pricing,
        score,
        match.shipping?.confidence ?? 'UNKNOWN',
        marketPriceResult.evidenceSummary,
      );

      results.push({ match, pricing, score, reason, dataQuality, marketPriceResult });
    }
    return results;
  }

  // ---- RUN QUERIES ------------------------------------------------

  async getRunSummary(runId: string, userId: number): Promise<OpportunityRunSummary | null> {
    const run = await prisma.cjEbayOpportunityRun.findFirst({
      where: { id: runId, userId },
    });
    if (!run) return null;
    return mapRunToSummary(run);
  }

  async getLatestRunSummary(userId: number): Promise<OpportunityRunSummary | null> {
    const run = await prisma.cjEbayOpportunityRun.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!run) return null;
    return mapRunToSummary(run);
  }

  async listRuns(userId: number, limit = 10): Promise<OpportunityRunSummary[]> {
    const runs = await prisma.cjEbayOpportunityRun.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return runs.map(mapRunToSummary);
  }

  // ---- CANDIDATE QUERIES ------------------------------------------------

  async getRunCandidates(runId: string, userId: number): Promise<CandidateListItem[]> {
    const candidates = await prisma.cjEbayOpportunityCandidate.findMany({
      where: { runId, userId },
      orderBy: { totalScore: 'desc' },
    });
    return candidates.map(mapCandidateToListItem);
  }

  async getCandidate(id: string, userId: number): Promise<CandidateListItem | null> {
    const c = await prisma.cjEbayOpportunityCandidate.findFirst({
      where: { id, userId },
    });
    if (!c) return null;
    return mapCandidateToListItem(c);
  }

  async getActiveRecommendations(userId: number): Promise<CandidateListItem[]> {
    // All candidates from the most recent completed run, sorted by score.
    // Returns all statuses (SHORTLISTED, APPROVED, REJECTED, DEFERRED) so the
    // UI can show the full picture on page reload instead of an empty list.
    const latestRun = await prisma.cjEbayOpportunityRun.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!latestRun) return [];

    const candidates = await prisma.cjEbayOpportunityCandidate.findMany({
      where: { runId: latestRun.id, userId },
      orderBy: { totalScore: 'desc' },
    });
    return candidates.map(mapCandidateToListItem);
  }

  // ---- HUMAN REVIEW ACTIONS ------------------------------------------------

  async approveCandidate(id: string, userId: number, notes?: string): Promise<CandidateListItem> {
    const candidate = await this.findCandidateOrThrow(id, userId);
    if (candidate.status !== 'SHORTLISTED') {
      throw new Error(`Candidate ${id} is already ${candidate.status} — only SHORTLISTED candidates can be reviewed`);
    }
    const updated = await prisma.cjEbayOpportunityCandidate.update({
      where: { id },
      data: { status: 'APPROVED', reviewNotes: notes ?? null, reviewedAt: new Date() },
    });
    await this.incrementRunCounter(candidate.runId, 'approvedCount');
    return mapCandidateToListItem(updated);
  }

  async rejectCandidate(id: string, userId: number, notes?: string): Promise<CandidateListItem> {
    const candidate = await this.findCandidateOrThrow(id, userId);
    if (candidate.status !== 'SHORTLISTED') {
      throw new Error(`Candidate ${id} is already ${candidate.status} — only SHORTLISTED candidates can be reviewed`);
    }
    const updated = await prisma.cjEbayOpportunityCandidate.update({
      where: { id },
      data: { status: 'REJECTED', reviewNotes: notes ?? null, reviewedAt: new Date() },
    });
    await this.incrementRunCounter(candidate.runId, 'rejectedCount');
    return mapCandidateToListItem(updated);
  }

  async deferCandidate(id: string, userId: number, notes?: string): Promise<CandidateListItem> {
    const candidate = await this.findCandidateOrThrow(id, userId);
    if (candidate.status !== 'SHORTLISTED') {
      throw new Error(`Candidate ${id} is already ${candidate.status} — only SHORTLISTED candidates can be reviewed`);
    }
    const updated = await prisma.cjEbayOpportunityCandidate.update({
      where: { id },
      data: { status: 'DEFERRED', reviewNotes: notes ?? null, reviewedAt: new Date() },
    });
    await this.incrementRunCounter(candidate.runId, 'deferredCount');
    return mapCandidateToListItem(updated);
  }

  /**
   * Handoff: mark candidate as approved + linked to an evaluation record.
   * Call this after the evaluation pipeline creates the CjEbayProductEvaluation record.
   */
  async markHandedOff(id: string, userId: number, evaluationId: number): Promise<void> {
    await prisma.cjEbayOpportunityCandidate.updateMany({
      where: { id, userId },
      data: {
        handedOffAt: new Date(),
        linkedEvaluationId: evaluationId,
        status: 'APPROVED',
      },
    });
  }

  // ---- PRIVATE HELPERS ------------------------------------------------

  private async findCandidateOrThrow(id: string, userId: number) {
    const c = await prisma.cjEbayOpportunityCandidate.findFirst({ where: { id, userId } });
    if (!c) throw new Error(`Candidate ${id} not found for user ${userId}`);
    return c;
  }

  private async incrementRunCounter(
    runId: string,
    field: 'approvedCount' | 'rejectedCount' | 'deferredCount'
  ) {
    await prisma.cjEbayOpportunityRun.updateMany({
      where: { id: runId },
      data: { [field]: { increment: 1 } },
    });
  }
}

export const cjEbayOpportunityShortlistService = new CjEbayOpportunityShortlistService();
