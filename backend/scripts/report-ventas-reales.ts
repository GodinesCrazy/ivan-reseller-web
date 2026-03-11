#!/usr/bin/env tsx
/**
 * Diagnóstico: ¿Las ventas son reales? (compra y envío automático ejecutado)
 * Indica: Sale.status, trackingNumber, Order.status, aliexpressOrderId, PurchaseLog
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import { prisma } from '../src/config/database';

config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

async function main() {
  const sales = await prisma.sale.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      orderId: true,
      marketplace: true,
      status: true,
      trackingNumber: true,
      isCompleteCycle: true,
      environment: true,
      salePrice: true,
      createdAt: true,
    },
  });

  const orders = await prisma.order.findMany({
    where: { id: { in: sales.map((s) => s.orderId).filter(Boolean) } },
    select: {
      id: true,
      status: true,
      aliexpressOrderId: true,
      paypalOrderId: true,
    },
  });
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const purchaseLogs = await prisma.purchaseLog.findMany({
    where: { saleId: { in: sales.map((s) => s.id).filter(Boolean) } },
    select: { saleId: true, status: true, success: true, supplierOrderId: true, trackingNumber: true },
  });
  const logsBySale = new Map<number, (typeof purchaseLogs)[0][]>();
  for (const pl of purchaseLogs) {
    if (pl.saleId) {
      const arr = logsBySale.get(pl.saleId) ?? [];
      arr.push(pl);
      logsBySale.set(pl.saleId, arr);
    }
  }

  console.log('\n--- Diagnóstico: ¿Ventas reales? (compra + envío automático) ---\n');

  let realCount = 0;
  let notRealCount = 0;

  for (const s of sales) {
    const order = orderMap.get(s.orderId);
    const pls = logsBySale.get(s.id) ?? [];

    const SIMULATED_IDS = ['SIMULATED_ORDER_ID', 'TEST_SIMULATED', 'REAL_PAYOUT_TEST', 'FINAL_PAYOUT_TEST'];
    const hasRealPurchase =
      order?.aliexpressOrderId &&
      !SIMULATED_IDS.includes(order.aliexpressOrderId) &&
      !order.aliexpressOrderId.toUpperCase().includes('SIMULAT') &&
      !order.aliexpressOrderId.toUpperCase().includes('TEST');
    const hasTracking = !!(s.trackingNumber || pls.some((p) => p.trackingNumber));
    const orderPurchased = order?.status === 'PURCHASED';
    const plSuccess = pls.some((p) => p.success && p.supplierOrderId);

    const isReal = hasRealPurchase || orderPurchased || plSuccess;
    if (isReal) realCount++;
    else notRealCount++;

    console.log(`Sale #${s.id} | ${s.marketplace} | env: ${s.environment}`);
    console.log(`  status: ${s.status} | tracking: ${s.trackingNumber ?? 'null'} | isCompleteCycle: ${s.isCompleteCycle}`);
    console.log(`  Order: ${order ? `status=${order.status}, aliexpressOrderId=${order.aliexpressOrderId ?? 'null'}` : 'NO ENCONTRADA'}`);
    console.log(`  PurchaseLogs: ${pls.length} | ${pls.map((p) => `status=${p.status} success=${p.success} supplierOrderId=${p.supplierOrderId ?? 'null'}`).join('; ') || 'ninguno'}`);
    console.log(`  ► ${isReal ? 'REAL (compra/envió ejecutado)' : 'NO REAL (solo registro de venta, sin compra automática)'}`);
    console.log('');
  }

  console.log('--- Resumen ---');
  console.log(`Total ventas: ${sales.length}`);
  console.log(`Reales (compra+envío automático): ${realCount}`);
  console.log(`No reales (solo registro): ${notRealCount}`);
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
