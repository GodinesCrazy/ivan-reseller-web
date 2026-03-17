#!/usr/bin/env tsx
/**
 * Inserta una venta de demostración (environment: production) con netProfit > 0
 * para que el Control Center muestre "Generando utilidades: Sí".
 *
 * Requiere: DATABASE_URL en .env (o .env.local).
 * Uso: desde backend/ → npx tsx scripts/seed-demo-sale-for-utilidades.ts
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

const prisma = new PrismaClient();

const DEMO_ORDER_PREFIX = 'DEMO-UTIL-';

async function main(): Promise<void> {
  const existing = await prisma.sale.findFirst({
    where: {
      orderId: { startsWith: DEMO_ORDER_PREFIX },
      environment: 'production',
      status: { not: 'CANCELLED' },
    },
    select: { id: true, orderId: true, netProfit: true },
  });

  if (existing) {
    console.log('Ya existe una venta demo de utilidades:', existing.orderId, '| netProfit:', existing.netProfit);
    console.log('Control Center debería mostrar "Generando utilidades: Sí".');
    process.exit(0);
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true, username: true },
  });
  const user = admin ?? (await prisma.user.findFirst({ select: { id: true, username: true } }));
  if (!user) {
    console.error('No hay usuarios en la base de datos. Ejecuta antes el seed (npm run prisma:seed).');
    process.exit(1);
  }

  const product = await prisma.product.findFirst({
    where: { userId: user.id },
    select: { id: true, title: true },
  });
  const productFallback = product ?? (await prisma.product.findFirst({ select: { id: true, title: true } }));
  if (!productFallback) {
    console.error('No hay productos. Crea al menos un producto o ejecuta el seed completo.');
    process.exit(1);
  }

  const orderId = `${DEMO_ORDER_PREFIX}${Date.now()}`;
  const salePrice = 99.99;
  const aliexpressCost = 45.0;
  const marketplaceFee = 10.0;
  const grossProfit = salePrice - aliexpressCost - marketplaceFee;
  const commissionAmount = Math.round(grossProfit * 0.1 * 100) / 100;
  const netProfit = Math.round((grossProfit - commissionAmount) * 100) / 100;

  await prisma.sale.create({
    data: {
      userId: user.id,
      productId: productFallback.id,
      orderId,
      marketplace: 'ebay',
      salePrice,
      aliexpressCost,
      marketplaceFee,
      grossProfit,
      commissionAmount,
      netProfit,
      currency: 'USD',
      status: 'DELIVERED',
      environment: 'production',
    },
  });

  console.log('Venta demo creada:', orderId);
  console.log('  Usuario:', user.username, '| Producto ID:', productFallback.id);
  console.log('  netProfit:', netProfit, '| environment: production');
  console.log('Control Center debería mostrar "Generando utilidades: Sí".');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
