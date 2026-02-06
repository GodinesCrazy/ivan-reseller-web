/**
 * Handler for POST /api/internal/test-full-dropshipping-cycle
 * Runs full pipeline: trends ? aliexpressSearch ? pricing ? marketplaceCompare ? publish ? sale ? paypalCapture ? aliexpressPurchase ? tracking
 * success = true only when no stage used simulated/fallback data.
 */

import { Request, Response } from 'express';
import { logger } from '../../config/logger';
import opportunityFinder from '../../services/opportunity-finder.service';

export interface FullCycleStageResult {
  ok: boolean;
  real: boolean;
  data?: unknown;
  error?: string;
}

export type FullCycleStages = {
  trends: FullCycleStageResult;
  aliexpressSearch: FullCycleStageResult;
  pricing: FullCycleStageResult;
  marketplaceCompare: FullCycleStageResult;
  publish: FullCycleStageResult;
  sale: FullCycleStageResult;
  paypalCapture: FullCycleStageResult;
  aliexpressPurchase: FullCycleStageResult;
  tracking: FullCycleStageResult;
  accounting: FullCycleStageResult;
};

export interface FullCycleResponse {
  success: boolean;
  /** Same as stageResults; required by verifier spec */
  stages: FullCycleStages;
  stageResults: FullCycleStages;
  diagnostics: string[] | { stageCount: number };
}

export async function runTestFullDropshippingCycle(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const autopilotMode = (process.env.AUTOPILOT_MODE || 'sandbox') as 'production' | 'sandbox';
  const skipPostSale = req.body?.skipPostSale === true;
  if (autopilotMode === 'production' && skipPostSale) {
    res.status(400).json({
      success: false,
      error: 'AUTOPILOT_MODE=production: skipPostSale forbidden. Full cycle required.',
    });
    return;
  }
  const keyword = (req.body?.keyword as string) || 'phone case';

  const stageResults: FullCycleStages = {
    trends: { ok: false, real: false },
    aliexpressSearch: { ok: false, real: false },
    pricing: { ok: false, real: false },
    marketplaceCompare: { ok: false, real: false },
    publish: { ok: false, real: false },
    sale: { ok: false, real: false },
    paypalCapture: { ok: false, real: false },
    aliexpressPurchase: { ok: false, real: false },
    tracking: { ok: false, real: false },
    accounting: { ok: false, real: false },
  };
  const diagnostics: string[] = [];
  let firstOpportunity: {
    costUsd: number;
    suggestedPriceUsd: number;
    aliexpressUrl?: string;
    productUrl?: string;
    title?: string;
    shippingCost?: number;
    importTax?: number;
    competitionLevel?: string;
  } | null = null;

  logger.info('[INTERNAL] POST /api/internal/test-full-dropshipping-cycle', {
    keyword,
    hasTrendsApiKey: !!(process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY),
    hasAliexpressKeys: !!(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET),
  });

  try {
    const hasTrendsApi = !!(process.env.SERP_API_KEY || process.env.GOOGLE_TRENDS_API_KEY);
    const { TrendsService } = await import('../../services/trends.service');
    const trendsService = new TrendsService();
    const trendKeywords = await trendsService.getTrendingKeywords({ region: 'US', maxKeywords: 10, userId: 1 });
    const trendsReal = hasTrendsApi && trendKeywords.length > 0;
    stageResults.trends = {
      ok: trendKeywords.length > 0,
      real: trendsReal,
      data: { count: trendKeywords.length, sample: trendKeywords.slice(0, 3).map(k => k.keyword) },
      error:
        !trendsReal && trendKeywords.length > 0 ? 'Fallback keywords used' : trendKeywords.length === 0 ? 'No keywords' : undefined,
    };
    if (!stageResults.trends.ok) diagnostics.push('trends: no keywords');

    const result = await opportunityFinder.findOpportunitiesWithDiagnostics(1, {
      query: keyword,
      maxItems: 5,
      skipTrendsValidation: true,
    });
    const opportunities = result.opportunities;
    const aliexpressReal =
      (result.diagnostics?.discovered ?? 0) > 0 && (result.diagnostics?.normalized ?? 0) > 0;
    stageResults.aliexpressSearch = {
      ok: opportunities.length > 0,
      real: aliexpressReal,
      data: {
        discovered: result.diagnostics?.discovered ?? 0,
        normalized: result.diagnostics?.normalized ?? 0,
        count: opportunities.length,
      },
      error: opportunities.length === 0 ? (result.diagnostics?.reason || 'No products') : undefined,
    };
    if (opportunities.length > 0) firstOpportunity = opportunities[0];
    if (!stageResults.aliexpressSearch.ok) diagnostics.push('aliexpressSearch: no products');

    if (firstOpportunity) {
      const costCalculator = (await import('../../services/cost-calculator.service')).default;
      const costUsd = firstOpportunity.costUsd ?? 0;
      const suggestedUsd = firstOpportunity.suggestedPriceUsd ?? costUsd * 1.5;
      const calc = costCalculator.calculate('ebay', suggestedUsd, costUsd, {
        shippingCost: firstOpportunity.shippingCost,
        importTax: firstOpportunity.importTax,
      });
      stageResults.pricing = {
        ok: true,
        real: true,
        data: {
          costUsd,
          suggestedPriceUsd: suggestedUsd,
          margin: calc.margin,
          netProfit: calc.netProfit,
          breakdown: calc.breakdown,
        },
      };
    } else {
      stageResults.pricing = { ok: false, real: false, error: 'No product for pricing' };
      diagnostics.push('pricing: no product');
    }

    const hasCompetitorData =
      (result.diagnostics?.sourcesTried?.length ?? 0) > 0 ||
      (opportunities.length > 0 && (firstOpportunity?.competitionLevel ?? '') !== 'unknown');
    stageResults.marketplaceCompare = {
      ok: opportunities.length > 0,
      real: hasCompetitorData,
      data: result.diagnostics ?? undefined,
      error: opportunities.length === 0 ? 'No data' : undefined,
    };
    if (!stageResults.marketplaceCompare.ok) diagnostics.push('marketplaceCompare: no data');

    let publishReal = false;
    try {
      const { EbayPublisher } = await import('../../modules/marketplace/ebay.publisher');
      const ebayPublisher = new EbayPublisher();
      const validation = await ebayPublisher.validateCredentials();
      if (validation?.ok) {
        const connectionOk = await ebayPublisher.testConnection();
        publishReal = !!connectionOk;
      }
    } catch {
      publishReal = false;
    }
    stageResults.publish = {
      ok: true,
      real: publishReal,
      data: publishReal
        ? { validated: true, reason: 'eBay API configured and connected' }
        : { validated: false, reason: 'eBay publish not configured or connection failed' },
    };

    {
      const { prisma } = await import('../../config/database');
      const { checkDailyLimits } = await import('../../services/daily-limits.service');
      const price = firstOpportunity?.suggestedPriceUsd ?? 10.99;
      const limitCheck = await checkDailyLimits(1, price);
      if (!limitCheck.ok) {
        stageResults.sale = { ok: false, real: false, error: limitCheck.error };
        diagnostics.push(`sale: ${limitCheck.error}`);
      } else {
        const productUrl =
          firstOpportunity?.aliexpressUrl ||
          firstOpportunity?.productUrl ||
          'https://www.aliexpress.com/item/example.html';
        const shippingAddress = JSON.stringify({
        fullName: 'Test Buyer',
        addressLine1: '123 Test St',
        city: 'Miami',
        state: 'FL',
        country: 'US',
        zipCode: '33101',
          phoneNumber: '+15551234567',
        });
        const order = await prisma.order.create({
        data: {
          title: firstOpportunity?.title ?? 'Test Order',
          price,
          currency: 'USD',
          customerName: 'Test Buyer',
          customerEmail: 'test@example.com',
          shippingAddress,
          status: 'PAID',
          paypalOrderId: null,
          productUrl,
        },
      });
      stageResults.sale = { ok: true, real: true, data: { orderId: order.id } };

      const { checkProfitGuard } = await import('../../services/profit-guard.service');
      const profitResult = checkProfitGuard({
        sellingPriceUsd: price,
        supplierPriceUsd: firstOpportunity?.costUsd ?? 0,
        taxUsd: firstOpportunity?.importTax ?? 0,
        shippingUsd: firstOpportunity?.shippingCost ?? 0,
      });
      if (!profitResult.allowed) {
        stageResults.paypalCapture = {
          ok: false,
          real: false,
          error: profitResult.error,
        };
        diagnostics.push('paypalCapture: profit guard blocked');
      }
        if (profitResult.allowed) {
        const { PayPalCheckoutService } = await import('../../services/paypal-checkout.service');
        const paypal = PayPalCheckoutService.fromEnv();
      if (!paypal) {
        stageResults.paypalCapture = { ok: false, real: false, error: 'PayPal not configured' };
        diagnostics.push('paypalCapture: not configured');
        } else {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const createResult = await paypal.createOrder({
          amount: price,
          currency: 'USD',
          productTitle: firstOpportunity?.title ?? 'Test',
          productUrl,
          returnUrl: `${baseUrl}/api/paypal/success`,
          cancelUrl: `${baseUrl}/api/paypal/cancel`,
          });
          if (!createResult.success || !createResult.orderId) {
            stageResults.paypalCapture = {
              ok: false,
              real: false,
              error: createResult.error || 'Create order failed',
            };
            diagnostics.push('paypalCapture: create failed');
          } else {
            const captureResult = await paypal.captureOrder(createResult.orderId);
            if (!captureResult.success || !captureResult.captureId) {
              stageResults.paypalCapture = {
                ok: false,
                real: false,
                error: captureResult.error || 'Capture failed',
              };
              diagnostics.push('paypalCapture: capture failed');
            } else {
              stageResults.paypalCapture = {
                ok: true,
                real: true,
                data: { orderId: createResult.orderId, captureId: captureResult.captureId },
              };
              await prisma.order.update({
                where: { id: order.id },
                data: { paypalOrderId: createResult.orderId },
              });
            }
          }
        }
        }

        if (stageResults.paypalCapture.ok && stageResults.paypalCapture.real) {
        const { orderFulfillmentService } = await import('../../services/order-fulfillment.service');
        const fulfill = await orderFulfillmentService.fulfillOrder(order.id);
        const aliSimulated =
          fulfill.aliexpressOrderId === 'SIMULATED_ORDER_ID' || (fulfill.status as string) === 'SIMULATED';
        stageResults.aliexpressPurchase = {
          ok: fulfill.success && !aliSimulated,
          real: fulfill.success && !aliSimulated,
          data: {
            orderId: fulfill.orderId,
            aliexpressOrderId: fulfill.aliexpressOrderId,
            status: fulfill.status,
          },
          error:
            fulfill.success && aliSimulated
              ? 'Simulated order'
              : fulfill.success
                ? undefined
                : fulfill.error,
        };
        if (aliSimulated || !fulfill.success)
          diagnostics.push('aliexpressPurchase: simulated or failed');

        stageResults.tracking = {
          ok: !!fulfill.aliexpressOrderId,
          real:
            !!fulfill.aliexpressOrderId && fulfill.aliexpressOrderId !== 'SIMULATED_ORDER_ID',
          data: { aliexpressOrderId: fulfill.aliexpressOrderId },
        };

        const orderForAccounting = await prisma.order.findUnique({
          where: { id: order.id },
          select: { id: true, price: true, currency: true, status: true },
        });
        stageResults.accounting = {
          ok: !!orderForAccounting,
          real: !!orderForAccounting && orderForAccounting.status === 'PURCHASED',
          data: orderForAccounting
            ? {
                orderId: orderForAccounting.id,
                revenue: Number(orderForAccounting.price),
                currency: orderForAccounting.currency,
                stored: true,
              }
            : undefined,
        };
        if (!stageResults.accounting.ok) diagnostics.push('accounting: order not found');
      }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[INTERNAL] test-full-dropshipping-cycle failed', { error: msg });
    diagnostics.push(msg);
  }

  const paypalData = stageResults.paypalCapture.data as Record<string, unknown> | undefined;
  const aliData = stageResults.aliexpressPurchase.data as Record<string, unknown> | undefined;
  const anySimulated =
    paypalData?.skip !== true &&
    paypalData?.captureId === undefined &&
    !stageResults.paypalCapture.ok;
  const aliSimulated = aliData?.aliexpressOrderId === 'SIMULATED_ORDER_ID';
  const postSaleOk =
    stageResults.paypalCapture.ok &&
    stageResults.paypalCapture.real &&
    stageResults.aliexpressPurchase.ok &&
    stageResults.aliexpressPurchase.real &&
    stageResults.tracking.ok &&
    stageResults.tracking.real &&
    stageResults.accounting.ok;

  const success =
    stageResults.trends.ok === true &&
    stageResults.trends.real === true &&
    stageResults.aliexpressSearch.ok === true &&
    stageResults.aliexpressSearch.real === true &&
    stageResults.pricing.ok === true &&
    stageResults.pricing.real === true &&
    stageResults.marketplaceCompare.ok === true &&
    stageResults.marketplaceCompare.real === true &&
    stageResults.publish.ok === true &&
    stageResults.publish.real === true &&
    stageResults.sale.ok === true &&
    stageResults.sale.real === true &&
    stageResults.paypalCapture.ok === true &&
    stageResults.paypalCapture.real === true &&
    stageResults.aliexpressPurchase.ok === true &&
    stageResults.aliexpressPurchase.real === true &&
    stageResults.tracking.ok === true &&
    stageResults.tracking.real === true &&
    stageResults.accounting.ok === true &&
    stageResults.accounting.real === true &&
    !stageResults.trends.error?.includes('Fallback') &&
    !anySimulated &&
    !aliSimulated;

  const duration = Date.now() - startTime;
  const response: FullCycleResponse = {
    success,
    stages: stageResults,
    stageResults,
    diagnostics: diagnostics.length ? diagnostics : { stageCount: 10 },
  };

  logger.info('[INTERNAL] test-full-dropshipping-cycle completed', {
    success,
    duration: `${duration}ms`,
  });
  res.status(200).json(response);
}
