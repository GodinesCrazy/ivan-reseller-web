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
import { performanceTracker } from '../../utils/performance-tracker';

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

/**
 * GET /api/system/status - RC1 system status panel
 * Returns: PayPal connected, eBay connected, AliExpress OAuth, Autopilot enabled, Profit Guard enabled
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }
    const creds = secureCredentialManager.listCredentials();
    const paypalConfigured = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
    const ebayConnected = !!creds.find(c => c.marketplace === 'ebay' && c.isActive);
    const aliexpressOAuth = !!(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET);
    const autopilotEnabled = true; // Autopilot module always available
    const profitGuardEnabled = true; // Profit guard always active
    res.json({
      success: true,
      data: {
        paypalConnected: paypalConfigured,
        ebayConnected,
        aliexpressOAuth,
        autopilotEnabled,
        profitGuardEnabled,
      },
    });
  } catch (error: any) {
    logger.error('Error in /api/system/status', { error: error?.message });
    res.status(500).json({ success: false, error: 'Failed to get system status' });
  }
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

/**
 * GET /api/system/diagnostics - Global production diagnostics (no mocks)
 */
router.get('/diagnostics', async (_req: Request, res: Response) => {
  const diag: Record<string, any> = {
    database: 'FAIL',
    aliexpressOAuth: 'FAIL',
    aliexpressToken: 'FAIL',
    affiliateAPI: 'FAIL',
    autopilot: 'FAIL',
    productsInDB: 0,
    opportunitiesInDB: 0,
    paypal: 'FAIL',
    ebay: 'FAIL',
    lastAutopilotRun: null,
    timestamp: new Date().toISOString(),
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    diag.database = 'OK';
  } catch {
    // keep FAIL
  }
  try {
    const appKey = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const appSecret = (process.env.ALIEXPRESS_APP_SECRET || '').trim();
    const redirectUri = (process.env.ALIEXPRESS_REDIRECT_URI || '').trim();
    diag.aliexpressOAuth = appKey && appSecret && redirectUri ? 'OK' : 'FAIL';
  } catch {
    // keep FAIL
  }
  try {
    const token = await prisma.aliExpressToken.findUnique({ where: { id: 'global' } });
    const hasValid = token?.accessToken && token?.expiresAt && token.expiresAt > new Date();
    diag.aliexpressToken = hasValid ? 'OK' : (token?.accessToken ? 'EXPIRED' : 'FAIL');
  } catch {
    // keep FAIL
  }
  try {
    const { aliexpressAffiliateAPIService } = await import('../../services/aliexpress-affiliate-api.service');
    const result = await aliexpressAffiliateAPIService.searchProducts({
      keywords: 'phone case',
      pageNo: 1,
      pageSize: 2,
      shipToCountry: 'US',
    });
    diag.affiliateAPI = result?.products?.length > 0 ? 'OK' : (result ? 'EMPTY' : 'FAIL');
  } catch (e: any) {
    diag.affiliateAPI = 'FAIL';
    diag.affiliateAPIError = String(e?.message || e).substring(0, 100);
  }
  try {
    const { autopilotSystem } = await import('../../services/autopilot.service');
    const status = autopilotSystem.getStatus();
    diag.autopilot = status?.stats?.currentStatus === 'running' ? 'OK' : (status ? 'IDLE' : 'FAIL');
    diag.lastAutopilotRun = status?.lastCycle?.timestamp?.toISOString() || null;
  } catch {
    // keep FAIL
  }
  try {
    diag.productsInDB = await prisma.product.count();
  } catch {
    // keep 0
  }
  try {
    diag.opportunitiesInDB = await prisma.opportunity.count();
  } catch {
    // keep 0
  }
  try {
    const hasPaypal = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
    diag.paypal = hasPaypal ? 'OK' : 'FAIL';
  } catch {
    // keep FAIL
  }
  try {
    const hasEbay = !!(process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID) &&
      !!(process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID);
    diag.ebay = hasEbay ? 'OK' : 'FAIL';
  } catch {
    // keep FAIL
  }
  res.json({ success: true, data: diag });
});

/**
 * GET /api/system/test-full-cycle - Execute real cycle: OAuth validation, Affiliate search, persistence
 */
router.get('/test-full-cycle', async (_req: Request, res: Response) => {
  let productsFound = 0;
  let productsSaved = 0;
  try {
    const { aliexpressAffiliateAPIService } = await import('../../services/aliexpress-affiliate-api.service');
    const { CredentialsManager } = await import('../../services/credentials-manager.service');
    const token = await CredentialsManager.getAliExpressAccessToken(1);
    const tokenValid = !!token;
    const result = await aliexpressAffiliateAPIService.searchProducts({
      keywords: 'phone case',
      pageNo: 1,
      pageSize: 10,
      shipToCountry: 'US',
    });
    const products = result?.products ?? [];
    productsFound = products.length;
    if (products.length > 0) {
      const { ProductService } = await import('../../services/product.service');
      const productService = new ProductService();
      const firstUser = await prisma.user.findFirst({ where: { isActive: true } });
      const userId = firstUser?.id ?? 1;
      for (const p of products.slice(0, 3)) {
        try {
          const url = p.promotionLink || p.productDetailUrl || `https://www.aliexpress.com/item/${p.productId}.html`;
          const price = parseFloat(String(p.salePrice || p.targetSalePrice || 0)) || 0;
          await productService.createProduct(userId, {
            title: (p.productTitle || 'Product').substring(0, 255),
            aliexpressUrl: url,
            aliexpressPrice: price,
            suggestedPrice: price * 1.5,
            imageUrl: p.productMainImageUrl || undefined,
            imageUrls: p.productSmallImageUrls?.length ? p.productSmallImageUrls : undefined,
          });
          productsSaved++;
        } catch {
          // skip on error
        }
      }
    }
    const success = productsFound > 0;
    res.json({
      success: true,
      productsFound,
      productsSaved,
      tokenValid,
    });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: String(e?.message || e),
      productsFound,
      productsSaved,
    });
  }
});

/**
 * GET /api/system/performance-stats
 * Get performance statistics (admin only)
 */
router.get('/performance-stats', authenticate, async (req: Request, res: Response) => {
  try {
    // Solo admins pueden ver estadísticas de performance
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    const operation = req.query.operation as string | undefined;
    const stats = performanceTracker.getStats(operation);
    
    res.json({
      success: true,
      data: {
        stats,
        ...(operation && { operation }),
      }
    });
  } catch (error: any) {
    logger.error('Error in /api/system/performance-stats', {
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get performance stats'
    });
  }
});

export default router;

