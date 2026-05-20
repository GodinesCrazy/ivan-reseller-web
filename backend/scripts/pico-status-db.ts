#!/usr/bin/env tsx
/**
 * Direct DB PICO readiness/status probe.
 *
 * Use this when the HTTP API cannot be reached or Railway CLI auth is not available.
 * It checks the migrated schema, env readiness, counters and candidate discovery
 * without requiring dashboard login.
 *
 * Env:
 *   PICO_USER_ID    default 1
 *
 * Usage:
 *   npm run pico:status:db
 */
type SchemaCheckRow = {
  name: string;
  exists: boolean;
};

function isConnectionSaturated(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  const lower = text.toLowerCase();
  return lower.includes('too many clients') || lower.includes('too many connections');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSaturationRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = Math.max(1, Number(process.env.PICO_DB_MAX_ATTEMPTS || '6'));
  const delayMs = Math.max(1000, Number(process.env.PICO_DB_RETRY_DELAY_MS || '5000'));
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isConnectionSaturated(error) || attempt >= maxAttempts) break;
      console.warn(`[pico:status:db] Postgres saturated during ${label}, retry ${attempt}/${maxAttempts} in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function schemaChecks(prisma: { $queryRaw: <T = unknown>(query: TemplateStringsArray) => Promise<T> }): Promise<SchemaCheckRow[]> {
  const rows = await prisma.$queryRaw<Array<{ name: string; exists: boolean }>>`
    SELECT 'cj_shopify_usa_listings.lastSeoUpdate' AS name,
           EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_name = 'cj_shopify_usa_listings'
               AND column_name = 'lastSeoUpdate'
           ) AS exists
    UNION ALL
    SELECT 'cj_shopify_usa_blog_entries' AS name,
           EXISTS (
             SELECT 1
             FROM information_schema.tables
             WHERE table_name = 'cj_shopify_usa_blog_entries'
           ) AS exists
    UNION ALL
    SELECT 'cj_shopify_usa_video_posts' AS name,
           EXISTS (
             SELECT 1
             FROM information_schema.tables
             WHERE table_name = 'cj_shopify_usa_video_posts'
           ) AS exists
  `;
  return rows;
}

function printBoolMap(title: string, values: Record<string, boolean>): void {
  console.log(`\n${title}`);
  for (const [key, value] of Object.entries(values)) {
    console.log(`  ${value ? 'OK  ' : 'MISS'} ${key}`);
  }
}

function printNumberMap(title: string, values: Record<string, number>): void {
  console.log(`\n${title}`);
  for (const [key, value] of Object.entries(values)) {
    console.log(`  ${key}: ${value}`);
  }
}

async function main(): Promise<void> {
  process.env.PRISMA_CONNECTION_LIMIT ||= '1';

  await import('../src/config/env');
  const { prisma } = await import('../src/config/database');
  const { cjShopifyUsaPicoService } = await import(
    '../src/modules/cj-shopify-usa/services/cj-shopify-usa-pico.service'
  );

  const userId = Number(process.env.PICO_USER_ID || '1');
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('PICO_USER_ID must be a positive integer.');
  }

  const checks = await withSaturationRetry('schema checks', () => schemaChecks(prisma));
  const missingSchema = checks.filter((row) => !row.exists).map((row) => row.name);

  console.log('PICO DB status');
  console.log(`  userId: ${userId}`);

  printBoolMap(
    'Schema',
    Object.fromEntries(checks.map((row) => [row.name, row.exists])),
  );

  if (missingSchema.length > 0) {
    console.log(`\nPICO migration is not applied. Missing: ${missingSchema.join(', ')}`);
    console.log('Run: npm run prisma:migrate:deploy');
    process.exit(2);
  }

  const [blog, stagnant, video] = await withSaturationRetry('candidate discovery', () =>
    Promise.all([
      cjShopifyUsaPicoService.getBlogCandidates(userId, 8),
      cjShopifyUsaPicoService.getStagnantCandidates(userId, 8),
      cjShopifyUsaPicoService.getVideoCandidates(userId, 8),
    ]),
  );
  const summary = await withSaturationRetry('dashboard summary', () =>
    cjShopifyUsaPicoService.getDashboardSummary(userId, { blog, stagnant, video }),
  );

  printBoolMap(
    'Readiness',
    Object.fromEntries(Object.entries(summary.readiness).filter(([, value]) => typeof value === 'boolean')) as Record<string, boolean>,
  );
  if (typeof summary.readiness.activeAiProvider === 'string') {
    console.log(`  activeAiProvider: ${summary.readiness.activeAiProvider}`);
  }
  printNumberMap('Stats', summary.stats);
  printNumberMap('Candidates', summary.candidates);

  console.log('\nRecent activity');
  if (summary.recentActivity.length === 0) {
    console.log('  none');
  } else {
    for (const item of summary.recentActivity.slice(0, 5)) {
      console.log(`  ${item.createdAt} ${item.message}`);
    }
  }

  const aiReady =
    summary.readiness.aiContent === true ||
    summary.readiness.openai === true ||
    summary.readiness.aiProviders?.groq === true ||
    summary.readiness.aiProviders?.gemini === true;
  const missingCore = ['aiContent', 'creatomate'].filter((key) =>
    key === 'aiContent' ? !aiReady : summary.readiness[key as keyof typeof summary.readiness] !== true,
  );
  if (missingCore.length > 0) {
    console.log(`\nPICO core not fully ready: missing ${missingCore.join(', ')}.`);
    process.exit(3);
  }

  console.log('\nPICO DB and core readiness OK.');
}

main()
  .catch((error) => {
    console.error('[pico:status:db] Fatal:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../src/config/database');
    await prisma.$disconnect().catch(() => undefined);
  });
