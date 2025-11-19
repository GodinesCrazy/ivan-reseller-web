import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { productService, CreateProductDto } from '../../services/product.service';
import { z } from 'zod';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

// Validación para crear producto
const createProductSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().optional().nullable(),
  aliexpressUrl: z.string().url(),
  aliexpressPrice: z.number().positive(),
  suggestedPrice: z.number().positive(),
  finalPrice: z.number().positive().optional().nullable(),
  currency: z.string().optional().nullable(),
  imageUrl: z.union([z.string().url(), z.string().startsWith('//'), z.string().startsWith('/')]).optional().nullable(),
  imageUrls: z.array(z.union([z.string().url(), z.string().startsWith('//'), z.string().startsWith('/')])).optional().nullable(),
  category: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  shippingCost: z.number().optional().nullable(),
  estimatedDeliveryDays: z.number().optional().nullable(),
  productData: z.record(z.any()).optional().nullable(),
}).refine((data) => {
  // ✅ Validar imageUrl si está presente (puede ser URL completa, relativa, o protocolo relativo)
  if (data.imageUrl && typeof data.imageUrl === 'string') {
    const url = data.imageUrl.trim();
    // Aceptar URLs completas, protocolo relativo (//), o rutas relativas (/)
    return url.startsWith('http://') || url.startsWith('https://') || 
           url.startsWith('//') || url.startsWith('/') || 
           !url.includes(' ') && url.length > 3;
  }
  return true;
}, {
  message: 'imageUrl debe ser una URL válida o una ruta relativa válida',
  path: ['imageUrl']
});

const updateProductSchema = createProductSchema.partial();

// GET /api/products - Listar productos
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const status = req.query.status as string | undefined;
    const products = await productService.getProducts(userId, status);
    
    // ✅ Mapear datos del backend al formato esperado por el frontend
    const mappedProducts = products.map((product) => {
      // Calcular profit (precio final - precio AliExpress)
      const calculatedProfit = (product.finalPrice || product.suggestedPrice || 0) - product.aliexpressPrice;
      
      return {
        id: String(product.id),
        title: product.title,
        description: product.description || '',
        status: product.status,
        marketplace: 'unknown', // Productos no tienen marketplace directamente, se obtiene de listings
        price: product.finalPrice || product.suggestedPrice || product.aliexpressPrice || 0,
        profit: calculatedProfit > 0 ? calculatedProfit : 0,
        createdAt: product.createdAt?.toISOString() || new Date().toISOString()
      };
    });
    
    res.json({ products: mappedProducts });
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
    res.json(stats);
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
    res.json(product);
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
      return res.status(400).json({ error: 'Campos requeridos faltantes: title, aliexpressUrl, aliexpressPrice, suggestedPrice' });
    }
    
    const product = await productService.createProduct(req.user!.userId, validatedData as CreateProductDto);
    
    logger.info('POST /api/products - Product created successfully', {
      productId: product.id,
      title: product.title?.substring(0, 50),
      status: product.status,
      userId: req.user?.userId
    });
    
    res.status(201).json(product);
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
    res.json(product);
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
      return res.status(400).json({ error: 'Estado inválido' });
    }
    const product = await productService.updateProductStatus(Number(req.params.id), status, req.user!.userId);
    res.json(product);
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
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
