import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import scraperBridge from '../../services/scraper-bridge.service';
import { automatedBusinessSystem } from '../../services/automated-business.service';
import { secureCredentialManager } from '../../services/security.service';
import { apiAvailability } from '../../services/api-availability.service';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';

const router = Router();

router.get('/health/detailed', async (_req: Request, res: Response) => {
  const checks: any = { db: false, scraper: false, time: new Date().toISOString() };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch (e) {
    checks.db_error = String((e as any)?.message || e);
  }
  try {
    const h = await scraperBridge.health().catch(() => null);
    checks.scraper = !!(h && (h.status === 'ok' || h.status === 'healthy'));
    if (!checks.scraper) checks.scraper_details = h;
  } catch (e) {
    checks.scraper_error = String((e as any)?.message || e);
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
  } catch (error) {
    throw new AppError('Failed to check API status', 500);
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
  } catch (error) {
    throw new AppError('Failed to get system capabilities', 500);
  }
});

/**
 * POST /api/system/refresh-api-cache
 * Clear API availability cache (force re-check)
 */
router.post('/refresh-api-cache', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { api } = req.body;
    if (api) {
      await apiAvailability.clearAPICache(userId, api);
      res.json({ success: true, message: `Cache cleared for ${api}` });
    } else {
      await apiAvailability.clearUserCache(userId);
      res.json({ success: true, message: 'All API caches cleared for user' });
    }
  } catch (error) {
    throw new AppError('Failed to clear cache', 500);
  }
});

export default router;

