import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import logger from '../config/logger';
import { AppError } from '../middleware/error.middleware';
import { createCjSupplierAdapter } from '../modules/cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierError } from '../modules/cj-ebay/adapters/cj-supplier.errors';
import type {
  CreateSupplierOrderInput,
  SupplierKey,
  SupplierOrderActionInput,
  SupplierOrderSnapshot,
  SupplierPayOutcome,
} from './supplier-fulfillment.types';
import { resolveCjSupplierMetadataForCreate } from './cj-order-supplier-metadata.resolver';
import { evaluateCjPayConfirmToken, evaluateCjPayExecutionSafety } from './cj-pay-safety';

type ShipTo = {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;
  phoneNumber?: string;
};

function normalizeSupplier(raw: string | null | undefined): SupplierKey | null {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'cj' || s === 'cjdropshipping') return 'cj';
  if (s === 'aliexpress') return 'aliexpress';
  return null;
}

function inferSupplierFromProductUrl(url: string | null | undefined): SupplierKey {
  const u = String(url || '').toLowerCase();
  if (u.includes('cjdropshipping.com')) return 'cj';
  return 'aliexpress';
}

function parseShipToOrThrow(shippingAddress: string): ShipTo {
  try {
    const raw = JSON.parse(String(shippingAddress || '{}')) as Record<string, unknown>;
    const fullName = String(raw.fullName || raw.name || '').trim();
    const addressLine1 = String(raw.addressLine1 || raw.street || '').trim();
    const city = String(raw.city || '').trim();
    const country = String(raw.country || raw.countryCode || '').trim();
    if (!fullName || !addressLine1 || !city || !country) {
      throw new Error('shippingAddress missing required fields');
    }
    return {
      fullName,
      addressLine1,
      addressLine2: String(raw.addressLine2 || '').trim() || undefined,
      city,
      state: String(raw.state || raw.province || '').trim() || undefined,
      zipCode: String(raw.zipCode || raw.zip || '').trim() || undefined,
      country,
      phoneNumber: String(raw.phoneNumber || raw.phone || '').trim() || undefined,
    };
  } catch (e) {
    throw new AppError(`Invalid shippingAddress JSON: ${e instanceof Error ? e.message : String(e)}`, 400);
  }
}

function asObj(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, unknown>) : {};
}

function paymentStatusFromCj(rawStatus: string): string {
  const s = String(rawStatus || '').trim().toUpperCase();
  if (!s) return 'UNKNOWN';
  if (s.includes('UNPAID')) return 'UNPAID';
  if (s.includes('PAID')) return 'PAID';
  return 'UNKNOWN';
}

/** Heuristic: CJ remote status indicates balance already settled / fulfillment in progress. */
function cjRemoteLooksPaid(status: string): boolean {
  const u = String(status || '').trim().toUpperCase();
  if (!u || u.includes('UNPAID')) return false;
  if (u.includes('PAID') && !u.includes('UNPAID')) return true;
  if (u.includes('FULFILL') || u.includes('SHIP') || u.includes('DELIVER')) return true;
  return false;
}

function mapCjError(e: unknown): never {
  if (e instanceof CjSupplierError) {
    throw new AppError(`CJ supplier error (${e.code}): ${e.message}`, e.httpStatus === 429 ? 429 : 502);
  }
  throw e instanceof AppError ? e : new AppError(e instanceof Error ? e.message : String(e), 500);
}

export class SupplierFulfillmentService {
  private async loadOrder(input: SupplierOrderActionInput) {
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new AppError('Order not found', 404);
    if (order.userId !== input.userId) throw new AppError('Order does not belong to user', 403);
    return order;
  }

  private resolveSupplier(order: {
    supplier: string | null;
    productUrl: string | null;
  }, forced?: SupplierKey): SupplierKey {
    if (forced) return forced;
    return normalizeSupplier(order.supplier) ?? inferSupplierFromProductUrl(order.productUrl);
  }

  async createSupplierOrder(input: CreateSupplierOrderInput): Promise<SupplierOrderSnapshot> {
    const order = await this.loadOrder(input);
    const supplier = this.resolveSupplier(order, input.supplier);
    if (supplier !== 'cj') {
      throw new AppError(`Supplier ${supplier} not implemented in global post-sale yet`, 400);
    }

    if (order.supplierOrderId) {
      return {
        supplier,
        supplierOrderId: order.supplierOrderId,
        internalOrderId: order.id,
        status: order.supplierStatus || 'CREATED',
        paymentStatus: order.supplierPaymentStatus || 'UNKNOWN',
        trackingNumber: order.supplierTrackingNumber || undefined,
        trackingUrl: order.supplierTrackingUrl || undefined,
        logisticName: order.supplierLogisticName || undefined,
        rawStatus: order.supplierStatus || undefined,
        syncAt: (order.supplierSyncAt || order.updatedAt).toISOString(),
        metadata: asObj(order.supplierMetadata),
      };
    }

    const shipTo = parseShipToOrThrow(order.shippingAddress);
    const mergedMeta = { ...asObj(order.supplierMetadata), ...asObj(input.metadata) };
    const resolved = await resolveCjSupplierMetadataForCreate({
      userId: order.userId,
      quantity: order.quantity,
      paypalOrderId: order.paypalOrderId,
      productId: order.productId,
      productUrl: order.productUrl,
      recommendedSupplierMeta: order.recommendedSupplierMeta,
      supplierMetadata: mergedMeta,
      incomingMetadata: input.metadata,
    });
    if (resolved) {
      mergedMeta.cj = {
        ...asObj(asObj(mergedMeta).cj),
        cjVid: resolved.cjVid,
        logisticName: resolved.logisticName,
        quantity: resolved.quantity,
        mappingConfidence: resolved.confidence,
        mappingSource: resolved.source,
      };
    }
    const cjMeta = asObj(mergedMeta.cj);
    const cjVid = String(cjMeta.cjVid || '').trim();
    const logisticName = String(cjMeta.logisticName || '').trim();
    const quantityRaw = Number(cjMeta.quantity ?? order.quantity ?? 1);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
    if (!cjVid || !logisticName) {
      throw new AppError(
        'Missing CJ metadata for createSupplierOrder: set supplierMetadata.cj (cjVid+logisticName), or persist supply/opportunity blobs, or productData.cj*, or paypalOrderId linking to cj_ebay_orders',
        400
      );
    }

    const adapter = createCjSupplierAdapter(input.userId);
    try {
      const created = await adapter.createOrder({
        idempotencyKey: `order-${order.id}`.slice(0, 50),
        logisticName,
        lines: [{ cjVid, quantity }],
        shipTo: {
          fullName: shipTo.fullName,
          addressLine1: shipTo.addressLine1,
          addressLine2: shipTo.addressLine2 || '',
          city: shipTo.city,
          state: shipTo.state || '',
          zipCode: shipTo.zipCode || '',
          country: shipTo.country,
          phoneNumber: shipTo.phoneNumber || '',
        },
        payType: 3,
        shopLogisticsType: 2,
      });

      const now = new Date();
      const supplierStatus = String(created.status || 'CREATED').trim() || 'CREATED';
      const supplierPaymentStatus = paymentStatusFromCj(supplierStatus);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          supplier,
          supplierOrderId: created.cjOrderId,
          supplierStatus,
          supplierPaymentStatus,
          supplierLogisticName: logisticName,
          supplierSyncAt: now,
          supplierMetadata: mergedMeta as Prisma.InputJsonValue,
          status: 'PURCHASED',
          errorMessage: null,
        },
      });
      logger.info('[SUPPLIER-FULFILLMENT] createSupplierOrder success', {
        orderId: order.id,
        supplier,
        supplierOrderId: created.cjOrderId,
      });
      return {
        supplier,
        supplierOrderId: created.cjOrderId,
        internalOrderId: order.id,
        status: supplierStatus,
        paymentStatus: supplierPaymentStatus,
        logisticName,
        rawStatus: supplierStatus,
        syncAt: now.toISOString(),
        metadata: asObj(created.rawSummary),
      };
    } catch (e) {
      mapCjError(e);
    }
  }

  async confirmSupplierOrder(input: SupplierOrderActionInput): Promise<SupplierOrderSnapshot> {
    const order = await this.loadOrder(input);
    const supplier = this.resolveSupplier(order);
    if (supplier !== 'cj') throw new AppError(`Supplier ${supplier} not implemented`, 400);
    if (!order.supplierOrderId) throw new AppError('No supplierOrderId; create supplier order first', 400);

    const adapter = createCjSupplierAdapter(input.userId);
    try {
      await adapter.confirmOrder(order.supplierOrderId);
      const now = new Date();
      await prisma.order.update({
        where: { id: order.id },
        data: {
          supplierStatus: 'CONFIRMED',
          supplierPaymentStatus: 'PENDING',
          supplierSyncAt: now,
          supplier: 'cj',
        },
      });
      return {
        supplier: 'cj',
        supplierOrderId: order.supplierOrderId,
        internalOrderId: order.id,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        logisticName: order.supplierLogisticName || undefined,
        rawStatus: 'CONFIRMED',
        syncAt: now.toISOString(),
        metadata: asObj(order.supplierMetadata),
      };
    } catch (e) {
      mapCjError(e);
    }
  }

  async paySupplierOrder(input: SupplierOrderActionInput): Promise<SupplierOrderSnapshot> {
    const order = await this.loadOrder(input);
    const supplier = this.resolveSupplier(order);
    if (supplier !== 'cj') throw new AppError(`Supplier ${supplier} not implemented`, 400);
    if (!order.supplierOrderId) throw new AppError('No supplierOrderId; create supplier order first', 400);

    const allowPayEnv = String(process.env.CJ_PHASE_D_ALLOW_PAY || '').trim().toLowerCase() === 'true';
    const dryRun = input.dryRun === true;
    const executePay = input.executePay === true;

    const adapter = createCjSupplierAdapter(input.userId);

    const mergePayAudit = (outcome: SupplierPayOutcome, extra?: Record<string, unknown>) => {
      const meta = asObj(order.supplierMetadata);
      const cj = asObj(meta.cj);
      const payAudit = {
        ...asObj(cj.payAudit),
        at: new Date().toISOString(),
        outcome,
        executePayRequested: executePay,
        allowPayEnv,
        dryRun,
        ...extra,
      };
      return { ...meta, cj: { ...cj, payAudit } } as Prisma.InputJsonValue;
    };

    try {
      const st = await adapter.getOrderStatus(order.supplierOrderId);
      const remoteStatus = String(st.status || '').trim();
      const remoteUpper = remoteStatus.toUpperCase();
      const alreadyPaidRemote = cjRemoteLooksPaid(remoteStatus);
      const alreadyPaidLocal = String(order.supplierPaymentStatus || '').toUpperCase() === 'PAID';

      if (alreadyPaidLocal || alreadyPaidRemote) {
        const now = new Date();
        await prisma.order.update({
          where: { id: order.id },
          data: {
            supplierStatus: remoteStatus || order.supplierStatus,
            supplierPaymentStatus: 'PAID',
            supplierSyncAt: now,
            supplierMetadata: mergePayAudit('payment_skipped_already_paid', { remoteStatus }),
          },
        });
        logger.info('[SUPPLIER-FULFILLMENT] paySupplierOrder skipped (already paid)', {
          orderId: order.id,
          supplierOrderId: order.supplierOrderId,
        });
        return {
          supplier: 'cj',
          supplierOrderId: order.supplierOrderId,
          internalOrderId: order.id,
          status: remoteStatus || order.supplierStatus || 'UNKNOWN',
          paymentStatus: 'PAID',
          logisticName: order.supplierLogisticName || undefined,
          rawStatus: remoteStatus,
          syncAt: now.toISOString(),
          metadata: { payOutcome: 'payment_skipped_already_paid' as SupplierPayOutcome, remoteStatus },
        };
      }

      const payable =
        remoteUpper.includes('UNPAID') ||
        (String(order.supplierStatus || '').toUpperCase() === 'CONFIRMED' &&
          String(order.supplierPaymentStatus || '').toUpperCase() === 'PENDING');

      if (dryRun || !executePay) {
        const now = new Date();
        const outcome: SupplierPayOutcome = dryRun
          ? 'payment_dry_run_eligibility'
          : 'payment_skipped_no_execute_flag';
        await prisma.order.update({
          where: { id: order.id },
          data: {
            supplierSyncAt: now,
            supplierMetadata: mergePayAudit(outcome, { remoteStatus, payable }),
          },
        });
        logger.info('[SUPPLIER-FULFILLMENT] paySupplierOrder dry-run / no execute', {
          orderId: order.id,
          outcome,
          payable,
        });
        return {
          supplier: 'cj',
          supplierOrderId: order.supplierOrderId,
          internalOrderId: order.id,
          status: remoteStatus || order.supplierStatus || 'UNKNOWN',
          paymentStatus: paymentStatusFromCj(remoteStatus),
          logisticName: st.logisticName || order.supplierLogisticName || undefined,
          rawStatus: remoteStatus,
          syncAt: now.toISOString(),
          metadata: {
            payOutcome: outcome,
            payable,
            remoteStatus,
            hint: 'Set executePay:true and CJ_PHASE_D_ALLOW_PAY=true for real payBalance',
          },
        };
      }

      if (!allowPayEnv) {
        const now = new Date();
        await prisma.order.update({
          where: { id: order.id },
          data: {
            supplierSyncAt: now,
            supplierMetadata: mergePayAudit('payment_blocked_guardrail', { remoteStatus, payable }),
          },
        });
        logger.warn('[SUPPLIER-FULFILLMENT] paySupplierOrder blocked by guardrail', { orderId: order.id });
        throw new AppError(
          'CJ pay blocked: set CJ_PHASE_D_ALLOW_PAY=true in environment for real payBalance (executePay was true)',
          403
        );
      }

      if (!payable) {
        const now = new Date();
        await prisma.order.update({
          where: { id: order.id },
          data: {
            supplierSyncAt: now,
            supplierMetadata: mergePayAudit('payment_ineligible_state', { remoteStatus }),
          },
        });
        throw new AppError(
          `CJ order not in a payable state (status=${remoteStatus || 'unknown'}). Confirm order and wait for UNPAID if applicable.`,
          400
        );
      }

      const tokenCheck = evaluateCjPayConfirmToken(input.payConfirmToken);
      if (tokenCheck.ok === false) {
        const now = new Date();
        await prisma.order.update({
          where: { id: order.id },
          data: {
            supplierSyncAt: now,
            supplierMetadata: mergePayAudit(tokenCheck.outcome, { reason: tokenCheck.reason }),
          },
        });
        logger.warn('[SUPPLIER-FULFILLMENT] paySupplierOrder unsafe (confirm token)', { orderId: order.id });
        throw new AppError(tokenCheck.reason, 403);
      }

      const safety = evaluateCjPayExecutionSafety({ id: order.id, price: order.price });
      if (safety.ok === false) {
        const now = new Date();
        await prisma.order.update({
          where: { id: order.id },
          data: {
            supplierSyncAt: now,
            supplierMetadata: mergePayAudit(safety.outcome, { reason: safety.reason }),
          },
        });
        logger.warn('[SUPPLIER-FULFILLMENT] paySupplierOrder unsafe (policy)', {
          orderId: order.id,
          reason: safety.reason,
        });
        throw new AppError(safety.reason, 403);
      }

      await adapter.payBalance(order.supplierOrderId);
      const now = new Date();
      await prisma.order.update({
        where: { id: order.id },
        data: {
          supplierStatus: 'FULFILLING',
          supplierPaymentStatus: 'PAID',
          supplierSyncAt: now,
          supplier: 'cj',
          supplierMetadata: mergePayAudit('payment_success', { remoteStatus }),
        },
      });
      logger.info('[SUPPLIER-FULFILLMENT] paySupplierOrder success', {
        orderId: order.id,
        supplierOrderId: order.supplierOrderId,
      });
      return {
        supplier: 'cj',
        supplierOrderId: order.supplierOrderId,
        internalOrderId: order.id,
        status: 'FULFILLING',
        paymentStatus: 'PAID',
        logisticName: order.supplierLogisticName || undefined,
        rawStatus: 'FULFILLING',
        syncAt: now.toISOString(),
        metadata: { payOutcome: 'payment_success' as SupplierPayOutcome },
      };
    } catch (e) {
      if (e instanceof AppError) throw e;
      try {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            supplierMetadata: mergePayAudit('payment_failed', {
              error: e instanceof Error ? e.message : String(e),
            }),
          },
        });
      } catch {
        /* ignore */
      }
      mapCjError(e);
    }
  }

  async getSupplierOrderStatus(input: SupplierOrderActionInput): Promise<SupplierOrderSnapshot> {
    const order = await this.loadOrder(input);
    const supplier = this.resolveSupplier(order);
    if (supplier !== 'cj') throw new AppError(`Supplier ${supplier} not implemented`, 400);
    if (!order.supplierOrderId) throw new AppError('No supplierOrderId; create supplier order first', 400);

    const adapter = createCjSupplierAdapter(input.userId);
    try {
      const st = await adapter.getOrderStatus(order.supplierOrderId);
      const now = new Date();
      await prisma.order.update({
        where: { id: order.id },
        data: {
          supplierStatus: st.status || order.supplierStatus || 'UNKNOWN',
          supplierPaymentStatus: paymentStatusFromCj(st.status),
          supplierLogisticName: st.logisticName || order.supplierLogisticName,
          supplierSyncAt: now,
          supplier: 'cj',
        },
      });
      return {
        supplier: 'cj',
        supplierOrderId: order.supplierOrderId,
        internalOrderId: order.id,
        status: st.status || 'UNKNOWN',
        paymentStatus: paymentStatusFromCj(st.status),
        trackingNumber: st.trackNumber || undefined,
        trackingUrl: st.trackingUrl || undefined,
        logisticName: st.logisticName || order.supplierLogisticName || undefined,
        rawStatus: st.status || undefined,
        syncAt: now.toISOString(),
        metadata: asObj(order.supplierMetadata),
      };
    } catch (e) {
      mapCjError(e);
    }
  }

  async getSupplierTracking(input: SupplierOrderActionInput): Promise<SupplierOrderSnapshot> {
    const order = await this.loadOrder(input);
    const supplier = this.resolveSupplier(order);
    if (supplier !== 'cj') throw new AppError(`Supplier ${supplier} not implemented`, 400);
    if (!order.supplierOrderId) throw new AppError('No supplierOrderId; create supplier order first', 400);

    const adapter = createCjSupplierAdapter(input.userId);
    try {
      const tr = await adapter.getTracking(order.supplierOrderId);
      const now = new Date();
      const trackingNumber = tr?.trackingNumber?.trim() || null;
      const trackingUrl = tr?.trackingUrl?.trim() || null;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          supplierTrackingNumber: trackingNumber,
          supplierTrackingUrl: trackingUrl,
          supplierLogisticName: tr?.carrierCode || order.supplierLogisticName,
          supplierStatus: trackingNumber ? 'SHIPPED' : order.supplierStatus,
          supplierSyncAt: now,
          supplier: 'cj',
        },
      });

      if (trackingNumber) {
        const sale = await prisma.sale.findUnique({ where: { orderId: order.id }, select: { id: true, trackingNumber: true } });
        if (sale && !sale.trackingNumber) {
          await prisma.sale.update({
            where: { id: sale.id },
            data: { trackingNumber, status: 'SHIPPED' },
          });
        }
      }

      return {
        supplier: 'cj',
        supplierOrderId: order.supplierOrderId,
        internalOrderId: order.id,
        status: trackingNumber ? 'SHIPPED' : order.supplierStatus || 'FULFILLING',
        paymentStatus: order.supplierPaymentStatus || 'UNKNOWN',
        trackingNumber: trackingNumber || undefined,
        trackingUrl: trackingUrl || undefined,
        logisticName: tr?.carrierCode || order.supplierLogisticName || undefined,
        rawStatus: tr ? 'TRACKING_AVAILABLE' : 'TRACKING_PENDING',
        syncAt: now.toISOString(),
        metadata: asObj(order.supplierMetadata),
      };
    } catch (e) {
      mapCjError(e);
    }
  }
}

export const supplierFulfillmentService = new SupplierFulfillmentService();
