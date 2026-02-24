#!/usr/bin/env tsx
/**
 * Crea o actualiza platform_config.adminPaypalEmail y usuario activo con paypalPayoutEmail.
 * Usa PAYPAL_ADMIN_EMAIL y PAYPAL_USER_EMAIL (obligatorios para payout real).
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

const ADMIN_EMAIL = (process.env.PAYPAL_ADMIN_EMAIL || process.env.ADMIN_PAYPAL_EMAIL || '').trim();
const USER_EMAIL = (process.env.PAYPAL_USER_EMAIL || process.env.USER_PAYPAL_EMAIL || '').trim();

async function main(): Promise<number> {
  if (!ADMIN_EMAIL || !USER_EMAIL) {
    console.error('[SETUP-SANDBOX] PAYPAL_ADMIN_EMAIL y PAYPAL_USER_EMAIL son obligatorios.');
    return 1;
  }

  console.log('[SETUP-SANDBOX] 1. Actualizar platform_config.adminPaypalEmail');
  await prisma.platformConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      platformCommissionPct: 10,
      adminPaypalEmail: ADMIN_EMAIL,
      updatedAt: new Date(),
    },
    update: {
      platformCommissionPct: 10,
      adminPaypalEmail: ADMIN_EMAIL,
      updatedAt: new Date(),
    },
  });
  console.log('[SETUP-SANDBOX] adminPaypalEmail =', ADMIN_EMAIL);

  console.log('[SETUP-SANDBOX] 2. Buscar usuario activo y actualizar paypalPayoutEmail');
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, username: true },
  });
  if (!user) {
    console.error('[SETUP-SANDBOX] No hay usuario activo.');
    return 1;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { paypalPayoutEmail: USER_EMAIL },
  });
  console.log('[SETUP-SANDBOX] Usuario', user.id, user.username, '-> paypalPayoutEmail =', USER_EMAIL);

  console.log('[SETUP-SANDBOX] OK');
  return 0;
}

main()
  .then((code) => {
    prisma.$disconnect();
    process.exit(code);
  })
  .catch((err) => {
    console.error(err);
    prisma.$disconnect();
    process.exit(1);
  });
