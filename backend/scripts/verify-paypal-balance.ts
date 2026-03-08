/**
 * Script para verificar si la API de PayPal transmite el saldo.
 * Llama a getPayPalBalance y muestra el resultado crudo.
 *
 * Uso: cd backend && npm run verify:paypal-balance [userId] [sandbox|production]
 * Por defecto usa el primer usuario activo, o userId 1.
 * Por defecto usa production; pasar 'sandbox' para probar con credenciales sandbox.
 * Alternativa: PAYPAL_BALANCE_ENV=sandbox npm run verify:paypal-balance [userId]
 */

import 'dotenv/config';
import { prisma } from '../src/config/database';
import { getPayPalBalance } from '../src/services/balance-verification.service';

type EnvType = 'sandbox' | 'production';

function parseEnvironment(arg: string | undefined, envVar: string | undefined): EnvType {
  const raw = arg || envVar || 'production';
  const lower = raw.toLowerCase().trim();
  if (lower === 'sandbox' || lower === 'sb') return 'sandbox';
  return 'production';
}

async function main() {
  const userIdArg = process.argv[2];
  const envArg = process.argv[3];
  const env = parseEnvironment(envArg, process.env.PAYPAL_BALANCE_ENV);

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

  console.log(`\nVerificando saldo PayPal (${env})...\n`);

  try {
    const raw = await getPayPalBalance(userId, env);
    const fromPayPalAPI =
      raw != null &&
      'source' in raw &&
      (raw.source === 'paypal' || raw.source === 'paypal_estimated');

    console.log('Resultado getPayPalBalance(userId=%d, %s):', userId, env);
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
