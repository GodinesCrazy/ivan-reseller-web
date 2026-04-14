/**
 * CJ → eBay USA — tracking desde CJ (`getOrderDetail` → trackNumber) y push a eBay vía fachada (FASE 3E / 3E.1).
 * Sin fulfillment-tracking-sync legacy.
 */

import { Prisma } from '@prisma/client';
import { AppError } from '../../../middleware/error.middleware';
import { prisma } from '../../../config/database';
import { createCjSupplierAdapter } from '../adapters/cj-supplier.adapter';
import { CjSupplierError } from '../adapters/cj-supplier.errors';
import { cjEbayEbayFacadeService } from './cj-ebay-ebay-facade.service';
import { cjEbayTraceService } from './cj-ebay-trace.service';
import { appendOrderEvent } from './cj-ebay-order-ingest.service';
import { CJ_EBAY_TRACE_STEP, CJ_EBAY_ORDER_STATUS } from '../cj-ebay.constants';

export const cjEbayTrackingService = {
  /**
   * Consulta CJ vía `adapter.getTracking` (implementado como `getOrderDetail` oficial).
   * Evita duplicar envío a eBay si `submittedToEbayAt` ya está fijado.
   */
  async syncFromCj(input: {
    userId: number;
    orderId: string;
    correlationId?: string;
    route?: string;
  }): Promise<{
    ok: boolean;
    stub?: boolean;
    trackingNumber?: string;
    submittedToEbay?: boolean;
    message?: string;
  }> {
    const order = await prisma.cjEbayOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
      include: { tracking: true },
    });
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    if (!order.cjOrderId) {
      throw new AppError('No CJ order id yet; run place CJ order first.', 400);
    }
    if (order.status === CJ_EBAY_ORDER_STATUS.COMPLETED) {
      throw new AppError(`Nothing to sync for status ${order.status}`, 400);
    }

    if (
      order.status === CJ_EBAY_ORDER_STATUS.TRACKING_ON_EBAY &&
      order.tracking?.submittedToEbayAt &&
      order.tracking.trackingNumber
    ) {
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_TRACKING_START,
        message: 'cj.tracking.start',
        meta: { orderId: order.id, skipped: 'idempotent_ebay_done' },
      });
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_TRACKING_SUCCESS,
        message: 'cj.tracking.success',
        meta: { orderId: order.id, skipped: true },
      });
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.TRACKING_SYNC_SUCCESS,
        message: 'tracking.sync.success',
        meta: { orderId: order.id, skipped: true },
      });
      return {
        ok: true,
        trackingNumber: order.tracking.trackingNumber,
        submittedToEbay: true,
        message: 'Tracking already on eBay (no duplicate submit)',
      };
    }

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.TRACKING_SYNC_START,
      message: 'tracking.sync.start',
      meta: { orderId: order.id, cjOrderId: order.cjOrderId },
    });

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.CJ_TRACKING_START,
      message: 'cj.tracking.start',
      meta: { orderId: order.id, cjOrderId: order.cjOrderId },
    });

    const adapter = createCjSupplierAdapter(input.userId);

    try {
      const tr = await adapter.getTracking(order.cjOrderId);
      const tn = tr?.trackingNumber?.trim() || '';

      if (!tr || (!tn && !tr.carrierCode && !tr.trackingUrl)) {
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.CJ_TRACKING_SUCCESS,
          message: 'cj.tracking.success',
          meta: { orderId: order.id, empty: true },
        });
        await appendOrderEvent(order.id, 'TRACKING_SYNC', 'No tracking data from CJ yet (getOrderDetail)', {
          cjOrderId: order.cjOrderId,
        });
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.TRACKING_SYNC_SUCCESS,
          message: 'tracking.sync.success',
          meta: { orderId: order.id, empty: true },
        });
        return { ok: true, message: 'No tracking yet' };
      }

      const sameAsStored =
        order.tracking?.trackingNumber &&
        tn &&
        order.tracking.trackingNumber.trim() === tn;

      if (!sameAsStored) {
        await prisma.cjEbayTracking.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            carrierCode: tr.carrierCode ?? null,
            trackingNumber: tn || null,
            status: tn ? 'AVAILABLE' : 'PARTIAL',
            rawPayload: { ...tr } as unknown as Prisma.InputJsonValue,
          },
          update: {
            carrierCode: tr.carrierCode ?? null,
            trackingNumber: tn || null,
            status: tn ? 'AVAILABLE' : 'PARTIAL',
            rawPayload: { ...tr } as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_TRACKING_SUCCESS,
        message: 'cj.tracking.success',
        meta: { orderId: order.id, hasNumber: Boolean(tn), duplicateRow: sameAsStored },
      });

      if (!tn) {
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.TRACKING_SYNC_SUCCESS,
          message: 'tracking.sync.success',
          meta: { orderId: order.id, partial: true },
        });
        return { ok: true, message: 'Carrier / URL without tracking number yet' };
      }

      if (!sameAsStored) {
        await prisma.cjEbayOrder.update({
          where: { id: order.id },
          data: { status: CJ_EBAY_ORDER_STATUS.CJ_SHIPPED },
        });
        await appendOrderEvent(order.id, CJ_EBAY_ORDER_STATUS.CJ_SHIPPED, 'Tracking captured from CJ', {
          trackingNumber: tn,
        });
      }

      const summary = order.rawEbaySummary as {
        lineItems?: Array<{ lineItemId: string; quantity: number }>;
      } | null;
      const lineItems =
        summary?.lineItems
          ?.filter((li) => li.lineItemId)
          .map((li) => ({
            lineItemId: li.lineItemId,
            quantity: Math.max(1, Math.floor(li.quantity) || order.lineQuantity),
          })) || [];

      let submittedToEbay = false;
      if (order.tracking?.submittedToEbayAt) {
        submittedToEbay = true;
      } else if (lineItems.length > 0) {
        try {
          await cjEbayEbayFacadeService.submitOrderShippingFulfillment(input.userId, order.ebayOrderId, {
            lineItems,
            trackingNumber: tn,
            shippingCarrierCode: tr.carrierCode || 'OTHER',
          });
          submittedToEbay = true;
          await prisma.cjEbayTracking.update({
            where: { orderId: order.id },
            data: { submittedToEbayAt: new Date() },
          });
          await prisma.cjEbayOrder.update({
            where: { id: order.id },
            data: { status: CJ_EBAY_ORDER_STATUS.TRACKING_ON_EBAY, lastError: null },
          });
          await appendOrderEvent(
            order.id,
            CJ_EBAY_ORDER_STATUS.TRACKING_ON_EBAY,
            'Tracking submitted to eBay (Sell Fulfillment API)',
            {}
          );
        } catch (ebayErr) {
          const m = ebayErr instanceof Error ? ebayErr.message : String(ebayErr);
          await prisma.cjEbayOrder.update({
            where: { id: order.id },
            data: { lastError: m.slice(0, 2000) },
          });
          await appendOrderEvent(order.id, 'TRACKING_EBAY_ERROR', m, {});
        }
      } else {
        await appendOrderEvent(
          order.id,
          'TRACKING_EBAY_SKIPPED',
          'rawEbaySummary.lineItems missing — cannot call createShippingFulfillment',
          {}
        );
      }

      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.TRACKING_SYNC_SUCCESS,
        message: 'tracking.sync.success',
        meta: { orderId: order.id, submittedToEbay },
      });

      return { ok: true, trackingNumber: tn, submittedToEbay };
    } catch (e) {
      if (e instanceof CjSupplierError && e.code === 'CJ_NOT_IMPLEMENTED') {
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.CJ_TRACKING_ERROR,
          message: 'cj.tracking.error',
          meta: { orderId: order.id, stub: true },
        });
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.TRACKING_SYNC_ERROR,
          message: 'tracking.sync.error',
          meta: { orderId: order.id, stub: true },
        });
        await appendOrderEvent(order.id, 'TRACKING_STUB', e.message, { code: e.code });
        return { ok: false, stub: true, message: e.message };
      }
      const msg = e instanceof Error ? e.message : String(e);
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_TRACKING_ERROR,
        message: 'cj.tracking.error',
        meta: { orderId: order.id, error: msg.slice(0, 400) },
      });
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.TRACKING_SYNC_ERROR,
        message: 'tracking.sync.error',
        meta: { orderId: order.id, error: msg.slice(0, 400) },
      });
      throw e;
    }
  },
};
