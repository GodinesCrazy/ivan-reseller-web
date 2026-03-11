#!/usr/bin/env tsx
/**
 * Verificación de cumplimiento PI en listados de Mercado Libre.
 * Obtiene título y descripción desde la API de ML y comprueba que no contengan
 * "tipo X", "símil", "réplica", "idéntico a", "igual a", etc.
 *
 * Uso:
 *   cd backend && npx tsx scripts/check-ml-compliance.ts [userId]
 * Si no se pasa userId, verifica listados de todos los usuarios con listados ML.
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

  console.log('\n[ML-COMPLIANCE] Verificación de cumplimiento PI en Mercado Libre\n');

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
      console.log(`Usuario ${uid} no tiene listados ML. Nada que verificar.`);
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
  let totalCompliant = 0;
  let totalNonCompliant = 0;

  for (const userId of userIds) {
    try {
      console.log(`[ML-COMPLIANCE] Usuario ${userId}...`);
      const items = await marketplaceService.checkMercadoLibreCompliance(userId, { limit: 500 });
      const compliant = items.filter((i) => i.compliant).length;
      const nonCompliant = items.filter((i) => !i.compliant).length;
      totalCompliant += compliant;
      totalNonCompliant += nonCompliant;
      console.log(`  Conformes: ${compliant}, No conformes: ${nonCompliant}`);
      if (nonCompliant > 0) {
        items
          .filter((i) => !i.compliant)
          .slice(0, 10)
          .forEach((i) => {
            console.log(`    - ${i.listingId}: ${i.violations.join(', ')} ${i.titleSnippet ? `| "${i.titleSnippet}..."` : ''}`);
          });
        if (nonCompliant > 10) console.log(`    ... y ${nonCompliant - 10} más`);
      }
    } catch (err: any) {
      console.error(`  Error usuario ${userId}:`, err?.message || err);
    }
  }

  console.log('\n[ML-COMPLIANCE] Resumen total:', { conformes: totalCompliant, noConformes: totalNonCompliant });
  console.log('[ML-COMPLIANCE] Listo.\n');
  process.exit(totalNonCompliant > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
