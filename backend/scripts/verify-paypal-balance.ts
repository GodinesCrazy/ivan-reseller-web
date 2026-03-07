/**
 * Script para verificar si la API de PayPal transmite el saldo.
 * Llama a getPayPalBalance y muestra el resultado crudo.
 *
 * Uso: cd backend && npm run verify:paypal-balance [userId]
 * Por defecto usa el primer usuario activo con paypalPayoutEmail, o userId 1.
 */

import 'dotenv/config';
import { prisma } from '../src/config/database';
import { getPayPalBalance } from '../src/services/balance-verification.service';

async function main() {
  const userIdArg = process.argv[2];
  let userId: number;

  if (userIdArg && /^\d+$/.test(userIdArg)) {
    userId = parseInt(userIdArg, 10);
  } else {
    const user = await prisma.user.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    userId = user?.id ?? 1;
    console.log(`Usuario no especificado, usando userId=${userId}`);
  }

  console.log('\nVerificando saldo PayPal (production)...\n');

  try {
    const raw = await getPayPalBalance(userId, 'production');
    const fromPayPalAPI =
      raw != null &&
      'source' in raw &&
      (raw.source === 'paypal' || raw.source === 'paypal_estimated');

    console.log('Resultado getPayPalBalance(userId=%d, production):', userId);
    console.log(JSON.stringify(raw, null, 2));
    console.log('\nfromPayPalAPI:', fromPayPalAPI);
    console.log(
      fromPayPalAPI
        ? 'La API de PayPal SI esta transmitiendo el saldo.'
        : raw != null && 'unavailableReason' in raw
          ? `PayPal API fallo: ${raw.unavailableReason}`
          : raw == null
            ? 'PayPal balance check retorno null (error o excepcion).'
            : 'PayPal API no devolvio saldo.'
    );
  } catch (err: unknown) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
