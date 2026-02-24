#!/usr/bin/env tsx
/**
 * Verifica el ciclo desencadenado por el frontend (misma lógica que capture-order + fulfillOrder).
 * 1) Obtiene usuario activo con paypalPayoutEmail y producto válido.
 * 2) Crea Order en DB como lo haría capture-order (userId, productId, PAID).
 * 3) Llama orderFulfillmentService.fulfillOrder(orderId).
 * 4) Si fulfillment devuelve PURCHASED, comprueba Sale con adminPayoutId y userPayoutId.
 * 5) FRONTEND_CYCLE_SUCCESS solo si Sale existe y ambos payout IDs no son null.
 *
 * Nota: fulfillOrder solo llega a PURCHASED cuando la compra en AliExpress (o proveedor)
 * devuelve un orderId real. Sin integración AliExpress, fulfillment puede fallar y el script
 * termina con exit 1 (esperado en entorno sin proveedor).
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';
import { orderFulfillmentService } from '../src/services/order-fulfillment.service';

async function main(): Promise<number> {
  const user = await prisma.user.findFirst({
    where: { isActive: true, paypalPayoutEmail: { not: null } },
    select: { id: true, username: true },
  });
  if (!user) {
    console.error('[FRONTEND-CYCLE] No hay usuario activo con paypalPayoutEmail.');
    return 1;
  }

  const product = await prisma.product.findFirst({
    where: {
      userId: user.id,
      OR: [{ status: 'APPROVED' }, { status: 'PUBLISHED' }, { isPublished: true }],
    },
    select: { id: true, title: true, aliexpressUrl: true, aliexpressPrice: true },
  });
  if (!product?.aliexpressUrl) {
    console.error('[FRONTEND-CYCLE] No hay producto válido con aliexpressUrl.');
    return 1;
  }

  const price = 25;
  const shippingStr = JSON.stringify({
    fullName: 'Test Customer',
    addressLine1: '123 Test St',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
    country: 'US',
  });

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      productId: product.id,
      title: product.title,
      price,
      currency: 'USD',
      customerName: 'Test Customer',
      customerEmail: 'test@test.com',
      shippingAddress: shippingStr,
      status: 'PAID',
      paypalOrderId: `TEST_FRONTEND_${Date.now()}`,
      productUrl: product.aliexpressUrl,
    },
  });

  const fulfill = await orderFulfillmentService.fulfillOrder(order.id);
  if (fulfill.status !== 'PURCHASED') {
    console.error('[FRONTEND-CYCLE] Fulfillment no llegó a PURCHASED.', {
      status: fulfill.status,
      error: fulfill.error,
    });
    return 1;
  }

  const sale = await prisma.sale.findFirst({
    where: { orderId: order.id },
    select: { id: true, adminPayoutId: true, userPayoutId: true },
  });
  if (!sale) {
    console.error('[FRONTEND-CYCLE] No se encontró Sale para orderId:', order.id);
    return 1;
  }
  const hasAdmin = sale.adminPayoutId != null && sale.adminPayoutId.trim() !== '';
  const hasUser = sale.userPayoutId != null && sale.userPayoutId.trim() !== '';
  if (!hasAdmin || !hasUser) {
    console.error('[FRONTEND-CYCLE] Sale sin payout IDs.', {
      adminPayoutId: sale.adminPayoutId,
      userPayoutId: sale.userPayoutId,
    });
    return 1;
  }

  console.log('FRONTEND_CYCLE_SUCCESS');
  console.log('[FRONTEND-CYCLE] orderId:', order.id, 'saleId:', sale.id, 'adminPayoutId:', sale.adminPayoutId, 'userPayoutId:', sale.userPayoutId);
  return 0;
}

main()
  .then((code) => {
    prisma.$disconnect();
    process.exit(code);
  })
  .catch((err) => {
    console.error('[FRONTEND-CYCLE] Error:', err);
    prisma.$disconnect();
    process.exit(1);
  });
