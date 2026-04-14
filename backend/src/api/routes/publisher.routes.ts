import { Router, Request, Response } from 'express';
import axios from 'axios';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { productService, CreateProductDto } from '../../services/product.service';
import { MarketplaceService } from '../../services/marketplace.service';
import { getAliExpressProductCascaded } from '../../services/aliexpress-acquisition.service';
import { CredentialsManager } from '../../services/credentials-manager.service';
import { aliexpressAffiliateAPIService } from '../../services/aliexpress-affiliate-api.service';
import { aliexpressDropshippingAPIService } from '../../services/aliexpress-dropshipping-api.service';
import { prisma } from '../../config/database';
import { isRedisAvailable } from '../../config/redis';
import { logger } from '../../config/logger';
import { toNumber } from '../../utils/decimal.utils';
import { getEffectiveShippingCostForPublish } from '../../utils/shipping.utils';
import { extractAliExpressItemIdFromUrl } from '../../utils/aliexpress-item-id';
import { jobService, publishingQueue } from '../../services/job.service';
import { mercadoLibrePublishRequiresRedisQueue } from '../../utils/ml-operational-guards';
import costCalculator from '../../services/cost-calculator.service';
import { calculateEbayPrice } from '../../services/marketplace-fee-intelligence.service';
import {
  hasValidInternationalTrackingMethod,
  isPreferredEbayUsShippingMethod,
  minShippingCostFromApi,
  selectPurchasableSkuSoft,
} from '../../services/pre-publish-validator.service';
import type { AliExpressDropshippingCredentials } from '../../types/api-credentials.types';
import {
  autoGenerateSimpleProcessedPack,
  getCanonicalMercadoLibreAssetPackDir,
  inspectMercadoLibreAssetPack,
} from '../../services/mercadolibre-image-remediation.service';

const router = Router();
router.use(authenticate);

const MANUAL_LIST_DEFAULT_MARGIN = 1.2;
const MANUAL_LIST_MIN_RATING_FIVE = 4.75; // >95% positive
const MANUAL_LIST_DISPATCH_TIME_MAX = 3;

function toRatingFiveStar(evaluateScore?: number, evaluateRate?: number): number | null {
  if (evaluateScore != null && Number.isFinite(evaluateScore)) {
    if (evaluateScore <= 5) return evaluateScore;
    if (evaluateScore <= 100) return evaluateScore / 20;
  }
  if (evaluateRate != null && Number.isFinite(evaluateRate)) {
    if (evaluateRate <= 5) return evaluateRate;
    if (evaluateRate <= 100) return evaluateRate / 20;
  }
  return null;
}

function resolveManualAliExpressItemId(raw: unknown): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^\d{6,}$/.test(value)) return value;
  return extractAliExpressItemIdFromUrl(value);
}

async function loadAffiliateForManualList(userId: number) {
  const envAppKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim();
  const envAppSecret = (
    process.env.ALIEXPRESS_AFFILIATE_APP_SECRET ||
    process.env.ALIEXPRESS_APP_SECRET ||
    ''
  ).trim();

  const envCreds =
    envAppKey && envAppSecret
      ? ({
          appKey: envAppKey,
          appSecret: envAppSecret,
          trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
          sandbox: false,
        } as const)
      : null;

  const creds = envCreds ?? (await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'production'));
  if (!creds || !('appKey' in creds) || !('appSecret' in creds) || !creds.appKey || !creds.appSecret) {
    throw new AppError(
      'AliExpress Affiliate credentials are required for manual eBay listing preload.',
      400
    );
  }
  aliexpressAffiliateAPIService.setCredentials(creds as any);
  return aliexpressAffiliateAPIService;
}

async function loadDropshippingForManualList(userId: number) {
  const creds = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-dropshipping',
    'production'
  )) as AliExpressDropshippingCredentials | null;
  if (!creds?.appKey || !creds?.appSecret || !creds?.accessToken) {
    throw new AppError(
      'AliExpress Dropshipping credentials are required for manual eBay listing preload.',
      400
    );
  }
  aliexpressDropshippingAPIService.setCredentials(creds);
  return aliexpressDropshippingAPIService;
}

async function buildManualEbayUsDraft(params: {
  userId: number;
  aliexpressItemId: string;
  targetMarginMultiplier?: number;
}) {
  const userId = params.userId;
  const itemId = params.aliexpressItemId;
  const targetMarginMultiplier = Math.max(
    1.01,
    Number(params.targetMarginMultiplier) || MANUAL_LIST_DEFAULT_MARGIN
  );
  const aliexpressUrl = `https://www.aliexpress.com/item/${itemId}.html`;

  const dsService = await loadDropshippingForManualList(userId);
  const dsInfo = await dsService.getProductInfo(itemId, {
    localCountry: 'US',
    localLanguage: 'en',
  });

  const skuPick = selectPurchasableSkuSoft(dsInfo);
  if (skuPick.ok === false) {
    throw new AppError(`AliExpress SKU is not purchasable: ${skuPick.reason}`, 400);
  }

  const rawMethods = dsInfo.shippingInfo?.availableShippingMethods ?? [];
  const approvedMethods = rawMethods
    .map((method) => {
      const methodName = String(method?.methodName || '').trim();
      const costUsd = Number(method?.cost);
      return {
        methodName,
        costUsd: Number.isFinite(costUsd) ? costUsd : NaN,
        estimatedDays:
          method?.estimatedDays != null && Number.isFinite(Number(method.estimatedDays))
            ? Number(method.estimatedDays)
            : null,
        isPreferred: isPreferredEbayUsShippingMethod(methodName),
        hasTracking: hasValidInternationalTrackingMethod(methodName),
      };
    })
    .filter((m) => Number.isFinite(m.costUsd) && m.costUsd >= 0)
    .filter((m) => m.isPreferred && m.hasTracking)
    .sort((a, b) => a.costUsd - b.costUsd);

  const selectedMethod = approvedMethods[0] || null;
  const approvedFreightFallbackOptions: Array<{
    methodName: string;
    costUsd: number;
    estimatedDays: number | null;
    isPreferred: boolean;
    hasTracking: boolean;
  }> = [];

  if (!selectedMethod) {
    try {
      const freightQuote = await dsService.calculateBuyerFreight({
        countryCode: 'US',
        productId: itemId,
        productNum: 1,
        sendGoodsCountryCode: 'CN',
        skuId: skuPick.skuId || undefined,
        price: String(Math.max(0.01, Number(skuPick.unitPrice) || Number(dsInfo.salePrice) || 0.01)),
        priceCurrency: String(dsInfo.currency || 'USD').toUpperCase(),
      });

      for (const option of freightQuote.options || []) {
        const methodName = String(option.serviceName || '').trim();
        const costUsd = Number(option.freightAmount);
        if (!methodName || !Number.isFinite(costUsd) || costUsd < 0) continue;

        const isPreferred = isPreferredEbayUsShippingMethod(methodName);
        const hasTracking = hasValidInternationalTrackingMethod(methodName);
        if (!isPreferred || !hasTracking) continue;

        approvedFreightFallbackOptions.push({
          methodName,
          costUsd,
          estimatedDays:
            option.estimatedDeliveryTime != null && Number.isFinite(Number(option.estimatedDeliveryTime))
              ? Number(option.estimatedDeliveryTime)
              : null,
          isPreferred,
          hasTracking,
        });
      }

      approvedFreightFallbackOptions.sort((a, b) => a.costUsd - b.costUsd);
    } catch (error: any) {
      logger.warn('[PUBLISHER][manual-list] buyer freight fallback failed', {
        itemId,
        error: error?.message || String(error),
      });
    }
  }

  const selectedFreightFallback = approvedFreightFallbackOptions[0] || null;
  const shippingCostUsd =
    selectedMethod?.costUsd ??
    selectedFreightFallback?.costUsd ??
    minShippingCostFromApi(dsInfo, {
      enforceEbayUsApprovedServices: true,
      requireInternationalTracking: true,
    });

  if (shippingCostUsd == null || !Number.isFinite(shippingCostUsd) || shippingCostUsd < 0) {
    throw new AppError(
      'Supplier does not offer AliExpress Standard Shipping or SpeedPAK with valid international tracking for eBay US.',
      400
    );
  }

  let affiliateDetail: any = null;
  try {
    const affiliate = await loadAffiliateForManualList(userId);
    const details = await affiliate.getProductDetails({
      productIds: itemId,
      shipToCountry: 'US',
      targetCurrency: 'USD',
      targetLanguage: 'EN',
    });
    affiliateDetail = details?.[0] || null;
  } catch (error: any) {
    logger.warn('[PUBLISHER][manual-list] Could not load affiliate detail', {
      itemId,
      error: error?.message || String(error),
    });
  }

  const supplierRatingFive = toRatingFiveStar(
    affiliateDetail?.evaluateScore,
    affiliateDetail?.evaluateRate
  );
  const supplierPositivePercent =
    supplierRatingFive != null ? Number((supplierRatingFive * 20).toFixed(2)) : null;
  const passesRating = supplierRatingFive != null && supplierRatingFive >= MANUAL_LIST_MIN_RATING_FIVE;
  const hasValidTracking = selectedMethod != null || selectedFreightFallback != null;
  const selectedShippingServiceName =
    selectedMethod?.methodName || selectedFreightFallback?.methodName || null;
  const selectedShippingEtaDays =
    selectedMethod?.estimatedDays ?? selectedFreightFallback?.estimatedDays ?? null;
  const approvedShippingOptions = [
    ...approvedMethods,
    ...approvedFreightFallbackOptions.filter(
      (fallback) => !approvedMethods.some((method) => method.methodName === fallback.methodName)
    ),
  ];

  const blockers: string[] = [];
  if (!passesRating) {
    blockers.push('Supplier must have >95% positive rating to publish on eBay US.');
  }
  if (!hasValidTracking) {
    blockers.push(
      'Supplier must offer AliExpress Standard Shipping or SpeedPAK with international tracking.'
    );
  }

  const title = String(affiliateDetail?.productTitle || dsInfo.productTitle || `AliExpress Item ${itemId}`).trim();
  const description = String(affiliateDetail?.description || '').trim();
  const category = String(affiliateDetail?.categoryName || '').trim() || null;
  const images = [
    String(affiliateDetail?.productMainImageUrl || '').trim(),
    ...((Array.isArray(affiliateDetail?.productSmallImageUrls)
      ? affiliateDetail.productSmallImageUrls
      : []) as unknown[])
      .map((v) => String(v || '').trim()),
    ...((Array.isArray(dsInfo.productImages) ? dsInfo.productImages : []) as unknown[])
      .map((v) => String(v || '').trim()),
  ].filter((url, idx, arr) => Boolean(url) && arr.indexOf(url) === idx);

  const aliexpressCostUsd = Math.max(0.01, Number(skuPick.unitPrice) || Number(dsInfo.salePrice) || 0.01);
  const pricing = calculateEbayPrice({
    aliexpressCostUsd,
    shippingCostUsd,
    targetMarginMultiplier,
  });
  const importTaxUsd = Number(pricing.breakdown.importTaxUsd || 0);
  const estimatedEbayFeeUsd = Number(
    (
      pricing.suggestedPriceUsd * (Number(pricing.breakdown.feePercentApplied || 0) / 100) +
      Number(pricing.breakdown.fixedFeeUsd || 0)
    ).toFixed(2)
  );
  const landedCostBeforeFeesUsd = Number((aliexpressCostUsd + shippingCostUsd + importTaxUsd).toFixed(2));
  const totalEstimatedCostUsd = Number((landedCostBeforeFeesUsd + estimatedEbayFeeUsd).toFixed(2));

  return {
    aliexpressItemId: itemId,
    aliexpressUrl,
    title,
    description,
    category,
    images,
    pricing: {
      aliexpressCostUsd: Number(aliexpressCostUsd.toFixed(2)),
      shippingCostUsd: Number(shippingCostUsd.toFixed(2)),
      importTaxUsd,
      ebayFeePercent: Number(pricing.breakdown.feePercentApplied || 0),
      ebayFixedFeeUsd: Number(pricing.breakdown.fixedFeeUsd || 0),
      estimatedEbayFeeUsd,
      landedCostBeforeFeesUsd,
      totalEstimatedCostUsd,
      targetMarginMultiplier,
      suggestedPriceUsd: pricing.suggestedPriceUsd,
      roundedRule: 'round_up_to_.99_usd',
    },
    compliance: {
      supplierRatingFive,
      supplierPositivePercent,
      minimumRequiredRatingFive: MANUAL_LIST_MIN_RATING_FIVE,
      hasValidInternationalTracking: hasValidTracking,
      selectedShippingService: selectedShippingServiceName,
      selectedShippingEtaDays,
      approvedShippingOptions: approvedShippingOptions.slice(0, 5),
      canPublish: blockers.length === 0,
      blockers,
    },
    ebayPolicyPreview: {
      country: 'CN',
      location: 'China',
      shippingService: 'StandardShippingFromChina',
      dispatchTimeMax: MANUAL_LIST_DISPATCH_TIME_MAX,
    },
    source: {
      skuId: skuPick.skuId || null,
      shippingMethodsDetected: rawMethods.length,
    },
  };
}

// GET /api/publisher/proxy-image?url=... - Proxy de imágenes (evita hotlink blocking de AliExpress)
const ALLOWED_IMAGE_HOSTS = ['alicdn.com', 'aliexpress.com', 'ae01.alicdn.com', 'ae02.alicdn.com', 'ae03.alicdn.com', 'placehold.co', 'via.placeholder.com'];
router.get('/proxy-image', async (req: Request, res: Response) => {
  try {
    const rawUrl = req.query.url as string;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ error: 'Missing url parameter' });
    }
    const decoded = decodeURIComponent(rawUrl.trim());
    let parsed: URL;
    try {
      parsed = new URL(decoded);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_IMAGE_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }
    const resp = await axios.get(decoded, { responseType: 'arraybuffer', timeout: 10000, maxContentLength: 5 * 1024 * 1024 });
    const ct = resp.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(resp.data);
  } catch (e: any) {
    logger.warn('[PUBLISHER] Proxy image failed', { url: req.query.url, error: e?.message });
    res.status(502).json({ error: 'Failed to fetch image' });
  }
});

// POST /api/publisher/bootstrap_image_pack/:productId
// Admin-only: generates a simple square-white approved image pack for a product so the
// P98 approved-disk-pack path in runMercadoLibreImageRemediationPipeline can unblock publish.
router.post('/bootstrap_image_pack/:productId', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);
    if (!productId || isNaN(productId)) {
      return res.status(400).json({ success: false, error: 'Invalid productId' });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, title: true, images: true },
    });
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    let imageUrls: string[] = [];
    try {
      const parsed = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
      if (Array.isArray(parsed)) {
        imageUrls = parsed.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
      } else if (typeof parsed === 'string' && parsed.startsWith('http')) {
        imageUrls = [parsed];
      }
    } catch {
      return res.status(400).json({ success: false, error: 'Cannot parse product images' });
    }

    if (imageUrls.length < 2) {
      return res.status(422).json({ success: false, error: `Need at least 2 image URLs, found ${imageUrls.length}` });
    }

    const rootDir = getCanonicalMercadoLibreAssetPackDir(productId);
    const generated = await autoGenerateSimpleProcessedPack({
      productId,
      title: product.title,
      imageUrls,
      rootDir,
      listingId: null,
    });

    const pack = await inspectMercadoLibreAssetPack({ productId });
    logger.info('[PUBLISHER] bootstrap_image_pack completed', { productId, generated, packApproved: pack.packApproved });

    return res.json({ success: true, generated, packApproved: pack.packApproved, pack });
  } catch (error: any) {
    logger.error('[PUBLISHER] bootstrap_image_pack failed', { error: error?.message });
    return res.status(500).json({ success: false, error: error?.message ?? 'Internal error' });
  }
});

// POST /api/publisher/send_for_approval/:productId
// ✅ OBJETIVO: Enviar un producto existente a Intelligent Publisher (asegurar status PENDING)
// Body opcional: { primaryImageIndex?: number } - imagen de portada para Mercado Libre
router.post('/send_for_approval/:productId', async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);
    const { primaryImageIndex } = req.body || {};
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    // Verificar que el producto existe y pertenece al usuario (o es admin)
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        ...(isAdmin ? {} : { userId })
      }
    });

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: 'Producto no encontrado o no tienes permiso para acceder a él' 
      });
    }

    // ✅ Guardar primaryImageIndex en productData si se proporciona (para ML portada)
    if (typeof primaryImageIndex === 'number' && primaryImageIndex >= 0) {
      const currentData = product.productData ? JSON.parse(String(product.productData)) : {};
      await prisma.product.update({
        where: { id: productId },
        data: { productData: JSON.stringify({ ...currentData, primaryImageIndexForML: primaryImageIndex }) },
      });
      logger.info('[PUBLISHER] primaryImageIndex saved for ML', { productId, primaryImageIndex });
    }

    // ✅ CORREGIDO: Asegurar que el producto esté en estado PENDING (siempre actualizar para forzar refresco)
    if (product.status !== 'PENDING') {
      await productService.updateProductStatusSafely(
        productId,
        'PENDING',
        false, // isPublished = false
        isAdmin ? userId : undefined
      );
      logger.info('[PUBLISHER] Product status updated to PENDING', { productId, userId, previousStatus: product.status });
    } else {
      logger.info('[PUBLISHER] Product already in PENDING status', { productId, userId });
      // ✅ Asegurar que isPublished sea false cuando está en PENDING
      if (product.isPublished) {
        await prisma.product.update({
          where: { id: productId },
          data: { isPublished: false }
        });
        logger.info('[PUBLISHER] Product isPublished set to false (was inconsistent)', { productId, userId });
      }
    }

    // ✅ Verificar que el producto ahora esté en estado PENDING
    const updatedProduct = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true, title: true, isPublished: true }
    });

    logger.info('[PUBLISHER] Product sent for approval', { 
      productId, 
      userId, 
      status: updatedProduct?.status,
      title: updatedProduct?.title?.substring(0, 50),
      isPublished: updatedProduct?.isPublished
    });

    return res.json({ 
      success: true, 
      message: 'Producto enviado a Intelligent Publisher para aprobación',
      data: { 
        productId, 
        status: updatedProduct?.status || 'PENDING',
        title: updatedProduct?.title
      }
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to send product for approval';
    logger.error('[PUBLISHER] Error sending product for approval', { 
      error: errorMessage, 
      stack: e instanceof Error ? e.stack : undefined,
      productId: req.params.productId,
      userId: req.user?.userId
    });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/add_for_approval
router.post('/add_for_approval', async (req: Request, res: Response) => {
  try {
    const { aliexpressUrl, scrape, ...customData } = req.body || {};
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    
    // ✅ LÍMITE DE PRODUCTOS PENDIENTES: Validar antes de crear
    const { pendingProductsLimitService } = await import('../../services/pending-products-limit.service');
    await pendingProductsLimitService.ensurePendingLimitNotExceeded(userId, isAdmin);
    
    let product;

    if (scrape && aliexpressUrl) {
      // ✅ Cascading acquisition: Affiliate API → Scraper Bridge → Native Scraper
      const scrapedData = await getAliExpressProductCascaded(String(aliexpressUrl), userId);

      // Crear producto desde datos scrapeados
      let aliexpressPrice = scrapedData.price ?? customData.aliexpressPrice ?? 0;
      if (aliexpressPrice <= 0) aliexpressPrice = 1;
      const suggestedPrice = customData.suggestedPrice ?? aliexpressPrice * 2;

      const productData: CreateProductDto = {
        title: scrapedData.title || customData.title || 'Producto sin título',
        description: scrapedData.description || customData.description || '',
        aliexpressUrl: String(aliexpressUrl),
        aliexpressPrice,
        suggestedPrice,
        finalPrice: customData.finalPrice,
        imageUrl: scrapedData.images?.[0] || customData.imageUrl,
        imageUrls: scrapedData.images || customData.imageUrls,
        category: scrapedData.category || customData.category,
        currency: scrapedData.currency || customData.currency || 'USD',
        ...customData
      };

      product = await productService.createProduct(userId, productData, isAdmin);
      logger.info('Product created from AliExpress scraping', { productId: product.id, userId });
    } else {
      // Crear producto manualmente
      if (!aliexpressUrl || !customData?.aliexpressPrice || !customData?.suggestedPrice || !customData?.title) {
        return res.status(400).json({ success: false, error: 'Missing required fields: aliexpressUrl, title, aliexpressPrice, suggestedPrice' });
      }

      const productData: CreateProductDto = {
        title: customData.title,
        description: customData.description,
        aliexpressUrl: String(aliexpressUrl),
        aliexpressPrice: customData.aliexpressPrice,
        suggestedPrice: customData.suggestedPrice,
        finalPrice: customData.finalPrice,
        imageUrl: customData.imageUrl,
        imageUrls: customData.imageUrls,
        category: customData.category,
        currency: customData.currency || 'USD',
        tags: customData.tags,
        shippingCost: customData.shippingCost,
        estimatedDeliveryDays: customData.estimatedDeliveryDays,
        productData: customData.productData
      };

      product = await productService.createProduct(userId, productData, isAdmin);
      logger.info('Product created manually', { productId: product.id, userId });
    }

    // ✅ CRÍTICO: Si analyze está en modo automatic, aprobar automáticamente el producto
    // Esto permite que el workflow avance de ANALYZE a PUBLISH
    if (product && product.status === 'PENDING') {
      try {
        const { workflowConfigService } = await import('../../services/workflow-config.service');
        const analyzeMode = await workflowConfigService.getStageMode(userId, 'analyze');
        
        if (analyzeMode === 'automatic') {
          await productService.updateProductStatusSafely(
            product.id,
            'APPROVED',
            userId,
            'Publisher: Aprobación automática (analyze en modo automatic)'
          );
          
          logger.info('Publisher: Producto aprobado automáticamente', {
            productId: product.id,
            userId,
            analyzeMode
          });
          
          // Actualizar el objeto product para devolver el estado correcto
          product = { ...product, status: 'APPROVED' };
        }
      } catch (approveError: any) {
        logger.error('Publisher: Error aprobando producto automáticamente', {
          productId: product.id,
          userId,
          error: approveError?.message || String(approveError)
        });
        // No fallar el flujo si la aprobación automática falla
      }
    }

    return res.status(201).json({ success: true, data: product });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to add product';
    logger.error('Error in POST /api/publisher/add_for_approval', { error: errorMessage, stack: e instanceof Error ? e.stack : undefined });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/publisher/ebay/listing-economics-preview
 * Desglose de costos, impuesto modelo US, comisiones eBay y margen neto antes de publicar.
 */
router.post('/ebay/listing-economics-preview', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const productId = Number(req.body?.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ success: false, message: 'productId requerido' });
    }
    const userSettingsService = (await import('../../services/user-settings.service')).default;
    const defaultUsd = await userSettingsService.getDefaultChinaUsShippingUsd(userId);
    const row = await prisma.product.findFirst({
      where: { id: productId, userId },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    const { calculateEbayPrice, calculateFeeIntelligence } = await import(
      '../../services/marketplace-fee-intelligence.service'
    );
    const aliexpressCostUsd = Math.max(0.01, toNumber(row.aliexpressPrice));
    const shippingCostUsd = getEffectiveShippingCostForPublish(row, undefined, { defaultUsd });
    const marginMultiplier = Math.max(
      1.01,
      Number(req.body?.targetMarginMultiplier) ||
        Number(process.env.EBAY_TARGET_MARGIN_MULTIPLIER) ||
        1.2
    );
    const ebayPricing = calculateEbayPrice({
      aliexpressCostUsd,
      shippingCostUsd,
      targetMarginMultiplier: marginMultiplier,
    });
    const listPriceUsd = ebayPricing.suggestedPriceUsd;
    const importTaxUsd = ebayPricing.breakdown.importTaxUsd;
    const landedSupplierUsd = aliexpressCostUsd + shippingCostUsd + importTaxUsd;
    const fees = calculateFeeIntelligence({
      marketplace: 'ebay',
      listingPrice: listPriceUsd,
      supplierCost: landedSupplierUsd,
      shippingCostToCustomer: 0,
      currency: 'USD',
    });
    return res.json({
      success: true,
      data: {
        productId,
        listingPriceUsd: listPriceUsd,
        costs: {
          aliexpressCostUsd,
          shippingCostUsd,
          importTaxUsd,
          landedSupplierUsd: Number(landedSupplierUsd.toFixed(2)),
        },
        marginModel: {
          targetMarginMultiplier: marginMultiplier,
          ...ebayPricing.breakdown,
        },
        marketplaceFees: fees.breakdown,
        expectedMarginPercent: fees.expectedMarginPercent,
        expectedNetProfitUsd: fees.expectedProfit,
        totalMarketplaceFeesUsd: fees.totalMarketplaceCost,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[PUBLISHER] ebay listing-economics-preview failed', { message });
    return res.status(500).json({ success: false, message });
  }
});

// GET /api/publisher/manual-list/:aliexpressItemId
// Preload manual eBay US listing economics + compliance from AliExpress item id/url.
router.get('/manual-list/:aliexpressItemId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const resolvedItemId = resolveManualAliExpressItemId(req.params.aliexpressItemId);
    if (!resolvedItemId) {
      return res.status(400).json({
        success: false,
        error: 'invalid_aliexpress_item_id',
        message: 'Provide a valid AliExpress item id or URL.',
      });
    }

    const targetMarginMultiplier = Math.max(
      1.01,
      Number(req.query?.targetMarginMultiplier || req.query?.margin) || MANUAL_LIST_DEFAULT_MARGIN
    );
    const draft = await buildManualEbayUsDraft({
      userId,
      aliexpressItemId: resolvedItemId,
      targetMarginMultiplier,
    });

    return res.json({
      success: true,
      data: draft,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[PUBLISHER][manual-list] preload failed', {
      userId: req.user?.userId,
      aliexpressItemId: req.params.aliexpressItemId,
      error: message,
    });
    return res.status(error instanceof AppError ? error.statusCode : 500).json({
      success: false,
      error: 'manual_list_preload_failed',
      message,
    });
  }
});

// POST /api/publisher/manual-list/confirm-and-publish
// Creates (or refreshes) product draft and triggers one-click publish to eBay US.
router.post('/manual-list/confirm-and-publish', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    const resolvedItemId = resolveManualAliExpressItemId(
      req.body?.aliexpressItemId || req.body?.aliexpress_item_id || req.body?.aliexpressUrl
    );
    if (!resolvedItemId) {
      return res.status(400).json({
        success: false,
        error: 'invalid_aliexpress_item_id',
        message: 'Provide a valid aliexpressItemId or AliExpress URL.',
      });
    }

    const targetMarginMultiplier = Math.max(
      1.01,
      Number(req.body?.targetMarginMultiplier) || MANUAL_LIST_DEFAULT_MARGIN
    );
    const draft = await buildManualEbayUsDraft({
      userId,
      aliexpressItemId: resolvedItemId,
      targetMarginMultiplier,
    });

    if (!draft.compliance.canPublish) {
      return res.status(400).json({
        success: false,
        error: 'manual_list_compliance_blocked',
        message: 'Supplier does not pass eBay US preventive validation.',
        blockers: draft.compliance.blockers,
        data: draft,
      });
    }

    const aliexpressUrl = draft.aliexpressUrl;
    const existing = await prisma.product.findFirst({
      where: {
        userId,
        aliexpressUrl: {
          equals: aliexpressUrl,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        status: true,
        isPublished: true,
        productData: true,
      },
    });

    if (existing?.id && (String(existing.status || '').toUpperCase() === 'PUBLISHED' || existing.isPublished)) {
      return res.status(409).json({
        success: false,
        error: 'manual_list_existing_published_product',
        message:
          'This AliExpress item already exists as a published product. To avoid altering a live listing, use the existing product flow.',
        existingProductId: existing.id,
      });
    }

    const manualProductDataPatch = {
      manualListEbayUs: {
        aliexpressItemId: resolvedItemId,
        validatedAt: new Date().toISOString(),
        pricing: draft.pricing,
        compliance: draft.compliance,
        ebayPolicyPreview: draft.ebayPolicyPreview,
      },
    };

    let productId: number;
    if (existing?.id) {
      let existingMeta: Record<string, unknown> = {};
      if (existing.productData && typeof existing.productData === 'string') {
        try {
          const parsed = JSON.parse(existing.productData);
          if (parsed && typeof parsed === 'object') existingMeta = parsed as Record<string, unknown>;
        } catch {
          existingMeta = {};
        }
      }

      await prisma.product.update({
        where: { id: existing.id },
        data: {
          title: draft.title || `AliExpress Item ${resolvedItemId}`,
          description: draft.description || '',
          category: draft.category || undefined,
          aliexpressPrice: draft.pricing.aliexpressCostUsd,
          suggestedPrice: draft.pricing.suggestedPriceUsd,
          finalPrice: draft.pricing.suggestedPriceUsd,
          currency: 'USD',
          images: JSON.stringify(draft.images || []),
          shippingCost: draft.pricing.shippingCostUsd,
          importTax: draft.pricing.importTaxUsd,
          totalCost: draft.pricing.landedCostBeforeFeesUsd,
          targetCountry: 'US',
          originCountry: 'CN',
          productData: JSON.stringify({
            ...existingMeta,
            ...manualProductDataPatch,
          }),
        },
      });
      productId = existing.id;
    } else {
      const dto: CreateProductDto = {
        title: draft.title || `AliExpress Item ${resolvedItemId}`,
        description: draft.description || '',
        aliexpressUrl,
        aliexpressPrice: draft.pricing.aliexpressCostUsd,
        suggestedPrice: draft.pricing.suggestedPriceUsd,
        finalPrice: draft.pricing.suggestedPriceUsd,
        imageUrl: draft.images?.[0],
        imageUrls: draft.images,
        category: draft.category || undefined,
        currency: 'USD',
        shippingCost: draft.pricing.shippingCostUsd,
        importTax: draft.pricing.importTaxUsd,
        totalCost: draft.pricing.landedCostBeforeFeesUsd,
        targetCountry: 'US',
        originCountry: 'CN',
        estimatedDeliveryDays: draft.compliance.selectedShippingEtaDays || 25,
        productData: manualProductDataPatch,
      };
      const created = await productService.createProduct(userId, dto, isAdmin);
      productId = created.id;
    }

    await productService.updateProductStatusSafely(productId, 'APPROVED', false, userId);

    const marketplaceService = new MarketplaceService();
    const { workflowConfigService } = await import('../../services/workflow-config.service');
    const userEnvironment = await workflowConfigService.getUserEnvironment(userId);
    const publishResult = await marketplaceService.publishProduct(
      userId,
      {
        productId,
        marketplace: 'ebay',
        customData: {
          price: draft.pricing.suggestedPriceUsd,
          targetMarginMultiplier: draft.pricing.targetMarginMultiplier,
          publishMode: 'international',
          publishIntent: 'production',
        },
      },
      userEnvironment
    );

    if (!publishResult.success) {
      return res.status(400).json({
        success: false,
        error: 'manual_list_publish_failed',
        message: publishResult.error || 'Failed to publish to eBay.',
        productId,
        draft,
        publishResult,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Product validated and published to eBay US.',
      productId,
      draft,
      publishResult,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[PUBLISHER][manual-list] confirm-and-publish failed', {
      userId: req.user?.userId,
      bodyItemId: req.body?.aliexpressItemId || req.body?.aliexpress_item_id || req.body?.aliexpressUrl,
      error: message,
    });
    return res.status(error instanceof AppError ? error.statusCode : 500).json({
      success: false,
      error: 'manual_list_confirm_failed',
      message,
    });
  }
});

// GET /api/publisher/pending
// ✅ MEJORADO: Incluye información de productos pendientes de aprobación
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    
    logger.debug('[PUBLISHER] Fetching pending products', {
      userId,
      isAdmin,
      requestedBy: req.user?.username
    });
    
    // Admin puede ver todos los productos pendientes, usuarios solo los suyos
    // Ordenar por updatedAt DESC: productos enviados recientemente al Publisher aparecen primero
    const items = await productService.getProducts(isAdmin ? undefined : userId, { status: 'PENDING', sortBy: 'updatedAt', sortDir: 'desc', limit: 100 });
    // ✅ FIX: items puede ser { products: [], pagination: {} }
    const products = (items as any).products || (Array.isArray(items) ? items : []);
    
    logger.info('[PUBLISHER] Found pending products', {
      userId,
      isAdmin,
      count: products.length,
      productIds: products.slice(0, 5).map((i: any) => i.id)
    });
    
    // ✅ Helper para extraer images como array y imageUrl del campo images (JSON string)
    const parseImages = (images: string | null | undefined): { images: string[]; imageUrl: string | null } => {
      if (!images) return { images: [], imageUrl: null };
      try {
        const parsed = typeof images === 'string' ? JSON.parse(images) : images;
        if (Array.isArray(parsed)) {
          const urls = parsed.filter((x: any) => typeof x === 'string' && x.startsWith('http'));
          return { images: urls, imageUrl: urls[0] || null };
        }
        if (typeof parsed === 'string' && parsed.startsWith('http')) {
          return { images: [parsed], imageUrl: parsed };
        }
      } catch (error) {
        logger.warn('[PUBLISHER] Failed to parse images field', { error });
      }
      return { images: [], imageUrl: null };
    };

    const userSettingsServiceForPending = (await import('../../services/user-settings.service')).default;
    const pendingDefaultShippingUsd = await userSettingsServiceForPending.getDefaultChinaUsShippingUsd(userId);

    const marketplaceService = new MarketplaceService();
    const enrichedItems: any[] = [];
    for (const item of products) {
      const costNum = toNumber(item.aliexpressPrice);
      const shippingNum = getEffectiveShippingCostForPublish(item, undefined, {
        defaultUsd: pendingDefaultShippingUsd,
      });
      const importTaxNum = toNumber(item.importTax ?? 0);
      const totalCostNum = toNumber(item.totalCost);
      const effectiveCost = totalCostNum > 0 ? totalCostNum : costNum + shippingNum + importTaxNum;
      const effectivePrice = marketplaceService.getEffectiveListingPrice(item);
      // ✅ FIX: No filtrar productos por precio — mostrar TODOS los PENDING en la cola.
      // Antes: `if (effectivePrice <= 0 || effectivePrice <= effectiveCost) continue;`
      // Causa raíz del bug: productos con suggestedPrice insuficiente vs costo+envío eran
      // silenciosamente excluidos, haciéndolos invisibles para el usuario.
      // Ahora: incluir todos, marcar pricingOk=false para que el Publisher los distinga.
      const pricingOk = effectivePrice > 0 && effectivePrice > effectiveCost;
      try {
        const productData = item.productData ? JSON.parse(item.productData as string) : {};
        const { images: imagesArr, imageUrl } = parseImages(item.images);
        const profit = pricingOk ? effectivePrice - effectiveCost : 0;
        const roi = pricingOk && effectiveCost > 0 ? (profit / effectiveCost) * 100 : 0;
        const deliveryDays = (productData as any).estimatedDeliveryDays ?? (productData as any).shipping?.estimatedDays ?? (productData as any).deliveryDays ?? null;
        const calcFor = (mk: 'ebay' | 'amazon' | 'mercadolibre') => {
          if (!pricingOk) return 0;
          const { netProfit } = costCalculator.calculate(mk, effectivePrice, costNum, { shippingCost: shippingNum, importTax: importTaxNum });
          return Math.round(netProfit * 100) / 100;
        };
        enrichedItems.push({
          ...item,
          images: imagesArr,
          imageUrl: imageUrl || undefined,
          description: item.description || (productData as any).description || '',
          source: (productData as any).source || 'manual',
          queuedAt: item.updatedAt || (productData as any).queuedAt || item.createdAt,
          queuedBy: (productData as any).queuedBy || 'user',
          estimatedCost: costNum,
          shippingCost: shippingNum > 0 ? shippingNum : undefined,
          totalCost: effectiveCost,
          suggestedPrice: effectivePrice > 0 ? effectivePrice : toNumber(item.suggestedPrice),
          estimatedProfit: profit,
          estimatedROI: roi,
          pricingOk,
          deliveryDays: typeof deliveryDays === 'number' ? deliveryDays : null,
          category: item.category || undefined,
          currency: item.currency || 'USD',
          aliexpressUrl: item.aliexpressUrl || undefined,
          estimatedProfitByMarketplace: { ebay: calcFor('ebay'), mercadolibre: calcFor('mercadolibre'), amazon: calcFor('amazon') }
        });
      } catch (parseError) {
        logger.warn('[PUBLISHER] Failed to parse productData', { productId: item.id, error: parseError });
        const { images: imagesArr, imageUrl } = parseImages(item.images);
        const profit = pricingOk ? effectivePrice - effectiveCost : 0;
        const roi = pricingOk && effectiveCost > 0 ? (profit / effectiveCost) * 100 : 0;
        const calcFor = (mk: 'ebay' | 'amazon' | 'mercadolibre') => {
          const { netProfit } = costCalculator.calculate(mk, effectivePrice, costNum, { shippingCost: shippingNum, importTax: importTaxNum });
          return Math.round(netProfit * 100) / 100;
        };
        enrichedItems.push({
          ...item,
          images: imagesArr,
          imageUrl: imageUrl || undefined,
          description: item.description || '',
          source: 'manual',
          queuedAt: item.updatedAt || item.createdAt,
          estimatedCost: costNum,
          shippingCost: shippingNum > 0 ? shippingNum : undefined,
          totalCost: effectiveCost,
          suggestedPrice: effectivePrice > 0 ? effectivePrice : toNumber(item.suggestedPrice),
          estimatedProfit: profit,
          estimatedROI: roi,
          pricingOk,
          deliveryDays: null,
          category: item.category || undefined,
          currency: item.currency || 'USD',
          aliexpressUrl: item.aliexpressUrl || undefined,
          estimatedProfitByMarketplace: { ebay: calcFor('ebay'), mercadolibre: calcFor('mercadolibre'), amazon: calcFor('amazon') }
        });
      }
    }

    return res.json({
      success: true,
      items: enrichedItems,
      count: enrichedItems.length
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to list pending';
    logger.error('[PUBLISHER] Error fetching pending products', {
      error: errorMessage,
      stack: e instanceof Error ? e.stack : undefined,
      userId: req.user?.userId
    });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

function parsePublisherProductIds(body: unknown): number[] {
  const raw = (body as { productIds?: unknown })?.productIds;
  if (!Array.isArray(raw)) return [];
  const ids = raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(ids));
}

// POST /api/publisher/pending/reject/:productId — marca REJECTED (permanece en catálogo, fuera de cola de aprobación)
router.post('/pending/reject/:productId', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.productId);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'ID de producto inválido' });
    }
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const reasonRaw = (req.body as { reason?: string })?.reason;
    const reason =
      typeof reasonRaw === 'string' && reasonRaw.trim().length > 0
        ? reasonRaw.trim().slice(0, 500)
        : 'Rechazado desde Publicador inteligente';

    const product = await productService.getProductById(id, userId, isAdmin);
    if (!isAdmin && product.userId !== userId) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para rechazar este producto' });
    }
    if (product.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden rechazar productos en estado pendiente de aprobación',
        currentStatus: product.status,
      });
    }

    await productService.updateProductStatusSafely(id, 'REJECTED', userId, reason);
    logger.info('[PUBLISHER] Product rejected from pending queue', { productId: id, actorUserId: userId, isAdmin });
    return res.json({ success: true, message: 'Producto rechazado; ya no aparece en pendientes', productId: id });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to reject product';
    logger.error('[PUBLISHER] reject pending failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/pending/remove/:productId — elimina el producto (destructivo; no permitido si tiene ventas)
router.post('/pending/remove/:productId', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.productId);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'ID de producto inválido' });
    }
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    const product = await productService.getProductById(id, userId, isAdmin);
    if (!isAdmin && product.userId !== userId) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar este producto' });
    }
    if (product.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden eliminar desde esta cola productos en estado pendiente',
        currentStatus: product.status,
      });
    }

    await productService.deleteProduct(id, userId, isAdmin);
    logger.info('[PUBLISHER] Product removed (deleted) from pending queue', { productId: id, actorUserId: userId });
    return res.json({ success: true, message: 'Producto eliminado', productId: id });
  } catch (e: unknown) {
    if (e instanceof AppError) {
      return res.status(e.statusCode).json({ success: false, error: e.message });
    }
    const errorMessage = e instanceof Error ? e.message : 'Failed to remove product';
    logger.error('[PUBLISHER] remove pending failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/pending/bulk-reject
router.post('/pending/bulk-reject', async (req: Request, res: Response) => {
  try {
    const ids = parsePublisherProductIds(req.body);
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Envía productIds: number[]' });
    }
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const reasonRaw = (req.body as { reason?: string })?.reason;
    const reason =
      typeof reasonRaw === 'string' && reasonRaw.trim().length > 0
        ? reasonRaw.trim().slice(0, 500)
        : 'Rechazado en bloque desde Publicador inteligente';

    const rejected: number[] = [];
    const skipped: { id: number; error: string }[] = [];

    for (const id of ids) {
      try {
        const product = await productService.getProductById(id, userId, isAdmin);
        if (!isAdmin && product.userId !== userId) {
          skipped.push({ id, error: 'Sin permiso' });
          continue;
        }
        if (product.status !== 'PENDING') {
          skipped.push({ id, error: `Estado no pendiente (${product.status})` });
          continue;
        }
        await productService.updateProductStatusSafely(id, 'REJECTED', userId, reason);
        rejected.push(id);
      } catch (err: any) {
        skipped.push({ id, error: err?.message || 'Error' });
      }
    }

    logger.info('[PUBLISHER] bulk reject completed', { count: rejected.length, skipped: skipped.length, actorUserId: userId });
    return res.json({ success: true, rejected, skipped, totalRequested: ids.length });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Bulk reject failed';
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/pending/bulk-remove
router.post('/pending/bulk-remove', async (req: Request, res: Response) => {
  try {
    const ids = parsePublisherProductIds(req.body);
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Envía productIds: number[]' });
    }
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    const removed: number[] = [];
    const skipped: { id: number; error: string }[] = [];

    for (const id of ids) {
      try {
        const product = await productService.getProductById(id, userId, isAdmin);
        if (!isAdmin && product.userId !== userId) {
          skipped.push({ id, error: 'Sin permiso' });
          continue;
        }
        if (product.status !== 'PENDING') {
          skipped.push({ id, error: `Estado no pendiente (${product.status})` });
          continue;
        }
        await productService.deleteProduct(id, userId, isAdmin);
        removed.push(id);
      } catch (err: any) {
        const msg = err?.message || 'Error';
        skipped.push({ id, error: msg });
      }
    }

    logger.info('[PUBLISHER] bulk remove completed', { count: removed.length, skipped: skipped.length, actorUserId: userId });
    return res.json({ success: true, removed, skipped, totalRequested: ids.length });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Bulk remove failed';
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// GET /api/publisher/listings
router.get('/listings', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const skip = (page - 1) * limit;

    const mpRaw = String(req.query.marketplace || '').trim().toLowerCase();
    const marketplace = mpRaw === 'ml' ? 'mercadolibre' : mpRaw || undefined;
    const validMarketplaces = ['ebay', 'mercadolibre', 'amazon'];
    const marketplaceFilter =
      marketplace && validMarketplaces.includes(marketplace) ? { marketplace } : undefined;

    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const where: Record<string, unknown> = isAdmin ? {} : { userId: req.user!.userId };
    if (marketplaceFilter) {
      where.marketplace = marketplaceFilter.marketplace;
    }

    const [listings, total] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
        include: { product: { select: { title: true, images: true, aliexpressPrice: true } } },
      }),
      prisma.marketplaceListing.count({ where }),
    ]);

    const items = listings.map((l) => ({
      ...l,
      productTitle: l.product?.title || null,
      productImage: (() => {
        try {
          const imgs = JSON.parse(l.product?.images || '[]');
          return Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : null;
        } catch { return null; }
      })(),
      product: undefined,
    }));

    return res.json({
      success: true,
      items,
      count: items.length,
      total,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to list listings';
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// GET /api/publisher/listings/sync-status — Listing sync state vs marketplaces (workers, reconciled counts)
router.get('/listings/sync-status', async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user!.userId;
    const whereUser = userId != null ? { userId } : {};

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [listingsActive, listingsReconciledLast24h, listingsNeverReconciled] = await Promise.all([
      prisma.marketplaceListing.count({ where: { ...whereUser, status: 'active' } }),
      prisma.marketplaceListing.count({
        where: { ...whereUser, lastReconciledAt: { gte: last24h } },
      }),
      prisma.marketplaceListing.count({
        where: { ...whereUser, lastReconciledAt: null },
      }),
    ]);

    return res.json({
      workersActive: isRedisAvailable,
      listingsActive,
      listingsReconciledLast24h,
      listingsNeverReconciled,
      lastReconciliationCronRun: null,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Sync status failed';
    logger.error('[PUBLISHER] listings/sync-status failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/listings/run-reconciliation-audit — Phase 15: full listing state audit (all listings vs marketplace)
router.post('/listings/run-reconciliation-audit', async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user!.userId;

    const { listingStateReconciliationService } = await import(
      '../../services/listing-state-reconciliation.service'
    );
    const result = await listingStateReconciliationService.runFullAudit({ userId });

    return res.json({
      success: true,
      ...result,
      message: `Audit completed: ${result.scanned} scanned, ${result.corrected} corrected, ${result.errors} errors.`,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Reconciliation audit failed';
    logger.error('[PUBLISHER] run-reconciliation-audit failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/listings/run-full-recovery — Phase 26: Full Listing Audit + Classification + Recovery
router.post('/listings/run-full-recovery', async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? req.body?.userId : req.user!.userId;
    const verifyWithApi = Boolean(req.body?.verifyWithApi);
    const limit = typeof req.body?.limit === 'number' && req.body.limit > 0
      ? Math.min(req.body.limit, 2000)
      : 500;

    const { fullListingAuditService } = await import('../../services/full-listing-audit.service');
    const { listingClassificationEngine } = await import('../../services/listing-classification-engine.service');
    const { listingRecoveryEngine } = await import('../../services/listing-recovery-engine.service');

    const records = await fullListingAuditService.runFullAudit({
      userId,
      limit,
      verifyWithApi,
      verifyBatchSize: verifyWithApi ? 30 : 0,
    });
    const classified = listingClassificationEngine.classifyBatch(records);
    const result = await listingRecoveryEngine.runRecovery(classified);

    return res.json({
      success: true,
      auditCount: records.length,
      ...result,
      message: `Full recovery: ${result.processed} processed, ${result.removedFromDb} removed, ${result.republishEnqueued} republish enqueued, ${result.optimized} optimized.`,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Full recovery failed';
    logger.error('[PUBLISHER] run-full-recovery failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/listings/repair-ml — Repair Mercado Libre listings (VIP67: title, description, attributes)
router.post('/listings/repair-ml', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const listingIds = Array.isArray(req.body?.listingIds)
      ? req.body.listingIds.filter((id: unknown) => typeof id === 'string' && id.trim()).map((id: string) => id.trim())
      : undefined;
    const maxLimit = typeof req.body?.limit === 'number' && req.body.limit > 0
      ? Math.min(req.body.limit, 5000)
      : 2000;

    const marketplaceService = new MarketplaceService();
    const results = await marketplaceService.repairMercadoLibreListings(userId, listingIds, maxLimit);

    const repaired = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return res.json({
      success: true,
      repaired,
      failed,
      total: results.length,
      results,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Repair failed';
    logger.error('[PUBLISHER] repair-ml failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/listings/ebay-close-all-from-api — Cerrar TODO en eBay desde API (como ML)
router.post('/listings/ebay-close-all-from-api', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const marketplaceService = new MarketplaceService();
    const result = await marketplaceService.ebayCloseAllFromApi(userId);
    return res.json({
      success: true,
      closed: result.closed,
      failed: result.failed,
      deletedFromDb: result.deletedFromDb,
      productIdsUpdated: result.productIdsUpdated,
      errors: result.errors,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'ebay-close-all-from-api failed';
    logger.error('[PUBLISHER] ebay-close-all-from-api failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/listings/ebay-close-all — Cerrar TODAS las publicaciones en eBay (desde BD)
router.post('/listings/ebay-close-all', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const marketplaceService = new MarketplaceService();
    const result = await marketplaceService.ebayBulkCloseAndSync(userId);
    return res.json({
      success: true,
      closed: result.closed,
      failed: result.failed,
      deletedFromDb: result.deletedFromDb,
      productIdsUpdated: result.productIdsUpdated,
      errors: result.errors,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'ebay-close-all failed';
    logger.error('[PUBLISHER] ebay-close-all failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/listings/ml-close-all-from-api — Cerrar TODAS las publicaciones en ML (desde API, no solo BD)
router.post('/listings/ml-close-all-from-api', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const marketplaceService = new MarketplaceService();
    const result = await marketplaceService.mlCloseAllFromApi(userId);
    return res.json({
      success: true,
      closed: result.closed,
      failed: result.failed,
      deletedFromDb: result.deletedFromDb,
      productIdsUpdated: result.productIdsUpdated,
      errors: result.errors,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'ml-close-all-from-api failed';
    logger.error('[PUBLISHER] ml-close-all-from-api failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/listings/ml-bulk-close — Cerrar en ML y eliminar listings de la BD (software = realidad)
router.post('/listings/ml-bulk-close', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const listingIds = Array.isArray(req.body?.listingIds)
      ? req.body.listingIds.filter((id: unknown) => typeof id === 'string' && id.trim()).map((id: string) => id.trim())
      : undefined;
    const onlyAlreadyClosed = req.body?.onlyAlreadyClosed === true;

    const marketplaceService = new MarketplaceService();
    const result = await marketplaceService.mlBulkCloseAndSync(userId, { listingIds, onlyAlreadyClosed });

    return res.json({
      success: true,
      closed: result.closed,
      failed: result.failed,
      deletedFromDb: result.deletedFromDb,
      productIdsUpdated: result.productIdsUpdated,
      errors: result.errors,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Bulk close failed';
    logger.error('[PUBLISHER] ml-bulk-close failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// GET /api/publisher/listings/ml-status — Diagnóstico: estado de cada listing ML en la API
router.get('/listings/ml-status', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 200), 500);
    const marketplaceService = new MarketplaceService();
    const items = await marketplaceService.getMlListingsStatus(userId, limit);
    return res.json({ success: true, items, count: items.length });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to get ML status';
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// GET /api/publisher/listings/ml-compliance — Verificación: cumplimiento PI (título/descripción) en ML
router.get('/listings/ml-compliance', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 200), 500);
    const marketplaceService = new MarketplaceService();
    const items = await marketplaceService.checkMercadoLibreCompliance(userId, { limit });
    const compliant = items.filter((i) => i.compliant).length;
    const nonCompliant = items.filter((i) => !i.compliant).length;
    return res.json({
      success: true,
      items,
      count: items.length,
      summary: { compliant, nonCompliant },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to check ML compliance';
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/publisher/approve/:id
// ✅ MEJORADO: Usa ambiente del usuario y mejor logging
// ✅ Cambiado: Permitir a cualquier usuario autenticado aprobar sus propios productos
// ✅ P0.4: Validar credenciales antes de publicar
router.post('/approve/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { marketplaces = [], customData, environment } = req.body || {};
    const requestedPublishMode =
      String(req.body?.publishMode || customData?.publishMode || '').toLowerCase() === 'international'
        ? 'international'
        : 'local';
    const requestedPublishIntentRaw = String(
      req.body?.publishIntent || customData?.publishIntent || ''
    ).toLowerCase();
    const requestedPublishIntent =
      requestedPublishIntentRaw === 'dry_run' ||
      requestedPublishIntentRaw === 'pilot' ||
      requestedPublishIntentRaw === 'production'
        ? requestedPublishIntentRaw
        : 'production';
    const pilotManualAck =
      req.body?.pilotManualAck === true || customData?.pilotManualAck === true;
    const customDataWithMode = {
      ...(customData || {}),
      publishMode: requestedPublishMode,
      publishIntent: requestedPublishIntent,
      pilotManualAck,
    };
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    // ✅ C2: Admin puede ver todos los productos, usuarios solo los suyos
    const product = await productService.getProductById(id, userId, isAdmin);
    
    // ✅ Verificar que el producto pertenece al usuario (si no es admin)
    if (!isAdmin && product.userId !== userId) {
      return res.status(403).json({ 
        success: false, 
        error: 'No tienes permiso para aprobar este producto' 
      });
    }
    
    // ✅ Obtener ambiente del usuario si no se proporciona
    const { workflowConfigService } = await import('../../services/workflow-config.service');
    const requestedEnvironment = environment || await workflowConfigService.getUserEnvironment(product.userId);
    const resolvedMarketplaceEnvironments: Record<string, 'sandbox' | 'production'> = {};
    
    // ✅ P0.4: Verificar que existen credenciales antes de publicar (sin testConnection).
    // El job worker publica directamente sin testConnection y funciona; testConnection
    // (getAccountInfo) puede fallar mientras createListing sí funciona. Si publish falla,
    // el error real se propagará.
    if (Array.isArray(marketplaces) && marketplaces.length > 0) {
      const service = new MarketplaceService();
      const missingCredentials: string[] = [];

      for (const marketplace of marketplaces) {
        try {
          const typedMarketplace = marketplace as 'ebay' | 'amazon' | 'mercadolibre';
          let environmentForMarketplace: 'sandbox' | 'production' = requestedEnvironment;
          let credentials = await service.getCredentials(
            product.userId,
            typedMarketplace,
            environmentForMarketplace
          );

          // ✅ Fallback automático de entorno cuando no se envía uno explícito
          if ((!credentials || !credentials.isActive) && !environment) {
            const fallbackEnvironment: 'sandbox' | 'production' =
              environmentForMarketplace === 'production' ? 'sandbox' : 'production';
            const fallbackCredentials = await service.getCredentials(
              product.userId,
              typedMarketplace,
              fallbackEnvironment
            );

            if (fallbackCredentials && fallbackCredentials.isActive) {
              credentials = fallbackCredentials;
              environmentForMarketplace = fallbackEnvironment;
              logger.warn('[PUBLISHER] Using fallback environment for marketplace credentials', {
                userId: product.userId,
                marketplace,
                requestedEnvironment,
                fallbackEnvironment
              });
            }
          }

          if (!credentials || !credentials.isActive) {
            missingCredentials.push(marketplace);
          } else {
            environmentForMarketplace = credentials.environment || environmentForMarketplace;
            resolvedMarketplaceEnvironments[marketplace] = environmentForMarketplace;
          }
        } catch (error) {
          logger.warn(`[PUBLISHER] Error getting credentials for ${marketplace}`, {
            userId: product.userId,
            marketplace,
            error: error instanceof Error ? error.message : String(error)
          });
          missingCredentials.push(marketplace);
        }
      }

      if (missingCredentials.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing credentials',
          message: `Please configure your ${missingCredentials.join(', ')} credentials before publishing.`,
          missingCredentials,
          action: 'configure_credentials',
          settingsUrl: '/settings?tab=api-credentials'
        });
      }
    }

    const includesMercadoLibre = Array.isArray(marketplaces) && marketplaces.some((m) => m === 'mercadolibre');
    let mercadolibrePreflight:
      | {
          publishIntent?: string;
          requestedMode?: string;
          modeResolved?: string;
          channelCapability?: string;
          overallState?: string;
          blockers?: string[];
          warnings?: string[];
          pilotReadiness?: { evidence?: { approvalId?: string | null } };
          programVerification?: Record<string, unknown>;
        }
      | null = null;

    if (includesMercadoLibre) {
      const { buildMercadoLibrePublishPreflight } = await import('../../services/mercadolibre-publish-preflight.service');
      const preflightEnvironment =
        (resolvedMarketplaceEnvironments['mercadolibre'] as 'sandbox' | 'production' | undefined) ||
        requestedEnvironment;
      const pre = await buildMercadoLibrePublishPreflight({
        userId: product.userId,
        productId: product.id,
        isAdmin,
        environment: preflightEnvironment,
        requestedMode: requestedPublishMode,
        publishIntent: requestedPublishIntent,
        pilotManualAck,
      });
      mercadolibrePreflight = pre as any;
      if (requestedPublishIntent === 'dry_run') {
        return res.status(200).json({
          success: true,
          dryRun: true,
          message: 'Dry-run completed. No publication was executed.',
          preflight: pre,
        });
      }
      if (!pre.publishAllowed) {
        logger.warn('[PUBLISHER] MercadoLibre preflight blocked approve/publication', {
          productId: id,
          userId: req.user!.userId,
          overallState: pre.overallState,
          blockers: pre.blockers,
        });
        return res.status(400).json({
          success: false,
          error: 'mercadolibre_preflight_blocked',
          message: pre.nextAction,
          overallState: pre.overallState,
          publishIntent: pre.publishIntent,
          requestedMode: pre.requestedMode,
          modeResolved: pre.modeResolved,
          channelCapability: pre.channelCapability,
          blockers: pre.blockers,
        });
      }
    }

    if (includesMercadoLibre && !publishingQueue) {
      const queueRequired = mercadoLibrePublishRequiresRedisQueue();
      return res.status(503).json({
        success: false,
        error: 'publishing_queue_unavailable',
        queueRequired,
        message:
          'Mercado Libre approve/publish requires Redis/BullMQ queue ingestion in this phase. Configure REDIS_URL and workers; synchronous fallback is disabled for ML safety.',
      });
    }

    await productService.updateProductStatus(id, 'APPROVED', req.user!.userId);

    // ✅ Delegar publicación al job (mismo flujo que Queue Publishing Jobs) para evitar timeouts HTTP
    if (Array.isArray(marketplaces) && marketplaces.length > 0) {
      const job = await jobService.addPublishingJob({
        userId: product.userId,
        productId: product.id,
        marketplaces,
        customData: customDataWithMode,
      });
      if (job && job.id) {
        if (
          includesMercadoLibre &&
          mercadolibrePreflight?.publishIntent === 'pilot' &&
          mercadolibrePreflight?.requestedMode === 'international'
        ) {
          try {
            const { mlPilotOpsService } = await import('../../services/ml-pilot-ops.service');
            await mlPilotOpsService.appendPilotDecisionLedger({
              userId: product.userId,
              productId: product.id,
              marketplace: 'mercadolibre',
              publishIntent: 'pilot',
              requestedMode: 'international',
              modeResolved:
                mercadolibrePreflight?.modeResolved === 'international' ? 'international' : 'local',
              result: 'enqueued',
              approvalId: mercadolibrePreflight?.pilotReadiness?.evidence?.approvalId || null,
              blockers: mercadolibrePreflight?.blockers || [],
              warnings: mercadolibrePreflight?.warnings || [],
              programVerificationSnapshot: mercadolibrePreflight?.programVerification || null,
              pilotReadinessSnapshot: mercadolibrePreflight?.pilotReadiness || null,
              evidenceSnapshot: {
                jobId: String(job.id),
                overallState: mercadolibrePreflight?.overallState || null,
              },
              reason: 'pilot_publish_job_enqueued',
            });
          } catch (ledgerError) {
            logger.warn('[PUBLISHER] Could not append pilot enqueue ledger', {
              productId: id,
              userId: req.user!.userId,
              error: ledgerError instanceof Error ? ledgerError.message : String(ledgerError),
            });
          }
        }
        logger.info('[PUBLISHER] Publishing job queued', { productId: id, jobId: job.id, marketplaces });
        return res.json({
          success: true,
          message: `Product approved. Publication is being processed; you will receive a notification when it finishes.`,
          jobQueued: true,
          jobId: job.id,
        });
      }
      if (includesMercadoLibre) {
        logger.error('[PUBLISHER] Publishing queue required for Mercado Libre but job was not enqueued', {
          productId: id,
        });
        return res.status(503).json({
          success: false,
          error: 'publishing_queue_unavailable',
          queueRequired: mercadoLibrePublishRequiresRedisQueue(),
          message:
            'Could not enqueue Mercado Libre publish job. Check Redis/BullMQ; synchronous fallback is disabled for ML safety.',
        });
      }
      // Redis unavailable: fallback to synchronous publish only for non-ML marketplaces
      logger.warn('[PUBLISHER] Job queue unavailable, falling back to sync publish', { productId: id });
    }

    let publishResults: Array<{ success: boolean; marketplace?: string; error?: string }> = [];
    if (Array.isArray(marketplaces) && marketplaces.length > 0) {
      const service = new MarketplaceService();
      // ✅ Publicar por marketplace usando el entorno resuelto en validación (fallback cuando no hay Redis)
      for (const marketplace of marketplaces) {
        const typedMarketplace = marketplace as 'ebay' | 'amazon' | 'mercadolibre';
        const environmentForMarketplace =
          resolvedMarketplaceEnvironments[marketplace] || requestedEnvironment;
        const result = await service.publishProduct(
          product.userId,
          {
            productId: product.id,
            marketplace: typedMarketplace,
            customData: customDataWithMode
          },
          environmentForMarketplace
        );
        publishResults.push(result);
      }

      // ✅ P1: Manejo mejorado de fallos parciales de publicación
      const successResults = publishResults.filter(r => r.success);
      const failedResults = publishResults.filter(r => !r.success);
      const totalMarketplaces = marketplaces.length;
      const successCount = successResults.length;
      const allSuccessful = successCount === totalMarketplaces;
      const partiallySuccessful = successCount > 0 && successCount < totalMarketplaces;
      
      const currentProductData = product.productData ? JSON.parse(product.productData) : {};
      
      // Construir estructura detallada de publicación por marketplace
      const publicationStatus: Record<string, any> = {};
      publishResults.forEach((result) => {
        // ✅ CORRECCIÓN: PublishResult ya incluye listingId y listingUrl como opcionales
        publicationStatus[result.marketplace || 'unknown'] = {
          success: result.success,
          listingId: (result as any).listingId || null,
          listingUrl: (result as any).listingUrl || null,
          error: result.error || null,
          publishedAt: result.success ? new Date().toISOString() : null
        };
      });
      
      if (allSuccessful) {
        // ✅ Todos los marketplaces tuvieron éxito → PUBLICACIÓN COMPLETA
        await productService.updateProductStatusSafely(
          id,
          'PUBLISHED',
          true,
          req.user!.userId
        );
        
        await prisma.product.update({
          where: { id },
          data: {
            productData: JSON.stringify({
              ...currentProductData,
              approvedAt: new Date().toISOString(),
              approvedBy: req.user!.userId,
              publishedEnvironment: requestedEnvironment,
              resolvedMarketplaceEnvironments,
              publishStatus: 'FULLY_PUBLISHED',
              publicationStatus,
              publishedMarketplaces: successResults.map(r => r.marketplace),
              publishedAt: new Date().toISOString()
            })
          }
        });
        
        logger.info('[PUBLISHER] Product fully published to all marketplaces', {
          productId: id,
          userId: req.user!.userId,
          marketplaces: successResults.map(r => r.marketplace)
        });
      } else if (partiallySuccessful) {
        // ✅ Solo algunos marketplaces tuvieron éxito → PUBLICACIÓN PARCIAL
        // Mantener status como APPROVED pero marcar como parcialmente publicado
        await productService.updateProductStatusSafely(
          id,
          'APPROVED',
          true, // isPublished = true porque al menos uno fue exitoso
          req.user!.userId
        );
        
        await prisma.product.update({
          where: { id },
          data: {
            productData: JSON.stringify({
              ...currentProductData,
              approvedAt: new Date().toISOString(),
              approvedBy: req.user!.userId,
              publishedEnvironment: requestedEnvironment,
              resolvedMarketplaceEnvironments,
              publishStatus: 'PARTIALLY_PUBLISHED',
              publicationStatus,
              publishedMarketplaces: successResults.map(r => r.marketplace),
              failedMarketplaces: failedResults.map(r => ({ 
                marketplace: r.marketplace, 
                error: r.error 
              })),
              partiallyPublishedAt: new Date().toISOString()
            })
          }
        });
        
        logger.warn('[PUBLISHER] Product partially published (not all marketplaces succeeded)', {
          productId: id,
          userId: req.user!.userId,
          successCount,
          totalMarketplaces,
          successful: successResults.map(r => r.marketplace),
          failed: failedResults.map(r => ({ marketplace: r.marketplace, error: r.error }))
        });
      } else {
        // ✅ Ningún marketplace tuvo éxito → NO PUBLICADO
        // Mantener en APPROVED sin marcar como publicado
        await productService.updateProductStatusSafely(
          id,
          'APPROVED',
          false, // isPublished = false porque ninguno tuvo éxito
          req.user!.userId
        );
        
        await prisma.product.update({
          where: { id },
          data: {
            productData: JSON.stringify({
              ...currentProductData,
              approvedAt: new Date().toISOString(),
              approvedBy: req.user!.userId,
              publishedEnvironment: requestedEnvironment,
              resolvedMarketplaceEnvironments,
              publishStatus: 'NOT_PUBLISHED',
              publicationStatus,
              failedMarketplaces: failedResults.map(r => ({ 
                marketplace: r.marketplace, 
                error: r.error 
              })),
              publishAttemptedAt: new Date().toISOString()
            })
          }
        });
        
        logger.warn('[PUBLISHER] All marketplace publications failed', {
          productId: id,
          userId: req.user!.userId,
          failedResults: failedResults.map(r => ({ marketplace: r.marketplace, error: r.error }))
        });
      }
    }

    // ✅ P1: Determinar mensaje según resultado de publicación
    let message = 'Product approved';
    const totalMarketplaces = marketplaces.length || 0;
    const successCount = publishResults.filter(r => r.success).length;
    
    if (totalMarketplaces > 0) {
      if (successCount === totalMarketplaces) {
        message = `Product approved and fully published to ${successCount} marketplace(s)`;
      } else if (successCount > 0) {
        message = `Product approved and partially published to ${successCount}/${totalMarketplaces} marketplace(s). Some publications failed.`;
      } else {
        message = `Product approved but publication failed on all ${totalMarketplaces} marketplace(s). Please check your credentials and try again.`;
      }
    }
    
    return res.json({ 
      success: true, 
      message,
      publishResults,
      environment: requestedEnvironment,
      resolvedMarketplaceEnvironments,
      publishSummary: {
        total: totalMarketplaces,
        successful: successCount,
        failed: totalMarketplaces - successCount,
        publishStatus: totalMarketplaces === 0 ? 'NOT_ATTEMPTED' : 
                       successCount === 0 ? 'NOT_PUBLISHED' :
                       successCount < totalMarketplaces ? 'PARTIALLY_PUBLISHED' : 'FULLY_PUBLISHED'
      }
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to approve';
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/publisher/replace_pictures/:listingId
 * Admin — Replace ML listing pictures with the provided image URLs (or local paths).
 * Used to fix poor_quality_thumbnail without republishing.
 */
router.post('/replace_pictures/:listingId', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { listingId } = req.params;
    const { imageUrls } = req.body as { imageUrls?: string[] };
    if (!listingId) {
      return res.status(400).json({ success: false, error: 'listingId required' });
    }
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ success: false, error: 'imageUrls array required' });
    }
    const userId = req.user!.userId;
    const marketplaceService = new MarketplaceService();
    const { resolveEnvironment } = await import('../../utils/environment-resolver');
    const env = await resolveEnvironment({ userId, default: 'production' });
    const credsResult = await marketplaceService.getCredentials(userId, 'mercadolibre', env);
    if (!credsResult?.isActive || !credsResult?.credentials?.accessToken) {
      return res.status(400).json({ success: false, error: 'ML credentials not found or inactive' });
    }
    const { MercadoLibreService } = await import('../../services/mercadolibre.service');
    const mlService = new MercadoLibreService({
      ...credsResult.credentials,
      siteId: credsResult.credentials.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
    } as any);
    const verified = await mlService.replaceListingPictures(listingId, imageUrls);
    return res.json({ success: true, listingId, status: verified.status, pictures: verified.pictures });
  } catch (e: any) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('[PUBLISHER] replace_pictures failed', { error: errorMessage });
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
