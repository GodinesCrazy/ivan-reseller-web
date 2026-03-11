#!/usr/bin/env tsx
/**
 * Cierra en Mercado Libre todas las publicaciones del usuario (o de todos los usuarios)
 * y las elimina de la base de datos, dejando el software como si no se hubieran publicado.
 * Los productos que se queden sin ningún listing pasan a APPROVED y isPublished: false.
 *
 * Uso:
 *   cd backend && npx tsx scripts/ml-bulk-close-all.ts [userId]
 * Si no se pasa userId, cierra todos los listados ML de todos los usuarios con listados ML.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  const userIdArg = process.argv[2];

  const { prisma } = await import('../src/config/database');
  const { MarketplaceService } = await import('../src/services/marketplace.service');

  console.log('\n[ML-BULK-CLOSE-ALL] Cerrar todas las publicaciones ML y eliminarlas del software\n');

  let userIds: number[];

  if (userIdArg) {
    const uid = parseInt(userIdArg, 10);
    if (isNaN(uid)) {
      console.error('userId debe ser un número');
      process.exit(1);
    }
    const count = await prisma.marketplaceListing.count({
      where: { userId: uid, marketplace: 'mercadolibre' },
    });
    if (count === 0) {
      console.log(`Usuario ${uid} no tiene listados ML. Nada que cerrar.`);
      process.exit(0);
    }
    userIds = [uid];
    console.log(`Usuario: ${uid} (${count} listados ML)\n`);
  } else {
    const rows = await prisma.marketplaceListing.findMany({
      where: { marketplace: 'mercadolibre' },
      select: { userId: true },
      distinct: ['userId'],
    });
    userIds = [...new Set(rows.map((r) => r.userId))];
    if (userIds.length === 0) {
      console.log('No hay listados ML en la base de datos.');
      process.exit(0);
    }
    console.log(`Usuarios con listados ML: ${userIds.join(', ')}\n`);
  }

  const marketplaceService = new MarketplaceService();
  let totalClosed = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    try {
      console.log(`[ML-BULK-CLOSE-ALL] Procesando usuario ${userId}...`);
      const result = await marketplaceService.mlBulkCloseAndSync(userId, {});
      totalClosed += result.closed;
      totalFailed += result.failed;
      console.log(`  Cerrados en ML y eliminados de BD: ${result.closed}, Fallidos: ${result.failed}, Productos actualizados a APPROVED: ${result.productIdsUpdated.length}`);
      if (result.errors.length > 0) {
        result.errors.slice(0, 5).forEach((e) => console.log(`    - ${e.listingId}: ${e.error}`));
        if (result.errors.length > 5) console.log(`    ... y ${result.errors.length - 5} más`);
      }
    } catch (err: any) {
      console.error(`  Error usuario ${userId}:`, err?.message || err);
    }
  }

  console.log('\n[ML-BULK-CLOSE-ALL] Resumen total:', { cerrados: totalClosed, fallidos: totalFailed });
  console.log('[ML-BULK-CLOSE-ALL] Listo.\n');
  process.exit(totalFailed > 0 && totalClosed === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
