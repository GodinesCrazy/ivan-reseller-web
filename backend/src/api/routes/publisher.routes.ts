import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { productService, CreateProductDto } from '../../services/product.service';
import { MarketplaceService } from '../../services/marketplace.service';
import { AdvancedScrapingService } from '../../services/scraping.service';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { toNumber } from '../../utils/decimal.utils';

const router = Router();
router.use(authenticate);

// POST /api/publisher/send_for_approval/:productId
// ✅ OBJETIVO: Enviar un producto existente a Intelligent Publisher (asegurar status PENDING)
router.post('/send_for_approval/:productId', async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);
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
      // ✅ Scrapear producto desde AliExpress
      const scrapingService = new AdvancedScrapingService();
      const scrapedData = await scrapingService.scrapeAliExpressProduct(String(aliexpressUrl), userId);

      // Crear producto desde datos scrapeados
      const productData: CreateProductDto = {
        title: scrapedData.title || customData.title || 'Producto sin título',
        description: scrapedData.description || customData.description || '',
        aliexpressUrl: String(aliexpressUrl),
        aliexpressPrice: scrapedData.price || customData.aliexpressPrice || 0,
        suggestedPrice: customData.suggestedPrice || (scrapedData.price ? scrapedData.price * 2 : 0),
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
    const items = await productService.getProducts(isAdmin ? undefined : userId, 'PENDING');
    // ✅ FIX: items puede ser { products: [], pagination: {} }
    const products = (items as any).products || (Array.isArray(items) ? items : []);
    
    logger.info('[PUBLISHER] Found pending products', {
      userId,
      isAdmin,
      count: products.length,
      productIds: products.slice(0, 5).map((i: any) => i.id)
    });
    
    // ✅ Helper para extraer imageUrl del campo images (JSON string)
    const extractImageUrl = (images: string | null | undefined): string | null => {
      if (!images) return null;
      try {
        const parsed = typeof images === 'string' ? JSON.parse(images) : images;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return String(parsed[0]);
        }
        if (typeof parsed === 'string') {
          return parsed;
        }
      } catch (error) {
        logger.warn('[PUBLISHER] Failed to parse images field', { error });
      }
      return null;
    };

    // ✅ Enriquecer con información adicional
    const enrichedItems = await Promise.all(
      products.map(async (item) => {
        try {
          const productData = item.productData ? JSON.parse(item.productData as string) : {};
          const imageUrl = extractImageUrl(item.images) || null;
          return {
            ...item,
            imageUrl: imageUrl || undefined, // ✅ Incluir imageUrl extraído
            source: (productData as any).source || 'manual',
            queuedAt: (productData as any).queuedAt || item.createdAt,
            queuedBy: (productData as any).queuedBy || 'user',
            estimatedCost: (productData as any).estimatedCost || item.aliexpressPrice,
            estimatedProfit: (productData as any).estimatedProfit || (toNumber(item.suggestedPrice) - toNumber(item.aliexpressPrice)),
            estimatedROI: (productData as any).estimatedROI || 
              ((toNumber(item.suggestedPrice) - toNumber(item.aliexpressPrice)) / toNumber(item.aliexpressPrice) * 100)
          };
        } catch (parseError) {
          logger.warn('[PUBLISHER] Failed to parse productData', {
            productId: item.id,
            error: parseError instanceof Error ? parseError.message : String(parseError)
          });
          // Incluso si falla el parse, incluir imageUrl
          const imageUrl = extractImageUrl(item.images) || null;
          return {
            ...item,
            imageUrl: imageUrl || undefined
          };
        }
      })
    );
    
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
    const listings = await prisma.marketplaceListing.findMany({
      where: { userId: req.user!.userId },
      orderBy: { publishedAt: 'desc' },
    });
    return res.json({ success: true, items: listings, count: listings.length });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to list listings';
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
    const userEnvironment = environment || await workflowConfigService.getUserEnvironment(product.userId);
    
    // ✅ P0.4: Validar credenciales antes de publicar
    if (Array.isArray(marketplaces) && marketplaces.length > 0) {
      const service = new MarketplaceService();
      const missingCredentials: string[] = [];
      const invalidCredentials: string[] = [];
      
      // Verificar credenciales para cada marketplace
      for (const marketplace of marketplaces) {
        try {
          const credentials = await service.getCredentials(
            product.userId, 
            marketplace as 'ebay' | 'amazon' | 'mercadolibre', 
            userEnvironment
          );
          
          if (!credentials || !credentials.isActive) {
            missingCredentials.push(marketplace);
            continue;
          }
          
          // Validar conexión si las credenciales existen
          const testResult = await service.testConnection(
            product.userId,
            marketplace as 'ebay' | 'amazon' | 'mercadolibre',
            userEnvironment
          );
          
          if (!testResult.success) {
            invalidCredentials.push(marketplace);
          }
        } catch (error) {
          logger.warn(`[PUBLISHER] Error validating credentials for ${marketplace}`, {
            userId: product.userId,
            marketplace,
            error: error instanceof Error ? error.message : String(error)
          });
          missingCredentials.push(marketplace);
        }
      }
      
      // Si faltan credenciales, retornar error descriptivo
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
      
      // Si las credenciales son inválidas, retornar error descriptivo
      if (invalidCredentials.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid credentials',
          message: `Your ${invalidCredentials.join(', ')} credentials are invalid or expired. Please update them in Settings.`,
          invalidCredentials,
          action: 'update_credentials',
          settingsUrl: '/settings?tab=api-credentials'
        });
      }
    }
    
    await productService.updateProductStatus(id, 'APPROVED', req.user!.userId);

    let publishResults: Array<{ success: boolean; marketplace?: string; error?: string }> = [];
    if (Array.isArray(marketplaces) && marketplaces.length > 0) {
      const service = new MarketplaceService();
      // ✅ Usar ambiente del usuario al publicar
      publishResults = await service.publishToMultipleMarketplaces(
        product.userId, 
        product.id, 
        marketplaces,
        userEnvironment
      );

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
              publishedEnvironment: userEnvironment,
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
              publishedEnvironment: userEnvironment,
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
              publishedEnvironment: userEnvironment,
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
      environment: userEnvironment,
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
