#!/usr/bin/env tsx
/**
 * Ciclo canónico: buscar una oportunidad NUEVA → crear producto en BD → publicar en eBay US.
 * No republica el mismo artículo: cada ejecución exitosa crea otro productId y otro listing (SKU IVAN-{id}).
 *
 * Mejoras de envío / origen (aplicadas automáticamente en publishToEbay + EbayService):
 * - Ubicación de inventario China (merchantLocationKey CN) y texto opcional de almacén partner.
 * - Bloque en descripción con rango de días hábiles (productData + env EBAY_US_DELIVERY_* / pads).
 *
 * Requiere: DATABASE_URL, credenciales AliExpress Affiliate + Dropshipping, eBay OAuth en DB,
 * ENABLE_EBAY_PUBLISH=true, BLOCK_NEW_PUBLICATIONS=false (o no definido).
 *
 * Uso:
 *   cd backend && npm run run:opportunity-ebay-us-cycle
 *   OPPORTUNITY_QUERY="kitchen timer" REAL_CYCLE_USER_ID=1 DRY_RUN=1 npm run run:opportunity-ebay-us-cycle
 *   OPPORTUNITY_QUERY="mouse pad" ENABLE_EBAY_PUBLISH=true npm run run:opportunity-ebay-us-cycle
 *
 * Opcional: EBAY_CYCLE_CATEGORY_ID=12345 fuerza categoría; si no se define, eBay sugiere por título.
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
import { prisma } from '../config/database';
import logger from '../config/logger';
import opportunityFinder from '../services/opportunity-finder.service';
import { ProductService } from '../services/product.service';
import MarketplaceService from '../services/marketplace.service';
import { workflowConfigService } from '../services/workflow-config.service';
import { env } from '../config/env';
import {
  buildPreventiveSupplierSeedProductData,
  rankOpportunitiesForEbayUsPublish,
} from '../services/opportunity-full-cycle-ebay.service';
import { toRatingFiveStar } from '../services/preventive-supplier-validation.service';
import { AppError } from '../middleware/error.middleware';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

const USER_ID = Number(process.env.REAL_CYCLE_USER_ID || process.env.OPPORTUNITY_CYCLE_USER_ID || 1);
const QUERY = (process.env.OPPORTUNITY_QUERY || process.env.keyword || 'phone case').trim();
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const EBAY_MIN_IMAGE = 500;
const FALLBACK_IMAGE = `https://placehold.co/${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.png`;
/** Mismo umbral que eBay US en validación preventiva (>95 % feedback ≈ 4.75/5). */
const MIN_RATING_FIVE_EBAY_US = 4.75;

function extractAeProductIdFromUrl(url: string): string {
  const m = String(url || '').match(/\/item\/(\d+)/i);
  return m?.[1]?.trim() || '';
}

async function configureAffiliateForUser(userId: number): Promise<void> {
  const { CredentialsManager } = await import('../services/credentials-manager.service');
  const { aliexpressAffiliateAPIService } = await import('../services/aliexpress-affiliate-api.service');
  const envAppKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim();
  const envAppSecret = (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim();
  const trackingId = (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim();
  const envCreds =
    envAppKey && envAppSecret
      ? { appKey: envAppKey, appSecret: envAppSecret, trackingId, sandbox: false }
      : null;
  const dbCreds =
    envCreds ?? (await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'production'));
  if (!dbCreds || !('appKey' in dbCreds) || !dbCreds.appKey || !dbCreds.appSecret) {
    throw new Error('AliExpress Affiliate credentials missing (needed for eBay US rating gate)');
  }
  aliexpressAffiliateAPIService.setCredentials(dbCreds as Parameters<typeof aliexpressAffiliateAPIService.setCredentials>[0]);
}

async function prefetchAffiliateRatingForAeId(
  _userId: number,
  aeProductId: string,
): Promise<{ ratingFive: number | null; orderCount: number | null }> {
  if (!aeProductId) return { ratingFive: null, orderCount: null };
  const { aliexpressAffiliateAPIService } = await import('../services/aliexpress-affiliate-api.service');
  const details = await aliexpressAffiliateAPIService.getProductDetails({
    productIds: aeProductId,
    shipToCountry: 'US',
    targetCurrency: 'USD',
    targetLanguage: 'EN',
  });
  const first = details?.[0];
  if (!first) return { ratingFive: null, orderCount: null };
  const ratingFive = toRatingFiveStar(first.evaluateScore, first.evaluateRate);
  const orderCount =
    first.volume != null && Number.isFinite(Number(first.volume)) ? Number(first.volume) : null;
  return { ratingFive, orderCount };
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

async function main(): Promise<void> {
  if (!QUERY) {
    console.error('OPPORTUNITY_QUERY / keyword vacío.');
    process.exit(1);
  }
  if (!Number.isFinite(USER_ID) || USER_ID < 1) {
    console.error('REAL_CYCLE_USER_ID inválido.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: { id: true, isActive: true, username: true },
  });
  if (!user?.isActive) {
    console.error(`Usuario ${USER_ID} no encontrado o inactivo.`);
    process.exit(1);
  }

  console.log('[CYCLE] Usuario:', user.id, user.username);
  console.log('[CYCLE] Query:', QUERY, 'DRY_RUN:', DRY_RUN);

  if (env.BLOCK_NEW_PUBLICATIONS && !DRY_RUN) {
    console.error('[CYCLE] BLOCK_NEW_PUBLICATIONS está activo; usa DRY_RUN=1 o desactiva el flag.');
    process.exit(1);
  }

  const maxSearchItems = Math.min(30, Math.max(8, Number(process.env.OPPORTUNITY_MAX_ITEMS || 20)));
  const opportunities = await opportunityFinder.findOpportunities(USER_ID, {
    query: QUERY,
    maxItems: maxSearchItems,
    pageNo: 1,
    marketplaces: ['ebay'],
    region: 'us',
    skipTrendsValidation: true,
  });

  if (opportunities.length === 0) {
    console.error('[CYCLE] Sin oportunidades (competencia / filtros / API).');
    process.exit(2);
  }

  const ranked = rankOpportunitiesForEbayUsPublish(opportunities);
  const maxCap = Number(process.env.OPPORTUNITY_CYCLE_MAX_PRICE_USD || 0);
  const maxCostForCap = maxCap > 0 ? maxCap / 1.5 : null;
  const costFiltered =
    maxCostForCap != null
      ? ranked.filter((o) => Number(o?.costUsd || 0) > 0 && Number(o.costUsd) <= maxCostForCap)
      : ranked;
  const tryOpps = costFiltered.length > 0 ? costFiltered : ranked;
  const maxAttempts = DRY_RUN ? 1 : Math.min(12, tryOpps.length);
  const attemptSlice = tryOpps.slice(0, Math.max(1, maxAttempts));

  let affiliateReady = false;
  const ensureAffiliate = async () => {
    if (!affiliateReady) {
      await configureAffiliateForUser(USER_ID);
      affiliateReady = true;
    }
  };

  let credentialEnv: 'sandbox' | 'production' = await workflowConfigService.getUserEnvironment(USER_ID);
  const envOverride = String(process.env.EBAY_PUBLISH_ENV || '').toLowerCase();
  if (envOverride === 'production' || envOverride === 'sandbox') {
    credentialEnv = envOverride;
  }

  const productService = new ProductService();
  let skipDup = 0;

  for (let ai = 0; ai < attemptSlice.length; ai++) {
    const opp = attemptSlice[ai];
    if (!opp) break;

    const rawImages = Array.isArray(opp.images) ? opp.images : opp.image ? [opp.image] : [];
    const filtered = rawImages.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
    const images =
      filtered.length > 0 ? Array.from(new Set(filtered.map(enlargeImageUrl))).slice(0, 12) : [FALLBACK_IMAGE];

    const shippingPersist =
      typeof opp.shippingCost === 'number' && Number.isFinite(opp.shippingCost) && opp.shippingCost > 0
        ? opp.shippingCost
        : undefined;
    const deliveryDaysPersist =
      typeof opp.shippingDaysMax === 'number' && Number.isFinite(opp.shippingDaysMax)
        ? opp.shippingDaysMax
        : typeof opp.estimatedDeliveryDays === 'number'
          ? opp.estimatedDeliveryDays
          : undefined;

    console.log('[CYCLE] Oportunidad', ai + 1, '/', attemptSlice.length, {
      title: opp.title?.slice(0, 60),
      costUsd: opp.costUsd,
      supplierRating: opp.supplierRating ?? null,
      shippingCostPersist: shippingPersist,
      suggestedPriceUsd: opp.suggestedPriceUsd,
    });

    const aeId = extractAeProductIdFromUrl(opp.aliexpressUrl || opp.productUrl || '');
    if (!aeId) {
      console.warn('[CYCLE] URL sin item id de AliExpress, siguiente.');
      continue;
    }

    const supplierSeedPd = buildPreventiveSupplierSeedProductData(opp);
    let ratingFive: number | null =
      typeof supplierSeedPd.supplierRatingFive === 'number' ? supplierSeedPd.supplierRatingFive : null;
    let orderCount: number | null =
      typeof supplierSeedPd.supplierOrderCount === 'number' ? supplierSeedPd.supplierOrderCount : null;

    if (ratingFive == null || ratingFive < MIN_RATING_FIVE_EBAY_US) {
      try {
        await ensureAffiliate();
        const aff = await prefetchAffiliateRatingForAeId(USER_ID, aeId);
        if (aff.ratingFive != null && aff.ratingFive > 0) {
          ratingFive = aff.ratingFive;
          if (orderCount == null && aff.orderCount != null) orderCount = aff.orderCount;
        }
      } catch (e: unknown) {
        console.warn('[CYCLE] Prefetch Affiliate rating falló:', (e as Error)?.message || String(e));
      }
    }

    if (ratingFive == null || ratingFive < MIN_RATING_FIVE_EBAY_US) {
      console.warn('[CYCLE] Omitiendo (sin rating eBay US ≥ 4.75 en oportunidad ni Affiliate):', {
        aeId,
        ratingFive,
        title: opp.title?.slice(0, 50),
      });
      continue;
    }

    const productDataSeed: Record<string, unknown> = {
      ...supplierSeedPd,
      supplierRatingFive: ratingFive,
      ...(typeof orderCount === 'number' ? { supplierOrderCount: orderCount } : {}),
    };

    let product;
    try {
      product = await productService.createProduct(USER_ID, {
        title: opp.title,
        description: '',
        aliexpressUrl: opp.aliexpressUrl || opp.productUrl || '',
        aliexpressPrice: opp.costUsd,
        suggestedPrice: opp.suggestedPriceUsd || opp.costUsd * 1.5,
        imageUrls: images,
        currency: 'USD',
        targetCountry: 'US',
        originCountry: 'CN',
        shippingCost: shippingPersist,
        importTax: typeof opp.importTax === 'number' && opp.importTax > 0 ? opp.importTax : undefined,
        totalCost: typeof opp.totalCost === 'number' && opp.totalCost > 0 ? opp.totalCost : undefined,
        estimatedDeliveryDays: deliveryDaysPersist,
        productData: productDataSeed,
      });
    } catch (e: unknown) {
      if (e instanceof AppError && e.statusCode === 409) {
        skipDup++;
        console.warn('[CYCLE] URL duplicada, siguiente.');
        continue;
      }
      throw e;
    }

    await productService.updateProductStatusSafely(product.id, 'APPROVED', USER_ID, 'opportunity-ebay-us-cycle');

    if (DRY_RUN) {
      console.log('[CYCLE] DRY_RUN: producto creado y aprobado, sin publicar.', { productId: product.id, credentialEnv });
      process.exit(0);
    }

    if (process.env.ENABLE_EBAY_PUBLISH !== 'true') {
      console.error('ENABLE_EBAY_PUBLISH debe ser true para publicar.');
      process.exit(1);
    }

    const marketplaceService = new MarketplaceService();
    const baseTitle = String(opp.title || `Product-${product.id}`).replace(/\s+/g, ' ').trim();
    const uniqueTitle = `${baseTitle.slice(0, 70)} P${product.id}`.replace(/\s+/g, ' ').trim();
    const basePrice = Number(opp.suggestedPriceUsd || opp.costUsd * 1.5);
    const finalPrice = maxCap > 0 && basePrice > maxCap ? maxCap : basePrice;

    try {
      const marginMult = Math.max(
        1.01,
        Number(process.env.EBAY_TARGET_MARGIN_MULTIPLIER) || 1.2,
      );
      const forcedCategory = String(process.env.EBAY_CYCLE_CATEGORY_ID || '').trim();
      const publishPayload: {
        productId: number;
        marketplace: 'ebay';
        customData: Record<string, unknown>;
      } = {
        productId: product.id,
        marketplace: 'ebay',
        customData: {
          title: uniqueTitle,
          price: finalPrice,
          quantity: 1,
          publishMode: 'international',
          publishIntent: 'production',
          targetMarginMultiplier: marginMult,
          ...(forcedCategory ? { categoryId: forcedCategory } : {}),
        },
      };

      const publishResult = await marketplaceService.publishProduct(
        USER_ID,
        publishPayload,
        credentialEnv,
      );

      if (publishResult.success) {
        await productService.updateProductStatusSafely(product.id, 'PUBLISHED', true, USER_ID);
        console.log('[CYCLE] Publicado eBay OK (nuevo artículo; origen CN + aviso de plazos vía pipeline):', {
          attempt: ai + 1,
          productId: product.id,
          listingId: publishResult.listingId,
          listingUrl: publishResult.listingUrl,
          env: credentialEnv,
          categoryHint: forcedCategory || '(sugerida por título)',
        });
        process.exit(0);
      }

      const errStr = String(publishResult.error || '');
      const ratingRetry =
        /supplier rating|below minimum|evidence missing|positive feedback/i.test(errStr) && ai < attemptSlice.length - 1;
      if (ratingRetry) {
        console.warn('[CYCLE] Bloqueo rating eBay, probando siguiente oportunidad:', errStr.slice(0, 120));
        continue;
      }

      console.error('[CYCLE] Publicación sin success:', publishResult);
      process.exit(3);
    } catch (e: any) {
      logger.error('[CYCLE] publish failed', { error: e?.message });
      console.error('[CYCLE] Error:', e?.message || String(e));
      process.exit(3);
    }
  }

  console.error('[CYCLE] Sin producto publicable (duplicados o sin candidatos).', { skipDup });
  process.exit(skipDup > 0 ? 4 : 3);
}

main();
