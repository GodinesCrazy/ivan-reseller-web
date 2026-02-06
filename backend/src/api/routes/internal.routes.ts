import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../config/logger';
import { runEbayRealCycle } from '../../scripts/run-ebay-real-cycle';
import opportunityFinder from '../../services/opportunity-finder.service';
import { runTestFullDropshippingCycle } from '../handlers/test-full-dropshipping-cycle.handler';

const router = Router();

const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;

if (!INTERNAL_SECRET) {
  logger.warn('[INTERNAL] INTERNAL_RUN_SECRET no configurado - endpoint deshabilitado');
}

function validateInternalSecret(req: Request, res: Response, next: NextFunction): void {
  if (!INTERNAL_SECRET) {
    res.status(503).json({
      success: false,
      error: 'INTERNAL_RUN_SECRET not configured',
      message: 'INTERNAL_RUN_SECRET not configured',
    });
    return;
  }

  const providedSecret = req.headers['x-internal-secret'];
  if (!providedSecret || providedSecret !== INTERNAL_SECRET) {
    logger.warn('[INTERNAL] Intento de acceso no autorizado', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      hasSecret: !!providedSecret,
    });
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Secret invalido o faltante',
    });
    return;
  }

  next();
}

// ? Health check del endpoint (sin autenticaci�n para verificar que existe)
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Internal routes endpoint is active',
    hasSecret: !!INTERNAL_SECRET,
    routes: [
      'POST /api/internal/run-ebay-cycle',
      'POST /api/internal/test-post-sale-flow',
      'POST /api/internal/test-opportunity-cycle',
      'POST /api/internal/test-full-cycle',
      'POST /api/internal/test-full-dropshipping-cycle',
    ],
  });
});

// ? Ruta siempre registrada, validaci�n de secret en middleware
router.post('/run-ebay-cycle', validateInternalSecret, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || `internal-${Date.now()}`;

  logger.info('[INTERNAL] POST /api/internal/run-ebay-cycle - Ejecutando ciclo real de eBay', {
    correlationId,
    ip: req.ip,
    path: req.path,
    method: req.method,
  });

  try {
    const result = await runEbayRealCycle();

    const duration = Date.now() - startTime;

    logger.info('[INTERNAL] Ciclo completado', {
      correlationId,
      success: result.success,
      duration: `${duration}ms`,
      listingId: result.data?.listingId,
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
        duration: `${duration}ms`,
        correlationId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Unknown error',
        message: result.message,
        duration: `${duration}ms`,
        correlationId,
      });
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error('[INTERNAL] Error ejecutando ciclo', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error ejecutando ciclo real de eBay',
      duration: `${duration}ms`,
      correlationId,
    });
  }
});

// POST /api/internal/test-opportunity-cycle - Smoke test for full dropshipping pipeline (real data only)
router.post('/test-opportunity-cycle', validateInternalSecret, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const keyword = (req.body?.keyword as string) || 'phone case';

  logger.info('[INTERNAL] POST /api/internal/test-opportunity-cycle', { keyword });

  try {
    const opportunities = await opportunityFinder.findOpportunities(1, {
      query: keyword,
      maxItems: 5,
      skipTrendsValidation: true,
    });

    const duration = Date.now() - startTime;
    const sampleOpportunity = opportunities.length > 0 ? opportunities[0] : null;

    const response = {
      success: opportunities.length > 0,
      discovered: opportunities.length,
      normalized: opportunities.length,
      valid: opportunities.length,
      sampleOpportunity: sampleOpportunity
        ? {
            title: sampleOpportunity.title,
            price: sampleOpportunity.costUsd ?? sampleOpportunity.suggestedPriceUsd,
            images: sampleOpportunity.images ?? (sampleOpportunity.image ? [sampleOpportunity.image] : []),
            profitabilityScore: sampleOpportunity.roiPercentage ?? (sampleOpportunity.profitMargin ?? 0) * 100,
            roiPercentage: sampleOpportunity.roiPercentage,
            profitMargin: sampleOpportunity.profitMargin,
          }
        : null,
      duration: `${duration}ms`,
    };

    logger.info('[INTERNAL] test-opportunity-cycle completed', {
      success: response.success,
      count: opportunities.length,
      duration,
    });

    res.status(200).json(response);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('[INTERNAL] test-opportunity-cycle failed', {
      error: error?.message || String(error),
      duration,
    });
    res.status(500).json({
      success: false,
      discovered: 0,
      normalized: 0,
      valid: 0,
      sampleOpportunity: null,
      error: error?.message || 'Unknown error',
      duration: `${duration}ms`,
    });
  }
});

// POST /api/internal/test-post-sale-flow - End-to-end post-sale dropshipping test
router.post('/test-post-sale-flow', validateInternalSecret, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body = req.body || {};
  const productUrl = (body.productUrl as string) || 'https://www.aliexpress.com/item/example.html';
  const price = parseFloat(body.price as string) || 10.99;
  const customer = body.customer as Record<string, string> || {};
  const name = customer.name || 'John Doe';
  const email = customer.email || 'john@test.com';
  const address = customer.address || '123 Main St, Miami, FL, US';

  logger.info('[INTERNAL] POST /api/internal/test-post-sale-flow', { productUrl, price });

  try {
    const { prisma } = await import('../../config/database');
    const { PayPalCheckoutService } = await import('../../services/paypal-checkout.service');
    const { orderFulfillmentService } = await import('../../services/order-fulfillment.service');

    const paypal = PayPalCheckoutService.fromEnv();
    let paypalOrderId: string | null = null;

    const autopilotMode = (process.env.AUTOPILOT_MODE || 'sandbox') as 'production' | 'sandbox';
    if (autopilotMode === 'production') {
      if (!paypal) {
        throw new Error('AUTOPILOT_MODE=production: simulated PayPal forbidden. Configure PayPal credentials.');
      }
    }

    if (paypal) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const createResult = await paypal.createOrder({
        amount: price,
        currency: 'USD',
        productTitle: 'Test Order',
        productUrl,
        returnUrl: `${baseUrl}/api/paypal/success`,
        cancelUrl: `${baseUrl}/api/paypal/cancel`,
      });
      if (createResult.success && createResult.orderId) {
        paypalOrderId = createResult.orderId;
        const captureResult = await paypal.captureOrder(createResult.orderId);
        if (!captureResult.success) {
          if (autopilotMode === 'production') {
            throw new Error(`AUTOPILOT_MODE=production: simulated PayPal forbidden. Capture failed: ${captureResult.error}`);
          }
          logger.warn('[INTERNAL] PayPal capture failed (using simulated for test)', { error: captureResult.error });
          paypalOrderId = `SIMULATED_${createResult.orderId}`;
        }
      } else {
        if (autopilotMode === 'production') {
          throw new Error('AUTOPILOT_MODE=production: simulated PayPal forbidden. Create order failed.');
        }
        paypalOrderId = 'SIMULATED_PAYPAL_ORDER';
      }
    } else {
      if (autopilotMode === 'production') {
        throw new Error('AUTOPILOT_MODE=production: simulated PayPal forbidden. PayPal not configured.');
      }
      paypalOrderId = 'SIMULATED_PAYPAL_ORDER';
    }

    const shippingAddress = JSON.stringify({
      fullName: name,
      addressLine1: address.split(',')[0]?.trim() || address,
      city: address.split(',')[1]?.trim() || 'Miami',
      state: address.split(',')[2]?.trim() || 'FL',
      country: address.split(',')[3]?.trim() || 'US',
      zipCode: '33101',
      phoneNumber: '+15551234567',
    });

    const order = await prisma.order.create({
      data: {
        title: 'Test Order',
        price,
        currency: 'USD',
        customerName: name,
        customerEmail: email,
        shippingAddress,
        status: 'PAID',
        paypalOrderId,
        productUrl,
      },
    });

    const fulfill = await orderFulfillmentService.fulfillOrder(order.id);

    const duration = Date.now() - startTime;
    const finalStatus = fulfill.status;
    const success = finalStatus === 'PURCHASED' || (finalStatus as string) === 'SIMULATED' || fulfill.aliexpressOrderId === 'SIMULATED_ORDER_ID';

    return res.status(200).json({
      success,
      paypalOrderId,
      orderId: order.id,
      aliexpressOrderId: fulfill.aliexpressOrderId,
      finalStatus,
      duration: `${duration}ms`,
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.error('[INTERNAL] test-post-sale-flow failed', { error: err?.message, duration });
    return res.status(500).json({
      success: false,
      error: err?.message || 'Unknown error',
      finalStatus: 'ERROR',
      duration: `${duration}ms`,
    });
  }
});

// POST /api/internal/test-full-cycle - Real-data-only verification (no mocks)
router.post('/test-full-cycle', validateInternalSecret, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const keyword = (req.body?.keyword as string) || 'phone case';

  logger.info('[INTERNAL] POST /api/internal/test-full-cycle', { keyword });

  try {
    const result = await opportunityFinder.findOpportunitiesWithDiagnostics(1, {
      query: keyword,
      maxItems: 5,
      skipTrendsValidation: true,
    });

    const durationMs = Date.now() - startTime;
    const { opportunities, diagnostics } = result;
    const sampleOpportunity =
      opportunities.length > 0
        ? {
            title: opportunities[0].title,
            price: opportunities[0].costUsd ?? opportunities[0].suggestedPriceUsd,
            images: opportunities[0].images ?? (opportunities[0].image ? [opportunities[0].image] : []),
            profitabilityScore: opportunities[0].roiPercentage ?? (opportunities[0].profitMargin ?? 0) * 100,
          }
        : null;

    const response = {
      success: result.success,
      discovered: result.diagnostics?.discovered ?? opportunities.length,
      normalized: result.diagnostics?.normalized ?? opportunities.length,
      evaluated: opportunities.length,
      stored: opportunities.length,
      sampleOpportunity: result.success ? sampleOpportunity : null,
      durationMs,
      diagnostics: result.diagnostics ?? undefined,
    };

    logger.info('[INTERNAL] test-full-cycle completed', { success: response.success, ...response });

    res.status(200).json(response);
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    logger.error('[INTERNAL] test-full-cycle failed', { error: error?.message, durationMs });
    const errPayload = error?.diagnostics;
    res.status(200).json({
      success: false,
      discovered: errPayload?.discovered ?? 0,
      normalized: errPayload?.normalized ?? 0,
      evaluated: 0,
      stored: 0,
      sampleOpportunity: null,
      durationMs,
      diagnostics: errPayload ?? { error: error?.message || 'Unknown error' },
    });
  }
});

router.post('/test-full-dropshipping-cycle', validateInternalSecret, runTestFullDropshippingCycle);

router.post('/reprice-product', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { dynamicPricingService } = await import('../../services/dynamic-pricing.service');
    const { prisma } = await import('../../config/database');
    const body = req.body || {};
    const productId = body.productId != null ? Number(body.productId) : null;
    const supplierPriceUsd = body.supplierPriceUsd != null ? Number(body.supplierPriceUsd) : null;
    const marketplace = (body.marketplace || 'ebay') as 'ebay' | 'amazon' | 'mercadolibre';
    const userId = body.userId != null ? Number(body.userId) : 1;

    if (productId != null && productId > 0 && supplierPriceUsd != null && supplierPriceUsd > 0) {
      const result = await dynamicPricingService.repriceByProduct(
        productId,
        supplierPriceUsd,
        marketplace,
        userId
      );
      return res.status(200).json(result);
    }

    if (productId === 0 || (productId == null && body._createTestProduct)) {
      const firstUser = await prisma.user.findFirst({ select: { id: true } });
      const uid = firstUser?.id ?? 1;
      const existing = await prisma.product.findFirst({
        where: { title: 'Test Product Dynamic Pricing', userId: uid },
        select: { id: true },
      });
      let testProduct;
      if (existing) {
        testProduct = existing;
      } else {
        testProduct = await prisma.product.create({
          data: {
            userId: uid,
            aliexpressUrl: 'https://example.com/test-dynamic-pricing',
            title: 'Test Product Dynamic Pricing',
            description: 'Test',
            aliexpressPrice: 10,
            suggestedPrice: 15,
            currency: 'USD',
            images: '[]',
          },
        });
      }
      const result = await dynamicPricingService.repriceByProduct(
        testProduct.id,
        10,
        'ebay',
        uid
      );
      return res.status(200).json(result);
    }

    const result = await dynamicPricingService.repriceProduct({
      productId: body.productId,
      orderId: body.orderId,
      costUsd: Number(body.costUsd) || Number(body.supplierPriceUsd) || 0,
      competitorPrices: Array.isArray(body.competitorPrices) ? body.competitorPrices : [],
      taxUsd: Number(body.taxUsd) || 0,
      shippingUsd: Number(body.shippingUsd) || 0,
      marketplace: body.marketplace || 'ebay',
      currentPriceUsd: body.currentPriceUsd ? Number(body.currentPriceUsd) : undefined,
    });
    res.status(200).json(result);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.post('/test-purchase-retry', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { purchaseRetryService } = await import('../../services/purchase-retry.service');
    const { prisma } = await import('../../config/database');
    const testOrderId = 'test-purchase-retry-' + Date.now();
    const result = await purchaseRetryService.attemptPurchase(
      'https://invalid-test-url.example.com/item/999',
      1,
      50,
      {
        fullName: 'Test',
        addressLine1: '123 Test',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        country: 'US',
        phoneNumber: '+15551234567',
      },
      [],
      testOrderId
    );
    const logs = await (prisma as any).purchaseAttemptLog.findMany({
      where: { orderId: testOrderId },
    });
    const success = !!purchaseRetryService && Array.isArray(result.attempts) && logs.length > 0;
    res.status(200).json({
      success,
      attempts: result.attempts?.length ?? 0,
      logsCreated: logs.length,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.get('/account-health', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { accountRotationService } = await import('../../services/account-rotation.service');
    const userId = req.query.userId ? Number(req.query.userId) : undefined;
    const health = await accountRotationService.getAccountHealth(userId);
    res.status(200).json(health);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.get('/top-categories', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { learningEngineService } = await import('../../services/learning-engine.service');
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const top = await learningEngineService.getTopCategories(undefined, limit);
    res.status(200).json({ categories: top });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post('/test-learning-engine', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { learningEngineService } = await import('../../services/learning-engine.service');
    const score = await learningEngineService.getLearningScore(1, 'electronics');
    const topCategories = await learningEngineService.getTopCategories(undefined, 5);
    const success = typeof score === 'number' && Array.isArray(topCategories);
    res.status(200).json({
      success,
      learningScore: score,
      topCategories,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.post('/test-account-rotation', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { accountRotationService } = await import('../../services/account-rotation.service');
    const health = await accountRotationService.getAccountHealth();
    const next = await accountRotationService.getNextAccount(1, 'marketplace', 'ebay');
    const success =
      typeof health.marketplace === 'object' &&
      typeof health.paypal === 'object' &&
      typeof health.aliexpress === 'object';
    res.status(200).json({
      success,
      accountHealth: health,
      nextAccount: next,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.post('/test-platform-commission', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { prisma } = await import('../../config/database');
    const { saleService } = await import('../../services/sale.service');
    const { platformConfigService } = await import('../../services/platform-config.service');

    const commissionPct = await platformConfigService.getCommissionPct();
    const adminPaypalEmail = await platformConfigService.getAdminPaypalEmail();
    const firstUser = await prisma.user.findFirst({
      where: { role: 'USER', isActive: true },
      select: { id: true, paypalPayoutEmail: true } as any,
    });
    const uid = firstUser?.id ?? 1;
    const userPaypal = (firstUser as any)?.paypalPayoutEmail?.trim() || process.env.TEST_PAYPAL_PAYOUT_EMAIL || null;

    let product = await prisma.product.findFirst({
      where: { userId: uid, status: { in: ['APPROVED', 'PUBLISHED'] }, isPublished: true },
      select: { id: true },
    });
    if (!product) {
      product = await prisma.product.findFirst({
        where: { userId: uid },
        select: { id: true },
      });
    }
    if (!product) {
      const created = await prisma.product.create({
        data: {
          userId: uid,
          aliexpressUrl: 'https://example.com/platform-commission-test',
          title: 'Platform Commission Test Product',
          description: 'Test',
          aliexpressPrice: 5,
          suggestedPrice: 15,
          currency: 'USD',
          images: '[]',
          status: 'APPROVED',
          isPublished: true,
        },
      });
      product = { id: created.id };
    }

    const orderId = `test-platform-commission-${Date.now()}`;
    const salePrice = 20;
    const costPrice = 8;
    const grossProfit = salePrice - costPrice;
    const expectedCommission = (grossProfit * commissionPct) / 100;
    const expectedUserProfit = grossProfit - expectedCommission;

    let sale: any = null;
    let commissionApplied = false;
    let adminPaid = false;
    let userPaid = false;

    try {
      sale = await saleService.createSale(uid, {
        orderId,
        productId: product.id,
        marketplace: 'ebay',
        salePrice,
        costPrice,
        platformFees: 0,
        currency: 'USD',
      });
      commissionApplied =
        Number(sale?.commissionAmount ?? 0) > 0 &&
        Number(sale?.netProfit ?? 0) > 0 &&
        Number(sale?.grossProfit ?? 0) > 0;
      adminPaid = !!(sale?.adminPayoutId);
      userPaid = !!(sale?.userPayoutId);
    } catch (err: any) {
      logger.warn('[TEST-PLATFORM-COMMISSION] createSale failed', { error: err?.message });
      if (err?.message?.includes('paypalPayoutEmail') || !userPaypal) {
        return res.status(200).json({
          success: false,
          commissionApplied: false,
          adminPaid: false,
          userPaid: false,
          error: 'User paypalPayoutEmail or TEST_PAYPAL_PAYOUT_EMAIL required for payout test',
        });
      }
      throw err;
    }

    // Success when commission applied and accounting rows created; payouts required only when PayPal + emails configured
    const payoutsRequired = !!userPaypal && !!adminPaypalEmail;
    const success =
      commissionApplied &&
      sale?.status !== 'PAYOUT_FAILED' &&
      (payoutsRequired ? (adminPaid && userPaid) : true);
    res.status(200).json({
      success: !!success,
      commissionApplied,
      adminPaid,
      userPaid,
      saleId: sale?.id,
      commissionAmount: sale?.commissionAmount,
      netProfit: sale?.netProfit,
    });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      commissionApplied: false,
      adminPaid: false,
      userPaid: false,
      error: e?.message,
    });
  }
});

router.post('/test-evolution-cycle', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { dynamicPricingService } = await import('../../services/dynamic-pricing.service');
    const { accountRotationService } = await import('../../services/account-rotation.service');
    const { learningEngineService } = await import('../../services/learning-engine.service');
    const { purchaseRetryService } = await import('../../services/purchase-retry.service');
    const { prisma } = await import('../../config/database');

    const dynamicPricingRes = await dynamicPricingService.repriceProduct({
      costUsd: 10,
      competitorPrices: [15, 18, 20],
      currentPriceUsd: 16,
    });
    const dynamicPricing = dynamicPricingRes.success === true;

    const testOrderId = 'test-evolution-' + Date.now();
    const retryResult = await purchaseRetryService.attemptPurchase(
      'https://invalid-evolution-test.example/item/1',
      1,
      50,
      {
        fullName: 'Test',
        addressLine1: '123 Test',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        country: 'US',
        phoneNumber: '+15551234567',
      },
      [],
      testOrderId
    );
    const retryLogs = await (prisma as any).purchaseAttemptLog.findMany({
      where: { orderId: testOrderId },
    });
    const retrySystem = Array.isArray(retryResult.attempts) && retryLogs.length > 0;

    const accountHealth = await accountRotationService.getAccountHealth();
    const accountRotation =
      typeof accountHealth.marketplace === 'object' &&
      typeof accountHealth.paypal === 'object' &&
      typeof accountHealth.aliexpress === 'object';

    const learningScore = await learningEngineService.getLearningScore(1, 'electronics');
    const topCategories = await learningEngineService.getTopCategories(undefined, 5);
    const learningEngine = typeof learningScore === 'number' && Array.isArray(topCategories);

    const success = dynamicPricing && retrySystem && accountRotation && learningEngine;

    res.status(200).json({
      success,
      dynamicPricing,
      retrySystem,
      accountRotation,
      learningEngine,
    });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      dynamicPricing: false,
      retrySystem: false,
      accountRotation: false,
      learningEngine: false,
      error: e?.message,
    });
  }
});

// ? LOG: Registrar rutas al cargar el m�dulo�dulo
const routes = router.stack.map((layer: any) => ({
  path: layer.route?.path,
  method: layer.route?.stack?.[0]?.method?.toUpperCase(),
}));
logger.info('[INTERNAL] Routes registered', {
  routes: routes.filter((r: any) => r.path && r.method),
  totalRoutes: routes.filter((r: any) => r.path && r.method).length,
  hasSecret: !!INTERNAL_SECRET,
});
console.log('[INTERNAL] Routes mounted at /api/internal');
console.log('[INTERNAL]   - GET  /api/internal/health (no auth)');
console.log('[INTERNAL]   - POST /api/internal/run-ebay-cycle (requires x-internal-secret)');
console.log('[INTERNAL]   - POST /api/internal/test-opportunity-cycle (requires x-internal-secret)');
console.log('[INTERNAL]   - POST /api/internal/test-full-cycle (requires x-internal-secret)');
console.log('[INTERNAL]   - POST /api/internal/test-full-dropshipping-cycle (requires x-internal-secret)');
console.log('[INTERNAL]   - POST /api/internal/reprice-product (requires x-internal-secret)');
console.log('[INTERNAL]   - GET  /api/internal/account-health (requires x-internal-secret)');
console.log('[INTERNAL]   - POST /api/internal/test-evolution-cycle (requires x-internal-secret)');

export default router;
