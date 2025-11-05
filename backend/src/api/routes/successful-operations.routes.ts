import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { successfulOperationService } from '../../services/successful-operation.service';
import { prisma } from '../../config/database';

const router = Router();

// Require authentication for all endpoints
router.use(authenticate);

// ✅ GET /api/operations/success-stats - Estadísticas de operaciones exitosas del usuario
router.get('/success-stats', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const stats = await successfulOperationService.getUserSuccessStats(userId);
    res.json({ success: true, stats });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/operations/learning-patterns - Patrones de aprendizaje de operaciones exitosas
router.get('/learning-patterns', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    // userId es opcional - si no se proporciona, retorna patrones globales
    const patterns = await successfulOperationService.getLearningPatterns(userId);
    res.json({ success: true, patterns });
  } catch (error) {
    next(error);
  }
});

// ✅ POST /api/operations/mark-successful - Marcar una venta como operación exitosa
router.post('/mark-successful', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { saleId, startDate, completionDate, totalProfit, expectedProfit, hadReturns, hadIssues, issuesDescription, customerSatisfaction } = req.body;

    if (!saleId || !startDate || !completionDate || !totalProfit || !expectedProfit) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Obtener información de la venta
    const sale = await prisma.sale.findUnique({
      where: { id: parseInt(saleId) },
      include: { product: true }
    });

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    if (sale.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const operation = await successfulOperationService.markAsSuccessful({
      userId,
      productId: sale.productId,
      saleId: parseInt(saleId),
      startDate: new Date(startDate),
      completionDate: new Date(completionDate),
      totalProfit: parseFloat(totalProfit),
      expectedProfit: parseFloat(expectedProfit),
      hadReturns: hadReturns || false,
      hadIssues: hadIssues || false,
      issuesDescription,
      customerSatisfaction: customerSatisfaction ? parseInt(customerSatisfaction) : undefined
    });

    res.json({ success: true, operation });
  } catch (error) {
    next(error);
  }
});

export default router;

