/**
 * Phase 18: Competitor Intelligence Engine.
 * Analyzes competing listings on MercadoLibre and eBay: keyword patterns, price ranges,
 * image counts, sales velocity estimate, competition score. Stores results in competitor_insights.
 */
import { prisma } from '../config/database';
import logger from '../config/logger';
import { MarketplaceService } from './marketplace.service';
import { MercadoLibreService } from './mercadolibre.service';
import type { MercadoLibreCredentials } from './mercadolibre.service';
import { EbayService } from './ebay.service';
import type { EbayCredentials } from './ebay.service';

const ms = new MarketplaceService();

export interface CompetitorInsightInput {
  userId: number;
  marketplace: 'mercadolibre' | 'ebay';
  listingId?: number;
  categoryId?: string;
  keywords?: string;
}

export interface CompetitorInsightOutput {
  listingId: number | null;
  userId: number;
  marketplace: string;
  categoryId: string | null;
  keywordPatterns: string[] | null;
  priceMin: number | null;
  priceMax: number | null;
  priceMedian: number | null;
  imageCountAvg: number | null;
  salesVelocityEst: number | null;
  competitionScore: number | null;
  competitorCount: number | null;
  insightId: number;
}

/**
 * Extract top recurring words from titles (keyword patterns).
 */
function extractKeywordPatterns(titles: string[], maxWords = 15): string[] {
  const count = new Map<string, number>();
  const stop = new Set(
    'de la el los las un una en con por para al del que es no se lo como mas pero sus sin'.split(' ')
  );
  for (const t of titles) {
    const words = (t || '')
      .toLowerCase()
      .replace(/[^\w\sáéíóúñü]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stop.has(w) && !/^\d+$/.test(w));
    for (const w of words) count.set(w, (count.get(w) || 0) + 1);
  }
  return Array.from(count.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords)
    .map(([w]) => w);
}

/**
 * Analyze MercadoLibre competitors for a query/category and persist insight.
 */
async function analyzeMercadoLibre(
  userId: number,
  query: string,
  categoryId: string | null,
  listingId: number | null
): Promise<CompetitorInsightOutput | null> {
  const credentials = await ms.getCredentials(userId, 'mercadolibre', 'production');
  if (!credentials?.credentials?.accessToken) return null;
  const creds = credentials.credentials as MercadoLibreCredentials;
  const mlService = new MercadoLibreService({
    ...creds,
    siteId: creds.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
  });

  const siteId = creds.siteId || 'MLC';
  const limit = 50;
  const results = await mlService.searchProducts({ siteId, q: query, limit });
  if (!results.length) {
    const insight = await prisma.competitorInsight.create({
      data: {
        userId,
        marketplace: 'mercadolibre',
        listingId,
        categoryId,
        keywordPatterns: JSON.stringify([]),
        competitorCount: 0,
        competitionScore: 0,
      },
    });
    return { listingId, userId, marketplace: 'mercadolibre', categoryId, keywordPatterns: [], priceMin: null, priceMax: null, priceMedian: null, imageCountAvg: null, salesVelocityEst: null, competitionScore: 0, competitorCount: 0, insightId: insight.id };
  }

  const prices = results.map((r) => Number(r.price)).filter(Number.isFinite);
  const titles = results.map((r) => (r as any).title || '').filter(Boolean);
  const priceMin = prices.length ? Math.min(...prices) : null;
  const priceMax = prices.length ? Math.max(...prices) : null;
  const priceMedian =
    prices.length > 0
      ? prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)]
      : null;
  const keywordPatterns = extractKeywordPatterns(titles);
  const competitorCount = results.length;
  const competitionScore = Math.min(100, competitorCount * 2 + (prices.length > 10 ? 20 : 0));

  const insight = await prisma.competitorInsight.create({
    data: {
      userId,
      marketplace: 'mercadolibre',
      listingId,
      categoryId,
      keywordPatterns: JSON.stringify(keywordPatterns),
      priceMin: priceMin != null ? priceMin : undefined,
      priceMax: priceMax != null ? priceMax : undefined,
      priceMedian: priceMedian != null ? priceMedian : undefined,
      imageCountAvg: null,
      salesVelocityEst: null,
      competitionScore,
      competitorCount,
      metadata: { sampleCount: results.length, query },
    },
  });

  return {
    listingId,
    userId,
    marketplace: 'mercadolibre',
    categoryId,
    keywordPatterns,
    priceMin,
    priceMax,
    priceMedian,
    imageCountAvg: null,
    salesVelocityEst: null,
    competitionScore,
    competitorCount,
    insightId: insight.id,
  };
}

/**
 * Analyze eBay competitors (search by keyword) and persist insight.
 */
async function analyzeEbay(
  userId: number,
  query: string,
  categoryId: string | null,
  listingId: number | null
): Promise<CompetitorInsightOutput | null> {
  const credentials = await ms.getCredentials(userId, 'ebay', 'production');
  if (!credentials?.credentials) return null;
  const ebayService = new EbayService({
    ...(credentials.credentials as EbayCredentials),
    sandbox: credentials.environment === 'sandbox',
  });

  let results: Array<{ price?: { value?: string }; title?: string }> = [];
  try {
    results = await ebayService.searchProducts({ keywords: query, limit: 50 });
  } catch (err: any) {
    logger.warn('[COMPETITOR-INTEL] eBay search failed', { query, error: err?.message });
    const insight = await prisma.competitorInsight.create({
      data: {
        userId,
        marketplace: 'ebay',
        listingId,
        categoryId,
        competitorCount: 0,
        competitionScore: 0,
        metadata: { error: err?.message },
      },
    });
    return { listingId, userId, marketplace: 'ebay', categoryId, keywordPatterns: [], priceMin: null, priceMax: null, priceMedian: null, imageCountAvg: null, salesVelocityEst: null, competitionScore: 0, competitorCount: 0, insightId: insight.id };
  }

  if (!results.length) {
    const insight = await prisma.competitorInsight.create({
      data: { userId, marketplace: 'ebay', listingId, categoryId, competitorCount: 0, competitionScore: 0 },
    });
    return { listingId, userId, marketplace: 'ebay', categoryId, keywordPatterns: [], priceMin: null, priceMax: null, priceMedian: null, imageCountAvg: null, salesVelocityEst: null, competitionScore: 0, competitorCount: 0, insightId: insight.id };
  }

  const prices = results
    .map((r) => (r as any).price?.value != null ? parseFloat(String((r as any).price.value)) : NaN)
    .filter(Number.isFinite);
  const titles = results.map((r) => (r as any).title || '').filter(Boolean);
  const priceMin = prices.length ? Math.min(...prices) : null;
  const priceMax = prices.length ? Math.max(...prices) : null;
  const priceMedian = prices.length ? prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)] : null;
  const keywordPatterns = extractKeywordPatterns(titles);
  const competitorCount = results.length;
  const competitionScore = Math.min(100, competitorCount * 2 + (prices.length > 10 ? 20 : 0));

  const insight = await prisma.competitorInsight.create({
    data: {
      userId,
      marketplace: 'ebay',
      listingId,
      categoryId,
      keywordPatterns: JSON.stringify(keywordPatterns),
      priceMin: priceMin ?? undefined,
      priceMax: priceMax ?? undefined,
      priceMedian: priceMedian ?? undefined,
      competitionScore,
      competitorCount,
      metadata: { sampleCount: results.length, query },
    },
  });

  return {
    listingId,
    userId,
    marketplace: 'ebay',
    categoryId,
    keywordPatterns,
    priceMin,
    priceMax,
    priceMedian,
    imageCountAvg: null,
    salesVelocityEst: null,
    competitionScore,
    competitorCount,
    insightId: insight.id,
  };
}

/**
 * Run competitor analysis for the given input and store in competitor_insights.
 */
export async function runCompetitorAnalysis(input: CompetitorInsightInput): Promise<CompetitorInsightOutput | null> {
  const query = (input.keywords || '').trim() || 'producto';
  const listingId = input.listingId ?? null;
  const categoryId = input.categoryId ?? null;

  if (input.marketplace === 'mercadolibre') {
    return analyzeMercadoLibre(input.userId, query, categoryId, listingId);
  }
  if (input.marketplace === 'ebay') {
    return analyzeEbay(input.userId, query, categoryId, listingId);
  }
  return null;
}

/**
 * Run competitor analysis for all active listings of a user (or all users) and store insights.
 * Uses product title as search query per listing.
 */
export async function runCompetitorAnalysisForUser(userId: number): Promise<{ analyzed: number; errors: string[] }> {
  const listings = await prisma.marketplaceListing.findMany({
    where: { userId, publishedAt: { not: null } },
    select: { id: true, marketplace: true, productId: true },
    take: 100,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: listings.map((l) => l.productId) } },
    select: { id: true, title: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  let analyzed = 0;
  const errors: string[] = [];
  for (const listing of listings) {
    const mp = listing.marketplace.toLowerCase();
    if (mp !== 'mercadolibre' && mp !== 'ebay') continue;
    const product = productById.get(listing.productId);
    const keywords = product?.title?.slice(0, 100) || '';
    try {
      const out = await runCompetitorAnalysis({
        userId,
        marketplace: mp as 'mercadolibre' | 'ebay',
        listingId: listing.id,
        keywords,
      });
      if (out) analyzed++;
    } catch (e: any) {
      errors.push(`Listing ${listing.id}: ${e?.message || String(e)}`);
    }
  }
  return { analyzed, errors };
}

/**
 * Phase 18: Get keyword suggestions from latest competitor insights for SEO (titles, attributes).
 * Used by Auto Listing Strategy and listing generation to improve marketplace ranking.
 */
export async function getCompetitorKeywordSuggestions(
  userId: number,
  marketplace: string,
  categoryId?: string | null,
  listingId?: number | null
): Promise<string[]> {
  const where: { userId: number; marketplace: string; categoryId?: string | null; listingId?: number | null } = {
    userId,
    marketplace,
  };
  if (categoryId != null) where.categoryId = categoryId;
  if (listingId != null) where.listingId = listingId;
  const latest = await prisma.competitorInsight.findFirst({
    where,
    orderBy: { analyzedAt: 'desc' },
    select: { keywordPatterns: true },
  });
  if (!latest?.keywordPatterns) return [];
  try {
    const arr = JSON.parse(latest.keywordPatterns);
    return Array.isArray(arr) ? arr.slice(0, 10) : [];
  } catch {
    return [];
  }
}
