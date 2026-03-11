#!/usr/bin/env tsx
/**
 * Ejecuta la reparación de todos los listados de Mercado Libre (VIP67).
 * Actualiza título, descripción y atributos con datos saneados.
 *
 * Uso:
 *   cd backend && npx tsx scripts/repair-ml-listings.ts [userId]
 * Si no se pasa userId, repara listados de todos los usuarios con listados ML.
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

  console.log('\n[REPAIR-ML] Reparación de listados Mercado Libre (VIP67)\n');

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
      console.log(`Usuario ${uid} no tiene listados ML. Nada que reparar.`);
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
  let totalRepaired = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    try {
      console.log(`[REPAIR-ML] Procesando usuario ${userId}...`);
      const results = await marketplaceService.repairMercadoLibreListings(userId, undefined, 5000);
      const repaired = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      totalRepaired += repaired;
      totalFailed += failed;
      console.log(`  Reparados: ${repaired}, Fallidos: ${failed}`);
      if (failed > 0) {
        results.filter((r) => !r.success).slice(0, 5).forEach((r) => {
          console.log(`    - ${r.listingId}: ${r.error}`);
        });
        if (failed > 5) console.log(`    ... y ${failed - 5} más`);
      }
    } catch (err: any) {
      console.error(`  Error usuario ${userId}:`, err?.message || err);
      totalFailed += 1;
    }
  }

  console.log('\n[REPAIR-ML] Resumen total:', { reparados: totalRepaired, fallidos: totalFailed });
  console.log('[REPAIR-ML] Listo.\n');
  process.exit(totalFailed > 0 && totalRepaired === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
