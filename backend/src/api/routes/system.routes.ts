/**
 * System routes - diagnostics, health, features
 * GET /api/system/diagnostics - Production readiness diagnostics (no auth)
 * GET /api/system/status - User status panel (auth required)
 */

import { Router, Request, Response } from 'express';
import logger from '../../config/logger';
import { authenticate } from '../../middleware/auth.middleware';
import { apiAvailability } from '../../services/api-availability.service';

const router = Router();

/**
 * GET /api/system/status
 * User status panel: PayPal, eBay, Mercado Libre, Amazon, AliExpress, Autopilot, Profit Guard.
 * Requires authentication. Returns format expected by SystemStatus.tsx.
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const statuses = await apiAvailability.getAllAPIStatus(userId);

    const findAvailable = (apiName: string) =>
      statuses.find((s) => s.apiName === apiName && s.isAvailable) ?? null;

    const findStatus = (apiName: string) =>
      statuses.find((s) => s.apiName === apiName) ?? null;

    const paypalConnected = Boolean(findAvailable('paypal'));
    const ebayConnected = Boolean(findAvailable('ebay'));
    const mercadolibreConnected = Boolean(findAvailable('mercadolibre'));
    const amazonConnected = Boolean(findAvailable('amazon'));
    const aliexpressOAuth =
      Boolean(findAvailable('aliexpress-dropshipping')) || Boolean(findAvailable('aliexpress'));

    let autopilotEnabled = false;
    try {
      const { prisma } = await import('../../config/database');
      const configRec = await prisma.systemConfig.findUnique({ where: { key: 'autopilot_config' } });
      if (configRec?.value) {
        const parsed = JSON.parse(configRec.value as string) as { enabled?: boolean };
        autopilotEnabled = parsed.enabled === true;
      }
    } catch {
      // non-fatal
    }

    const profitGuardEnabled = true; // Built-in service, always active

    const ebayStatus = findStatus('ebay');
    const mlStatus = findStatus('mercadolibre');
    const amazonStatus = findStatus('amazon');

    const details: Record<string, { message?: string; error?: string }> = {};
    if (ebayStatus && !ebayStatus.isAvailable) {
      details.ebay = { message: ebayStatus.message, error: ebayStatus.error };
    }
    if (mlStatus && !mlStatus.isAvailable) {
      details.mercadolibre = { message: mlStatus.message, error: mlStatus.error };
    }
    if (amazonStatus && !amazonStatus.isAvailable) {
      details.amazon = { message: amazonStatus.message, error: amazonStatus.error };
    }

    return res.status(200).json({
      success: true,
      data: {
        paypalConnected,
        ebayConnected,
        mercadolibreConnected,
        amazonConnected,
        aliexpressOAuth,
        autopilotEnabled,
        profitGuardEnabled,
        details: Object.keys(details).length > 0 ? details : undefined,
      },
    });
  } catch (err: any) {
    logger.error('[SYSTEM/STATUS] Error', { error: err?.message });
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to load system status',
    });
  }
});

/**
 * GET /api/system/diagnostics
 * Real-time production readiness diagnostics.
 * Returns OK/FAIL for each critical subsystem.
 */
router.get('/diagnostics', async (_req: Request, res: Response) => {
  const diagnostics: Record<string, string | boolean | number | null> = {
    autopilot: 'FAIL',
    ebayOAuth: 'FAIL',
    aliexpressOAuth: 'FAIL',
    paypal: 'FAIL',
    payoneer: 'FAIL',
    payoneerCertificate: 'MISSING',
    database: 'FAIL',
    scheduler: 'inactive',
    lastCycle: null,
    productsPublished: 0,
    production_ready: false,
  };

  try {
    // Database
    try {
      const { prisma } = await import('../../config/database');
      await prisma.$queryRaw`SELECT 1`;
      diagnostics.database = 'OK';
    } catch (dbErr: any) {
      logger.warn('[SYSTEM/DIAGNOSTICS] Database check failed', { error: dbErr?.message });
      diagnostics.database = 'FAIL';
    }

    // Autopilot - check config and API prerequisites
    const hasScraping =
      Boolean((process.env.SCRAPER_API_KEY || process.env.SCRAPERAPI_KEY || process.env.ZENROWS_API_KEY || '').trim());
    const hasEbay =
      Boolean((process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID || '').trim()) &&
      Boolean((process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID || '').trim());
    diagnostics.autopilot = hasScraping && hasEbay ? 'OK' : 'FAIL';
    diagnostics.ebayOAuth = hasEbay ? 'OK' : 'FAIL';

    // AliExpress - Affiliate API + OAuth (Dropshipping)
    const hasAliexpress =
      Boolean((process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim()) &&
      Boolean((process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim());
    diagnostics.aliexpressOAuth = hasAliexpress ? 'OK' : 'FAIL';

    // PayPal
    const hasPaypal =
      Boolean((process.env.PAYPAL_CLIENT_ID || '').trim()) &&
      Boolean((process.env.PAYPAL_CLIENT_SECRET || '').trim());
    diagnostics.paypal = hasPaypal ? 'OK' : 'FAIL';

    // Payoneer - requires PAYONEER_PROGRAM_ID, PAYONEER_API_USERNAME, PAYONEER_API_PASSWORD
    const PayoneerService = (await import('../../services/payoneer.service')).PayoneerService;
    diagnostics.payoneer = PayoneerService.isConfigured() ? 'OK' : 'FAIL';
    // Payoneer certificate - auto-generated if missing (Node crypto)
    PayoneerService.ensureCertificate();
    diagnostics.payoneerCertificate = PayoneerService.hasCertificate() ? 'OK' : 'MISSING';

    // Scheduler, lastCycle, productsPublished from autopilot stats
    if (diagnostics.database === 'OK') {
      try {
        const { prisma } = await import('../../config/database');
        const statsRec = await prisma.systemConfig.findUnique({ where: { key: 'autopilot_stats' } });
        if (statsRec?.value) {
          const stats = JSON.parse(statsRec.value as string);
          diagnostics.scheduler = stats.currentStatus === 'running' ? 'active' : 'inactive';
          diagnostics.lastCycle = stats.lastRunTimestamp || null;
          diagnostics.productsPublished = typeof stats.totalProductsPublished === 'number' ? stats.totalProductsPublished : 0;
        }
      } catch {
        // non-fatal
      }
    }

    // Production ready = all critical OK
    const allOk =
      diagnostics.autopilot === 'OK' &&
      diagnostics.ebayOAuth === 'OK' &&
      diagnostics.aliexpressOAuth === 'OK' &&
      diagnostics.paypal === 'OK' &&
      diagnostics.database === 'OK';

    diagnostics.production_ready = allOk;

    res.status(200).json(diagnostics);
  } catch (err: any) {
    logger.error('[SYSTEM/DIAGNOSTICS] Error', { error: err?.message });
    res.status(500).json({
      ...diagnostics,
      error: err?.message || 'Diagnostics failed',
    });
  }
});

/**
 * GET /api/system/full-diagnostics
 * Full system diagnostics including certificate status
 */
router.get('/full-diagnostics', async (_req: Request, res: Response) => {
  const diagnostics: Record<string, string | number | null> = {
    system: 'FAIL',
    database: 'FAIL',
    autopilot: 'FAIL',
    aliexpress: 'FAIL',
    ebayOAuth: 'FAIL',
    payoneer: 'FAIL',
    certificate: 'FAIL',
    scheduler: 'FAIL',
    lastCycle: null,
    productsInDatabase: 0,
    productsPublished: 0,
  };

  try {
    const { prisma } = await import('../../config/database');

    // Database
    try {
      await prisma.$queryRaw`SELECT 1`;
      diagnostics.database = 'OK';
    } catch {
      diagnostics.database = 'FAIL';
    }

    // Autopilot prerequisites
    const hasScraping = Boolean(
      (process.env.SCRAPER_API_KEY || process.env.SCRAPERAPI_KEY || process.env.ZENROWS_API_KEY || '').trim()
    );
    const hasEbay =
      Boolean((process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID || '').trim()) &&
      Boolean((process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID || '').trim());
    diagnostics.autopilot = hasScraping && hasEbay ? 'OK' : 'FAIL';

    // AliExpress
    const hasAliexpress =
      Boolean((process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim()) &&
      Boolean((process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim());
    diagnostics.aliexpress = hasAliexpress ? 'OK' : 'FAIL';

    // eBay OAuth
    diagnostics.ebayOAuth = hasEbay ? 'OK' : 'FAIL';

    // Payoneer
    const PayoneerService = (await import('../../services/payoneer.service')).PayoneerService;
    diagnostics.payoneer = PayoneerService.isConfigured() ? 'OK' : 'FAIL';

    // Certificate (Payoneer client cert) - auto-generated if missing
    PayoneerService.ensureCertificate();
    diagnostics.certificate = PayoneerService.hasCertificate() ? 'OK' : 'FAIL';

    // Scheduler, lastCycle, products
    if (diagnostics.database === 'OK') {
      try {
        const statsRec = await prisma.systemConfig.findUnique({ where: { key: 'autopilot_stats' } });
        if (statsRec?.value) {
          const stats = JSON.parse(statsRec.value as string);
          diagnostics.scheduler = stats.currentStatus === 'running' ? 'OK' : 'FAIL';
          diagnostics.lastCycle = stats.lastRunTimestamp || null;
          diagnostics.productsPublished =
            typeof stats.totalProductsPublished === 'number' ? stats.totalProductsPublished : 0;
        }
        const count = await prisma.product.count();
        diagnostics.productsInDatabase = count;
      } catch {
        // non-fatal
      }
    }

    // Overall system
    const criticalOk =
      diagnostics.database === 'OK' &&
      diagnostics.autopilot === 'OK' &&
      diagnostics.aliexpress === 'OK' &&
      diagnostics.ebayOAuth === 'OK';
    diagnostics.system = criticalOk ? 'OK' : 'FAIL';

    res.status(200).json(diagnostics);
  } catch (err: any) {
    logger.error('[SYSTEM/FULL-DIAGNOSTICS] Error', { error: err?.message });
    res.status(500).json({
      ...diagnostics,
      error: err?.message || 'Diagnostics failed',
    });
  }
});

/**
 * GET /api/system/business-diagnostics
 * Business-level diagnostics: autopilot, marketplace, supplier, payment, database, scheduler, listings, sales.
 * Each section has status (OK/FAIL) and optional message or counts.
 * Requires authentication. Sales and Listings counts are per-user and filtered by environment.
 */
router.get('/business-diagnostics', authenticate, async (req: Request, res: Response) => {
  const result: Record<string, { status: string; message?: string; count?: number }> = {
    autopilot: { status: 'FAIL' },
    marketplace: { status: 'FAIL' },
    supplier: { status: 'FAIL' },
    payment: { status: 'FAIL' },
    database: { status: 'FAIL' },
    scheduler: { status: 'FAIL' },
    listings: { status: 'FAIL' },
    sales: { status: 'FAIL' },
  };

  try {
    const { prisma } = await import('../../config/database');

    // Database
    try {
      await prisma.$queryRaw`SELECT 1`;
      result.database = { status: 'OK' };
    } catch {
      result.database = { status: 'FAIL', message: 'Connection failed' };
    }

    // Autopilot - prerequisites (scraping + eBay)
    const hasScraping = Boolean(
      (process.env.SCRAPER_API_KEY || process.env.SCRAPERAPI_KEY || process.env.ZENROWS_API_KEY || '').trim()
    );
    const hasEbay =
      Boolean((process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID || '').trim()) &&
      Boolean((process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID || '').trim());
    result.autopilot = hasScraping && hasEbay ? { status: 'OK' } : { status: 'FAIL', message: 'Scraping or eBay not configured' };

    // Marketplace - eBay as primary
    result.marketplace = hasEbay ? { status: 'OK' } : { status: 'FAIL', message: 'eBay not configured' };

    // Supplier - AliExpress
    const hasAliexpress =
      Boolean((process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim()) &&
      Boolean((process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim());
    result.supplier = hasAliexpress ? { status: 'OK' } : { status: 'FAIL', message: 'AliExpress not configured' };

    // Payment - PayPal + optional Payoneer
    const hasPaypal =
      Boolean((process.env.PAYPAL_CLIENT_ID || '').trim()) &&
      Boolean((process.env.PAYPAL_CLIENT_SECRET || '').trim());
    const PayoneerService = (await import('../../services/payoneer.service')).PayoneerService;
    const hasPayoneer = PayoneerService.isConfigured();
    result.payment = hasPaypal
      ? { status: 'OK', message: hasPayoneer ? 'PayPal + Payoneer' : 'PayPal' }
      : { status: 'FAIL', message: 'PayPal not configured' };

    // Scheduler - from autopilot stats
    if (result.database.status === 'OK') {
      try {
        const statsRec = await prisma.systemConfig.findUnique({ where: { key: 'autopilot_stats' } });
        if (statsRec?.value) {
          const stats = JSON.parse(statsRec.value as string);
          result.scheduler =
            stats.currentStatus === 'running'
              ? { status: 'OK', message: 'Autopilot running' }
              : { status: 'OK', message: 'idle' };
        } else {
          result.scheduler = { status: 'OK', message: 'idle' };
        }
      } catch {
        result.scheduler = { status: 'FAIL', message: 'Could not read stats' };
      }

      // Listings count (per-user)
      const userId = req.user!.userId;
      const environment = (req.query.environment as string)?.toLowerCase() === 'sandbox' ? 'sandbox' as const : 'production' as const;
      try {
        const listingsCount = await prisma.marketplaceListing.count({ where: { userId } });
        result.listings = { status: 'OK', count: listingsCount };
      } catch {
        result.listings = { status: 'FAIL', message: 'Count failed' };
      }

      // Sales count (per-user, per-environment, COMPLETED only - real sales)
      try {
        const saleService = (await import('../../services/sale.service')).saleService;
        const stats = await saleService.getSalesStats(userId, undefined, environment);
        result.sales = { status: 'OK', count: stats.totalSales };
      } catch {
        result.sales = { status: 'FAIL', message: 'Count failed' };
      }
    }

    res.status(200).json(result);
  } catch (err: any) {
    logger.error('[SYSTEM/BUSINESS-DIAGNOSTICS] Error', { error: err?.message });
    res.status(500).json({
      ...result,
      error: err?.message || 'Business diagnostics failed',
    });
  }
});

export default router;
