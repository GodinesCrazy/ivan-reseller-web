#!/usr/bin/env tsx
/**
 * Verifica precondiciones económicas para generación de ingresos automática.
 * Aborta con exit 1 si falta DATABASE_URL, PayPal, platform_config.adminPaypalEmail o users.paypalPayoutEmail.
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

async function main(): Promise<number> {
  const missing: string[] = [];

  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.PAYPAL_CLIENT_ID) missing.push('PAYPAL_CLIENT_ID');
  if (!process.env.PAYPAL_CLIENT_SECRET) missing.push('PAYPAL_CLIENT_SECRET');
  if (!process.env.PAYPAL_ENVIRONMENT) {
    // optional, default sandbox
  }

  if (missing.length > 0) {
    console.error('[PRECONDITIONS] Faltan variables de entorno:', missing.join(', '));
    return 1;
  }

  const pc = await prisma.platformConfig.findFirst({ orderBy: { id: 'asc' } });
  const adminEmail = pc?.adminPaypalEmail?.trim();
  if (!adminEmail) {
    console.error('[PRECONDITIONS] platform_config.adminPaypalEmail no configurado.');
    return 1;
  }
  console.log('[PRECONDITIONS] platform_config:', { platformCommissionPct: pc?.platformCommissionPct, adminPaypalEmail: adminEmail ? 'SET' : 'MISSING' });

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, username: true, paypalPayoutEmail: true },
  });
  const withPaypal = users.filter((u) => u.paypalPayoutEmail != null && u.paypalPayoutEmail.trim() !== '');
  if (withPaypal.length === 0) {
    console.error('[PRECONDITIONS] Ningún usuario activo tiene paypalPayoutEmail configurado.');
    return 1;
  }
  console.log('[PRECONDITIONS] users con paypalPayoutEmail:', withPaypal.length);

  const products = await prisma.product.findMany({
    where: { status: { in: ['APPROVED', 'PUBLISHED'] } },
    select: { id: true, title: true, status: true },
    take: 50,
  });
  console.log('[PRECONDITIONS] productos APPROVED/PUBLISHED:', products.length);

  const recentSales = await prisma.sale.findMany({
    orderBy: { id: 'desc' },
    take: 10,
    select: { id: true, orderId: true, adminPayoutId: true, userPayoutId: true },
  });
  console.log('[PRECONDITIONS] últimas 10 sales:', recentSales.length);
  const withPayouts = recentSales.filter((s) => s.adminPayoutId && s.userPayoutId);
  console.log('[PRECONDITIONS] sales con ambos payout IDs:', withPayouts.length);

  console.log('[PRECONDITIONS] OK');
  return 0;
}

main()
  .then((code) => {
    prisma.$disconnect();
    process.exit(code);
  })
  .catch((err) => {
    console.error('[PRECONDITIONS] Error:', err);
    prisma.$disconnect();
    process.exit(1);
  });
