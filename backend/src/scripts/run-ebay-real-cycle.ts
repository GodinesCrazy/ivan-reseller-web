import { prisma } from '../config/database';
import logger from '../config/logger';
import { trendsService, type TrendKeyword } from '../services/trends.service';
import aliExpressService from '../modules/aliexpress/aliexpress.service';
import type { AliExpressProduct } from '../modules/aliexpress/aliexpress.types';
import { profitabilityService, type ProfitabilityEvaluation } from '../modules/profitability/profitability.service';
import { EbayPublisher } from '../modules/marketplace/ebay.publisher';
import { PublishMode } from '../modules/marketplace/marketplace.types';
import type { PublishableProduct } from '../modules/marketplace/marketplace.types';

type CandidateRecord = {
  productId: number;
  candidateId: string;
  trendScore: number;
  priority: 'high' | 'medium' | 'low';
  keyword: string;
};

const USER_ID = Number(process.env.REAL_CYCLE_USER_ID || 1);
const MIN_MARGIN = Number(process.env.REAL_CYCLE_MIN_MARGIN || 15);
const REGION = process.env.REAL_CYCLE_REGION || 'US';
const DAYS = Number(process.env.REAL_CYCLE_DAYS || 30);

const REQUIRED_EBAY_ENV = ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN', 'EBAY_ENV'];
const REQUIRED_ALIEXPRESS_ENV = ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET'];

const FILTERS = {
  MIN_PRICE: parseFloat(process.env.ALIEXPRESS_MIN_PRICE || '0.01'),
  REQUIRE_SHIPPING_INFO: process.env.ALIEXPRESS_REQUIRE_SHIPPING_INFO !== 'false',
};

async function assertEnvVars(keys: string[]): Promise<void> {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
  }
}

async function validatePreconditions(): Promise<void> {
  console.log('[PRECHECK] Validating environment variables');
  await assertEnvVars(REQUIRED_EBAY_ENV);
  await assertEnvVars(REQUIRED_ALIEXPRESS_ENV);

  if (process.env.ENABLE_EBAY_PUBLISH !== 'true') {
    throw new Error('ENABLE_EBAY_PUBLISH debe ser true para publicar en eBay.');
  }

  const env = (process.env.EBAY_ENV || '').toLowerCase();
  if (!['production', 'sandbox'].includes(env)) {
    throw new Error('EBAY_ENV debe ser "production" o "sandbox".');
  }

  console.log('[PRECHECK] Validating database connectivity');
  await prisma.$queryRaw`SELECT 1`;

  console.log('[PRECHECK] Validating AliExpress Affiliate API');
  const validation = await aliExpressService.searchProducts({
    keywords: 'phone case',
    pageNo: 1,
    pageSize: 1,
  });
  if (!validation.products || validation.products.length === 0) {
    throw new Error('AliExpress Affiliate API no retorno productos.');
  }
}

function parsePrice(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(/,/g, '').trim();
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeProduct(product: AliExpressProduct, keyword: TrendKeyword) {
  return {
    productId: product.productId,
    title: product.productTitle || '',
    basePrice: parsePrice(product.salePrice || product.originalPrice),
    currency: product.currency || 'USD',
    shippingCost: null,
    estimatedDeliveryDays: null,
    rating: null,
    ordersCount: null,
    affiliateLink: product.productUrl,
    sourceKeyword: keyword.keyword,
    trendScore: keyword.score,
    priority: keyword.priority,
    productUrl: product.productUrl,
    productImageUrl: product.productImageUrl || '',
    shopName: product.shopName,
    shopUrl: product.shopUrl,
  };
}

function passesBasicFilters(candidate: ReturnType<typeof normalizeProduct>): boolean {
  if (candidate.basePrice <= FILTERS.MIN_PRICE) return false;
  if (!candidate.title || candidate.title.trim().length === 0) return false;
  if (candidate.title.length > 200) return false;
  if (FILTERS.REQUIRE_SHIPPING_INFO && (!candidate.productUrl || candidate.productUrl.length === 0)) {
    return false;
  }
  return true;
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cleanDescription(description: string | null | undefined, title: string): string {
  const base = description && description.trim().length > 0 ? description : `Product: ${title}`;
  return base.replace(/\s+/g, ' ').trim();
}

async function persistCandidates(
  candidates: ReturnType<typeof normalizeProduct>[],
): Promise<CandidateRecord[]> {
  const created: CandidateRecord[] = [];

  for (const candidate of candidates) {
    const existing = await prisma.product.findFirst({
      where: { aliexpressUrl: candidate.productUrl, userId: USER_ID },
      select: { id: true },
    });
    if (existing) continue;

    const product = await prisma.product.create({
      data: {
        userId: USER_ID,
        aliexpressUrl: candidate.productUrl,
        title: candidate.title,
        description: '',
        aliexpressPrice: candidate.basePrice,
        suggestedPrice: Math.max(candidate.basePrice * 2, candidate.basePrice + 1),
        currency: candidate.currency,
        category: candidate.sourceKeyword,
        images: JSON.stringify(candidate.productImageUrl ? [candidate.productImageUrl] : []),
        productData: JSON.stringify({
          productId: candidate.productId,
          sourceKeyword: candidate.sourceKeyword,
          trendScore: candidate.trendScore,
          priority: candidate.priority,
          affiliateLink: candidate.affiliateLink,
          source: 'trends->aliexpress',
          createdBy: 'real-cycle',
        }),
        status: 'candidate',
        isPublished: false,
      },
    });

    created.push({
      productId: product.id,
      candidateId: candidate.productId,
      trendScore: candidate.trendScore,
      priority: candidate.priority,
      keyword: candidate.sourceKeyword,
    });
  }

  return created;
}

export async function runEbayRealCycle(): Promise<{
  success: boolean;
  message: string;
  data?: {
    keywordsAnalyzed: string[];
    productsFound: number;
    productsPublishable: number;
    productPublished: string;
    listingId?: string;
    price: number;
    expectedProfit: number;
  };
  error?: string;
}> {
  try {
    await validatePreconditions();

    console.log('[TRENDS] Fetching trending keywords');
    const keywords = await trendsService.getTrendingKeywords({
      userId: USER_ID,
      region: REGION,
      days: DAYS,
      maxKeywords: 20,
    });

    const filteredKeywords = keywords.filter(
      (kw) => ['high', 'medium'].includes(kw.priority) && kw.score >= 40,
    );

    console.log('[TRENDS] Keywords selected', {
      total: keywords.length,
      filtered: filteredKeywords.length,
      keywords: filteredKeywords.map((kw) => ({
        keyword: kw.keyword,
        score: kw.score,
        priority: kw.priority,
      })),
    });

    if (filteredKeywords.length === 0) {
      throw new Error('No se encontraron keywords con prioridad y score suficiente.');
    }

    console.log('[ALIEXPRESS] Searching products by keyword');
    const allCandidates: ReturnType<typeof normalizeProduct>[] = [];
    const seen = new Set<string>();

    for (const keyword of filteredKeywords.slice(0, 5)) {
      const searchResult = await aliExpressService.searchProducts({
        keywords: keyword.keyword,
        pageNo: 1,
        pageSize: 10,
      });

      for (const product of searchResult.products) {
        const candidate = normalizeProduct(product, keyword);
        if (!passesBasicFilters(candidate)) continue;
        if (seen.has(candidate.productId)) continue;
        seen.add(candidate.productId);
        allCandidates.push(candidate);
      }
    }

    console.log('[ALIEXPRESS] Candidates normalized', {
      total: allCandidates.length,
    });

    const createdCandidates = await persistCandidates(allCandidates);
    console.log('[ALIEXPRESS] Candidates persisted', {
      total: createdCandidates.length,
    });

    if (createdCandidates.length === 0) {
      throw new Error('No se persistieron candidatos desde AliExpress.');
    }

    console.log('[PROFITABILITY] Evaluating candidates');
    const evaluations: Array<ProfitabilityEvaluation & { productId: number; trendScore: number }> = [];

    for (const record of createdCandidates) {
      const product = await prisma.product.findUnique({ where: { id: record.productId } });
      if (!product) continue;

      const evaluation = await profitabilityService.evaluateProduct(
        {
          productId: record.candidateId,
          title: product.title,
          basePrice: Number(product.aliexpressPrice),
          currency: product.currency || 'USD',
          shippingCost: product.shippingCost ? Number(product.shippingCost) : null,
          estimatedDeliveryDays: null,
          rating: null,
          ordersCount: null,
          affiliateLink: product.aliexpressUrl,
          sourceKeyword: record.keyword,
          trendScore: record.trendScore,
          priority: record.priority,
          productUrl: product.aliexpressUrl,
          productImageUrl: (() => {
            try {
              const images = JSON.parse(product.images);
              return images?.[0] || '';
            } catch {
              return '';
            }
          })(),
        },
        {
          marketplace: 'ebay',
          targetCountry: REGION,
          desiredMargin: 0.25,
          minMargin: MIN_MARGIN / 100,
        },
      );

      const updatedBreakdown = profitabilityService.recalculateCostsWithSalePrice(
        evaluation.costBreakdown,
        evaluation.salePrice,
        {
          marketplace: 'ebay',
          targetCountry: REGION,
          desiredMargin: 0.25,
          minMargin: MIN_MARGIN / 100,
        },
      );

      const profit = evaluation.salePrice - updatedBreakdown.totalCost;
      const profitMargin = evaluation.salePrice > 0 ? (profit / evaluation.salePrice) * 100 : 0;

      await prisma.product.update({
        where: { id: product.id },
        data: {
          status: evaluation.decision === 'publish' ? 'publishable' : 'discarded',
          suggestedPrice: evaluation.salePrice,
          finalPrice: evaluation.salePrice,
          shippingCost: updatedBreakdown.shippingCost,
          importTax: updatedBreakdown.taxesAndDuties,
          totalCost: updatedBreakdown.totalCost,
          targetCountry: REGION,
          productData: JSON.stringify({
            ...(product.productData ? JSON.parse(product.productData) : {}),
            profitabilityEvaluation: {
              decision: evaluation.decision,
              reason: evaluation.reason,
              estimatedProfit: profit,
              profitMargin,
              costBreakdown: updatedBreakdown,
              evaluatedAt: evaluation.evaluatedAt.toISOString(),
            },
          }),
          updatedAt: new Date(),
        },
      });

      evaluations.push({
        ...evaluation,
        productId: product.id,
        trendScore: record.trendScore,
      });
    }

    const publishable = evaluations.filter(
      (evaluation) =>
        evaluation.decision === 'publish' && evaluation.profitMargin >= MIN_MARGIN,
    );

    console.log('[PROFITABILITY] Publishable results', {
      total: evaluations.length,
      publishable: publishable.length,
    });

    if (publishable.length === 0) {
      throw new Error('No hay productos publishable con margen suficiente.');
    }

    publishable.sort((a, b) => {
      if (b.profitMargin !== a.profitMargin) return b.profitMargin - a.profitMargin;
      return b.trendScore - a.trendScore;
    });

    const selected = publishable[0];
    const selectedProduct = await prisma.product.findUnique({
      where: { id: selected.productId },
    });

    if (!selectedProduct) {
      throw new Error('Producto seleccionado no encontrado.');
    }

    console.log('[EBAY-PUBLISH] Publishing selected product', {
      productId: selectedProduct.id,
      title: selectedProduct.title,
      price: selected.salePrice,
      profitMargin: selected.profitMargin,
    });

    const publisher = new EbayPublisher();
    const publishPayload: PublishableProduct = {
      id: selectedProduct.id,
      userId: selectedProduct.userId,
      title: cleanTitle(selectedProduct.title),
      description: cleanDescription(selectedProduct.description, selectedProduct.title),
      suggestedPrice: Number(selectedProduct.suggestedPrice),
      finalPrice: selectedProduct.finalPrice ? Number(selectedProduct.finalPrice) : null,
      currency: selectedProduct.currency,
      category: selectedProduct.category,
      images: selectedProduct.images,
      targetCountry: selectedProduct.targetCountry,
    };

    const publishResult = await publisher.publishProduct(publishPayload, PublishMode.STAGING_REAL);

    await prisma.marketplacePublication.create({
      data: {
        productId: selectedProduct.id,
        userId: selectedProduct.userId,
        marketplace: 'ebay',
        listingId: publishResult.listingId,
        publishStatus: publishResult.status,
        publishedAt: publishResult.status === 'published' ? new Date() : null,
        publishMode: PublishMode.STAGING_REAL,
        rawResponse: publishResult.rawResponse ? JSON.stringify(publishResult.rawResponse) : null,
      },
    });

    if (publishResult.status === 'published' && publishResult.listingId) {
      await prisma.marketplaceListing.create({
        data: {
          productId: selectedProduct.id,
          userId: selectedProduct.userId,
          marketplace: 'ebay',
          listingId: publishResult.listingId,
          listingUrl: publishResult.listingUrl,
          publishedAt: new Date(),
        },
      });

      await prisma.product.update({
        where: { id: selectedProduct.id },
        data: {
          status: 'PUBLISHED',
          isPublished: true,
          publishedAt: new Date(),
        },
      });
    }

    const reportData = {
      keywordsAnalyzed: filteredKeywords.map((kw) => kw.keyword),
      productsFound: allCandidates.length,
      productsPublishable: publishable.length,
      productPublished: selectedProduct.title,
      listingId: publishResult.listingId,
      price: selected.salePrice,
      expectedProfit: selected.estimatedProfit,
    };

    console.log('[REPORT] FINAL', reportData);

    if (publishResult.status !== 'published') {
      throw new Error(`Publicacion fallida: ${publishResult.message || 'Unknown error'}`);
    }

    console.log('Ciclo real de dropshipping con eBay ejecutado correctamente');

    return {
      success: true,
      message: 'Ciclo real de dropshipping con eBay ejecutado correctamente',
      data: reportData,
    };
  } catch (error: any) {
    logger.error('[REAL-CYCLE] Error ejecutando ciclo', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return {
      success: false,
      message: 'Error ejecutando ciclo real de eBay',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

if (require.main === module) {
  runEbayRealCycle()
    .catch((error) => {
      logger.error('[REAL-CYCLE] Error', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('ERROR:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
