/**
 * Read-only diagnostic for Mercado Libre webhook readiness evidence.
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
      AND table_name IN ('mercado_libre_webhook_events', 'system_configs')
    ORDER BY table_name
  `);

  let mlCounts: Array<{ status: string; count: number }> = [];
  let mlEvents: Array<Record<string, unknown>> = [];
  let queryError: string | null = null;

  try {
    mlCounts = await prisma.$queryRawUnsafe<Array<{ status: string; count: number }>>(`
      SELECT status, COUNT(*)::int AS count
      FROM "mercado_libre_webhook_events"
      GROUP BY status
      ORDER BY status
    `);

    mlEvents = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        id,
        status,
        topic,
        resource,
        "createdAt",
        "processedAt",
        "errorMessage"
      FROM "mercado_libre_webhook_events"
      ORDER BY "createdAt" DESC
      LIMIT 20
    `);
  } catch (error: any) {
    queryError = error?.message || String(error);
  }

  const proof = await prisma.systemConfig.findUnique({
    where: { key: 'webhook_event_proof:mercadolibre' },
    select: { key: true, value: true, updatedAt: true },
  });

  let parsedProof: Record<string, unknown> | null = null;
  if (proof?.value) {
    try {
      parsedProof = JSON.parse(String(proof.value));
    } catch {
      parsedProof = { parseError: 'invalid_json' };
    }
  }

  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        tables,
        queryError,
        mlCounts,
        mlEvents,
        proof: proof
          ? {
              key: proof.key,
              updatedAt: proof.updatedAt,
              parsed: parsedProof,
            }
          : null,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });

