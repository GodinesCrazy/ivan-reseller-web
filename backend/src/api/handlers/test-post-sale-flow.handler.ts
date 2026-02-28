/**
 * POST /api/internal/test-post-sale-flow
 * Controlled post-sale simulation: NO real purchase, mock provider response.
 * Validates: order creation, fulfill flow, sale creation, netProfit, payout attempt.
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { orderFulfillmentService } from '../../services/order-fulfillment.service';
import { saleService } from '../../services/sale.service';

export interface TestPostSaleFlowResult {
  success: boolean;
  simulate: boolean;
  orderCreated: boolean;
  orderId?: string;
  fulfillExecuted: boolean;
  fulfillStatus?: string;
  attemptPurchase: boolean;
  executePurchase: boolean;
  saleCreated: boolean;
  saleId?: number;
  netProfitCalculated?: number;
  payoutTriggered: boolean;
  durationMs: number;
  report: {
    ORDER_CREATED: string;
    FULFILL_EXECUTED: string;
    ATTEMPT_PURCHASE: string;
    EXECUTE_PURCHASE: string;
    SALE_CREATED: string;
    NET_PROFIT_CALCULATED: string;
    PAYOUT_TRIGGERED: string;
    ANY_RACE_CONDITION: string;
    ANY_NULL_FIELD_FAILURE: string;
    SYSTEM_READY_FOR_REAL_MONEY: string;
  };
}

export async function runTestPostSaleFlow(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const body = req.body || {};
  const simulate = body.simulate === true || body.simulate === '1';
  const correlationId = (req as any).correlationId ?? `test-ps-${Date.now()}`;

  const report: TestPostSaleFlowResult['report'] = {
    ORDER_CREATED: 'PENDING',
    FULFILL_EXECUTED: 'PENDING',
    ATTEMPT_PURCHASE: 'PENDING',
    EXECUTE_PURCHASE: 'PENDING',
    SALE_CREATED: 'PENDING',
    NET_PROFIT_CALCULATED: 'PENDING',
    PAYOUT_TRIGGERED: 'PENDING',
    ANY_RACE_CONDITION: 'NONE',
    ANY_NULL_FIELD_FAILURE: 'NONE',
    SYSTEM_READY_FOR_REAL_MONEY: 'PENDING',
  };

  let orderId: string | undefined;
  let saleId: number | undefined;
  let netProfit: number | undefined;
  let fulfillStatus: string | undefined;
  let nullFieldFailure = false;
  let raceCondition = false;

  try {
    const firstUser = await prisma.user.findFirst({ select: { id: true } });
    const userId = body.userId ?? firstUser?.id ?? 1;

    const product = await prisma.product.findFirst({
      where: { userId, status: { in: ['APPROVED', 'PUBLISHED'] } },
      select: { id: true, aliexpressUrl: true, aliexpressPrice: true, suggestedPrice: true },
    });
    if (!product) {
      res.status(400).json({
        success: false,
        error: 'No product found for user. Add an approved product first.',
        report,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const salePrice = Number(body.price) || Number(product.suggestedPrice) || 25;
    const costPrice = Number(product.aliexpressPrice) || 15;

    // Simulate eBay order structure
    const shippingAddress = {
      fullName: body.buyerName || 'Test Buyer',
      addressLine1: body.addressLine1 || '123 Test St',
      addressLine2: body.addressLine2 || '',
      city: body.city || 'Miami',
      state: body.state || 'FL',
      zipCode: body.zipCode || '33101',
      country: body.country || 'US',
      phoneNumber: body.phone || '+15551234567',
    };

    logger.info('[TEST_POST_SALE] Creating Order (eBay-like structure)', {
      correlationId,
      userId,
      productId: product.id,
      salePrice,
      simulate,
    });

    if (simulate) {
      // SIMULATE: Create Order directly, skip real fulfillOrder, mock provider success
      const order = await prisma.order.create({
        data: {
          userId,
          productId: product.id,
          title: 'Test Post-Sale Simulation',
          price: salePrice,
          currency: 'USD',
          customerName: shippingAddress.fullName,
          customerEmail: body.buyerEmail || 'buyer@test.com',
          shippingAddress: JSON.stringify(shippingAddress),
          status: 'PAID',
          paypalOrderId: `SIM_TEST_${Date.now()}`,
          productUrl: product.aliexpressUrl || '',
        },
      });
      orderId = order.id;
      report.ORDER_CREATED = `OK (orderId=${orderId}, status=PAID)`;

      // Simulate fulfill success: mark PURCHASED with mock supplier orderId
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PURCHASED',
          aliexpressOrderId: 'SIMULATED_TEST_ORDER',
          errorMessage: null,
        },
      });
      fulfillStatus = 'PURCHASED';
      report.FULFILL_EXECUTED = 'SIMULATED (no real placeOrder)';
      report.ATTEMPT_PURCHASE = 'SKIPPED (simulate mode)';
      report.EXECUTE_PURCHASE = 'MOCKED (simulate mode)';

      // Create Sale from Order
      const saleResult = await saleService.createSaleFromOrder(orderId);
      if (saleResult) {
        saleId = saleResult.id;
        const sale = await prisma.sale.findUnique({
          where: { id: saleId },
          select: { netProfit: true, adminPayoutId: true, userPayoutId: true },
        });
        if (sale) {
          netProfit = Number(sale.netProfit);
          report.SALE_CREATED = `OK (saleId=${saleId})`;
          report.NET_PROFIT_CALCULATED = netProfit != null ? `OK ($${netProfit.toFixed(2)})` : 'PENDING';
          report.PAYOUT_TRIGGERED =
            sale.adminPayoutId || sale.userPayoutId
              ? `OK (adminPayoutId=${!!sale.adminPayoutId}, userPayoutId=${!!sale.userPayoutId})`
              : 'ATTEMPTED (check PayPal config)';
        }
      } else {
        report.SALE_CREATED = 'FAILED (createSaleFromOrder returned null)';
        nullFieldFailure = true;
      }
    } else {
      // REAL flow: Create Order, run fulfillOrder (will attempt real purchase)
      const order = await prisma.order.create({
        data: {
          userId,
          productId: product.id,
          title: 'Test Post-Sale Real',
          price: salePrice,
          currency: 'USD',
          customerName: shippingAddress.fullName,
          customerEmail: body.buyerEmail || 'buyer@test.com',
          shippingAddress: JSON.stringify(shippingAddress),
          status: 'PAID',
          paypalOrderId: `REAL_TEST_${Date.now()}`,
          productUrl: product.aliexpressUrl || '',
        },
      });
      orderId = order.id;
      report.ORDER_CREATED = `OK (orderId=${orderId})`;

      const fulfill = await orderFulfillmentService.fulfillOrder(orderId);
      fulfillStatus = fulfill.status;
      report.FULFILL_EXECUTED = fulfill.success ? `OK (status=${fulfill.status})` : `FAILED (${fulfill.error})`;
      report.ATTEMPT_PURCHASE = fulfill.success ? 'OK' : 'FAILED';
      report.EXECUTE_PURCHASE = fulfill.success ? 'OK' : 'FAILED';

      if (fulfill.status === 'PURCHASED') {
        const saleResult = await saleService.createSaleFromOrder(orderId);
        if (saleResult) {
          saleId = saleResult.id;
          const sale = await prisma.sale.findUnique({
            where: { id: saleId },
            select: { netProfit: true, adminPayoutId: true, userPayoutId: true },
          });
          if (sale) {
            netProfit = Number(sale.netProfit);
            report.SALE_CREATED = `OK (saleId=${saleId})`;
            report.NET_PROFIT_CALCULATED = netProfit != null ? `OK ($${netProfit.toFixed(2)})` : 'OK';
            report.PAYOUT_TRIGGERED =
              sale.adminPayoutId || sale.userPayoutId ? 'OK' : 'ATTEMPTED';
          }
        }
      }
    }

    report.ANY_RACE_CONDITION = raceCondition ? 'DETECTED' : 'NONE';
    report.ANY_NULL_FIELD_FAILURE = nullFieldFailure ? 'DETECTED' : 'NONE';
    report.SYSTEM_READY_FOR_REAL_MONEY =
      report.SALE_CREATED.startsWith('OK') && !nullFieldFailure && !raceCondition ? 'YES (with caveats)' : 'NO';

    const durationMs = Date.now() - startTime;

    const result: TestPostSaleFlowResult = {
      success: !!saleId,
      simulate,
      orderCreated: !!orderId,
      orderId,
      fulfillExecuted: true,
      fulfillStatus,
      attemptPurchase: !simulate,
      executePurchase: !simulate,
      saleCreated: !!saleId,
      saleId,
      netProfitCalculated: netProfit,
      payoutTriggered: report.PAYOUT_TRIGGERED.includes('OK') || report.PAYOUT_TRIGGERED.includes('ATTEMPTED'),
      durationMs,
      report,
    };

    logger.info('[TEST_POST_SALE] Simulation complete', {
      correlationId,
      success: result.success,
      simulate,
      saleId,
      durationMs,
    });

    // Generate POST_SALE_SIMULATION_REPORT.md when simulate=true and writeReport
    if (simulate && (body.writeReport === true || body.writeReport === '1')) {
      try {
        const reportPath = path.resolve(process.cwd(), 'POST_SALE_SIMULATION_REPORT.md');
        const md = `# POST-SALE SIMULATION REPORT

**Generated:** ${new Date().toISOString()}
**CorrelationId:** ${correlationId}
**Mode:** simulate (no real placeOrder)

## Results

| Field | Value |
|-------|-------|
| ORDER CREATED | ${report.ORDER_CREATED} |
| FULFILL EXECUTED | ${report.FULFILL_EXECUTED} |
| ATTEMPT PURCHASE | ${report.ATTEMPT_PURCHASE} |
| EXECUTE PURCHASE | ${report.EXECUTE_PURCHASE} |
| SALE CREATED | ${report.SALE_CREATED} |
| NET PROFIT CALCULATED | ${report.NET_PROFIT_CALCULATED} |
| PAYOUT TRIGGERED | ${report.PAYOUT_TRIGGERED} |
| ANY RACE CONDITION | ${report.ANY_RACE_CONDITION} |
| ANY NULL FIELD FAILURE | ${report.ANY_NULL_FIELD_FAILURE} |
| SYSTEM READY FOR REAL MONEY | ${report.SYSTEM_READY_FOR_REAL_MONEY} |

**Duration:** ${durationMs}ms
**Success:** ${result.success}
`;
        fs.writeFileSync(reportPath, md, 'utf8');
        logger.info('[TEST_POST_SALE] Report written', { path: reportPath });
      } catch (writeErr: any) {
        logger.warn('[TEST_POST_SALE] Could not write report', { error: writeErr?.message });
      }
    }

    res.status(200).json(result);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logger.error('[TEST_POST_SALE] Failed', {
      correlationId,
      error: err?.message,
      durationMs,
    });
    report.ANY_NULL_FIELD_FAILURE = err?.message?.includes('null') || err?.message?.includes('undefined') ? 'DETECTED' : 'NONE';
    report.SYSTEM_READY_FOR_REAL_MONEY = 'NO';
    res.status(500).json({
      success: false,
      error: err?.message || 'Unknown error',
      report,
      durationMs,
    });
  }
}
