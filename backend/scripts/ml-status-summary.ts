/**
 * Estado de las publicaciones ML (listings en BD vs estado real en ML).
 * Uso: npx tsx scripts/ml-status-summary.ts [userId]
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  const { prisma } = await import('../src/config/database');
  const { MarketplaceService } = await import('../src/services/marketplace.service');

  let userId = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  if (!userId || isNaN(userId)) {
    const row = await prisma.marketplaceListing.findFirst({
      where: { marketplace: 'mercadolibre' },
      select: { userId: true },
    });
    userId = row?.userId ?? (await prisma.apiCredential.findFirst({
      where: { apiName: 'mercadolibre', isActive: true },
      select: { userId: true },
    }))?.userId ?? null;
  }
  if (!userId) {
    console.error('No hay usuario con ML. Indica: npx tsx scripts/ml-status-summary.ts <userId>');
    process.exit(1);
  }

  const ms = new MarketplaceService();
  const items = await ms.getMlListingsStatus(userId, 500);

  const byStatus: Record<string, number> = {};
  for (const item of items) {
    const s = item.mlStatus ?? 'unknown';
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  console.log('\nEstado de publicaciones ML (listings en BD):');
  console.log('-------------------------------------------');
  Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => console.log(`  ${status}: ${count}`));
  console.log('-------------------------------------------');
  console.log(`  Total en BD: ${items.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
