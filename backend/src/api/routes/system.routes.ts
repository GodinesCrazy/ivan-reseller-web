import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import scraperBridge from '../../services/scraper-bridge.service';
import { automatedBusinessSystem } from '../../services/automated-business.service';
import { secureCredentialManager } from '../../services/security.service';
import { apiAvailability } from '../../services/api-availability.service';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { z } from 'zod';
import { logger } from '../../config/logger';
import { ApiHealthService } from '../../services/api-health.service';
import { errorTracker } from '../../utils/error-tracker';

const router = Router();

// ✅ A7: Validation schema para refresh-api-cache
const refreshApiCacheSchema = z.object({
  api: z.string().optional(),
});

router.get('/health/detailed', async (_req: Request, res: Response) => {
  const checks: any = { db: false, scraper: false, time: new Date().toISOString() };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch (e: any) {
    // ✅ A8: Mejor manejo de errores
    checks.db_error = String(e?.message || e);
    logger.error('Database health check failed', { error: e?.message });
  }
  try {
    const h = await scraperBridge.health().catch(() => null);
    checks.scraper = !!(h && (h.status === 'ok' || h.status === 'healthy'));
    if (!checks.scraper) checks.scraper_details = h;
  } catch (e: any) {
    // ✅ A8: Mejor manejo de errores
    checks.scraper_error = String(e?.message || e);
    logger.error('Scraper health check failed', { error: e?.message });
  }
  const cfg = automatedBusinessSystem.getConfig();
  res.json({ success: true, data: { checks, mode: cfg.mode, environment: cfg.environment, uptime: process.uptime() } });
});

router.get('/features', (_req: Request, res: Response) => {
  const creds = secureCredentialManager.listCredentials();
  const features = {
    scraping: true,
    competitorAnalysis: true,
    autopilot: true,
    publisher: true,
    sseLogs: true,
    proxies: true,
    captcha: true,
    ebayOAuth: !!creds.find(c => c.marketplace === 'ebay' && c.isActive),
    mlOAuth: !!creds.find(c => c.marketplace === 'mercadolibre' && c.isActive),
    amazonSPAPI: true,
  };
  res.json({ success: true, data: features });
});

router.get('/operation-mode', (_req: Request, res: Response) => {
  const cfg = automatedBusinessSystem.getConfig();
  res.json({ success: true, data: { mode: cfg.mode, environment: cfg.environment } });
});

/**
 * GET /api/system/api-status
 * Get status of all configured APIs
 */
router.get('/api-status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const statuses = await apiAvailability.getAllAPIStatus(userId);
    const capabilities = await apiAvailability.getCapabilities(userId);

    res.json({
      success: true,
      data: {
        apis: statuses,
        capabilities,
        summary: {
          total: statuses.length,
          configured: statuses.filter(s => s.isConfigured).length,
          available: statuses.filter(s => s.isAvailable).length,
          missing: statuses.filter(s => !s.isConfigured).length
        }
      }
    });
  } catch (error: any) {
    // ✅ A8: Mejor manejo de errores con logger
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    logger.error('Error in /api/system/api-status', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to check API status'
    });
  }
});

/**
 * GET /api/system/capabilities
 * Get system capabilities based on configured APIs
 */
router.get('/capabilities', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const capabilities = await apiAvailability.getCapabilities(userId);
    res.json({ success: true, data: capabilities });
  } catch (error: any) {
    // ✅ A8: Mejor manejo de errores con logger
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    logger.error('Error in /api/system/capabilities', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get system capabilities'
    });
  }
});

/**
 * POST /api/system/refresh-api-cache
 * Clear API availability cache (force re-check)
 */
router.post('/refresh-api-cache', authenticate, async (req: Request, res: Response) => {
  try {
    // ✅ A7: Validar request body
    const body = refreshApiCacheSchema.parse(req.body);
    
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    if (body.api) {
      await apiAvailability.clearAPICache(userId, body.api);
      res.json({ success: true, message: `Cache cleared for ${body.api}` });
    } else {
      await apiAvailability.clearUserCache(userId);
      res.json({ success: true, message: 'All API caches cleared for user' });
    }
  } catch (error: any) {
    // ✅ A8: Mejor manejo de errores con logger y middleware centralizado
    logger.error('Error in /api/system/refresh-api-cache', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    // ✅ CORRECCIÓN: next no está definido, usar res.status directamente
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to refresh API cache'
    });
  }
});

/**
 * POST /api/system/test-apis
 * Test all configured APIs and return detailed results
 */
router.post('/test-apis', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    logger.info('[API Health] Starting API tests', { userId });
    
    const summary = await ApiHealthService.runAllApiTests(userId);
    
    logger.info('[API Health] API tests completed', {
      userId,
      ok: summary.ok,
      error: summary.error,
      skip: summary.skip,
    });
    
    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    logger.error('Error in /api/system/test-apis', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to test APIs'
    });
  }
});

/**
 * GET /api/system/error-stats
 * Get error tracking statistics (admin only)
 */
router.get('/error-stats', authenticate, async (req: Request, res: Response) => {
  try {
    // Solo admins pueden ver estadísticas de errores
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    const stats = errorTracker.getErrorStats();
    
    res.json({
      success: true,
      data: {
        errorCounts: stats,
        totalUniqueErrors: Object.keys(stats).length,
      }
    });
  } catch (error: any) {
    logger.error('Error in /api/system/error-stats', {
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get error stats'
    });
  }
});

export default router;

