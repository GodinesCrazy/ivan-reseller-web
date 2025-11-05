import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { advancedReportsService } from '../../services/advanced-reports.service';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ✅ GET /api/advanced-reports/trends - Análisis de tendencias temporales
router.get('/trends', async (req: Request, res: Response, next) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const metric = (req.query.metric as 'sales' | 'revenue' | 'profit' | 'users') || 'sales';
    const format = (req.query.format as 'json' | 'csv' | 'excel') || 'json';

    // Verificar permisos
    if (userId && req.user!.role !== 'ADMIN' && req.user!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const trends = await advancedReportsService.analyzeTrends(userId, startDate, endDate, metric);

    if (format !== 'json') {
      const exported = await advancedReportsService.exportAdvancedReport('trends', trends, format);
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="trends_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(exported);
      } else if (format === 'excel') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="trends_${new Date().toISOString().split('T')[0]}.xlsx"`);
        return res.send(exported);
      }
    }

    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/advanced-reports/compare-periods - Comparar períodos
router.get('/compare-periods', async (req: Request, res: Response, next) => {
  try {
    const schema = z.object({
      currentStart: z.string().datetime(),
      currentEnd: z.string().datetime(),
      previousStart: z.string().datetime(),
      previousEnd: z.string().datetime(),
      userId: z.number().optional(),
      format: z.enum(['json', 'csv', 'excel']).optional()
    });

    const params = schema.parse({
      currentStart: req.query.currentStart,
      currentEnd: req.query.currentEnd,
      previousStart: req.query.previousStart,
      previousEnd: req.query.previousEnd,
      userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
      format: req.query.format || 'json'
    });

    // Verificar permisos
    if (params.userId && req.user!.role !== 'ADMIN' && req.user!.userId !== params.userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const comparison = await advancedReportsService.comparePeriods(
      new Date(params.currentStart),
      new Date(params.currentEnd),
      new Date(params.previousStart),
      new Date(params.previousEnd),
      params.userId
    );

    const format = params.format || 'json';

    if (format !== 'json') {
      const exported = await advancedReportsService.exportAdvancedReport('comparison', comparison, format);
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="comparison_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(exported);
      } else if (format === 'excel') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="comparison_${new Date().toISOString().split('T')[0]}.xlsx"`);
        return res.send(exported);
      }
    }

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/advanced-reports/forecast - Análisis predictivo
router.get('/forecast', async (req: Request, res: Response, next) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const forecastDays = req.query.forecastDays ? parseInt(req.query.forecastDays as string) : 30;
    const format = (req.query.format as 'json' | 'csv' | 'excel') || 'json';

    // Verificar permisos
    if (userId && req.user!.role !== 'ADMIN' && req.user!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const forecast = await advancedReportsService.predictiveAnalysis(userId, forecastDays);

    if (format !== 'json') {
      const exported = await advancedReportsService.exportAdvancedReport('forecast', forecast, format);
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="forecast_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(exported);
      } else if (format === 'excel') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="forecast_${new Date().toISOString().split('T')[0]}.xlsx"`);
        return res.send(exported);
      }
    }

    res.json({
      success: true,
      data: forecast
    });
  } catch (error) {
    next(error);
  }
});

export default router;

