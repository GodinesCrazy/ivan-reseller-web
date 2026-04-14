/**
 * Ciclo: búsqueda de oportunidades (findOpportunities) → producto → aprobación → publicación marketplace.
 * Usado por POST /api/internal/... y POST /api/opportunities/full-cycle-ebay (usuario autenticado).
 */
import { prisma } from '../config/database';
import { env } from '../config/env';
import { trendsService } from './trends.service';
import opportunityFinder from './opportunity-finder.service';
import { ProductService } from './product.service';
import MarketplaceService, { type PublishProductRequest } from './marketplace.service';
import { workflowConfigService } from './workflow-config.service';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';
import type { OpportunityItem } from './opportunity-finder.types';

const EBAY_MIN_IMAGE = 500;
const FALLBACK_IMAGE = `https://placehold.co/${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.png`;

/**
 * Normaliza métricas de oportunidad (Affiliate) a escala 0–5 para `productData`,
 * coherente con `toRatingFiveStar` en preventive-supplier-validation.
 */
export function buildPreventiveSupplierSeedProductData(opp: OpportunityItem): Record<string, number> {
  const out: Record<string, number> = {};
  const s = Number(opp.supplierRating);
  if (Number.isFinite(s) && s > 0) {
    if (s <= 5) out.supplierRatingFive = s;
    else if (s <= 100) out.supplierRatingFive = s / 20;
  } else {
    const pct = Number(opp.supplierScorePct);
    if (Number.isFinite(pct) && pct > 0) {
      if (pct <= 1) out.supplierRatingFive = pct * 5;
      else if (pct <= 100) out.supplierRatingFive = pct / 20;
    }
  }
  const oc = opp.supplierOrdersCount;
  if (typeof oc === 'number' && Number.isFinite(oc) && oc >= 0) {
    out.supplierOrderCount = oc;
  }
  return out;
}

/** Prioriza rating y volumen de proveedor para superar el umbral eBay US (4.75★). */
export function rankOpportunitiesForEbayUsPublish(opps: OpportunityItem[]): OpportunityItem[] {
  return [...opps].sort((a, b) => {
    const ra = Number(a.supplierRating);
    const rb = Number(b.supplierRating);
    const sa = Number.isFinite(ra) && ra > 0 ? ra : -1;
    const sb = Number.isFinite(rb) && rb > 0 ? rb : -1;
    if (sb !== sa) return sb - sa;
    const oa =
      typeof a.supplierOrdersCount === 'number' && a.supplierOrdersCount >= 0 ? a.supplierOrdersCount : -1;
    const ob =
      typeof b.supplierOrdersCount === 'number' && b.supplierOrdersCount >= 0 ? b.supplierOrdersCount : -1;
    return ob - oa;
  });
}

function enlargeImageUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  let u = url.trim();
  u = u.replace(/placehold\.co\/(\d+)x(\d+)/i, (_, w, h) => {
    const s = Math.max(EBAY_MIN_IMAGE, parseInt(w, 10) || EBAY_MIN_IMAGE, parseInt(h, 10) || EBAY_MIN_IMAGE);
    return `placehold.co/${s}x${s}`;
  });
  u = u.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, `_${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.$1`);
  u = u.replace(/\.(jpg|jpeg|png|webp|gif)_[0-9]+x[0-9]+\.\1$/i, `_${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.$1`);
  return u;
}

export interface RunOpportunityFullCycleParams {
  /** Sesión autenticada: obligatorio salvo internalRunner */
  userId?: number;
  /** Solo uso interno: elige primer usuario activo si userId no viene */
  internalRunner?: boolean;
  keyword?: string;
  dryRun?: boolean;
  maxPriceUsd?: number;
  marketplace?: 'ebay' | 'mercadolibre';
  credentialEnvironment?: 'sandbox' | 'production';
  /** Solo interno: producto placeholder si no hay oportunidades reales */
  allowFallbackProduct?: boolean;
  /** Región para findOpportunities (ej. us) */
  region?: string;
  maxItems?: number;
  /** Si se omite, findOpportunities usa mercados por defecto del pipeline */
  marketplaces?: Array<'ebay' | 'amazon' | 'mercadolibre'>;
}

export interface RunOpportunityFullCycleHttpResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

function ebayPublishEnabled(): boolean {
  return process.env.ENABLE_EBAY_PUBLISH === 'true';
}

export async function runOpportunityFullCycleToEbay(
  params: RunOpportunityFullCycleParams
): Promise<RunOpportunityFullCycleHttpResult> {
  const startTime = Date.now();
  const dryRun = params.dryRun === true;
  const marketplace: 'ebay' | 'mercadolibre' =
    String(params.marketplace || 'ebay').toLowerCase() === 'mercadolibre' ? 'mercadolibre' : 'ebay';
  const maxPriceUsd =
    Number.isFinite(params.maxPriceUsd as number) && (params.maxPriceUsd as number) > 0
      ? (params.maxPriceUsd as number)
      : 12;
  const region = String(params.region || 'us').toLowerCase();
  const maxItems = Math.min(20, Math.max(1, params.maxItems ?? 8));
  const marketplaces = params.marketplaces;

  let userId = params.userId;
  if (!userId || !Number.isFinite(userId) || userId < 1) {
    if (params.internalRunner) {
      const first = await prisma.user.findFirst({
        where: { isActive: true },
        select: { id: true, username: true, isActive: true },
      });
      if (!first) {
        return { httpStatus: 400, body: { success: false, error: 'No hay usuario activo. Ejecuta seed.' } };
      }
      userId = first.id;
    } else {
      return { httpStatus: 400, body: { success: false, error: 'userId requerido' } };
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isActive: true },
  });
  if (!user?.isActive) {
    return {
      httpStatus: 400,
      body: { success: false, error: `El userId=${userId} no está activo.` },
    };
  }

  if (!dryRun && env.BLOCK_NEW_PUBLICATIONS) {
    return {
      httpStatus: 423,
      body: {
        success: false,
        error: 'BLOCK_NEW_PUBLICATIONS',
        message:
          'Las publicaciones nuevas están bloqueadas temporalmente (BLOCK_NEW_PUBLICATIONS). Usá dryRun: true para probar hasta aprobación.',
      },
    };
  }

  if (!dryRun && marketplace === 'ebay' && !ebayPublishEnabled()) {
    return {
      httpStatus: 400,
      body: {
        success: false,
        error: 'ENABLE_EBAY_PUBLISH',
        message: 'ENABLE_EBAY_PUBLISH debe ser true en el servidor para publicar en eBay (o usá dryRun: true).',
      },
    };
  }

  let keyword = String(params.keyword || '').trim();
  if (!keyword) {
    const trendKeywords = await trendsService.getTrendingKeywords({
      region: 'US',
      maxKeywords: 10,
      userId,
    });
    keyword = trendKeywords.length > 0 ? trendKeywords[0].keyword : 'phone case';
  }

  const { opportunities: rawOpps } = await opportunityFinder.findOpportunitiesWithDiagnostics(userId, {
    query: keyword,
    maxItems,
    skipTrendsValidation: true,
    ...(marketplaces?.length ? { marketplaces } : {}),
    region,
  });

  let opportunities: OpportunityItem[] = rawOpps;

  if (opportunities.length === 0 && params.allowFallbackProduct) {
    logger.warn('[FULL-CYCLE] No opportunities, using internal fallback product');
    const fallbackPrice = Math.min(11.99, maxPriceUsd);
    const fallbackCost = Math.min(7.99, fallbackPrice / 1.5);
    opportunities = [
      {
        title: `Test Product ${keyword} - ${Date.now()}`,
        sourceMarketplace: 'aliexpress',
        aliexpressUrl: 'https://www.aliexpress.com/item/1005001234567890.html',
        productUrl: 'https://www.aliexpress.com/item/1005001234567890.html',
        costUsd: fallbackCost,
        costAmount: fallbackCost,
        costCurrency: 'USD',
        baseCurrency: 'USD',
        suggestedPriceUsd: fallbackPrice,
        suggestedPriceAmount: fallbackPrice,
        suggestedPriceCurrency: 'USD',
        profitMargin: 0,
        roiPercentage: 0,
        competitionLevel: 'unknown',
        marketDemand: 'unknown',
        confidenceScore: 0,
        targetMarketplaces: ['ebay'],
        feesConsidered: {},
        generatedAt: new Date().toISOString(),
        images: ['https://placehold.co/400x400?text=Test+Product'],
      } as OpportunityItem,
    ];
  }

  if (opportunities.length === 0) {
    return {
      httpStatus: 404,
      body: {
        success: false,
        error: 'NO_OPPORTUNITIES',
        message:
          'No se encontraron oportunidades para esta búsqueda. Probá otra keyword o revisá credenciales eBay/Affiliate.',
        keyword,
        durationMs: Date.now() - startTime,
      },
    };
  }

  const maxCostForCap = maxPriceUsd ? maxPriceUsd / 1.5 : null;
  const ranked = rankOpportunitiesForEbayUsPublish(opportunities);
  const costFiltered = maxCostForCap
    ? ranked.filter((o) => Number(o?.costUsd || 0) > 0 && Number(o.costUsd) <= maxCostForCap)
    : ranked;
  const tryOpps = costFiltered.length > 0 ? costFiltered : ranked;

  const maxAttempts =
    dryRun || marketplace !== 'ebay' ? 1 : Math.min(8, tryOpps.length);
  const attemptSlice = tryOpps.slice(0, Math.max(1, maxAttempts));

  let credentialEnv: 'sandbox' | 'production' = await workflowConfigService.getUserEnvironment(userId);
  const credOverride = String(params.credentialEnvironment || '').toLowerCase();
  if (credOverride === 'production' || credOverride === 'sandbox') {
    credentialEnv = credOverride;
  }

  const productService = new ProductService();
  let publishResult: { success: boolean; error?: string; listingId?: string; listingUrl?: string } = {
    success: false,
  };
  let product: Awaited<ReturnType<ProductService['createProduct']>> | null = null;
  let opp: OpportunityItem | null = null;
  let shippingPersist: number | undefined;
  let deliveryDaysPersist: number | undefined;
  let skipDuplicateCount = 0;

  for (let ai = 0; ai < attemptSlice.length; ai++) {
    const tryOpp = attemptSlice[ai];
    if (!tryOpp) break;
    opp = tryOpp;

    const rawImages = Array.isArray((tryOpp as any).images)
      ? (tryOpp as any).images
      : (tryOpp as any).image
        ? [(tryOpp as any).image]
        : [];
    const filtered =
      Array.isArray(rawImages) && rawImages.length > 0
        ? rawImages.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('http'))
        : [];
    const enlarged = filtered.map(enlargeImageUrl);
    const uniqueImages = Array.from(new Set(enlarged)).slice(0, 12);
    const images = uniqueImages.length > 0 ? uniqueImages : [FALLBACK_IMAGE];

    shippingPersist =
      typeof tryOpp.shippingCost === 'number' && Number.isFinite(tryOpp.shippingCost) && tryOpp.shippingCost > 0
        ? tryOpp.shippingCost
        : undefined;
    deliveryDaysPersist =
      typeof tryOpp.shippingDaysMax === 'number' && Number.isFinite(tryOpp.shippingDaysMax)
        ? tryOpp.shippingDaysMax
        : typeof tryOpp.estimatedDeliveryDays === 'number'
          ? tryOpp.estimatedDeliveryDays
          : undefined;

    const supplierSeedPd = buildPreventiveSupplierSeedProductData(tryOpp);

    try {
      product = await productService.createProduct(userId, {
        title: tryOpp.title,
        description: (tryOpp as any).description || '',
        aliexpressUrl: tryOpp.aliexpressUrl || tryOpp.productUrl || 'https://www.aliexpress.com/item/0.html',
        aliexpressPrice: tryOpp.costUsd,
        suggestedPrice: tryOpp.suggestedPriceUsd || tryOpp.costUsd * 1.5,
        imageUrls: images,
        category: (tryOpp as any).category,
        currency: 'USD',
        targetCountry: marketplace === 'mercadolibre' ? 'CL' : 'US',
        shippingCost: shippingPersist,
        importTax: typeof tryOpp.importTax === 'number' && tryOpp.importTax > 0 ? tryOpp.importTax : undefined,
        totalCost: typeof tryOpp.totalCost === 'number' && tryOpp.totalCost > 0 ? tryOpp.totalCost : undefined,
        estimatedDeliveryDays: deliveryDaysPersist,
        ...(Object.keys(supplierSeedPd).length
          ? { productData: supplierSeedPd as Record<string, unknown> }
          : {}),
      });
    } catch (e: unknown) {
      if (e instanceof AppError && e.statusCode === 409) {
        skipDuplicateCount++;
        logger.warn('[FULL-CYCLE] Skipping duplicate AliExpress URL', {
          userId,
          title: tryOpp.title?.slice(0, 50),
        });
        continue;
      }
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[FULL-CYCLE] createProduct failed', { userId, error: msg });
      return {
        httpStatus: 400,
        body: {
          success: false,
          error: 'CREATE_PRODUCT_FAILED',
          message: msg,
          keyword,
          durationMs: Date.now() - startTime,
        },
      };
    }

    await productService.updateProductStatusSafely(product.id, 'APPROVED', userId, 'full-cycle: aprobación para publicación');

    if (dryRun) {
      return {
        httpStatus: 200,
        body: {
          success: true,
          dryRun: true,
          userId,
          productId: product.id,
          keyword,
          marketplace,
          opportunityTitle: tryOpp.title,
          shippingCost: shippingPersist ?? null,
          estimatedDeliveryDays: deliveryDaysPersist ?? null,
          stages: { search: true, product: true, approved: true, publish: 'skipped' },
          credentialEnvironment: credentialEnv,
          durationMs: Date.now() - startTime,
        },
      };
    }

    const updated = await prisma.product.findUnique({
      where: { id: product.id },
      select: { status: true, title: true, aliexpressPrice: true, suggestedPrice: true },
    });

    const marketplaceService = new MarketplaceService();
    try {
      const baseTitle = String(updated?.title || tryOpp.title || `Product-${product.id}`)
        .replace(/\s+/g, ' ')
        .trim();
      let uniqueTitle = `${baseTitle.slice(0, marketplace === 'mercadolibre' ? 48 : 70)} P${product.id}`
        .replace(/\s+/g, ' ')
        .trim();
      if (marketplace === 'mercadolibre' && uniqueTitle.length > 60) {
        uniqueTitle = uniqueTitle.slice(0, 60).trim();
      }
      const basePrice = Number(updated?.suggestedPrice || updated?.aliexpressPrice) * 1.5;
      const finalPrice = maxPriceUsd ? Math.min(basePrice, maxPriceUsd) : basePrice;
      const customData: Record<string, unknown> = {
        title: uniqueTitle,
        price: finalPrice,
        quantity: 1,
      };
      if (marketplace === 'ebay') {
        customData.categoryId = process.env.EBAY_FULL_CYCLE_CATEGORY_ID || '20349';
      }
      publishResult = await marketplaceService.publishProduct(
        userId,
        {
          productId: product.id,
          marketplace,
          customData: customData as PublishProductRequest['customData'],
        },
        credentialEnv
      );
    } catch (publishErr: unknown) {
      publishResult = {
        success: false,
        error: publishErr instanceof Error ? publishErr.message : String(publishErr),
      };
    }

    if (publishResult.success) {
      await productService.updateProductStatusSafely(product.id, 'PUBLISHED', true, userId);
      const verified = await prisma.product.findUnique({
        where: { id: product.id },
        select: { status: true, isPublished: true, publishedAt: true },
      });
      logger.info('[FULL-CYCLE] publish OK', {
        userId,
        marketplace,
        productId: product.id,
        listingId: publishResult.listingId,
        attemptIndex: ai,
        durationMs: Date.now() - startTime,
      });
      return {
        httpStatus: 200,
        body: {
          success: true,
          userId,
          productId: product.id,
          listingId: publishResult.listingId,
          listingUrl: publishResult.listingUrl,
          keyword,
          marketplace,
          opportunityTitle: tryOpp.title,
          maxPriceUsdApplied: maxPriceUsd,
          shippingCost: shippingPersist ?? null,
          estimatedDeliveryDays: deliveryDaysPersist ?? null,
          publishAttempts: ai + 1,
          stages: { search: true, product: true, approved: true, publish: true },
          verified: verified
            ? { status: verified.status, isPublished: verified.isPublished, publishedAt: verified.publishedAt }
            : undefined,
          credentialEnvironment: credentialEnv,
          durationMs: Date.now() - startTime,
        },
      };
    }

    const errStr = String(publishResult.error || '');
    const ebayRatingRetry =
      marketplace === 'ebay' &&
      /supplier rating|below minimum|evidence missing|positive feedback/i.test(errStr) &&
      ai < attemptSlice.length - 1;
    if (ebayRatingRetry) {
      logger.warn('[FULL-CYCLE] eBay preventive blocked, next opportunity', {
        productId: product.id,
        detail: errStr.slice(0, 220),
      });
      continue;
    }
    break;
  }

  if (!product || !opp) {
    return {
      httpStatus: skipDuplicateCount >= attemptSlice.length ? 409 : 400,
      body: {
        success: false,
        error: skipDuplicateCount > 0 ? 'ALL_ATTEMPTS_DUPLICATE_OR_EMPTY' : 'CREATE_PRODUCT_FAILED',
        message:
          skipDuplicateCount > 0
            ? 'Todas las oportunidades candidatas ya estaban importadas (misma URL AliExpress).'
            : 'No se pudo crear producto.',
        keyword,
        skipDuplicateCount,
        durationMs: Date.now() - startTime,
      },
    };
  }

  const errLower = String(publishResult.error || '').toLowerCase();
  const ebayConfigMsg = /credentials not found|inactive for|falta token oauth|completa la autorizaci/i.test(errLower);
  const tokenErr =
    marketplace === 'ebay' &&
    publishResult.error &&
    !ebayConfigMsg &&
    /invalid_grant|unauthorized|401\b|403\b|expired|refresh.?token|access.?token|oauth.?error/i.test(errLower);

  if (tokenErr) {
    return {
      httpStatus: 200,
      body: {
        success: true,
        userId,
        productId: product.id,
        keyword,
        marketplace,
        opportunityTitle: opp.title,
        stages: { search: true, product: true, approved: true, publish: 'pending_oauth' },
        ebayPendingOAuth: true,
        publishError: publishResult.error,
        message:
          'Producto creado y aprobado. Completá OAuth de eBay en Configuración / credenciales y volvé a publicar desde Productos.',
        credentialEnvironment: credentialEnv,
        durationMs: Date.now() - startTime,
      },
    };
  }

  const mlConfigMsg =
    /credentials not found|inactive for \w+ environment|faltan mercadolibre|complet[ae] oauth en la app|base de datos/i.test(
      errLower
    );
  const mlTokenErr =
    marketplace === 'mercadolibre' &&
    publishResult.error &&
    !mlConfigMsg &&
    /invalid_grant|invalid_token|unauthorized|401\b|403\b|token expired|access token|refresh.?token|revoked/i.test(
      errLower
    );

  if (mlTokenErr) {
    return {
      httpStatus: 200,
      body: {
        success: true,
        userId,
        productId: product.id,
        keyword,
        marketplace,
        opportunityTitle: opp.title,
        stages: { search: true, product: true, approved: true, publish: 'pending_oauth' },
        mercadolibrePendingOAuth: true,
        publishError: publishResult.error,
        message: 'Producto creado y aprobado. Renová token Mercado Libre en Configuración.',
        credentialEnvironment: credentialEnv,
        durationMs: Date.now() - startTime,
      },
    };
  }

  const dsHint =
    publishResult.error &&
    String(publishResult.error).includes('AliExpress Dropshipping API is not connected')
      ? 'Las credenciales DS son por usuario: usá el mismo userId que conectó AliExpress Dropshipping.'
      : undefined;

  return {
    httpStatus: 500,
    body: {
      success: false,
      error: publishResult.error,
      userId,
      productId: product.id,
      marketplace,
      opportunityTitle: opp.title,
      hint: dsHint,
      stages: { search: true, product: true, approved: true, publish: false },
      credentialEnvironment: credentialEnv,
      durationMs: Date.now() - startTime,
    },
  };
}
