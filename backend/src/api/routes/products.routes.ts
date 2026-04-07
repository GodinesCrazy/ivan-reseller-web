import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { productService, CreateProductDto } from '../../services/product.service';
import { z } from 'zod';
import { logger } from '../../config/logger';
import { toNumber } from '../../utils/decimal.utils';
import { MarketplaceService } from '../../services/marketplace.service';
import { productWorkflowStatusService } from '../../services/product-workflow-status.service';
import { prisma } from '../../config/database';
import { queryWithTimeout } from '../../utils/queryWithTimeout';
import { handleSetupCheck } from '../../utils/setup-check';
import { wrapAsync } from '../../utils/async-route-wrapper';
import { getProductValidationSnapshot } from '../../services/catalog-validation-state.service';

const router = Router();
router.use(authenticate);

// GET /api/products/canary/mlc — E2E: ranked MLC publish + postsale suitability (logged-in seller only)
router.get(
  '/canary/mlc',
  wrapAsync(async (req: Request, res: Response) => {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = req.user!.userId;
    const environment = req.query.environment as 'sandbox' | 'production' | undefined;
    const scanCap = req.query.scanCap ? Number(req.query.scanCap) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const { listMercadoLibreCanaryCandidatesForUser } = await import(
      '../../services/e2e-mercadolibre-canary-candidates.service'
    );
    const { candidates, scanned } = await listMercadoLibreCanaryCandidatesForUser({
      userId,
      isAdmin,
      environment,
      scanCap: Number.isFinite(scanCap) ? scanCap : undefined,
      resultLimit: Number.isFinite(limit) ? limit : undefined,
    });

    res.json({
      success: true,
      data: {
        marketplace: 'mercadolibre',
        note: 'Candidates are limited to products owned by the logged-in user so ML credentials and asset paths align.',
        scanned,
        candidates,
      },
    });
  })
);

// Validación para crear producto
const createProductSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().optional(),
  aliexpressUrl: z.string().url(),
  aliexpressPrice: z.number().positive(),
  suggestedPrice: z.number().positive(),
  finalPrice: z.number().positive().optional(),
  currency: z.string().optional(),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  // ✅ MEJORADO: Costos adicionales para cálculo preciso
  shippingCost: z.number().nonnegative().optional(),
  importTax: z.number().nonnegative().optional(),
  totalCost: z.number().nonnegative().optional(),
  targetCountry: z.string().optional(),
  estimatedDeliveryDays: z.number().optional(),
  productData: z.record(z.any()).optional(),
  importSource: z.enum(['opportunity_search']).optional(),
  aliExpressItemId: z.string().min(4).max(32).optional(),
  targetMarketplaces: z.array(z.string()).optional(),
});

const updateProductSchema = createProductSchema.partial();

const getProductsQuerySchema = z.object({
  status: z.string().optional(),
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1).pipe(z.number().int().min(1).max(1000)),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50).pipe(z.number().int().min(1).max(100)),
  search: z.string().optional(),
  marketplace: z.string().optional(),
  category: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  dateField: z.enum(['createdAt', 'publishedAt']).optional().default('createdAt'),
  priceMin: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  priceMax: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  hasLink: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['createdAt', 'price', 'title', 'status', 'publishedAt']).optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

// GET /api/products - Listar productos
router.get('/', wrapAsync(async (req: Request, res: Response, next: NextFunction) => {
  console.log('[ROUTE_ENTRY] GET /api/products');
  const startTime = Date.now();
  try {
    // ✅ PRODUCTION READY: Validar query parameters
    const validatedQuery = getProductsQuerySchema.parse(req.query);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;

    // ✅ Verificar setup antes de continuar (solo para usuarios no-admin)
    if (!isAdmin && userId) {
      const shouldStop = await handleSetupCheck(userId, res);
      if (shouldStop) {
        return; // Ya se envió respuesta de setup_required
      }
    }
    const timeoutMs = 25000;
    const queryPromise = productService.getProducts(userId, {
      status: validatedQuery.status,
      page: validatedQuery.page,
      limit: validatedQuery.limit,
      search: validatedQuery.search,
      marketplace: validatedQuery.marketplace,
      category: validatedQuery.category,
      dateFrom: validatedQuery.dateFrom,
      dateTo: validatedQuery.dateTo,
      dateField: validatedQuery.dateField,
      priceMin: validatedQuery.priceMin,
      priceMax: validatedQuery.priceMax,
      hasLink: validatedQuery.hasLink,
      sortBy: validatedQuery.sortBy,
      sortDir: validatedQuery.sortDir,
    });
    
    const result = await queryWithTimeout(queryPromise, timeoutMs);
    
    const buildMarketplaceUrl = (marketplace: string, listingId: string | null | undefined): string | null => {
      if (!marketplace || !listingId || typeof listingId !== 'string') return null;
      const m = marketplace.toLowerCase().trim();
      if (m === 'ebay') return `https://www.ebay.com/itm/${listingId}`;
      if (m === 'mercadolibre' || m === 'ml') {
        const mlDomains: Record<string, string> = {
          MLC: 'articulo.mercadolibre.cl',
          MLA: 'articulo.mercadolibre.com.ar',
          MLM: 'articulo.mercadolibre.com.mx',
          MLB: 'produto.mercadolivre.com.br',
          MLU: 'articulo.mercadolibre.com.uy',
          MCO: 'articulo.mercadolibre.com.co',
          MEC: 'articulo.mercadolibre.com.ec',
          MPE: 'articulo.mercadolibre.com.pe',
        };
        const prefix = listingId.replace(/[^A-Z]/g, '').substring(0, 3);
        const domain = mlDomains[prefix] || 'articulo.mercadolibre.cl';
        return `https://${domain}/${listingId}`;
      }
      if (m === 'amazon') return `https://www.amazon.com/dp/${listingId}`;
      return null;
    };

    // ✅ Función helper para extraer imageUrl del campo images (JSON)
    const extractImageUrl = (imagesString: string | null | undefined): string | null => {
      if (!imagesString) return null;
      try {
        const images = JSON.parse(imagesString);
        if (Array.isArray(images) && images.length > 0 && typeof images[0] === 'string') {
          return images[0];
        }
      } catch {
        // Si no es JSON válido, retornar null
      }
      return null;
    };
    
    // ✅ Mapear datos del backend al formato esperado por el frontend
    const mappedProducts = result.products.map((product) => {
      const validation = getProductValidationSnapshot(product);
      // Calcular profit (precio final - precio AliExpress)
      const calculatedProfit = (toNumber(product.finalPrice) || toNumber(product.suggestedPrice) || 0) - toNumber(product.aliexpressPrice);
      
      // ✅ Extraer imageUrl del campo images (JSON)
      const imageUrl = extractImageUrl(product.images);
      
      const allListings = (product.marketplaceListings || []).map((l: any) => ({
        id: l.id,
        marketplace: (l.marketplace && String(l.marketplace).trim()) ? String(l.marketplace).toUpperCase() : 'N/A',
        listingId: l.listingId,
        listingUrl: l.listingUrl || buildMarketplaceUrl(l.marketplace ?? '', l.listingId) || null,
        publishedAt: l.publishedAt?.toISOString() || null,
      }));
      const mostRecentListing = product.marketplaceListings?.[0] || null;
      const marketplace = (mostRecentListing?.marketplace && String(mostRecentListing.marketplace).trim())
        ? String(mostRecentListing.marketplace).toUpperCase()
        : 'N/A';
      const marketplaceUrl = mostRecentListing?.listingUrl || buildMarketplaceUrl(mostRecentListing?.marketplace ?? '', mostRecentListing?.listingId) || null;
      const marketplaces = Array.from(new Set(allListings.map((l: { marketplace: string }) => l.marketplace).filter((m: string) => m && m !== 'N/A')));
      
      return {
        id: String(product.id),
        title: product.title,
        description: product.description || '',
        status: product.status,
        validationState: validation.validationState,
        blockedReasons: validation.blockedReasons,
        sku: String(product.id),
        marketplace: marketplace,
        marketplaceUrl: marketplaceUrl,
        marketplaces,
        marketplaceListings: allListings,
        aliexpressUrl: product.aliexpressUrl || null,
        price: product.finalPrice || product.suggestedPrice || product.aliexpressPrice || 0,
        currency: product.currency || 'USD',
        resolvedCountry: validation.resolvedCountry,
        resolvedLanguage: validation.resolvedLanguage,
        resolvedCurrency: validation.resolvedCurrency,
        feeCompleteness: validation.feeCompleteness,
        projectedMargin: validation.projectedMargin,
        marketplaceContextSafety: validation.marketplaceContextSafety,
        stock: 0,
        estimatedUnitMargin: calculatedProfit > 0 ? calculatedProfit : 0,
        profit: calculatedProfit > 0 ? calculatedProfit : 0,
        imageUrl: imageUrl || undefined,
        createdAt: product.createdAt?.toISOString() || new Date().toISOString(),
        winnerDetectedAt: product.winnerDetectedAt?.toISOString() ?? null
      };
    });
    
    res.json({ 
      success: true, 
      data: { products: mappedProducts }, 
      count: mappedProducts.length,
      pagination: result.pagination,
      aggregations: result.aggregations,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // ✅ FIX: Si es timeout, devolver 504 Gateway Timeout
    if (error.message?.includes('timeout') || error.message?.includes('Database query timeout')) {
      logger.error('Timeout in /api/products', {
        error: error.message,
        userId: req.user?.userId,
        duration,
      });
      
      return res.status(504).json({
        success: false,
        error: 'Request timeout: Database query took too long',
        errorCode: 'TIMEOUT',
        timestamp: new Date().toISOString(),
      });
    }
    
    // ✅ FIX: Loggear error antes de pasar al error handler (que ya tiene CORS)
    logger.error('Error in /api/products', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
      duration,
    });
    next(error); // El error handler ya tiene CORS headers garantizados
  }
}, { route: '/api/products', serviceName: 'products' }));

// GET /api/products/workflow-status-batch - Estado de workflow para múltiples productos (reduce rate limit)
router.get('/workflow-status-batch', wrapAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
  const idsParam = (req.query.ids as string) || '';
  const ids = idsParam.split(',').map((id) => parseInt(id.trim(), 10)).filter((n) => !isNaN(n) && n > 0).slice(0, 50);
  if (ids.length === 0) return res.json({ success: true, data: {} });
  const data: Record<number, any> = {};
  for (const id of ids) {
    const status = await productWorkflowStatusService.getProductWorkflowStatus(id, userId);
    if (status) data[id] = status;
  }
  return res.json({ success: true, data });
}));

// GET /api/products/post-sale-overview - Estado post-venta por producto/listing (última Order por producto)
router.get('/post-sale-overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const environment = (req.query.environment as string)?.toLowerCase() === 'sandbox' ? 'sandbox' : 'production';

    const listings = await prisma.marketplaceListing.findMany({
      where: {
        status: 'active',
        ...(userId != null ? { userId } : {}),
      },
      select: {
        id: true,
        productId: true,
        marketplace: true,
        listingId: true,
        sku: true,
        product: { select: { id: true, title: true } },
      },
    });

    const productIds = [...new Set(listings.map((l) => l.productId))];
    const orders = await prisma.order.findMany({
      where: {
        productId: { in: productIds },
        paypalOrderId: { not: null },
        OR: [
          { paypalOrderId: { startsWith: 'ebay:' } },
          { paypalOrderId: { startsWith: 'mercadolibre:' } },
          { paypalOrderId: { startsWith: 'amazon:' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        productId: true,
        status: true,
        paypalOrderId: true,
        errorMessage: true,
        updatedAt: true,
      },
    });

    const lastOrderByProduct = new Map<number, typeof orders[0]>();
    for (const o of orders) {
      if (o.productId != null && !lastOrderByProduct.has(o.productId)) {
        lastOrderByProduct.set(o.productId, o);
      }
    }

    function fulfillmentStatus(order: { status?: string; errorMessage?: string | null } | null): string {
      if (!order) return 'unknown';
      const s = (order.status || '').toUpperCase();
      const err = (order.errorMessage || '').trim();
      if (s === 'PURCHASED') return 'completed';
      if (s === 'PAID' || s === 'PURCHASING') return 'pending_purchase';
      if (err.includes('AWAITING_PRODUCT_MAP') || err.includes('no_listing') || err.includes('no_aliexpress_url')) return 'needs_mapping';
      if (s === 'FAILED') return 'failed';
      return 'unknown';
    }

    const byProduct = new Map<number, { productId: number; productTitle: string; listings: Array<{ marketplace: string; listingId: string; sku: string | null }>; lastOrder: { orderId: string; orderStatus: string; marketplaceOrderId: string; fulfillmentAutomationStatus: string; updatedAt: string } | null }>();

    for (const l of listings) {
      if (!l.product) continue;
      const pid = l.product.id;
      if (!byProduct.has(pid)) {
        const lastOrder = lastOrderByProduct.get(pid);
        const pp = (lastOrder?.paypalOrderId || '').trim();
        const prefix = pp.startsWith('ebay:') ? 'ebay:' : pp.startsWith('mercadolibre:') ? 'mercadolibre:' : pp.startsWith('amazon:') ? 'amazon:' : '';
        const marketplaceOrderId = prefix ? pp.slice(prefix.length).replace(/-[\w-]+$/, '') : '';
        byProduct.set(pid, {
          productId: pid,
          productTitle: l.product.title,
          listings: [],
          lastOrder: lastOrder
            ? {
                orderId: lastOrder.id,
                orderStatus: lastOrder.status,
                marketplaceOrderId,
                fulfillmentAutomationStatus: fulfillmentStatus(lastOrder),
                updatedAt: lastOrder.updatedAt.toISOString(),
              }
            : null,
        });
      }
      const rec = byProduct.get(pid)!;
      rec.listings.push({
        marketplace: l.marketplace,
        listingId: l.listingId,
        sku: l.sku,
      });
    }

    const overview = Array.from(byProduct.values());
    res.json({ overview, environment });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/stats - Estadísticas
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const stats = await productService.getProductStats(userId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id/preview - Generate listing preview
router.get('/:id/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.id);
    const marketplace = (req.query.marketplace as string) || 'ebay';
    const environment = req.query.environment as 'sandbox' | 'production' | undefined;

    if (!productId || isNaN(productId)) {
      return res.status(400).json({ success: false, error: 'Invalid product ID' });
    }

    const userId = req.user!.userId;
    const marketplaceService = new MarketplaceService();
    
    const preview = await marketplaceService.generateListingPreview(
      userId,
      productId,
      marketplace as any,
      environment
    );

    if (!preview.success) {
      return res.status(400).json(preview);
    }

    res.json({ success: true, data: preview.preview });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id/publish-preflight — P89 Mercado Libre web preflight (canonical readiness contract)
router.get('/:id/publish-preflight', wrapAsync(async (req: Request, res: Response) => {
  const productId = Number(req.params.id);
  const marketplace = String(req.query.marketplace || 'mercadolibre').toLowerCase();
  const environment = req.query.environment as 'sandbox' | 'production' | undefined;
  const requestedMode =
    String(req.query.requestedMode || req.query.mode || '').toLowerCase() === 'international'
      ? 'international'
      : 'local';
  const publishIntentRaw = String(req.query.publishIntent || '').toLowerCase();
  const publishIntent =
    publishIntentRaw === 'dry_run' || publishIntentRaw === 'pilot' || publishIntentRaw === 'production'
      ? (publishIntentRaw as 'dry_run' | 'pilot' | 'production')
      : 'production';
  const pilotManualAck = String(req.query.pilotManualAck || '').toLowerCase() === 'true';

  if (!productId || Number.isNaN(productId)) {
    return res.status(400).json({ success: false, error: 'Invalid product ID' });
  }
  if (marketplace !== 'mercadolibre') {
    return res.status(400).json({
      success: false,
      error: 'publish-preflight is implemented for marketplace=mercadolibre only',
    });
  }

  const userRole = req.user?.role?.toUpperCase();
  const isAdmin = userRole === 'ADMIN';
  const userId = req.user!.userId;

  const { buildMercadoLibrePublishPreflight } = await import(
    '../../services/mercadolibre-publish-preflight.service'
  );
  const data = await buildMercadoLibrePublishPreflight({
    userId,
    productId,
    isAdmin,
    environment,
    requestedMode,
    publishIntent,
    pilotManualAck,
  });

  res.json({ success: true, data });
}));

// GET /api/products/:id/publish-dry-run — explicit dry run assessment (never publishes)
router.get('/:id/publish-dry-run', wrapAsync(async (req: Request, res: Response) => {
  const productId = Number(req.params.id);
  const environment = req.query.environment as 'sandbox' | 'production' | undefined;
  const requestedMode =
    String(req.query.requestedMode || req.query.mode || '').toLowerCase() === 'international'
      ? 'international'
      : 'local';

  if (!productId || Number.isNaN(productId)) {
    return res.status(400).json({ success: false, error: 'Invalid product ID' });
  }

  const userRole = req.user?.role?.toUpperCase();
  const isAdmin = userRole === 'ADMIN';
  const userId = req.user!.userId;

  const { buildMercadoLibrePublishPreflight } = await import(
    '../../services/mercadolibre-publish-preflight.service'
  );
  const data = await buildMercadoLibrePublishPreflight({
    userId,
    productId,
    isAdmin,
    environment,
    requestedMode,
    publishIntent: 'dry_run',
  });

  res.json({ success: true, dryRun: true, data });
}));

// GET /api/products/:id - Obtener por ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ C2: Validar ownership - pasar userId y isAdmin
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = req.user?.userId;
    
    const product = await productService.getProductById(Number(req.params.id), userId, isAdmin);
    
    // ✅ Función helper para extraer imageUrl del campo images (JSON)
    const extractImageUrl = (imagesString: string | null | undefined): string | null => {
      if (!imagesString) return null;
      try {
        const images = JSON.parse(imagesString);
        if (Array.isArray(images) && images.length > 0 && typeof images[0] === 'string') {
          return images[0];
        }
      } catch {
        // Si no es JSON válido, retornar null
      }
      return null;
    };
    
    // ✅ Mapear producto para incluir imageUrl y winnerDetectedAt en ISO
    const mappedProduct = {
      ...product,
      imageUrl: extractImageUrl(product.images) || undefined, // ✅ Incluir imageUrl extraído
      sku: String(product.id), // SKU temporal basado en ID
      stock: 0, // Valor por defecto
      marketplace: 'N/A',
      estimatedUnitMargin: ((toNumber(product.finalPrice) || toNumber(product.suggestedPrice) || 0) - toNumber(product.aliexpressPrice)) || 0,
      profit: ((toNumber(product.finalPrice) || toNumber(product.suggestedPrice) || 0) - toNumber(product.aliexpressPrice)) || 0,
      winnerDetectedAt: product.winnerDetectedAt?.toISOString() ?? null
    };
    
    res.json({ success: true, data: mappedProduct });
  } catch (error) {
    next(error);
  }
});

// POST /api/products/scrape - Scrape URL AliExpress y crear producto (alineación frontend)
const scrapeProductSchema = z.object({
  aliexpressUrl: z.string().url(),
  margin: z.number().min(0).max(500).optional(),
  category: z.string().max(100).optional(),
});
router.post('/scrape', wrapAsync(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const { aliexpressUrl, margin = 50, category } = scrapeProductSchema.parse(req.body);
  const { scrapingService } = await import('../../services/scraping.service');
  const { pendingProductsLimitService } = await import('../../services/pending-products-limit.service');
  await pendingProductsLimitService.ensurePendingLimitNotExceeded(userId, false);
  const scrapedData = await scrapingService.scrapeAliExpressProduct(aliexpressUrl, userId);
  const suggestedPrice = scrapedData.price * (1 + (margin / 100));
  const dto: CreateProductDto = {
    title: scrapedData.title || 'Producto sin título',
    description: scrapedData.description || '',
    aliexpressUrl,
    aliexpressPrice: scrapedData.price,
    suggestedPrice,
    imageUrl: scrapedData.images?.[0],
    imageUrls: scrapedData.images || [],
    category: category || scrapedData.category,
  };
  const userRole = req.user?.role?.toUpperCase();
  const isAdmin = userRole === 'ADMIN';
  const product = await productService.createProduct(userId, dto, isAdmin);
  const extractImageUrl = (imagesString: string | null | undefined): string | null => {
    if (!imagesString) return null;
    try {
      const images = JSON.parse(imagesString);
      if (Array.isArray(images) && images.length > 0 && typeof images[0] === 'string') return images[0];
    } catch { }
    return null;
  };
  const imageUrl = extractImageUrl(product.images) || product.imageUrl || undefined;
  res.status(201).json({
    success: true,
    data: {
      ...product,
      imageUrl,
      sku: String(product.id),
      originalPrice: product.aliexpressPrice,
      price: product.finalPrice ?? product.suggestedPrice,
      margin: margin ?? 0,
    },
  });
}, { route: '/api/products/scrape', serviceName: 'products' }));

// POST /api/products - Crear producto
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.debug('POST /api/products - Received payload', {
      title: req.body?.title?.substring(0, 50),
      aliexpressUrl: req.body?.aliexpressUrl?.substring(0, 80),
      hasImageUrl: !!req.body?.imageUrl,
      hasProductData: !!req.body?.productData,
      userId: req.user?.userId
    });

    const validatedData = createProductSchema.parse(req.body);
    // Asegurar que los campos requeridos estén presentes después de validación
    if (!validatedData.title || !validatedData.aliexpressUrl || !validatedData.aliexpressPrice || !validatedData.suggestedPrice) {
      logger.warn('POST /api/products - Missing required fields', {
        hasTitle: !!validatedData.title,
        hasAliExpressUrl: !!validatedData.aliexpressUrl,
        hasAliExpressPrice: !!validatedData.aliexpressPrice,
        hasSuggestedPrice: !!validatedData.suggestedPrice
      });
      return res.status(400).json({ 
        success: false, 
        error: 'Campos requeridos faltantes: title, aliexpressUrl, aliexpressPrice, suggestedPrice',
        errorCode: 'VALIDATION_ERROR'
      });
    }
    
    // ✅ LÍMITE DE PRODUCTOS PENDIENTES: Validar antes de crear
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = req.user!.userId;
    let product = await productService.createProduct(userId, validatedData as CreateProductDto, isAdmin);

    let pdRoot: Record<string, any> = {};
    try {
      if (product.productData) pdRoot = JSON.parse(product.productData);
    } catch {
      pdRoot = {};
    }

    const shouldEnrichOpportunityImport =
      validatedData.importSource === 'opportunity_search' ||
      (validatedData.productData as Record<string, any> | undefined)?.opportunityImport?.importSource ===
        'opportunity_search' ||
      Boolean(String(validatedData.aliExpressItemId || '').trim()) ||
      pdRoot.importSource === 'opportunity_search' ||
      pdRoot.opportunityImport?.importSource === 'opportunity_search';

    let opportunityImportEnrichment: {
      ok: boolean;
      reason: string;
      skuResolved?: boolean;
      shippingResolved?: boolean;
    } | null = null;

    if (shouldEnrichOpportunityImport) {
      try {
        const { enrichProductAfterOpportunityImport } = await import(
          '../../services/opportunity-import-enrichment.service'
        );
        opportunityImportEnrichment = await enrichProductAfterOpportunityImport(product.id, userId);
        logger.info('POST /api/products - Opportunity import enrichment', {
          productId: product.id,
          userId,
          ...opportunityImportEnrichment,
        });
      } catch (enrichErr: any) {
        opportunityImportEnrichment = {
          ok: false,
          reason: enrichErr?.message || 'enrichment_exception',
        };
        logger.warn('POST /api/products - Opportunity import enrichment error (product still created)', {
          productId: product.id,
          error: enrichErr?.message || String(enrichErr),
        });
      }
    }

    const opportunityImportFlow = shouldEnrichOpportunityImport;

    // ✅ CRÍTICO: Si analyze está en modo automatic, aprobar automáticamente el producto
    // No degradar a LEGACY_UNVERIFIED: si el import viene de Opportunities y el enriquecimiento
    // no completó contexto máquina, mantener PENDING hasta que SKU/shipping existan.
    if (product && product.status === 'PENDING') {
      try {
        const { workflowConfigService } = await import('../../services/workflow-config.service');
        const analyzeMode = await workflowConfigService.getStageMode(userId, 'analyze');

        if (analyzeMode === 'automatic') {
          const skipAutoApproveBecauseImportIncomplete =
            opportunityImportFlow &&
            opportunityImportEnrichment &&
            !opportunityImportEnrichment.ok;

          if (skipAutoApproveBecauseImportIncomplete) {
            logger.warn('POST /api/products - Skipping auto-approve: opportunity enrichment incomplete (avoid LEGACY)', {
              productId: product.id,
              userId,
              opportunityImportEnrichment,
            });
          } else {
            await productService.updateProductStatusSafely(product.id, 'APPROVED', false);

            logger.info('POST /api/products - Producto aprobado automáticamente', {
              productId: product.id,
              userId,
              analyzeMode,
            });

            product.status = 'APPROVED';
          }
        }
      } catch (approveError: any) {
        logger.error('POST /api/products - Error aprobando producto automáticamente', {
          productId: product.id,
          userId,
          error: approveError?.message || String(approveError),
        });
      }
    }

    const refreshed = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });
    if (refreshed) {
      product = refreshed as typeof product;
    }
    
    // ✅ Función helper para extraer imageUrl del campo images (JSON)
    const extractImageUrl = (imagesString: string | null | undefined): string | null => {
      if (!imagesString) return null;
      try {
        const images = JSON.parse(imagesString);
        if (Array.isArray(images) && images.length > 0 && typeof images[0] === 'string') {
          return images[0];
        }
      } catch {
        // Si no es JSON válido, retornar null
      }
      return null;
    };
    
    // ✅ Extraer imageUrl del campo images y agregarlo al producto retornado
    const imageUrl = extractImageUrl(product.images);
    
    logger.info('POST /api/products - Product created successfully', {
      productId: product.id,
      title: product.title?.substring(0, 50),
      status: product.status,
      userId: req.user?.userId,
      hasImageUrl: !!imageUrl,
      imagesField: product.images?.substring(0, 100) // Log primeros 100 caracteres del campo images
    });
    
    // ✅ ID al final: `...product` puede traer `id` undefined en algunos shapes serializados y pisar el id bueno.
    const numericId = product.id != null ? Number(product.id) : undefined;
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: {
        ...product,
        id: numericId ?? product.id,
        imageUrl: imageUrl || undefined,
        opportunityImportEnrichment: opportunityImportEnrichment ?? undefined,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Validation error in POST /api/products', { 
        errors: error.errors,
        input: {
          title: req.body?.title?.substring(0, 50),
          aliexpressUrl: req.body?.aliexpressUrl?.substring(0, 80),
          aliexpressPrice: req.body?.aliexpressPrice,
          suggestedPrice: req.body?.suggestedPrice
        }
      });
      return res.status(400).json({ 
        error: 'Error de validación',
        message: 'Los datos enviados no son válidos',
        errors: error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      });
    }
    next(error);
  }
});

// PUT /api/products/:id - Actualizar producto
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateProductSchema.parse(req.body);
    const product = await productService.updateProduct(Number(req.params.id), req.user!.userId, data);
    res.json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Validation error in PUT /api/products/:id', { errors: error.errors });
    }
    next(error);
  }
});

// PATCH /api/products/:id/status - Actualizar estado (admin)
router.patch('/:id/status', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!['PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED', 'LEGACY_UNVERIFIED', 'VALIDATED_READY'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Estado inválido',
        errorCode: 'VALIDATION_ERROR'
      });
    }
    const product = await productService.updateProductStatus(Number(req.params.id), status, req.user!.userId);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/products/:id/price - ✅ CORREGIDO: Sincronizar precio con marketplaces
router.patch('/:id/price', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { price, environment } = req.body;
    const productId = Number(req.params.id);
    const userId = req.user!.userId;

    if (!price || typeof price !== 'number' || price <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Price must be a positive number',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    // ✅ CORREGIDO: Importar MarketplaceService correctamente (como named export)
    const marketplaceServiceModule = await import('../../services/marketplace.service');
    // MarketplaceService está exportado tanto como named como default
    const MarketplaceService = marketplaceServiceModule.MarketplaceService || marketplaceServiceModule.default;
    const marketplaceService = new MarketplaceService();
    
    const result = await marketplaceService.syncProductPrice(
      userId,
      productId,
      price,
      environment
    );

    return res.json({
      success: result.success,
      message: `Price synced: ${result.updated} marketplace(s) updated, ${result.errors.length} error(s)`,
      updated: result.updated,
      errors: result.errors
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/products/:id/unpublish - Despublicar producto manualmente (retira listings de marketplaces)
router.post('/:id/unpublish', wrapAsync(async (req: Request, res: Response) => {
  const productId = Number(req.params.id);
  const userId = req.user!.userId;
  const userRole = req.user?.role?.toUpperCase();
  const isAdmin = userRole === 'ADMIN';

  const product = await prisma.product.findFirst({
    where: { id: productId, ...(isAdmin ? {} : { userId }) },
    include: { marketplaceListings: true }
  });
  if (!product) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
  if (product.status !== 'PUBLISHED') {
    return res.status(400).json({ success: false, error: 'Solo se pueden despublicar productos con estado PUBLISHED' });
  }

  const { EbayService } = await import('../../services/ebay.service');
  const { MercadoLibreService } = await import('../../services/mercadolibre.service');
  const { AmazonService } = await import('../../services/amazon.service');
  const { resolveEnvironment } = await import('../../utils/environment-resolver');

  const marketplaceService = new MarketplaceService();
  const results: { marketplace: string; success: boolean; error?: string }[] = [];
  const env = await resolveEnvironment({ userId: product.userId, default: 'production' });

  for (const listing of product.marketplaceListings || []) {
    const mp = listing.marketplace?.toLowerCase();
    try {
      const creds = await marketplaceService.getCredentials(product.userId, mp as 'ebay' | 'amazon' | 'mercadolibre', env);
      const c = creds?.credentials as any;
      if (!creds || !c || creds.issues?.length) { results.push({ marketplace: mp, success: false, error: 'Sin credenciales' }); continue; }

      if (mp === 'ebay') {
        const ebay = new EbayService({ ...c, sandbox: env === 'sandbox' });
        const ebayIdentifier = listing.sku || `IVAN-${productId}`;
        await ebay.endListing(ebayIdentifier, 'NotAvailable');
      } else if (mp === 'mercadolibre') {
        const ml = new MercadoLibreService(c);
        await ml.closeListing(listing.listingId);
      } else if (mp === 'amazon') {
        const amazon = new AmazonService();
        await amazon.setCredentials(c);
        const sku = listing.sku || listing.listingId;
        if (sku) await amazon.deleteListing(sku);
      }
      results.push({ marketplace: mp, success: true });
    } catch (e: any) {
      logger.warn('[unpublish] Error despublicando en marketplace', { productId, marketplace: mp, error: e?.message });
      results.push({ marketplace: mp, success: false, error: e?.message });
    }
  }

  // Sync DB with reality: remove MarketplaceListing rows for successfully closed listings
  const listings = product.marketplaceListings || [];
  const successfulListingIds: number[] = [];
  results.forEach((r, i) => {
    if (r.success && listings[i]?.id) successfulListingIds.push(listings[i].id);
  });
  if (successfulListingIds.length > 0) {
    await prisma.marketplaceListing.deleteMany({
      where: { id: { in: successfulListingIds } },
    });
    logger.info('[unpublish] MarketplaceListing rows removed to reflect reality', {
      productId,
      deletedCount: successfulListingIds.length,
      listingIds: successfulListingIds,
    });
  }

  // If product has no remaining listings, set to APPROVED and isPublished false
  const remainingCount = await prisma.marketplaceListing.count({
    where: { productId },
  });
  if (remainingCount === 0) {
    await productService.updateProductStatusSafely(productId, 'APPROVED', false, userId);
  }

  const failed = results.filter((r) => !r.success);
  const allSucceeded = failed.length === 0;

  return res.status(allSucceeded ? 200 : 409).json({
    success: allSucceeded,
    message: allSucceeded
      ? 'Producto despublicado. Listados eliminados de la base de datos. Estado actualizado a APPROVED.'
      : `Despublicación parcial: ${results.filter((r) => r.success).length} OK, ${failed.length} fallidos. Listados cerrados eliminados de la BD.${remainingCount === 0 ? ' Producto actualizado a APPROVED.' : ''}`,
    marketplaceResults: results
  });
}));

// DELETE /api/products/:id - Eliminar producto
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const result = await productService.deleteProduct(Number(req.params.id), req.user!.userId, isAdmin);
    res.json({ success: true, message: 'Product deleted successfully', data: result });
  } catch (error) {
    next(error);
  }
});

// ✅ P3: GET /api/products/maintenance/inconsistencies - Detectar inconsistencias de estado (Admin only)
router.get('/maintenance/inconsistencies', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inconsistencies = await productService.detectInconsistencies();
    res.json({
      success: true,
      count: inconsistencies.length,
      inconsistencies
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/maintenance/cleanup-candidates - Productos viejos nunca publicados (Admin only)
router.get('/maintenance/cleanup-candidates', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const olderThanDays = req.query.olderThanDays ? Number(req.query.olderThanDays) : 30;
    const candidates = await productService.getCleanupCandidates({ olderThanDays });
    res.json({
      success: true,
      count: candidates.length,
      candidates: candidates.map((p) => ({
        id: p.id,
        userId: p.userId,
        title: p.title,
        status: p.status,
        createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/products/maintenance/cleanup - Borrar productos viejos nunca publicados (Admin only)
router.post('/maintenance/cleanup', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body || {}) as { olderThanDays?: number; dryRun?: boolean };
    const olderThanDays = body.olderThanDays ?? 30;
    const dryRun = body.dryRun !== false;
    const result = await productService.cleanupUnpublishedProducts({ olderThanDays, dryRun });
    res.json({
      success: true,
      deleted: result.deleted,
      dryRun: result.dryRun,
      message: result.dryRun
        ? `${result.deleted} product(s) would be deleted. Send dryRun: false to execute.`
        : `${result.deleted} product(s) deleted.`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id/workflow-status - Obtener estado del workflow de un producto
router.get('/:id/workflow-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const productId = Number(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ success: false, error: 'Invalid product ID' });
    }

    const workflowStatus = await productWorkflowStatusService.getProductWorkflowStatus(productId, userId);

    if (!workflowStatus) {
      return res.status(200).json({ success: true, data: { status: 'NOT_STARTED' } });
    }

    res.json({ success: true, data: workflowStatus });
  } catch (error) {
    next(error);
  }
});

// POST /api/products/approve-pending - Aprobar productos PENDING para desbloquear etapa ANALYZE
router.post('/approve-pending', wrapAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
  const pending = await prisma.product.findMany({
    where: { userId, status: 'PENDING' },
    take: 100,
    orderBy: { createdAt: 'desc' }
  });
  let approved = 0;
  let rejected = 0;
  for (const p of pending) {
    try {
      const cost = toNumber(p.aliexpressPrice || 0);
      const suggested = toNumber((p as any).suggestedPrice || 0);
      const price = suggested > 0 ? suggested : cost * 2;
      const margin = cost > 0 && price > cost ? ((price - cost) / price) * 100 : 0;
      const status = margin >= 5 ? 'APPROVED' : 'REJECTED';
      const reason = margin >= 5
        ? 'Aprobación manual por endpoint (margen válido)'
        : `Rechazo por margen insuficiente (${margin.toFixed(1)}%)`;
      await productService.updateProductStatusSafely(p.id, status, userId, reason);
      if (status === 'APPROVED') approved++; else rejected++;
    } catch (e: any) {
      logger.warn('[approve-pending] Error procesando producto', { productId: p.id, error: e?.message });
    }
  }
  return res.json({
    success: true,
    message: `Procesados ${pending.length} productos: ${approved} aprobados, ${rejected} rechazados`,
    approved,
    rejected,
    total: pending.length
  });
}));

// ✅ P3: POST /api/products/maintenance/fix-inconsistencies - Corregir inconsistencias de estado (Admin only)
router.post('/maintenance/fix-inconsistencies', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await productService.fixInconsistencies();
    res.json({
      success: true,
      message: `Inconsistencies fixed: ${result.fixed} products corrected, ${result.errors} errors`,
      fixed: result.fixed,
      errors: result.errors
    });
  } catch (error) {
    next(error);
  }
});

export default router;
