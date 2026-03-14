#!/usr/bin/env tsx
/**
 * Despublica TODOS los listings en eBay y Mercado Libre del usuario (o de todos los usuarios si se pasa "all").
 * Por errores de cálculo de oportunidades (precio, políticas), se usa para retirar publicaciones.
 *
 * Uso:
 *   cd backend && npx tsx scripts/close-all-ebay-ml.ts <userId>         # eBay desde BD, ML desde API
 *   cd backend && npx tsx scripts/close-all-ebay-ml.ts all
 *   cd backend && npx tsx scripts/close-all-ebay-ml.ts all --from-api  # eBay desde API (lento, 7k+ SKUs)
 * userId: numérico. "all" = todos los usuarios. --from-api = eBay desde API (más lento pero completo).
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import { prisma } from '../src/config/database';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function runForUser(
  userId: number,
  marketplaceService: InstanceType<typeof import('../src/services/marketplace.service').MarketplaceService>
): Promise<{ closed: number; failed: number }> {
  let totalClosed = 0;
  let totalFailed = 0;

  const useEbayFromApi = process.argv.includes('--from-api');
  try {
    const ebayResult = useEbayFromApi
      ? await marketplaceService.ebayCloseAllFromApi(userId)
      : await marketplaceService.ebayBulkCloseAndSync(userId);
    console.log(`  eBay: cerrados ${ebayResult.closed}, fallidos ${ebayResult.failed}`);
    if (ebayResult.errors.length > 0) {
      ebayResult.errors.slice(0, 5).forEach((e: any) => console.log(`    - ${e.sku ?? e.listingId}: ${e.error}`));
      if (ebayResult.errors.length > 3) console.log(`    ... y ${ebayResult.errors.length - 3} más`);
    }
    totalClosed += ebayResult.closed;
    totalFailed += ebayResult.failed;
  } catch (err: any) {
    console.error('  eBay error:', err?.message || err);
    totalFailed++;
  }

  try {
    const mlResult = await marketplaceService.mlCloseAllFromApi(userId);
    console.log(`  Mercado Libre: cerrados ${mlResult.closed}, fallidos ${mlResult.failed}`);
    if (mlResult.errors.length > 0) {
      mlResult.errors.slice(0, 3).forEach((e: any) => console.log(`    - ${e.listingId}: ${e.error}`));
      if (mlResult.errors.length > 3) console.log(`    ... y ${mlResult.errors.length - 3} más`);
    }
    totalClosed += mlResult.closed;
    totalFailed += mlResult.failed;
  } catch (err: any) {
    console.error('  Mercado Libre error:', err?.message || err);
    totalFailed++;
  }

  return { closed: totalClosed, failed: totalFailed };
}

async function main() {
  const userIdArg = process.argv[2];
  if (!userIdArg) {
    console.error('Uso: npx tsx scripts/close-all-ebay-ml.ts <userId|all>');
    process.exit(1);
  }

  const { MarketplaceService } = await import('../src/services/marketplace.service');
  const marketplaceService = new MarketplaceService();

  let userIds: number[];
  if (userIdArg.toLowerCase() === 'all') {
    const fromListings = await prisma.marketplaceListing.findMany({
      where: { marketplace: { in: ['ebay', 'mercadolibre'] } },
      select: { userId: true },
      distinct: ['userId'],
    });
    let ids = [...new Set(fromListings.map((u) => u.userId))];
    if (ids.length === 0) {
      const fromCreds = await prisma.apiCredential.findMany({
        where: { apiName: { in: ['ebay', 'mercadolibre'] }, isActive: true },
        select: { userId: true },
        distinct: ['userId'],
      });
      ids = [...new Set(fromCreds.map((c) => c.userId))];
    }
    userIds = ids;
    if (userIds.length === 0) {
      console.log('No hay usuarios con listings o credenciales eBay/ML.');
      process.exit(0);
    }
    console.log('\n[CLOSE-ALL-EBAY-ML] Despublicando TODO para usuarios:', userIds.join(', '));
  } else {
    const userId = parseInt(userIdArg, 10);
    if (isNaN(userId)) {
      console.error('userId debe ser un número o "all"');
      process.exit(1);
    }
    userIds = [userId];
    console.log('\n[CLOSE-ALL-EBAY-ML] Despublicando TODO en eBay y Mercado Libre');
    console.log(`Usuario: ${userId}\n`);
  }

  let grandClosed = 0;
  let grandFailed = 0;

  for (const userId of userIds) {
    console.log(`\n--- Usuario ${userId} ---`);
    const { closed, failed } = await runForUser(userId, marketplaceService);
    grandClosed += closed;
    grandFailed += failed;
  }

  console.log('\n[CLOSE-ALL-EBAY-ML] Total cerrados:', grandClosed, '| Fallidos:', grandFailed);

  // Verificación: contar listings restantes en BD
  const ebayDb = await prisma.marketplaceListing.count({ where: { marketplace: 'ebay' } });
  const mlDb = await prisma.marketplaceListing.count({ where: { marketplace: 'mercadolibre' } });
  console.log('\n[VERIFICACIÓN] Listings restantes en BD: eBay:', ebayDb, '| ML:', mlDb);

  if (ebayDb === 0 && mlDb === 0) {
    console.log('[OK] Todo despublicado. BD sincronizada con marketplaces.');
  } else {
    console.log('[AVISO] Aún hay registros en BD. Ejecuta de nuevo si hay items en eBay/ML que no se pudieron cerrar.');
  }
  console.log('Listo.\n');
  process.exit(grandFailed > 0 && grandClosed === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
