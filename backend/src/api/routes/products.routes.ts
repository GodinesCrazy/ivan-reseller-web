import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { productService, CreateProductDto } from '../../services/product.service';
import { z } from 'zod';
import { logger } from '../../config/logger';
import { toNumber } from '../../utils/decimal.utils';
import { MarketplaceService } from '../../services/marketplace.service';
import { productWorkflowStatusService } from '../../services/product-workflow-status.service';
import { queryWithTimeout } from '../../utils/queryWithTimeout';
import { handleSetupCheck } from '../../utils/setup-check';

const router = Router();
router.use(authenticate);

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
});

const updateProductSchema = createProductSchema.partial();

// ✅ PRODUCTION READY: Validación de query parameters para paginación
const getProductsQuerySchema = z.object({
  status: z.string().optional(),
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1).pipe(z.number().int().min(1).max(1000)),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50).pipe(z.number().int().min(1).max(100)),
});

// GET /api/products - Listar productos
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
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
    const status = validatedQuery.status;
    
    // ✅ PRODUCTION READY: Usar paginación con timeout de 25 segundos
    const timeoutMs = 25000;
    const queryPromise = productService.getProducts(userId, status, {
      page: validatedQuery.page,
      limit: validatedQuery.limit,
    });
    
    const result = await queryWithTimeout(queryPromise, timeoutMs);
    
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
      // Calcular profit (precio final - precio AliExpress)
      const calculatedProfit = (toNumber(product.finalPrice) || toNumber(product.suggestedPrice) || 0) - toNumber(product.aliexpressPrice);
      
      // ✅ Extraer imageUrl del campo images (JSON)
      const imageUrl = extractImageUrl(product.images);
      
      // ✅ Obtener información del marketplace más reciente (si está publicado)
      const mostRecentListing = product.marketplaceListings?.[0] || null;
      const marketplace = mostRecentListing?.marketplace?.toUpperCase() || 'unknown';
      const marketplaceUrl = mostRecentListing?.listingUrl || null;
      
      return {
        id: String(product.id),
        title: product.title,
        description: product.description || '',
        status: product.status,
        sku: String(product.id), // SKU temporal basado en ID
        marketplace: marketplace, // ✅ Marketplace del listing más reciente
        marketplaceUrl: marketplaceUrl, // ✅ URL del listing en el marketplace (para botón "View on Marketplace")
        price: product.finalPrice || product.suggestedPrice || product.aliexpressPrice || 0,
        currency: product.currency || 'USD', // ✅ Incluir moneda del producto
        stock: 0, // Valor por defecto
        profit: calculatedProfit > 0 ? calculatedProfit : 0,
        imageUrl: imageUrl || undefined, // ✅ Incluir imageUrl extraído
        createdAt: product.createdAt?.toISOString() || new Date().toISOString()
      };
    });
    
    res.json({ 
      success: true, 
      data: { products: mappedProducts }, 
      count: mappedProducts.length,
      pagination: result.pagination, // ✅ PRODUCTION READY: Incluir metadata de paginación
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
    
    // ✅ Mapear producto para incluir imageUrl
    const mappedProduct = {
      ...product,
      imageUrl: extractImageUrl(product.images) || undefined, // ✅ Incluir imageUrl extraído
      sku: String(product.id), // SKU temporal basado en ID
      stock: 0, // Valor por defecto
      marketplace: 'unknown',
      profit: ((toNumber(product.finalPrice) || toNumber(product.suggestedPrice) || 0) - toNumber(product.aliexpressPrice)) || 0
    };
    
    res.json({ success: true, data: mappedProduct });
  } catch (error) {
    next(error);
  }
});

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
    const product = await productService.createProduct(userId, validatedData as CreateProductDto, isAdmin);
    
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
            'Products API: Aprobación automática (analyze en modo automatic)'
          );
          
          logger.info('POST /api/products - Producto aprobado automáticamente', {
            productId: product.id,
            userId,
            analyzeMode
          });
          
          // Actualizar el objeto product para devolver el estado correcto
          product.status = 'APPROVED';
        }
      } catch (approveError: any) {
        logger.error('POST /api/products - Error aprobando producto automáticamente', {
          productId: product.id,
          userId,
          error: approveError?.message || String(approveError)
        });
        // No fallar el flujo si la aprobación automática falla
      }
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
    
    // ✅ Retornar producto con imageUrl extraído y asegurar que el ID esté presente
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: {
        id: product.id, // ✅ Asegurar que el ID esté explícitamente presente
        ...product,
        imageUrl: imageUrl || undefined
      }
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
    if (!['PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED'].includes(status)) {
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
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found or access denied' 
      });
    }

    res.json({ success: true, data: workflowStatus });
  } catch (error) {
    next(error);
  }
});

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
