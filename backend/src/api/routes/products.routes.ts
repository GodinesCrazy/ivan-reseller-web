// @ts-nocheck
import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { productService } from '../../services/product.service';
import { z } from 'zod';
// ProductStatus no existe como enum, usar string

const router = Router();
router.use(authenticate);

// Validación para crear producto
const createProductSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().optional(),
  aliexpressUrl: z.string().url(),
  aliexpressPrice: z.number().positive(),
  suggestedPrice: z.number().positive(),
  currency: z.string().default('USD'),
  imageUrl: z.string().url().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  shippingCost: z.number().optional(),
  estimatedDeliveryDays: z.number().optional(),
});

const updateProductSchema = createProductSchema.partial();

// GET /api/products - Listar productos
router.get('/', async (req: Request, res: Response, next) => {
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const status = req.query.status as string | undefined;
    const products = await productService.getProducts(userId, status);
    
    // ✅ Mapear datos del backend al formato esperado por el frontend
    const mappedProducts = products.map((product: any) => ({
      id: String(product.id),
      title: product.title,
      description: product.description || '',
      status: product.status,
      marketplace: product.marketplace || product.publishedMarketplace || 'unknown',
      price: product.suggestedPrice || product.price || product.aliexpressPrice || 0,
      profit: product.profit || 0,
      createdAt: product.createdAt?.toISOString() || new Date().toISOString()
    }));
    
    res.json({ products: mappedProducts });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/stats - Estadísticas
router.get('/stats', async (req: Request, res: Response, next) => {
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
router.get('/:id', async (req: Request, res: Response, next) => {
  try {
    const product = await productService.getProductById(Number(req.params.id));
    res.json(product);
  } catch (error) {
    next(error);
  }
});

// POST /api/products - Crear producto
router.post('/', async (req: Request, res: Response, next) => {
  try {
    const data = createProductSchema.parse(req.body);
    const product = await productService.createProduct(req.user!.userId, data);
    res.status(201).json(product);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    next(error);
  }
});

// PUT /api/products/:id - Actualizar producto
router.put('/:id', async (req: Request, res: Response, next) => {
  try {
    const data = updateProductSchema.parse(req.body);
    const product = await productService.updateProduct(Number(req.params.id), req.user!.userId, data);
    res.json(product);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    next(error);
  }
});

// PATCH /api/products/:id/status - Actualizar estado (admin)
router.patch('/:id/status', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const { status } = req.body;
    if (!['PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    const product = await productService.updateProductStatus(req.params.id, status, req.user!.userId);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/products/:id - Eliminar producto
router.delete('/:id', async (req: Request, res: Response, next) => {
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
