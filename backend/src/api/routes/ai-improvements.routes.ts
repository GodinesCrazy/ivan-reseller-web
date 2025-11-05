import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { aiImprovementsService } from '../../services/ai-improvements.service';

const router = Router();
router.use(authenticate);

// ✅ GET /api/ai-improvements/successful-products - Analizar productos exitosos
router.get('/successful-products', async (req: Request, res: Response, next) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const category = req.query.category as string | undefined;

    // Verificar permisos
    if (userId && req.user!.role !== 'ADMIN' && req.user!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const analysis = await aiImprovementsService.analyzeSuccessfulProducts(userId, category);
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/ai-improvements/recommendations/:userId - Recomendaciones personalizadas
router.get('/recommendations/:userId', async (req: Request, res: Response, next) => {
  try {
    const userId = parseInt(req.params.userId);

    // Verificar permisos
    if (req.user!.role !== 'ADMIN' && req.user!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const recommendations = await aiImprovementsService.getPersonalizedRecommendations(userId);
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/ai-improvements/optimize-pricing/:productId - Optimizar precio de producto
router.get('/optimize-pricing/:productId', async (req: Request, res: Response, next) => {
  try {
    const productId = parseInt(req.params.productId);

    // Verificar que el usuario tiene acceso al producto
    const product = await require('../../config/database').prisma.product.findUnique({
      where: { id: productId },
      select: { userId: true }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    if (req.user!.role !== 'ADMIN' && req.user!.userId !== product.userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const optimization = await aiImprovementsService.optimizePricing(productId);
    res.json({
      success: true,
      data: optimization
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/ai-improvements/predict-demand/:productId - Predecir demanda
router.get('/predict-demand/:productId', async (req: Request, res: Response, next) => {
  try {
    const productId = parseInt(req.params.productId);

    // Verificar que el usuario tiene acceso al producto
    const product = await require('../../config/database').prisma.product.findUnique({
      where: { id: productId },
      select: { userId: true }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    if (req.user!.role !== 'ADMIN' && req.user!.userId !== product.userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const prediction = await aiImprovementsService.predictDemand(productId);
    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    next(error);
  }
});

export default router;

