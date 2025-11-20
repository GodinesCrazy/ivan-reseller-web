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
  shippingCost: z.number().optional(),
  estimatedDeliveryDays: z.number().optional(),
  productData: z.record(z.any()).optional(),
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
    const mappedProducts = products.map((product) => {
      // Calcular profit (precio final - precio AliExpress)
      const calculatedProfit = (product.finalPrice || product.suggestedPrice || 0) - product.aliexpressPrice;
      
      // ✅ Extraer imageUrl del campo images (JSON)
      const imageUrl = extractImageUrl(product.images);
      
      return {
        id: String(product.id),
        title: product.title,
        description: product.description || '',
        status: product.status,
        sku: String(product.id), // SKU temporal basado en ID
        marketplace: 'unknown', // Productos no tienen marketplace directamente, se obtiene de listings
        price: product.finalPrice || product.suggestedPrice || product.aliexpressPrice || 0,
        stock: 0, // Valor por defecto
        profit: calculatedProfit > 0 ? calculatedProfit : 0,
        imageUrl: imageUrl || undefined, // ✅ Incluir imageUrl extraído
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
      profit: ((product.finalPrice || product.suggestedPrice || 0) - product.aliexpressPrice) || 0
    };
    
    res.json(mappedProduct);
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
    
    // ✅ Retornar producto con imageUrl extraído
    res.status(201).json({
      ...product,
      imageUrl: imageUrl || undefined
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
