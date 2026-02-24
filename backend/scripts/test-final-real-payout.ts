#!/usr/bin/env tsx
/**
 * Prueba definitiva de payout real: Order ? createSaleFromOrder ? payout real ? verificación DB.
 * REAL_PAYOUT_SUCCESS solo si sales.adminPayoutId y sales.userPayoutId NOT NULL.
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';
import { saleService } from '../src/services/sale.service';

async function main(): Promise<number> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[FINAL-PAYOUT] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET no configurados.');
    return 1;
  }

  const user = await prisma.user.findFirst({
    where: { isActive: true, paypalPayoutEmail: { not: null } },
    select: { id: true, username: true, paypalPayoutEmail: true },
  });
  if (!user || !user.paypalPayoutEmail?.trim()) {
    console.error('[FINAL-PAYOUT] No hay usuario activo con paypalPayoutEmail.');
    return 1;
  }

  const platform = await prisma.platformConfig.findFirst({ orderBy: { id: 'asc' } });
  const adminEmail = platform?.adminPaypalEmail?.trim();
  if (!adminEmail) {
    console.error('[FINAL-PAYOUT] platform_config.adminPaypalEmail no configurado.');
    return 1;
  }

  const product = await prisma.product.findFirst({
    where: {
      userId: user.id,
      OR: [{ status: 'APPROVED' }, { status: 'PUBLISHED' }, { isPublished: true }],
    },
    select: { id: true, title: true, aliexpressPrice: true, aliexpressUrl: true },
  });
  if (!product) {
    console.error('[FINAL-PAYOUT] No hay producto válido para el usuario.');
    return 1;
  }

  const salePrice = 25;
  const costPrice = Number(product.aliexpressPrice ?? 10);
  if (costPrice <= 0 || salePrice <= costPrice) {
    console.error('[FINAL-PAYOUT] Precios insuficientes para margen (salePrice > costPrice).');
    return 1;
  }

  console.log('[FINAL-PAYOUT] Crear Order real');
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      productId: product.id,
      title: product.title,
      price: salePrice,
      currency: 'USD',
      customerName: 'Final Payout Test',
      customerEmail: 'test@test.com',
      shippingAddress: JSON.stringify({
        fullName: 'Test',
        addressLine1: '123 St',
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

  console.log('[FINAL-PAYOUT] Marcar PURCHASED y ejecutar createSaleFromOrder (payout real)');
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'PURCHASED', aliexpressOrderId: 'FINAL_PAYOUT_TEST', errorMessage: null },
  });
  const result = await saleService.createSaleFromOrder(orderId);
  if (!result) {
    console.error('[FINAL-PAYOUT] createSaleFromOrder retornó null.');
    return 1;
  }

  const sale = await prisma.sale.findFirst({
    where: { orderId },
    select: { id: true, orderId: true, adminPayoutId: true, userPayoutId: true, status: true },
  });
  if (!sale) {
    console.error('[FINAL-PAYOUT] No se encontró Sale con orderId:', orderId);
    return 1;
  }

  const adminNotNull = sale.adminPayoutId != null && sale.adminPayoutId.trim() !== '';
  const userNotNull = sale.userPayoutId != null && sale.userPayoutId.trim() !== '';

  if (adminNotNull && userNotNull) {
    console.log('REAL_PAYOUT_SUCCESS');
    console.log('[REAL_PAYOUT_EXECUTED] saleId:', sale.id, 'adminPayoutId:', sale.adminPayoutId, 'userPayoutId:', sale.userPayoutId);
    return 0;
  }

  console.error('[FINAL-PAYOUT] Payout incompleto. adminPayoutId:', sale.adminPayoutId ?? 'null', 'userPayoutId:', sale.userPayoutId ?? 'null');
  return 1;
}

main()
  .then((code) => {
    prisma.$disconnect();
    process.exit(code);
  })
  .catch((err) => {
    console.error('[FINAL-PAYOUT] Error:', err);
    prisma.$disconnect();
    process.exit(1);
  });
