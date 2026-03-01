#!/usr/bin/env tsx
/**
 * Borra las credenciales de aliexpress-dropshipping de la BD para forzar uso de env (rail.txt).
 * Útil cuando hay credenciales mixtas (528624 vs 522578) que causan IncompleteSignature.
 *
 * Uso: cd backend && npx tsx scripts/clear-aliexpress-dropshipping-credentials.ts
 */
import 'dotenv/config';
import { prisma } from '../src/config/database';

async function main() {
  const result = await prisma.apiCredential.deleteMany({
    where: {
      apiName: 'aliexpress-dropshipping',
    },
  });
  console.log(`[OK] Eliminadas ${result.count} credenciales de aliexpress-dropshipping`);
  console.log('     El próximo OAuth usará env (rail.txt / .env.local)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
