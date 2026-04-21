/**
 * Phase D smoke (real): generic supplier post-sale flow over internal Order model.
 *
 * Flow:
 *  1) Build a temporary Order (supplier=cj) from latest mapped cj_ebay_order metadata.
 *  2) createSupplierOrder (CJ createOrderV2, payType=3)
 *  3) confirmSupplierOrder
 *  4) optional paySupplierOrder (guarded by CJ_PHASE_D_ALLOW_PAY=true)
 *  5) getSupplierOrderStatus
 *  6) getSupplierTracking
 */
import 'dotenv/config';
import { prisma } from '../src/config/database';
import { supplierFulfillmentService } from '../src/services/supplier-fulfillment.service';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';

function toShipAddressJson(buyerPayload: unknown): string {
  const p = buyerPayload as Record<string, unknown> | null | undefined;
  const a = (p?.shippingAddress || {}) as Record<string, unknown>;
  const out = {
    fullName: String(a.fullName || p?.buyerName || 'Buyer').trim(),
    addressLine1: String(a.addressLine1 || '').trim(),
    addressLine2: String(a.addressLine2 || '').trim(),
    city: String(a.city || '').trim(),
    state: String(a.state || '').trim(),
    zipCode: String(a.zipCode || '').trim(),
    country: String(a.country || 'US').trim(),
    phoneNumber: String(a.phoneNumber || '').trim(),
  };
  return JSON.stringify(out);
}

async function main(): Promise<void> {
  const allowPay = String(process.env.CJ_PHASE_D_ALLOW_PAY || '').trim().toLowerCase() === 'true';
  const mapped = await prisma.cjEbayOrder.findFirst({
    where: {
      cjOrderId: { not: null },
      userId: { gt: 0 },
      variant: { isNot: null },
      listing: { isNot: null },
    },
    include: {
      variant: { select: { cjVid: true } },
      listing: { include: { shippingQuote: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!mapped || !mapped.variant?.cjVid || !mapped.listing?.shippingQuote?.serviceName) {
    const userId = Math.max(1, parseInt(process.env.CJ_SMOKE_USER_ID || '1', 10) || 1);
    const adapter = createCjSupplierAdapter(userId);
    const keyword = String(process.env.CJ_PHASE_D_SEARCH_KEYWORD || 'usb').trim();
    const list = await adapter.searchProducts({ keyword, page: 1, pageSize: 10 });
    let cjVid = '';
    let logisticName = '';
    for (const item of list) {
      const pid = String(item.cjProductId || '').trim();
      if (!pid) continue;
      try {
        const detail = await adapter.getProductById(pid);
        const withVid = detail.variants.filter((v) => String(v.cjVid || '').trim());
        if (withVid.length !== 1) continue;
        const selectedVid = String(withVid[0].cjVid || '').trim();
        if (!selectedVid) continue;
        const quoted = await adapter.quoteShippingToUsReal({
          variantId: selectedVid,
          quantity: 1,
          destPostalCode: process.env.CJ_PHASE_D_TEST_ZIP || '90001',
        });
        if (quoted.quote.method) {
          cjVid = selectedVid;
          logisticName = quoted.quote.method;
          break;
        }
      } catch {
        // keep scanning candidates
      }
    }
    if (!cjVid || !logisticName) {
      console.error('[phase-d-smoke] NO-GO: could not auto-discover single-variant cjVid + logisticName');
      process.exit(2);
    }

    const shippingAddress = JSON.stringify({
      fullName: process.env.CJ_PHASE_D_TEST_FULL_NAME || 'Phase D Smoke Buyer',
      addressLine1: process.env.CJ_PHASE_D_TEST_ADDR1 || '123 Main St',
      addressLine2: process.env.CJ_PHASE_D_TEST_ADDR2 || '',
      city: process.env.CJ_PHASE_D_TEST_CITY || 'Los Angeles',
      state: process.env.CJ_PHASE_D_TEST_STATE || 'CA',
      zipCode: process.env.CJ_PHASE_D_TEST_ZIP || '90001',
      country: process.env.CJ_PHASE_D_TEST_COUNTRY || 'US',
      phoneNumber: process.env.CJ_PHASE_D_TEST_PHONE || '0000000000',
    });
    const order = await prisma.order.create({
      data: {
        userId,
        title: `Phase D CJ Smoke ${new Date().toISOString()}`,
        price: 1,
        currency: 'USD',
        customerName: 'Phase D Smoke',
        customerEmail: 'phase-d-smoke@example.com',
        shippingAddress,
        status: 'PAID',
        supplier: 'cj',
        supplierMetadata: {
          cj: {
            cjVid,
            logisticName,
            quantity: 1,
          },
        },
        paypalOrderId: `phase-d-cj:fallback:${Date.now()}`,
      },
      select: { id: true, userId: true },
    });
    console.log('[phase-d-smoke] using listing fallback, temp order:', order.id);
    await runFlow(order.id, userId, allowPay);
    return;
  }

  const shippingAddress = toShipAddressJson(mapped.buyerPayload);
  const userId = mapped.userId;
  const quantity = Math.max(1, mapped.lineQuantity || 1);
  const order = await prisma.order.create({
    data: {
      userId,
      title: `Phase D CJ Smoke ${new Date().toISOString()}`,
      price: mapped.totalUsd || 1,
      currency: 'USD',
      customerName: 'Phase D Smoke',
      customerEmail: 'phase-d-smoke@example.com',
      shippingAddress,
      status: 'PAID',
      supplier: 'cj',
      supplierMetadata: {
        cj: {
          cjVid: mapped.variant.cjVid,
          logisticName: mapped.listing.shippingQuote.serviceName,
          quantity,
        },
      },
      paypalOrderId: `phase-d-cj:${mapped.ebayOrderId}:${Date.now()}`,
    },
    select: { id: true, userId: true },
  });

  console.log('[phase-d-smoke] temp order created:', order.id);

  await runFlow(order.id, userId, allowPay);
}

async function runFlow(orderId: string, userId: number, allowPay: boolean): Promise<void> {
  const created = await supplierFulfillmentService.createSupplierOrder({
    orderId,
    userId,
    supplier: 'cj',
  });
  console.log('[phase-d-smoke] createSupplierOrder OK:', created.supplierOrderId);

  const confirmed = await supplierFulfillmentService.confirmSupplierOrder({
    orderId,
    userId,
  });
  console.log('[phase-d-smoke] confirmSupplierOrder OK:', confirmed.status);

  if (allowPay) {
    const paid = await supplierFulfillmentService.paySupplierOrder({
      orderId,
      userId,
      executePay: true,
      dryRun: false,
    });
    console.log('[phase-d-smoke] paySupplierOrder OK:', paid.paymentStatus, paid.metadata);
  } else {
    const dry = await supplierFulfillmentService.paySupplierOrder({
      orderId,
      userId,
      dryRun: true,
      executePay: false,
    });
    console.log('[phase-d-smoke] paySupplierOrder DRY-RUN (no charge):', dry.metadata);
  }

  const status = await supplierFulfillmentService.getSupplierOrderStatus({
    orderId,
    userId,
  });
  console.log('[phase-d-smoke] getSupplierOrderStatus:', status.status, 'payment:', status.paymentStatus);

  const tracking = await supplierFulfillmentService.getSupplierTracking({
    orderId,
    userId,
  });
  console.log(
    '[phase-d-smoke] getSupplierTracking:',
    tracking.trackingNumber ? `tracking=${tracking.trackingNumber}` : 'pending'
  );

  console.log('[phase-d-smoke] GO: create/confirm/status/tracking via neutral supplier layer');
}

void main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('[phase-d-smoke] failed:', e instanceof Error ? e.message : String(e));
    await prisma.$disconnect();
    process.exit(1);
  });
