import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { listingLifetimeService, ListingLifetimeConfig } from '../../services/listing-lifetime.service';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

/**
 * GET /api/listing-lifetime/config
 * Obtener configuración del optimizador de tiempo de publicación
 */
router.get('/config', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const config = await listingLifetimeService.getConfig();
    res.json({
      success: true,
      data: Array.isArray(config) ? config[0] : config // ✅ FIX: getConfig puede retornar array o objeto
    });
  } catch (error: any) {
    logger.error('Error getting listing lifetime config', {
      error: error?.message || String(error),
      userId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener configuración del optimizador',
      error: error?.message
    });
  }
});

/**
 * POST /api/listing-lifetime/config
 * Actualizar configuración del optimizador de tiempo de publicación
 */
router.post('/config', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const config = Array.isArray(req.body) ? req.body[0] : req.body as Partial<ListingLifetimeConfig>; // ✅ FIX: puede venir como array
    
    // Validar campos
    if (config.mode && !['automatic', 'manual'].includes(config.mode)) {
      return res.status(400).json({
        success: false,
        message: 'El modo debe ser "automatic" o "manual"'
      });
    }

    if (config.minLearningDays !== undefined && (config.minLearningDays < 1 || config.minLearningDays > 30)) {
      return res.status(400).json({
        success: false,
        message: 'Los días mínimos de aprendizaje deben estar entre 1 y 30'
      });
    }

    if (config.maxLifetimeDaysDefault !== undefined && (config.maxLifetimeDaysDefault < 7 || config.maxLifetimeDaysDefault > 365)) {
      return res.status(400).json({
        success: false,
        message: 'El tiempo máximo de publicación debe estar entre 7 y 365 días'
      });
    }

    if (config.minRoiPercent !== undefined && (config.minRoiPercent < 0 || config.minRoiPercent > 1000)) {
      return res.status(400).json({
        success: false,
        message: 'El ROI mínimo debe estar entre 0 y 1000%'
      });
    }

    if (config.minDailyProfitUsd !== undefined && config.minDailyProfitUsd < 0) {
      return res.status(400).json({
        success: false,
        message: 'La ganancia diaria mínima debe ser mayor o igual a 0'
      });
    }

    await listingLifetimeService.setConfig(config);

    res.json({
      success: true,
      message: 'Configuración del optimizador actualizada correctamente',
      data: await listingLifetimeService.getConfig()
    });
  } catch (error: any) {
    logger.error('Error setting listing lifetime config', {
      error: error?.message || String(error),
      userId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      message: 'Error al actualizar configuración del optimizador',
      error: error?.message
    });
  }
});

/**
 * GET /api/listing-lifetime/product/:productId
 * Obtener decisión de lifetime para un producto específico
 */
router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    // Verificar que el producto existe y pertenece al usuario (o es admin)
    const { prisma } = await import('../../config/database');
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

    const decisions = await listingLifetimeService.getProductDecision(userId, productId);

    res.json({
      success: true,
      data: {
        productId,
        decisions
      }
    });
  } catch (error: any) {
    logger.error('Error getting product lifetime decision', {
      error: error?.message || String(error),
      productId: req.params.productId,
      userId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener decisión de lifetime del producto',
      error: error?.message
    });
  }
});

/**
 * GET /api/listing-lifetime/listing/:listingId
 * Obtener decisión de lifetime para un listing específico
 */
router.get('/listing/:listingId', async (req: Request, res: Response) => {
  try {
    const listingId = Number(req.params.listingId);
    const userId = req.user!.userId;
    const marketplace = req.query.marketplace as string;

    if (!marketplace) {
      return res.status(400).json({
        success: false,
        error: 'El parámetro "marketplace" es requerido'
      });
    }

    // Verificar que el listing existe y pertenece al usuario
    const { prisma } = await import('../../config/database');
    const listing = await prisma.marketplaceListing.findFirst({
      where: {
        id: listingId,
        userId,
        marketplace
      }
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: 'Listing no encontrado o no tienes permiso para acceder a él'
      });
    }

    const metrics = await listingLifetimeService.calculateMetrics(userId, listingId, marketplace);
    const decision = await listingLifetimeService.evaluateListing(userId, listingId, marketplace);

    res.json({
      success: true,
      data: {
        listingId,
        marketplace,
        metrics,
        decision
      }
    });
  } catch (error: any) {
    logger.error('Error getting listing lifetime decision', {
      error: error?.message || String(error),
      listingId: req.params.listingId,
      userId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener decisión de lifetime del listing',
      error: error?.message
    });
  }
});

/**
 * GET /api/listing-lifetime/evaluate-all
 * Evaluar todos los listings del usuario actual
 */
router.get('/evaluate-all', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const results = await listingLifetimeService.evaluateAllUserListings(userId);

    res.json({
      success: true,
      data: {
        totalListings: results.length,
        listings: results
      }
    });
  } catch (error: any) {
    logger.error('Error evaluating all listings', {
      error: error?.message || String(error),
      userId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      message: 'Error al evaluar listings',
      error: error?.message
    });
  }
});

export default router;

