#!/usr/bin/env tsx
/**
 * Verifica el origen de las ventas: si son reales (eBay/ML) o de prueba.
 * Sale.orderId = Order.id (CUID). Order.paypalOrderId indica el origen.
 *
 * Uso: npx tsx scripts/verify-sales-origin.ts [limit]
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

async function main() {
  const limit = parseInt(process.argv[2] || '20', 10);

  const sales = await prisma.sale.findMany({
    orderBy: { id: 'desc' },
    take: limit,
    select: {
      id: true,
      orderId: true,
      userId: true,
      marketplace: true,
      salePrice: true,
      status: true,
      adminPayoutId: true,
      userPayoutId: true,
      createdAt: true,
    },
  });

  const orderIds = sales.map((s) => s.orderId);
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, paypalOrderId: true, status: true, createdAt: true },
  });
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const byOrigin: Record<string, number> = { mercadolibre: 0, ebay: 0, checkout: 0, unknown: 0, test: 0 };
  const testOrderIdPattern = /^(ORD-|TEST-|DEMO-)/i;

  console.log('\n=== Verificación Origen de Ventas ===\n');
  console.log(`Total ventas consultadas: ${sales.length}\n`);

  for (const sale of sales) {
    const order = orderMap.get(sale.orderId);
    const paypalOrderId = order?.paypalOrderId?.trim() || null;

    let origin = 'unknown';
    if (paypalOrderId) {
      if (paypalOrderId.startsWith('mercadolibre:')) origin = 'mercadolibre';
      else if (paypalOrderId.startsWith('ebay:')) origin = 'ebay';
      else if (paypalOrderId.startsWith('amazon:')) origin = 'amazon';
      else origin = 'checkout'; // PayPal ID directo
    } else if (testOrderIdPattern.test(sale.orderId)) {
      origin = 'test';
    }

    byOrigin[origin] = (byOrigin[origin] || 0) + 1;

    const ppIdDisplay = paypalOrderId ? (paypalOrderId.length > 40 ? paypalOrderId.slice(0, 40) + '...' : paypalOrderId) : 'null';
    console.log(
      `Sale ${sale.id} | orderId: ${sale.orderId.slice(0, 12)}... | marketplace: ${sale.marketplace} | paypalOrderId: ${ppIdDisplay} | origin: ${origin} | status: ${sale.status}`
    );
  }

  console.log('\n--- Resumen por origen ---');
  Object.entries(byOrigin).forEach(([k, v]) => {
    if (v > 0) console.log(`  ${k}: ${v}`);
  });

  const realCount = (byOrigin.mercadolibre || 0) + (byOrigin.ebay || 0) + (byOrigin.amazon || 0) + (byOrigin.checkout || 0);
  const testCount = byOrigin.test || 0;
  const unknownCount = byOrigin.unknown || 0;

  console.log('\n--- Conclusión ---');
  if (realCount > 0) {
    console.log(`Ventas reales (eBay/ML/Amazon/Checkout): ${realCount}`);
  }
  if (testCount > 0) {
    console.log(`Ventas de prueba (orderId ORD-/TEST-/DEMO-): ${testCount}`);
  }
  if (unknownCount > 0) {
    console.log(`Ventas sin paypalOrderId y sin patrón test: ${unknownCount} (revisar manualmente)`);
  }

  const totalSales = await prisma.sale.count();
  const payoutFailed = await prisma.sale.count({ where: { status: 'PAYOUT_FAILED' } });
  console.log(`\nTotal ventas en BD: ${totalSales} | PAYOUT_FAILED: ${payoutFailed}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
