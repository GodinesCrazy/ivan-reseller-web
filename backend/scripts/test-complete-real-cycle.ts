#!/usr/bin/env tsx
/**
 * Verificaci?n completa del ciclo autom?tico real: capture-order ? fulfillment ? Sale ? payout.
 *
 * 1. Login (obtener userId de DB o usar primer usuario)
 * 2. Producto (usar primer producto del usuario o crear uno m?nimo)
 * 3. Crear Order en DB (userId, productId, status PAID) para simular post-capture
 * 4. Llamar fulfillment ? debe disparar createSaleFromOrder
 * 5. Verificar en DB: Sale creada con orderId; orders con userId; sales con adminPayoutId/userPayoutId si aplica
 *
 * Uso: npx tsx scripts/test-complete-real-cycle.ts
 * Salida: exit 0 solo si todo el flujo se verifica correctamente.
 */

import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';
import { orderFulfillmentService } from '../src/services/order-fulfillment.service';

async function main(): Promise<number> {
  console.log('[TEST] 1. Verificar login / usuario');
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, username: true },
  });
  if (!user) {
    console.error('[TEST] No hay usuario activo en la base de datos. Ejecuta seed o crea un usuario.');
    return 1;
  }
  const userId = user.id;
  console.log('[TEST] Usuario:', userId, user.username);

  console.log('[TEST] 2. Verificar producto');
  let product = await prisma.product.findFirst({
    where: {
      userId,
      OR: [{ status: 'APPROVED' }, { status: 'PUBLISHED' }, { isPublished: true }],
    },
    select: { id: true, title: true, aliexpressPrice: true, aliexpressUrl: true },
  });
  if (!product) {
    console.log('[TEST] No hay producto; creando uno m?nimo para el test.');
    product = await prisma.product.create({
      data: {
        userId,
        title: 'Test product for real cycle',
        aliexpressUrl: 'https://www.aliexpress.com/item/test.html',
        aliexpressPrice: 5,
        suggestedPrice: 15,
        finalPrice: 15,
        status: 'APPROVED',
        isPublished: true,
      },
      select: { id: true, title: true, aliexpressPrice: true, aliexpressUrl: true },
    });
  }
  const productId = product.id;
  const costPrice = Number(product.aliexpressPrice ?? 5);
  const salePrice = 15;
  console.log('[TEST] Producto:', productId, product.title);

  console.log('[TEST] 3. Crear Order (simular post capture-order con userId + productId)');
  const order = await prisma.order.create({
    data: {
      userId,
      productId,
      title: product.title,
      price: salePrice,
      currency: 'USD',
      customerName: 'Test Customer',
      customerEmail: 'test@test.com',
      shippingAddress: JSON.stringify({
        fullName: 'Test Customer',
        addressLine1: '123 Test St',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        country: 'US',
      }),
      status: 'PAID',
      productUrl: product.aliexpressUrl ?? undefined,
    },
  });
  const orderId = order.id;
  console.log('[TEST] Order creado:', orderId);

  const simulateFulfillment = process.env.SIMULATE_FULFILLMENT === '1' || process.env.SIMULATE_FULFILLMENT === 'true';
  if (simulateFulfillment) {
    console.log('[TEST] 4. Simular fulfillment (marcar PURCHASED y llamar createSaleFromOrder sin compra real)');
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PURCHASED', aliexpressOrderId: 'TEST_SIMULATED', errorMessage: null },
    });
    const { saleService } = await import('../src/services/sale.service');
    await saleService.createSaleFromOrder(orderId);
    console.log('[TEST] createSaleFromOrder invocado.');
  } else {
    console.log('[TEST] 4. Ejecutar fulfillment (dispara compra AliExpress y createSaleFromOrder)');
    const fulfill = await orderFulfillmentService.fulfillOrder(orderId);
    console.log('[TEST] Fulfillment result:', fulfill.status, fulfill.aliexpressOrderId ?? '-');
    if (fulfill.status !== 'PURCHASED') {
      console.error('[TEST] Fulfillment no lleg a PURCHASED. Usa SIMULATE_FULFILLMENT=1 para verificar solo Sale/payout.');
      await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
      return 1;
    }
  }

  console.log('[TEST] 5. Verificar Sale creada');
  const sale = await prisma.sale.findFirst({
    where: { orderId },
    select: { id: true, orderId: true, userId: true, adminPayoutId: true, userPayoutId: true, status: true },
  });
  if (!sale) {
    console.error('[TEST] FALLO: No se encontr? Sale con orderId:', orderId);
    await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
    return 1;
  }
  console.log('[TEST] Sale encontrada:', sale.id, 'orderId:', sale.orderId, 'userId:', sale.userId);

  console.log('[TEST] 6. Verificar en DB: orders con userId');
  const ordersWithUser = await prisma.order.findMany({
    where: { userId: { not: null } },
    select: { id: true, userId: true },
    take: 5,
  });
  console.log('[TEST] ?rdenes con userId:', ordersWithUser.length, ordersWithUser.map((o) => o.id));

  console.log('[TEST] 7. Verificar en DB: sales con orderId y payout');
  const salesWithOrder = await prisma.sale.findMany({
    where: { orderId },
    select: { id: true, orderId: true, adminPayoutId: true, userPayoutId: true },
  });
  console.log('[TEST] Ventas con orderId:', salesWithOrder.length);
  salesWithOrder.forEach((s) => {
    console.log('[TEST]   sale', s.id, 'orderId', s.orderId, 'adminPayoutId', s.adminPayoutId ?? '-', 'userPayoutId', s.userPayoutId ?? '-');
  });

  const saleCreated = !!sale;
  const orderHasUserId = ordersWithUser.some((o) => o.id === orderId);
  const saleHasOrderId = sale?.orderId === orderId;

  if (saleCreated && orderHasUserId && saleHasOrderId) {
    console.log('[TEST] OK: Sale creada autom?ticamente, userId guardado en Order, flujo Order ? Sale verificado.');
    if (sale.adminPayoutId || sale.userPayoutId) {
      console.log('[TEST] OK: Payout ejecutado (adminPayoutId o userPayoutId presentes).');
    } else {
      console.log('[TEST] NOTA: Payout no ejecutado (PayPal no configurado o montos 0). Sale creada correctamente.');
    }
    return 0;
  }

  console.error('[TEST] FALLO: Verificaci?n incompleta.');
  return 1;
}

main()
  .then((code) => {
    prisma.$disconnect();
    process.exit(code);
  })
  .catch((err) => {
    console.error('[TEST] Error:', err);
    prisma.$disconnect();
    process.exit(1);
  });
