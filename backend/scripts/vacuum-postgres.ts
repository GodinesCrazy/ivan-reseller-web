/**
 * Ejecuta VACUUM ANALYZE en la base de datos PostgreSQL.
 * Uso: mantenimiento de capacidad (recuperar espacio, actualizar estadísticas).
 * Ejecutar con: npx tsx scripts/vacuum-postgres.ts
 * En Railway: railway run npx tsx scripts/vacuum-postgres.ts (desde backend, con DATABASE_URL)
 *
 * Nota: VACUUM no puede ejecutarse dentro de una transacción. Si falla con
 * "cannot run inside a transaction block", ejecutar manualmente con psql:
 *   psql $DATABASE_URL -c "VACUUM ANALYZE;"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[VACUUM] Iniciando VACUUM ANALYZE...');
  const start = Date.now();

  try {
    await prisma.$executeRawUnsafe('VACUUM ANALYZE');
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[VACUUM] VACUUM ANALYZE completado correctamente en ${elapsed}s.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[VACUUM] Error:', message);
    if (message.includes('transaction')) {
      console.error(
        '[VACUUM] VACUUM no puede ejecutarse dentro de una transacción. Ejecuta manualmente: psql $DATABASE_URL -c "VACUUM ANALYZE;"'
      );
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
