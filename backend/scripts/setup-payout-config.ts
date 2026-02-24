#!/usr/bin/env tsx
/**
 * Configura platform_config.adminPaypalEmail y users.paypalPayoutEmail
 * para permitir el test real de payout.
 * Usa variables de entorno o placeholders (reemplazar por emails Sandbox reales).
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

const ADMIN_EMAIL = process.env.PAYPAL_ADMIN_EMAIL || process.env.ADMIN_PAYPAL_EMAIL || 'TU_EMAIL_PAYPAL_ADMIN@ejemplo.com';
const USER_EMAIL = process.env.PAYPAL_USER_EMAIL || process.env.USER_PAYPAL_EMAIL || 'TU_EMAIL_PAYPAL_USUARIO@ejemplo.com';

async function main() {
  console.log('[SETUP-PAYOUT] 1. Upsert platform_config');
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
  console.log('[SETUP-PAYOUT] adminPaypalEmail =', ADMIN_EMAIL);

  console.log('[SETUP-PAYOUT] 2. Verificar platform_config');
  const pc = await prisma.platformConfig.findFirst({ where: { id: 1 } });
  console.log('[SETUP-PAYOUT] platform_config:', pc);

  console.log('[SETUP-PAYOUT] 3. Buscar usuario activo y actualizar paypalPayoutEmail');
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, email: true, username: true },
  });
  if (!user) {
    console.error('[SETUP-PAYOUT] No hay usuario activo.');
    process.exit(1);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { paypalPayoutEmail: USER_EMAIL },
  });
  console.log('[SETUP-PAYOUT] Usuario', user.id, user.username, '-> paypalPayoutEmail =', USER_EMAIL);

  console.log('[SETUP-PAYOUT] 4. Verificar usuario');
  const updated = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, paypalPayoutEmail: true },
  });
  console.log('[SETUP-PAYOUT] paypalPayoutEmail IS NOT NULL:', updated?.paypalPayoutEmail != null);
}

main()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
