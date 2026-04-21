/**
 * DB evidence snapshot for pilot tables + product 32714 package fields.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

import { prisma } from '../src/config/database';

async function main() {
  const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN (
        'pilot_launch_approvals',
        'pilot_category_allowlists',
        'pilot_decision_ledgers',
        'pilot_control_states',
        'mercado_libre_webhook_events'
      )
    ORDER BY table_name
  `);

  const product = await prisma.product.findUnique({
    where: { id: 32714 },
    select: {
      id: true,
      packageWeightGrams: true,
      packageLengthCm: true,
      packageWidthCm: true,
      packageHeightCm: true,
      maxUnitsPerOrder: true,
      updatedAt: true,
    },
  });

  console.log(JSON.stringify({ tables, product }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });

