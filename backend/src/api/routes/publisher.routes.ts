import { Router, Request, Response } from 'express';
import axios from 'axios';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { productService, CreateProductDto } from '../../services/product.service';
import { MarketplaceService } from '../../services/marketplace.service';
import { getAliExpressProductCascaded } from '../../services/aliexpress-acquisition.service';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { toNumber } from '../../utils/decimal.utils';
import { jobService } from '../../services/job.service';
import costCalculator from '../../services/cost-calculator.service';

const router = Router();
router.use(authenticate);

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
    const items = await productService.getProducts(isAdmin ? undefined : userId, { status: 'PENDING' });
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

    const marketplaceService = new MarketplaceService();
    const enrichedItems: any[] = [];
    for (const item of products) {
      const costNum = toNumber(item.aliexpressPrice);
      const shippingNum = toNumber(item.shippingCost ?? 0);
      const importTaxNum = toNumber(item.importTax ?? 0);
      const totalCostNum = toNumber(item.totalCost);
      const effectiveCost = totalCostNum > 0 ? totalCostNum : costNum + shippingNum + importTaxNum;
      const effectivePrice = marketplaceService.getEffectiveListingPrice(item);
      if (effectivePrice <= 0 || effectivePrice <= effectiveCost) continue;
      try {
        const productData = item.productData ? JSON.parse(item.productData as string) : {};
        const { images: imagesArr, imageUrl } = parseImages(item.images);
        const profit = effectivePrice - effectiveCost;
        const roi = effectiveCost > 0 ? (profit / effectiveCost) * 100 : 0;
        const deliveryDays = (productData as any).estimatedDeliveryDays ?? (productData as any).shipping?.estimatedDays ?? (productData as any).deliveryDays ?? null;
        const calcFor = (mk: 'ebay' | 'amazon' | 'mercadolibre') => {
          const { netProfit } = costCalculator.calculate(mk, effectivePrice, costNum, { shippingCost: shippingNum, importTax: importTaxNum });
          return Math.round(netProfit * 100) / 100;
        };
        enrichedItems.push({
          ...item,
          images: imagesArr,
          imageUrl: imageUrl || undefined,
          description: item.description || (productData as any).description || '',
          source: (productData as any).source || 'manual',
          queuedAt: (productData as any).queuedAt || item.createdAt,
          queuedBy: (productData as any).queuedBy || 'user',
          estimatedCost: costNum,
          shippingCost: shippingNum > 0 ? shippingNum : undefined,
          totalCost: effectiveCost,
          suggestedPrice: effectivePrice,
          estimatedProfit: profit,
          estimatedROI: roi,
          deliveryDays: typeof deliveryDays === 'number' ? deliveryDays : null,
          category: item.category || undefined,
          currency: item.currency || 'USD',
          aliexpressUrl: item.aliexpressUrl || undefined,
          estimatedProfitByMarketplace: { ebay: calcFor('ebay'), mercadolibre: calcFor('mercadolibre'), amazon: calcFor('amazon') }
        });
      } catch (parseError) {
        logger.warn('[PUBLISHER] Failed to parse productData', { productId: item.id, error: parseError });
        const { images: imagesArr, imageUrl } = parseImages(item.images);
        const profit = effectivePrice - effectiveCost;
        const roi = effectiveCost > 0 ? (profit / effectiveCost) * 100 : 0;
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
          queuedAt: item.createdAt,
          estimatedCost: costNum,
          shippingCost: shippingNum > 0 ? shippingNum : undefined,
          totalCost: effectiveCost,
          suggestedPrice: effectivePrice,
          estimatedProfit: profit,
          estimatedROI: roi,
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
    
    await productService.updateProductStatus(id, 'APPROVED', req.user!.userId);

    // ✅ Delegar publicación al job (mismo flujo que Queue Publishing Jobs) para evitar timeouts HTTP
    if (Array.isArray(marketplaces) && marketplaces.length > 0) {
      const job = await jobService.addPublishingJob({
        userId: product.userId,
        productId: product.id,
        marketplaces,
        customData,
      });
      if (job && job.id) {
        logger.info('[PUBLISHER] Publishing job queued', { productId: id, jobId: job.id, marketplaces });
        return res.json({
          success: true,
          message: `Product approved. Publication is being processed; you will receive a notification when it finishes.`,
          jobQueued: true,
          jobId: job.id,
        });
      }
      // Redis unavailable: fallback to synchronous publish
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
            customData
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

export default router;
