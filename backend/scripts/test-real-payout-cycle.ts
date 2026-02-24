#!/usr/bin/env tsx
/**
 * Verificaciùn REAL del ciclo de payout PayPal (sin mocks).
 * Order ? Sale ? Commission ? PayPal payout admin ? PayPal payout user
 *
 * Requiere:
 * - Usuario activo con paypalPayoutEmail
 * - PlatformConfig con adminPaypalEmail
 * - PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENVIRONMENT
 *
 * Exit 0 solo si sales.adminPayoutId != null y sales.userPayoutId != null.
 */

import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';
import { saleService } from '../src/services/sale.service';

async function main(): Promise<number> {
  console.log('[REAL-PAYOUT] 1. Verificar variables PayPal');
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
  if (!clientId || !clientSecret) {
    console.error('[REAL-PAYOUT] PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET no configurados.');
    return 1;
  }
  console.log('[REAL-PAYOUT] PayPal env OK (environment:', environment, ')');

  console.log('[REAL-PAYOUT] 2. Usuario activo con paypalPayoutEmail');
  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      paypalPayoutEmail: { not: null },
    },
    select: { id: true, username: true, paypalPayoutEmail: true },
  });
  if (!user || !user.paypalPayoutEmail?.trim()) {
    console.error('[REAL-PAYOUT] No hay usuario activo con paypalPayoutEmail. Configùralo en Admin o DB.');
    return 1;
  }
  const userId = user.id;
  console.log('[REAL-PAYOUT] Usuario:', userId, user.username, 'email:', user.paypalPayoutEmail);

  console.log('[REAL-PAYOUT] 3. PlatformConfig adminPaypalEmail');
  const platform = await prisma.platformConfig.findFirst({ orderBy: { id: 'asc' } });
  const adminEmail = platform?.adminPaypalEmail?.trim();
  if (!adminEmail) {
    console.error('[REAL-PAYOUT] PlatformConfig.adminPaypalEmail no configurado.');
    return 1;
  }
  console.log('[REAL-PAYOUT] Admin PayPal:', adminEmail);

  console.log('[REAL-PAYOUT] 4. Producto vùlido (APPROVED/PUBLISHED)');
  const product = await prisma.product.findFirst({
    where: {
      userId,
      OR: [{ status: 'APPROVED' }, { status: 'PUBLISHED' }, { isPublished: true }],
    },
    select: { id: true, title: true, aliexpressPrice: true, aliexpressUrl: true },
  });
  if (!product) {
    console.error('[REAL-PAYOUT] No hay producto vùlido para el usuario.');
    return 1;
  }
  const productId = product.id;
  const salePrice = 25;
  const costPrice = Number(product.aliexpressPrice ?? 10);
  console.log('[REAL-PAYOUT] Producto:', productId, product.title);

  console.log('[REAL-PAYOUT] 5. Crear Order (userId, productId, PAID)');
  const order = await prisma.order.create({
    data: {
      userId,
      productId,
      title: product.title,
      price: salePrice,
      currency: 'USD',
      customerName: 'Real Payout Test',
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
  console.log('[REAL-PAYOUT] Order creado:', orderId);

  console.log('[REAL-PAYOUT] 6. Marcar PURCHASED y ejecutar createSaleFromOrder (payout real)');
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'PURCHASED', aliexpressOrderId: 'REAL_PAYOUT_TEST', errorMessage: null },
  });
  const result = await saleService.createSaleFromOrder(orderId);
  if (!result) {
    console.error('[REAL-PAYOUT] createSaleFromOrder retornù null.');
    return 1;
  }
  console.log('[REAL-PAYOUT] Sale creada:', result.id);

  console.log('[REAL-PAYOUT] 7. Verificar en DB: adminPayoutId y userPayoutId');
  const sale = await prisma.sale.findFirst({
    where: { orderId },
    select: { id: true, orderId: true, adminPayoutId: true, userPayoutId: true, status: true },
  });
  if (!sale) {
    console.error('[REAL-PAYOUT] No se encontrù Sale con orderId:', orderId);
    return 1;
  }

  const hasAdmin = sale.adminPayoutId != null && sale.adminPayoutId.trim() !== '';
  const hasUser = sale.userPayoutId != null && sale.userPayoutId.trim() !== '';

  if (hasAdmin && hasUser) {
    console.log('REAL PAYOUT SUCCESS');
    console.log('[REAL-PAYOUT] saleId:', sale.id, 'adminPayoutId:', sale.adminPayoutId, 'userPayoutId:', sale.userPayoutId);
    return 0;
  }

  console.error('[REAL-PAYOUT] Payout incompleto. adminPayoutId:', sale.adminPayoutId ?? 'null', 'userPayoutId:', sale.userPayoutId ?? 'null');
  return 1;
}

main()
  .then((code) => {
    prisma.$disconnect();
    process.exit(code);
  })
  .catch((err) => {
    console.error('[REAL-PAYOUT] Error:', err);
    prisma.$disconnect();
    process.exit(1);
  });
