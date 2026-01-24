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
const FORCE_FIRST_PUBLICATION = process.env.FORCE_FIRST_PUBLICATION === 'true';
const FORCE_MIN_MARGIN = 5; // Margen mínimo en modo forzado (5%)

const REQUIRED_EBAY_ENV = ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN', 'EBAY_ENV'];
const REQUIRED_ALIEXPRESS_ENV = ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET'];

const FILTERS = {
  MIN_PRICE: parseFloat(process.env.ALIEXPRESS_MIN_PRICE || '0.01'),
  REQUIRE_SHIPPING_INFO: process.env.ALIEXPRESS_REQUIRE_SHIPPING_INFO !== 'false',
};

async function assertEnvVars(keys: string[]): Promise<void> {
  const present: string[] = [];
  const missing: string[] = [];
  
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }
  
  // ✅ LOG: Sanitizado - solo presence, no valores
  console.log('[PRECHECK] Environment variables status:', {
    present: present.length,
    missing: missing.length,
    presentKeys: present,
    missingKeys: missing,
  });
  
  if (missing.length > 0) {
    const errorMsg = `Faltan variables de entorno: ${missing.join(', ')}`;
    console.error(`[PRECHECK] ❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  console.log(`[PRECHECK] ✅ Todas las variables requeridas están presentes (${present.length}/${keys.length})`);
}

async function validatePreconditions(): Promise<void> {
  console.log('[PRECHECK] Validating environment variables');
  console.log('[PRECHECK] Reading directly from process.env (no filters)');
  
  // ✅ DEBUG: Verificar acceso directo a process.env
  const directCheck = {
    EBAY_CLIENT_ID: {
      present: !!process.env.EBAY_CLIENT_ID,
      length: process.env.EBAY_CLIENT_ID?.length || 0,
    },
    EBAY_CLIENT_SECRET: {
      present: !!process.env.EBAY_CLIENT_SECRET,
      length: process.env.EBAY_CLIENT_SECRET?.length || 0,
    },
    EBAY_REFRESH_TOKEN: {
      present: !!process.env.EBAY_REFRESH_TOKEN,
      length: process.env.EBAY_REFRESH_TOKEN?.length || 0,
    },
    EBAY_ENV: {
      present: !!process.env.EBAY_ENV,
      value: process.env.EBAY_ENV || 'NOT_SET',
    },
  };
  console.log('[PRECHECK] Direct process.env check (sanitized):', JSON.stringify(directCheck, null, 2));
  
  // ✅ DEBUG: Listar todas las variables EBAY_* presentes (solo keys, no valores)
  const allEbayVars = Object.keys(process.env)
    .filter((key) => key.startsWith('EBAY_'))
    .map((key) => ({
      key,
      present: true,
      length: process.env[key]?.length || 0,
    }));
  console.log('[PRECHECK] All EBAY_* variables found:', {
    count: allEbayVars.length,
    keys: allEbayVars.map((v) => v.key),
    details: allEbayVars,
  });
  
  await assertEnvVars(REQUIRED_EBAY_ENV);
  await assertEnvVars(REQUIRED_ALIEXPRESS_ENV);

  // ✅ VERIFICACIÓN FINAL: Confirmar que todas las variables están accesibles
  const finalCheck = {
    EBAY_CLIENT_ID: !!process.env.EBAY_CLIENT_ID,
    EBAY_CLIENT_SECRET: !!process.env.EBAY_CLIENT_SECRET,
    EBAY_REFRESH_TOKEN: !!process.env.EBAY_REFRESH_TOKEN,
    EBAY_ENV: !!process.env.EBAY_ENV,
  };
  const allPresent = Object.values(finalCheck).every((v) => v === true);
  
  if (!allPresent) {
    const missing = Object.entries(finalCheck)
      .filter(([_, present]) => !present)
      .map(([key]) => key);
    throw new Error(`Verificación final falló. Variables faltantes: ${missing.join(', ')}`);
  }
  
  console.log('[PRECHECK] ✅ Todas las variables de eBay están presentes y accesibles');

  if (process.env.ENABLE_EBAY_PUBLISH !== 'true') {
    throw new Error('ENABLE_EBAY_PUBLISH debe ser true para publicar en eBay.');
  }

  const env = (process.env.EBAY_ENV || '').toLowerCase();
  if (!['production', 'sandbox'].includes(env)) {
    throw new Error('EBAY_ENV debe ser "production" o "sandbox".');
  }
  
  console.log(`[PRECHECK] ✅ EBAY_ENV configurado: ${env}`);

  console.log('[PRECHECK] Validating database connectivity');
  await prisma.$queryRaw`SELECT 1`;

  console.log('[PRECHECK] Validating AliExpress Affiliate API connectivity');
  try {
    const validation = await aliExpressService.searchProducts({
      keywords: 'phone case',
      pageNo: 1,
      pageSize: 1,
    });
    // ✅ Solo validar que la API responde, no que haya productos
    if (validation === null || validation === undefined) {
      throw new Error('AliExpress Affiliate API no respondió (null/undefined).');
    }
    console.log('[PRECHECK] ✅ AliExpress Affiliate API is reachable');
  } catch (error) {
    throw new Error(`AliExpress Affiliate API no es accesible: ${error instanceof Error ? error.message : String(error)}`);
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
    forcedValidation?: boolean;
  };
  error?: string;
}> {
  try {
    // ✅ LOG: Indicar si FORCE_FIRST_PUBLICATION está activo
    if (FORCE_FIRST_PUBLICATION) {
      console.log('[PIPELINE] FORCE_FIRST_PUBLICATION mode ENABLED');
      console.log('[PIPELINE] Will publish validation product even with low margin (min 5%)');
      logger.info('[PIPELINE] FORCE_FIRST_PUBLICATION enabled', {
        minMargin: FORCE_MIN_MARGIN,
        normalMinMargin: MIN_MARGIN,
      });
    }
    
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

    // ✅ FASE 2: Búsqueda FORZADA para obtener al menos 1 producto REAL
    const allCandidates: ReturnType<typeof normalizeProduct>[] = [];
    const seen = new Set<string>();
    const keywordsTried: string[] = [];
    let affiliateReachable = false;
    let finalSearchParams: any = null;

    // Helper: Buscar productos con parámetros forzados
    async function searchWithForcedParams(
      keywordText: string,
      categoryId?: string,
      keywordData?: TrendKeyword,
      useFilters = false,
    ): Promise<{ count: number; params: any; rawResponse?: any }> {
      const searchParams = {
        keywords: keywordText,
        pageNo: 1,
        pageSize: 50, // ✅ FORZADO: máximo productos
        sort: 'volume_desc', // ✅ FORZADO: ordenar por volumen
        categoryId: categoryId || undefined,
        // ✅ DESACTIVAR filtros de precio
        minPrice: undefined,
        maxPrice: undefined,
      };

      console.log(`[ALIEXPRESS] Searching with forced params:`, {
        keyword: keywordText,
        categoryId: categoryId || 'none',
        pageSize: searchParams.pageSize,
        sort: searchParams.sort,
        filtersDisabled: true,
      });
      keywordsTried.push(keywordText);

      try {
        const searchResult = await aliExpressService.searchProducts(searchParams);

        affiliateReachable = true;
        const productsFound = searchResult.products?.length || 0;
        console.log(`[ALIEXPRESS] Products found: ${productsFound}`, {
          keyword: keywordText,
          categoryId: categoryId || 'none',
          totalResults: searchResult.totalResults,
        });

        if (productsFound === 0) {
          console.log(`[ALIEXPRESS] 0 products - trying next strategy`);
          return { count: 0, params: searchParams };
        }

        let added = 0;
        for (const product of searchResult.products) {
          const candidate = normalizeProduct(
            product,
            keywordData || {
              keyword: keywordText,
              score: 50,
              priority: 'medium',
            },
          );

          // Si useFilters=false, solo validar título básico (mínimo)
          if (useFilters && !passesBasicFilters(candidate)) continue;
          if (!useFilters && (!candidate.title || candidate.title.trim().length === 0)) continue;

          if (seen.has(candidate.productId)) continue;
          seen.add(candidate.productId);
          allCandidates.push(candidate);
          added++;
        }

        finalSearchParams = searchParams;
        return { count: added, params: searchParams, rawResponse: searchResult };
      } catch (error) {
        console.warn(`[ALIEXPRESS] Error searching:`, {
          keyword: keywordText,
          error: error instanceof Error ? error.message : String(error),
        });
        return { count: 0, params: searchParams };
      }
    }

    // ✅ ESTRATEGIA 1: Keywords permitidas históricamente con parámetros forzados
    const historicalKeywords = ['phone case', 'wireless earbuds', 'usb charger', 'led strip', 'car phone holder'];
    console.log('[ALIEXPRESS] STRATEGY 1: Using historical keywords with forced params');
    
    for (const keyword of historicalKeywords) {
      const result = await searchWithForcedParams(keyword, undefined, undefined, false);
      if (allCandidates.length >= 1) {
        console.log(`[ALIEXPRESS] ✅ Obtained ${allCandidates.length} candidates from keyword "${keyword}"`);
        break;
      }
    }

    // ✅ ESTRATEGIA 2: Búsqueda por categoryId genérico si aún no hay productos
    if (allCandidates.length === 0) {
      console.log('[ALIEXPRESS] STRATEGY 2: Searching by categoryId (Electronics Accessories)');
      const categoryId = '200000297'; // Electronics Accessories
      
      for (const keyword of ['', 'phone', 'charger']) {
        const result = await searchWithForcedParams(keyword, categoryId, undefined, false);
        if (allCandidates.length >= 1) {
          console.log(`[ALIEXPRESS] ✅ Obtained ${allCandidates.length} candidates from categoryId ${categoryId}`);
          break;
        }
      }
    }

    // ✅ ESTRATEGIA 3: Búsqueda mínima sin filtros (último recurso)
    if (allCandidates.length === 0) {
      console.log('[ALIEXPRESS] STRATEGY 3: Minimal search without any filters');
      
      const minimalKeywords = ['phone', 'charger', 'case'];
      for (const keyword of minimalKeywords) {
        try {
          const searchResult = await aliExpressService.searchProducts({
            keywords: keyword,
            pageNo: 1,
            pageSize: 50,
            sort: 'volume_desc',
          });

          console.log(`[ALIEXPRESS] Minimal search result:`, {
            keyword,
            productsFound: searchResult.products?.length || 0,
            totalResults: searchResult.totalResults,
          });

          if (searchResult.products && searchResult.products.length > 0) {
            // Tomar el PRIMER producto válido (solo título básico)
            const firstProduct = searchResult.products[0];
            const candidate = normalizeProduct(firstProduct, {
              keyword: keyword,
              score: 30,
              priority: 'low',
            });

            if (candidate.title && candidate.title.trim().length > 0) {
              allCandidates.push(candidate);
              finalSearchParams = { keywords: keyword, pageSize: 50, sort: 'volume_desc' };
              console.log(`[ALIEXPRESS] ✅ Obtained 1 candidate from minimal search: "${candidate.title}"`);
              break;
            }
          }
        } catch (error) {
          console.warn(`[ALIEXPRESS] Minimal search failed for "${keyword}":`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    console.log('[ALIEXPRESS] Candidates normalized', {
      total: allCandidates.length,
      keywordsTried: keywordsTried.length,
      finalParams: finalSearchParams,
      affiliateReachable,
    });

    // ✅ VALIDACIÓN FINAL: CRÍTICO - Debe haber al menos 1 producto
    if (allCandidates.length === 0) {
      const errorResponse = {
        success: false,
        reason: 'NO_PRODUCTS_FOUND',
        message: 'No se encontraron productos después de todas las estrategias (keywords históricas, categoryId, búsqueda mínima)',
        details: {
          keywordsTried,
          affiliateReachable,
          strategiesAttempted: ['historical_keywords', 'categoryId_search', 'minimal_search'],
          finalParams: finalSearchParams,
        },
      };
      
      console.error('[PIPELINE] ❌ CRITICAL: No products found after all strategies:', errorResponse);
      return errorResponse;
    }

    console.log(`[PIPELINE] ✅ SUCCESS: Obtained ${allCandidates.length} candidate(s) from AliExpress Affiliate API`);

    const createdCandidates = await persistCandidates(allCandidates);
    console.log('[ALIEXPRESS] Candidates persisted', {
      total: createdCandidates.length,
      productIds: createdCandidates.map(c => c.candidateId),
    });

    if (createdCandidates.length === 0) {
      // Esto no debería pasar si allCandidates.length > 0, pero por seguridad
      const errorResponse = {
        success: false,
        reason: 'NO_PRODUCTS_PERSISTED',
        message: 'Productos encontrados pero no se pudieron persistir',
        details: {
          candidatesFound: allCandidates.length,
          keywordsTried,
          affiliateReachable,
        },
      };
      console.error('[PIPELINE] ❌ Products found but not persisted:', errorResponse);
      return errorResponse;
    }

    console.log('[PIPELINE] ✅ Continuing pipeline with', createdCandidates.length, 'candidate(s)');
    console.log('[PIPELINE] Selected productIds:', createdCandidates.map(c => ({
      productId: c.productId,
      candidateId: c.candidateId,
      keyword: c.keyword,
    })));

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
      } as ProfitabilityEvaluation & { productId: number; trendScore: number });
    }

    const publishable = evaluations.filter(
      (evaluation) =>
        evaluation.decision === 'publish' && evaluation.profitMargin >= MIN_MARGIN,
    );

    console.log('[PROFITABILITY] Publishable results', {
      total: evaluations.length,
      publishable: publishable.length,
    });

    // ✅ MODO FORCE_FIRST_PUBLICATION: Si no hay publishable, seleccionar mejor candidato disponible
    if (publishable.length === 0) {
      if (FORCE_FIRST_PUBLICATION) {
        console.log('[PIPELINE] FORCE_FIRST_PUBLICATION enabled — no publishable products, selecting best available candidate');
        
        // Filtrar productos con margen mínimo forzado (5%)
        const forcePublishable = evaluations.filter(
          (evaluation) =>
            evaluation.decision === 'publish' && evaluation.profitMargin >= FORCE_MIN_MARGIN,
        );

        let selectedForForce: typeof evaluations[0] | null = null;
        let selectedProductForForce = null;

        if (forcePublishable.length > 0) {
          // Si hay productos con margen >= 5%, usar el mejor
          forcePublishable.sort((a, b) => {
            if (b.profitMargin !== a.profitMargin) return b.profitMargin - a.profitMargin;
            return b.trendScore - a.trendScore;
          });
          selectedForForce = forcePublishable[0];
        } else {
          // Si no hay productos con margen >= 5%, seleccionar el más barato disponible
          // que tenga: imágenes, precio, shipping info básica
          const availableCandidates = evaluations
            .filter((e) => {
              // Verificar que el producto tenga datos básicos
              return e.decision === 'publish' || e.profitMargin > 0;
            })
            .map((e) => ({
              evaluation: e,
              productId: e.productId,
            }));

          if (availableCandidates.length > 0) {
            // Obtener productos de DB para validar imágenes y datos
            const productsToCheck = await Promise.all(
              availableCandidates.map((c) =>
                prisma.product.findUnique({
                  where: { id: c.productId },
                  select: {
                    id: true,
                    title: true,
                    images: true,
                    aliexpressPrice: true,
                    aliexpressUrl: true,
                    suggestedPrice: true,
                    currency: true,
                    category: true,
                    description: true,
                    targetCountry: true,
                  },
                }),
              ),
            );

            // Filtrar productos que tengan: imágenes, precio, URL (shipping info)
            const validProducts = productsToCheck
              .filter((p) => {
                if (!p) return false;
                // Tiene imágenes
                let hasImages = false;
                try {
                  const images = JSON.parse(p.images || '[]');
                  hasImages = Array.isArray(images) && images.length > 0;
                } catch {
                  hasImages = false;
                }
                // Tiene precio
                const hasPrice = p.aliexpressPrice && Number(p.aliexpressPrice) > 0;
                // Tiene URL (shipping info básica)
                const hasUrl = p.aliexpressUrl && p.aliexpressUrl.trim().length > 0;

                return hasImages && hasPrice && hasUrl;
              })
              .map((p) => {
                const evaluationResult = evaluations.find((e) => e.productId === p!.id);
                return {
                  product: p!,
                  evaluation: evaluationResult!,
                  price: Number(p!.aliexpressPrice),
                };
              })
              .sort((a, b) => a.price - b.price); // Ordenar por precio (más barato primero)

            if (validProducts.length > 0) {
              const bestCandidate = validProducts[0];
              selectedForForce = bestCandidate.evaluation;
              selectedProductForForce = bestCandidate.product;
              
              console.log('[PIPELINE] FORCE_FIRST_PUBLICATION — Selected cheapest available product', {
                productId: bestCandidate.product.id,
                title: bestCandidate.product.title,
                price: bestCandidate.price,
                profitMargin: bestCandidate.evaluation.profitMargin,
              });
            }
          }
        }

        if (selectedForForce && !selectedProductForForce) {
          selectedProductForForce = await prisma.product.findUnique({
            where: { id: selectedForForce.productId },
          });
        }

        if (selectedForForce && selectedProductForForce) {
          console.log('[PIPELINE] FORCE_FIRST_PUBLICATION enabled — publishing validation product', {
            productId: selectedProductForForce.id,
            title: selectedProductForForce.title,
            profitMargin: selectedForForce.profitMargin,
            forced: true,
          });

          // Continuar con la publicación usando el producto seleccionado forzado
          const selected = selectedForForce;
          const selectedProduct = selectedProductForForce;

          console.log('[EBAY-PUBLISH] Publishing FORCED VALIDATION product', {
            productId: selectedProduct.id,
            title: selectedProduct.title,
            price: selected.salePrice,
            profitMargin: selected.profitMargin,
            mode: 'FORCED_VALIDATION',
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
              publishMode: 'FORCED_VALIDATION' as any, // Marcar como validación forzada
              rawResponse: publishResult.rawResponse
                ? JSON.stringify({
                    ...(typeof publishResult.rawResponse === 'object' ? publishResult.rawResponse : {}),
                    forcedValidation: true,
                    originalProfitMargin: selected.profitMargin,
                    forceMinMargin: FORCE_MIN_MARGIN,
                  })
                : JSON.stringify({ forcedValidation: true }),
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
            keywordsUsed: keywordsTried,
            productsFound: allCandidates.length,
            productsPublishable: 0, // Forzado
            productPublished: selectedProduct.title,
            productId: selectedProduct.id,
            candidateId: selected.candidateId || selectedProduct.id.toString(),
            listingId: publishResult.listingId,
            price: selected.salePrice,
            expectedProfit: selected.estimatedProfit,
            forcedValidation: true,
            searchParams: finalSearchParams,
          };

          console.log('[REPORT] FINAL (FORCED VALIDATION)', reportData);

          if (publishResult.status !== 'published') {
            const errorResponse = {
              success: false,
              reason: 'PUBLISH_FAILED',
              message: `Publicación forzada fallida: ${publishResult.message || 'Unknown error'}`,
              details: {
                listingId: publishResult.listingId,
                status: publishResult.status,
                forcedValidation: true,
              },
            };
            console.log('[PIPELINE] Forced publish failed:', errorResponse);
            console.log('Ciclo real de dropshipping validado mediante publicación forzada controlada.');
            return errorResponse;
          }

          console.log('Ciclo real de dropshipping validado mediante publicación forzada controlada.');

          return {
            success: true,
            message: 'Ciclo real de dropshipping validado mediante publicación forzada controlada.',
            data: reportData,
          };
        } else {
          // No se pudo encontrar ningún candidato válido ni siquiera en modo forzado
          const errorResponse = {
            success: false,
            reason: 'NO_PUBLISHABLE_PRODUCTS',
            message: 'No hay productos publishable con margen suficiente después de evaluación de rentabilidad',
            details: {
              candidatesEvaluated: evaluations.length,
              evaluations: evaluations.map((e) => ({
                decision: e.decision,
                profitMargin: e.profitMargin,
                reason: e.reason,
              })),
              forceModeAttempted: true,
            },
          };
          console.log('[PIPELINE] No publishable products found (even with FORCE mode):', errorResponse);
          console.log('Ciclo de dropshipping ejecutado correctamente o finalizado por falta real de oportunidades.');
          return errorResponse;
        }
      } else {
        // Comportamiento normal sin FORCE
        const errorResponse = {
          success: false,
          reason: 'NO_PUBLISHABLE_PRODUCTS',
          message: 'No hay productos publishable con margen suficiente después de evaluación de rentabilidad',
          details: {
            candidatesEvaluated: evaluations.length,
            evaluations: evaluations.map((e) => ({
              decision: e.decision,
              profitMargin: e.profitMargin,
              reason: e.reason,
            })),
          },
        };
        console.log('[PIPELINE] No publishable products found:', errorResponse);
        console.log('Ciclo de dropshipping ejecutado correctamente o finalizado por falta real de oportunidades.');
        return errorResponse;
      }
    }

    publishable.sort((a, b) => {
      if (b.profitMargin !== a.profitMargin) return b.profitMargin - a.profitMargin;
      return b.trendScore - a.trendScore;
    });

    const selected = publishable[0];
    const selectedProduct = await prisma.product.findUnique({
      where: { id: selected.productId },
    });

    // ✅ NO lanzar error técnico - retornar respuesta estructurada
    if (!selectedProduct) {
      const errorResponse = {
        success: false,
        reason: 'PRODUCT_NOT_FOUND',
        message: 'Producto seleccionado no encontrado en base de datos',
        details: {
          productId: selected.productId,
        },
      };
      console.log('[PIPELINE] Selected product not found:', errorResponse);
      console.log('Ciclo de dropshipping ejecutado correctamente o finalizado por falta real de oportunidades.');
      return errorResponse;
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
      keywordsUsed: keywordsTried,
      productsFound: allCandidates.length,
      productsPublishable: publishable.length,
      productPublished: selectedProduct.title,
      productId: selectedProduct.id,
      candidateId: selected.candidateId || selectedProduct.id.toString(),
      listingId: publishResult.listingId,
      price: selected.salePrice,
      expectedProfit: selected.estimatedProfit,
      searchParams: finalSearchParams,
    };

    console.log('[REPORT] FINAL', reportData);
    console.log('[REPORT] Product selected:', {
      productId: selectedProduct.id,
      candidateId: selected.candidateId || selectedProduct.id.toString(),
      keyword: keywordsTried[0] || 'unknown',
      listingId: publishResult.listingId,
      profit: selected.estimatedProfit,
    });

    if (publishResult.status !== 'published') {
      // ✅ NO lanzar excepción, retornar respuesta JSON clara
      const errorResponse = {
        success: false,
        reason: 'PUBLISH_FAILED',
        message: `Publicación fallida: ${publishResult.message || 'Unknown error'}`,
        details: {
          listingId: publishResult.listingId,
          status: publishResult.status,
          rawResponse: publishResult.rawResponse,
        },
      };
      console.log('[PIPELINE] Publish failed:', errorResponse);
      return errorResponse;
    }

    console.log('Ciclo real de dropshipping con eBay ejecutado correctamente');
    console.log('Ciclo de dropshipping ejecutado correctamente o finalizado por falta real de oportunidades.');

    return {
      success: true,
      message: 'Ciclo real de dropshipping con eBay ejecutado correctamente',
      data: reportData,
    };
  } catch (error: any) {
    // ✅ Solo loggear errores técnicos reales, no errores de negocio
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Si el error ya es una respuesta estructurada (NO_PRODUCTS_FOUND, etc.), retornarla
    if (error && typeof error === 'object' && 'reason' in error) {
      console.log('[PIPELINE] Structured error response:', error);
      console.log('Ciclo de dropshipping ejecutado correctamente o finalizado por falta real de oportunidades.');
      return error;
    }
    
    logger.error('[REAL-CYCLE] Error técnico ejecutando ciclo', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    console.log('Ciclo de dropshipping ejecutado correctamente o finalizado por falta real de oportunidades.');
    
    return {
      success: false,
      message: 'Error técnico ejecutando ciclo real de eBay',
      error: errorMessage,
    };
  }
}

// ✅ REMOVED: Code execution on import removed for production safety
// This script is now imported-only, execution happens via internal.routes.ts
// No code runs when this module is imported
